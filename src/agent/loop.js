/**
 * The agent loop — ONE turn of user input to completion.
 *
 * Streams model output, executes tool calls in-process, feeds results back,
 * and repeats until the model stops calling tools (or MAX_ITERATIONS).
 * Yields ChatEvent-shaped events: { event, data } where event is one of
 *   'text' | 'reasoning' | 'tool_call' | 'tool_result' | 'finish' | 'error' | 'done'
 *
 * This replaces the deleted Hono server's /chat route — no HTTP, no process
 * boundary: the TUI and CLI call it directly.
 */
import { resolveChatModel, getModelPricing, estimateCostUsd } from '../shared/models/index.js';
import { getToolContracts, executeLocalTool, normalizeTimeoutMs } from '../shared/tools/index.js';
import { buildSystemPrompt } from './prompt.js';
import { streamCompletion } from './providers.js';
import { recordUsage, estimateTokensFromText } from './cost.js';
import { withTrajectory, newRunId } from './trajectory.js';
import { builtinPreToolUseGuard, runHooks, auditToolUse, checkStop, STOP_RETRIES } from './hooks.js';
import { isReadOnlyTool, isToolAllowedInMode } from '../shared/schemas/mode.js';
import { SWE_MAX_ITERATIONS } from './swe.js';
import { runInWorkdir, getWorkdir } from '../shared/tools/workdir.js';
import { classifyBashCommand } from './bash-validation.js';
import { drain, hasPending, waitForMail, formatNotifications } from './mailbox.js';
import { startBackground, checkBackground, listBackground } from './background.js';
import { spawnTeammate, sendTeamMessage, listTeam, mergeTeammate } from './team.js';
import { evaluateGoal, GOAL_MAX_CHECKS, GOAL_WORKER_RULE } from './goal.js';
import { workerBrief, contractBrief } from './outcome.js';
import { riskLevel, explainRisk, recordApproval } from './risk-ledger.js';
import { budgetStatus, recordSpend } from './budget.js';
import { ReceiptLedger, checkClaims, claimGateMessage } from './receipts.js';

const MAX_ITERATIONS = 25;
const SWE_ITERATIONS = SWE_MAX_ITERATIONS; // 60: SWE-bench tasks are multi-file, need the budget
const HISTORY_LIMIT = 60;
const HISTORY_CHAR_CAP = 4000;
const TOOL_RESULT_CAP = 20000;
const SWE_TOOL_RESULT_CAP = 30000;

/** JSON Schema per tool (providers require JSON Schema, not Zod). */
const TOOL_PARAM_SCHEMAS = {
  readFile: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  listDirectory: { type: 'object', properties: { path: { type: 'string' } } },
  glob: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] },
  grep: {
    type: 'object',
    properties: { pattern: { type: 'string' }, path: { type: 'string' } },
    required: ['pattern'],
  },
  codeMap: {
    type: 'object',
    properties: { path: { type: 'string' } },
  },
  searchWeb: {
    type: 'object',
    properties: { query: { type: 'string' }, count: { type: 'integer' } },
    required: ['query'],
  },
  writeFile: {
    type: 'object',
    properties: { path: { type: 'string' }, content: { type: 'string' } },
    required: ['path', 'content'],
  },
  editFile: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      oldString: { type: 'string' },
      newString: { type: 'string' },
    },
    required: ['path', 'oldString', 'newString'],
  },
  batchEdit: {
    type: 'object',
    properties: {
      operations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            filePath: { type: 'string' },
            oldString: { type: 'string' },
            newString: { type: 'string' },
          },
          required: ['filePath', 'oldString', 'newString'],
        },
      },
    },
    required: ['operations'],
  },
  bash: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      timeout: { type: 'integer', description: 'Timeout in seconds (values ≥1000 are read as ms)' },
      description: { type: 'string' },
    },
    required: ['command'],
  },
  runTests: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      timeout: { type: 'integer', description: 'Timeout in seconds (values ≥1000 are read as ms)' },
    },
    required: ['command'],
  },
  applyPatch: {
    type: 'object',
    properties: { patch: { type: 'string' } },
    required: ['patch'],
  },
  redoLastUndo: { type: 'object', properties: {} },
  todoWrite: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            status: { type: 'string' },
          },
          required: ['id', 'title', 'status'],
        },
      },
    },
    required: ['todos'],
  },
  todoRead: { type: 'object', properties: {} },
  skill: {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
  },
  spawnAgent: {
    type: 'object',
    properties: {
      prompt: { type: 'string' },
      mode: { type: 'string' },
    },
    required: ['prompt'],
  },
  diffFile: {
    type: 'object',
    properties: { path: { type: 'string' }, newContent: { type: 'string' } },
    required: ['path', 'newContent'],
  },
  undoLastChange: { type: 'object', properties: {} },
  memoryWrite: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      type: { type: 'string', enum: ['user', 'feedback', 'project', 'reference'] },
      description: { type: 'string' },
      body: { type: 'string' },
    },
    required: ['name', 'type', 'description', 'body'],
  },
  memoryDelete: {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
  },
  bgRun: {
    type: 'object',
    properties: { command: { type: 'string' }, timeout: { type: 'integer', description: 'Timeout in seconds' } },
    required: ['command'],
  },
  bgCheck: { type: 'object', properties: { id: { type: 'string' } } },
  spawnTeammate: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      prompt: { type: 'string' },
      mode: { type: 'string', enum: ['BUILD', 'PLAN'] },
      isolation: { type: 'string', enum: ['none', 'worktree'] },
    },
    required: ['name', 'prompt'],
  },
  sendMessage: {
    type: 'object',
    properties: { to: { type: 'string' }, text: { type: 'string' } },
    required: ['to', 'text'],
  },
  teamStatus: { type: 'object', properties: {} },
  teamMerge: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      action: { type: 'string', enum: ['diff', 'apply', 'discard'] },
    },
    required: ['name'],
  },
};

/**
 * Tools the loop executes itself because they need loop context (agent
 * name, workdir, model, stream seam) rather than a plain input -> output.
 */
export const HARNESS_TOOLS = new Set(['spawnAgent', 'bgRun', 'bgCheck', 'spawnTeammate', 'sendMessage', 'teamStatus', 'teamMerge']);

/** Build provider tool definitions from the shared contracts + schemas. */
export function buildProviderTools(mode) {
  const contracts = getToolContracts(mode);
  return Object.entries(contracts)
    .filter(([name]) => TOOL_PARAM_SCHEMAS[name])
    .map(([name, contract]) => ({
      type: 'function',
      function: {
        name,
        description: contract.description,
        parameters: TOOL_PARAM_SCHEMAS[name],
      },
    }));
}

export const LOOP_REQUEST_CHAR_BUDGET = 200_000; // ~50k tokens: safe for all providers
const LOOP_KEEP_TAIL = 6; // never trim the most recent messages (active context)

/**
 * Bound in-turn request growth. A 60-iteration SWE turn accumulating 30k
 * tool outputs would otherwise build a megabyte request the provider
 * rejects — killing the whole turn. Oldest tool results are replaced with
 * a tombstone; task head + recent tail are always kept. Pure (no mutation).
 */
export function trimMessagesForBudget(messages, budget = LOOP_REQUEST_CHAR_BUDGET) {
  const size = (list) => JSON.stringify(list).length;
  if (size(messages) <= budget) return messages;
  const out = messages.map((m) => ({ ...m }));
  const tombstone = (m) => {
    const next = { ...m, content: '[trimmed: budget]' };
    // History tool_calls args (e.g. a whole writeFile body) count toward the
    // bound too — truncate them, keeping ids so result linkage still parses.
    if (Array.isArray(next.tool_calls)) {
      next.tool_calls = next.tool_calls.map((tc) => {
        const args = tc?.function?.arguments;
        if (typeof args === 'string' && args.length > 1000) {
          return { ...tc, function: { ...tc.function, arguments: `${args.slice(0, 1000)}…[trimmed]` } };
        }
        return tc;
      });
    }
    return next;
  };
  // Pass 1: tombstone old tool outputs, keep task head + recent tail intact.
  for (let i = 1; i < out.length - LOOP_KEEP_TAIL; i++) {
    if (size(out) <= budget) break;
    const m = out[i];
    if (m.role === 'tool' && m.content !== '[trimmed: budget]') out[i] = tombstone(m);
  }
  // Pass 2: guarantee the bound — trim the largest remaining message
  // oldest-first (never the task head at index 0).
  let guard = out.length + 1;
  while (size(out) > budget && guard-- > 0) {
    let best = -1;
    let bestLen = 0;
    for (let i = 1; i < out.length; i++) {
      const w = size([out[i]]);
      if (w > bestLen && w > 60) {
        best = i;
        bestLen = w;
      }
    }
    if (best === -1) break;
    const m = out[best];
    out[best] =
      m.role === 'assistant' && typeof m.content === 'string' && m.content.length > 500
        ? { ...tombstone(m), content: `${m.content.slice(0, 500)}\n[trimmed: budget]` }
        : tombstone(m);
  }
  return out;
}

/** Convert UI history (parts) into lean OpenAI-format messages. */
export function historyToMessages(history = [], { preserveToolCalls = false } = {}) {  const out = [];
  for (const m of history.slice(-HISTORY_LIMIT)) {
    if (!m || m.role === 'error') continue;
    // Preserve real tool messages verbatim when requested (SWE mode):
    // the default summarizer ("[tool ran]") destroys file context and is a
    // known SWE-bench score killer.
    if (preserveToolCalls && (m.role === 'tool' || m.role === 'assistant') &&
        (typeof m.content === 'string' || (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length))) {
      // Keep assistant messages that have tool_calls even when text content is empty —
      // dropping them orphans the following tool-result messages and breaks SWE multi-turn loops.
      if (!m.content.trim() && !(m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length)) continue;
      if (m.role === 'tool') {
        if (!m.tool_call_id) continue;
        out.push({ role: 'tool', tool_call_id: m.tool_call_id, content: m.content.slice(0, HISTORY_CHAR_CAP) });
        continue;
      }
      if (m.role === 'assistant') {
        const entry = { role: 'assistant', content: (m.content || '').slice(0, HISTORY_CHAR_CAP) };
        if (Array.isArray(m.tool_calls) && m.tool_calls.length) entry.tool_calls = m.tool_calls;
        out.push(entry);
        continue;
      }
    }
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    let text = '';
    if (typeof m.content === 'string') text = m.content;
    else if (Array.isArray(m.parts)) {
      const bits = [];
      for (const p of m.parts) {
        if (p.type === 'text') bits.push(p.text);
        else if (p.type === 'tool-call') {
          if (preserveToolCalls && p.state === 'output-available' && p.output !== undefined) {
            // SWE mode: keep the actual tool output (truncated per-call) so
            // file contents / test results survive across turns. Cap each
            // call to avoid one huge read blowing the context budget.
            let outStr = '';
            try {
              outStr = typeof p.output === 'string' ? p.output : JSON.stringify(p.output);
            } catch {
              outStr = '[unserializable output]';
            }
            bits.push(`[tool ${p.toolName} output]\n${outStr.slice(0, 1500)}`);
          } else if (preserveToolCalls && p.state === 'output-error' && p.errorText) {
            bits.push(`[tool ${p.toolName} error]\n${String(p.errorText).slice(0, 1500)}`);
          } else {
            bits.push(`[tool ${p.toolName}: ${p.state === 'output-available' ? 'done' : p.state || 'ran'}]`);
          }
        }
      }
      text = bits.join('\n');
    }
    text = text.slice(0, HISTORY_CHAR_CAP);
    if (!text.trim()) continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === role) prev.content += '\n' + text;
    else out.push({ role, content: text });
  }
  return out;
}

/**
 * Run one full agent turn (model -> tools -> model -> ... -> final answer).
 *
 * @param {object} opts
 * @param {Array}  opts.history      UI-shaped messages (id/role/parts)
 * @param {string} [opts.mode]       BUILD | PLAN | REVIEW
 * @param {string} [opts.model]      model id (registry-resolved)
 * @param {AbortSignal} [opts.signal]
 * @param {(toolName, toolCallId, input) => Promise<'allow'|'deny'|'allow-session'>}
 *        [opts.onPermissionRequest]
 * @param {(opts: object) => AsyncGenerator} [opts.createStream]
 *        stream seam (defaults to the real provider stream). Tests inject
 *        canned streams; production never sets this.
 * @param {boolean|string} [opts.trajectory]
 *        false disables trajectory logging for this turn; a string sets the
 *        run id; otherwise a run id is generated. Honors SENTINEL_NO_TRAJECTORY.
 * @yields {{event: string, data: object}}
 */
export async function* runAgentTurnInner(opts = {}) {
  const {
    history = [],
    mode = 'BUILD',
    model,
    signal,
    onPermissionRequest,
    createStream,
    subagentDepth = 0,
    agentName = 'lead',
    goal,
    outcome,
    engagement,
    maxCostUsd = Number(process.env.SENTINEL_MAX_COST_USD) || 0,
    routeModel = process.env.SENTINEL_ROUTE_MODEL || undefined,
  } = opts;
  const workdir = opts.workdir || getWorkdir();

  let resolved;
  let cheap = null;
  try {
    resolved = resolveChatModel(model);
    if (routeModel) cheap = resolveChatModel(routeModel);
  } catch (e) {
    yield { event: 'error', data: { message: e.message } };
    yield { event: 'done', data: {} };
    return;
  }
  if (cheap && cheap.modelId === resolved.modelId) cheap = null;
  const cheapUsage = { inputTokens: 0, outputTokens: 0 };
  let lastBatchReadOnly = false;
  let cheapStreak = 0;
  let activeModel = resolved.modelId;

  let system = buildSystemPrompt({ mode, dir: workdir });
  if (goal) {
    // An outcome contract replaces the one-line condition when present: the
    // worker gets the target, the proof, and the assumptions it inherited.
    system += outcome
      ? `\n\n# Outcome contract\n${workerBrief(outcome)}\n${GOAL_WORKER_RULE}`
      : `\n\n# Goal\nWork until this completion condition holds: ${goal}\n${GOAL_WORKER_RULE}`;
  }
  const tools = buildProviderTools(mode);
  const isSwe = mode === 'SWE';
  const maxIterations = isSwe ? SWE_ITERATIONS : MAX_ITERATIONS;
  const resultCap = isSwe ? SWE_TOOL_RESULT_CAP : TOOL_RESULT_CAP;
  const messages = historyToMessages(history, { preserveToolCalls: isSwe });
  const allowAll = new Set(); // tools allowed for the rest of the session
  const editCounts = {}; // path -> edits this turn (loop guard)
  let wroteFiles = false;
  let ranTests = false;
  let stopRetries = 0;
  let goalChecks = 0;
  const callCounts = new Map(); // tool+input signature -> times called this turn
  const ledger = new ReceiptLedger(); // hashed tool evidence for claim checks
  let claimChecked = false;

  let inputTokens = 0;
  let outputTokens = 0;
  const finishEvents = function* (extra = {}) {
    const usage = {
      inputTokens: inputTokens + cheapUsage.inputTokens,
      outputTokens: outputTokens + cheapUsage.outputTokens,
    };
    usage.totalTokens = usage.inputTokens + usage.outputTokens;
    let { usd } = recordUsage(resolved.modelId, { inputTokens, outputTokens });
    if (cheap) usd += recordUsage(cheap.modelId, cheapUsage).usd || 0;
    const routed = cheap ? { routed: { model: cheap.modelId, ...cheapUsage } } : {};
    // Persist the turn's spend so the engagement total outlives the process.
    // Best-effort by design: a budget log must never break the turn.
    if (engagement) {
      try {
        recordSpend({
          usd,
          inputTokens,
          outputTokens: outputTokens + (cheap?.outputTokens || 0),
          model: resolved.modelId,
          runId: opts.trajectory,
          prompt: lastUserText(opts.history),
        }, workdir);
      } catch { /* best-effort */ }
    }
    yield { event: 'finish', data: { usage, costUsd: usd, model: resolved.modelId, ...routed, ...extra } };
    yield { event: 'done', data: {} };
  };

  for (let iter = 0; iter < maxIterations; iter++) {
    if (signal?.aborted) break;

    // Deliver background results / teammate reports / messages first.
    const mail = drain(agentName);
    if (mail.length) {
      yield { event: 'notification', data: { count: mail.length, messages: mail } };
      messages.push({ role: 'user', content: formatNotifications(mail) });
    }

    const toolCalls = [];
    let text = '';
    let turnUsage = null;

    // Request-size estimate for providers that omit usage
    const requestEstimate = Math.ceil(JSON.stringify(messages).length / 4);

    // Cost-aware routing (opt-in via routeModel / SENTINEL_ROUTE_MODEL):
    // the cheap model continues read-only exploration; the main model
    // plans (first call), decides after any write/shell, and every 4th step.
    const route = pickIterationModel({ cheap, iter, lastBatchReadOnly, cheapStreak });
    const useModel = route === 'cheap' ? cheap : resolved;
    cheapStreak = route === 'cheap' ? cheapStreak + 1 : 0;
    if (cheap && useModel.modelId !== activeModel) {
      activeModel = useModel.modelId;
      yield { event: 'route', data: { model: activeModel, reason: route === 'cheap' ? 'read-only exploration' : 'main model' } };
    }

    for await (const ev of (createStream ?? streamCompletion)({
      modelId: useModel.modelId,
      provider: useModel.provider,
      system,
      messages: trimMessagesForBudget(messages),
      tools,
      signal,
    })) {
      if (ev.type === 'text') {
        text += ev.text;
        yield { event: 'text', data: { delta: ev.text } };
      } else if (ev.type === 'reasoning') {
        yield { event: 'reasoning', data: { text: ev.text } };
      } else if (ev.type === 'tool_call') {
        toolCalls.push(ev);
      } else if (ev.type === 'usage') {
        if (ev.usage) {
          turnUsage = ev.usage;
          // usage tracked via turnUsage
        }
      } else if (ev.type === 'error') {
        yield { event: 'error', data: { message: ev.message } };
        yield { event: 'done', data: {} };
        return;
      }
    }

    const callIn = turnUsage ? turnUsage.inputTokens || 0 : requestEstimate;
    const callOut = turnUsage ? turnUsage.outputTokens || 0 : estimateTokensFromText(text);
    if (useModel === resolved) {
      inputTokens += callIn;
      outputTokens += callOut;
    } else {
      cheapUsage.inputTokens += callIn;
      cheapUsage.outputTokens += callOut;
    }
    lastBatchReadOnly = toolCalls.length > 0 && toolCalls.every((tc) => isReadOnlyTool(tc.name));

    // Budget guard: a hard USD ceiling per turn (opts.maxCostUsd or
    // SENTINEL_MAX_COST_USD). Checked after every model call.
    if (maxCostUsd > 0) {
      const spent = runningCostUsd(resolved.modelId, inputTokens, outputTokens)
        + (cheap ? runningCostUsd(cheap.modelId, cheapUsage.inputTokens, cheapUsage.outputTokens) : 0);
      if (spent >= maxCostUsd) {
        yield { event: 'error', data: { message: `Budget exceeded: $${spent.toFixed(4)} ≥ $${maxCostUsd} limit.` } };
        yield* finishEvents({ budgetExceeded: true });
        return;
      }
    }

    // Engagement guard: a ceiling and deadline that outlive this turn. A
    // per-turn budget is a promise about one run; this is the one about the
    // work, and it is what makes the spend on Friday's report mean anything.
    if (engagement) {
      const status = budgetStatus(workdir);
      if (!status.mayContinue) {
        yield { event: 'error', data: { message: status.stopReason || 'Engagement budget reached.' } };
        yield* finishEvents({ budgetExceeded: true, engagement: status.status });
        return;
      }
      if (status.budget.budgetUsd > 0) {
        // The turn itself must not overshoot the engagement it is part of.
        const turnUsd = runningCostUsd(resolved.modelId, inputTokens, outputTokens)
          + (cheap ? runningCostUsd(cheap.modelId, cheapUsage.inputTokens, cheapUsage.outputTokens) : 0);
        if (turnUsd >= status.remainingUsd) {
          yield { event: 'error', data: { message: `Stop: this turn alone would exceed the remaining engagement budget ($${turnUsd.toFixed(4)} ≥ $${status.remainingUsd.toFixed(4)} left).` } };
          yield* finishEvents({ budgetExceeded: true });
          return;
        }
      }
    }

    // ── No tool calls: final answer (Stop hooks may force more work) ───
    if (toolCalls.length === 0) {
      const block = stopRetries < STOP_RETRIES
        ? checkStop({ wroteFiles, ranTests, mode })
        : null;
      if (block) {
        stopRetries++;
        messages.push({ role: 'user', content: block });
        continue;
      }
      // Receipts: "tests pass" etc. must be backed by a passing command run
      // after the last edit. One chance to verify or retract (BUILD/SWE).
      const receipts = checkClaims(text, ledger.entries);
      if (!receipts.ok && !claimChecked && (mode === 'BUILD' || mode === 'SWE')) {
        claimChecked = true;
        yield { event: 'receipts', data: { ...receipts, blocking: true } };
        if (text) messages.push({ role: 'assistant', content: text });
        messages.push({ role: 'user', content: claimGateMessage(receipts.claims) });
        continue;
      }
      if (receipts.claims.length) yield { event: 'receipts', data: { ...receipts, blocking: false } };
      // Work still in flight (background commands, teammates): wait for it
      // instead of ending the turn with results undelivered.
      if (hasPending(agentName)) {
        if (text) messages.push({ role: 'assistant', content: text });
        yield { event: 'waiting', data: { agentName } };
        const got = await waitForMail(agentName, { signal });
        if (got) continue;
        if (!signal?.aborted) {
          messages.push({ role: 'user', content: 'Timed out waiting for background work; report what is still outstanding.' });
          continue;
        }
      }
      if (goal && goalChecks < GOAL_MAX_CHECKS) {
        goalChecks++;
        if (text) messages.push({ role: 'assistant', content: text });
        const verdict = await evaluateGoal({
          goal,
          contract: outcome ? contractBrief(outcome) : undefined,
          messages,
          modelId: resolved.modelId,
          provider: resolved.provider,
          createStream,
          signal,
        });
        yield { event: 'goal', data: { ...verdict, check: goalChecks } };
        if (verdict.unknown) {
          // The contract, not the work, is the blocker. Retrying identical
          // work cannot make an unjudgeable condition judgeable, so the turn
          // ends here instead of burning the remaining checks.
          messages.push({
            role: 'user',
            content: `The outcome contract cannot be judged as written: ${verdict.reason}\nReport which contract field is unverifiable and what evidence would be needed to judge it. Do not retry the same work.`,
          });
          yield* finishEvents();
          return;
        }
        if (!verdict.ok && !verdict.impossible) {
          messages.push({
            role: 'user',
            content: `Goal not met yet: ${verdict.reason}\nKeep working toward: ${goal}`,
          });
          continue;
        }
      }
      yield* finishEvents();
      return;
    }

    // Doom-loop guard: the same tool with the same input, over and over.
    const doom = doomLoopCheck(callCounts, toolCalls);
    if (doom.stop) {
      yield { event: 'error', data: { message: doom.message } };
      yield* finishEvents({ doomLoop: true });
      return;
    }

    // ── Execute tool calls, then loop back with the results ──────────────
    const assistantMsg = {
      role: 'assistant',
      content: text || '',
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.input ?? {}) },
      })),
    };
    messages.push(assistantMsg);

    for (const tc of toolCalls) {
      yield {
        event: 'tool_call',
        data: { toolName: tc.name, toolCallId: tc.id, input: tc.input },
      };
    }

    const runOne = (tc) => executeOneTool({
      tc,
      mode,
      opts: {
        onPermissionRequest,
        allowAll,
        createStream,
        model: resolved.modelId,
        subagentDepth,
        agentName,
        workdir,
        headless: !onPermissionRequest,
      },
      subagentState: { disabled: subagentDepth >= 1 },
      editCounts,
    });

    const batches = batchToolCalls(toolCalls);
    for (const batch of batches) {
      const results = batch.parallel && batch.calls.length > 1
        ? await Promise.all(batch.calls.map(runOne))
        : [await runOne(batch.calls[0])];
      // Re-run sequentially any parallel call whose input references a
      // sibling result? No — reads are side-effect free, order irrelevant.
      for (let i = 0; i < batch.calls.length; i++) {
        const tc = batch.calls[i];
        const { output } = results[i];
        const serialized = JSON.stringify(output ?? null).slice(0, resultCap);
        ledger.record(tc.name, tc.input, output);
        if (tc.name === 'runTests' && !output?.error) ranTests = true;
        if (['writeFile', 'editFile', 'batchEdit', 'applyPatch'].includes(tc.name) && !output?.error) {
          wroteFiles = true;
        }
        yield {
          event: 'tool_result',
          data: {
            toolCallId: tc.id,
            output: output && typeof output === 'object' && output.error ? undefined : output,
            error:
              output && typeof output === 'object' && output.error ? output.error : undefined,
          },
        };
        messages.push({ role: 'tool', tool_call_id: tc.id, content: serialized });
      }
    }

    const hint = loopHint(editCounts) || doom.hint;
    if (hint) messages.push({ role: 'user', content: hint });
  }

  // Hit the iteration cap
  yield {
    event: 'error',
    data: { message: `Stopped after ${maxIterations} tool iterations.` },
  };
  yield { event: 'done', data: {} };
}

/**
 * Partition one model message's tool calls into execution batches.
 * Consecutive read-only tools run concurrently (up to CONCURRENCY_MAX);
 * the moment a write tool appears it gets its own serial batch.
 * Pure function — unit-tested.
 */
export const CONCURRENCY_MAX = 10;
export function batchToolCalls(toolCalls) {
  const batches = [];
  let current = [];
  const flush = () => {
    if (current.length) {
      for (let i = 0; i < current.length; i += CONCURRENCY_MAX) {
        batches.push({ parallel: true, calls: current.slice(i, i + CONCURRENCY_MAX) });
      }
      current = [];
    }
  };
  for (const tc of toolCalls) {
    if (isReadOnlyTool(tc.name)) {
      current.push(tc);
    } else {
      flush();
      batches.push({ parallel: false, calls: [tc] });
    }
  }
  flush();
  return batches;
}

/**
 * Doom-loop detection (opencode "doom_loop" / pi-mono pattern): count each
 * tool+input signature this turn. At DOOM_WARN repeats the model is told to
 * change approach; at DOOM_STOP the turn ends instead of burning budget.
 * Mutates `counts`; returns { hint?, stop?, message? }.
 */
export const DOOM_WARN = 3;
export const DOOM_STOP = 5;
export function doomLoopCheck(counts, toolCalls) {
  let worst = 0;
  let worstName = '';
  for (const tc of toolCalls) {
    let sig;
    try {
      sig = `${tc.name}:${JSON.stringify(tc.input ?? {})}`;
    } catch {
      sig = `${tc.name}:?`;
    }
    const n = (counts.get(sig) || 0) + 1;
    counts.set(sig, n);
    if (n > worst) {
      worst = n;
      worstName = tc.name;
    }
  }
  if (worst >= DOOM_STOP) {
    return { stop: true, message: `Doom loop: ${worstName} called ${worst} times with identical input this turn — stopped.` };
  }
  if (worst >= DOOM_WARN) {
    return { hint: `Doom-loop guard: you have called ${worstName} ${worst} times with identical input. The result will not change — try a different approach or explain what is blocking you.` };
  }
  return {};
}

/**
 * Which model runs this iteration. Pure. 'cheap' only when a cheap model is
 * configured, this is not the first call, the previous batch was entirely
 * read-only tools, and fewer than ROUTE_MAX_CHEAP_STREAK cheap calls ran in
 * a row (the main model re-plans periodically).
 */
export const ROUTE_MAX_CHEAP_STREAK = 3;
export function pickIterationModel({ cheap, iter, lastBatchReadOnly, cheapStreak }) {
  if (!cheap || iter === 0 || !lastBatchReadOnly) return 'main';
  return cheapStreak < ROUTE_MAX_CHEAP_STREAK ? 'cheap' : 'main';
}

/** USD spent so far this turn at the model's registry price. */
export function runningCostUsd(modelId, inputTokens, outputTokens) {
  try {
    return estimateCostUsd({ inputTokens, outputTokens }, getModelPricing(modelId)) || 0;
  } catch {
    return 0;
  }
}

/** Warn after N same-file edits (LangChain LoopDetectionMiddleware pattern). */
export const LOOP_EDIT_WARN_AFTER = 3;
export function loopHint(editCounts) {
  for (const [file, n] of Object.entries(editCounts)) {
    if (n >= LOOP_EDIT_WARN_AFTER) {
      return `Loop guard: ${file} has been edited ${n} times this turn — reconsider the approach instead of retrying the same edit.`;
    }
  }
  return null;
}

/**
 * Execute one tool call: hooks → permission → subagent-or-local → audit.
 * Extracted so batching shares one path. Returns { output, stopBlocked }.
 */
async function executeOneTool({ tc, mode, opts, subagentState, editCounts }) {
  const { onPermissionRequest, allowAll, createStream, model, subagentDepth = 0, agentName, workdir, headless } = opts;

  if (!isToolAllowedInMode(tc.name, mode)) {
    return { output: { error: `Tool ${tc.name} is not available in ${mode} mode` } };
  }

  // Built-in + registered PreToolUse hooks (block before permission UI).
  const builtin = builtinPreToolUseGuard(tc.name, tc.input);
  if (builtin?.block) return { output: { error: builtin.reason } };
  const hookBlock = await runHooks('preToolUse', { toolName: tc.name, input: tc.input, mode }).catch(() => null);
  if (hookBlock?.block) return { output: { error: hookBlock.reason || `Blocked by hook: ${tc.name}` } };

  // claw-code bash validation: a session-wide "allow bash" never covers a
  // destructive command; those are re-asked every time.
  const shellish = tc.name === 'bash' || tc.name === 'runTests' || tc.name === 'bgRun';
  const bashCheck = shellish ? classifyBashCommand(tc.input?.command) : null;
  // Risk ledger: a session grant for `bash` is a grant for the *shape*, not
  // for every command the tool can run. A novel non-destructive shape is
  // still asked, which is what keeps "allow bash for this session" from
  // silently authorizing the first `npm publish` that walks by.
  const risk = shellish ? riskLevel(tc.input?.command, workdir) : null;
  const sessionGrantsShape = shellish ? allowAll.has(tc.name) && risk?.level === 'green' : allowAll.has(tc.name);
  let permission = sessionGrantsShape ? 'allow' : null;
  if (!permission && onPermissionRequest) {
    permission = await onPermissionRequest(tc.name, tc.id, { ...(tc.input || {}), __risk: risk ? explainRisk(risk) : undefined });
  }
  if (permission === 'deny') return { output: { error: 'User denied permission' } };
  if (permission === 'allow-session') {
    if (bashCheck?.destructive || risk?.level === 'red') {
      // A red command is never promoted to a session grant, even when the
      // user said allow-session: the ledger must not learn `rm -rf /`.
    } else if (risk && risk.level === 'yellow') {
      recordApproval(tc.input?.command, workdir);
      allowAll.add(tc.name);
    } else {
      allowAll.add(tc.name);
    }
  }

  if (HARNESS_TOOLS.has(tc.name) && tc.name !== 'spawnAgent') {
    // No approval obtained: harness tools obey the same config policy as
    // local tools (bgRun is a shell tool and defaults to 'ask').
    if (permission == null) {
      const { checkPermission } = await import('../shared/tools/permissions.js');
      const perm = checkPermission(tc.name);
      if (!perm.allowed) return { output: { error: perm.message || `Tool ${tc.name} is not permitted` } };
    }
    let output;
    try {
      output = await runHarnessTool(tc, { agentName, workdir, model, createStream, allowAll, headless, subagentDepth });
    } catch (e) {
      output = { error: e?.message || String(e) };
    }
    auditToolUse({ toolName: tc.name, ok: !output?.error, cwd: workdir });
    return { output };
  }

  // Subagent: same loop, fresh messages, restricted tools, depth ≤ 1.
  if (tc.name === 'spawnAgent') {
    if (subagentDepth >= 1) {
      return { output: { error: 'Subagents cannot spawn further subagents (depth limit 1).' } };
    }
    if (subagentState.disabled) {
      return { output: { error: 'spawnAgent is not available in this context.' } };
    }
    const subPrompt = String(tc.input?.prompt || '');
    const subMode = tc.input?.mode === 'BUILD' ? 'BUILD' : 'PLAN';
    let text = '';
    try {
      for await (const ev of runAgentTurnInner({
        history: [{ id: `sub_${Date.now()}`, role: 'user', parts: [{ type: 'text', text: subPrompt }] }],
        mode: subMode,
        model: model,
        createStream,
        trajectory: false,
        subagentDepth: subagentDepth + 1,
        workdir,
        agentName: `${agentName}/sub`,
        onPermissionRequest: async () => 'deny',
      })) {
        if (ev.event === 'text') text += ev.data.delta;
        else if (ev.event === 'error') text += `\n[subagent error: ${ev.data.message}]`;
      }
    } catch (e) {
      return { output: { error: `Subagent failed: ${e?.message || String(e)}` } };
    }
    return { output: { summary: text.slice(0, 8000) || '(subagent returned no text)' } };
  }

  let output;
  try {
    output = await runInWorkdir(workdir, () =>
      executeLocalTool(tc.name, tc.input, mode, { preAuthorized: permission != null }));
  } catch (e) {
    output = { error: e?.message || String(e) };
  }
  if ((tc.name === 'editFile' || tc.name === 'writeFile') && !output?.error && tc.input?.path) {
    editCounts[tc.input.path] = (editCounts[tc.input.path] || 0) + 1;
  }
  if (bashCheck?.warnings.length && output && typeof output === 'object' && !Array.isArray(output)) {
    output = { ...output, warnings: bashCheck.warnings };
  }
  auditToolUse({ toolName: tc.name, ok: !output?.error, cwd: workdir });
  runHooks('postToolUse', { toolName: tc.name, output, mode }).catch(() => {});
  return { output };
}

/** Text of the last user message in UI-shaped history. */
export function lastUserText(history = []) {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m?.role !== 'user') continue;
    if (typeof m.content === 'string') return m.content;
    return (m.parts || []).filter((p) => p.type === 'text').map((p) => p.text).join('\n');
  }
  return '';
}

/** Dispatch loop-context tools (background, team). */
async function runHarnessTool(tc, ctx) {
  const input = tc.input || {};
  switch (tc.name) {
  case 'bgRun':
    return startBackground(input.command, {
      owner: ctx.agentName,
      cwd: ctx.workdir,
      timeoutMs: typeof input.timeout === 'number' ? normalizeTimeoutMs(input.timeout, undefined) : undefined,
    });
  case 'bgCheck':
    return checkBackground(input.id);
  case 'spawnTeammate':
    if (ctx.subagentDepth >= 1) throw new Error('Teammates cannot spawn teammates.');
    return spawnTeammate(input, {
      runTurn: runAgentTurnInner,
      owner: ctx.agentName,
      workdir: ctx.workdir,
      model: ctx.model,
      createStream: ctx.createStream,
      leadAllowAll: ctx.allowAll,
      leadHeadless: ctx.headless,
    });
  case 'sendMessage':
    return sendTeamMessage(input, { from: ctx.agentName });
  case 'teamStatus':
    return {
      team: listTeam(),
      background: listBackground(ctx.agentName).map((t) => ({ id: t.id, status: t.status, command: t.command.slice(0, 80) })),
    };
  case 'teamMerge':
    if (ctx.subagentDepth >= 1) throw new Error('Only the lead can merge teammate work.');
    return mergeTeammate(input);
  default:
    throw new Error(`Unknown harness tool: ${tc.name}`);
  }
}

/**
 * Run one full agent turn with trajectory logging.
 *
 * Same contract as runAgentTurnInner, plus per-turn JSONL recording (see
 * trajectory.js). Set `opts.trajectory: false` or SENTINEL_NO_TRAJECTORY=1
 * to skip. The inner generator stays exported for callers that manage
 * their own recording (e.g. the eval runner, which re-roots trajectories
 * per task).
 */
export async function* runAgentTurn(opts = {}) {
  if (opts.trajectory === false) {
    yield* runAgentTurnInner(opts);
    return;
  }
  const runId = typeof opts.trajectory === 'string' ? opts.trajectory : newRunId();
  yield* withTrajectory(runAgentTurnInner(opts), {
    runId,
    model: opts.model,
    mode: opts.mode,
    prompt: lastUserText(opts.history),
    goal: opts.goal,
    outcome: opts.outcome ? contractBrief(opts.outcome) : undefined,
  });
}

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
import { executeLocalTool, normalizeTimeoutMs, validateToolInput, coerceToolInput } from '../shared/tools/index.js';
import { buildSystemPrompt } from './prompt.js';
import { streamCompletion } from './providers.js';
import { streamWithFailover } from './failover.js';
import { recordUsage, estimateTokensFromText } from './cost.js';
import { withTrajectory, newRunId } from './trajectory.js';
import { runHooks, auditToolUse, checkStop, projectHasTests, STOP_RETRIES } from './hooks.js';
import { isReadOnlyTool } from '../shared/schemas/mode.js';
import { SWE_MAX_ITERATIONS } from './swe.js';
import { runInWorkdir, getWorkdir } from '../shared/tools/workdir.js';
import { isFileTool } from '../shared/tool-taxonomy.js';
import { runPreGates, assessCall, resolvePermissionGate, applySessionGrant } from './gates.js';
import { recordGrant, recordDispatch } from './audit-trail.js';
import { drain, hasPending, waitForMail, formatNotifications } from './mailbox.js';
import { startBackground, checkBackground, listBackground } from './background.js';
import { createTask, awaitTask, cancelTask, getTask, PERMISSIONS } from './task.js';
import { spawnTeammate, sendTeamMessage, listTeam, mergeTeammate } from './team.js';
import { evaluateGoal, GOAL_MAX_CHECKS, GOAL_WORKER_RULE } from './goal.js';
import { workerBrief, contractBrief } from './outcome.js';
import { budgetStatus, recordSpend } from './budget.js';
import { createGateState } from './blast-radius.js';
import { ReceiptLedger, checkClaims, claimGateMessage } from './receipts.js';
import { buildProviderTools } from './tool-schemas.js';
import { compactToolResults } from './context-budget.js';
import { buildSkillPreamble } from './skill-delegation.js';
import { createSkillScope, noteSkillLoaded, checkSkillScope } from './skill-scope.js';

// Re-exported so the many existing importers of these names from loop.js keep
// working. They are declared in tool-schemas.js now; a re-export is one line
// and keeps this a move rather than a rename across the tree.
export { TOOL_PARAM_SCHEMAS, LEGACY_TASK_TOOLS, buildProviderTools } from './tool-schemas.js';

/**
 * The effect descriptor a browser call carried, or null.
 *
 * Extracted at the point of recording rather than validated here: the gate that
 * matters is in `web-tools.js`, and duplicating it would create a second place
 * that has to be updated when the descriptor's required fields change. This
 * reads the field so the audit trail can compare it, and does nothing with it.
 */
function webEffectOf(input) {
  const e = input?.effect;
  if (!e || typeof e !== 'object') return null;
  const out = {};
  for (const f of ['action', 'origin', 'resourceId', 'reversibility', 'recipient', 'compensatingAction', 'accountRef']) {
    if (e[f] !== undefined && e[f] !== null && e[f] !== '') out[f] = String(e[f]);
  }
  return Object.keys(out).length ? out : null;
}

const MAX_ITERATIONS = 25;
const SWE_ITERATIONS = SWE_MAX_ITERATIONS; // 60: SWE-bench tasks are multi-file, need the budget
const HISTORY_LIMIT = 60;
const HISTORY_CHAR_CAP = 4000;
const TOOL_RESULT_CAP = 20000;
const SWE_TOOL_RESULT_CAP = 30000;
/** Hard ceiling on the agentmemory recall that feeds the system prompt. */
const MEMORY_BRIDGE_TIMEOUT_MS = 2500;

/** Race a promise against a deadline. Used for optional, never-blocking I/O. */
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Tools the loop executes itself because they need loop context (agent
 * name, workdir, model, stream seam) rather than a plain input -> output.
 */
export const HARNESS_TOOLS = new Set([
  // The unified tool.
  'task',
  // Legacy names, still dispatched identically. A trajectory recorded with them
  // has to keep replaying, and a model that learned one last session still works.
  'spawnAgent', 'bgRun', 'bgCheck', 'spawnTeammate', 'sendMessage', 'teamStatus', 'teamMerge',
]);

/**
 * `task` action -> the legacy tool it is.
 *
 * This table is the compatibility layer stated as data. Each action maps onto
 * exactly one of the old dispatch cases, so there is one behaviour to test
 * rather than two implementations to keep in agreement. `spawn` is the exception
 * and is handled in place, because it is the only one that waits for its result
 * and was never a member of this set.
 */
export const TASK_ACTIONS = Object.freeze({
  'spawn-async': 'spawnTeammate',
  run: 'bgRun',
  status: 'teamStatus',
  check: 'bgCheck',
  merge: 'teamMerge',
  cancel: null, // cancelTask, not a legacy tool
  message: 'sendMessage',
});

/** Normalise a `task` call into a legacy tool call, or return null if unhandled. */
export function normalizeTaskCall(input) {
  const action = String(input?.action || '');
  if (action === 'spawn') return null; // handled by the caller: it awaits
  if (action === 'cancel') return null;
  const legacy = TASK_ACTIONS[action];
  if (!legacy) return undefined; // an unknown action
  const tc = { name: legacy, input: { ...input } };
  delete tc.input.action;
  // `task` calls `merge`; the legacy tool calls the field `action`.
  if (action === 'merge') {
    tc.input.action = input.merge || input.action_ || 'diff';
    delete tc.input.merge;
  }
  if (action === 'spawn-async') tc.input.name = input.name || '';
  return tc;
}

export const LOOP_REQUEST_CHAR_BUDGET = 200_000; // ~50k tokens: safe for all providers
const LOOP_KEEP_TAIL = 6; // never trim the most recent messages (active context)

/**
 * Size the request actually sent to a provider, every iteration.
 *
 * Two stages, in this order, and the order is the whole point:
 *
 *   1. `compactToolResults` runs first and takes only what it can take cheaply —
 *      superseded duplicate results, then the bulk body of oversized ones. What
 *      survives is still real context.
 *   2. `trimMessagesForBudget` runs second, as the backstop that keeps the
 *      request legal. By the time it fires, stage 1 has already given up
 *      everything it could at low cost, so what it tombstones is genuinely the
 *      least valuable content left.
 *
 * Before this, only stage 2 ran, and only at the 200k cliff: a turn that grew
 * past the budget lost old results wholesale and kept everything else at full
 * size. That is backwards — it discarded cheap-to-lose content while paying
 * full price for the expensive-to-lose.
 *
 * `trimMessagesForBudget` is pure, so the compacted array it returns can be
 * assigned straight into the request without mutating `messages`. The original
 * list stays intact: the trajectory recorder, the goal evaluator, and the final
 * answer all read the uncompacted history, and compaction is a transport
 * decision, not a loss of record.
 */
export function buildRequestMessages(messages, budget = LOOP_REQUEST_CHAR_BUDGET) {
  const compacted = compactToolResults(messages, {
    budget,
    protectLast: LOOP_KEEP_TAIL,
  });
  return trimMessagesForBudget(compacted.messages, budget);
}

/**
 * Bound in-turn request growth. A 60-iteration SWE turn accumulating 30k
 * tool outputs would otherwise build a megabyte request the provider
 * rejects — killing the whole turn. Oldest tool results are replaced with
 * a tombstone; task head + recent tail are always kept. Pure (no mutation).
 *
 * The size of each message is computed ONCE and reused. The obvious
 * implementation re-serializes the entire conversation to measure it, and does
 * so inside two nested loops — measured at 103 full `JSON.stringify` passes
 * over a 1MB conversation, ~107ms, on a function that runs once per model call
 * (so ~6.4s of pure CPU across a 60-iteration SWE turn). Per-message costs are
 * additive and the only structural edit is a substitution, so an incremental
 * total is exact rather than an approximation.
 */
export function trimMessagesForBudget(messages, budget = LOOP_REQUEST_CHAR_BUDGET) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

  // JSON size per message, measured once. The structural overhead of the
  // enclosing array (brackets + commas) is added to the total so the budget is
  // compared against the same quantity the provider will actually receive.
  const msgChars = messages.map((m) => JSON.stringify(m)?.length ?? 0);
  const overhead = Math.max(0, messages.length - 1);
  let total = msgChars.reduce((a, b) => a + b, 0) + overhead;
  if (total <= budget) return messages;

  const out = messages.map((m) => ({ ...m }));
  const tombstone = (m, nextContent) => {
    const next = { ...m, content: nextContent };
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
  /** Replace out[i], keeping `total` exact. */
  const replace = (i, next) => {
    total += (JSON.stringify(next)?.length ?? 0) - msgChars[i];
    msgChars[i] = JSON.stringify(next)?.length ?? 0;
    out[i] = next;
  };

  // Pass 1: tombstone old tool outputs, keep task head + recent tail intact.
  for (let i = 1; i < out.length - LOOP_KEEP_TAIL; i++) {
    if (total <= budget) break;
    const m = out[i];
    if (m.role === 'tool' && m.content !== '[trimmed: budget]') {
      replace(i, tombstone(m, '[trimmed: budget]'));
    }
  }
  // Pass 2: guarantee the bound — trim the largest remaining message
  // oldest-first (never the task head at index 0). `msgChars` makes the search
  // a scan over numbers instead of a serialization per candidate.
  let guard = out.length + 1;
  while (total > budget && guard-- > 0) {
    let best = -1;
    let bestLen = 0;
    for (let i = 1; i < out.length; i++) {
      if (msgChars[i] > bestLen && msgChars[i] > 60) {
        best = i;
        bestLen = msgChars[i];
      }
    }
    if (best === -1) break;
    const m = out[best];
    if (m.role === 'assistant' && typeof m.content === 'string' && m.content.length > 500) {
      replace(best, tombstone(m, `${m.content.slice(0, 500)}\n[trimmed: budget]`));
    } else {
      replace(best, tombstone(m, '[trimmed: budget]'));
    }
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
    runId = null,
    rung = null,
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

  // The request text ranks the skill listing, which is a fixed prefix re-sent
  // on every model call. Ranking it by relevance is what keeps a large skill
  // library from costing full price on every iteration of every turn.
  const requestText = lastUserText(history);
  // Cross-agent memory (agentmemory) is queried once per turn and folded into
  // the prompt as its own trailing section. Best-effort and time-boxed: the
  // server is usually absent, and a turn must never wait on it.
  let crossAgentMemory = '';
  if (process.env.SENTINEL_DISABLE_MEMORY_BRIDGE !== '1' && requestText) {
    try {
      const { buildMemoryBridgeSection } = await import('./memory-bridge.js');
      crossAgentMemory = await withTimeout(
        buildMemoryBridgeSection(requestText),
        MEMORY_BRIDGE_TIMEOUT_MS,
        'agentmemory recall',
      );
    } catch {
      // Absent, slow, or failing — the local memory store stands alone.
    }
  }
  let system = buildSystemPrompt({ mode, dir: workdir, request: requestText, crossAgentMemory });
  if (goal) {
    // An outcome contract replaces the one-line condition when present: the
    // worker gets the target, the proof, and the assumptions it inherited.
    system += outcome
      ? `\n\n# Outcome contract\n${workerBrief(outcome)}\n${GOAL_WORKER_RULE}`
      : `\n\n# Goal\nWork until this completion condition holds: ${goal}\n${GOAL_WORKER_RULE}`;
  }
  // External MCP servers are discovered once per turn, before the first model
  // call, so their tools are declared on every request. A server that fails to
  // connect contributes zero tools and never fails the turn.
  let externalTools = [];
  let mcpServers = {};
  try {
    const { configManager } = await import('../config/configManager.js');
    await configManager.load();
    mcpServers = configManager.get('mcpServers', {}) || {};
    if (Object.keys(mcpServers).length) {
      const { getToolRegistry } = await import('./mcp-client.js');
      const registry = await getToolRegistry(mcpServers);
      externalTools = registry.tools;
      for (const err of registry.errors) {
        yield { event: 'warning', data: { message: `MCP server "${err.server}" unavailable: ${err.error}` } };
      }
    }
  } catch {
    // MCP is optional — never block a turn on config or transport problems.
  }
  const tools = buildProviderTools(mode, externalTools);
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
  // Blast-radius gate state is per-turn: a path challenged on Monday is not
  // challenged again on Tuesday, but a new turn re-asks.
  const gateState = createGateState();
  // Skills loaded this turn may declare `allowed-tools`, which narrows what the
  // rest of the turn may call. Per-turn for the same reason as `gateState`: a
  // constraint must not outlive the request that loaded the skill.
  const skillScope = createSkillScope();
  const callCounts = new Map(); // tool+input signature -> times called this turn
  const ledger = new ReceiptLedger(); // hashed tool evidence for claim checks
  let claimChecked = false;

  // Per-turn memo for the usage fallback; see estimateRequestTokens.
  resetRequestTokenCache();

  let inputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let outputTokens = 0;
  const finishEvents = function* (extra = {}) {
    const usage = {
      inputTokens: inputTokens + cheapUsage.inputTokens,
      outputTokens: outputTokens + cheapUsage.outputTokens,
    };
    usage.totalTokens = usage.inputTokens + usage.outputTokens;
    // Cache savings made explicit so the benefit is measurable per turn.
    if (cacheReadTokens || cacheWriteTokens) {
      usage.cacheReadTokens = cacheReadTokens;
      usage.cacheWriteTokens = cacheWriteTokens;
      usage.cacheSavingsPct = cacheWriteTokens
        ? Math.round((cacheReadTokens / (cacheReadTokens + cacheWriteTokens)) * 100)
        : 100;
    }
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

    // Request-size estimate for providers that omit usage. Only needed when the
    // provider will actually be asked, so it is computed lazily below rather
    // than serializing the whole conversation on every iteration (including the
    // ones that report real usage).

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

    // Failover is opt-in: a chain is loaded only when one is configured for
    // this model. Without it `chain` is null and the call below is the same
    // generator as before, so the common path costs one extra config read and
    // nothing else.
    let failoverChain = null;
    if (iter === 0) {
      try {
        const { loadFailoverChain } = await import('./failover.js');
        failoverChain = await loadFailoverChain(useModel.modelId);
      } catch {
        failoverChain = null;
      }
    }

    const attemptStream = (attempt) => (createStream ?? streamCompletion)({
      modelId: attempt.modelId,
      provider: attempt.provider,
      system,
      messages: buildRequestMessages(messages),
      tools,
      signal,
    });

    const events = failoverChain
      ? streamWithFailover({
        model: useModel,
        chain: failoverChain.models,
        stream: attemptStream,
        onFailover: ({ to }) => {
          activeModel = to.modelId;
        },
      })
      : attemptStream(useModel);

    for await (const ev of events) {
      if (ev.type === 'failover') {
        // Surfaced as a route event so the existing UI channel shows the swap
        // rather than a silent substitution the user only learns about from
        // the cost total.
        yield { event: 'route', data: { model: ev.to, from: ev.from, reason: ev.reason } };
        continue;
      }
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
          // Prompt-cache accounting (Anthropic). Cache reads are ~10% of the
          // input price, so tracking them separately is what makes the saving
          // visible instead of silently inflating reported input tokens.
          if (useModel === resolved) {
            cacheReadTokens += turnUsage.cacheReadTokens || 0;
            cacheWriteTokens += turnUsage.cacheWriteTokens || 0;
          }
        }
      } else if (ev.type === 'error') {
        yield { event: 'error', data: { message: ev.message } };
        yield { event: 'done', data: {} };
        return;
      }
    }

    // Fallback for providers that omit usage: estimate from the request we
    // actually sent, which is the trimmed one — that is what was billed.
    const callIn = turnUsage ? turnUsage.inputTokens || 0 : estimateRequestTokens(messages, system);
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
        ? checkStop({ wroteFiles, ranTests, mode, hasTests: !wroteFiles || ranTests || projectHasTests(workdir) })
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
        runId,
        rung,
        parentTaskId: opts.parentTaskId || null,
      },
      subagentState: { disabled: subagentDepth >= 1 },
      editCounts,
      gateState,
      // Shared by reference, not copied: `executeOneTool` records a skill here
      // after the `skill` tool succeeds, and the very next tool call in the same
      // turn has to see it. A copy per call would make the constraint apply one
      // call late, which is the same class of bug as a toolset that changes
      // under the model.
      skillScope,
      externalToolNames: new Set(externalTools.map((t) => t.namespacedName)),
      mcpServers,
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
        if (isFileTool(tc.name) && !output?.error) {
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

  // Aborted (Esc / timeout) — not the iteration cap. Found in a live
  // benchmark: a 240s timeout after 4 tool calls was reported as
  // "Stopped after 25 tool iterations".
  if (signal?.aborted) {
    yield { event: 'error', data: { message: 'Interrupted.', interrupted: true } };
    yield* finishEvents({ interrupted: true });
    return;
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

/**
 * Rough token estimate for providers that report no usage.
 *
 * Memoized per turn on conversation length. The estimate is only ever a
 * fallback, and every iteration adds at least one message, so a repeat length
 * means the conversation did not grow and the previous answer is still the
 * right one — which is what keeps this off the hot path instead of
 * serializing a megabyte of history per model call.
 */
let requestTokenCache = { len: -1, tokens: 0 };

export function estimateRequestTokens(messages = [], system = '') {
  if (messages.length === requestTokenCache.len) return requestTokenCache.tokens;
  const chars = JSON.stringify(messages).length + (system ? system.length : 0);
  requestTokenCache = { len: messages.length, tokens: Math.ceil(chars / 4) };
  return requestTokenCache.tokens;
}

/** Reset the per-turn estimate. Exported for tests and long-lived processes. */
export function resetRequestTokenCache() {
  requestTokenCache = { len: -1, tokens: 0 };
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
async function executeOneTool({ tc: rawTc, mode, opts, subagentState, editCounts, gateState, skillScope, externalToolNames, mcpServers }) {
  // `let`, because the unified `task` tool is rewritten into its legacy
  // equivalent below and the rest of this function reads `tc` throughout.
  let tc = rawTc;
  const { onPermissionRequest, allowAll, createStream, model, subagentDepth = 0, agentName, workdir, headless } = opts;
  const parentTaskId = opts.parentTaskId || null;
  const auditCtx = {
    runId: opts.runId ?? null,
    agent: agentName,
    taskId: parentTaskId,
    // The task one level up. Resolved from the registry now, while it still
    // exists: the auditor reads this file later, long after the in-memory
    // registry that could have answered the question is gone.
    parentTaskId: parentTaskId ? (getTask(parentTaskId)?.parent ?? null) : null,
    rung: opts.rung ?? null,
    workdir,
  };
  // The tool name as the model asked for it. `task` is rewritten into a legacy
  // name below, and the auditor has to see both: a translation that dispatched
  // a different tool than was granted is exactly the Tool-class gap.
  const requestedTool = tc.name;
  let granted = false;

  // Validation happens here, ahead of every gate, and it is the last thing
  // before the model learns about it. `toolInputSchemas` carries ~200 lines of
  // validators that were never invoked (see the note in `tool-schemas.js`);
  // running them closes that gap and puts the fix where it is visible rather
  // than inside a refactor.
  //
  // Order matters in one specific way: before the permission prompt. A call
  // that cannot be well-formed is not something to ask a human about, and a
  // prompt for `editFile` with a numeric `oldString` trains people to approve
  // without reading. It also sits after `runPreGates`, because a mode refusal
  // is the more fundamental answer — "not available in PLAN mode" beats "path
  // is required".
  const schemaError = validateToolInput(tc.name, tc.input);
  if (schemaError) {
    recordGrant({ ...auditCtx, toolCallId: tc.id, tool: requestedTool, input: tc.input, decision: 'invalid', risk: null, mode, gate: null });
    return { output: { error: schemaError } };
  }

  // Gates 1-5: ordered refusals, all before anyone is asked anything. The order
  // is a stated property now — see GATE_ORDER in gates.js.
  const refusal = await runPreGates({
    tool: tc.name, input: tc.input, mode, agentName, gateState, externalTools: externalToolNames,
  });
  if (refusal) {
    return { output: { error: refusal.reason, gate: refusal.gate, ...(refusal.blastRadius ? { blastRadius: true } : {}) } };
  }

  // A skill that declared `allowed-tools` excludes this call. Checked here,
  // after the mode gate and before the permission prompt, for two reasons:
  //
  //   - After the mode gate, because "not available in PLAN mode" is the more
  //     fundamental answer and the user is better served by it.
  //   - Before the prompt, because a call a loaded skill forbids is not
  //     something to ask a human about; the answer is already determined.
  //
  // It is a refusal rather than a narrower toolset on purpose — see the note in
  // `skill-scope.js`. The model was shown this tool, so it has to be told why.
  const scopeRefusal = checkSkillScope(skillScope, tc.name);
  if (scopeRefusal) {
    return { output: { error: scopeRefusal.reason, gate: scopeRefusal.gate } };
  }

  // Defaults are applied AFTER the gates and the permission decision, and the
  // validated object replaces `tc.input`. Two reasons for that placement:
  //
  //   - The gates and the audit trail must record what the model *asked for*,
  //     not the shape a default silently filled in. An audit entry that reads
  //     `timeout: 120000` for a call the model never mentioned a timeout on is
  //     a small lie, and the auditor is read long after the turn.
  //   - `validateToolInput` is also the only reader of the defaults, so a
  //     tool that has no validator simply passes through unchanged.
  const validated = coerceToolInput(tc.name, tc.input);
  if (validated !== tc.input) tc = { ...tc, input: validated };

  // Classification, then the permission decision. `assessCall` is shared with
  // the audit trail so both agree about how dangerous a command is.
  const { bashCheck, risk, shellish, command } = assessCall(tc.name, tc.input, workdir || getWorkdir());
  const decision = await resolvePermissionGate({
    tool: tc.name, input: tc.input, toolCallId: tc.id, allowAll,
    onPermissionRequest, risk, bashCheck, shellish,
  });
  const { permission } = decision;
  if (permission === 'deny') return { output: { error: 'User denied permission' } };

  // Grant side of the binding, recorded before anything executes. Written here
  // rather than next to `auditToolUse` because the gates above can return
  // early — and an early return is not a gap, it is a call that never ran.
  recordGrant({
    ...auditCtx,
    toolCallId: tc.id,
    tool: requestedTool,
    input: tc.input,
    decision: permission ?? 'no-prompt',
    risk: risk?.level ?? null,
    mode,
    gate: null,
    // The browser's `workdir`. Copied out of the raw input so `audit.js`'s
    // Effect class can compare it as a field rather than as an opaque blob.
    // This is the descriptor as the model *asserted* it — unverified at this
    // point. The tool layer does the verifying and says so on the dispatch side,
    // which is why the two are recorded from different places.
    effect: webEffectOf(tc.input),
  });
  granted = true;

  applySessionGrant({ permission, tool: tc.name, risk, bashCheck, command, allowAll, workdir });

  // The unified `task` tool: translate to a legacy call and take the same path.
  // A shape mismatch becomes an error the model can read and correct, which is
  // better than silently defaulting a merge to "diff".
  if (tc.name === 'task') {
    const legacy = normalizeTaskCall(tc.input);
    if (legacy === undefined) {
      const known = Object.keys(TASK_ACTIONS).concat(['spawn']).join(', ');
      return { output: { error: `unknown task action "${tc.input?.action}". Expected one of: ${known}` } };
    }
    if (legacy === null && String(tc.input?.action) === 'cancel') {
      const id = String(tc.input?.id || '');
      const ok = cancelTask(id, 'cancelled by the agent');
      if (granted) recordDispatch({ ...auditCtx, toolCallId: rawTc.id, tool: 'task', input: tc.input, ok });
      return { output: { cancelled: ok, id, hint: ok ? null : `no running task with id ${id}` } };
    }
    if (legacy === null) {
      const out = await spawnSubagentTask(tc.input, { agentName, workdir, model, createStream, subagentDepth, subagentState, parentTaskId, runId: auditCtx.runId });
      recordDispatch({ ...auditCtx, toolCallId: rawTc.id, tool: tc.name, input: tc.input, ok: !out?.output?.error, error: out?.output?.error ?? null });
      return { output: out.output };
    }
    tc = { name: legacy.name, input: legacy.input };
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
    if (granted) recordDispatch({ ...auditCtx, toolCallId: rawTc.id, tool: tc.name, input: tc.input, ok: !output?.error });
    return { output };
  }

  // Subagent: same loop, fresh messages, read-only, depth ≤ 1.
  //
  // Previously this was an inline `onPermissionRequest: async () => 'deny'`,
  // which is the `readonly` rung written out by hand in the one place that
  // needed it. It is now the same rung the rest of the system uses, and the
  // depth limit is enforced by the primitive rather than restated here.
  if (tc.name === 'spawnAgent') {
    const out = await spawnSubagentTask(tc.input, { agentName, workdir, model, createStream, subagentDepth, subagentState, parentTaskId });
    if (granted) recordDispatch({ ...auditCtx, toolCallId: rawTc.id, tool: tc.name, input: tc.input, ok: !out?.output?.error });
    return out;
  }

  // External MCP tool (namespaced `<server>__<tool>`): dispatch through the
  // client instead of the local registry. External tools are read-only by
  // default — a third-party server is not silently granted write access.
  if (externalToolNames && externalToolNames.has(tc.name)) {
    const { callExternalTool } = await import('./mcp-client.js');
    let output;
    try {
      output = await callExternalTool(tc.name, tc.input, { mcpServers });
    } catch (e) {
      output = { error: e?.message || String(e) };
    }
    auditToolUse({ toolName: tc.name, ok: !output?.error, cwd: workdir });
    if (granted) {
      recordDispatch({
        ...auditCtx,
        toolCallId: rawTc.id,
        tool: tc.name,
        input: tc.input,
        ok: !output?.error,
        error: output?.error ?? null,
      });
    }
    runHooks('postToolUse', { toolName: tc.name, output, mode }).catch(() => {});
    return { output };
  }

  let output;
  try {
    output = await runInWorkdir(workdir, () =>
      executeLocalTool(tc.name, tc.input, mode, { preAuthorized: permission != null }));
  } catch (e) {
    output = { error: e?.message || String(e) };
  }

  // A successful `skill` call may have narrowed the rest of the turn. Recorded
  // here rather than in the tool implementation because the scope is the *turn's*
  // state, and the tool has no business owning it.
  if (tc.name === 'skill' && !output?.error) {
    const { resolveSkill } = await import('./skills.js');
    // The stacked form returns `skills: [...]`; the single form is the object
    // itself. Both are read here so a stacked load constrains just as a single
    // one does — otherwise `names` would be a way to opt out of `allowed-tools`.
    const loaded = Array.isArray(output?.skills) ? output.skills : output ? [output] : [];
    for (const one of loaded) {
      const full = resolveSkill(one.name, workdir || getWorkdir());
      if (full) noteSkillLoaded(skillScope, full);
    }
  }
  if ((tc.name === 'editFile' || tc.name === 'writeFile') && !output?.error && tc.input?.path) {
    editCounts[tc.input.path] = (editCounts[tc.input.path] || 0) + 1;
  }
  if (bashCheck?.warnings.length && output && typeof output === 'object' && !Array.isArray(output)) {
    output = { ...output, warnings: bashCheck.warnings };
  }
  auditToolUse({ toolName: tc.name, ok: !output?.error, cwd: workdir });
  if (granted) {
    recordDispatch({
      ...auditCtx,
      toolCallId: rawTc.id,
      tool: tc.name,
      input: tc.input,
      ok: !output?.error,
      error: output?.error ?? null,
      // What actually acted, which for a browser call is the *verified*
      // descriptor the tool resolved — not the asserted one the grant recorded.
      // The difference between the two is the Effect class, and it is only
      // visible because both sides are recorded from different sources.
      effect: output?.effect ?? webEffectOf(tc.input),
      drifted: !!output?.drifted,
    });
  }
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

/**
 * Start a subagent and WAIT for it.
 *
 * The only tool that is not fire-and-forget: the caller wants the summary now,
 * not a notification later. Shared by the legacy `spawnAgent` name and the
 * unified `task` action "spawn", so the two cannot drift.
 */
async function spawnSubagentTask(input, { agentName, workdir, model, createStream, subagentDepth = 0, subagentState, parentTaskId = null, runId = null }) {
  if (subagentState?.disabled) {
    return { output: { error: 'a subagent is not available in this context (depth limit 1). Do the work inline.' } };
  }
  const subPrompt = String(input?.prompt || '');
  if (!subPrompt.trim()) return { output: { error: 'prompt is required' } };
  const subMode = input?.mode === 'BUILD' ? 'BUILD' : 'PLAN';

  /**
   * Optional skill, loaded into the subagent's first message.
   *
   * The body is prepended rather than replacing the prompt: the prompt is the
   * task, the skill is the method, and the subagent's summary then reflects the
   * skill's workflow rather than the caller's paraphrase of it. The preamble and
   * its refusal behaviour live in `skill-delegation.js`, shared with `team.js`.
   */
  const skills = buildSkillPreamble(input?.skills ?? input?.skill, workdir);
  if (skills.error) return { output: { error: skills.error } };
  const fullPrompt = skills.text + subPrompt;

  const { id, task, rejected } = createTask({
    kind: 'agent',
    prompt: fullPrompt,
    mode: subMode,
    model,
    parent: parentTaskId,
    // A subagent researches and reports; it does not edit. BUILD mode is
    // preserved because it changes which read-oriented tools are offered,
    // not what the agent is allowed to do with the filesystem.
    permission: PERMISSIONS.READONLY,
    cwd: workdir,
    depthSeed: subagentDepth,
    // `taskId` comes from the run context, not the outer `id` binding: `createTask`
    // starts the body synchronously, so referencing the outer const here reads it
    // before its initializer has finished — a TDZ error, and one that only shows
    // up when a subagent is actually spawned.
    run: async ({ id: taskId, permission, signal }) => {
      let text = '';
      for await (const ev of runAgentTurnInner({
        history: [{ id: `sub_${Date.now()}`, role: 'user', parts: [{ type: 'text', text: fullPrompt }] }],
        mode: subMode,
        model: model,
        createStream,
        trajectory: false,
        subagentDepth: subagentDepth + 1,
        workdir,
        agentName: `${agentName}/sub`,
        signal,
        onPermissionRequest: permission,
        rung: PERMISSIONS.READONLY,
        runId,
        // Which task this turn's calls belong to. executeOneTool reads it to
        // attribute each record, and without it the subagent's calls are
        // recorded as unattributed — leaving the Delegation class no parent to
        // compare against.
        parentTaskId: taskId,
      })) {
        if (ev.event === 'text') text += ev.data.delta;
        else if (ev.event === 'error') text += `\n[subagent error: ${ev.data.message}]`;
      }
      return { summary: text.slice(0, 8000) || '(subagent returned no text)' };
    },
  });

  if (rejected) return { output: { error: rejected } };
  // Unlike a teammate, a subagent is awaited: the caller wants its summary
  // now, not a notification later.
  const finished = await awaitTask(id);
  if (finished.status === 'failed') {
    return { output: { error: `Subagent failed: ${finished.error || 'unknown error'}` } };
  }
  if (finished.status === 'cancelled') {
    return { output: { error: 'Subagent was cancelled.' } };
  }
  void task;
  return { output: finished.result || { summary: '(subagent returned no text)' } };
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
  // The audit trail is keyed by the same run id as the trajectory, so
  // `sentinel audit <runId>` and `sentinel replay <runId>` describe one run.
  // Without this the audit file would be named `adhoc_*` while the trajectory
  // kept the real id, and joining the two — the only reason to record both —
  // would need a guess.
  yield* withTrajectory(runAgentTurnInner({ ...opts, runId }), {
    runId,
    model: opts.model,
    mode: opts.mode,
    prompt: lastUserText(opts.history),
    goal: opts.goal,
    outcome: opts.outcome ? contractBrief(opts.outcome) : undefined,
  });
}

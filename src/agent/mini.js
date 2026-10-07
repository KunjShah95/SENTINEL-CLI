/**
 * mini — a bash-only agent (ported from SWE-agent/mini-swe-agent
 * agents/default.py + environments/local.py + config/mini.yaml).
 *
 * The whole agent is: one tool (bash), every command in a fresh subshell,
 * a linear message list, and three exits — the model prints the submit
 * sentinel, a limit trips, or it repeatedly fails to call the tool. That
 * minimalism is the point: it is the cheapest strong SWE-bench baseline and
 * its trajectories are directly comparable (trajectory_format
 * "mini-swe-agent-1.1").
 *
 * Sentinel keeps its own safety floor: the builtin dangerous-command guard
 * still runs before every command.
 *
 * On the primitive: a mini run is a task. That is a small change with three
 * real consequences — it appears in `sentinel tasks`, it counts against the
 * same concurrency cap as a teammate or a race candidate, and it can now be
 * cancelled by anything holding its id, which previously only the caller that
 * created the AbortSignal could do.
 *
 * It deliberately keeps its own guard rather than adopting a rung from
 * `task.js`. Mini is a headless benchmark agent: there is nobody to prompt, so
 * the ladder's `teammate` rung — which allows a non-read-only shell command
 * only under an interactive grant — would deny every file write and make the
 * agent unable to do its job. "No prompts, deny the destructive patterns" is a
 * real policy that the ladder does not have a rung for, and inventing a rung
 * for it inside a refactor would be changing a security posture in a diff that
 * claims only to move code.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import os from 'node:os';
import { resolveChatModel } from '../shared/models/index.js';
import { streamCompletion } from './providers.js';
import { recordUsage, estimateTokensFromText } from './cost.js';
import { runCommand } from './background.js';
import { createTask, awaitTask, cancelTask, PERMISSIONS } from './task.js';
import { builtinPreToolUseGuard } from './hooks.js';
import { truncateHead, truncateTail } from '../shared/tools/truncate.js';

export const SUBMIT_SENTINEL = 'COMPLETE_TASK_AND_SUBMIT_FINAL_OUTPUT';
export const MINI_VERSION = '1.1';
const OUTPUT_CAP = 10_000;

export const MINI_SYSTEM = 'You are a helpful assistant that can interact with a computer.';

export function renderInstance(task) {
  return [
    `Please solve this issue: ${task}`,
    '',
    'You can execute bash commands and edit files to implement the necessary changes.',
    '',
    '## Recommended Workflow',
    '1. Analyze the codebase by finding and reading relevant files',
    '2. Create a script to reproduce the issue',
    '3. Edit the source code to resolve the issue',
    '4. Verify your fix works by running your script again',
    '5. Test edge cases to ensure your fix is robust',
    `6. Submit your changes and finish your work by issuing: \`echo ${SUBMIT_SENTINEL}\`.`,
    '   Do not combine it with any other command. After this command, you cannot continue working on this task.',
    '',
    '## Command Execution Rules',
    '- Each response MUST include reasoning text and AT LEAST ONE bash tool call.',
    '- Directory or environment variable changes are not persistent. Every action runs in a new subshell;',
    '  prefix actions with `cd /path && ...` when needed.',
    '- Create files with heredocs (cat <<\'EOF\' > file), edit with sed or small scripts.',
    '',
    `<system_information>${os.type()} ${os.release()} ${os.arch()}</system_information>`,
  ].join('\n');
}

const BASH_TOOL = {
  type: 'function',
  function: {
    name: 'bash',
    description: 'Execute a bash command in a fresh subshell and return its output.',
    parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
  },
};

const FORMAT_ERROR =
  'Please always provide EXACTLY ONE bash tool call per response, together with your reasoning. ' +
  `If you have completed your assignment, run \`echo ${SUBMIT_SENTINEL}\` as your only command.`;

/** Observation text, mini-swe-agent style: returncode + head/tail-bounded output. */
export function formatObservation({ exitCode, output, exception }) {
  let body = output || '';
  if (body.length > OUTPUT_CAP) {
    const head = truncateHead(body, { maxBytes: OUTPUT_CAP / 2 }).content;
    const tail = truncateTail(body, { maxBytes: OUTPUT_CAP / 2 }).content;
    body = `<warning>Output too long (${body.length} chars); showing head and tail. Use more selective commands.</warning>\n<output_head>\n${head}\n</output_head>\n<elided_chars>${body.length - head.length - tail.length}</elided_chars>\n<output_tail>\n${tail}\n</output_tail>`;
  } else {
    body = `<output>\n${body}</output>`;
  }
  const exc = exception ? `\n<exception>${exception}</exception>` : '';
  return `<returncode>${exitCode}</returncode>\n${body}${exc}`;
}

/** Submitted when the FIRST output line is the sentinel and the command succeeded. */
export function checkSubmitted({ exitCode, output }) {
  const lines = String(output || '').replace(/^\s+/, '').split(/\r?\n/);
  if (exitCode === 0 && lines[0]?.trim() === SUBMIT_SENTINEL) {
    return { submitted: true, submission: lines.slice(1).join('\n') };
  }
  return { submitted: false };
}

/**
 * Run the mini agent to completion.
 *
 * The linear loop lives in `runMiniLoop`; this wrapper is the task shell.
 *
 * @returns {Promise<{exitStatus: string, submission: string, messages: object[], cost: number, apiCalls: number}>}
 */
export async function runMini(opts = {}) {
  const { cwd = process.cwd(), signal, task: taskText } = opts;

  const { id, rejected } = createTask({
    kind: 'agent',
    name: `mini-${String(taskText || '').slice(0, 24).replace(/\s+/g, '-') || 'run'}`,
    owner: 'mini',
    prompt: taskText,
    mode: 'BUILD',
    permission: PERMISSIONS.INHERIT,
    isolation: 'none',
    cwd,
    meta: { mini: true, headless: true },
    run: ({ signal: taskSignal }) => runMiniLoop({ ...opts, cwd, signal: taskSignal }),
  });

  if (rejected) {
    // Mini has no partial-result path of its own, so a refusal is surfaced as
    // the same shape the loop uses for its own exits rather than a throw: the
    // caller is a benchmark harness that reads `exitStatus`.
    return { exitStatus: 'Rejected', submission: rejected, messages: [], cost: 0, apiCalls: 0 };
  }

  // The caller's signal still has to reach the run: aborting the caller must
  // cancel the task, not just be ignored because the task owns the signal now.
  const onAbort = () => cancelTask(id, 'aborted by caller');
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const finished = await awaitTask(id);
    if (finished.status === 'failed') {
      return { exitStatus: 'ModelError', submission: finished.error || '', messages: [], cost: 0, apiCalls: 0 };
    }
    if (finished.status === 'cancelled') {
      return { exitStatus: 'Interrupted', submission: '', messages: [], cost: 0, apiCalls: 0 };
    }
    return finished.result;
  } finally {
    signal?.removeEventListener?.('abort', onAbort);
  }
}

/** The linear mini-swe-agent loop: one tool, three exits, nothing else. */
async function runMiniLoop({
  task,
  model,
  stepLimit = 0,
  costLimit = 3.0,
  wallTimeLimitSeconds = 0,
  maxFormatErrors = 3,
  commandTimeoutMs = 60_000,
  cwd = process.cwd(),
  output,
  createStream,
  signal,
  onEvent = () => {},
} = {}) {
  const resolved = resolveChatModel(model);
  const start = Date.now();
  const messages = [{ role: 'user', content: renderInstance(task) }];
  let cost = 0;
  let apiCalls = 0;
  let formatErrors = 0;
  let exit = null;

  const finish = (exitStatus, submission = '') => {
    exit = { exitStatus, submission };
    messages.push({ role: 'exit', content: submission || exitStatus, extra: { exit_status: exitStatus, submission } });
  };

  while (!exit) {
    if (signal?.aborted) { finish('Interrupted'); break; }
    if ((stepLimit > 0 && apiCalls >= stepLimit) || (costLimit > 0 && cost >= costLimit)) { finish('LimitsExceeded'); break; }
    if (wallTimeLimitSeconds > 0 && (Date.now() - start) / 1000 >= wallTimeLimitSeconds) { finish('TimeExceeded'); break; }

    apiCalls++;
    let text = '';
    const calls = [];
    let usage = null;
    const wire = messages.filter((m) => m.role !== 'exit');
    try {
      for await (const ev of (createStream ?? streamCompletion)({
        modelId: resolved.modelId,
        provider: resolved.provider,
        system: MINI_SYSTEM,
        messages: wire,
        tools: [BASH_TOOL],
        signal,
      })) {
        if (ev.type === 'text') text += ev.text;
        else if (ev.type === 'tool_call') calls.push(ev);
        else if (ev.type === 'usage') usage = ev.usage;
        else if (ev.type === 'error') throw new Error(ev.message);
      }
    } catch (e) {
      finish('ModelError', String(e?.message || e));
      break;
    }
    const inTok = usage?.inputTokens ?? Math.ceil(JSON.stringify(wire).length / 4);
    const outTok = usage?.outputTokens ?? estimateTokensFromText(text);
    cost += recordUsage(resolved.modelId, { inputTokens: inTok, outputTokens: outTok }).usd || 0;

    const bashCalls = calls.filter((c) => c.name === 'bash');
    messages.push({
      role: 'assistant',
      content: text,
      ...(calls.length ? {
        tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) } })),
      } : {}),
    });
    onEvent({ type: 'step', step: apiCalls, text, commands: bashCalls.map((c) => c.input?.command) });

    if (!bashCalls.length) {
      formatErrors++;
      for (const c of calls) messages.push({ role: 'tool', tool_call_id: c.id, content: `Unknown tool ${c.name}; only bash exists.` });
      messages.push({ role: 'user', content: FORMAT_ERROR });
      if (maxFormatErrors > 0 && formatErrors >= maxFormatErrors) finish('RepeatedFormatError');
      continue;
    }
    formatErrors = 0;

    for (const c of calls) {
      if (c.name !== 'bash') {
        messages.push({ role: 'tool', tool_call_id: c.id, content: `Unknown tool ${c.name}; only bash exists.` });
        continue;
      }
      const command = String(c.input?.command || '');
      const guard = builtinPreToolUseGuard('bash', { command });
      const result = guard?.block
        ? { exitCode: -1, output: '', exception: guard.reason }
        : await runCommand(command, { cwd, timeoutMs: commandTimeoutMs });
      if (result.timedOut) result.exception = `Command timed out after ${commandTimeoutMs}ms`;
      onEvent({ type: 'observation', command, exitCode: result.exitCode });
      const sub = checkSubmitted(result);
      if (sub.submitted) {
        messages.push({ role: 'tool', tool_call_id: c.id, content: formatObservation(result) });
        finish('Submitted', sub.submission);
        break;
      }
      messages.push({ role: 'tool', tool_call_id: c.id, content: formatObservation(result) });
    }
    if (output) saveTrajectory(output, { messages, cost, apiCalls, exit, model: resolved.modelId });
  }

  if (output) saveTrajectory(output, { messages, cost, apiCalls, exit, model: resolved.modelId });
  return { ...exit, messages, cost, apiCalls };
}

export function serializeTrajectory({ messages, cost, apiCalls, exit, model }) {
  return {
    info: {
      model_stats: { instance_cost: cost, api_calls: apiCalls },
      config: { agent_type: 'sentinel.mini', model: { model_name: model } },
      mini_version: `sentinel-${MINI_VERSION}`,
      exit_status: exit?.exitStatus || '',
      submission: exit?.submission || '',
    },
    messages: [{ role: 'system', content: MINI_SYSTEM }, ...messages],
    trajectory_format: `mini-swe-agent-${MINI_VERSION}`,
  };
}

function saveTrajectory(path, state) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(serializeTrajectory(state), null, 2));
  } catch { /* trajectory is observability, never control flow */ }
}

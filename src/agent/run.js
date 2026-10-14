/**
 * `sentinel agent run <task>` — the headless run.
 *
 * The agent owns the loop, the history, the tools, the budget and exactly one
 * cancellation source. This module is a consumer of that event stream, not a
 * second driver of it: it embeds the agent in-process and prints what comes out.
 * An SSE server will consume the same stream with the same rules, which is what
 * makes this a consumer rather than the place the behaviour lives.
 *
 * Everything the outside world can do to a run goes through the one
 * `AbortController` built here. Ctrl-C aborts it; the time budget aborts it.
 * Both reach the model stream, every tool call and every HTTP request, so a
 * cancelled run leaves nothing running behind it.
 *
 * `io` and `runTurn` are injected so this is testable without a terminal or a
 * model — the interrupt and deadline paths are the ones worth testing, and
 * neither is reachable from CI otherwise.
 */
import { runAgentTurn } from './loop.js';
import { formatUsd } from './cost.js';
import { DEFAULT_CHAT_MODEL_ID } from '../shared/models/index.js';
import { DeadlineExceeded, abortReason } from '../utils/abort.js';

/** 130 is the shell convention for SIGINT, which is what Ctrl-C is. */
export const EXIT_INTERRUPTED = 130;
export const EXIT_ERROR = 1;

const dim = (s) => `\x1b[2m${s}\x1b[0m`;

/** The real process. Replaced wholesale in tests. */
export const processIo = {
  out: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s),
  onInterrupt: (fn) => {
    process.on('SIGINT', fn);
    process.on('SIGTERM', fn);
  },
  offInterrupt: (fn) => {
    process.off('SIGINT', fn);
    process.off('SIGTERM', fn);
  },
};

/**
 * One line about a tool result, or null when there is nothing worth saying.
 *
 * Results are printed because the point is watching the work happen. That means
 * every result, but not its payload — a grep returning 200 matches would
 * otherwise bury the transcript it is meant to annotate.
 */
export function summarizeToolResult(data = {}) {
  if (data.error) return `✗ ${String(data.error).slice(0, 200)}`;
  const o = data.output;
  if (o == null) return null;
  if (typeof o === 'string') return head(o);
  if (typeof o !== 'object') return String(o);
  if (Array.isArray(o.results)) return `${o.results.length} result(s)`;
  if (o.error) return `✗ ${String(o.error).slice(0, 200)}`;
  if (o.exitCode !== undefined) {
    return `exit ${o.exitCode}${o.timedOut ? ' (timed out)' : ''}${o.cancelled ? ' (cancelled)' : ''}`;
  }
  if (typeof o.diff === 'string') {
    const changed = o.diff.split('\n').filter((l) => l[0] === '+' || l[0] === '-').length;
    return `${changed} line(s) changed`;
  }
  if (o.path) return `wrote ${o.path}`;
  return null;
}

function head(text) {
  const lines = String(text).trim().split('\n');
  const shown = lines.slice(0, 2).join(' | ');
  return lines.length > 2 ? `${shown} …` : shown;
}

/**
 * Run one task to completion, printing its events.
 *
 * @param {string} task
 * @param {object} [opts]
 * @param {string} [opts.model]    Any model the registry knows. The provider
 *                                 comes from it, so the same run works against
 *                                 Anthropic or OpenAI.
 * @param {'PLAN'|'BUILD'} [opts.mode]
 * @param {number} [opts.maxCostUsd]  [opts.maxTurns]  [opts.maxTokens]
 * @param {number} [opts.maxTimeMs]  Wall-clock ceiling; aborts the same signal
 *                                   Ctrl-C does.
 * @param {object} [opts.io]        Output/interrupt surface.
 * @param {Function} [opts.runTurn] The loop. Injectable for tests.
 * @returns {Promise<{exitCode: number, stoppedBy: string, usage: object|null,
 *                    costUsd: number, text: string}>}
 */
export async function runTask(task, opts = {}) {
  const {
    model = DEFAULT_CHAT_MODEL_ID,
    mode = 'BUILD',
    maxCostUsd = 0,
    maxTurns = 0,
    maxTokens = 0,
    maxTimeMs = 0,
    quietCost = false,
    engagement = false,
    io = processIo,
    onPermissionRequest,
    runTurn = runAgentTurn,
  } = opts;

  if (!task || !task.trim()) {
    io.err('Usage: sentinel agent run "<task>"\n');
    return { exitCode: EXIT_ERROR, stoppedBy: 'usage', usage: null, costUsd: 0, text: '' };
  }

  const controller = new AbortController();

  // First Ctrl-C asks the run to stop and it reports what it spent. Second one
  // is the user declining to wait for that. Both honoured; the gap is one press.
  let presses = 0;
  const onInterrupt = () => {
    if (++presses === 1) {
      io.err(`\n${dim('interrupting — finishing the current tool call, partial usage will be reported…')}\n`);
      controller.abort();
    } else {
      io.err('\n\x1b[31mforced exit\x1b[0m\n');
      process.exit(EXIT_INTERRUPTED);
    }
  };
  io.onInterrupt(onInterrupt);

  // The deadline aborts that same signal rather than setting a flag the loop has
  // to remember to check. One stop path means one place to get right; a second
  // mechanism is a second thing to forget, and forgetting it costs a run that
  // cannot be stopped.
  const deadline = maxTimeMs > 0
    ? setTimeout(() => controller.abort(new DeadlineExceeded(maxTimeMs)), maxTimeMs)
    : null;

  let sawError = false;
  let text = '';
  let usage = null;
  let costUsd = 0;
  let stoppedBy = 'end_turn';

  try {
    const history = [{ id: `run_${Date.now()}`, role: 'user', parts: [{ type: 'text', text: String(task) }] }];

    for await (const ev of runTurn({
      history,
      mode,
      model,
      maxCostUsd: maxCostUsd || undefined,
      maxTurns,
      maxTokens,
      engagement,
      signal: controller.signal,
      onPermissionRequest,
    })) {
      switch (ev.event) {
      case 'text':
        io.out(ev.data.delta);
        text += ev.data.delta;
        break;
      case 'tool_call':
        // Before the tool runs, so the user sees what is about to happen rather
        // than finding out afterwards.
        io.err(`\n${dim(`→ ${ev.data.toolName}`)}\n`);
        break;
      case 'tool_result': {
        // `ask` printed calls and never results, which left the user watching a
        // tool take thirty seconds with no sign it had finished.
        const line = summarizeToolResult(ev.data);
        if (line) io.err(`${dim('  ' + line)}\n`);
        break;
      }
      case 'finish':
        usage = ev.data?.usage || null;
        costUsd = ev.data?.costUsd || 0;
        stoppedBy = ev.data?.stoppedBy || stoppedBy;
        break;
      case 'error':
        sawError = true;
        io.err(`\n\x1b[31m${ev.data.message}\x1b[0m\n`);
        break;
      case 'reasoning':
        if (process.env.SENTINEL_VERBOSE) io.err(dim(ev.data.text));
        break;
      case 'route':
        io.err(`${dim(`⇄ ${ev.data.model} (${ev.data.reason})`)}\n`);
        break;
      case 'waiting':
        io.err(`${dim('⏳ waiting for background work / teammates…')}\n`);
        break;
      case 'warning':
        io.err(`\x1b[33m${ev.data.message}\x1b[0m\n`);
        break;
      default:
        // `done`, `receipts`, and whatever a future consumer adds. Unknown
        // events are ignored, not fatal: a consumer that dies on an event it
        // does not recognise cannot be extended.
        break;
      }
    }
  } catch (e) {
    sawError = true;
    io.err(`\n\x1b[31m${e.message}\x1b[0m\n`);
  } finally {
    clearTimeout(deadline);
    io.offInterrupt(onInterrupt);
  }

  // No `finish` means the loop threw or its stream ended early. `end_turn` would
  // be a lie about why it stopped.
  if (!usage) stoppedBy = controller.signal.aborted ? abortReason(controller.signal).kind : 'error';

  if (text) io.out('\n');
  if (!quietCost && usage) {
    const { inputTokens = 0, outputTokens = 0 } = usage;
    io.err(`${dim(`${inputTokens} in / ${outputTokens} out · ${formatUsd(costUsd)} · ${model}`)}\n`);
  }

  // A budget ceiling is exit 0: the run did what it was told and stopped at the
  // line the user drew. Deadline, abort and error are non-zero, or a CI job
  // reads a green run that produced no answer.
  const failed = stoppedBy === 'deadline' || stoppedBy === 'error' || stoppedBy === 'aborted';
  return {
    exitCode: stoppedBy === 'interrupted' ? EXIT_INTERRUPTED : (sawError || failed ? EXIT_ERROR : 0),
    stoppedBy,
    usage,
    costUsd,
    text,
  };
}

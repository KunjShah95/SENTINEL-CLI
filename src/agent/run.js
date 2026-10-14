/**
 * One run, and the two consumers of it.
 *
 * `startRun` owns the lifecycle — the loop, the budget, the single cancellation
 * source — and hands every event to a callback. It prints nothing and knows
 * nothing about terminals.
 *
 * `runTask` is the first consumer: it prints. `serve.js` is the second: it writes
 * SSE frames. Neither adds behaviour to a run, because a run's behaviour is
 * decided before either of them is called.
 *
 * That split is the whole point, and it is worth stating what it buys. The
 * design claims a run is one primitive with interchangeable front-ends. Writing
 * the second consumer is the only thing that tests that claim: if the server
 * needed something `runTask` does not expose, or vice versa, then the primitive
 * was really just one caller with extra steps — and the fix is to move that
 * capability down into `startRun`, not to write it twice.
 *
 * The callback is the event stream. It is synchronous and returns nothing,
 * which is the smallest contract two consumers can both honour: `runTask` writes
 * to a tty, the server writes to a socket, and neither waits on the other.
 */
import { runAgentTurn } from './loop.js';
import { formatUsd } from './cost.js';
import { DEFAULT_CHAT_MODEL_ID } from '../shared/models/index.js';
import { DeadlineExceeded, abortReason } from '../utils/abort.js';

/** 130 is the shell convention for SIGINT, which is what Ctrl-C is. */
export const EXIT_INTERRUPTED = 130;
export const EXIT_ERROR = 1;

const dim = (s) => `\x1b[2m${s}\x1b[0m`;

let seq = 0;
const nextId = () => `run_${Date.now().toString(36)}_${(seq++).toString(36)}`;

/**
 * Start a run.
 *
 * @param {string} task
 * @param {object} [opts]
 * @param {Function} [opts.onEvent]  Called with every `{ event, data }` as it
 *                                   happens. Throwing from it will not stop the
 *                                   run: a consumer that hangs up must not take
 *                                   the agent down with it.
 * @param {number} [opts.maxTimeMs]  Wall-clock ceiling; aborts the same signal
 *                                   cancellation does.
 * @returns {{id: string, cancel: (reason?: any) => void, signal: AbortSignal,
 *            done: Promise<{stoppedBy: string, usage: object|null, costUsd: number,
 *                            text: string, exitCode: number}>}}
 */
export function startRun(task, opts = {}) {
  const {
    model = DEFAULT_CHAT_MODEL_ID,
    mode = 'BUILD',
    maxCostUsd = 0,
    maxTurns = 0,
    maxTokens = 0,
    maxTimeMs = 0,
    engagement = false,
    onPermissionRequest,
    runTurn = runAgentTurn,
    onEvent = () => {},
  } = opts;

  const controller = new AbortController();
  // One id, used for the run and for its first history entry, so a consumer can
  // quote either and have them match.
  const id = nextId();

  // The deadline aborts that same signal rather than setting a flag the loop has
  // to remember to check. One stop path means one place to get right; a second
  // mechanism is a second thing to forget, and forgetting it costs a run that
  // cannot be stopped.
  const deadline = maxTimeMs > 0
    ? setTimeout(() => controller.abort(new DeadlineExceeded(maxTimeMs)), maxTimeMs)
    : null;

  // Delivered even when the loop throws, so a consumer never has to distinguish
  // "the run ended" from "the run died" by watching for a terminal event.
  const emit = (ev) => {
    try {
      onEvent(ev);
    } catch {
      // A consumer that throws is a broken consumer. The run keeps going, and
      // the next consumer to attach still sees every event.
    }
  };

  const done = (async () => {
    let sawError = false;
    let text = '';
    let usage = null;
    let costUsd = 0;
    let stoppedBy = 'end_turn';

    try {
      const history = [{ id, role: 'user', parts: [{ type: 'text', text: String(task) }] }];
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
        // Read before emitting, so the summary is complete by the time the
        // consumer sees the event that completes it.
        if (ev.event === 'finish') {
          usage = ev.data?.usage || null;
          costUsd = ev.data?.costUsd || 0;
          stoppedBy = ev.data?.stoppedBy || stoppedBy;
        } else if (ev.event === 'error') {
          sawError = true;
        } else if (ev.event === 'text') {
          text += ev.data.delta;
        }
        emit(ev);
      }
    } catch (e) {
      sawError = true;
      emit({ event: 'error', data: { message: e.message } });
    } finally {
      clearTimeout(deadline);
    }

    // No `finish` means the loop threw or its stream ended early. `end_turn`
    // would be a lie about why it stopped.
    if (!usage) stoppedBy = controller.signal.aborted ? abortReason(controller.signal).kind : 'error';

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
  })();

  return {
    id,
    cancel: (reason) => controller.abort(reason),
    signal: controller.signal,
    done,
  };
}

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
 * Run one task to completion, printing its events. The terminal consumer.
 *
 * @param {string} task
 * @param {object} [opts]  Everything `startRun` takes, plus:
 * @param {object} [opts.io]        Output/interrupt surface.
 * @param {boolean} [opts.quietCost]
 * @returns {Promise<{exitCode: number, stoppedBy: string, usage: object|null,
 *                    costUsd: number, text: string}>}
 */
export async function runTask(task, opts = {}) {
  const { io = processIo, quietCost = false, model, ...rest } = opts;

  if (!task || !task.trim()) {
    io.err('Usage: sentinel agent run "<task>"\n');
    return { exitCode: EXIT_ERROR, stoppedBy: 'usage', usage: null, costUsd: 0, text: '' };
  }

  // Prints and nothing else. Every decision about the run was made by
  // `startRun` before this callback existed.
  const run = startRun(task, {
    ...rest,
    model,
    onEvent: (ev) => {
      switch (ev.event) {
      case 'text':
        io.out(ev.data.delta);
        break;
      case 'tool_call':
        // Before the tool runs, so the user sees what is about to happen
        // rather than finding out afterwards.
        io.err(`\n${dim(`→ ${ev.data.toolName}`)}\n`);
        break;
      case 'tool_result': {
        // `ask` printed calls and never results, which left the user watching
        // a tool take thirty seconds with no sign it had finished.
        const line = summarizeToolResult(ev.data);
        if (line) io.err(`${dim('  ' + line)}\n`);
        break;
      }
      case 'error':
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
        // `done`, `receipts`, and whatever a future consumer adds. Ignored, not
        // fatal: a consumer that dies on an event it does not recognise cannot
        // be extended.
        break;
      }
    },
  });

  // First Ctrl-C asks the run to stop and it reports what it spent. Second one is
  // the user declining to wait for that. Both honoured; the gap is one press.
  let presses = 0;
  const onInterrupt = () => {
    if (++presses === 1) {
      io.err(`\n${dim('interrupting — finishing the current tool call, partial usage will be reported…')}\n`);
      run.cancel();
    } else {
      io.err('\n\x1b[31mforced exit\x1b[0m\n');
      process.exit(EXIT_INTERRUPTED);
    }
  };
  io.onInterrupt(onInterrupt);

  try {
    const summary = await run.done;
    if (summary.text) io.out('\n');
    if (!quietCost && summary.usage) {
      const { inputTokens = 0, outputTokens = 0 } = summary.usage;
      io.err(`${dim(`${inputTokens} in / ${outputTokens} out · ${formatUsd(summary.costUsd)} · ${model || DEFAULT_CHAT_MODEL_ID}`)}\n`);
    }
    return summary;
  } finally {
    io.offInterrupt(onInterrupt);
  }
}

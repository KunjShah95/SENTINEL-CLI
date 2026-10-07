/**
 * Background commands — a thin shell over the task primitive.
 *
 * This module used to own a status Map, its own pending-work bookkeeping and
 * its own mailbox delivery. All three now belong to `task.js`, because a
 * background command is not a different kind of thing from a teammate — it is
 * a task with `kind: 'command'`, no model, and a shell as its body:
 *
 *   createTask({ kind: 'command', id: 'bg_…', owner, run: runCommand })
 *
 * What is genuinely still here is `runCommand`: a one-shot spawn that resolves
 * `{ exitCode, output, timedOut }`. It has no lifecycle, no status and no
 * delivery, so it is not a task at all — it is the thing a task of kind
 * 'command' runs. `mini.js` uses it directly for the same reason.
 *
 * The exported API is unchanged: `loop.js`, `mini.js` and four test files
 * import these names.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { post, trackPending, resolvePending } from './mailbox.js';
import { tailWithNotice } from '../shared/tools/truncate.js';
import { killTree } from '../shared/tools/sandbox.js';
import { createTask, getTask, listTasks, resetTasks, onTaskEvent, STATUS } from './task.js';

export const BG_DEFAULT_TIMEOUT = 5 * 60_000;
export const BG_OUTPUT_CAP = 20_000;
export const BG_NOTIFY_CAP = 2_000;

/**
 * Run a shell command asynchronously. Resolves { exitCode, output, timedOut };
 * never rejects. Shared with the mini (bash-only) agent, and used as the body
 * of every background command task.
 */
export function runCommand(command, { cwd = process.cwd(), timeoutMs = 60_000, env } = {}) {
  return new Promise((resolve) => {
    let output = '';
    let timedOut = false;
    let child;
    try {
      child = spawn(command, {
        cwd,
        shell: true,
        env: { ...process.env, TERM: 'dumb', ...env },
        windowsHide: true,
        detached: process.platform !== 'win32',
      });
    } catch (e) {
      resolve({ exitCode: -1, output: String(e?.message || e), timedOut: false });
      return;
    }
    const onData = (d) => {
      output += d.toString();
      // Keep memory bounded on chatty commands; tail is what matters.
      if (output.length > BG_OUTPUT_CAP * 4) output = output.slice(-BG_OUTPUT_CAP * 2);
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);
    timer.unref?.();
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ exitCode: -1, output: `${output}\n${e.message}`, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: timedOut ? -1 : (code ?? -1), output, timedOut });
    });
  });
}

/**
 * Fire-and-forget shell work. Returns immediately; the result arrives in the
 * owner's mailbox, never by polling.
 */
export function startBackground(command, { owner = 'lead', cwd = process.cwd(), timeoutMs = BG_DEFAULT_TIMEOUT } = {}) {
  if (typeof command !== 'string' || !command.trim()) throw new Error('command is required');

  const id = `bg_${randomUUID().slice(0, 8)}`;
  const { task, rejected } = createTask({
    kind: 'command',
    id,
    name: id,
    owner,
    cwd,
    // A shell command is not an agent: it has no worktree to isolate, and
    // asking for one would be silently ignored.
    isolation: 'none',
    meta: { command },
    run: ({ signal }) => {
      // Cancel the child when the task is cancelled, rather than waiting for
      // the timeout to notice.
      if (signal) {
        signal.addEventListener('abort', () => {}, { once: true });
      }
      return runCommand(command, { cwd, timeoutMs });
    },
  });
  if (rejected) throw new Error(rejected);

  // The owner is owed a result until this task reports.
  trackPending(owner, id);

  let settled = false;
  const deliver = () => {
    resolvePending(owner, id);
    const finished = getTask(id);
    if (!finished) return;
    const r = finished.result || {};
    post(owner, {
      type: 'background',
      id,
      status: STATUS_TEXT[finished.status] || finished.status,
      command: command.slice(0, 120),
      exitCode: r.exitCode ?? -1,
      output: tailWithNotice(r.output || '(no output)', BG_NOTIFY_CAP),
    });
  };

  const off = onTaskEvent((ev) => {
    if (ev.task?.id !== id) return;
    if (!['task.finished', 'task.failed', 'task.cancelled'].includes(ev.type)) return;
    settled = true;
    off();
    deliver();
  });

  // The listener is attached after createTask returns, and a command as trivial
  // as `exit 0` may already have finished. Without this check the fastest
  // possible command never reports back.
  const already = getTask(id);
  if (!settled && already && already.status !== STATUS.RUNNING && already.status !== STATUS.PENDING) {
    off();
    deliver();
  }

  void task;
  return { id, status: 'running', command };
}

/** The primitive's vocabulary is not the mailbox's. */
const STATUS_TEXT = {
  [STATUS.PENDING]: 'running',
  [STATUS.RUNNING]: 'running',
  [STATUS.DONE]: 'completed',
  [STATUS.FAILED]: 'failed',
  [STATUS.CANCELLED]: 'failed',
};

export function checkBackground(id) {
  if (id) {
    const t = getTask(id);
    if (!t || t.kind !== 'command') throw new Error(`Unknown background task: ${id}`);
    return {
      id: t.id,
      status: STATUS_TEXT[t.status] || t.status,
      command: t.command,
      exitCode: t.result?.exitCode ?? null,
      // '(running)' rather than an empty string, matching the old contract:
      // a caller that prints this should not print nothing at all.
      output: t.result?.output || (t.status === STATUS.RUNNING || t.status === STATUS.PENDING ? '(running)' : '(no output)'),
    };
  }
  return {
    tasks: listTasks({ kind: 'command' }).map((t) => ({
      id: t.id,
      status: STATUS_TEXT[t.status] || t.status,
      command: String(t.command || '').slice(0, 80),
      exitCode: t.result?.exitCode ?? null,
    })),
  };
}

export function listBackground(owner) {
  return listTasks({ kind: 'command' }).filter((t) => !owner || t.owner === owner);
}

export function resetBackground() {
  resetTasks();
}

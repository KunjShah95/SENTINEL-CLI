/**
 * Background commands (ported from learn-claude-code s08/s11
 * BackgroundManager): fire-and-forget shell work while the model keeps
 * thinking. Completion is delivered through the owner's mailbox, never
 * polled into history.
 *
 * Unlike the foreground bash tool this is fully async (spawn, not execSync),
 * so a long build does not freeze the event loop — or any teammate.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { post, trackPending, resolvePending } from './mailbox.js';
import { tailWithNotice } from '../shared/tools/truncate.js';
import { killTree } from '../shared/tools/sandbox.js';

export const BG_DEFAULT_TIMEOUT = 5 * 60_000;
export const BG_OUTPUT_CAP = 20_000;
export const BG_NOTIFY_CAP = 2_000;

const tasks = new Map(); // id -> task

/**
 * Run a shell command asynchronously. Resolves { exitCode, output, timedOut };
 * never rejects. Shared with the mini (bash-only) agent.
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

export function startBackground(command, { owner = 'lead', cwd = process.cwd(), timeoutMs = BG_DEFAULT_TIMEOUT } = {}) {
  if (typeof command !== 'string' || !command.trim()) throw new Error('command is required');
  const id = `bg_${randomUUID().slice(0, 8)}`;
  const task = { id, owner, command, cwd, status: 'running', startedAt: Date.now(), exitCode: null, output: '' };
  tasks.set(id, task);
  trackPending(owner, id);
  runCommand(command, { cwd, timeoutMs }).then(({ exitCode, output, timedOut }) => {
    task.status = timedOut ? 'timeout' : exitCode === 0 ? 'completed' : 'failed';
    task.exitCode = exitCode;
    task.output = tailWithNotice(output.trim() || '(no output)', BG_OUTPUT_CAP);
    task.finishedAt = Date.now();
    resolvePending(owner, id);
    post(owner, {
      type: 'background',
      id,
      status: task.status,
      command: command.slice(0, 120),
      exitCode,
      output: tailWithNotice(task.output, BG_NOTIFY_CAP),
    });
  });
  return { id, status: 'running', command };
}

export function checkBackground(id) {
  if (id) {
    const t = tasks.get(id);
    if (!t) throw new Error(`Unknown background task: ${id}`);
    return { id: t.id, status: t.status, command: t.command, exitCode: t.exitCode, output: t.output || '(running)' };
  }
  return {
    tasks: [...tasks.values()].map((t) => ({ id: t.id, status: t.status, command: t.command.slice(0, 80), exitCode: t.exitCode })),
  };
}

export function listBackground(owner) {
  return [...tasks.values()].filter((t) => !owner || t.owner === owner);
}

export function resetBackground() {
  tasks.clear();
}

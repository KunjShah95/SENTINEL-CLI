/**
 * Per-agent working directory.
 *
 * Tools historically resolved everything against process.cwd(), which is
 * process-global — two agents in different git worktrees would stomp on
 * each other. The loop wraps each tool call in runInWorkdir(dir, fn);
 * tools call getWorkdir(). Outside any scope it falls back to process.cwd(),
 * so single-agent behavior is unchanged.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage();

export function getWorkdir() {
  return store.getStore() || process.cwd();
}

export function runInWorkdir(dir, fn) {
  if (!dir) return fn();
  return store.run(dir, fn);
}

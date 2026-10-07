/**
 * Per-file mutation queue (ported from pi-mono coding-agent
 * core/tools/file-mutation-queue.ts).
 *
 * Parallel agents (teammates, background subagents) can target the same
 * file. Mutations on one file run strictly in order; different files still
 * run in parallel. Keyed by resolved real path so ./a and a share a queue.
 */
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

const queues = new Map();

/**
 * Resolve the queue key SYNCHRONOUSLY.
 *
 * This is the whole fix, and the reasoning is worth keeping because the obvious
 * implementation is wrong in a way that only shows under load.
 *
 * The original used `await realpath(...)` before touching the queue map:
 *
 *     const key = await queueKey(filePath);   // <-- suspension point
 *     const prev = queues.get(key) ?? ...;    // <-- acquisition happens AFTER
 *
 * `queues.get` and `queues.set` are atomic with respect to each other, so the map
 * was never racy. The bug was one line earlier: **`await` before acquiring a lock
 * makes acquisition order scheduling order, not call order.** Two concurrent
 * callers both suspend, and whichever's I/O settles first takes the slot —
 * regardless of which was called first. Two mutations of the same file then run
 * CONCURRENTLY, which is the single thing this module exists to prevent.
 *
 * It hid because under light load `realpath` happens to settle in call order.
 * Under parallel load it inverts, and it presented as an ordering assertion
 * failing inside `release:check` while passing 4/4 in isolation.
 *
 * A first attempt fixed it with a synchronous admission ticket and a global
 * FIFO chain. That is correct in isolation and STILL failed in-suite, because
 * key resolution and ticket service are two separate orderings that have to
 * agree. Making the key synchronous removes the second ordering entirely: there
 * is no `await` before acquisition, so call order and acquisition order are the
 * same thing by construction.
 *
 * The cost is real and deliberate: `realpathSync` blocks. It is memoised per
 * path, mutation targets are few, and each call is a few microseconds. Paying
 * that is strictly better than a data race in a lock.
 */
const keyCache = new Map();

function queueKey(filePath) {
  const abs = resolve(filePath);
  const cached = keyCache.get(abs);
  if (cached !== undefined) return cached;

  let key;
  try {
    key = realpathSync(abs);
  } catch (e) {
    // A file being CREATED does not exist yet. Key it on its absolute path so a
    // later create of the same path joins this queue rather than racing it.
    if (e?.code === 'ENOENT' || e?.code === 'ENOTDIR') key = abs;
    else throw e;
  }
  keyCache.set(abs, key);
  return key;
}

/** Test hook: the memo is part of the contract, so its invalidation is too. */
export function clearMutationQueueCache() {
  keyCache.clear();
  queues.clear();
}

export async function withFileMutationQueue(filePath, fn) {
  // Synchronous through to acquisition. Nothing above this line can suspend.
  const key = queueKey(filePath);
  const prev = queues.get(key) ?? Promise.resolve();
  let release;
  const gate = new Promise((r) => { release = r; });
  const chained = prev.then(() => gate);
  queues.set(key, chained);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (queues.get(key) === chained) queues.delete(key);
  }
}

/** Serialize over several files (sorted keys → no lock-order deadlock). */
export async function withFileMutationQueues(filePaths, fn) {
  const keys = [...new Set(filePaths.map(queueKey))].sort();
  const run = (i) => (i >= keys.length ? fn() : withFileMutationQueue(keys[i], () => run(i + 1)));
  return run(0);
}

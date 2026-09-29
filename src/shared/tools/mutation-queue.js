/**
 * Per-file mutation queue (ported from pi-mono coding-agent
 * core/tools/file-mutation-queue.ts).
 *
 * Parallel agents (teammates, background subagents) can target the same
 * file. Mutations on one file run strictly in order; different files still
 * run in parallel. Keyed by resolved real path so ./a and a share a queue.
 */
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';

const queues = new Map();

async function queueKey(filePath) {
  const abs = resolve(filePath);
  try {
    return await realpath(abs);
  } catch (e) {
    if (e?.code === 'ENOENT' || e?.code === 'ENOTDIR') return abs;
    throw e;
  }
}

export async function withFileMutationQueue(filePath, fn) {
  const key = await queueKey(filePath);
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
  const keys = [...new Set(await Promise.all(filePaths.map(queueKey)))].sort();
  const run = (i) => (i >= keys.length ? fn() : withFileMutationQueue(keys[i], () => run(i + 1)));
  return run(0);
}

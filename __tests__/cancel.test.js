/**
 * One cancellation source, reaching every kind of work.
 *
 * The bug this file exists for: the agent loop accepted an `AbortSignal` and
 * passed it to the model stream, and `providers.js` handed it to `fetch`. Tool
 * execution never received it at all — `executeLocalTool` accepted an options
 * object and discarded it. So Ctrl-C stopped the model mid-sentence, the run
 * reported itself as interrupted, and the `bash` tool it had launched one
 * iteration earlier kept running with nobody left reading its output. The user
 * was told the run had stopped while their build was still going.
 *
 * A signal that reaches half the work is worse than no signal, because the
 * caller is lied to. These tests assert it reaches all of it, and that "how it
 * stopped" survives as a distinct value — a Ctrl-C reported as a timeout is a
 * different bug from Ctrl-C being ignored, and only one of them is obvious.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { composeAbort } from '../src/utils/abort.js';
import { runSandboxedAsync } from '../src/shared/tools/sandbox.js';
import { executeLocalTool, Mode } from '../src/shared/tools/index.js';
import { fetchUrl } from '../src/shared/fetch-url.js';

// A command that outlives the test unless something stops it. `node` rather
// than `sleep` so it behaves the same on Windows, where `sleep` is not a thing.
const LONG_RUNNING = 'node -e "setTimeout(()=>{}, 30000)"';

test('composeAbort aborts when the caller does, and says so', () => {
  const outer = new AbortController();
  const composed = composeAbort(outer.signal, 60_000);
  assert.equal(composed.signal.aborted, false);
  outer.abort();
  assert.equal(composed.signal.aborted, true);
  assert.equal(composed.aborted(), true);
  // The deadline did not fire. Conflating the two would report a user's Ctrl-C
  // as a network fault.
  assert.equal(composed.timedOut(), false);
  composed.dispose();
});

test('composeAbort reports a deadline as a timeout, not an abort', async () => {
  const composed = composeAbort(null, 20);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(composed.signal.aborted, true);
  assert.equal(composed.timedOut(), true);
  assert.equal(composed.aborted(), false);
  composed.dispose();
});

test('composeAbort passes through a signal that was already aborted', () => {
  const outer = new AbortController();
  outer.abort();
  const composed = composeAbort(outer.signal, 60_000);
  assert.equal(composed.signal.aborted, true);
  composed.dispose();
});

test('composeAbort.dispose clears the timer so it cannot hold the loop open', async () => {
  // A disposed timer must not fire: every completed request leaves one behind
  // otherwise, and a long turn accumulates one per tool call.
  const composed = composeAbort(null, 20);
  composed.dispose();
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(composed.signal.aborted, false);
});

test('runSandboxedAsync kills the child on abort and reports it as cancelled', async () => {
  const controller = new AbortController();
  const started = Date.now();
  const pending = runSandboxedAsync(LONG_RUNNING, { timeout: 30_000, signal: controller.signal });
  setTimeout(() => controller.abort(), 150);
  const r = await pending;
  const elapsed = Date.now() - started;

  assert.equal(r.aborted, true);
  // 130 is the shell convention for SIGINT. Asserted because it is what the
  // model reads, and a generic failure exit tells it the command misbehaved.
  assert.equal(r.exitCode, 130);
  // Distinct from a timeout, which has its own exit code and its own meaning.
  assert.equal(r.timedOut, false);
  // The point of the test: it stopped when told, not when the 30s timeout hit.
  assert.ok(elapsed < 10_000, `expected an early exit, took ${elapsed}ms`);
});

test('runSandboxedAsync never spawns a command that was already cancelled', async () => {
  const controller = new AbortController();
  controller.abort();
  const r = await runSandboxedAsync('node -e "require(\'fs\').writeFileSync(\'should-not-exist.txt\',\'x\')"', {
    timeout: 30_000,
    signal: controller.signal,
  });
  assert.equal(r.aborted, true);
  assert.equal(r.exitCode, 130);
});

test('a tool refuses to start once its signal is aborted', async () => {
  // The other half of the bug: cancelling between iterations used to be no
  // defence at all, because the check that should have skipped the dispatch did
  // not exist. This one would write a file.
  const dir = await mkdtemp(join(tmpdir(), 'sentinel-cancel-'));
  const cwd = process.cwd();
  process.chdir(dir);
  const controller = new AbortController();
  controller.abort();
  try {
    await assert.rejects(
      () => executeLocalTool('writeFile', { path: 'nope.txt', content: 'x' }, Mode.BUILD, {
        preAuthorized: true,
        signal: controller.signal,
      }),
      /Cancelled before the tool started/,
    );
  } finally {
    process.chdir(cwd);
    await rm(dir, { recursive: true, force: true });
  }
});

test('bash reports cancellation to the caller, mid-tool', async () => {
  const controller = new AbortController();
  const pending = executeLocalTool('bash', { command: LONG_RUNNING, timeout: 30_000 }, Mode.BUILD, {
    preAuthorized: true,
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 150);
  const r = await pending;

  assert.equal(r.cancelled, true);
  assert.equal(r.exitCode, 130);
  // A cancelled command did not run long, so it did not time out either.
  assert.equal(r.timedOut, false);
});

test('an unaborted run is untouched — the signal is optional, not required', async () => {
  // The regression guard for the change itself: passing options through must not
  // have changed what a normal tool call returns.
  const dir = await mkdtemp(join(tmpdir(), 'sentinel-cancel-ok-'));
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    const r = await executeLocalTool('bash', { command: 'echo hello', timeout: 10_000 }, Mode.BUILD, {
      preAuthorized: true,
    });
    assert.match(r.stdout, /hello/);
    assert.equal(r.cancelled, undefined);
  } finally {
    process.chdir(cwd);
    await rm(dir, { recursive: true, force: true });
  }
});

test('fetchUrl honours an aborted signal instead of only its own deadline', async () => {
  // The direct fetch used to build its own `AbortSignal.timeout` and ignore the
  // caller entirely, so a cancelled run left a 20-second HTTP request running.
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => fetchUrl({ url: 'http://127.0.0.1:9/never', signal: controller.signal }),
    /Fetch cancelled/,
  );
});

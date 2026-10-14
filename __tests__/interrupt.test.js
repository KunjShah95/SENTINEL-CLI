/**
 * Ctrl-C, as the user actually causes it.
 *
 * Everything else in run.test.js reaches interruption through an injected `io`,
 * which proves the run cancels but proves nothing about the wiring around it. Two
 * things can be silently wrong there, and only one of them is reachable from a
 * test that does not spawn a process:
 *
 *   1. Is the SIGINT handler registered, and does it produce exit 130 with the
 *      partial usage printed? Emitting the signal inside the process exercises
 *      every line of that, on every platform.
 *   2. Does the operating system deliver a real SIGINT to that handler? Only a
 *      real signal answers this, and only POSIX can be asked from a test.
 *
 * So there are two tests rather than one compromise. No API key and no network:
 * the child runs a fake loop that parks until it is cancelled.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// A file URL, not a path: ESM rejects a bare `C:\...` specifier, and the failure
// is a loader error before any of this code runs.
const RUN_MODULE = pathToFileURL(join(process.cwd(), 'src', 'agent', 'run.js')).href;

/**
 * A child that starts a slow run and, on `selfInterrupt`, cancels itself the way
 * a console Ctrl-C would.
 */
const childSource = `
import { runTask } from ${JSON.stringify(RUN_MODULE)};

async function* slowLoop({ signal }) {
  process.stderr.write('READY\\n');
  yield { event: 'text', data: { delta: 'working' } };
  // Park until cancelled, exactly like a long tool would.
  await new Promise((r) => {
    if (signal.aborted) return r();
    signal.addEventListener('abort', r, { once: true });
  });
  yield { event: 'error', data: { message: 'Interrupted.' } };
  yield { event: 'finish', data: { usage: { inputTokens: 321, outputTokens: 12, totalTokens: 333 }, costUsd: 0.0075, stoppedBy: 'interrupted' } };
  yield { event: 'done', data: {} };
}
// Cancels itself the way a console Ctrl-C would, 50ms after the run is under
  // way. Emitting rather than receiving is what makes this leg portable; the
  // OS-delivery leg below covers the receive side.
setTimeout(() => process.emit('SIGINT'), 50);

const summary = await runTask('slow job', { runTurn: slowLoop });
process.stderr.write('SUMMARY ' + JSON.stringify(summary) + '\\n');
// Drain before exiting. A write to a pipe is asynchronous, and process.exit
// does not wait for it, so on Linux a pending 'working' delta can be discarded
// at the exit — the assertion below would then be testing the scheduler.
await new Promise((r) => process.stdout.write('', r));
await new Promise((r) => process.stderr.write('', r));
process.exit(summary.exitCode);
`;

/** Spawn the self-interrupting child and wait until its run is genuinely live. */
async function runChild() {
  const dir = await mkdtemp(join(tmpdir(), 'sentinel-sigint-'));
  const childPath = join(dir, 'child.mjs');
  await writeFile(childPath, childSource, 'utf8');

  const child = spawn(process.execPath, [childPath], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d.toString(); });
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));

  // Wait for the run to be genuinely under way, so the interrupt lands mid-run
  // rather than during module loading.
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`child never started: ${stderr}`)), 15000);
    const onData = () => {
      if (stderr.includes('READY')) { clearTimeout(timer); child.stderr.off('data', onData); resolve(); }
    };
    child.stderr.on('data', onData);
  });

  return { child, exited, streams: () => ({ stdout, stderr }), cleanup: () => rm(dir, { recursive: true, force: true }) };
}

describe('SIGINT handling', () => {
  test('an interrupt stops the run, reports partial usage, exits 130', async () => {
    const { child, exited, streams, cleanup } = await runChild();
    try {
      const { code } = await exited;
      const { stdout, stderr } = streams();

      // 130 is what a shell means by Ctrl-C, and what a shell checks to decide
      // whether to run a trap. Exiting on the signal instead would leave that
      // to the caller.
      assert.equal(code, 130, `expected exit 130, got ${code}; stderr: ${stderr}`);
      assert.match(stderr, /interrupting/, 'the user is not told the run is stopping');
      // The requirement: an interrupted run still says what it spent.
      assert.match(stderr, /321 in \/ 12 out/);
      const summary = JSON.parse(stderr.match(/SUMMARY (.+)/)[1]);
      assert.equal(summary.stoppedBy, 'interrupted');
      assert.equal(summary.exitCode, 130);
      // Streamed before the interrupt, so the work done is not thrown away.
      assert.match(stdout, /working/);
    } finally {
      if (!child.killed) child.kill('SIGKILL');
      await cleanup();
    }
  });

  /**
   * A platform fact, not a hedge: on Windows `child.kill('SIGINT')` force-
   * terminates the target instead of delivering a catchable signal, so the
   * handler under test never runs. Only a real console Ctrl-C (a CTRL_C_EVENT)
   * reaches a Node handler there, and a test process cannot send one.
   *
   * The child here is deliberately trivial — a bare handler on a `setInterval`,
   * no top-level await, no run. It is testing exactly one fact: that the OS
   * delivers SIGINT to a Node child process. The earlier version drove a real
   * run, which made it depend on that run reaching a stable state before the
   * signal landed; on ubuntu CI it exited 13 (Node's unfinished-top-level-await
   * code) instead, which says the signal arrived before the run had its handler
   * and abort listener in place. One fact, one minimal subject.
   */
  test('the OS delivers SIGINT to a Node child process', {
    skip: process.platform === 'win32'
      ? 'Windows force-terminates on child.kill(SIGINT) instead of delivering it'
      : false,
  }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sentinel-sigint-'));
    const childPath = join(dir, 'plain.mjs');
    await writeFile(childPath, `
process.on('SIGINT', () => {
  process.stderr.write('GOT IT\\n');
  process.exit(42);
});
process.stderr.write('READY\\n');
setInterval(() => {}, 1000);   // hold the event loop open until the signal
`, 'utf8');

    const child = spawn(process.execPath, [childPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));

    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`child never started: ${stderr}`)), 15000);
        const onData = () => {
          if (stderr.includes('READY')) { clearTimeout(timer); child.stderr.off('data', onData); resolve(); }
        };
        child.stderr.on('data', onData);
      });

      child.kill('SIGINT');
      const { code, signal } = await exited;

      // signal must be null: the handler ran and the process chose its own exit
      // code. Being killed by the signal means no handler was installed.
      assert.equal(signal, null, 'the child died by signal rather than running its handler');
      assert.equal(code, 42, `handler did not run; stderr: ${stderr}`);
      assert.match(stderr, /GOT IT/);
    } finally {
      if (!child.killed) child.kill('SIGKILL');
      await rm(dir, { recursive: true, force: true });
    }
  });
});

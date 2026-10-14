/**
 * `sentinel agent run` — the headless consumer of the loop's event stream.
 *
 * Two halves. The first injects `runTurn` and tests only what `run.js` owns:
 * printing, the interrupt handler, the deadline, and what the return value
 * claims about why the run stopped. None of that needs a model.
 *
 * The second drives the real loop through its `createStream` seam to test the
 * two budgets added for this command — turns and tokens — which cannot be
 * tested any other way without spending money.
 *
 * Interruption is reached through the injected `io` rather than a real SIGINT.
 * That is the reason `io` exists: a Ctrl-C cannot be delivered from a test
 * process without killing it, so otherwise the paths that matter most are the
 * paths never exercised.
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runTask, summarizeToolResult, EXIT_INTERRUPTED, EXIT_ERROR } from '../src/agent/run.js';
import { runAgentTurnInner } from '../src/agent/loop.js';
import { resetTotals } from '../src/agent/cost.js';

const MODEL = 'openai/gpt-oss-20b'; // static registry entry: resolves offline

/** A fake terminal: collects output, and lets the test press Ctrl-C. */
function fakeIo() {
  const out = [];
  const err = [];
  let interrupt = null;
  return {
    io: {
      out: (s) => out.push(s),
      err: (s) => err.push(s),
      onInterrupt: (fn) => { interrupt = fn; },
      offInterrupt: () => { interrupt = null; },
    },
    stdout: () => out.join(''),
    stderr: () => err.join(''),
    pressCtrlC: () => {
      assert.ok(interrupt, 'no interrupt handler was registered');
      interrupt();
    },
    get listening() { return interrupt !== null; },
  };
}

/**
 * Resolve when `signal` aborts — including when it already has.
 *
 * The `aborted` check is not optional. A test that presses Ctrl-C from inside
 * the stream aborts before the next line can subscribe, and a listener added to
 * an already-aborted signal never fires. That failure mode is a hang, not an
 * assertion failure, which is why it costs an hour instead of a minute.
 */
function whenAborted(signal) {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    signal.addEventListener('abort', resolve, { once: true });
  });
}

const FINISH = {
  event: 'finish',
  data: {
    usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    costUsd: 0.002,
    model: MODEL,
  },
};

describe('agent run: printing the event stream', () => {
  test('streams text as it arrives and reports usage once', async () => {
    const t = fakeIo();
    async function* runTurn() {
      yield { event: 'text', data: { delta: 'Hel' } };
      yield { event: 'text', data: { delta: 'lo' } };
      yield FINISH;
      yield { event: 'done', data: {} };
    }

    const r = await runTask('say hi', { io: t.io, runTurn, model: MODEL });

    // Delta by delta, not buffered to the end: the whole reason this exists.
    // The trailing newline separates the answer from the cost line.
    assert.equal(t.stdout(), 'Hello\n');
    assert.equal(r.exitCode, 0);
    assert.equal(r.stoppedBy, 'end_turn');
    assert.equal(r.usage.inputTokens, 100);
    assert.equal(r.costUsd, 0.002);
    assert.match(t.stderr(), /100 in \/ 20 out/);
  });

  test('prints tool calls and their results as they happen', async () => {
    const t = fakeIo();
    async function* runTurn() {
      yield { event: 'tool_call', data: { toolName: 'bash', toolCallId: 'c1', input: {} } };
      yield { event: 'tool_result', data: { toolCallId: 'c1', output: { stdout: 'hi', exitCode: 0 } } };
      yield { event: 'text', data: { delta: 'done' } };
      yield FINISH;
    }

    await runTask('run a command', { io: t.io, runTurn, model: MODEL });

    const err = t.stderr();
    assert.match(err, /bash/);
    assert.match(err, /exit 0/);
    // Order matters: the call is printed before the result, or the result reads
    // as the answer to a tool the user has not seen yet.
    assert.ok(err.indexOf('bash') < err.indexOf('exit 0'), 'result printed before its call');
  });

  test('a tool error is shown as an error, not silently dropped', async () => {
    const t = fakeIo();
    async function* runTurn() {
      yield { event: 'tool_call', data: { toolName: 'readFile', toolCallId: 'c1', input: {} } };
      yield { event: 'tool_result', data: { toolCallId: 'c1', error: 'ENOENT: nope.txt' } };
      yield FINISH;
    }
    await runTask('read a file', { io: t.io, runTurn, model: MODEL });
    assert.match(t.stderr(), /ENOENT: nope\.txt/);
  });

  test('an event it does not know is ignored, not fatal', async () => {
    // A consumer that dies on an event it does not recognise cannot be extended.
    const t = fakeIo();
    async function* runTurn() {
      yield { event: 'telemetry', data: { anything: true } };
      yield FINISH;
    }
    const r = await runTask('x', { io: t.io, runTurn, model: MODEL });
    assert.equal(r.exitCode, 0);
  });

  test('no task is a usage error, not a run', async () => {
    const t = fakeIo();
    const r = await runTask('   ', { io: t.io, runTurn: async function* () {} });
    assert.equal(r.exitCode, EXIT_ERROR);
    assert.equal(r.stoppedBy, 'usage');
    assert.match(t.stderr(), /Usage: sentinel agent run/);
  });

  test('forwards the budget options to the loop it drives', async () => {
    const t = fakeIo();
    let seen = null;
    async function* runTurn(opts) {
      seen = opts;
      yield FINISH;
    }
    await runTask('x', {
      io: t.io,
      runTurn,
      model: MODEL,
      mode: 'PLAN',
      maxCostUsd: 2.5,
      maxTurns: 7,
      maxTokens: 900,
    });
    assert.equal(seen.mode, 'PLAN');
    assert.equal(seen.maxCostUsd, 2.5);
    assert.equal(seen.maxTurns, 7);
    assert.equal(seen.maxTokens, 900);
    // The one cancellation source, handed over rather than kept here.
    assert.ok(seen.signal, 'the loop was not given a signal');
  });
});

describe('agent run: one cancellation source', () => {
  test('Ctrl-C stops the run and reports partial usage', async () => {
    const t = fakeIo();
    async function* runTurn({ signal }) {
      yield { event: 'text', data: { delta: 'working' } };
      t.pressCtrlC();
      await whenAborted(signal);
      yield { event: 'error', data: { message: 'Interrupted.', interrupted: true } };
      yield { ...FINISH, data: { ...FINISH.data, stoppedBy: 'interrupted', interrupted: true } };
      yield { event: 'done', data: {} };
    }

    const r = await runTask('long job', { io: t.io, runTurn, model: MODEL });

    assert.equal(r.stoppedBy, 'interrupted');
    // 130 is what a shell reports for Ctrl-C. Anything else tells a script the
    // run succeeded.
    assert.equal(r.exitCode, EXIT_INTERRUPTED);
    // The point of the requirement: an interrupted run still says what it cost.
    assert.equal(r.usage.inputTokens, 100);
    assert.match(t.stderr(), /interrupting/);
    assert.match(t.stdout(), /working/);
  });

  test('the interrupt handler is removed when the run ends', async () => {
    // A listener left on `process` survives the command, fires on the next
    // Ctrl-C in the shell, and aborts a controller for a run that finished long
    // ago. It is also what makes a CLI unusable inside another process.
    const t = fakeIo();
    async function* runTurn() { yield FINISH; }
    await runTask('quick', { io: t.io, runTurn, model: MODEL });
    assert.equal(t.listening, false);
  });

  test('the interrupt handler is removed even when the run throws', async () => {
    const t = fakeIo();
    async function* runTurn() {
      yield { event: 'text', data: { delta: 'x' } };
      throw new Error('provider exploded');
    }
    const r = await runTask('boom', { io: t.io, runTurn, model: MODEL });
    assert.equal(t.listening, false);
    assert.equal(r.exitCode, EXIT_ERROR);
    assert.match(t.stderr(), /provider exploded/);
  });

  test('the time budget aborts the same signal, and says so', async () => {
    const t = fakeIo();
    async function* runTurn({ signal }) {
      yield { event: 'text', data: { delta: 'starting' } };
      await whenAborted(signal);
      yield { event: 'error', data: { message: 'Stopped: time budget of 40ms exceeded.' } };
      yield { ...FINISH, data: { ...FINISH.data, stoppedBy: 'deadline' } };
    }

    const r = await runTask('slow job', { io: t.io, runTurn, model: MODEL, maxTimeMs: 40 });

    // Not `interrupted`: nobody pressed anything. A deadline reported as a
    // Ctrl-C teaches the user that their timer does not work.
    assert.equal(r.stoppedBy, 'deadline');
    assert.equal(r.exitCode, EXIT_ERROR);
  });

  test('a run that ends before the deadline is not marked stopped by it', async () => {
    const t = fakeIo();
    async function* runTurn() {
      yield { event: 'text', data: { delta: 'fast' } };
      yield FINISH;
    }
    const r = await runTask('quick', { io: t.io, runTurn, model: MODEL, maxTimeMs: 60_000 });
    assert.equal(r.stoppedBy, 'end_turn');
    assert.equal(r.exitCode, 0);
  });

  test('a stream that ends without a finish event is not claimed as a clean end', async () => {
    // `end_turn` is a claim about why the agent stopped. Reporting it for a run
    // that vanished mid-stream is how a truncated run reads as a finished one.
    const t = fakeIo();
    async function* runTurn() {
      yield { event: 'text', data: { delta: 'half' } };
    }
    const r = await runTask('cut off', { io: t.io, runTurn, model: MODEL });
    assert.equal(r.stoppedBy, 'error');
    assert.equal(r.exitCode, EXIT_ERROR);
    assert.equal(r.usage, null);
  });
});

describe('summarizeToolResult', () => {
  test('says something useful, or nothing at all', () => {
    assert.equal(summarizeToolResult({ output: { exitCode: 0 } }), 'exit 0');
    assert.equal(summarizeToolResult({ output: { exitCode: 124, timedOut: true } }), 'exit 124 (timed out)');
    assert.equal(summarizeToolResult({ output: { exitCode: 130, cancelled: true } }), 'exit 130 (cancelled)');
    assert.equal(summarizeToolResult({ output: { results: [1, 2, 3] } }), '3 result(s)');
    assert.equal(summarizeToolResult({ error: 'nope' }), '\u2717 nope');
    // No noise: a tool with nothing to report prints nothing.
    assert.equal(summarizeToolResult({ output: {} }), null);
    assert.equal(summarizeToolResult({}), null);
  });

  test('long text is trimmed rather than dumped', () => {
    const line = summarizeToolResult({ output: 'l1\nl2\nl3\nl4' });
    assert.ok(line.length < 120, `not trimmed: ${line}`);
    assert.match(line, /\u2026/);
  });
});

// The budgets themselves, through the real loop.

let workdir;
let previousCwd;
let savedTrajDir;

beforeEach(() => {
  resetTotals();
  previousCwd = process.cwd();
  workdir = mkdtempSync(join(tmpdir(), 'sentinel-run-'));
  process.chdir(workdir);
  writeFileSync(join(workdir, 'target.txt'), 'contents', 'utf8');
  savedTrajDir = process.env.SENTINEL_TRAJECTORY_DIR;
  process.env.SENTINEL_TRAJECTORY_DIR = join(workdir, 'traj');
});

afterEach(() => {
  process.chdir(previousCwd);
  if (savedTrajDir === undefined) delete process.env.SENTINEL_TRAJECTORY_DIR;
  else process.env.SENTINEL_TRAJECTORY_DIR = savedTrajDir;
});

async function collect(gen) {
  const events = [];
  for await (const ev of gen) events.push(ev);
  return events;
}

/**
 * A stream that always asks for a tool call, with a distinct input each time.
 *
 * The distinct input is not decoration: the loop has a doom-loop guard that
 * stops a run calling the same tool with the same arguments, and a test meant to
 * measure the *turn* ceiling would otherwise be measuring the doom guard.
 */
function foreverTooling() {
  let n = 0;
  return async function* () {
    yield {
      type: 'tool_call',
      id: `c${n}`,
      name: 'readFile',
      input: { path: `file-${n++}.txt` },
    };
    yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 20 } };
  };
}

const history = [{ id: 'r1', role: 'user', parts: [{ type: 'text', text: 'go' }] }];

describe('agent run: budget ceilings in the loop', () => {
  test('--max-turns stops the run and names the ceiling', async () => {
    const events = await collect(runAgentTurnInner({
      history,
      mode: 'PLAN',
      model: MODEL,
      maxTurns: 2,
      createStream: foreverTooling(),
    }));

    assert.equal(events.find((e) => e.event === 'finish').data.stoppedBy, 'turns');
    assert.match(events.find((e) => e.event === 'error').data.message, /Stopped after 2 tool iterations/);
  });

  test('the turn ceiling defaults to the mode default, not zero', async () => {
    // `maxTurns: 0` means "unset". Reading it as a ceiling of zero would stop
    // every run before its first turn, which is the failure mode of clamping
    // the wrong end of the range.
    const events = await collect(runAgentTurnInner({
      history,
      mode: 'PLAN',
      model: MODEL,
      maxTurns: 0,
      createStream: async function* () {
        yield { type: 'text', text: 'one turn is enough' };
        yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } };
      },
    }));
    assert.equal(events.find((e) => e.event === 'finish').data.stoppedBy, undefined);
  });

  test('--max-tokens stops the run once the ceiling is reached', async () => {
    const events = await collect(runAgentTurnInner({
      history,
      mode: 'PLAN',
      model: MODEL,
      maxTokens: 150,
      createStream: foreverTooling(),
    }));

    const finish = events.find((e) => e.event === 'finish');
    assert.equal(finish.data.stoppedBy, 'tokens');
    assert.equal(finish.data.budgetExceeded, true);
    assert.match(events.find((e) => e.event === 'error').data.message, /Token budget exceeded/);
  });

  test('an aborted run still reports what it spent', async () => {
    const controller = new AbortController();
    const events = await collect(runAgentTurnInner({
      history,
      mode: 'PLAN',
      model: MODEL,
      signal: controller.signal,
      createStream: async function* () {
        yield { type: 'text', text: 'partial' };
        yield { type: 'usage', usage: { inputTokens: 42, outputTokens: 7 } };
        controller.abort();
      },
    }));

    const finish = events.find((e) => e.event === 'finish');
    assert.equal(finish.data.stoppedBy, 'interrupted');
    assert.equal(finish.data.usage.inputTokens, 42);
    assert.equal(finish.data.usage.outputTokens, 7);
  });

  test('a deadline and a Ctrl-C are reported differently', async () => {
    const { DeadlineExceeded } = await import('../src/utils/abort.js');
    const events = await collect(runAgentTurnInner({
      history,
      mode: 'PLAN',
      model: MODEL,
      signal: AbortSignal.abort(new DeadlineExceeded(5000)),
      createStream: async function* () { yield { type: 'text', text: 'x' }; },
    }));
    assert.equal(events.find((e) => e.event === 'finish').data.stoppedBy, 'deadline');
  });

  test('wide-open budgets still do not grant a write in PLAN mode', async () => {
    // The regression guard for adding budget knobs: a ceiling must not become a
    // licence. The model asks for a write and the file is absent.
    await collect(runAgentTurnInner({
      history,
      mode: 'PLAN',
      model: MODEL,
      maxTurns: 3,
      maxTokens: 100_000,
      maxCostUsd: 100,
      createStream: async function* () {
        yield { type: 'tool_call', id: 'w1', name: 'writeFile', input: { path: 'evil.txt', content: 'x' } };
        yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } };
      },
    }));
    assert.equal(existsSync(join(workdir, 'evil.txt')), false);
  });
});

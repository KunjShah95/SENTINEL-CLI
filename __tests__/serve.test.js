/**
 * The second consumer.
 *
 * The claim under test is not "the HTTP server works". It is that `startRun` is
 * an interface rather than a refactor that suited one caller. The way to check
 * that is to write the second caller and see whether anything had to be added
 * underneath it — and the assertion that matters most is the last one in this
 * file, where the CLI and the server are driven through the same fake loop and
 * are required to produce identical event streams.
 *
 * No network and no model: `startRun` is injected, and each server binds port 0.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createAgentServer, sseFrame, isLoopback, DEFAULT_HOST } from '../src/agent/serve.js';
import { startRun, EXIT_INTERRUPTED } from '../src/agent/run.js';

const FINISH = {
  event: 'finish',
  data: { usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 }, costUsd: 0.002, model: 'test/model' },
};

/**
 * A fake loop. An element that is a function is awaited, which is how a test
 * parks the run until something cancels it.
 */
function fakeLoop(script) {
  return async function* runTurn({ signal }) {
    for (const ev of script) {
      if (typeof ev === 'function') await ev(signal);
      else yield ev;
    }
  };
}

/** Wait for the run's cancellation signal. */
const untilAborted = (signal) => new Promise((resolve) => {
  if (signal.aborted) return resolve();
  signal.addEventListener('abort', resolve, { once: true });
});

/**
 * A server whose runs use `script`.
 *
 * The script is closed over rather than sent in the request body, because
 * `pickRunOpts` filters a request down to a whitelist of run knobs — an HTTP
 * caller does not get to inject arbitrary loop options. That is the behaviour
 * under test elsewhere; routing around it here would test the wrong thing.
 */
async function withServer(script, fn) {
  let captured = null;
  const server = createAgentServer({
    startRun: (task, opts) => {
      captured = opts;
      return startRun(task, { ...opts, runTurn: fakeLoop(script) });
    },
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(url, () => captured);
  } finally {
    server.close();
  }
}

const start = (url, body) => fetch(`${url}/runs`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/** Read an SSE response into frames, resolving when the server closes it. */
async function readFrames(res) {
  const frames = [];
  let buf = '';
  for await (const chunk of res.body) {
    buf += Buffer.from(chunk).toString('utf8');
    let i;
    while ((i = buf.indexOf('\n\n')) !== -1) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const frame = {};
      for (const line of raw.split('\n')) {
        const k = line.slice(0, line.indexOf(':'));
        const v = line.slice(line.indexOf(':') + 1).trim();
        if (k === 'event') frame.name = v;
        if (k === 'data') frame.data = JSON.parse(v);
      }
      frames.push(frame);
    }
  }
  return frames;
}

describe('agent serve: run lifecycle over HTTP', () => {
  test('starts a run and streams its events, then a summary', async () => {
    await withServer([
      { event: 'text', data: { delta: 'Hel' } },
      { event: 'text', data: { delta: 'lo' } },
      FINISH,
    ], async (url) => {
      const started = await start(url, { task: 'say hi' });
      assert.equal(started.status, 202);
      const { runId } = await started.json();
      assert.ok(runId);

      const frames = await readFrames(await fetch(`${url}/runs/${runId}/events`));
      assert.deepEqual(frames.map((f) => f.name), ['text', 'text', 'finish', 'summary']);
      // Deltas arrive separately, so a client can render as it goes.
      assert.equal(frames[0].data.delta, 'Hel');
      assert.equal(frames[1].data.delta, 'lo');
      assert.equal(frames.at(-1).data.stoppedBy, 'end_turn');
      assert.equal(frames.at(-1).data.exitCode, 0);
    });
  });

  test('a client that connects late still gets the whole run', async () => {
    await withServer([
      { event: 'text', data: { delta: 'first' } },
      FINISH,
    ], async (url) => {
      const { runId } = await (await start(url, { task: 'late' })).json();
      await new Promise((r) => setTimeout(r, 60)); // let it finish first

      // Replay is what makes this consumer equivalent to the terminal. Without
      // it the summary arrives with no run attached to it.
      const frames = await readFrames(await fetch(`${url}/runs/${runId}/events`));
      assert.deepEqual(frames.map((f) => f.name), ['text', 'finish', 'summary']);
      assert.equal(frames[0].data.delta, 'first');
    });
  });

  test('cancel stops the run through the same signal Ctrl-C uses', async () => {
    let sawAbort = false;
    await withServer([
      { event: 'text', data: { delta: 'working' } },
      async (signal) => { await untilAborted(signal); sawAbort = true; },
      { event: 'error', data: { message: 'Interrupted.' } },
      { ...FINISH, data: { ...FINISH.data, stoppedBy: 'interrupted' } },
    ], async (url) => {
      const { runId } = await (await start(url, { task: 'long job' })).json();

      const cancelled = await fetch(`${url}/runs/${runId}/cancel`, { method: 'POST' });
      assert.equal(cancelled.status, 202);

      const frames = await readFrames(await fetch(`${url}/runs/${runId}/events`));
      assert.equal(sawAbort, true, 'the loop was never aborted');
      assert.equal(frames.at(-1).data.stoppedBy, 'interrupted');
      // 130, because the shell means 130 by Ctrl-C and this is the same stop.
      assert.equal(frames.at(-1).data.exitCode, EXIT_INTERRUPTED);
    });
  });

  test('a time budget from the request stops the run with nobody cancelling', async () => {
    await withServer([
      { event: 'text', data: { delta: 'starting' } },
      (signal) => untilAborted(signal),
      { ...FINISH, data: { ...FINISH.data, stoppedBy: 'deadline' } },
    ], async (url) => {
      const { runId } = await (await start(url, { task: 'slow', maxTimeMs: 40 })).json();
      const frames = await readFrames(await fetch(`${url}/runs/${runId}/events`));
      assert.equal(frames.at(-1).data.stoppedBy, 'deadline');
      // Non-zero: a CI job must not read a green build from a run that timed out.
      assert.equal(frames.at(-1).data.exitCode, 1);
    });
  });

  test('budgets from the request reach the run', async () => {
    await withServer([FINISH], async (url, captured) => {
      await start(url, { task: 'x', maxTurns: 3, maxTokens: 500, mode: 'PLAN', model: 'm/x', runTurn: 'nope' });
      const opts = captured();
      assert.equal(opts.maxTurns, 3);
      assert.equal(opts.maxTokens, 500);
      assert.equal(opts.mode, 'PLAN');
      assert.equal(opts.model, 'm/x');
    });
  });

  test('a request cannot inject arbitrary loop options', async () => {
    // The whitelist is a security property, not tidiness: `runTurn` and
    // `onPermissionRequest` are how a caller gets code executed.
    await withServer([FINISH], async (url, captured) => {
      await start(url, { task: 'x', runTurn: 'evil', onPermissionRequest: 'evil', agentName: 'evil' });
      const opts = captured();
      // None of them survive. The only key the server adds is `onEvent`.
      assert.equal(opts.runTurn, undefined);
      assert.equal(opts.onPermissionRequest, undefined);
      assert.equal(opts.agentName, undefined);
      assert.equal(typeof opts.onEvent, 'function');
    });
  });

  test('a missing task is a 400, not a run that fails later', async () => {
    await withServer([FINISH], async (url) => {
      assert.equal((await start(url, { task: '   ' })).status, 400);
      assert.equal((await start(url, {})).status, 400);
    });
  });

  test('unknown runs and routes are 404', async () => {
    await withServer([FINISH], async (url) => {
      assert.equal((await fetch(`${url}/runs/nope/events`)).status, 404);
      assert.equal((await fetch(`${url}/runs/nope`)).status, 404);
      assert.equal((await fetch(`${url}/nothing`)).status, 404);
    });
  });

  test('cancelling a finished run is a conflict, not a second stop', async () => {
    await withServer([FINISH], async (url) => {
      const { runId } = await (await start(url, { task: 'quick' })).json();
      await new Promise((r) => setTimeout(r, 60));
      const res = await fetch(`${url}/runs/${runId}/cancel`, { method: 'POST' });
      assert.equal(res.status, 409);
      assert.equal((await res.json()).stoppedBy, 'end_turn');
    });
  });

  test('run status is readable while running', async () => {
    await withServer([
      { event: 'text', data: { delta: 'x' } },
      (signal) => untilAborted(signal),
      FINISH,
    ], async (url) => {
      const { runId } = await (await start(url, { task: 'slow', maxTimeMs: 5000 })).json();
      const mid = await (await fetch(`${url}/runs/${runId}`)).json();
      assert.equal(mid.status, 'running');
      assert.ok(mid.events >= 1);
      await fetch(`${url}/runs/${runId}/cancel`, { method: 'POST' }); // let it go
    });
  });
});

describe('agent serve: shape and safety', () => {
  test('a frame carries the event name twice', () => {
    const f = sseFrame({ event: 'text' }, { delta: 'hi' });
    assert.match(f, /^event: text\n/);
    // A browser client wants `event:`; someone reading a log wants the JSON.
    assert.equal(JSON.parse(f.split('data: ')[1]).delta, 'hi');
    assert.ok(f.endsWith('\n\n'));
  });

  test('it defaults to loopback, and knows which hosts are loopback', () => {
    assert.equal(DEFAULT_HOST, '127.0.0.1');
    assert.equal(isLoopback('127.0.0.1'), true);
    assert.equal(isLoopback('::1'), true);
    assert.equal(isLoopback('0.0.0.0'), false);
    assert.equal(isLoopback('10.0.0.5'), false);
  });

  test('a consumer that throws does not take the run down', async () => {
    // The isolation boundary between two consumers: a broken SSE client must
    // not kill the agent it is watching.
    const run = startRun('x', {
      runTurn: fakeLoop([{ event: 'text', data: { delta: 'a' } }, FINISH]),
      onEvent: () => { throw new Error('socket exploded'); },
    });
    const summary = await run.done;
    assert.equal(summary.exitCode, 0);
    assert.equal(summary.text, 'a');
  });
});

describe('the claim: both consumers see the same run', () => {
  test('the CLI and the server observe an identical event stream', async () => {
    // The test the whole split exists for. Same script, same injected loop, two
    // front-ends. If this diverges, the "one primitive" story is false — and the
    // fix is to move whatever differs down into startRun, not to patch either
    // consumer to match the other.
    const script = [
      { event: 'text', data: { delta: 'Hel' } },
      { event: 'tool_call', data: { toolName: 'bash', toolCallId: 'c1', input: {} } },
      { event: 'tool_result', data: { toolCallId: 'c1', output: { exitCode: 0 } } },
      { event: 'text', data: { delta: 'lo' } },
      FINISH,
    ];

    const viaCli = [];
    const cliSummary = await startRun('task', {
      runTurn: fakeLoop(script),
      onEvent: (ev) => viaCli.push(ev),
    }).done;

    await withServer(script, async (url) => {
      const { runId } = await (await start(url, { task: 'task' })).json();
      const frames = await readFrames(await fetch(`${url}/runs/${runId}/events`));

      // Identical, minus the `summary` frame the server appends at the end.
      const carried = frames.filter((f) => f.name !== 'summary').map((f) => f.data);
      assert.deepEqual(carried, viaCli.map((e) => ({ event: e.event, ...e.data })));
      assert.equal(frames.at(-1).data.stoppedBy, cliSummary.stoppedBy);
      assert.deepEqual(frames.find((f) => f.name === 'finish').data.usage, cliSummary.usage);
    });
  });
});

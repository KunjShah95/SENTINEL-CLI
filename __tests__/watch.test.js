/**
 * The standing FDE — triggers, backoff, and the steering queue.
 * No clock, no model, no shell: everything is injected.
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  checkTriggers, nextDelay, shouldStop, createWatchState, readWatchState, writeWatchState,
  steer, drainSteering, pendingSteering, buildTask, runWatcher, steerFile, stateFile,
  MAX_UNPRODUCTIVE, MAX_BACKOFF_MS, WATCH_VERSION, STEER_PATH,
} from '../src/agent/watch.js';
import { parseTrigger, parseTriggers } from '../src/agent/watch-cli.js';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sentinel-watch-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const ok = () => ({ exitCode: 0 });
const fail = (exitCode = 1) => ({ exitCode });
const NOW = 1_700_000_000_000;
/** A trigger that fires on every check, so multi-tick loops terminate. */
const ALWAY = [{ type: 'command', command: 'false', when: 'always' }];

describe('parseTrigger', () => {
  test('every documented form', () => {
    assert.deepEqual(parseTrigger('interval:300000'), { type: 'interval', everyMs: 300000 });
    assert.deepEqual(parseTrigger('command:npm test'), { type: 'command', command: 'npm test', when: 'fail' });
    assert.deepEqual(parseTrigger('file:src/api.js'), { type: 'file', path: 'src/api.js' });
    assert.deepEqual(parseTrigger('git'), { type: 'git' });
    assert.deepEqual(parseTrigger('once'), { type: 'once' });
  });

  test('a trigger command may contain colons', () => {
    const t = parseTrigger('command:curl https://x.test/health');
    assert.equal(t.command, 'curl https://x.test/health');
  });

  test('--when always inverts the meaning', () => {
    assert.equal(parseTrigger('command:git status --porcelain --when always').when, 'always');
    assert.equal(parseTrigger('command:git status --porcelain --when fail').when, 'fail');
  });

  test('bad input fails loudly rather than becoming a never-firing trigger', () => {
    assert.throws(() => parseTrigger('interval'), /duration in ms/);
    assert.throws(() => parseTrigger('interval:10'), /at least 1000/);
    assert.throws(() => parseTrigger('nonsense'), /unknown trigger/);
    assert.throws(() => parseTrigger('file:'), /needs a path/);
    assert.throws(() => parseTrigger(''), /empty trigger/);
    assert.throws(() => parseTriggers([]), /at least one/);
  });
});

describe('checkTriggers', () => {
  test('interval fires only once the interval has elapsed', () => {
    const t = [{ type: 'interval', everyMs: 60_000 }];
    assert.equal(checkTriggers(t, { now: NOW, lastTickAt: NOW - 10_000, run: ok }).fired.length, 0);
    assert.deepEqual(checkTriggers(t, { now: NOW, lastTickAt: NOW - 90_000, run: ok }).fired, ['interval']);
  });

  test('interval fires when there has never been a tick', () => {
    assert.deepEqual(checkTriggers([{ type: 'interval', everyMs: 60_000 }], { now: NOW, run: ok }).fired, ['interval']);
  });

  test('a command trigger fires when the command FAILS', () => {
    const t = [{ type: 'command', command: 'npm test' }];
    assert.equal(checkTriggers(t, { now: NOW, run: fail }).fired.length, 1);
    assert.equal(checkTriggers(t, { now: NOW, run: ok }).fired.length, 0, 'green is not a reason to wake up');
  });

  test('--when always fires regardless', () => {
    const t = [{ type: 'command', command: 'git status', when: 'always' }];
    assert.equal(checkTriggers(t, { now: NOW, run: ok }).fired.length, 1);
  });

  test('a file trigger fires when the mtime moves', () => {
    writeFileSync(join(dir, 'watched.txt'), 'x');
    const t = [{ type: 'file', path: 'watched.txt' }];
    const first = checkTriggers(t, { now: NOW, cwd: dir, fileMtimes: {}, run: ok });
    assert.deepEqual(first.fired, ['file']);
    const seen = { 'watched.txt': first.results.file.mtime };
    assert.equal(checkTriggers(t, { now: NOW, cwd: dir, fileMtimes: seen, run: ok }).fired.length, 0, 'unchanged is quiet');
  });

  test('a file trigger on a missing file is quiet, not a crash', () => {
    assert.deepEqual(checkTriggers([{ type: 'file', path: 'nope.txt' }], { now: NOW, cwd: dir, run: ok }).fired, []);
  });

  test('git fires only when HEAD actually moved', () => {
    const t = [{ type: 'git' }];
    // Outside a repo headSha is null, so it stays quiet rather than firing
    // on every tick and pretending the world changed.
    assert.deepEqual(checkTriggers(t, { now: NOW, cwd: dir, lastGitSha: 'abc', run: ok }).fired, []);
  });

  test('several triggers can fire together', () => {
    const t = [{ type: 'interval', everyMs: 1000 }, { type: 'command', command: 'x' }];
    const r = checkTriggers(t, { now: NOW, run: fail });
    assert.equal(r.fired.length, 2);
  });

  test('a malformed trigger is ignored rather than crashing the loop', () => {
    assert.deepEqual(checkTriggers([null, { type: 'nope' }, {}], { now: NOW, run: ok }).fired, []);
  });
});

describe('backoff', () => {
  test('grows exponentially and is capped', () => {
    assert.equal(nextDelay(0, 1000), 1000);
    assert.equal(nextDelay(1, 1000), 1000);
    assert.equal(nextDelay(2, 1000), 2000);
    assert.equal(nextDelay(3, 1000), 4000);
    assert.equal(nextDelay(50, 1000), MAX_BACKOFF_MS, 'a failing loop must not hammer an API all afternoon');
  });

  test('the loop gives up rather than retrying forever', () => {
    const s = createWatchState();
    assert.equal(shouldStop(s), null);
    s.consecutiveUnproductive = MAX_UNPRODUCTIVE - 1;
    assert.equal(shouldStop(s), null);
    s.consecutiveUnproductive = MAX_UNPRODUCTIVE;
    assert.equal(shouldStop(s), 'no-progress');
  });

  test('maxTicks is an explicit ceiling', () => {
    assert.equal(shouldStop({ ticks: 3 }, { maxTicks: 3 }), 'max-ticks');
    assert.equal(shouldStop({ ticks: 3 }, { maxTicks: 0 }), null);
  });
});

describe('state persistence', () => {
  test('round-trips', () => {
    const s = { ...createWatchState(), ticks: 4, consecutiveUnproductive: 2, lastTickAt: '2026-01-01T00:00:00.000Z' };
    writeWatchState(s, dir);
    const back = readWatchState(dir);
    assert.equal(back.ticks, 4);
    assert.equal(back.consecutiveUnproductive, 2);
    assert.equal(back.version, WATCH_VERSION);
  });

  test('a missing or corrupt state file yields a fresh state', () => {
    assert.equal(readWatchState(dir).ticks, 0);
    mkdirSync(join(dir, '.sentinel'), { recursive: true });
    writeFileSync(stateFile(dir), '{ nope', 'utf-8');
    assert.equal(readWatchState(dir).ticks, 0);
  });
});

describe('steering (#16)', () => {
  test('queues from a "different terminal" and drains once', () => {
    steer('also check the retries', dir);
    steer('skip the flaky test', dir);
    assert.equal(pendingSteering(dir), 2);
    const got = drainSteering(dir);
    assert.deepEqual(got.map((g) => g.text), ['also check the retries', 'skip the flaky test']);
    assert.equal(pendingSteering(dir), 0, 'draining must clear, or instructions repeat forever');
  });

  test('a torn final line is expected after a crash', () => {
    steer('good one', dir);
    writeFileSync(steerFile(dir), readFileSync(steerFile(dir), 'utf-8') + '{"text":"trunc');
    const got = drainSteering(dir);
    assert.deepEqual(got.map((g) => g.text), ['good one']);
  });

  test('empty steering is rejected', () => {
    assert.throws(() => steer('   ', dir), /required/);
  });

  test('steering becomes a priority instruction on the task', () => {
    const t = buildTask('fix the flaky test', [{ text: 'focus on retries' }]);
    assert.match(t, /fix the flaky test/);
    assert.match(t, /take priority over the task above/);
    assert.match(t, /1\. focus on retries/);
  });

  test('no steering means the task is untouched', () => {
    assert.equal(buildTask('fix it', []), 'fix it');
  });
});

describe('runWatcher', () => {
  const once = (events = [{ event: 'text', data: { delta: 'done' } }]) => {
    const gen = async function* () { yield* events; };
    return { runTurn: () => gen(), events };
  };

  test('refuses to start without a task or a loop', async () => {
    const { runTurn } = once();
    await assert.rejects(() => runWatcher({ task: '', runTurn }), /needs a task/);
    await assert.rejects(() => runWatcher({ task: 'x' }), /runTurn/);
  });

  test('runs exactly maxTicks times and reports why it stopped', async () => {
    let turns = 0;
    const runTurn = () => (async function* () { turns++; yield { event: 'text', data: { delta: 'nothing changed' } }; })();
    const res = await runWatcher({
      task: 'keep it green',
      triggers: ALWAY,
      runTurn,
      maxTicks: 3,
      baseDelayMs: 1,
      cwd: dir,
    });
    assert.equal(turns, 3);
    assert.equal(res.reason, 'max-ticks');
    assert.equal(res.ticks.length, 3);
  });

  test('fires once on start, then goes quiet until a trigger fires', async () => {
    let turns = 0;
    const runTurn = () => (async function* () { turns++; yield { event: 'text', data: { delta: 'Fixed it.' } }; })();
    const ac = new AbortController();
    const res = await runWatcher({
      task: 'x',
      triggers: [{ type: 'interval', everyMs: 3_600_000 }],
      runTurn,
      baseDelayMs: 5,
      cwd: dir,
      signal: ac.signal,
      // Abort on the first idle poll so the test terminates.
      onEvent: (e) => { if (e.type === 'idle') ac.abort(); },
    });
    // A watcher that idles for an hour before doing anything is not useful,
    // so the first tick always runs. After that, silence costs nothing.
    assert.equal(turns, 1, 'one tick on start, then nothing until a trigger fires');
    assert.equal(res.reason, 'aborted');
  });

  test('a loop that never progresses backs off and gives up', async () => {
    const runTurn = () => (async function* () { yield { event: 'text', data: { delta: 'I looked at it.' } }; })();
    const res = await runWatcher({
      task: 'x',
      triggers: ALWAY,
      runTurn,
      maxUnproductive: 3,
      baseDelayMs: 1,
      cwd: dir,
    });
    assert.equal(res.reason, 'no-progress');
    assert.equal(res.state.consecutiveUnproductive, 3);
    assert.ok(res.ticks.every((t) => !t.progressed), 'reading files is not progress');
  });

  test('stating a fix counts as progress and resets the backoff', async () => {
    let i = 0;
    const runTurn = () => (async function* () {
      yield { event: 'text', data: { delta: i++ === 0 ? 'I looked at it.' : 'Fixed the retry and added a test.' } };
    })();
    const res = await runWatcher({
      task: 'x',
      triggers: ALWAY,
      runTurn,
      maxTicks: 2,
      maxUnproductive: 5,
      baseDelayMs: 1,
      cwd: dir,
    });
    assert.equal(res.reason, 'max-ticks');
    assert.deepEqual(res.ticks.map((t) => t.progressed), [false, true]);
    assert.equal(res.state.consecutiveUnproductive, 0, 'progress resets the backoff');
  });

  test('a met goal counts as progress', async () => {
    const runTurn = () => (async function* () {
      yield { event: 'goal', data: { ok: true, reason: 'tests pass' } };
      yield { event: 'text', data: { delta: 'ok' } };
    })();
    const res = await runWatcher({
      task: 'x', triggers: ALWAY, runTurn, maxTicks: 1, baseDelayMs: 1, cwd: dir, goal: 'npm test exits 0',
    });
    assert.equal(res.ticks[0].progressed, true);
  });

  test('queued steering is folded into the next tick', async () => {
    steer('check the retry path', dir);
    const seen = [];
    const runTurn = (opts) => {
      seen.push(opts.history[0].parts[0].text);
      return (async function* () { yield { event: 'text', data: { delta: 'Fixed the retry.' } }; })();
    };
    const res = await runWatcher({
      task: 'keep it green', triggers: ALWAY, runTurn, maxTicks: 1, baseDelayMs: 1, cwd: dir,
    });
    assert.match(seen[0], /check the retry path/);
    assert.deepEqual(res.ticks[0].steering, ['check the retry path']);
  });

  test('a thrown turn is recorded, not fatal', async () => {
    const runTurn = () => (async function* () {
      yield Promise.reject(new Error('provider exploded'));
    })();
    const res = await runWatcher({
      task: 'x', triggers: ALWAY, runTurn, maxTicks: 1, baseDelayMs: 1, cwd: dir,
    });
    assert.equal(res.ticks[0].error, 'provider exploded');
    assert.equal(res.reason, 'max-ticks', 'one bad turn must not end the watch');
  });

  test('an exhausted engagement budget stops the loop before any model call', async () => {
    const { writeBudget, recordSpend } = await import('../src/agent/budget.js');
    writeBudget({ budgetUsd: 1, startedAt: new Date(Date.now() - 1000).toISOString() }, dir);
    recordSpend({ usd: 9, model: 'm' }, dir);
    let turns = 0;
    const runTurn = () => (async function* () { turns++; yield { event: 'text', data: { delta: 'should not run' } }; })();
    const res = await runWatcher({
      task: 'x', triggers: ALWAY, runTurn, cwd: dir,
    });
    assert.equal(turns, 0, 'a standing loop must check its ceiling before spending');
    assert.equal(res.reason, 'budget');
  });

  test('an abort mid-run ends it promptly', async () => {
    const ac = new AbortController();
    const runTurn = () => (async function* () {
      yield { event: 'text', data: { delta: 'working' } };
      ac.abort();
    })();
    const res = await runWatcher({
      task: 'x', triggers: [{ type: 'once' }], runTurn, baseDelayMs: 1, cwd: dir, signal: ac.signal,
    });
    assert.equal(res.reason, 'aborted');
  });

  test('the steering file lives under .sentinel so it is gitignored', () => {
    assert.equal(STEER_PATH, '.sentinel/steer.jsonl');
    assert.equal(steerFile(dir), join(dir, '.sentinel', 'steer.jsonl'));
  });
});

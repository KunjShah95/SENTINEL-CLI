/**
 * features — second wave: async shell, doom-loop + budget guards, steering,
 * teammate merge-back, and the best-of-N race. Mock provider, temp git
 * repos, no key, no network.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runAgentTurnInner, doomLoopCheck, runningCostUsd, DOOM_STOP } from '../src/agent/loop.js';
import { runSandboxedAsync } from '../src/shared/tools/sandbox.js';
import { resetTotals } from '../src/agent/cost.js';
import { resetMailboxes, post } from '../src/agent/mailbox.js';
import { resetBackground } from '../src/agent/background.js';
import { resetTeam, mergeTeammate } from '../src/agent/team.js';
import { rankCandidates, runRace } from '../src/agent/race.js';
import { executeLocalTool, normalizeTimeoutMs } from '../src/shared/tools/index.js';

const MODEL = 'openai/gpt-oss-20b';
const user = (text) => [{ id: `u${Date.now()}`, role: 'user', parts: [{ type: 'text', text }] }];
let seq = 0;
const tool = (name, input) => ({ type: 'tool_call', id: `tc${seq++}`, name, input });
const text = (t) => ({ type: 'text', text: t });

function mockProvider(route) {
  const calls = [];
  const createStream = async function* (opts) {
    const call = { ...opts, index: calls.length };
    calls.push(call);
    yield* route(call, calls);
  };
  return { createStream, calls };
}

async function run(opts) {
  const events = [];
  for await (const ev of runAgentTurnInner({ model: MODEL, trajectory: false, ...opts })) events.push(ev);
  return events;
}

const lastUserText = (call) => {
  const m = [...call.messages].reverse().find((x) => x.role === 'user');
  return typeof m?.content === 'string' ? m.content : '';
};
const firstUserText = (call) => String(call.messages[0]?.content || '');

function gitRepo(dir) {
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    writeFileSync(join(dir, 'value.txt'), 'old\n');
    execFileSync('git', ['add', '.'], { cwd: dir });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init'], { cwd: dir });
    return true;
  } catch {
    return false;
  }
}

let dir;
let prevCwd;

/** value.txt without CRs (git autocrlf may convert on checkout/apply). */
const readValue = () => readFileSync(join(dir, 'value.txt'), 'utf8').replace(/\r/g, '');

beforeEach(() => {
  resetTotals();
  resetMailboxes();
  resetBackground();
  resetTeam();
  prevCwd = process.cwd();
  dir = mkdtempSync(join(tmpdir(), 'sentinel-feat-'));
  process.chdir(dir);
});

afterEach(() => {
  process.chdir(prevCwd);
});

describe('async shell', () => {
  it('bash no longer blocks the event loop', async () => {
    let ticks = 0;
    const timer = setInterval(() => { ticks++; }, 20);
    const r = await executeLocalTool('bash', { command: 'node -e "setTimeout(()=>console.log(\'slept\'),300)"' }, 'BUILD', { preAuthorized: true });
    clearInterval(timer);
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /slept/);
    assert.ok(ticks >= 5, `event loop ticked only ${ticks} times during the command`);
  });

  it('timeouts under 1000 are seconds (models send `timeout: 60`)', async () => {
    assert.equal(normalizeTimeoutMs(60, 1), 60_000);
    assert.equal(normalizeTimeoutMs(120_000, 1), 120_000);
    assert.equal(normalizeTimeoutMs(undefined, 5), 5);
    assert.equal(normalizeTimeoutMs(1e9, 1), 30 * 60_000);
    const r = await executeLocalTool('runTests', { command: 'node -e "setTimeout(()=>{},300)"', timeout: 60 }, 'BUILD', { preAuthorized: true });
    assert.equal(r.timedOut, false, 'a 300ms command survives timeout: 60');
    assert.equal(r.exitCode, 0);
  });

  it('captures stderr and non-zero exit codes; enforces timeouts', async () => {
    const r = await runSandboxedAsync('node -e "console.error(\'boom\'); process.exit(4)"', { cwd: dir });
    assert.equal(r.exitCode, 4);
    assert.match(r.stderr, /boom/);
    const t = await runSandboxedAsync('node -e "setTimeout(()=>{}, 10000)"', { cwd: dir, timeout: 200 });
    assert.equal(t.timedOut, true);
    assert.notEqual(t.exitCode, 0);
  });
});

describe('guards', () => {
  it('doomLoopCheck warns at 3 identical calls and stops at 5', () => {
    const counts = new Map();
    const call = [{ name: 'readFile', input: { path: 'a' } }];
    assert.deepEqual(doomLoopCheck(counts, call), {});
    doomLoopCheck(counts, call);
    assert.match(doomLoopCheck(counts, call).hint, /3 times/);
    doomLoopCheck(counts, call);
    assert.equal(doomLoopCheck(counts, call).stop, true);
    assert.deepEqual(doomLoopCheck(new Map(), [{ name: 'readFile', input: { path: 'b' } }]), {});
  });

  it('a looping model is stopped instead of burning all iterations', async () => {
    writeFileSync(join(dir, 'a.txt'), 'x');
    const { createStream, calls } = mockProvider(() => [tool('readFile', { path: 'a.txt' })]);
    const ev = await run({ history: user('x'), mode: 'PLAN', createStream });
    assert.equal(calls.length, DOOM_STOP);
    assert.match(ev.find((e) => e.event === 'error').data.message, /Doom loop/);
    assert.equal(ev.find((e) => e.event === 'finish').data.doomLoop, true);
    assert.ok(calls[3].messages.some((m) => m.role === 'user' && /Doom-loop guard/.test(m.content)));
  });

  it('budget guard ends the turn once cost crosses maxCostUsd', async () => {
    const perCall = runningCostUsd(MODEL, 1_000_000, 1_000_000);
    if (!(perCall > 0)) return; // model has no registry price: nothing to enforce
    const { createStream, calls } = mockProvider(() => [
      tool('listDirectory', { path: `.${'/'.repeat(calls.length % 3)}` }),
      { type: 'usage', usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 } },
    ]);
    const ev = await run({ history: user('x'), mode: 'PLAN', createStream, maxCostUsd: perCall * 1.5 });
    assert.equal(calls.length, 2);
    assert.match(ev.find((e) => e.event === 'error').data.message, /Budget exceeded/);
    assert.equal(ev.find((e) => e.event === 'finish').data.budgetExceeded, true);
  });
});

describe('steering', () => {
  it('a message posted mid-turn is injected before the next model call', async () => {
    writeFileSync(join(dir, 'a.txt'), 'x');
    const { createStream, calls } = mockProvider((c) => {
      if (c.index === 0) {
        post('lead', { type: 'message', from: 'user', text: 'actually, use b.txt' });
        return [tool('readFile', { path: 'a.txt' })];
      }
      return [text('ok')];
    });
    const ev = await run({ history: user('read a'), mode: 'PLAN', createStream });
    assert.match(lastUserText(calls[1]), /message from user: actually, use b\.txt/);
    assert.ok(ev.some((e) => e.event === 'notification'));
  });
});

describe('teammate merge-back', () => {
  it('diff → apply lands the worktree patch in the main tree, undoable; discard cleans up', async () => {
    if (!gitRepo(dir)) return;
    const route = (c) => {
      if (firstUserText(c).includes('You are teammate')) {
        const who = firstUserText(c).match(/teammate "([^"]+)"/)[1];
        return c.messages.some((m) => m.role === 'tool')
          ? [text(`${who} done`)]
          : [tool('writeFile', { path: 'value.txt', content: `${who}\n` })];
      }
      if (c.index === 0) {
        return [
          tool('spawnTeammate', { name: 'alpha', prompt: 'x', isolation: 'worktree' }),
          tool('spawnTeammate', { name: 'beta', prompt: 'y', isolation: 'worktree' }),
        ];
      }
      // The loop itself waits while teammates are pending.
      return [text('waiting on the team')];
    };
    await run({ history: user('go'), mode: 'BUILD', createStream: mockProvider(route).createStream, onPermissionRequest: async () => 'allow' });

    const diff = await mergeTeammate({ name: 'alpha', action: 'diff' });
    assert.deepEqual(diff.files, ['value.txt']);
    assert.match(diff.patch, /\+alpha/);
    assert.equal(readValue(), 'old\n', 'diff does not touch the tree');

    const applied = await mergeTeammate({ name: 'alpha', action: 'apply' });
    assert.equal(applied.applied, true);
    assert.equal(readValue(), 'alpha\n');
    await assert.rejects(mergeTeammate({ name: 'alpha' }), /already merged/);

    const discarded = await mergeTeammate({ name: 'beta', action: 'discard' });
    assert.equal(discarded.discarded, true);
    assert.equal(existsSync(join(dir, '.sentinel', 'worktrees', 'beta')), false);

    const undo = await executeLocalTool('undoLastChange', {}, 'BUILD', { preAuthorized: true });
    assert.equal(undo.success, true);
    assert.equal(readValue(), 'old\n');
  });
});

describe('race (best-of-N)', () => {
  it('ranks: passing check, then test balance, then smaller diff, then cost', () => {
    const r = rankCandidates([
      { index: 0, name: 'a', check: { exitCode: 1, passed: 9, failed: 1 }, diff: { added: 1, removed: 0 } },
      { index: 1, name: 'b', check: { exitCode: 0, passed: 5, failed: 0 }, diff: { added: 40, removed: 0 } },
      { index: 2, name: 'c', check: { exitCode: 0, passed: 5, failed: 0 }, diff: { added: 3, removed: 1 } },
      { index: 3, name: 'd', disqualified: 'no changes' },
    ]);
    assert.deepEqual(r.map((c) => c.name), ['c', 'b', 'a', 'd']);
  });

  it('runs candidates in worktrees, scores with the check, applies only the winner', async () => {
    if (!gitRepo(dir)) return;
    const { createStream } = mockProvider((c) => {
      const brief = firstUserText(c);
      const smallest = brief.includes('smallest possible change');
      if (c.messages.some((m) => m.role === 'tool')) return [text('done')];
      return [tool('writeFile', { path: 'value.txt', content: smallest ? 'right\n' : 'wrong\n' })];
    });
    const check = 'node -e "process.exit(require(\'fs\').readFileSync(\'value.txt\',\'utf8\').trim()===\'right\'?0:1)"';
    const events = [];
    const res = await runRace({ task: 'set value to right', check, n: 3, models: [MODEL], cwd: dir, createStream, onEvent: (e) => events.push(e) });
    assert.ok(res.winner);
    assert.equal(res.merged, true);
    assert.equal(res.ranking[0].exitCode, 0);
    assert.equal(res.ranking.filter((c) => c.exitCode === 0).length, 1);
    assert.equal(readValue(), 'right\n');
    assert.equal(execFileSync('git', ['worktree', 'list'], { cwd: dir, encoding: 'utf8' }).trim().split('\n').length, 1, 'all worktrees removed');
    assert.equal(events.filter((e) => e.type === 'scored').length, 3);
  });

  it('applies nothing when no candidate passes', async () => {
    if (!gitRepo(dir)) return;
    const { createStream } = mockProvider((c) => (c.messages.some((m) => m.role === 'tool')
      ? [text('done')]
      : [tool('writeFile', { path: 'value.txt', content: 'wrong\n' })]));
    const res = await runRace({ task: 't', check: 'node -e "process.exit(1)"', n: 2, models: [MODEL], cwd: dir, createStream });
    assert.equal(res.winner, null);
    assert.equal(readValue(), 'old\n');
  });
});

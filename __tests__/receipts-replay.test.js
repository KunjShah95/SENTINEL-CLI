/**
 * receipts-replay — claim checking against tool evidence, cost-aware
 * routing, and trajectory replay. Mock provider, no key, no network.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ReceiptLedger, checkClaims, claimGateMessage, formatReceipts } from '../src/agent/receipts.js';
import { runAgentTurn, runAgentTurnInner, pickIterationModel } from '../src/agent/loop.js';
import { summarizeEvents, sequenceSimilarity, compareRuns, listTrajectories, replayTrajectory } from '../src/agent/replay.js';
import { resetTotals } from '../src/agent/cost.js';
import { resetMailboxes } from '../src/agent/mailbox.js';

const MODEL = 'openai/gpt-oss-20b';
let seq = 0;
const tool = (name, input) => ({ type: 'tool_call', id: `t${seq++}`, name, input });
const text = (t) => ({ type: 'text', text: t });
const user = (t) => [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: t }] }];

function mockProvider(route) {
  const calls = [];
  const createStream = async function* (opts) {
    const call = { ...opts, index: calls.length };
    calls.push(call);
    yield* route(call);
  };
  return { createStream, calls };
}

async function collect(gen) {
  const out = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

let dir;
let prevCwd;
let savedTraj;

beforeEach(() => {
  resetTotals();
  resetMailboxes();
  prevCwd = process.cwd();
  dir = mkdtempSync(join(tmpdir(), 'sentinel-rr-'));
  process.chdir(dir);
  savedTraj = process.env.SENTINEL_TRAJECTORY_DIR;
  process.env.SENTINEL_TRAJECTORY_DIR = join(dir, 'traj');
});

afterEach(() => {
  process.chdir(prevCwd);
  if (savedTraj === undefined) delete process.env.SENTINEL_TRAJECTORY_DIR;
  else process.env.SENTINEL_TRAJECTORY_DIR = savedTraj;
});

describe('receipts', () => {
  const ledgerOf = (...steps) => {
    const l = new ReceiptLedger();
    for (const [name, input, output] of steps) l.record(name, input, output);
    return l.entries;
  };

  it('supported / stale / contradicted / unsupported', () => {
    const pass = ['bash', { command: 'npm test' }, { stdout: 'ok', exitCode: 0 }];
    const fail = ['bash', { command: 'npm test' }, { stdout: 'boom', exitCode: 1 }];
    const edit = ['editFile', { path: 'a.js' }, { success: true }];
    const claim = 'Done. All tests pass now.';
    assert.equal(checkClaims(claim, ledgerOf(pass)).claims[0].status, 'supported');
    assert.equal(checkClaims(claim, ledgerOf(pass, edit)).claims[0].status, 'stale');
    assert.equal(checkClaims(claim, ledgerOf(pass, fail)).claims[0].status, 'contradicted');
    assert.equal(checkClaims(claim, ledgerOf(edit)).claims[0].status, 'unsupported');
    assert.equal(checkClaims(claim, ledgerOf(edit, pass)).ok, true);
  });

  it('ignores hedged or future-tense statements and non-claims', () => {
    assert.equal(checkClaims('Once you run it, the tests should pass.', []).claims.length, 0);
    assert.equal(checkClaims('I did not run the tests yet.', []).claims.length, 0);
    assert.equal(checkClaims('Here is the refactor.', []).claims.length, 0);
  });

  it('recognises build, lint and type claims with their own evidence', () => {
    const entries = ledgerOf(['bash', { command: 'npx tsc --noEmit' }, { exitCode: 0 }]);
    const r = checkClaims('The build succeeds. Lint is clean. No type errors.', entries);
    const byKind = Object.fromEntries(r.claims.map((c) => [c.kind, c.status]));
    assert.deepEqual(byKind, { build: 'supported', lint: 'unsupported', types: 'supported' });
    assert.match(claimGateMessage(r.claims), /Lint is clean/);
    assert.match(formatReceipts(r.claims).join('\n'), /✓ build: supported · r1 `npx tsc --noEmit` exit 0 · sha [0-9a-f]{12}/);
  });

  it('the loop blocks an unbacked "tests pass" once, then accepts the verified answer', async () => {
    const { createStream, calls } = mockProvider((c) => {
      if (c.index === 0) return [text('Fixed it. All tests pass.')];
      if (c.index === 1) return [tool('bash', { command: 'node -e "0" && echo test ok' })];
      return [text('Ran the test command: all tests pass.')];
    });
    const ev = await collect(runAgentTurnInner({ history: user('fix'), mode: 'BUILD', model: MODEL, createStream, trajectory: false, onPermissionRequest: async () => 'allow' }));
    const receipts = ev.filter((e) => e.event === 'receipts');
    assert.equal(receipts[0].data.blocking, true);
    assert.equal(receipts[0].data.claims[0].status, 'unsupported');
    // (the mock holds the live messages array, so search rather than index)
    assert.ok(calls[1].messages.some((m) => m.role === 'user' && /Receipt check/.test(m.content)));
    assert.equal(receipts.at(-1).data.claims[0].status, 'supported');
    assert.equal(ev.at(-2).event, 'finish');
  });
});

describe('cost-aware routing', () => {
  it('pickIterationModel: main first, cheap only after read-only batches, periodic re-plan', () => {
    const cheap = { modelId: 'c' };
    assert.equal(pickIterationModel({ cheap: null, iter: 3, lastBatchReadOnly: true, cheapStreak: 0 }), 'main');
    assert.equal(pickIterationModel({ cheap, iter: 0, lastBatchReadOnly: true, cheapStreak: 0 }), 'main');
    assert.equal(pickIterationModel({ cheap, iter: 1, lastBatchReadOnly: false, cheapStreak: 0 }), 'main');
    assert.equal(pickIterationModel({ cheap, iter: 1, lastBatchReadOnly: true, cheapStreak: 0 }), 'cheap');
    assert.equal(pickIterationModel({ cheap, iter: 5, lastBatchReadOnly: true, cheapStreak: 3 }), 'main');
  });

  it('routes exploration calls to the cheap model and accounts usage separately', async () => {
    writeFileSync(join(dir, 'a.txt'), 'x');
    const { createStream, calls } = mockProvider((c) => {
      if (c.index < 5) return [tool('readFile', { path: `${'./'.repeat(c.index)}a.txt` }), tool('listDirectory', { path: `.${'/'.repeat(c.index)}` }), { type: 'usage', usage: { inputTokens: 100, outputTokens: 10 } }];
      return [text('done'), { type: 'usage', usage: { inputTokens: 100, outputTokens: 10 } }];
    });
    const ev = await collect(runAgentTurnInner({
      history: user('explore'), mode: 'PLAN', model: MODEL, routeModel: 'openai/gpt-oss-120b', createStream, trajectory: false,
    }));
    const models = calls.map((c) => c.modelId);
    assert.notEqual(models[1], models[0], 'second call (after read-only batch) uses the cheap model');
    assert.deepEqual(models.slice(1, 4).map((m) => m === models[0]), [false, false, false]);
    assert.equal(models[4], models[0], 'main model re-plans after ROUTE_MAX_CHEAP_STREAK cheap calls');
    assert.ok(ev.some((e) => e.event === 'route'));
    const fin = ev.find((e) => e.event === 'finish').data;
    assert.ok(fin.routed.inputTokens > 0);
    assert.equal(fin.usage.inputTokens, 600);
  });
});

describe('replay', () => {
  it('sequenceSimilarity and compareRuns', () => {
    assert.equal(sequenceSimilarity(['a', 'b', 'c'], ['a', 'b', 'c']), 1);
    assert.equal(sequenceSimilarity([], []), 1);
    assert.ok(sequenceSimilarity(['a', 'b'], ['b', 'x']) < 1);
    const before = { finished: true, errors: [], files: ['a.js'], tools: ['readFile', 'editFile'], costUsd: 0.01, receipts: ['tests:supported'] };
    const after = { finished: true, errors: [], files: ['a.js'], tools: ['readFile', 'editFile'], costUsd: 0.02, receipts: [] };
    const d = compareRuns(before, after);
    assert.equal(d.regressed, true);
    assert.match(d.regressions[0], /lost verified claims/);
    assert.equal(d.filesSame, true);
  });

  it('summarizes recorded trajectories (prompt, tools, files written)', async () => {
    const { createStream } = mockProvider((c) => (c.index === 0
      ? [tool('writeFile', { path: 'out.txt', content: 'hi' })]
      : [text('wrote it')]));
    await collect(runAgentTurn({ history: user('write out.txt'), mode: 'BUILD', model: MODEL, createStream, trajectory: 'runA', onPermissionRequest: async () => 'allow' }));
    const list = listTrajectories(dir);
    assert.equal(list.length, 1);
    const s = list[0].summary;
    assert.equal(s.prompt, 'write out.txt');
    assert.equal(s.mode, 'BUILD');
    assert.deepEqual(s.files, ['out.txt']);
    assert.ok(s.finished);
  });

  it('replays a BUILD turn in a throwaway worktree and diffs behavior', async () => {
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir });
      execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir });
    } catch {
      return;
    }
    const script = (file) => mockProvider((c) => (c.index === 0
      ? [tool('writeFile', { path: file, content: 'x' })]
      : [text('ok')]));
    await collect(runAgentTurn({ history: user('make a file'), mode: 'BUILD', model: MODEL, createStream: script('a.txt').createStream, trajectory: 'runB', onPermissionRequest: async () => 'allow' }));
    const res = await replayTrajectory('runB', { cwd: dir, createStream: script('b.txt').createStream });
    assert.equal(res.prompt, 'make a file');
    assert.equal(res.diff.filesSame, false);
    assert.deepEqual(res.diff.filesBefore, ['a.txt']);
    assert.deepEqual(res.diff.filesAfter, ['b.txt']);
    assert.equal(res.diff.regressed, false);
    assert.equal(readdirSync(dir).includes('b.txt'), false, 'replay never touches the working tree');
    assert.equal(execFileSync('git', ['worktree', 'list'], { cwd: dir, encoding: 'utf8' }).trim().split('\n').length, 1);
  });

  it('summarizeEvents ignores writes whose tool call failed', () => {
    const s = summarizeEvents([
      { event: 'tool_call', data: JSON.stringify({ toolCallId: 'x', toolName: 'writeFile', input: { path: '.env' } }) },
      { event: 'tool_result', data: JSON.stringify({ toolCallId: 'x', error: 'Refusing' }) },
    ]);
    assert.deepEqual(s.files, []);
  });
});

/**
 * parity — scripted end-to-end scenarios through the real agent loop,
 * modeled on claw-code's mock parity harness
 * (rust/crates/rusty-claude-cli/tests/mock_parity_harness.rs +
 * mock_parity_scenarios.json): a deterministic fake provider, a clean temp
 * workspace, and behavioral assertions per scenario.
 *
 * Each scenario gets a `route(call)` that returns the provider events for
 * that model call. `call` exposes system/messages/tools so routing can
 * tell the lead, a teammate, and the goal evaluator apart.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runAgentTurnInner } from '../src/agent/loop.js';
import { resetTotals } from '../src/agent/cost.js';
import { resetMailboxes } from '../src/agent/mailbox.js';
import { resetBackground } from '../src/agent/background.js';
import { resetTeam } from '../src/agent/team.js';
import { runMini, SUBMIT_SENTINEL } from '../src/agent/mini.js';

const MODEL = 'openai/gpt-oss-20b';
const user = (text) => [{ id: `u${Date.now()}`, role: 'user', parts: [{ type: 'text', text }] }];
const tool = (name, input, id = `tc_${name}_${Math.random().toString(36).slice(2, 7)}`) => ({ type: 'tool_call', id, name, input });
const text = (t) => ({ type: 'text', text: t });

/** Build a createStream that records calls and routes each to a script. */
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

const names = (events) => events.map((e) => e.event);
const lastUserText = (call) => {
  const m = [...call.messages].reverse().find((x) => x.role === 'user');
  return typeof m?.content === 'string' ? m.content : '';
};
const isEvaluator = (call) => call.purpose === 'goal-evaluator';
const isTeammate = (call) => String(call.messages[0]?.content || '').includes('You are teammate');

let dir;
let prevCwd;

beforeEach(() => {
  resetTotals();
  resetMailboxes();
  resetBackground();
  resetTeam();
  prevCwd = process.cwd();
  dir = mkdtempSync(join(tmpdir(), 'sentinel-parity-'));
  process.chdir(dir);
});

afterEach(() => {
  process.chdir(prevCwd);
});

describe('parity scenarios (mock provider)', () => {
  it('streaming_text: text streams and the turn finishes with usage', async () => {
    const { createStream } = mockProvider(() => [text('hel'), text('lo'), { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } }]);
    const ev = await run({ history: user('hi'), mode: 'BUILD', createStream });
    assert.deepEqual(names(ev), ['text', 'text', 'finish', 'done']);
    assert.equal(ev[2].data.usage.totalTokens, 12);
  });

  it('read_file_roundtrip: tool result is fed back to the model', async () => {
    writeFileSync(join(dir, 'a.txt'), 'SECRET-CONTENT');
    const { createStream, calls } = mockProvider((call) =>
      call.index === 0 ? [tool('readFile', { path: 'a.txt' })] : [text('read it')]);
    await run({ history: user('read a.txt'), mode: 'PLAN', createStream });
    assert.match(calls[1].messages.at(-1).content, /SECRET-CONTENT/);
  });

  it('write_file_allowed / write_file_denied: permission decides', async () => {
    const script = (call) => (call.index === 0 ? [tool('writeFile', { path: 'w.txt', content: 'x' })] : [text('ok')]);
    await run({ history: user('w'), mode: 'BUILD', createStream: mockProvider(script).createStream, onPermissionRequest: async () => 'allow' });
    assert.equal(readFileSync(join(dir, 'w.txt'), 'utf8'), 'x');

    const denied = await run({ history: user('w'), mode: 'BUILD', createStream: mockProvider((c) => (c.index === 0 ? [tool('writeFile', { path: 'd.txt', content: 'x' })] : [text('ok')])).createStream, onPermissionRequest: async () => 'deny' });
    assert.equal(existsSync(join(dir, 'd.txt')), false);
    assert.match(denied.find((e) => e.event === 'tool_result').data.error, /denied/);
  });

  it('plan_mode_blocks_harness_writes: bgRun is refused in PLAN', async () => {
    const { createStream } = mockProvider((c) => (c.index === 0 ? [tool('bgRun', { command: 'echo hi' })] : [text('ok')]));
    const ev = await run({ history: user('x'), mode: 'PLAN', createStream });
    assert.match(ev.find((e) => e.event === 'tool_result').data.error, /not available in PLAN/);
  });

  it('destructive_reasks: allow-session for bash never covers a destructive command', async () => {
    const asked = [];
    const { createStream } = mockProvider((c) => {
      if (c.index === 0) return [tool('bash', { command: 'node -e "1"' })];
      if (c.index === 1) return [tool('bash', { command: 'node -e "2"' })];
      if (c.index === 2) return [tool('bash', { command: 'git reset --hard HEAD' })];
      return [text('done')];
    });
    await run({
      history: user('x'),
      mode: 'BUILD',
      createStream,
      onPermissionRequest: async (name, _id, input) => {
        asked.push(input.command);
        return input.command.includes('reset') ? 'deny' : 'allow-session';
      },
    });
    assert.deepEqual(asked, ['node -e "1"', 'git reset --hard HEAD']);
  });

  it('bash_output_warnings: risky commands carry validation warnings', async () => {
    const { createStream } = mockProvider((c) => (c.index === 0 ? [tool('bash', { command: 'node -e "1" && cat ../x || true' })] : [text('ok')]));
    const ev = await run({ history: user('x'), mode: 'BUILD', createStream, onPermissionRequest: async () => 'allow' });
    assert.ok(ev.find((e) => e.event === 'tool_result').data.output.warnings.length > 0);
  });

  it('headless_policy: without a permission callback, bash and bgRun obey the ask policy', async () => {
    const { createStream } = mockProvider((c) => {
      if (c.index === 0) return [tool('bash', { command: 'node -e "1"' }), tool('bgRun', { command: 'node -e "1"' })];
      return [text('ok')];
    });
    const ev = await run({ history: user('x'), mode: 'BUILD', createStream });
    const errs = ev.filter((e) => e.event === 'tool_result').map((e) => e.data.error);
    assert.equal(errs.length, 2);
    for (const e of errs) assert.match(e, /requires user confirmation/);
  });

  it('background_notification: the turn waits for bgRun and injects the result', async () => {
    const { createStream, calls } = mockProvider((c) => {
      if (c.index === 0) return [tool('bgRun', { command: 'node -e "console.log(\'BUILD-OK\')"' })];
      if (!lastUserText(c).includes('<notifications>')) return [text('started, waiting')];
      return [text('build finished')];
    });
    const ev = await run({ history: user('build'), mode: 'BUILD', createStream, onPermissionRequest: async () => 'allow' });
    assert.ok(names(ev).includes('waiting'));
    const note = ev.find((e) => e.event === 'notification');
    assert.equal(note.data.messages[0].status, 'completed');
    assert.match(lastUserText(calls.at(-1)), /BUILD-OK/);
    assert.equal(ev.at(-2).event, 'finish');
  });

  it('goal_loop: evaluator blocks the stop until evidence appears', async () => {
    let evalCalls = 0;
    const { createStream } = mockProvider((c) => {
      if (isEvaluator(c)) {
        evalCalls++;
        const ok = String(c.messages[0].content).includes('exit 0');
        return [text(JSON.stringify({ ok, reason: ok ? 'exit 0 shown' : 'no test output yet', impossible: false }))];
      }
      if (lastUserText(c).includes('Goal not met yet')) return [text('ran `npm test`: exit 0')];
      return [text('I think it works')];
    });
    const ev = await run({ history: user('fix'), mode: 'BUILD', createStream, goal: 'npm test exits 0' });
    const goals = ev.filter((e) => e.event === 'goal');
    assert.deepEqual(goals.map((g) => g.data.ok), [false, true]);
    assert.equal(evalCalls, 2);
    assert.equal(ev.at(-2).event, 'finish');
  });

  it('goal_impossible: evaluator can end the turn', async () => {
    const { createStream } = mockProvider((c) =>
      (isEvaluator(c) ? [text('{"ok":false,"reason":"file deleted","impossible":true}')] : [text('cannot')]));
    const ev = await run({ history: user('x'), mode: 'BUILD', createStream, goal: 'g' });
    assert.equal(ev.filter((e) => e.event === 'goal').length, 1);
    assert.equal(ev.at(-2).event, 'finish');
  });

  it('goal_unknown: an unverifiable contract stops the blind retry', async () => {
    const { createStream, calls } = mockProvider((c) =>
      (isEvaluator(c) ? [text('{"ok":false,"reason":"TARGET is not measurable","impossible":false,"unknown":true}')] : [text('work')]));
    const ev = await run({ history: user('x'), mode: 'BUILD', createStream, goal: 'g' });
    const goals = ev.filter((e) => e.event === 'goal');
    assert.equal(goals[0].data.unknown, true);
    assert.equal(goals.length, 1, 'an unknown verdict is terminal — retrying cannot fix an unjudgeable contract');
    // The worker is told the contract is the blocker, not told to keep going.
    const retry = calls.find((c) => lastUserText(c).includes('cannot be judged as written'));
    assert.ok(retry, 'expected the worker to be told the contract is unverifiable');
    assert.match(lastUserText(retry), /Do not retry the same work/);
    assert.equal(ev.at(-2).event, 'finish');
  });

  it('outcome_contract: the worker is briefed by the contract, the judge by the brief', async () => {
    const contract = {
      current: 'src/sync.js:44 rewrites every row',
      target: 'P95 under 2s',
      verification: 'npm run sync-test exits 0',
      blastRadius: 'the cursor table',
      rollback: 'git revert <sha>',
      unknowns: ['staging p95 was never measured'],
    };
    const { createStream, calls } = mockProvider((c) => {
      if (isEvaluator(c)) return [text('{"ok":true,"reason":"sync-test passed","impossible":false}')];
      return [text('ran it: exit 0')];
    });
    const ev = await run({ history: user('fix the sync'), mode: 'BUILD', createStream, goal: 'VERIFICATION passes', outcome: contract });
    const worker = calls[0];
    assert.match(worker.system, /Outcome contract/);
    assert.match(worker.system, /P95 under 2s/);
    // The inherited assumption travels to the worker...
    assert.match(worker.system, /staging p95 was never measured/);
    // ...and the judge sees the whole contract, not just the one-line goal.
    const judge = calls.find(isEvaluator);
    assert.match(String(judge.messages[0].content), /BLAST RADIUS: the cursor table/);
    assert.equal(ev.filter((e) => e.event === 'goal')[0].data.ok, true);
  });

  it('outcome_contract: an incomplete contract still names what is missing', async () => {
    const partial = { current: 'a', target: 'b', verification: '', blastRadius: '', rollback: '', unknowns: [] };
    const { createStream, calls } = mockProvider((c) =>
      (isEvaluator(c) ? [text('{"ok":true,"reason":"good enough","impossible":false}')] : [text('done')]));
    const ev = await run({ history: user('x'), mode: 'BUILD', createStream, goal: 'g', outcome: partial });
    assert.equal(ev.filter((e) => e.event === 'goal')[0].data.ok, true);
    // A contract with holes is still passed to the judge, which can answer
    // unknown about it — the gaps are visible rather than silently defaulted.
    const judge = calls.find(isEvaluator);
    assert.match(String(judge.messages[0].content), /VERIFICATION: none/);
  });

  it('engagement_budget: an exhausted engagement stops the turn and says why', async () => {
    const { writeBudget, recordSpend } = await import('../src/agent/budget.js');
    writeBudget({ budgetUsd: 1, startedAt: new Date(Date.now() - 1000).toISOString() }, dir);
    recordSpend({ usd: 5, inputTokens: 10, outputTokens: 5, model: MODEL }, dir);
    const { createStream } = mockProvider(() => [text('should not get here')]);
    const ev = await run({ history: user('keep going'), mode: 'BUILD', createStream, engagement: true });
    const err = ev.find((e) => e.event === 'error');
    assert.ok(err, 'an exhausted budget must stop the turn');
    assert.match(err.data.message, /budget exhausted/i);
    assert.equal(ev.filter((e) => e.event === 'finish')[0].data.budgetExceeded, true);
  });

  it('engagement_budget: a passed deadline stops the turn', async () => {
    const { writeBudget } = await import('../src/agent/budget.js');
    writeBudget({ budgetUsd: 100, deadlineAt: new Date(Date.now() - 1000).toISOString() }, dir);
    const { createStream } = mockProvider(() => [text('too late')]);
    const ev = await run({ history: user('go'), mode: 'BUILD', createStream, engagement: true });
    assert.match(ev.find((e) => e.event === 'error').data.message, /deadline passed/i);
  });

  it('engagement_budget: spend is persisted per turn, and a run without opt-in records nothing', async () => {
    const { writeBudget, readSpend } = await import('../src/agent/budget.js');
    writeBudget({ budgetUsd: 100, startedAt: new Date(Date.now() - 1000).toISOString() }, dir);
    const withUsage = mockProvider(() => [text('done'), { type: 'usage', usage: { inputTokens: 1000, outputTokens: 200 } }]);
    await run({ history: user('a'), mode: 'PLAN', createStream: withUsage.createStream, engagement: true });
    assert.equal(readSpend(dir).length, 1, 'an opted-in turn records its spend');
    assert.equal(readSpend(dir)[0].inputTokens, 1000);

    const without = mockProvider(() => [text('done'), { type: 'usage', usage: { inputTokens: 1000, outputTokens: 200 } }]);
    await run({ history: user('b'), mode: 'PLAN', createStream: without.createStream });
    assert.equal(readSpend(dir).length, 1, 'opting out must not write a phantom row');
  });

  it('engagement_budget: an unbounded project never blocks a turn', async () => {
    const { createStream } = mockProvider(() => [text('fine')]);
    const ev = await run({ history: user('go'), mode: 'PLAN', createStream, engagement: true });
    assert.equal(ev.filter((e) => e.event === 'error').length, 0);
    assert.equal(ev.at(-1).event, 'done');
  });

  it('risk_ledger: a novel command shape is asked about even under a session grant', async () => {
    const asked = [];
    const { createStream } = mockProvider((c) => {
      if (c.index === 0) return [tool('bash', { command: 'npm publish --dry-run' })];
      if (c.index === 1) return [tool('bash', { command: 'npm publish --dry-run' })];
      return [text('ok')];
    });
    const ev = await run({
      history: user('go'),
      mode: 'BUILD',
      createStream,
      onPermissionRequest: async (name, id, input) => {
        asked.push(input);
        return name === 'bash' ? 'allow-session' : 'deny';
      },
    });
    // The first call is a novel shape, so the user is consulted. The second
    // is the same shape and is covered by the grant without asking again.
    const bashAsks = asked.filter((a) => a?.command);
    assert.equal(bashAsks.length, 1, 'the second identical shape must not re-ask');
    assert.match(bashAsks[0].__risk, /new command shape/);
    assert.equal(ev.filter((e) => e.event === 'error').length, 0);
  });

  it('risk_ledger: a session grant for bash does not authorize a new shape', async () => {
    const asked = [];
    const { createStream } = mockProvider((c) => {
      if (c.index === 0) return [tool('bash', { command: 'git commit -m one' })];
      if (c.index === 1) return [tool('bash', { command: 'git push' })];
      return [text('ok')];
    });
    await run({
      history: user('go'),
      mode: 'BUILD',
      createStream,
      onPermissionRequest: async (name, id, input) => {
        asked.push(input?.command);
        return 'allow-session';
      },
    });
    // Approving `git commit` must not silently authorize `git push`.
    assert.deepEqual(asked, ['git commit -m one', 'git push']);
  });

  it('risk_ledger: a destructive command is never recorded as an approved shape', async () => {
    const { createStream } = mockProvider((c) =>
      (c.index === 0 ? [tool('bash', { command: 'rm -rf /' })] : [text('blocked')]));
    await run({
      history: user('go'),
      mode: 'BUILD',
      createStream,
      onPermissionRequest: async () => 'allow-session',
    });
    const { readLedger } = await import('../src/agent/risk-ledger.js');
    const shapes = Object.keys(readLedger(dir).shapes);
    assert.ok(!shapes.some((s) => s.startsWith('rm')), `ledger learned a destructive shape: ${shapes.join()}`);
  });

  it('risk_ledger: a read-only command asks once, then is covered by the grant', async () => {
    const asked = [];
    const { createStream } = mockProvider((c) => {
      if (c.index === 0) return [tool('bash', { command: 'git status' })];
      if (c.index === 1) return [tool('bash', { command: 'git status --short' })]; // different shape
      return [text('clean')];
    });
    await run({
      history: user('check'),
      mode: 'BUILD',
      createStream,
      onPermissionRequest: async (name, id, input) => { asked.push(input?.command); return 'allow-session'; },
    });
    // The lead still sees shell commands the first time — this project does
    // not silently auto-approve shell for a human in the loop. The ledger
    // narrows what is asked, it does not remove asking.
    assert.deepEqual(asked, ['git status']);
    // A different shape that is still provably read-only is green, so the
    // session grant covers it. The ledger does not re-ask for `git log`
    // because the shape differs from `git status`.
    const { riskLevel } = await import('../src/agent/risk-ledger.js');
    assert.equal(riskLevel('git status --short', dir).level, 'green');
  });

  it('teammate_roundtrip: lead spawns, teammate works in parallel, summary returns via mailbox', async () => {
    writeFileSync(join(dir, 'notes.txt'), 'TEAM-DATA');
    const { createStream, calls } = mockProvider((c) => {
      if (isTeammate(c)) {
        const sawRead = c.messages.some((m) => m.role === 'tool');
        return sawRead ? [text('teammate summary: notes contain TEAM-DATA')] : [tool('readFile', { path: 'notes.txt' })];
      }
      if (c.index === 0) return [tool('spawnTeammate', { name: 'scout', prompt: 'read notes.txt', mode: 'PLAN' })];
      if (!lastUserText(c).includes('<notifications>')) return [text('waiting for scout')];
      return [text('scout reported back')];
    });
    const ev = await run({ history: user('go'), mode: 'BUILD', createStream });
    const note = ev.find((e) => e.event === 'notification');
    assert.equal(note.data.messages[0].type, 'teammate_result');
    assert.match(note.data.messages[0].text, /TEAM-DATA/);
    assert.ok(calls.some(isTeammate));
  });

  it('teammate_worktree: isolation="worktree" edits land on a separate branch, not the main tree', async () => {
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir });
      execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: dir });
    } catch {
      return; // git unavailable: skip
    }
    const { createStream } = mockProvider((c) => {
      if (isTeammate(c)) {
        return c.messages.some((m) => m.role === 'tool')
          ? [text('wrote feature.txt')]
          : [tool('writeFile', { path: 'feature.txt', content: 'from-teammate' })];
      }
      if (c.index === 0) return [tool('spawnTeammate', { name: 'builder', prompt: 'write feature.txt', isolation: 'worktree' })];
      return lastUserText(c).includes('<notifications>') ? [text('merged later')] : [text('waiting')];
    });
    const ev = await run({ history: user('go'), mode: 'BUILD', createStream, onPermissionRequest: async () => 'allow' });
    const spawned = ev.find((e) => e.event === 'tool_result').data.output;
    assert.match(spawned.branch, /^sentinel\/builder-/);
    assert.equal(existsSync(join(dir, 'feature.txt')), false, 'main tree untouched');
    assert.equal(readFileSync(join(spawned.worktree, 'feature.txt'), 'utf8'), 'from-teammate');
    execFileSync('git', ['worktree', 'remove', '--force', spawned.worktree], { cwd: dir });
  });

  it('teammates_cannot_spawn_teammates', async () => {
    const { createStream } = mockProvider((c) => {
      if (isTeammate(c)) {
        return c.messages.some((m) => m.role === 'tool')
          ? [text(`nested: ${c.messages.find((m) => m.role === 'tool').content}`)]
          : [tool('spawnTeammate', { name: 'nested', prompt: 'x' })];
      }
      if (c.index === 0) return [tool('spawnTeammate', { name: 'outer', prompt: 'x' })];
      return lastUserText(c).includes('<notifications>') ? [text('done')] : [text('wait')];
    });
    const ev = await run({ history: user('go'), mode: 'BUILD', createStream });
    assert.match(ev.find((e) => e.event === 'notification').data.messages[0].text, /cannot spawn teammates/);
  });

  it('memory_write_roundtrip: memoryWrite persists and appears in the next prompt', async () => {
    const { createStream, calls } = mockProvider((c) => (c.index === 0
      ? [tool('memoryWrite', { name: 'db-rule', type: 'feedback', description: 'Never mock the DB in tests', body: 'Integration tests hit a real DB.' })]
      : [text('saved')]));
    await run({ history: user('remember'), mode: 'BUILD', createStream });
    assert.ok(existsSync(join(dir, '.sentinel', 'memory', 'db-rule.md')));
    const second = mockProvider(() => [text('hi')]);
    await run({ history: user('hi'), mode: 'BUILD', createStream: second.createStream });
    assert.match(second.calls[0].system, /Never mock the DB/);
    void calls;
  });
});

describe('mini-swe-agent parity (mock provider)', () => {
  it('runs bash in fresh subshells and exits on the submit sentinel', async () => {
    const out = join(dir, 'traj', 'run.json');
    const { createStream } = mockProvider((c) => {
      if (c.index === 0) return [text('look around'), tool('bash', { command: 'node -e "console.log(7*6)"' })];
      return [text('submit'), tool('bash', { command: `echo ${SUBMIT_SENTINEL}` })];
    });
    const res = await runMini({ task: 'compute', model: MODEL, createStream, output: out, cwd: dir });
    assert.equal(res.exitStatus, 'Submitted');
    assert.equal(res.apiCalls, 2);
    const obs = res.messages.find((m) => m.role === 'tool');
    assert.match(obs.content, /<returncode>0<\/returncode>[\s\S]*42/);
    const traj = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(traj.trajectory_format, 'mini-swe-agent-1.1');
    assert.equal(traj.info.exit_status, 'Submitted');
  });

  it('stops on repeated format errors and on step limit', async () => {
    const noTool = mockProvider(() => [text('just talking')]);
    const r1 = await runMini({ task: 't', model: MODEL, createStream: noTool.createStream, cwd: dir });
    assert.equal(r1.exitStatus, 'RepeatedFormatError');
    assert.equal(r1.apiCalls, 3);

    const loop = mockProvider(() => [tool('bash', { command: 'node -e "1"' })]);
    const r2 = await runMini({ task: 't', model: MODEL, createStream: loop.createStream, stepLimit: 2, cwd: dir });
    assert.equal(r2.exitStatus, 'LimitsExceeded');
    assert.equal(r2.apiCalls, 2);
  });

  it('keeps the builtin dangerous-command guard', async () => {
    const { createStream } = mockProvider((c) => (c.index === 0
      ? [tool('bash', { command: 'rm -rf / --no-preserve-root' })]
      : [tool('bash', { command: `echo ${SUBMIT_SENTINEL}` })]));
    const res = await runMini({ task: 't', model: MODEL, createStream, cwd: dir });
    assert.match(res.messages.find((m) => m.role === 'tool').content, /<exception>Blocked dangerous command/);
  });
});

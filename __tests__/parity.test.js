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
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runAgentTurnInner } from '../src/agent/loop.js';
import { resetTotals } from '../src/agent/cost.js';
import { resetMailboxes } from '../src/agent/mailbox.js';
import { resetBackground } from '../src/agent/background.js';
import { resetTeam } from '../src/agent/team.js';
import { runMini, SUBMIT_SENTINEL } from '../src/agent/mini.js';
import { listTasks, getTask, cancelTask } from '../src/agent/task.js';
import { normalizeSkillNames } from '../src/agent/skill-delegation.js';

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

  it('skill_with_args: the model loads a skill and its $1 is filled from the call', async () => {
    const sd = join(dir, '.sentinel', 'skills', 'demo');
    mkdirSync(sd, { recursive: true });
    writeFileSync(join(sd, 'SKILL.md'), '---\nname: demo\ndescription: a demo\n---\nNow edit $ARGUMENTS carefully.');
    const { createStream, calls } = mockProvider((call) =>
      call.index === 0
        ? [tool('skill', { name: 'demo', args: ['target.js'] })]
        : [text('loaded')]);
    const ev = await run({ history: user('use the demo skill on target.js'), mode: 'BUILD', createStream });
    const result = ev.find((e) => e.event === 'tool_result').data.output;
    assert.equal(result.name, 'demo');
    assert.match(result.prompt, /Now edit target\.js carefully\./);
    // The description comes back too, so the model can still see what the skill
    // was after its body is in context.
    assert.equal(result.description, 'a demo');
    // The listing advertised the skill, which is the other half of the pair.
    assert.match(calls[0].system, /Available skills/);
  });

  it('subagent_with_skill: the workflow reaches the subagent, the prompt stays the task', async () => {
    const sd = join(dir, '.sentinel', 'skills', 'audit');
    mkdirSync(sd, { recursive: true });
    writeFileSync(join(sd, 'SKILL.md'), '---\nname: audit\ndescription: audit\n---\nCheck $1 for secrets.');

    let subSeen = null;
    const { createStream } = mockProvider((call) => {
      if (isTeammate(call) || call.messages.length > 2) {
        // The subagent's first user message is where the skill has to be.
        if (!subSeen) subSeen = lastUserText(call);
        return [text('audit complete')];
      }
      return [tool('spawnAgent', { prompt: 'audit the repo', skills: [{ name: 'audit', args: ['auth.js'] }] })];
    });
    const ev = await run({ history: user('audit the repo'), mode: 'BUILD', createStream, onPermissionRequest: async () => 'allow' });
    const out = ev.find((e) => e.event === 'tool_result').data.output;
    assert.match(out.summary || '', /audit complete/, 'the subagent returned');

    assert.match(subSeen, /Check auth\.js for secrets\./, 'args were substituted');
    assert.match(subSeen, /<skill name="audit">/, 'the body is fenced and named');
    assert.match(subSeen, /audit the repo/, 'the prompt is still there');
    assert.match(subSeen, /^You were given a skill \(audit\)/, 'the agent is told it was given one');
  });

  it('subagent_unknown_skill_is_refused, not silently skipped', async () => {
    // The failure this prevents: a subagent asked to use a workflow that does
    // not exist proceeds on the prompt alone and reports success. That looks
    // exactly like working.
    const { createStream } = mockProvider((call) =>
      call.index === 0
        ? [tool('spawnAgent', { prompt: 'do it', skills: ['does-not-exist'] })]
        : [text('ok')]);
    const ev = await run({ history: user('go'), mode: 'BUILD', createStream, onPermissionRequest: async () => 'allow' });
    assert.match(ev.find((e) => e.event === 'tool_result').data.error, /Unknown skill: does-not-exist/);
  });

  it('subagent_stacks_two_skills in the order given, deduped', async () => {
    for (const [n, body] of [['first', 'WORKFLOW-ONE'], ['second', 'WORKFLOW-TWO']]) {
      const d = join(dir, '.sentinel', 'skills', n);
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, 'SKILL.md'), `---\nname: ${n}\ndescription: ${n}\n---\n${body}`);
    }
    let subSeen = null;
    const { createStream } = mockProvider((call) => {
      if (call.messages.length > 2) {
        if (!subSeen) subSeen = lastUserText(call);
        return [text('done')];
      }
      // `first` twice: the second must not inject the body again.
      return [tool('spawnAgent', { prompt: 'go', skills: ['first', 'second', 'first'] })];
    });
    await run({ history: user('go'), mode: 'BUILD', createStream, onPermissionRequest: async () => 'allow' });
    assert.ok(subSeen.includes('WORKFLOW-ONE'), 'first is present');
    assert.ok(subSeen.includes('WORKFLOW-TWO'), 'second is present');
    assert.equal(subSeen.split('WORKFLOW-ONE').length - 1, 1, 'a duplicate skill is not injected twice');
    assert.ok(
      subSeen.indexOf('WORKFLOW-ONE') < subSeen.indexOf('WORKFLOW-TWO'),
      'the caller\'s order is preserved',
    );
  });

  it('teammate_with_skill: a teammate follows the workflow too, from the same builder', async () => {
    // A skill must behave identically whether you waited for it or delegated it
    // to a teammate. Two builders would make "run this in parallel" mean
    // something subtly different from "run this and wait".
    const sd = join(dir, '.sentinel', 'skills', 'audit');
    mkdirSync(sd, { recursive: true });
    writeFileSync(join(sd, 'SKILL.md'), '---\nname: audit\ndescription: audit\n---\nCheck $1 for secrets.');

    const { createStream, calls } = mockProvider((c) => {
      if (isTeammate(c)) return [text('teammate summary: audited')];
      if (c.index === 0) {
        return [tool('spawnTeammate', { name: 'scout', prompt: 'audit the repo', mode: 'PLAN', skills: [{ name: 'audit', args: ['auth.js'] }] })];
      }
      // Wait for the teammate's report rather than ending the turn, so the
      // teammate's own model call is guaranteed to have happened.
      if (!lastUserText(c).includes('<notifications>')) return [text('waiting for scout')];
      return [text('scout reported back')];
    });
    await run({ history: user('audit in parallel'), mode: 'BUILD', createStream, onPermissionRequest: async () => 'allow' });

    const teammateCall = calls.find(isTeammate);
    assert.ok(teammateCall, 'the teammate ran');
    const brief = teammateCall.messages[0]?.content || '';
    assert.match(brief, /Check auth\.js for secrets\./, 'args were substituted');
    assert.match(brief, /<skill name="audit">/, 'the body is fenced and named');
    assert.match(brief, /audit the repo/, 'the prompt is still there');
  });

  it('teammate_unknown_skill_is_refused before the task starts', async () => {
    const { createStream } = mockProvider((call) =>
      call.index === 0
        ? [tool('spawnTeammate', { name: 'scout', prompt: 'go', skills: ['nope'] })]
        : [text('ok')]);
    const ev = await run({ history: user('go'), mode: 'BUILD', createStream, onPermissionRequest: async () => 'allow' });
    assert.match(ev.find((e) => e.event === 'tool_result').data.error, /Unknown skill: nope/);
    // Refused before anything started, so there is no half-spawned teammate.
    assert.equal(listTasks({ kind: 'agent', status: 'running' }).length, 0);
  });

  it('normalizeSkillNames accepts the three shapes models send', () => {
    assert.deepEqual(normalizeSkillNames(undefined), []);
    assert.deepEqual(normalizeSkillNames(''), []);
    assert.deepEqual(normalizeSkillNames('review'), [{ name: 'review', args: [] }]);
    assert.deepEqual(normalizeSkillNames(['a', 'b']), [{ name: 'a', args: [] }, { name: 'b', args: [] }]);
    assert.deepEqual(normalizeSkillNames({ name: 'a', args: ['x'] }), [{ name: 'a', args: ['x'] }]);
    assert.deepEqual(normalizeSkillNames([{ name: 'a', args: 'x' }]), [{ name: 'a', args: ['x'] }]);
    // Dedupe by name, first wins.
    assert.deepEqual(
      normalizeSkillNames([{ name: 'a', args: ['1'] }, { name: 'a', args: ['2'] }]),
      [{ name: 'a', args: ['1'] }],
    );
    // A name is an identifier, not a list. "two words" is one name.
    assert.deepEqual(normalizeSkillNames('two words'), [{ name: 'two words', args: [] }]);
  });

  it('allowed_tools: a skill declaration refuses a later call in the same turn', async () => {
    // The end-to-end shape, and the reason the toolset is not narrowed: the
    // model was *shown* writeFile at iteration 0 and only learns otherwise at
    // iteration 1. A narrowed toolset would make that failure opaque.
    const sd = join(dir, '.sentinel', 'skills', 'audit');
    mkdirSync(sd, { recursive: true });
    writeFileSync(join(sd, 'SKILL.md'), '---\nname: audit\ndescription: audit\nallowed-tools: readFile, grep\n---\nAudit $1.');
    const { createStream } = mockProvider((call) =>
      call.index === 0
        ? [tool('skill', { name: 'audit' })]
        : call.index === 1
          ? [tool('writeFile', { path: 'leak.txt', content: 'x' })]
          : [text('done')]);
    const ev = await run({ history: user('audit then fix'), mode: 'BUILD', createStream, onPermissionRequest: async () => 'allow' });
    const refused = ev.filter((e) => e.event === 'tool_result')[1];
    assert.match(refused.data.error, /allowed-tools/, 'the reason is the declaration');
    assert.match(refused.data.error, /"audit"/, 'and it names the skill');
    assert.equal(existsSync(join(dir, 'leak.txt')), false, 'nothing was written');
  });

  it('allowed_tools: a stacked load cannot be used to opt out', async () => {
    // `names` is a way to load several at once, so it must not be a way to
    // load the unrestricted one after the restricted one and quietly discard
    // the restriction. The intersection holds regardless of order.
    const loose = join(dir, '.sentinel', 'skills', 'loose');
    mkdirSync(loose, { recursive: true });
    writeFileSync(join(loose, 'SKILL.md'), '---\nname: loose\ndescription: loose\n---\nAnything.');
    const tight = join(dir, '.sentinel', 'skills', 'tight');
    mkdirSync(tight, { recursive: true });
    writeFileSync(join(tight, 'SKILL.md'), '---\nname: tight\ndescription: tight\nallowed-tools: readFile\n---\nOnly reads.');
    const { createStream } = mockProvider((call) =>
      call.index === 0
        ? [tool('skill', { names: ['tight', 'loose'] })]
        : call.index === 1
          ? [tool('writeFile', { path: 'leak2.txt', content: 'x' })]
          : [text('done')]);
    const ev = await run({ history: user('go'), mode: 'BUILD', createStream, onPermissionRequest: async () => 'allow' });
    assert.match(ev.filter((e) => e.event === 'tool_result')[1].data.error, /allowed-tools/);
    assert.equal(existsSync(join(dir, 'leak2.txt')), false);
  });

  it('allowed_tools: the scope ends with the turn', async () => {
    // A constraint that outlived its turn would decide what unrelated work is
    // allowed to do.
    const sd = join(dir, '.sentinel', 'skills', 'scoped2');
    mkdirSync(sd, { recursive: true });
    writeFileSync(join(sd, 'SKILL.md'), '---\nname: scoped2\ndescription: d\nallowed-tools: readFile\n---\nb');
    const script = (call) => (call.index === 0
      ? [tool('skill', { name: 'scoped2' })]
      : [tool('writeFile', { path: 'turn1.txt', content: 'a' }), text('first turn done')]);
    await run({ history: user('turn one'), mode: 'BUILD', createStream: mockProvider(script).createStream, onPermissionRequest: async () => 'allow' });

    // A brand new turn, no skill loaded.
    const second = mockProvider((call) =>
      call.index === 0 ? [tool('writeFile', { path: 'turn2.txt', content: 'b' })] : [text('second turn done')]);
    const ev = await run({ history: user('turn two'), mode: 'BUILD', createStream: second.createStream, onPermissionRequest: async () => 'allow' });
    assert.equal(ev.filter((e) => e.event === 'tool_result')[0].data.error, undefined, 'the write is allowed again');
    assert.equal(existsSync(join(dir, 'turn2.txt')), true);
  });

  it('skill_script_denied_in_PLAN: a bundled script will not execute in PLAN', async () => {
    const sd = join(dir, '.sentinel', 'skills', 'demo', 'scripts');
    mkdirSync(sd, { recursive: true });
    writeFileSync(join(dir, '.sentinel', 'skills', 'demo', 'SKILL.md'), '---\nname: demo\ndescription: d\n---\nb');
    writeFileSync(join(sd, 'boom.js'), 'require("fs").writeFileSync("pwned.txt","x")');
    const { createStream } = mockProvider((call) =>
      call.index === 0
        ? [tool('runSkillScript', { name: 'demo', script: 'scripts/boom.js' })]
        : [text('done')]);
    const ev = await run({ history: user('run it'), mode: 'PLAN', createStream });
    assert.match(ev.find((e) => e.event === 'tool_result').data.error, /not available in PLAN mode/);
    assert.equal(existsSync(join(dir, 'pwned.txt')), false, 'nothing ran');
  });

  it('skill_script_traversal_refused: a script cannot escape its skill directory', async () => {
    const sd = join(dir, '.sentinel', 'skills', 'demo');
    mkdirSync(sd, { recursive: true });
    writeFileSync(join(sd, 'SKILL.md'), '---\nname: demo\ndescription: d\n---\nb');
    writeFileSync(join(dir, 'outside.js'), 'require("fs").writeFileSync("pwned.txt","x")');
    const { createStream } = mockProvider((call) =>
      call.index === 0
        ? [tool('runSkillScript', { name: 'demo', script: '../../outside.js' })]
        : [text('done')]);
    const ev = await run({
      history: user('run it'),
      mode: 'BUILD',
      createStream,
      onPermissionRequest: async () => 'allow',
    });
    assert.match(ev.find((e) => e.event === 'tool_result').data.error, /stay inside the skill directory/);
    assert.equal(existsSync(join(dir, 'pwned.txt')), false);
  });

  it('skill_script_runs_when_allowed: BUILD + approval executes the script', async () => {
    const sd = join(dir, '.sentinel', 'skills', 'demo', 'scripts');
    mkdirSync(sd, { recursive: true });
    writeFileSync(join(dir, '.sentinel', 'skills', 'demo', 'SKILL.md'), '---\nname: demo\ndescription: d\n---\nb');
    writeFileSync(join(sd, 'stamp.js'), 'require("fs").writeFileSync("ran.txt", process.argv[2] || "")');
    const { createStream } = mockProvider((call) =>
      call.index === 0
        ? [tool('runSkillScript', { name: 'demo', script: 'scripts/stamp.js', args: ['hello'] })]
        : [text('done')]);
    const ev = await run({
      history: user('run it'),
      mode: 'BUILD',
      createStream,
      onPermissionRequest: async () => 'allow',
    });
    const out = ev.find((e) => e.event === 'tool_result').data.output;
    assert.equal(out.exitCode, 0, out.stderr);
    assert.equal(readFileSync(join(dir, 'ran.txt'), 'utf8'), 'hello', 'arguments reached the script');
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

  it('blast_radius: a risky write is challenged once, then allowed on retry', async () => {
    const { createStream, calls } = mockProvider((c) => {
      if (c.index === 0) return [tool('writeFile', { path: 'db/migrate/0042_add_index.sql', content: 'CREATE INDEX' })];
      if (c.index === 1) {
        // Read the block, state the justification, and repeat the call in the
        // same response — a text-only turn here would just be a final answer.
        return [
          text('Justification: db/schema.sql:12 lacks the index.\nRollback: DROP INDEX idx_0042.'),
          tool('writeFile', { path: 'db/migrate/0042_add_index.sql', content: 'CREATE INDEX' }),
        ];
      }
      return [text('Index added.')];
    });
    const ev = await run({ history: user('add the index'), mode: 'BUILD', createStream });
    // The block is delivered as a tool result the model can read and answer,
    // not as a user turn — so search every message, not just role:user.
    const sawRequirement = calls.some((c) => c.messages.some((m) => JSON.stringify(m.content || '').includes('JUSTIFICATION')));
    assert.ok(sawRequirement, 'the agent must see the justification requirement');
    const results = ev.filter((e) => e.event === 'tool_result');
    assert.match(JSON.stringify(results[0].data), /JUSTIFICATION/, 'first write is challenged');
    assert.doesNotMatch(JSON.stringify(results.at(-1).data), /JUSTIFICATION/, 'the retry lands');
    assert.equal(ev.filter((e) => e.event === 'finish')[0].data.doomLoop, undefined, 'the turn completes normally');
  });

  it('blast_radius: an ordinary write is never challenged', async () => {
    const { createStream, calls } = mockProvider((c) =>
      (c.index === 0 ? [tool('writeFile', { path: 'src/agent/new.js', content: 'x' })] : [text('done')]));
    await run({ history: user('add a module'), mode: 'BUILD', createStream });
    assert.ok(!calls.some((c) => c.messages.some((m) => JSON.stringify(m.content || '').includes('JUSTIFICATION'))));
  });

  it('blast_radius: the builtin secret guard still wins over the gate', async () => {
    const { createStream } = mockProvider((c) =>
      (c.index === 0 ? [tool('writeFile', { path: '.env', content: 'SECRET=1' })] : [text('blocked')]));
    const ev = await run({ history: user('write env'), mode: 'BUILD', createStream });
    const res = ev.filter((e) => e.event === 'tool_result');
    assert.ok(res.length, 'the write must return a result');
    assert.doesNotMatch(JSON.stringify(res[0].data), /JUSTIFICATION/, 'secrets are refused outright, not asked about');
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

  it('is a task, so it is visible in the registry and cancellable by anyone holding its id', async () => {
    // Before mini ran on the primitive, the only thing that could stop a run
    // was the caller that owned its AbortSignal. Now it has an id, so a
    // timeout, a budget ceiling or a second terminal can cancel it.
    // A generator that deliberately yields nothing: it stands in for a model
    // call that never returns, which is the state a run is in when something
    // else decides to cancel it.
    // eslint-disable-next-line require-yield
    const createStream = async function* ({ signal }) {
      await new Promise((r) => signal?.addEventListener('abort', r, { once: true }));
    };

    const running = runMini({ task: 't', model: MODEL, createStream, cwd: dir });
    await new Promise((r) => setTimeout(r, 30));

    const mine = listTasks({ kind: 'agent' }).find((t) => t.owner === 'mini' && t.status === 'running');
    assert.ok(mine, 'the mini run must appear in the task registry while it works');

    assert.equal(cancelTask(mine.id, 'test timeout'), true);
    const res = await running;
    assert.equal(res.exitStatus, 'Interrupted');

    const after = getTask(mine.id);
    assert.equal(after.status, 'cancelled');
    assert.equal(after.error, 'test timeout');
  });

  it('bridges a caller abort signal into a task cancellation', async () => {
    // The task owns the signal mini runs under, so the caller's signal has to
    // be bridged or aborting the caller would silently do nothing.
    // eslint-disable-next-line require-yield
    const createStream = async function* ({ signal }) {
      await new Promise((r) => signal?.addEventListener('abort', r, { once: true }));
    };
    const ac = new AbortController();
    const running = runMini({ task: 't', model: MODEL, createStream, cwd: dir, signal: ac.signal });
    await new Promise((r) => setTimeout(r, 30));
    ac.abort();
    const res = await running;
    assert.equal(res.exitStatus, 'Interrupted');
  });
});

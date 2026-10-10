/**
 * Gate ordering — the property that has no test until now.
 *
 * `executeOneTool` used to be five sequential `if (…) return` blocks. Each gate
 * worked; the thing nothing checked was that they are evaluated in a deliberate
 * order. Order determines *which* message a user gets, so a reordering is a
 * behaviour change that no existing test would catch.
 *
 * These tests pin the order and each gate's trigger. They call `runPreGates`
 * directly with literals — no model, no stream, no turn — which is only possible
 * because the gates were extracted out of the loop.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runPreGates, assessCall, resolvePermissionGate, applySessionGrant, commandFor, GATE_ORDER } from '../src/agent/gates.js';
import { on, clearHooks } from '../src/agent/hooks.js';

const workdir = mkdtempSync(join(tmpdir(), 'sentinel-gates-'));
const base = {
  mode: 'BUILD',
  agentName: 'lead',
  workdir,
};

// ── Order ──────────────────────────────────────────────────────────────────

test('a dangerous command in PLAN mode is refused by the MODE gate, not the builtin guard', () => {
  // The ordering claim in gates.js, asserted rather than asserted-in-prose.
  // `rm -rf /` in PLAN mode should say "not available in PLAN mode": telling
  // someone a command is too dangerous when they were never allowed to run any
  // command is a confusing error, and it leaks a detail about the guard.
  return runPreGates({
    ...base, mode: 'PLAN', tool: 'bash', input: { command: 'rm -rf /' },
  }).then((r) => {
    assert.equal(r.gate, 'mode');
    assert.match(r.reason, /not available in PLAN mode/);
  });
});

test('the same command in BUILD mode reaches the builtin guard', () => {
  return runPreGates({ ...base, tool: 'bash', input: { command: 'rm -rf /' } }).then((r) => {
    assert.equal(r.gate, 'builtin');
    assert.match(r.reason, /dangerous/i);
  });
});

test('mode precedes hooks: a hook never sees a call the mode forbids', () => {
  clearHooks();
  let seen = 0;
  on('preToolUse', () => { seen++; return { block: true, reason: 'hook says no' }; });
  return runPreGates({ ...base, mode: 'PLAN', tool: 'bash', input: { command: 'ls' } }).then((r) => {
    assert.equal(r.gate, 'mode');
    assert.equal(seen, 0, 'a mode-blocked call must not reach the hook registry');
  }).finally(clearHooks);
});

test('a registered hook blocks after the builtin guard has passed', () => {
  clearHooks();
  on('preToolUse', () => ({ block: true, reason: 'hook says no' }));
  return runPreGates({ ...base, tool: 'readFile', input: { path: 'a.js' } }).then((r) => {
    assert.equal(r.gate, 'hook');
    assert.equal(r.reason, 'hook says no');
  }).finally(clearHooks);
});

test('a hook that throws does not block', () => {
  // A broken extension must not be able to stop the agent. This is the reason
  // runHooks is `.catch(() => null)` rather than awaited bare.
  clearHooks();
  on('preToolUse', () => { throw new Error('hook exploded'); });
  return runPreGates({ ...base, tool: 'readFile', input: { path: 'a.js' } }).then((r) => {
    assert.equal(r, null, 'a throwing hook must not refuse the call');
  }).finally(clearHooks);
});

test('a clean call returns null', () => {
  return runPreGates({ ...base, tool: 'readFile', input: { path: 'a.js' } }).then((r) => {
    assert.equal(r, null);
  });
});

// ── The self-message gate ─────────────────────────────────────────────────

test('messaging yourself is refused before the permission prompt', () => {
  return runPreGates({
    ...base, tool: 'sendMessage', input: { to: 'lead', message: 'hi' },
  }).then((r) => {
    assert.equal(r.gate, 'selfMessage');
    assert.match(r.reason, /there is no one to message/);
  });
});

test('messaging another agent is allowed', () => {
  return runPreGates({
    ...base, tool: 'sendMessage', input: { to: 'teammate', message: 'hi' },
  }).then((r) => assert.equal(r, null));
});

// ── External MCP tools ────────────────────────────────────────────────────

test('an external MCP tool bypasses the mode gate but is still classified as read-only', () => {
  // Unknown names are rejected in PLAN/REVIEW/SCAN because the mode check only
  // knows Sentinel's own read-only list. Third-party servers are trusted as
  // read-only by assumption — an assumption, not a promise.
  const externalTools = new Set(['some_mcp_tool']);
  return runPreGates({
    ...base, mode: 'PLAN', tool: 'some_mcp_tool', input: {}, externalTools,
  }).then((r) => assert.equal(r, null));
});

test('an unknown non-external tool does NOT bypass the mode gate', () => {
  return runPreGates({
    ...base, mode: 'PLAN', tool: 'mystery_tool', input: {}, externalTools: new Set(['other']),
  }).then((r) => assert.equal(r.gate, 'mode'));
});

// ── assessCall ────────────────────────────────────────────────────────────

test('assessCall classifies a shell command and leaves a file tool alone', () => {
  const shell = assessCall('bash', { command: 'git status' }, workdir);
  assert.equal(shell.shellish, true);
  assert.equal(shell.bashCheck.intent, 'read_only');
  assert.equal(shell.command, 'git status');

  const file = assessCall('editFile', { path: 'a.js' }, workdir);
  assert.equal(file.shellish, false);
  assert.equal(file.risk, null);
});

test('assessCall reconstructs the command a skill script will run', () => {
  // The load-bearing case. `runSkillScript` takes {name, script, args}, so the
  // command has to be rebuilt before it can be graded — and the gate must grade
  // the SAME string the executor runs, or it approves one thing and runs
  // another. `commandFor` and `runSkillScriptImpl` both call
  // `skillScriptCommand`, which is the only place that string is built.
  const dir = join(workdir, 'skillsrc');
  mkdirSync(join(dir, '.sentinel', 'skills', 'demo', 'scripts'), { recursive: true });
  writeFileSync(
    join(dir, '.sentinel', 'skills', 'demo', 'SKILL.md'),
    '---\nname: demo\ndescription: d\n---\nbody',
    'utf-8'
  );
  writeFileSync(join(dir, '.sentinel', 'skills', 'demo', 'scripts', 'go.js'), 'console.log(1)', 'utf-8');

  const input = { name: 'demo', script: 'scripts/go.js', args: ['alpha'] };
  const cmd = commandFor('runSkillScript', input, dir);
  assert.match(cmd, /^node /, 'runs the resolved interpreter');
  assert.match(cmd, /scripts[/\\]go\.js/, 'points at the real script');
  assert.match(cmd, /alpha$/, 'forwards arguments');

  const assessed = assessCall('runSkillScript', input, dir);
  assert.equal(assessed.shellish, true, 'a script run is shell work');
  assert.equal(assessed.command, cmd, 'the graded command is the one that runs');
  // Not green: this shape has never been approved in this repo, so a session
  // grant cannot cover it. A script from an installed skill must not be
  // silently pre-authorized by having approved some other tool.
  assert.equal(assessed.risk.level, 'yellow');
});

test('an unresolvable skill script grades as nothing, so nothing runs', () => {
  const dir = join(workdir, 'noskills');
  mkdirSync(dir, { recursive: true });
  for (const bad of [
    { name: 'nope', script: 'scripts/go.js' },
    { name: 'nope', script: '../../etc/passwd' },
    { name: 'nope', script: '' },
  ]) {
    assert.equal(commandFor('runSkillScript', bad, dir), '', JSON.stringify(bad));
  }
});

// ── resolvePermissionGate ─────────────────────────────────────────────────

test('a session grant for a shell tool must also be green on the risk ledger', () => {
  // The load-bearing condition. `allowAll.has('bash')` alone would mean "allow
  // bash for this session" silently authorizes the first `npm publish` to walk
  // by; the shape has to be known as well.
  //
  // The risk object comes from `assessCall` rather than being written by hand.
  // The first version of this test passed `{ level: 'yellow' }` and threw
  // inside `explainRisk`, which reads `risk.warnings.length` — a partial
  // fixture tested nothing except that the real shape has more fields.
  const assessed = assessCall('bash', { command: 'npm publish' }, workdir);
  assert.equal(assessed.risk.level, 'yellow', 'a novel shape in a fresh repo is yellow');
  return resolvePermissionGate({
    tool: 'bash', input: { command: 'npm publish' }, toolCallId: 'c1',
    allowAll: new Set(['bash']), onPermissionRequest: async () => 'deny',
    risk: assessed.risk, shellish: true,
  }).then((d) => {
    assert.notEqual(d.permission, 'allow');
    assert.equal(d.source, 'prompt', 'a novel shape must still be asked about');
  });
});

test('a session grant covers a green shell command without asking', () => {
  const assessed = assessCall('bash', { command: 'git status' }, workdir);
  assert.equal(assessed.risk.level, 'green');
  let asked = 0;
  return resolvePermissionGate({
    tool: 'bash', input: { command: 'git status' }, toolCallId: 'c1',
    allowAll: new Set(['bash']),
    onPermissionRequest: async () => { asked++; return 'deny'; },
    risk: assessed.risk, shellish: true,
  }).then((d) => {
    assert.equal(d.permission, 'allow');
    assert.equal(d.source, 'session');
    assert.equal(asked, 0, 'a covered shape must not re-ask');
  });
});

test('a non-shell tool is covered by the grant alone', () => {
  const allowAll = new Set(['editFile']);
  return resolvePermissionGate({
    tool: 'editFile', input: { path: 'a.js' }, toolCallId: 'c1',
    allowAll, onPermissionRequest: async () => 'deny', risk: null, shellish: false,
  }).then((d) => assert.equal(d.permission, 'allow'));
});

test('read-only tools are never asked', () => {
  let asked = 0;
  return resolvePermissionGate({
    tool: 'readFile', input: { path: 'a.js' }, toolCallId: 'c1',
    allowAll: new Set(), onPermissionRequest: async () => { asked++; return 'deny'; },
    risk: null, shellish: false,
  }).then((d) => {
    assert.equal(d.permission, null);
    assert.equal(d.source, 'implicit');
    assert.equal(asked, 0, 'a dialog per readFile stalls a live TUI turn for minutes');
  });
});

test('the prompt is told the risk when there is one', () => {
  const assessed = assessCall('bash', { command: 'npm publish' }, workdir);
  let seen = null;
  return resolvePermissionGate({
    tool: 'bash', input: { command: 'npm publish' }, toolCallId: 'c1',
    allowAll: new Set(), risk: assessed.risk, shellish: true,
    onPermissionRequest: async (_t, _i, input) => { seen = input; return 'deny'; },
  }).then(() => {
    assert.ok(seen.__risk, 'the approver must see why this is unfamiliar');
    assert.match(seen.__risk, /Unfamiliar in this repo|High risk/);
  });
});

// ── applySessionGrant ─────────────────────────────────────────────────────

test('a red command is never promoted to a session grant', () => {
  // The user said allow-session and it is still refused. Approving `rm -rf /`
  // once is what turns a repo's history into a list of things that nearly
  // happened.
  const allowAll = new Set();
  const result = applySessionGrant({
    permission: 'allow-session', tool: 'bash',
    risk: { level: 'red' }, bashCheck: { destructive: true },
    allowAll, workdir,
  });
  assert.equal(result, null);
  assert.equal(allowAll.size, 0, 'nothing may be remembered');
});

test('a destructive command is never promoted even when the ledger calls it yellow', () => {
  const allowAll = new Set();
  const result = applySessionGrant({
    permission: 'allow-session', tool: 'bash',
    risk: { level: 'yellow' }, bashCheck: { destructive: true },
    allowAll, workdir,
  });
  assert.equal(result, null);
  assert.equal(allowAll.size, 0);
});

test('a green non-shell tool is remembered', () => {
  const allowAll = new Set();
  const result = applySessionGrant({
    permission: 'allow-session', tool: 'editFile',
    risk: null, bashCheck: null, allowAll, workdir,
  });
  assert.equal(result, 'editFile');
  assert.ok(allowAll.has('editFile'));
});

test('a plain allow is not a session grant', () => {
  const allowAll = new Set();
  assert.equal(applySessionGrant({ permission: 'allow', tool: 'editFile', risk: null, bashCheck: null, allowAll, workdir }), null);
  assert.equal(allowAll.size, 0, 'allow covers one call; only allow-session is standing');
});

// ── The declared order matches the implementation ─────────────────────────

test('GATE_ORDER lists every gate runPreGates can return', () => {
  assert.deepEqual([...GATE_ORDER], ['mode', 'builtin', 'hook', 'blastRadius', 'selfMessage']);
});

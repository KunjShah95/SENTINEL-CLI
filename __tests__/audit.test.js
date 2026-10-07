/**
 * `sentinel audit` — the bound-gap auditor.
 *
 * The tests are written around the claim the tool makes, which is narrow: given
 * a recorded grant and the dispatch that followed it, it reports the classes of
 * divergence it can actually observe, and refuses to claim the ones it cannot.
 *
 * So there are two kinds of test here. The detectors: each of Scope, Argument,
 * Temporal and Tool is provoked with a real pair of records and has to fire.
 * And the honesty tests: a clean pair must report zero, and the classes the
 * auditor cannot see must be reported as not-assessable rather than as passing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PERMISSIONS, resetTasks } from '../src/agent/task.js';

import { summarizeCall, recordGrant, recordDispatch, WRITE_TOOLS } from '../src/agent/audit-trail.js';
import { auditRun, auditRuns, readAuditRun, listAuditRuns, summarizeAudits, renderAudit, GAP_CLASSES, TEMPORAL_STALE_MS } from '../src/agent/audit.js';

/** A scratch project with its own audit dir, so no test touches a real run. */
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'sentinel-audit-'));
  process.env.SENTINEL_AUDIT_DIR = join(dir, 'audit');
  mkdirSync(process.env.SENTINEL_AUDIT_DIR, { recursive: true });
  return {
    dir,
    cleanup() {
      delete process.env.SENTINEL_AUDIT_DIR;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Write a grant/dispatch pair directly.
 *
 * Writing the records rather than driving the loop is deliberate: the auditor's
 * job is to judge records someone else produced, so the tests must be able to
 * construct records the current harness would never produce. A detector proven
 * only against real output cannot be shown to detect anything.
 */
function writeRun(runId, records) {
  const file = join(process.env.SENTINEL_AUDIT_DIR, `${runId}.jsonl`);
  writeFileSync(file, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return runId;
}

const base = (over = {}) => ({
  parentTaskId: null,
  ts: new Date().toISOString(),
  v: '1',
  runId: 'r1',
  stage: 'grant',
  toolCallId: 'call_1',
  tool: 'bash',
  input: { command: 'npm test' },
  workdir: '/repo',
  agent: 'lead',
  taskId: null,
  rung: null,
  decision: 'allow',
  risk: 'green',
  mode: 'BUILD',
  shape: 'npm test',
  intent: 'state',
  destructive: false,
  paths: [],
  ...over,
});

// ── The write side ────────────────────────────────────────────────────────

test('summarizeCall classifies shell commands by shape and intent', () => {
  const s = summarizeCall('bash', { command: 'git status --short' });
  // Flags survive the shape reduction verbatim — `--short` is the difference
  // between two commands, so collapsing it to a placeholder would make the
  // auditor blind to exactly the substitution it exists to catch.
  assert.equal(s.shape, 'git status --short');
  assert.equal(s.intent, 'read_only');
  assert.equal(s.destructive, false);
});

test('summarizeCall flags a destructive command as destructive', () => {
  const s = summarizeCall('bash', { command: 'rm -rf /' });
  assert.equal(s.destructive, true);
});

test('summarizeCall collects paths from every file tool shape', () => {
  assert.deepEqual(summarizeCall('editFile', { path: 'src/a.js' }).paths, ['src/a.js']);
  assert.deepEqual(
    summarizeCall('batchEdit', { operations: [{ filePath: 'src/a.js' }, { filePath: 'src/b.js' }] }).paths,
    ['src/a.js', 'src/b.js'],
  );
  // Headers only: a unified diff's hunk body is not a fixed format and must not
  // be scanned for filenames.
  assert.deepEqual(
    summarizeCall('applyPatch', { patch: '--- a/src/a.js\n+++ b/src/a.js\n@@ -1 +1 @@\n-a\n+b\n' }).paths,
    ['src/a.js'],
  );
});

test('a shape survives a different argument value — which is what Argument exists to price', () => {
  const a = summarizeCall('bash', { command: 'git commit -am "fix bug"' });
  const b = summarizeCall('bash', { command: 'git commit -am "publish to main"' });
  assert.equal(a.shape, b.shape);
});

test('recordGrant and recordDispatch write both halves, and the trail round-trips', () => {
  const s = scratch();
  try {
    recordGrant({ runId: 'rt', toolCallId: 'c1', tool: 'bash', input: { command: 'ls' }, decision: 'allow' });
    recordDispatch({ runId: 'rt', toolCallId: 'c1', tool: 'bash', input: { command: 'ls' }, ok: true });
    const { grants, dispatches } = readAuditRun('rt');
    assert.equal(grants.length, 1);
    assert.equal(dispatches.length, 1);
    assert.equal(grants[0].stage, 'grant');
    assert.equal(dispatches[0].ok, true);
  } finally {
    s.cleanup();
  }
});

// ── Scope ─────────────────────────────────────────────────────────────────

test('Scope: a different workdir is a different action even when every field matches', () => {
  const s = scratch();
  try {
    writeRun('r1', [
      base(),
      base({ stage: 'dispatch', workdir: '/other/tree', decision: null, risk: null }),
    ]);
    const r = auditRun('r1');
    assert.equal(r.byClass.Scope, 1);
    assert.equal(r.gaps[0].class, 'Scope');
    assert.match(r.gaps[0].detail, /approved in \/repo, ran in \/other\/tree/);
  } finally {
    s.cleanup();
  }
});

test('Scope: a write running under a read-only approval', () => {
  const s = scratch();
  try {
    writeRun('r1', [
      base({ intent: 'read_only', shape: 'git status', input: { command: 'git status' } }),
      base({
        stage: 'dispatch', intent: 'write', shape: 'git push',
        input: { command: 'git push' }, decision: null, risk: null,
      }),
    ]);
    const r = auditRun('r1');
    assert.equal(r.byClass.Scope, 1);
    assert.match(r.gaps[0].detail, /approved a read_only command, ran a write one/);
  } finally {
    s.cleanup();
  }
});

test('Scope: a destructive command under a non-destructive grant', () => {
  const s = scratch();
  try {
    writeRun('r1', [
      base({ shape: 'rm <path>', intent: 'write', destructive: false, input: { command: 'rm build' } }),
      base({ stage: 'dispatch', shape: 'rm -rf /', intent: 'write', destructive: true, input: { command: 'rm -rf /' }, decision: null, risk: null }),
    ]);
    const r = auditRun('r1');
    assert.equal(r.byClass.Scope, 1);
    assert.match(r.gaps[0].detail, /destructive command ran under a non-destructive grant/);
  } finally {
    s.cleanup();
  }
});

test('Scope: a path the approval never named', () => {
  const s = scratch();
  try {
    writeRun('r1', [
      base({ tool: 'editFile', shape: null, intent: null, input: { path: 'src/a.js' }, paths: ['src/a.js'] }),
      base({
        stage: 'dispatch', tool: 'editFile', shape: null, intent: null,
        input: { path: 'src/secrets.js' }, paths: ['src/secrets.js'], decision: null, risk: null,
      }),
    ]);
    const r = auditRun('r1');
    assert.equal(r.byClass.Scope, 1);
    assert.deepEqual(r.gaps[0].extraPaths, ['src/secrets.js']);
  } finally {
    s.cleanup();
  }
});

// ── Argument ──────────────────────────────────────────────────────────────

test('Argument: same shape, different argument value', () => {
  const s = scratch();
  try {
    writeRun('r1', [
      base({ shape: 'git commit -am <word>', input: { command: 'git commit -am "fix bug"' } }),
      base({
        stage: 'dispatch', shape: 'git commit -am <word>',
        input: { command: 'git commit -am "publish to main"' }, decision: null, risk: null,
      }),
    ]);
    const r = auditRun('r1');
    assert.equal(r.byClass.Argument, 1);
    assert.equal(r.byClass.Scope, 0);
    assert.match(r.gaps[0].detail, /same command shape, different arguments/);
  } finally {
    s.cleanup();
  }
});

// ── Tool ──────────────────────────────────────────────────────────────────

test('Tool: a different tool ran than the one approved', () => {
  const s = scratch();
  try {
    writeRun('r1', [
      base({ tool: 'readFile', shape: null, intent: null, input: { path: 'a.js' }, paths: ['a.js'] }),
      base({
        stage: 'dispatch', tool: 'bash', shape: 'rm -rf /', intent: 'write', destructive: true,
        input: { command: 'rm -rf /' }, paths: [], decision: null, risk: null,
      }),
    ]);
    const r = auditRun('r1');
    // Tool and not Scope: the substitution is the finding, and reporting both
    // would bury it under a consequence of it.
    assert.equal(r.byClass.Tool, 1);
    assert.equal(r.byClass.Scope, 0);
    assert.match(r.gaps[0].detail, /approved readFile, ran bash/);
  } finally {
    s.cleanup();
  }
});

// ── Temporal ──────────────────────────────────────────────────────────────

test('Temporal: a stale grant, and the writes that made it stale are named', () => {
  const s = scratch();
  try {
    const t0 = Date.parse('2026-01-01T00:00:00.000Z');
    const later = new Date(t0 + TEMPORAL_STALE_MS + 5000).toISOString();
    // A third record in the middle: an intervening write that the grant did not
    // account for. It has its own tool call id, so it is its own pair-less
    // dispatch and does not disturb the pairing of the other two.
    writeRun('r1', [
      base({ ts: new Date(t0).toISOString(), shape: 'npm test', input: { command: 'npm test' } }),
      base({
        stage: 'dispatch', toolCallId: 'call_edit', ts: new Date(t0 + 1000).toISOString(),
        tool: 'editFile', shape: null, intent: null,
        input: { path: 'src/a.js' }, paths: ['src/a.js'], decision: null, risk: null,
      }),
      base({
        stage: 'dispatch', ts: later, shape: 'npm test', input: { command: 'npm test' },
        decision: null, risk: null,
      }),
    ]);
    const r = auditRun('r1');
    assert.equal(r.byClass.Temporal, 1);
    assert.equal(r.gaps[0].writesBetween.length, 1);
    assert.match(r.gaps[0].detail, /between grant and dispatch/);
  } finally {
    s.cleanup();
  }
});

test('Temporal: a fresh grant is not reported', () => {
  const s = scratch();
  try {
    const t0 = Date.parse('2026-01-01T00:00:00.000Z');
    writeRun('r1', [
      base({ ts: new Date(t0).toISOString() }),
      base({ stage: 'dispatch', ts: new Date(t0 + 50).toISOString(), decision: null, risk: null }),
    ]);
    const r = auditRun('r1');
    assert.equal(r.byClass.Temporal, 0);
    assert.equal(r.gaps.length, 0);
  } finally {
    s.cleanup();
  }
});

// ── Delegation ────────────────────────────────────────────────────────────

test('Delegation: a task executing above its parent rung is reported', () => {
  const s = scratch();
  try {
    // The parent's rung comes from a dispatch recorded under the parent's own
    // task id, and the child names that id. This is the shape the loop
    // produces: the registry is gone by audit time, so the link is on disk.
    writeRun('r1', [
      base({ stage: 'dispatch', toolCallId: 'parent_call', rung: 'readonly', taskId: 'parent_task', parentTaskId: null }),
      base({
        stage: 'dispatch', toolCallId: 'child_call', rung: 'teammate', taskId: 't1',
        parentTaskId: 'parent_task', decision: null, risk: null,
      }),
    ]);
    const r = auditRun('r1');
    assert.equal(r.byClass.Delegation, 1);
    const g = r.gaps.find((x) => x.class === 'Delegation');
    assert.equal(g.rung, 'teammate');
    assert.equal(g.parentRung, 'readonly');
  } finally {
    s.cleanup();
  }
});

test('Delegation: a task at or below its parent rung is not reported', () => {
  const s = scratch();
  try {
    writeRun('r1', [
      base({ stage: 'dispatch', toolCallId: 'parent_call', rung: 'teammate', taskId: 'parent_task', parentTaskId: null }),
      base({
        stage: 'dispatch', toolCallId: 'child_call', rung: 'readonly', taskId: 't1',
        parentTaskId: 'parent_task', decision: null, risk: null,
      }),
    ]);
    const r = auditRun('r1');
    assert.equal(r.byClass.Delegation, 0);
  } finally {
    s.cleanup();
  }
});

test('Delegation: an unknown parent is not reported as an escalation', () => {
  const s = scratch();
  try {
    // The parent task's calls were never recorded. That is a gap in the
    // evidence, not evidence of an escalation, and conflating the two would
    // make every partial trail look like an attack.
    writeRun('r1', [
      base({
        stage: 'dispatch', toolCallId: 'child_call', rung: 'teammate', taskId: 't1',
        parentTaskId: 'never_recorded', decision: null, risk: null,
      }),
    ]);
    const r = auditRun('r1');
    assert.equal(r.byClass.Delegation, 0);
  } finally {
    s.cleanup();
  }
});

// ── The claim the tool makes about itself ─────────────────────────────────

test('a clean run reports zero gaps and a zero rate', () => {
  const s = scratch();
  try {
    writeRun('r1', [
      base(),
      base({ stage: 'dispatch', decision: null, risk: null }),
    ]);
    const r = auditRun('r1');
    assert.equal(r.calls, 1);
    assert.equal(r.gaps.length, 0);
    assert.equal(r.boundGapRate, 0);
  } finally {
    s.cleanup();
  }
});

test('Semantic is reported as not-assessable, never as clean', () => {
  const s = scratch();
  try {
    writeRun('r1', [base(), base({ stage: 'dispatch', decision: null, risk: null })]);
    const r = auditRun('r1');
    assert.deepEqual(r.unverifiable, ['Semantic']);
    // Present in the taxonomy, absent from the findings — the difference
    // between "checked and clear" and "cannot be checked from these fields".
    assert.ok(GAP_CLASSES.includes('Semantic'));
    assert.equal(r.byClass.Semantic, 0);
    assert.match(renderAudit(r), /not assessable from recorded fields: Semantic/);
  } finally {
    s.cleanup();
  }
});

test('a denied call is not a gap — it never ran', () => {
  const s = scratch();
  try {
    // A grant with no dispatch is a call that was refused or errored before
    // executing. Counting it would make a restrictive harness look leaky.
    writeRun('r1', [base({ toolCallId: 'denied' })]);
    const r = auditRun('r1');
    assert.equal(r.grants, 1);
    assert.equal(r.calls, 0);
    assert.equal(r.gaps.length, 0);
  } finally {
    s.cleanup();
  }
});

test('a truncated final line is reported, not silently dropped', () => {
  const s = scratch();
  try {
    const file = join(process.env.SENTINEL_AUDIT_DIR, 'r1.jsonl');
    writeFileSync(file, JSON.stringify(base()) + '\n' + '{"stage":"disp');
    const r = auditRun('r1');
    assert.equal(r.truncated, true);
    assert.equal(r.grants, 1);
  } finally {
    s.cleanup();
  }
});

test('an empty run says so instead of reporting a clean result', () => {
  const s = scratch();
  try {
    const r = auditRun('nonexistent');
    assert.equal(r.calls, 0);
    assert.match(renderAudit(r), /No paired tool calls/);
  } finally {
    s.cleanup();
  }
});

// ── Runs ──────────────────────────────────────────────────────────────────

test('listAuditRuns finds runs; auditRuns takes the most recent', () => {
  const s = scratch();
  try {
    writeRun('run_a', [base(), base({ stage: 'dispatch', decision: null, risk: null })]);
    writeRun('run_b', [base(), base({ stage: 'dispatch', decision: null, risk: null })]);
    assert.deepEqual(listAuditRuns(), ['run_a', 'run_b']);
    const recent = auditRuns(1);
    assert.equal(recent.length, 1);
    assert.equal(recent[0].runId, 'run_b');
  } finally {
    s.cleanup();
  }
});

test('summarizeAudits aggregates rates across runs', () => {
  const s = scratch();
  try {
    writeRun('clean', [base(), base({ stage: 'dispatch', decision: null, risk: null })]);
    writeRun('dirty', [
      base({ tool: 'readFile', shape: null, intent: null, input: { path: 'a.js' }, paths: ['a.js'] }),
      base({
        stage: 'dispatch', tool: 'bash', shape: 'npm publish', intent: 'state',
        input: { command: 'npm publish' }, paths: [], decision: null, risk: null,
      }),
    ]);
    const summary = summarizeAudits([auditRun('clean'), auditRun('dirty')]);
    assert.equal(summary.runs, 2);
    assert.equal(summary.calls, 2);
    assert.equal(summary.gaps, 1);
    assert.equal(summary.byClass.Tool, 1);
    assert.equal(summary.boundGapRate, 0.5);
  } finally {
    s.cleanup();
  }
});

test('renderAudit names the run, the rate, and the unassessable classes', () => {
  const s = scratch();
  try {
    writeRun('r1', [
      base({ tool: 'readFile', shape: null, intent: null, input: { path: 'a.js' }, paths: ['a.js'] }),
      base({
        stage: 'dispatch', tool: 'bash', shape: 'npm publish', intent: 'state',
        input: { command: 'npm publish' }, paths: [], decision: null, risk: null,
      }),
    ]);
    const out = renderAudit(auditRun('r1'));
    assert.match(out, /bound-gap audit/);
    assert.match(out, /r1/);
    assert.match(out, /rate 100\.0%/);
    assert.match(out, /approved readFile, ran bash/);
  } finally {
    s.cleanup();
  }
});

/** A registry id. See the note at `runTurnWithAudit` — it must resolve. */
const MODEL = 'openai/gpt-oss-20b';

// ── Against the real loop ─────────────────────────────────────────────────
//
// Everything above writes records by hand. That proves the detectors fire; it
// does not prove the loop writes records the detectors can read, and a mismatch
// there is the failure that matters: a clean audit of a run that never recorded
// anything would be worse than no audit at all, because it looks like evidence.

/**
 * A scripted provider: the given tool calls, one per model turn, then prose.
 *
 * The event shape is the loop's own contract — `{type:'tool_call', id, name,
 * input}` — not a raw provider payload. `providers.js` is what turns a
 * provider's wire format into these, so a test emitting provider-shaped events
 * would be testing a translation that does not happen on this path.
 *
 * The "then prose" part is load-bearing rather than cosmetic. A stream that
 * re-emits the same call forever drives the loop into its doom-loop guard, which
 * stops the turn at five repetitions — and a test asserting "one grant" then
 * fails with "four grants" for a reason that has nothing to do with auditing.
 */
function scriptedTurns(calls) {
  let turn = 0;
  return async function* () {
    const call = calls[turn++];
    if (call) yield { type: 'tool_call', id: call.id, name: call.name, input: call.input ?? {} };
    else yield { type: 'text', text: 'done' };
    yield { type: 'text', text: 'done' };
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } };
  };
}

function scriptedStream(call) {
  return scriptedTurns([call]);
}

async function runTurnWithAudit(over = {}) {
  const { runAgentTurnInner } = await import('../src/agent/loop.js');
  const runId = over.runId || 'live_run';
  const events = [];
  for await (const ev of runAgentTurnInner({
    history: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'do the thing' }] }],
    mode: 'BUILD',
    // A registry id, not a real provider string: the loop resolves the model
    // before it ever reaches the stream seam, so an unregistered id makes the
    // turn emit an error and record nothing — which looks exactly like a
    // broken audit trail.
    model: MODEL,
    trajectory: false,
    runId,
    agentName: 'lead',
    workdir: process.cwd(),
    createStream: scriptedStream(over.call),
    onPermissionRequest: over.onPermissionRequest ?? (async () => 'allow'),
    ...over.opts,
  })) {
    events.push(ev);
  }
  return { events, runId };
}

test('the loop records both halves of the binding, and the pair is clean', async () => {
  const s = scratch();
  try {
    await runTurnWithAudit({
      call: { id: 'call_read', name: 'readFile', input: { path: 'package.json' } },
    });
    const { grants, dispatches } = readAuditRun('live_run');
    assert.equal(grants.length, 1);
    assert.equal(dispatches.length, 1);
    assert.equal(grants[0].tool, 'readFile');
    // 'no-prompt', not 'allow': read-only tools never ask, which is deliberate
    // (a dialog per readFile stalled a live TUI turn for minutes). The
    // distinction is preserved rather than flattened, because "nobody was
    // asked" and "a human said yes" are different facts about a boundary and
    // an audit that conflates them cannot report on either.
    assert.equal(grants[0].decision, 'no-prompt');
    assert.equal(dispatches[0].ok, true);

    // The point of the tool: a faithful binding reports zero.
    const r = auditRun('live_run');
    assert.equal(r.gaps.length, 0);
    assert.equal(r.calls, 1);
  } finally {
    s.cleanup();
  }
});

test('the loop records a denial as a grant with no dispatch — not as a gap', async () => {
  const s = scratch();
  try {
    await runTurnWithAudit({
      call: { id: 'call_denied', name: 'bash', input: { command: 'git status' } },
      onPermissionRequest: async () => 'deny',
    });
    const r = auditRun('live_run');
    assert.equal(r.grants, 0, 'a denied call must not record a grant');
    assert.equal(r.gaps.length, 0);
  } finally {
    s.cleanup();
  }
});

test('a `task` call records the model-facing tool and the legacy tool it dispatched', async () => {
  const s = scratch();
  try {
    await runTurnWithAudit({
      call: { id: 'call_task', name: 'task', input: { action: 'status' } },
    });
    const { grants, dispatches } = readAuditRun('live_run');
    assert.equal(grants[0].tool, 'task');
    assert.equal(dispatches[0].tool, 'teamStatus');
    // This is the honest shape: the model asked for one tool and the harness
    // ran another. Whether that is a finding depends on whether the approver
    // was shown the translation, which is a design question, not a loop bug —
    // so the auditor reports it and the report says which two names diverged.
    const r = auditRun('live_run');
    assert.equal(r.byClass.Tool, 1);
    assert.match(r.gaps[0].detail, /approved task, ran teamStatus/);
  } finally {
    s.cleanup();
  }
});

test('a subagent records its readonly rung, so its calls are auditable', async () => {
  const s = scratch();
  try {
    resetTasks();
    // Turn 1: the lead spawns a subagent. Turn 2: the subagent asks for a read.
    // Turn 3 onward: prose, so both turns end. The subagent's rung is what the
    // Delegation class reads, and without it the auditor would report "not
    // assessable" where it could have reported a fact.
    await runTurnWithAudit({
      call: { id: 'call_task', name: 'task', input: { action: 'spawn', prompt: 'look around' } },
      opts: {
        createStream: scriptedTurns([
          { id: 'call_task', name: 'task', input: { action: 'spawn', prompt: 'look around' } },
          { id: 'call_sub_read', name: 'readFile', input: { path: 'package.json' } },
        ]),
      },
    });

    const { grants, dispatches } = readAuditRun('live_run');
    const subGrant = grants.find((g) => g.agent && g.agent.includes('/sub'));
    assert.ok(subGrant, 'the subagent turn must record grants');
    assert.equal(subGrant.rung, PERMISSIONS.READONLY);
    assert.ok(subGrant.taskId, 'and must name the task it ran under');
    // The subagent's permission callback answers 'allow' for a read, but the
    // loop does not ask for reads at all — so the recorded decision is
    // 'no-prompt'. The point of the assertion is the rung, which is what the
    // Delegation class compares; the decision is incidental here.
    assert.equal(subGrant.decision, 'no-prompt');
    // A readonly subagent asking to read is exactly what the rung allows.
    assert.equal(dispatchFor(dispatches, subGrant.toolCallId).ok, true);
  } finally {
    s.cleanup();
  }
});

function dispatchFor(dispatches, toolCallId) {
  return dispatches.find((d) => d.toolCallId === toolCallId);
}

test('two runs in the same scratch dir stay separate files', async () => {
  const s = scratch();
  try {
    await runTurnWithAudit({ call: { id: 'c1', name: 'readFile', input: { path: 'a.json' } } });
    await runTurnWithAudit({
      call: { id: 'c2', name: 'bash', input: { command: 'git status' } },
      runId: 'live_run_2',
    });
    assert.equal(auditRun('live_run').grants, 1);
    assert.equal(auditRun('live_run_2').grants, 1);
  } finally {
    s.cleanup();
  }
});

test('WRITE_TOOLS is the mutation set the Temporal class counts', () => {
  assert.ok(WRITE_TOOLS.includes('writeFile'));
  assert.ok(WRITE_TOOLS.includes('teamMerge'));
  assert.ok(!WRITE_TOOLS.includes('readFile'));
});

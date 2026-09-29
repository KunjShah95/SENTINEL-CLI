/**
 * Handoff — trajectory in, runbook out.
 * Builds synthetic trajectories, so no model and no real run required.
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildHandoff, renderRunbook, listHandoffs, HANDOFF_VERSION, PERSISTENCE_LIMIT } from '../src/agent/handoff.js';
import { newRunId } from '../src/agent/trajectory.js';

const ev = (event, data, extra = {}) => ({ ts: new Date().toISOString(), runId: 'r', seq: 0, event, data, ...extra });
const asJson = (o) => JSON.stringify(o);
const call = (id, name, input) => ev('tool_call', asJson({ toolCallId: id, toolName: name, input }));
const result = (id, error) => ev('tool_result', asJson({ toolCallId: id, ...(error ? { error } : {}) }));

let dir;
let runId;

function writeRun(events) {
  const file = join(dir, '.sentinel', 'trajectories', `${runId}.jsonl`);
  mkdirSync(join(dir, '.sentinel', 'trajectories'), { recursive: true });
  writeFileSync(file, events.map((e, i) => JSON.stringify({ ...e, runId, seq: i })).join('\n') + '\n', 'utf-8');
  return file;
}

/** A realistic run: read, edit, fail twice, pass, edit again, claim. */
function sampleRun(prompt = 'fix the flaky sync test') {
  return [
    ev('start', asJson({ prompt, goal: 'npm test exits 0' }), { mode: 'BUILD', model: 'openai/gpt-oss-20b' }),
    call('c1', 'readFile', { path: 'src/sync.js' }),
    result('c1'),
    call('c2', 'editFile', { path: 'src/sync.js', newContent: 'patch 1' }),
    result('c2'),
    call('c3', 'bash', { command: 'npm test' }),
    result('c3', 'AssertionError: expected 3 got 4'),
    call('c4', 'editFile', { path: 'src/sync.js', newContent: 'patch 2' }),
    result('c4'),
    call('c5', 'bash', { command: 'npm test' }),
    result('c5', 'AssertionError: still failing'),
    call('c6', 'editFile', { path: 'src/sync.js', newContent: 'patch 3' }),
    result('c6'),
    call('c7', 'bash', { command: 'npm test' }),
    result('c7'),
    ev('text', asJson({ delta: 'Rewrote the parser. All tests pass now.' })),
    ev('finish', asJson({ usage: {} }), { costUsd: 0.0042 }),
  ];
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sentinel-handoff-'));
  runId = newRunId();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('buildHandoff', () => {
  test('extracts the prompt, mode, model and cost', () => {
    writeRun(sampleRun('fix the flaky sync test'));
    const h = buildHandoff(runId, { cwd: dir });
    assert.equal(h.version, HANDOFF_VERSION);
    assert.equal(h.prompt, 'fix the flaky sync test');
    assert.equal(h.mode, 'BUILD');
    assert.equal(h.model, 'openai/gpt-oss-20b');
    assert.equal(h.finished, true);
    assert.equal(h.goal, 'npm test exits 0');
  });

  test('lists only files that were successfully written', () => {
    writeRun([
      ...sampleRun(),
      call('c8', 'editFile', { path: 'src/other.js' }),
      result('c8', 'denied permission'),
    ]);
    const h = buildHandoff(runId, { cwd: dir });
    assert.deepEqual(h.changed, ['src/sync.js'], 'a denied edit is not a change');
  });

  test('verified means exited 0, not merely attempted', () => {
    writeRun(sampleRun());
    const h = buildHandoff(runId, { cwd: dir });
    assert.equal(h.verified.length, 1);
    assert.equal(h.verified[0].command, 'npm test', 'the same command twice is one line, and the last result won');
  });

  test('a run where every command failed verifies nothing', () => {
    writeRun([
      ev('start', asJson({ prompt: 'x' }), { mode: 'BUILD' }),
      call('c1', 'bash', { command: 'npm test' }),
      result('c1', 'boom'),
      ev('finish', asJson({})),
    ]);
    const h = buildHandoff(runId, { cwd: dir });
    assert.deepEqual(h.verified, []);
    assert.ok(h.fragile.some((f) => /No command exited 0/.test(f)));
  });

  test('tried-and-rejected names the dead end and how it failed', () => {
    writeRun(sampleRun());
    const h = buildHandoff(runId, { cwd: dir });
    const bashAttempt = h.deadEnds.find((d) => d.name === 'bash');
    assert.ok(bashAttempt, JSON.stringify(h.deadEnds));
    assert.equal(bashAttempt.shape, 'npm test');
    assert.equal(bashAttempt.total, 3);
    assert.equal(bashAttempt.failed, 2);
  });

  test('a repeated non-failing call is still a dead end', () => {
    const events = [ev('start', asJson({ prompt: 'x' }), { mode: 'BUILD' })];
    for (let i = 0; i < PERSISTENCE_LIMIT; i++) {
      events.push(call(`c${i}`, 'grep', { pattern: 'flakyTest', path: 'src' }), result(`c${i}`));
    }
    events.push(ev('finish', asJson({})));
    writeRun(events);
    const h = buildHandoff(runId, { cwd: dir });
    const g = h.deadEnds.find((d) => d.name === 'grep');
    assert.ok(g, 'grepping the same way over and over is a dead end');
    assert.equal(g.total, PERSISTENCE_LIMIT);
  });

  test('different greps are different attempts, not one dead end', () => {
    const events = [ev('start', asJson({ prompt: 'x' }), { mode: 'BUILD' })];
    for (let i = 0; i < PERSISTENCE_LIMIT; i++) {
      events.push(call(`c${i}`, 'grep', { pattern: `needle${i}`, path: 'src' }), result(`c${i}`));
    }
    events.push(ev('finish', asJson({})));
    writeRun(events);
    const h = buildHandoff(runId, { cwd: dir });
    assert.ok(!h.deadEnds.some((d) => d.name === 'grep'), 'three different searches are exploration, not a loop');
  });

  test('reads are not dead ends — nobody is surprised by readFile', () => {
    writeRun([
      ...sampleRun(),
      call('c9', 'readFile', { path: 'src/a.js' }), result('c9'),
      call('c10', 'readFile', { path: 'src/b.js' }), result('c10'),
      call('c11', 'readFile', { path: 'src/c.js' }), result('c11'),
    ]);
    const h = buildHandoff(runId, { cwd: dir });
    assert.ok(!h.deadEnds.some((d) => d.name === 'readFile'), 'three reads is not a dead end');
  });

  test('an unfinished run is flagged, not quietly presented as done', () => {
    writeRun([
      ev('start', asJson({ prompt: 'x' }), { mode: 'BUILD' }),
      call('c1', 'bash', { command: 'npm test' }),
      result('c1', 'timeout'),
    ]);
    const h = buildHandoff(runId, { cwd: dir });
    assert.equal(h.finished, false);
    assert.ok(h.fragile.some((f) => /did not finish/.test(f)));
  });

  test('an unmet goal is surfaced verbatim', () => {
    writeRun([
      ev('start', asJson({ prompt: 'x', goal: 'npm test exits 0' }), { mode: 'BUILD' }),
      ev('goal', asJson({ ok: false, reason: 'no test output was produced', check: 1 })),
      ev('finish', asJson({})),
    ]);
    const h = buildHandoff(runId, { cwd: dir });
    assert.ok(h.fragile.some((f) => f.includes('no test output was produced')));
  });

  test('claims the receipts did not support are listed as untrustworthy', () => {
    writeRun([
      ...sampleRun(),
      ev('receipts', asJson({ blocking: false, claims: [
        { kind: 'tests', status: 'supported' },
        { kind: 'build', status: 'unsupported' },
        { kind: 'lint', status: 'stale' },
      ] })),
    ]);
    const h = buildHandoff(runId, { cwd: dir });
    assert.equal(h.claims.length, 2, 'a supported claim is not a risk');
    const build = h.claims.find((c) => c.kind === 'build');
    assert.equal(build.status, 'unsupported');
    assert.match(build.why, /no matching command ever ran/);
  });

  test('a clean run produces nothing fragile', () => {
    writeRun([
      ev('start', asJson({ prompt: 'x' }), { mode: 'BUILD' }),
      call('c1', 'bash', { command: 'npm test' }),
      result('c1'),
      ev('receipts', asJson({ blocking: false, claims: [{ kind: 'tests', status: 'supported' }] })),
      ev('finish', asJson({}), { costUsd: 0.001 }),
    ]);
    const h = buildHandoff(runId, { cwd: dir });
    assert.deepEqual(h.fragile, []);
    assert.deepEqual(h.claims, []);
  });

  test('a run with no prompt is still reportable', () => {
    writeRun([ev('start', asJson({}), { mode: 'PLAN' }), ev('finish', asJson({}))]);
    const h = buildHandoff(runId, { cwd: dir });
    assert.equal(h.prompt, '');
    assert.match(renderRunbook(h), /no recorded prompt/);
  });

  test('the final text is recovered from streamed deltas', () => {
    writeRun([
      ...sampleRun(),
      ev('text', asJson({ delta: 'Rewrote ' })),
      ev('text', asJson({ delta: 'the parser.' })),
    ]);
    const h = buildHandoff(runId, { cwd: dir });
    assert.match(h.finalText, /Rewrote the parser\./);
  });
});

describe('renderRunbook', () => {
  test('has every section a reader needs', () => {
    writeRun(sampleRun());
    const md = renderRunbook(buildHandoff(runId, { cwd: dir }));
    for (const h of ['## What changed', '## What was verified', '## What was tried and rejected', '## Still fragile']) {
      assert.ok(md.includes(h), h);
    }
  });

  test('says plainly when nothing was verified', () => {
    writeRun([
      ev('start', asJson({ prompt: 'x' }), { mode: 'BUILD' }),
      call('c1', 'bash', { command: 'npm test' }),
      result('c1', 'fail'),
      ev('finish', asJson({})),
    ]);
    const md = renderRunbook(buildHandoff(runId, { cwd: dir }));
    assert.match(md, /\*\*Nothing was verified\.\*\*/);
  });

  test('the dead-ends section explains why it exists', () => {
    writeRun(sampleRun());
    const md = renderRunbook(buildHandoff(runId, { cwd: dir }));
    assert.match(md, /wasting a day/);
    assert.match(md, /npm test/);
  });

  test('points at the run id so the reader can reproduce it', () => {
    writeRun(sampleRun());
    const md = renderRunbook(buildHandoff(runId, { cwd: dir }));
    assert.ok(md.includes(`sentinel replay ${runId}`));
  });
});

describe('handoffFile', () => {
  test('points inside .sentinel so it stays gitignored runtime state', async () => {
    const { handoffFile, readHandoff } = await import('../src/agent/handoff.js');
    assert.equal(handoffFile(dir), join(dir, '.sentinel', 'HANDOFF.md'));
    assert.equal(readHandoff(dir), null, 'no runbook yet is null, not a throw');
  });
});

describe('listHandoffs', () => {
  test('is empty with no recordings rather than throwing', () => {
    assert.deepEqual(listHandoffs(dir), []);
  });

  test('lists runs newest first with a prompt', () => {
    const a = newRunId();
    const b = newRunId();
    const mk = (id, prompt) => {
      const file = join(dir, '.sentinel', 'trajectories', `${id}.jsonl`);
      mkdirSync(join(dir, '.sentinel', 'trajectories'), { recursive: true });
      writeFileSync(file, JSON.stringify({ runId: id, seq: 0, event: 'start', data: JSON.stringify({ prompt }), mode: 'BUILD' }) + '\n', 'utf-8');
    };
    mk(a, 'first');
    mk(b, 'second');
    const runs = listHandoffs(dir);
    assert.equal(runs.length, 2);
    assert.ok(runs.every((r) => r.runId === a || r.runId === b));
  });
});

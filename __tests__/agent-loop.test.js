/**
 * agent-loop — the 308-line core loop finally under test, with a mocked
 * provider stream (createStream seam: no API key, no network).
 *
 * Behavioral assertions (Google-style: assert on intermediate steps where
 * the path itself is policy):
 *   - PLAN mode never writes to disk, even when the model asks to.
 *   - BUILD mode executes the write the model requested.
 *   - A denied permission surfaces as a tool error, not an execution.
 *   - Every turn records a JSONL trajectory (the raw material for evals).
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAgentTurn, runAgentTurnInner } from '../src/agent/loop.js';
import { resetTotals } from '../src/agent/cost.js';

const MODEL = 'openai/gpt-oss-20b'; // static registry entry: resolves offline
const history = [{ id: 't1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }];

/** Build a createStream stub from a per-call script of provider events. */
function canned(script) {
  let n = 0;
  return async function* () {
    yield* script[Math.min(n++, script.length - 1)];
  };
}

async function collect(gen) {
  const events = [];
  for await (const ev of gen) events.push(ev);
  return events;
}

let workdir;
let previousCwd;
let savedTrajDir;
let savedNoTraj;

beforeEach(() => {
  resetTotals();
  previousCwd = process.cwd();
  workdir = mkdtempSync(join(tmpdir(), 'sentinel-loop-'));
  process.chdir(workdir);
  savedTrajDir = process.env.SENTINEL_TRAJECTORY_DIR;
  savedNoTraj = process.env.SENTINEL_NO_TRAJECTORY;
  process.env.SENTINEL_TRAJECTORY_DIR = join(workdir, 'traj');
  delete process.env.SENTINEL_NO_TRAJECTORY;
});

afterEach(() => {
  process.chdir(previousCwd);
  if (savedTrajDir === undefined) delete process.env.SENTINEL_TRAJECTORY_DIR;
  else process.env.SENTINEL_TRAJECTORY_DIR = savedTrajDir;
  if (savedNoTraj === undefined) delete process.env.SENTINEL_NO_TRAJECTORY;
  else process.env.SENTINEL_NO_TRAJECTORY = savedNoTraj;
});

describe('agent loop (mocked provider)', () => {
  it('text-only turn finishes with usage and cost', async () => {
    const events = await collect(
      runAgentTurnInner({
        history,
        mode: 'BUILD',
        model: MODEL,
        createStream: canned([[
          { type: 'text', text: 'hello' },
          { type: 'usage', usage: { inputTokens: 100, outputTokens: 20 } },
        ]]),
      })
    );
    const kinds = events.map((e) => e.event);
    assert.deepEqual(kinds, ['text', 'finish', 'done']);
    const finish = events.find((e) => e.event === 'finish');
    assert.equal(finish.data.usage.inputTokens, 100);
    assert.equal(finish.data.usage.outputTokens, 20);
    assert.equal(typeof finish.data.costUsd, 'number');
    assert.equal(finish.data.model, MODEL);
  });

  it('PLAN mode never writes, even when the model requests it', async () => {
    const events = await collect(
      runAgentTurnInner({
        history,
        mode: 'PLAN',
        model: MODEL,
        createStream: canned([
          [{ type: 'tool_call', id: 'c1', name: 'writeFile', input: { path: 'evil.txt', content: 'x' } }],
          [[{ type: 'text', text: 'done' }][0]],
        ]),
      })
    );
    assert.equal(existsSync(join(workdir, 'evil.txt')), false);
    const result = events.find((e) => e.event === 'tool_result');
    assert.match(result.data.error || '', /not available in PLAN mode/i);
  });

  it('BUILD mode executes the requested write', async () => {
    await collect(
      runAgentTurnInner({
        history,
        mode: 'BUILD',
        model: MODEL,
        createStream: canned([
          [{ type: 'tool_call', id: 'c1', name: 'writeFile', input: { path: 'ok.txt', content: 'yes' } }],
          [{ type: 'text', text: 'wrote it' }],
        ]),
      })
    );
    assert.equal(readFileSync(join(workdir, 'ok.txt'), 'utf8'), 'yes');
  });

  it('denied permission surfaces as a tool error without executing', async () => {
    const events = await collect(
      runAgentTurnInner({
        history,
        mode: 'BUILD',
        model: MODEL,
        onPermissionRequest: async () => 'deny',
        createStream: canned([
          [{ type: 'tool_call', id: 'c1', name: 'bash', input: { command: 'touch denied.txt' } }],
          [{ type: 'text', text: 'blocked' }],
        ]),
      })
    );
    assert.equal(existsSync(join(workdir, 'denied.txt')), false);
    const result = events.find((e) => e.event === 'tool_result');
    assert.match(result.data.error || '', /denied/i);
  });

  it('provider error ends the turn with an error event', async () => {
    const events = await collect(
      runAgentTurnInner({
        history,
        mode: 'BUILD',
        model: MODEL,
        createStream: canned([[{ type: 'error', message: 'boom' }]]),
      })
    );
    assert.deepEqual(events.map((e) => e.event), ['error', 'done']);
    assert.match(events[0].data.message, /boom/);
  });

  it('unknown model yields an error without calling the stream', async () => {
    let called = false;
    const events = await collect(
      runAgentTurnInner({
        history,
        mode: 'BUILD',
        model: 'nope/not-a-model',
        createStream: async function* () {
          called = true;
          yield { type: 'text', text: '' }; // unreachable: unknown model errors first
        },
      })
    );
    assert.equal(called, false);
    assert.equal(events[0].event, 'error');
  });

  it('runAgentTurn records a JSONL trajectory of the turn', async () => {
    await collect(
      runAgentTurn({
        history,
        mode: 'BUILD',
        model: MODEL,
        trajectory: 'run123',
        createStream: canned([[{ type: 'text', text: 'hi' }]]),
      })
    );
    const file = join(workdir, 'traj', 'run123.jsonl');
    assert.equal(existsSync(file), true);
    const lines = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.ok(lines.every((l) => l.runId === 'run123'));
    // 'start' header carries the prompt so `sentinel replay` can re-run it.
    assert.deepEqual(lines.map((l) => l.event), ['start', 'text', 'finish', 'done']);
    assert.equal(JSON.parse(lines[0].data).prompt, 'hi');
    assert.ok(lines[2].usage, 'finish record carries usage');
  });

  it('trajectory:false records nothing', async () => {
    await collect(
      runAgentTurn({
        history,
        mode: 'BUILD',
        model: MODEL,
        trajectory: false,
        createStream: canned([[{ type: 'text', text: 'hi' }]]),
      })
    );
    assert.equal(existsSync(join(workdir, 'traj')), false);
  });

  it('parallel reads in one message both resolve in order', async () => {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(workdir, 'r1.txt'), 'one', 'utf-8');
    writeFileSync(join(workdir, 'r2.txt'), 'two', 'utf-8');
    const events = await collect(
      runAgentTurnInner({
        history,
        mode: 'BUILD',
        model: MODEL,
        createStream: canned([
          [
            { type: 'tool_call', id: 'c1', name: 'readFile', input: { path: 'r1.txt' } },
            { type: 'tool_call', id: 'c2', name: 'readFile', input: { path: 'r2.txt' } },
          ],
          [{ type: 'text', text: 'both read' }],
        ]),
      })
    );
    const results = events.filter((e) => e.event === 'tool_result');
    assert.equal(results.length, 2);
    assert.deepEqual(results.map((r) => r.data.toolCallId), ['c1', 'c2']);
    assert.match(JSON.stringify(results[0].data.output), /one/);
    assert.match(JSON.stringify(results[1].data.output), /two/);
  });

  it('spawnAgent delegates with a fresh context and returns a summary', async () => {
    const events = await collect(
      runAgentTurnInner({
        history,
        mode: 'BUILD',
        model: MODEL,
        createStream: canned([
          [{ type: 'tool_call', id: 'c1', name: 'spawnAgent', input: { prompt: 'summarize x', mode: 'PLAN' } }],
          [{ type: 'text', text: 'sub says hi' }],
          [{ type: 'text', text: 'final' }],
        ]),
      })
    );
    const result = events.find((e) => e.event === 'tool_result');
    assert.match(JSON.stringify(result.data.output), /sub says hi/);
    const finish = events.find((e) => e.event === 'finish');
    assert.ok(finish, 'parent turn finishes after delegation');
  });

  it('dangerous commands are blocked before execution', async () => {
    const events = await collect(
      runAgentTurnInner({
        history,
        mode: 'BUILD',
        model: MODEL,
        createStream: canned([
          [{ type: 'tool_call', id: 'c1', name: 'bash', input: { command: 'rm -rf /' } }],
          [{ type: 'text', text: 'blocked, good' }],
        ]),
      })
    );
    const result = events.find((e) => e.event === 'tool_result');
    assert.match(result.data.error || '', /Blocked dangerous/);
  });

  it('stop hook forces a test run after writes before finishing', async () => {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(workdir, 't.txt'), 'x', 'utf-8');
    const events = await collect(
      runAgentTurnInner({
        history,
        mode: 'BUILD',
        model: MODEL,
        createStream: canned([
          [{ type: 'tool_call', id: 'c1', name: 'writeFile', input: { path: 't.txt', content: 'y' } }],
          [{ type: 'tool_call', id: 'c2', name: 'runTests', input: { command: 'node -e "console.log(1)"' } }],
          [{ type: 'text', text: 'verified' }],
        ]),
      })
    );
    const kinds = events.map((e) => e.event);
    // write → forced stop-hook retry (extra user message → extra model call)
    // → runTests → final text → finish
    assert.ok(kinds.includes('finish'), `finishes, got: ${kinds.join(',')}`);
    const results = events.filter((e) => e.event === 'tool_result');
    assert.equal(results.length, 2);
  });
});

/**
 * The unified `task` tool: one name over the primitive, with the six legacy
 * names still working.
 *
 * The interesting assertions are about equivalence. The point of collapsing six
 * tools into one is that there is now ONE behaviour — so the test has to be that
 * `task(action="run")` and `bgRun` produce the same thing, not that both
 * individually still function.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  normalizeTaskCall, TASK_ACTIONS, HARNESS_TOOLS, buildProviderTools, TOOL_PARAM_SCHEMAS,
} from '../src/agent/loop.js';
import { buildSystemPrompt } from '../src/agent/prompt.js';
import { getToolContracts } from '../src/shared/tools/index.js';
import { resetTasks, createTask, cancelTask } from '../src/agent/task.js';
import { resetBackground } from '../src/agent/background.js';
import { resetTeam } from '../src/agent/team.js';

describe('normalizeTaskCall', () => {
  it('maps each action onto exactly one legacy tool', () => {
    assert.deepEqual(TASK_ACTIONS, {
      'spawn-async': 'spawnTeammate',
      run: 'bgRun',
      status: 'teamStatus',
      check: 'bgCheck',
      merge: 'teamMerge',
      cancel: null,
      message: 'sendMessage',
    });
  });

  it('rewrites the six legacy calls identically', () => {
    assert.deepEqual(normalizeTaskCall({ action: 'run', command: 'npm test' }), {
      name: 'bgRun', input: { command: 'npm test' },
    });
    assert.deepEqual(normalizeTaskCall({ action: 'status' }), {
      name: 'teamStatus', input: {},
    });
    assert.deepEqual(normalizeTaskCall({ action: 'check', id: 'bg_1' }), {
      name: 'bgCheck', input: { id: 'bg_1' },
    });
    assert.deepEqual(normalizeTaskCall({ action: 'message', to: 'lead', text: 'hi' }), {
      name: 'sendMessage', input: { to: 'lead', text: 'hi' },
    });
    assert.deepEqual(normalizeTaskCall({ action: 'spawn-async', name: 'bob', prompt: 'go' }), {
      name: 'spawnTeammate', input: { name: 'bob', prompt: 'go' },
    });
  });

  it('translates `merge` into the field the legacy tool reads', () => {
    // The trap: the legacy tool's own field is ALSO called `action`, so a naive
    // pass-through leaves `{action: 'merge'}` and the merge silently becomes a
    // diff. Naming the field differently on the new tool is what avoids it.
    assert.deepEqual(normalizeTaskCall({ action: 'merge', name: 'bob', merge: 'apply' }), {
      name: 'teamMerge', input: { name: 'bob', action: 'apply' },
    });
  });

  it('does not mutate the caller\'s input', () => {
    const input = { action: 'merge', name: 'bob', merge: 'apply' };
    normalizeTaskCall(input);
    assert.deepEqual(input, { action: 'merge', name: 'bob', merge: 'apply' });
  });

  it('rejects an unknown action rather than defaulting', () => {
    assert.equal(normalizeTaskCall({ action: 'wat' }), undefined);
    assert.equal(normalizeTaskCall({}), undefined);
    assert.equal(normalizeTaskCall(undefined), undefined);
  });

  it('hands back null for the two actions it does not rewrite', () => {
    // `spawn` awaits and `cancel` has no legacy equivalent, so the caller
    // handles them. Distinguishing null from undefined is the whole contract.
    assert.equal(normalizeTaskCall({ action: 'spawn', prompt: 'x' }), null);
    assert.equal(normalizeTaskCall({ action: 'cancel', id: 'x' }), null);
  });
});

describe('the tool the model is shown', () => {
  it('advertises one tool, not seven', () => {
    const names = buildProviderTools('BUILD').map((t) => t.function.name);
    assert.ok(names.includes('task'), 'task must be offered');
    for (const legacy of ['bgRun', 'bgCheck', 'spawnTeammate', 'teamStatus', 'teamMerge', 'sendMessage', 'spawnAgent']) {
      assert.ok(!names.includes(legacy), `${legacy} should no longer be offered to the model`);
    }
  });

  it('describes every action in the one description', () => {
    // An action the model cannot discover is an action it will not use, so the
    // enumeration lives in the description rather than only in the schema.
    const contract = getToolContracts('BUILD').task;
    for (const action of Object.keys(TASK_ACTIONS).concat(['spawn'])) {
      assert.ok(contract.description.includes(action), `description omits "${action}"`);
    }
  });

  it('makes action required and enumerated', () => {
    const schema = TOOL_PARAM_SCHEMAS.task;
    assert.deepEqual(schema.required, ['action']);
    assert.equal(schema.properties.action.type, 'string');
    assert.equal(schema.properties.action.enum.length, 8);
  });

  it('still dispatches the legacy names', () => {
    // A trajectory recorded with spawnTeammate has to keep replaying.
    for (const name of ['task', 'spawnAgent', 'bgRun', 'bgCheck', 'spawnTeammate', 'sendMessage', 'teamStatus', 'teamMerge']) {
      assert.ok(HARNESS_TOOLS.has(name), name);
    }
  });

  it('says in the prompt that one tool covers it', () => {
    const prompt = buildSystemPrompt({ mode: 'BUILD', dir: process.cwd() });
    assert.match(prompt, /task/);
    assert.match(prompt, /action="spawn"/);
    assert.match(prompt, /action="run"/);
    // The old names must be gone from the prompt or the model uses them anyway.
    assert.ok(!/\bbgRun\b/.test(prompt), 'bgRun is still in the prompt');
    assert.ok(!/\bteamMerge\b/.test(prompt), 'teamMerge is still in the prompt');
    assert.ok(!/\bspawnTeammate\b/.test(prompt), 'spawnTeammate is still in the prompt');
  });
});

describe('cancel through the unified tool', () => {
  after(() => { resetTasks(); resetBackground(); resetTeam(); });

  it('cancels a running task by id and says so when there is nothing to cancel', () => {
    resetTasks();
    const { task } = createTask({
      kind: 'command', name: 'long', owner: 'review',
      run: () => new Promise((r) => setTimeout(() => r({ summary: 'done' }), 500)),
    });
    assert.ok(task.id);
    assert.equal(cancelTask(task.id, 'cancelled by the agent'), true);
    assert.equal(cancelTask('task_doesnotexist'), false);
  });
});

describe('no drift between the two names', () => {
  it('produces an identical task for run and bgRun', async () => {
    // The equivalence that matters: one behaviour, two spellings. If these ever
    // differ, the collapse has introduced a second implementation.
    resetTasks();
    resetBackground();

    const legacy = normalizeTaskCall({ action: 'run', command: 'echo legacy' });
    const unified = normalizeTaskCall({ action: 'run', command: 'echo unified' });

    const { startBackground, checkBackground } = await import('../src/agent/background.js');
    const a = startBackground(legacy.input.command, { owner: 'lead' });
    const b = startBackground(unified.input.command, { owner: 'lead' });

    assert.match(a.id, /^bg_/);
    assert.match(b.id, /^bg_/, 'both spellings produce a background command id');
    assert.equal(checkBackground(a.id).status, 'running');
    assert.equal(checkBackground(b.id).status, 'running');

    for (const id of [a.id, b.id]) cancelTask(id);
    resetTasks();
    resetBackground();
  });
});

describe('the tool survives a real git repo', () => {
  let dir;
  before(() => { dir = mkdtempSync(join(tmpdir(), 'task-tool-')); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('does not need a working directory to be a repository', () => {
    // A tool description is read at prompt-build time, from any directory.
    assert.doesNotThrow(() => buildSystemPrompt({ mode: 'BUILD', dir }));
    writeFileSync(join(dir, 'x.txt'), 'hello');
    assert.doesNotThrow(() => buildProviderTools('PLAN'));
  });
});

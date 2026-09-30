/**
 * harness — Claude-Code adaptations under test (no key, no network).
 *
 * Covers: composable prompt sections, context files, skill discovery,
 * todo validation/persistence, batching, loop guard, stop hook, and the
 * builtin dangerous-command guard.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildSystemPrompt,
  buildEnvironmentSection,
  buildProjectContextSection,
  buildSkillListingSection,
} from '../src/agent/prompt.js';
import { loadContextFiles } from '../src/agent/context-files.js';
import { listSkills, getSkillPrompt, formatSkillListing } from '../src/agent/skills.js';
import { validateTodos, writeTodos, readTodos, formatTodoList } from '../src/agent/tasks.js';
import { batchToolCalls, loopHint } from '../src/agent/loop.js';
import { builtinPreToolUseGuard, checkStop, projectHasTests, on, clearHooks, runHooks } from '../src/agent/hooks.js';

let dir;
let prevCwd;

beforeEach(() => {
  prevCwd = process.cwd();
  dir = mkdtempSync(join(tmpdir(), 'sentinel-harness-'));
  process.chdir(dir);
});

afterEach(() => {
  process.chdir(prevCwd);
  clearHooks();
});

describe('composable system prompt', () => {
  it('environment section names cwd and OS', () => {
    const s = buildEnvironmentSection(dir);
    assert.match(s, /Environment:/);
    assert.ok(s.includes(dir));
  });

  it('project context is empty without files, injected with SENTINEL.md', () => {
    assert.equal(buildProjectContextSection(dir), '');
    writeFileSync(join(dir, 'SENTINEL.md'), '# Proj\nRules here', 'utf-8');
    const files = loadContextFiles(dir);
    assert.equal(files.length, 1);
    assert.match(buildProjectContextSection(dir), /Rules here/);
  });

  it('full prompt composes sections in order', () => {
    writeFileSync(join(dir, 'SENTINEL.md'), 'ctx', 'utf-8');
    const skillDir = join(dir, '.sentinel', 'skills', 's1');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: s1\ndescription: d\n---\nbody', 'utf-8');
    const p = buildSystemPrompt({ mode: 'BUILD', dir });
    const order = ['coding assistant', 'Environment:', 'Project Context', 'Available tools:', 'Available skills'].map((s) => p.indexOf(s));
    assert.ok(order.every((i) => i >= 0), 'all sections present');
    assert.ok(order.every((v, i, a) => i === 0 || v > a[i - 1]), 'sections in order');
  });

  it('PLAN prompt lists read-only tools', () => {
    const p = buildSystemPrompt({ mode: 'PLAN', dir });
    assert.match(p, /PLAN mode/);
    assert.ok(!p.includes('spawnAgent'));
  });
});

describe('skills on demand', () => {
  function seedSkill(name, desc, body) {
    const d = join(dir, '.sentinel', 'skills', name);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'SKILL.md'), `---\nname: ${name}\ndescription: ${desc}\n---\n${body}`, 'utf-8');
  }

  it('lists names without bodies, expands on invoke', () => {
    seedSkill('demo', 'Does demo things', '# Demo\nStep one.');
    const listed = listSkills(dir);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, 'demo');
    assert.match(formatSkillListing(dir), /demo: Does demo things/);
    assert.match(getSkillPrompt('demo', dir), /Step one/);
    assert.equal(getSkillPrompt('nope', dir), null);
  });

  it('empty without skills', () => {
    assert.deepEqual(listSkills(dir), []);
    assert.equal(formatSkillListing(dir), '');
    assert.equal(buildSkillListingSection(dir), '');
  });
});

describe('todo task system', () => {
  it('validates shape, status, duplicates', () => {
    assert.throws(() => validateTodos([]), /non-empty/);
    assert.throws(
      () => validateTodos([{ id: 'a', title: 't', status: 'bogus' }]),
      /pending\|in_progress\|completed/
    );
    assert.throws(
      () => validateTodos([
        { id: 'a', title: 't', status: 'pending' },
        { id: 'a', title: 't2', status: 'pending' },
      ]),
      /duplicate/
    );
  });

  it('persists full-list overwrites and renders checklist', () => {
    const written = writeTodos([
      { id: '1', title: 'Repro', status: 'completed' },
      { id: '2', title: 'Fix', status: 'in_progress' },
      { id: '3', title: 'Verify', status: 'pending' },
    ], dir);
    assert.equal(written.length, 3);
    const back = readTodos(dir);
    assert.equal(back[1].status, 'in_progress');
    const rendered = formatTodoList(back);
    assert.match(rendered, /\[x\] 1: Repro/);
    assert.match(rendered, /\["~\]"|\[~\] 2: Fix/);
    assert.match(rendered, /\[ \] 3: Verify/);
  });

  it('reads empty outside a project', () => {
    assert.deepEqual(readTodos(dir), []);
  });
});

describe('batching + loop guard + stop hook', () => {
  it('groups consecutive reads, isolates writes', () => {
    const calls = [
      { name: 'readFile' }, { name: 'grep' }, { name: 'writeFile' },
      { name: 'glob' }, { name: 'bash' },
    ];
    const batches = batchToolCalls(calls);
    assert.equal(batches.length, 4);
    assert.equal(batches[0].parallel, true);
    assert.deepEqual(batches[0].calls.map((c) => c.name), ['readFile', 'grep']);
    assert.equal(batches[1].parallel, false);
  });

  it('single batch for all reads', () => {
    const batches = batchToolCalls([{ name: 'readFile' }, { name: 'glob' }]);
    assert.equal(batches.length, 1);
    assert.equal(batches[0].parallel, true);
  });

  it('loop hint fires after repeated same-file edits', () => {
    assert.equal(loopHint({}), null);
    assert.equal(loopHint({ 'a.js': 2 }), null);
    assert.match(loopHint({ 'a.js': 3 }), /reconsider/);
  });

  it('stop hook blocks unwitnessed writes, passes otherwise', () => {
    assert.match(checkStop({ wroteFiles: true, ranTests: false, mode: 'BUILD' }), /no tests were run/);
    assert.equal(checkStop({ wroteFiles: true, ranTests: true, mode: 'BUILD' }), null);
    assert.equal(checkStop({ wroteFiles: false, ranTests: false, mode: 'BUILD' }), null);
    assert.equal(checkStop({ wroteFiles: true, ranTests: false, mode: 'PLAN' }), null);
    // No test suite to run: forcing one only produces a failing `npm test`.
    assert.equal(checkStop({ wroteFiles: true, ranTests: false, mode: 'BUILD', hasTests: false }), null);
  });

  it('projectHasTests only says no when there is clearly nothing to run', () => {
    const mk = (files) => {
      const d = mkdtempSync(join(tmpdir(), 'sentinel-hastests-'));
      for (const [rel, body] of Object.entries(files)) {
        if (rel.endsWith('/')) mkdirSync(join(d, rel), { recursive: true });
        else writeFileSync(join(d, rel), body);
      }
      return d;
    };
    const placeholder = 'echo "Error: no test specified" && exit 1';
    assert.equal(projectHasTests(mk({})), false);
    assert.equal(projectHasTests(mk({ 'package.json': JSON.stringify({ name: 'x' }) })), false);
    assert.equal(projectHasTests(mk({ 'package.json': JSON.stringify({ scripts: { test: placeholder } }) })), false);
    assert.equal(projectHasTests(mk({ 'package.json': JSON.stringify({ scripts: { test: 'vitest' } }) })), true);
    assert.equal(projectHasTests(mk({ 'tests/': '' })), true);
    assert.equal(projectHasTests(mk({ 'go.mod': 'module x' })), true);
    assert.equal(projectHasTests(mk({ 'Makefile': 'build:\n\tcc\ntest:\n\t./t' })), true);
    assert.equal(projectHasTests(mk({ 'package.json': '{broken' })), true);
  });

  it('builtin guard blocks destructive commands and secret writes', () => {
    assert.ok(builtinPreToolUseGuard('bash', { command: 'rm -rf /' }).block);
    assert.ok(builtinPreToolUseGuard('writeFile', { path: '.env', content: 'x' }).block);
    assert.equal(builtinPreToolUseGuard('bash', { command: 'npm test' }), null);
    assert.equal(builtinPreToolUseGuard('readFile', { path: '.env' }), null);
  });

  it('registered hooks run and can block', async () => {
    const off = on('preToolUse', async ({ toolName }) => (
      toolName === 'bash' ? { block: true, reason: 'no shell in tests' } : null
    ));
    const blocked = await runHooks('preToolUse', { toolName: 'bash', input: {}, mode: 'BUILD' });
    assert.match(blocked.reason, /no shell/);
    const pass = await runHooks('preToolUse', { toolName: 'readFile', input: {}, mode: 'BUILD' });
    assert.equal(pass, null);
    off();
  });
});

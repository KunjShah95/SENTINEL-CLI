/**
 * harness — Claude-Code adaptations under test (no key, no network).
 *
 * Covers: composable prompt sections, context files, skill discovery,
 * todo validation/persistence, batching, loop guard, stop hook, and the
 * builtin dangerous-command guard.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repo root, so a test can assert on a file that actually ships. */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
import {
  buildSystemPrompt,
  buildEnvironmentSection,
  buildProjectContextSection,
  buildSkillListingSection,
} from '../src/agent/prompt.js';
import { loadContextFiles } from '../src/agent/context-files.js';
import {
  listSkills,
  getSkillPrompt,
  formatSkillListing,
  resolveSkill,
  listSkillScripts,
  resolveSkillScript,
  skillAllowedTools,
} from '../src/agent/skills.js';
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
    const listed = listSkills(dir, { includeGlobal: false });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, 'demo');
    assert.match(formatSkillListing(dir, { includeGlobal: false }), /demo: Does demo things/);
    assert.match(getSkillPrompt('demo', dir, { includeGlobal: false }), /Step one/);
    assert.equal(getSkillPrompt('nope', dir, { includeGlobal: false }), null);
  });

  it('a skill ships with the repo, in a location git tracks', () => {
    // This is the assertion that was missing when a doc described a
    // `reproduce-fix-verify` skill no clone had. `.sentinel/` is gitignored, so
    // a skill there is untracked by definition and its absence is invisible;
    // `skills/` at the repo root is tracked, so this test fails the moment the
    // directory is removed.
    const shipped = join(REPO_ROOT, 'skills', 'reproduce-fix-verify', 'SKILL.md');
    assert.ok(existsSync(shipped), `expected a shipped skill at ${shipped}`);
    const skill = resolveSkill('reproduce-fix-verify', REPO_ROOT, { includeGlobal: false });
    assert.ok(skill, 'and it must resolve from the repo root');
    assert.match(skill.description, /bug/i);
    assert.equal(skill.disableModelInvocation, false, 'it is safe to advertise');
  });

  it('a shipped skill wins over an untracked copy in .sentinel', () => {
    // Not a preference — a regression guard. An untracked `.sentinel/skills/`
    // copy of the same name used to shadow the shipped one, so the skill that
    // ships with the repo was the one that never ran. The shipped directory is
    // first for that reason.
    //
    // The real shipped skill is copied into the temp tree rather than written
    // into the repo, because `skillDirs` derives every path from one cwd: to
    // test precedence honestly, both candidates have to live in the same tree.
    const shippedSrc = join(REPO_ROOT, 'skills', 'reproduce-fix-verify');
    const shippedDst = join(dir, 'skills', 'reproduce-fix-verify');
    mkdirSync(shippedDst, { recursive: true });
    writeFileSync(join(shippedDst, 'SKILL.md'), readFileSync(join(shippedSrc, 'SKILL.md'), 'utf-8'));

    const shadow = join(dir, '.sentinel', 'skills', 'reproduce-fix-verify');
    mkdirSync(shadow, { recursive: true });
    writeFileSync(join(shadow, 'SKILL.md'), '---\nname: reproduce-fix-verify\ndescription: STALE LOCAL COPY\n---\nstale body', 'utf-8');

    const skill = resolveSkill('reproduce-fix-verify', dir, { includeGlobal: false });
    assert.notEqual(skill.description, 'STALE LOCAL COPY', 'the shipped copy must win');
    assert.equal(skill.description, 'Fix a bug without shipping another one. Reproduce first, fix second, verify third.');
  });

  it('empty without skills', () => {
    assert.deepEqual(listSkills(dir, { includeGlobal: false }), []);
    assert.equal(formatSkillListing(dir, { includeGlobal: false }), '');
    assert.equal(buildSkillListingSection(dir, { includeGlobal: false }), '');
  });

  it('substitutes args into the body, and lists a skill\'s own scripts', () => {
    seedSkill('demo', 'Does demo things', 'Run $1 against $ARGUMENTS with ${2:-default}.');
    assert.equal(getSkillPrompt('demo', dir, { includeGlobal: false, args: ['a.js', 'b.js'] }),
      'Run a.js against a.js b.js with b.js.');
    assert.equal(getSkillPrompt('demo', dir, { includeGlobal: false, args: ['x.js'] }),
      'Run x.js against x.js with default.');
    // A bare string is accepted: small models send that shape as often as the array.
    assert.equal(getSkillPrompt('demo', dir, { includeGlobal: false, args: 'one.js' }),
      'Run one.js against one.js with default.');
    // No args means the body is untouched, placeholders and all.
    assert.equal(getSkillPrompt('demo', dir, { includeGlobal: false }),
      'Run $1 against $ARGUMENTS with ${2:-default}.');

    mkdirSync(join(dir, '.sentinel', 'skills', 'demo', 'scripts'), { recursive: true });
    writeFileSync(join(dir, '.sentinel', 'skills', 'demo', 'scripts', 'verify.sh'), 'echo ok', 'utf-8');
    writeFileSync(join(dir, '.sentinel', 'skills', 'demo', 'scripts', 'run.py'), 'print(1)', 'utf-8');
    writeFileSync(join(dir, '.sentinel', 'skills', 'demo', 'notes.txt'), 'x', 'utf-8');
    assert.deepEqual(listSkillScripts(resolveSkill('demo', dir, { includeGlobal: false })),
      ['scripts/run.py', 'scripts/verify.sh']);
  });

  it('refuses a script path that escapes the skill directory', () => {
    seedSkill('demo', 'd', 'body');
    mkdirSync(join(dir, '.sentinel', 'skills', 'demo', 'scripts'), { recursive: true });
    // `.js` not `.sh`: interpreter availability is machine-dependent, and these
    // assertions are about path containment, not about what is installed.
    writeFileSync(join(dir, '.sentinel', 'skills', 'demo', 'scripts', 'ok.js'), 'console.log(1)', 'utf-8');
    writeFileSync(join(dir, '.sentinel', 'skills', 'demo', 'notes.txt'), 'x', 'utf-8');
    writeFileSync(join(dir, 'outside.js'), 'console.log("pwned")', 'utf-8');
    const skill = resolveSkill('demo', dir, { includeGlobal: false });

    const ok = resolveSkillScript(skill, 'scripts/ok.js');
    assert.equal(ok.error, undefined, ok.error);
    assert.equal(ok.runner, 'node');
    assert.match(resolveSkillScript(skill, '../../../outside.js').error, /stay inside/);
    assert.match(resolveSkillScript(skill, join(dir, 'outside.js')).error, /relative path/);
    assert.match(resolveSkillScript(skill, 'C:/Windows/system32/calc.exe').error, /relative path/);
    assert.match(resolveSkillScript(skill, 'notes.txt').error, /Unsupported script type/);
    assert.match(resolveSkillScript(skill, 'scripts/missing.js').error, /No such script/);
  });

  it('reads hyphenated frontmatter keys, which the old key pattern dropped', () => {
    // `/^([A-Za-z]+):/` rejected `disable-model-invocation` — the hyphen does
    // not match — so every hyphenated Claude Code key was silently discarded
    // rather than read and ignored. A skill author writing
    // `disable-model-invocation: true` was asking for something and got a skill
    // that ignored them.
    seedSkill('hidden', 'd', 'body');
    writeFileSync(
      join(dir, '.sentinel', 'skills', 'hidden', 'SKILL.md'),
      '---\nname: hidden\ndescription: d\ndisable-model-invocation: true\nargument-hint: <file>\nallowed-tools: readFile, grep\n---\nbody',
      'utf-8',
    );
    const s = resolveSkill('hidden', dir, { includeGlobal: false });
    assert.equal(s.disableModelInvocation, true);
    assert.equal(s.argumentHint, '<file>');
    assert.equal(s.allowedTools, 'readFile, grep');
    // Hyphenated keys must not break the keys that were already read.
    assert.equal(s.name, 'hidden');
    assert.equal(s.description, 'd');
  });

  it('treats an explicit off as on: only truthy disables invocation', () => {
    // `false`, `no`, `off`, `0` and empty all mean "still invoke me". Treating
    // any non-empty string as true would mean a skill that says
    // `disable-model-invocation: false` never loads at all.
    for (const value of ['false', 'no', 'off', '0', '']) {
      const d = join(dir, '.sentinel', 'skills', `v${value || 'empty'}`);
      mkdirSync(d, { recursive: true });
      writeFileSync(
        join(d, 'SKILL.md'),
        `---\nname: v${value || 'empty'}\ndescription: d\ndisable-model-invocation: ${value}\n---\nb`,
        'utf-8',
      );
      assert.equal(
        resolveSkill(`v${value || 'empty'}`, dir, { includeGlobal: false }).disableModelInvocation,
        false,
        `"${value}" must not disable`,
      );
    }
    const d = join(dir, '.sentinel', 'skills', 'von');
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'SKILL.md'), '---\nname: von\ndescription: d\ndisable-model-invocation: true\n---\nb', 'utf-8');
    assert.equal(resolveSkill('von', dir, { includeGlobal: false }).disableModelInvocation, true);
    // Absent means absent.
    const e = join(dir, '.sentinel', 'skills', 'vnone');
    mkdirSync(e, { recursive: true });
    writeFileSync(join(e, 'SKILL.md'), '---\nname: vnone\ndescription: d\n---\nb', 'utf-8');
    assert.equal(resolveSkill('vnone', dir, { includeGlobal: false }).disableModelInvocation, false);
  });

  it('withholds a disabled skill from the listing but still resolves it by name', () => {
    // The point of the flag: the model cannot reach for it on its own, but a
    // human typing `/hidden` still can. Adverting it would make the flag a
    // lie; hiding it from resolution would make it a brick.
    seedSkill('visible', 'v', 'b');
    const d = join(dir, '.sentinel', 'skills', 'hidden');
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'SKILL.md'), '---\nname: hidden\ndescription: h\ndisable-model-invocation: true\n---\nb', 'utf-8');

    const listing = formatSkillListing(dir, { includeGlobal: false, request: 'hidden h' });
    assert.match(listing, /visible/, 'the normal skill is advertised');
    assert.doesNotMatch(listing, /hidden/, 'the disabled one is not');
    assert.ok(getSkillPrompt('hidden', dir, { includeGlobal: false }), 'but it still resolves');

    // The opt-in listing is for humans (the CLI, the MCP server).
    const all = formatSkillListing(dir, { includeGlobal: false, request: 'hidden h', includeHidden: true });
    assert.match(all, /hidden/);
  });

  it('surfaces an argument hint to the model, not just the CLI', () => {
    // `argument-hint` is the author telling a caller what to pass. The model is
    // a caller, and a hint it cannot see is a `skill({name})` with no `args` —
    // a workflow whose `$1` is still an unsubstituted placeholder.
    const d = join(dir, '.sentinel', 'skills', 'hinted');
    mkdirSync(d, { recursive: true });
    writeFileSync(
      join(d, 'SKILL.md'),
      '---\nname: hinted\ndescription: rewrite a file\nargument-hint: <file> [--flag]\n---\nRewrite $1',
      'utf-8',
    );
    assert.match(formatSkillListing(dir, { includeGlobal: false }), /hinted: rewrite a file \(args: <file> \[--flag\]\)/);
    // No hint, no cost: the line is exactly what it was.
    seedSkill('plain', 'just a description', 'b');
    const p2 = join(dir, '.sentinel', 'skills', 'plain2');
    mkdirSync(p2, { recursive: true });
    writeFileSync(join(p2, 'SKILL.md'), '---\nname: plain2\ndescription: d\n---\nb', 'utf-8');
    const line = formatSkillListing(dir, { includeGlobal: false }).split('\n').find((l) => l.startsWith('- plain:'));
    assert.equal(line, '- plain: just a description');
  });

  it('parses allowed-tools into a set of tool names', () => {
    // Parsing only. The enforcement lives in skill-scope.js and is covered by
    // skill-scope.test.js plus three end-to-end cases in parity.test.js —
    // this test exists to pin the key is read at all, which is what it failed
    // to do before the hyphen fix.
    const d = join(dir, '.sentinel', 'skills', 'scoped');
    mkdirSync(d, { recursive: true });
    writeFileSync(
      join(d, 'SKILL.md'),
      '---\nname: scoped\ndescription: d\nallowed-tools: readFile, grep  codeMap\n---\nb',
      'utf-8',
    );
    const s = resolveSkill('scoped', dir, { includeGlobal: false });
    assert.deepEqual([...skillAllowedTools(s)].sort(), ['codeMap', 'grep', 'readFile']);
    // Absent means "no declaration", not "no tools".
    assert.equal(skillAllowedTools(resolveSkill('plain2', dir, { includeGlobal: false })), null);
  });

  it('names the interpreters it looked for when none is installed', () => {
    // The failure mode this guards: a `.sh` skill on a Windows box with no
    // POSIX shell. Without this the caller reports a broken script when the
    // real answer is that nothing can run it.
    seedSkill('demo', 'd', 'body');
    mkdirSync(join(dir, '.sentinel', 'skills', 'demo', 'scripts'), { recursive: true });
    writeFileSync(join(dir, '.sentinel', 'skills', 'demo', 'scripts', 'x.unknownext'), 'x', 'utf-8');
    const skill = resolveSkill('demo', dir, { includeGlobal: false });
    const r = resolveSkillScript(skill, 'scripts/x.unknownext');
    assert.match(r.error, /Unsupported script type/);
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

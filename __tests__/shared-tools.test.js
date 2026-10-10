/**
 * Tests for the local-tool sandbox in src/shared/tools.
 *
 * Covers:
 *  - read / list / glob / grep happy paths
 *  - writeFile + read-back roundtrip
 *  - editFile in-place replacement
 *  - PLAN mode rejection of write / edit / bash
 *  - Path-sandbox rejection of "../" escapes
 *
 * Run with:  node --test __tests__/shared-tools.test.js
 */

import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { executeLocalTool, Mode, validateToolInput, coerceToolInput } from '../src/shared/tools/index.js';

let workDir;
let originalCwd;

before(async () => {
  originalCwd = process.cwd();
  workDir = await mkdtemp(join(tmpdir(), 'sentinel-tools-'));
  process.chdir(workDir);
});

beforeEach(async () => {
  // Reset working directory contents (but keep the same temp root) so each
  // test starts from a known state.
  process.chdir(workDir);
});

after(async () => {
  process.chdir(originalCwd);
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

test('readFile returns file content and a relative path', async () => {
  await writeFile(join(workDir, 'hello.txt'), 'hello world', 'utf-8');
  const result = await executeLocalTool('readFile', { path: 'hello.txt' }, Mode.BUILD);
  assert.equal(result.path, 'hello.txt');
  assert.equal(result.content, 'hello world');
  assert.equal(result.truncated, undefined);
});

test('listDirectory returns sorted entries with types', async () => {
  await mkdir(join(workDir, 'sub'), { recursive: true });
  await writeFile(join(workDir, 'a.txt'), 'a');
  await writeFile(join(workDir, 'b.txt'), 'b');
  const result = await executeLocalTool('listDirectory', { path: '.' }, Mode.BUILD);
  assert.equal(result.path, '.');
  // directories first, then files; sub should be present
  const names = result.entries.map(e => e.name);
  assert.ok(names.includes('sub'), 'sub dir should be listed');
  assert.ok(names.includes('a.txt'), 'a.txt should be listed');
  assert.ok(names.includes('b.txt'), 'b.txt should be listed');
  const sub = result.entries.find(e => e.name === 'sub');
  assert.equal(sub.type, 'directory');
  const a = result.entries.find(e => e.name === 'a.txt');
  assert.equal(a.type, 'file');
});

test('glob finds files matching a simple pattern', async () => {
  await writeFile(join(workDir, 'foo.js'), 'x');
  await writeFile(join(workDir, 'bar.js'), 'y');
  await writeFile(join(workDir, 'baz.md'), 'z');
  const result = await executeLocalTool('glob', { pattern: '*.js' }, Mode.BUILD);
  assert.deepEqual(result.files.sort(), ['bar.js', 'foo.js']);
});

test('grep finds lines that match a regex', async () => {
  await writeFile(join(workDir, 'log.txt'), 'INFO start\nERROR oops\nINFO done\n');
  const result = await executeLocalTool('grep', { pattern: 'ERROR' }, Mode.BUILD);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].file, 'log.txt');
  assert.equal(result.matches[0].line, 2);
  assert.match(result.matches[0].content, /ERROR/);
});

test('writeFile + readFile round-trip works', async () => {
  await executeLocalTool(
    'writeFile',
    { path: 'out/created.txt', content: 'round-trip content' },
    Mode.BUILD
  );
  const onDisk = await readFile(join(workDir, 'out', 'created.txt'), 'utf-8');
  assert.equal(onDisk, 'round-trip content');
  const back = await executeLocalTool('readFile', { path: 'out/created.txt' }, Mode.BUILD);
  assert.equal(back.content, 'round-trip content');
});

test('editFile replaces an exact, unambiguous string', async () => {
  await writeFile(join(workDir, 'editme.txt'), 'alpha BETA gamma', 'utf-8');
  const result = await executeLocalTool(
    'editFile',
    { path: 'editme.txt', oldString: 'BETA', newString: 'DELTA' },
    Mode.BUILD
  );
  assert.equal(result.success, true);
  assert.equal(result.path, 'editme.txt');
  const onDisk = await readFile(join(workDir, 'editme.txt'), 'utf-8');
  assert.equal(onDisk, 'alpha DELTA gamma');
});

test('editFile rejects ambiguous matches', async () => {
  await writeFile(join(workDir, 'dup.txt'), 'x X x X x', 'utf-8');
  await assert.rejects(
    () =>
      executeLocalTool('editFile', { path: 'dup.txt', oldString: 'X', newString: 'Y' }, Mode.BUILD),
    /ambiguous/i
  );
});

// ── input validation ───────────────────────────────────────────────────────
//
// `toolInputSchemas` existed for the whole life of this file and was never
// called. These are the assertions that would have caught that.

test('a malformed call is refused before the implementation runs', async () => {
  await assert.rejects(
    () => executeLocalTool('writeFile', { path: 'v.txt' }, Mode.BUILD),
    /writeFile: content is required/
  );
  await assert.rejects(
    () => executeLocalTool('readFile', { path: 42 }, Mode.BUILD),
    /readFile: path must be a string/
  );
  // Nothing was created by either refusal.
  await assert.rejects(() => readFile(join(workDir, 'v.txt'), 'utf-8'));
});

test('validation projects the shape the implementation expects', async () => {
  // `str()` used to return the bare string. With that bug live, `readFile`
  // receives `'x'` where it reads `input.path` — so every read returns
  // `{content: undefined}` or throws. This is the assertion that pins the
  // projection.
  assert.deepEqual(coerceToolInput('readFile', { path: 'x.txt' }), { path: 'x.txt' });
  assert.deepEqual(coerceToolInput('memoryDelete', { name: 'n' }), { name: 'n' });
  assert.deepEqual(coerceToolInput('glob', { pattern: '*.js' }), { pattern: '*.js', path: '.' });
  // A field the validator drops does not survive: the model reads the result
  // and carries on without it rather than getting a failed turn.
  assert.deepEqual(coerceToolInput('readFile', { path: 'x', bogus: 1 }), { path: 'x' });
  // Defaults come from the same place.
  assert.deepEqual(coerceToolInput('runTests', { command: 'npm test' }),
    { command: 'npm test', timeout: 120000 });
});

test('skill args accept an array or a bare string', () => {
  assert.deepEqual(coerceToolInput('skill', { name: 'n', args: ['a', 'b'] }), { name: 'n', args: ['a', 'b'] });
  assert.deepEqual(coerceToolInput('skill', { name: 'n', args: 'a' }), { name: 'n', args: ['a'] });
  assert.deepEqual(coerceToolInput('skill', { name: 'n' }), { name: 'n', args: [] });
});

test('skill accepts `names` as an alternative to `name`', () => {
  // Refusing `names` because `name` is absent would be an argument about naming,
  // not about whether the call is well-formed.
  assert.equal(validateToolInput('skill', { names: ['a', 'b'] }), null);
  assert.equal(validateToolInput('skill', { name: 'a' }), null);
  assert.match(validateToolInput('skill', {}), /name is required/);
});

test('a single-name skill call still expands its args', async () => {
  // Regression guard. Routing the single-name path through `normalizeSkillNames`
  // once produced an entry with no args of its own, and taking that entry's
  // empty list expanded the body with every placeholder left in place — which
  // reads as a broken skill, not a lost argument.
  const d = join(workDir, '.sentinel', 'skills', 'single');
  await mkdir(d, { recursive: true });
  await writeFile(join(d, 'SKILL.md'), '---\nname: single\ndescription: d\n---\nEdit $1 for $ARGUMENTS.');
  const out = await executeLocalTool('skill', { name: 'single', args: ['auth.js'] }, Mode.BUILD);
  assert.equal(out.prompt, 'Edit auth.js for auth.js.');
});

test('a stacked skill call loads in the caller\'s order, deduped', async () => {
  for (const [n, body] of [['alpha', 'WORKFLOW-ALPHA'], ['beta', 'WORKFLOW-BETA']]) {
    const d = join(workDir, '.sentinel', 'skills', n);
    await mkdir(d, { recursive: true });
    await writeFile(join(d, 'SKILL.md'), `---\nname: ${n}\ndescription: ${n}\n---\n${body}`);
  }
  const out = await executeLocalTool('skill', { names: ['beta', 'alpha', 'beta'] }, Mode.BUILD);
  assert.equal(out.count, 2, 'the duplicate is dropped');
  assert.deepEqual(out.names, ['beta', 'alpha'], 'the caller\'s order is kept');
  assert.ok(out.prompt.indexOf('WORKFLOW-BETA') < out.prompt.indexOf('WORKFLOW-ALPHA'));
  assert.equal(out.prompt.split('WORKFLOW-BETA').length - 1, 1, 'no duplicated body');
  // Each skill keeps its own metadata, so the model can still stack a third.
  assert.deepEqual(out.skills.map((s) => s.description), ['beta', 'alpha']);
});

test('a stacked call naming an unknown skill fails rather than half-loading', async () => {
  const d = join(workDir, '.sentinel', 'skills', 'gamma');
  await mkdir(d, { recursive: true });
  await writeFile(join(d, 'SKILL.md'), '---\nname: gamma\ndescription: g\n---\nbody');
  // Loading the first and silently dropping the second is the failure that looks
  // most like working: the model gets a partial workflow and reports success.
  await assert.rejects(
    () => executeLocalTool('skill', { names: ['gamma', 'does-not-exist'] }, Mode.BUILD),
    /Unknown skill: does-not-exist/,
  );
});

test('an unrecognised tool is not validated away', async () => {
  // MCP tools arrive with their own schemas and their own trust story. A
  // validator that threw for an unknown name would refuse all of them.
  assert.equal(validateToolInput('some_mcp_tool', { anything: true }), null);
  assert.equal(validateToolInput('readFile', { path: 'a' }), null);
});

// ── windowed reads ──────────────────────────────────────────────────────────
//
// `offset`/`limit` exist because the context compactor shrinks an oversized read
// and the notice it leaves behind has to point at a call that actually fetches
// the rest. A hint naming parameters the tool does not accept is worse than no
// hint: the model tries it, fails, and pays for the retry.

test('readFile returns a window and says how to continue', async () => {
  await writeFile(join(workDir, 'lines.txt'), Array.from({ length: 50 }, (_, i) => `line${i + 1}`).join('\n'), 'utf-8');

  const out = await executeLocalTool('readFile', { path: 'lines.txt', offset: 0, limit: 5 }, Mode.BUILD);
  assert.equal(out.content, 'line1\nline2\nline3\nline4\nline5');
  assert.equal(out.offset, 0);
  assert.equal(out.lineCount, 5);
  assert.equal(out.totalLines, 50);
  assert.equal(out.partial, true);
  // The continuation is stated by the tool, so neither the model nor the
  // compactor has to derive the next offset and risk being one line off.
  assert.equal(out.nextOffset, 5);

  const next = await executeLocalTool('readFile', { path: 'lines.txt', offset: out.nextOffset, limit: 5 }, Mode.BUILD);
  assert.equal(next.content, 'line6\nline7\nline8\nline9\nline10');
  assert.equal(next.startedAtLine, 6, '1-based line number is reported for humans');
});

test('a read of the whole file reports no continuation', async () => {
  await writeFile(join(workDir, 'small2.txt'), 'a\nb\nc', 'utf-8');
  const out = await executeLocalTool('readFile', { path: 'small2.txt' }, Mode.BUILD);
  assert.equal(out.partial, undefined);
  assert.equal(out.nextOffset, undefined);
});

test('a window past the end of the file is empty, not an error', async () => {
  // The compactor can name a resume point at the end of a file. Failing there
  // would make the hint it wrote into the context an instruction to crash.
  await writeFile(join(workDir, 'small3.txt'), 'only one line', 'utf-8');
  const out = await executeLocalTool('readFile', { path: 'small3.txt', offset: 900, limit: 10 }, Mode.BUILD);
  assert.equal(out.content, '');
  // `partial` is omitted rather than false: the model reads `partial` as "there
  // is more", and an explicit false would read as a field it has to check.
  assert.equal(out.partial, undefined);
  assert.equal(out.nextOffset, undefined);
});

test('window parameters are validated, and a bad one is refused', () => {
  assert.deepEqual(coerceToolInput('readFile', { path: 'a', offset: 0, limit: 10 }), { path: 'a', offset: 0, limit: 10 });
  // A negative offset would silently read from the end of the file, which is a
  // worse failure than a refused call.
  assert.match(validateToolInput('readFile', { path: 'a', offset: -1 }) ?? '', /offset must be a non-negative integer/);
  assert.match(validateToolInput('readFile', { path: 'a', limit: 1.5 }) ?? '', /limit must be a non-negative integer/);
  // Absent is not invalid: the common whole-file read is unchanged.
  assert.equal(validateToolInput('readFile', { path: 'a' }), null);
});

test('readFile reports totalLines when it truncates a long file', async () => {
  // The pre-existing 10k truncation has no resume point, so a shrunken result
  // told the model nothing about how much was left. The line count is the one
  // number that lets it decide whether windowing is worth it.
  await writeFile(join(workDir, 'huge.txt'), 'abcdefghij\n'.repeat(3000), 'utf-8');
  const out = await executeLocalTool('readFile', { path: 'huge.txt' }, Mode.BUILD);
  assert.equal(out.truncated, true);
  assert.equal(typeof out.totalLines, 'number');
  assert.ok(out.totalLines > 1000);
});

test('PLAN mode rejects writeFile', async () => {
  await assert.rejects(
    () => executeLocalTool('writeFile', { path: 'nope.txt', content: 'no' }, Mode.PLAN),
    /not available in PLAN mode/i
  );
});

test('PLAN mode rejects editFile', async () => {
  await writeFile(join(workDir, 'x.txt'), 'abc');
  await assert.rejects(
    () =>
      executeLocalTool(
        'editFile',
        { path: 'x.txt', oldString: 'abc', newString: 'xyz' },
        Mode.PLAN
      ),
    /not available in PLAN mode/i
  );
});

test('PLAN mode rejects bash', async () => {
  await assert.rejects(
    () => executeLocalTool('bash', { command: 'echo hi' }, Mode.PLAN),
    /not available in PLAN mode/i
  );
});

test('read-only tools are still allowed in PLAN mode', async () => {
  await writeFile(join(workDir, 'ok.txt'), 'still readable');
  const result = await executeLocalTool('readFile', { path: 'ok.txt' }, Mode.PLAN);
  assert.equal(result.content, 'still readable');
});

test('path sandbox rejects ../ escapes', async () => {
  await assert.rejects(
    () => executeLocalTool('readFile', { path: '../etc/passwd' }, Mode.BUILD),
    /outside the project directory/i
  );
});

test('path sandbox rejects absolute paths outside cwd', async () => {
  // os.tmpdir() is virtually always outside process.cwd() during tests.
  const outside = join(tmpdir(), 'definitely-not-in-cwd.txt');
  await assert.rejects(
    () => executeLocalTool('readFile', { path: outside }, Mode.BUILD),
    /outside the project directory/i
  );
});

test('createCheckpoint / restoreCheckpoint round-trip via writeFile and undoLastChange', async () => {
  // 1. Write initial file
  await executeLocalTool('writeFile', { path: 'checkme.txt', content: 'version 1' }, Mode.BUILD);

  // 2. Overwrite the file. This creates a checkpoint of "version 1".
  await executeLocalTool('writeFile', { path: 'checkme.txt', content: 'version 2' }, Mode.BUILD);

  // Read current content, should be version 2
  let content = await readFile(join(workDir, 'checkme.txt'), 'utf-8');
  assert.equal(content, 'version 2');

  // 3. Undo last change
  const undoResult = await executeLocalTool('undoLastChange', {}, Mode.BUILD);
  assert.equal(undoResult.success, true);
  assert.ok(undoResult.restored.includes('checkme.txt'));

  // Content should be restored to version 1
  content = await readFile(join(workDir, 'checkme.txt'), 'utf-8');
  assert.equal(content, 'version 1');
});

test('undoLastChange deletes newly created files', async () => {
  // 1. Write a new file
  await executeLocalTool(
    'writeFile',
    { path: 'newly-created.txt', content: 'brand new content' },
    Mode.BUILD
  );

  let exists = await readFile(join(workDir, 'newly-created.txt'), 'utf-8')
    .then(() => true)
    .catch(() => false);
  assert.equal(exists, true);

  // 2. Undo should restore checkpoint where it didn't exist -> deletes it
  const undoResult = await executeLocalTool('undoLastChange', {}, Mode.BUILD);
  assert.equal(undoResult.success, true);
  assert.ok(undoResult.deleted.includes('newly-created.txt'));

  exists = await readFile(join(workDir, 'newly-created.txt'), 'utf-8')
    .then(() => true)
    .catch(() => false);
  assert.equal(exists, false);
});

test('diffFile tool generates unified diff correctly', async () => {
  await writeFile(join(workDir, 'diffme.txt'), 'line 1\nline 2\nline 3\n', 'utf-8');

  const result = await executeLocalTool(
    'diffFile',
    { path: 'diffme.txt', newContent: 'line 1\nline 2 updated\nline 3\n' },
    Mode.BUILD
  );

  assert.equal(result.path, 'diffme.txt');
  assert.match(result.diff, /Index: diffme\.txt/);
  assert.match(result.diff, /-line 2/);
  assert.match(result.diff, /\+line 2 updated/);
});

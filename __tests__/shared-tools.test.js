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

import { executeLocalTool, Mode } from '../src/shared/tools/index.js';

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

test("path sandbox rejects '../' escapes", async () => {
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

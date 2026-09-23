import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSweSystemPrompt,
  parseTestOutput,
  isFixAccepted,
  SWE_MAX_ITERATIONS,
} from '../src/agent/swe.js';
import { buildSystemPrompt } from '../src/agent/prompt.js';
import { isToolAllowedInMode } from '../src/shared/schemas/mode.js';

test('SWE prompt enforces reproduce-first discipline', () => {
  const p = buildSweSystemPrompt();
  assert.match(p, /REPRODUCE/);
  assert.match(p, /VERIFY/);
  assert.match(p, /REGRESS/);
  assert.match(p, /SMALLEST edit/);
});

test('prompt builder routes SWE mode', () => {
  assert.match(buildSystemPrompt({ mode: 'SWE' }), /REPRODUCE/);
});

test('SWE iteration budget exceeds default loop', () => {
  assert.ok(SWE_MAX_ITERATIONS >= 50, 'SWE tasks need 50+ iterations');
});

test('parseTestOutput handles jest PASS/FAIL lines', () => {
  const r = parseTestOutput('PASS src/a.test.js\nFAIL src/b.test.js\n');
  assert.deepEqual(r.summary, { passed: 1, failed: 1 });
  assert.equal(r.framework, 'jest');
});

test('parseTestOutput handles TAP output', () => {
  const r = parseTestOutput('ok 1 - login works\nnot ok 2 - checkout works\n');
  assert.equal(r.summary.passed, 1);
  assert.equal(r.summary.failed, 1);
});

test('isFixAccepted gates on FAIL_TO_PASS + PASS_TO_PASS', () => {
  const ok = isFixAccepted(['checkout'], ['login'], { passed: ['login', 'checkout'], failed: [] });
  assert.equal(ok.accepted, true);
  const regressed = isFixAccepted(['checkout'], ['login'], { passed: ['checkout'], failed: ['login'] });
  assert.equal(regressed.accepted, false);
  assert.deepEqual(regressed.regressed, ['login']);
});

test('SWE mode allows all tools including runTests/applyPatch', () => {
  for (const t of ['runTests', 'applyPatch', 'bash', 'editFile', 'readFile']) {
    assert.equal(isToolAllowedInMode(t, 'SWE'), true);
  }
});

test('codeMap is read-only (PLAN allowed)', () => {
  assert.equal(isToolAllowedInMode('codeMap', 'PLAN'), true);
  assert.equal(isToolAllowedInMode('codeMap', 'SWE'), true);
});

test('codeMap extracts JS and Python symbols', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { executeLocalTool } = await import('../src/shared/tools/index.js');
  const { extractSymbols } = await import('../src/shared/tools/index.js');
  const js = extractSymbols('a.js', 'export function foo() {}\nclass Bar {}\nconst baz = (x) => x;\n');
  assert.ok(js.some((s) => s.name === 'foo' && s.kind === 'function'));
  assert.ok(js.some((s) => s.name === 'Bar' && s.kind === 'class'));
  assert.ok(js.some((s) => s.name === 'baz' && s.kind === 'function'));
  const py = extractSymbols('b.py', 'def hello():\n    pass\nclass World:\n    pass\n');
  assert.ok(py.some((s) => s.name === 'hello' && s.kind === 'function'));
  assert.ok(py.some((s) => s.name === 'World' && s.kind === 'class'));

  const dir = await mkdtemp(join(tmpdir(), 'swe-codemap-'));
  const prev = process.cwd();
  process.chdir(dir);
  try {
    await writeFile(join(dir, 'calc.js'), 'export function div(a,b){return a/b;}\n', 'utf-8');
    const r = await executeLocalTool('codeMap', { path: '.' }, 'PLAN');
    const calc = r.files.find((f) => f.file === 'calc.js');
    assert.ok(calc, 'calc.js should be mapped');
    assert.ok(calc.symbols.some((s) => s.name === 'div'), 'div should be found');
  } finally {
    process.chdir(prev);
    await rm(dir, { recursive: true, force: true });
  }
});

test('historyToMessages preserves tool output in SWE mode only', async () => {
  const { historyToMessages } = await import('../src/agent/loop.js');
  const history = [{
    role: 'assistant',
    parts: [
      { type: 'text', text: 'reading file' },
      { type: 'tool-call', toolName: 'readFile', state: 'output-available', output: { content: 'SECRET_BODY_123' } },
    ],
  }];
  const swe = historyToMessages(history, { preserveToolCalls: true });
  assert.match(swe[0].content, /SECRET_BODY_123/);
  const plain = historyToMessages(history);
  assert.doesNotMatch(plain[0].content, /SECRET_BODY_123/);
});

test('applyPatch applies mid-file and multi-hunk patches', async () => {  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { executeLocalTool } = await import('../src/shared/tools/index.js');
  const dir = await mkdtemp(join(tmpdir(), 'swe-patch-test-'));
  const prev = process.cwd();
  process.chdir(dir);
  try {
    await writeFile(join(dir, 'mid.js'), 'l1\nl2\nl3 target\nl4\nl5\n', 'utf-8');
    const patch = [
      '--- a/mid.js',
      '+++ b/mid.js',
      '@@ -2,4 +2,4 @@',
      ' l2',
      '-l3 target',
      '+l3 FIXED',
      ' l4',
      ' l5',
    ].join('\n');
    const r = await executeLocalTool('applyPatch', { patch }, 'SWE');
    assert.equal(r.success, true);
    assert.equal(await readFile(join(dir, 'mid.js'), 'utf-8'), 'l1\nl2\nl3 FIXED\nl4\nl5\n');

    await writeFile(join(dir, 'two.js'), 'a1\na2\na3\na4\na5\na6\n', 'utf-8');
    const two = [
      '--- a/two.js',
      '+++ b/two.js',
      '@@ -1,2 +1,2 @@',
      '-a1',
      '+A1',
      ' a2',
      '@@ -5,2 +5,2 @@',
      ' a5',
      '-a6',
      '+A6',
    ].join('\n');
    await executeLocalTool('applyPatch', { patch: two }, 'SWE');
    assert.equal(await readFile(join(dir, 'two.js'), 'utf-8'), 'A1\na2\na3\na4\na5\nA6\n');
  } finally {
    process.chdir(prev);
    await rm(dir, { recursive: true, force: true });
  }
});

test('tampered checkpoint manifest cannot escape the project on undo', async () => {
  const { mkdtemp, writeFile, mkdir, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { restoreCheckpoint, sanitizeManifestRelative } = await import('../src/shared/tools/checkpoint.js');
  assert.equal(sanitizeManifestRelative('../../evil.txt'), null);
  assert.equal(sanitizeManifestRelative('/abs/path.txt'), null);
  assert.equal(sanitizeManifestRelative('C:\\Windows\\x.txt'), null);
  const okRel = sanitizeManifestRelative('ok/file.txt');
  assert.ok(typeof okRel === 'string' && okRel.includes('file.txt') && !okRel.includes('..'));

  const dir = await mkdtemp(join(tmpdir(), 'swe-checkpoint-'));
  const prev = process.cwd();
  process.chdir(dir);
  try {
    const outside = join(tmpdir(), `sentinel-escape-${Date.now()}.txt`);
    await writeFile(outside, 'do-not-touch', 'utf-8');
    // Simulate a tampered manifest pointing outside the project
    const cpDir = join(dir, '.sentinel', 'checkpoints', 'evil1');
    await mkdir(cpDir, { recursive: true });
    await writeFile(join(cpDir, '_manifest.json'), JSON.stringify({
      id: 'evil1',
      timestamp: Date.now(),
      files: [{ relative: '../evil.txt', existed: false }, { relative: '/abs.txt', existed: false }],
    }), 'utf-8');
    const r = await restoreCheckpoint('evil1');
    assert.deepEqual(r.restored, []);
    assert.deepEqual(r.deleted, []);
    assert.equal(await readFile(outside, 'utf-8'), 'do-not-touch');
    await rm(outside, { force: true });
  } finally {
    process.chdir(prev);
    await rm(dir, { recursive: true, force: true });
  }
});

test('trimMessagesForBudget bounds request size, keeps head and tail', async () => {
  const { trimMessagesForBudget, LOOP_REQUEST_CHAR_BUDGET } = await import('../src/agent/loop.js');
  const big = 'x'.repeat(50_000);
  const messages = [
    { role: 'user', content: 'TASK: fix the bug' },
    ...Array.from({ length: 10 }, (_, i) => ({ role: 'tool', tool_call_id: `c${i}`, content: big })),
    { role: 'assistant', content: 'working on it' },
  ];
  const trimmed = trimMessagesForBudget(messages);
  assert.ok(JSON.stringify(trimmed).length <= LOOP_REQUEST_CHAR_BUDGET);
  assert.equal(trimmed[0].content, 'TASK: fix the bug');
  assert.equal(trimmed[trimmed.length - 1].content, 'working on it');
  assert.ok(trimmed.some((m) => m.content === '[trimmed: budget]'));
  // Pure: original untouched
  assert.equal(messages[1].content, big);
});

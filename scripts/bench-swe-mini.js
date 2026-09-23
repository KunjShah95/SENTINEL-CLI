#!/usr/bin/env node
/**
 * bench-swe-mini — offline SWE-mini capability harness (no API key needed).
 *
 * Measures the tool/workflow capabilities that peer-reviewed SWE-agent
 * analysis shows are necessary (not sufficient) for a high SWE-bench score:
 * precise editing, atomic multi-file patches, test localization, structured
 * test results, unified-diff patch application (incl. mid-file hunks), and
 * safe undo — plus the baseline roundtrips, mode refusals, and sandbox.
 *
 * No API key needed. Run:  node scripts/bench-swe-mini.js  /  sentinel bench
 * Runs in an isolated tmp dir (chdir in, chdir out). Never touches the repo.
 */
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { executeLocalTool, Mode } from '../src/shared/tools/index.js';

// The bench measures tool *capabilities* in a throwaway sandbox — permission
// policy ('ask' prompts) is orthogonal and covered elsewhere. Pre-authorize
// every call so offline runs don't block on confirmation policy.
const runTool = (toolName, input, mode) =>
  executeLocalTool(toolName, input, mode, { preAuthorized: true });

export async function runMiniBench({ verbose = false } = {}) {
  const previousCwd = process.cwd();
  const sandbox = await mkdtemp(join(tmpdir(), 'sentinel-bench-'));
  process.chdir(sandbox);

  const checks = [];
  const check = async (name, fn) => {
    try {
      await fn();
      checks.push({ name, ok: true });
    } catch (e) {
      checks.push({ name, ok: false, error: e?.message || String(e) });
    }
  };
  const mustReject = async (fn, pattern) => {
    try {
      await fn();
    } catch (e) {
      if (pattern.test(e?.message || '')) return;
      throw new Error(`rejected with unexpected error: ${e?.message}`);
    }
    throw new Error('expected rejection, but the call succeeded');
  };

  // ── Baseline tool surface ──────────────────────────────────────────
  await check('write + read roundtrip', async () => {
    await runTool('writeFile', { path: 'a.txt', content: 'hello' }, Mode.BUILD);
    const out = await runTool('readFile', { path: 'a.txt' }, Mode.BUILD);
    if (!JSON.stringify(out).includes('hello')) throw new Error('read did not return written content');
  });

  await check('edit roundtrip', async () => {
    await runTool('editFile', { path: 'a.txt', oldString: 'hello', newString: 'world' }, Mode.BUILD);
    const out = await runTool('readFile', { path: 'a.txt' }, Mode.BUILD);
    if (!JSON.stringify(out).includes('world')) throw new Error('edit did not apply');
  });

  await check('PLAN refuses writeFile', async () => {
    await mustReject(
      () => runTool('writeFile', { path: 'x.txt', content: 'x' }, Mode.PLAN),
      /not available in PLAN mode/i
    );
  });

  await check('PLAN refuses bash', async () => {
    await mustReject(
      () => runTool('bash', { command: 'echo hi' }, Mode.PLAN),
      /not available in PLAN mode/i
    );
  });

  await check('sandbox refuses ../ escape', async () => {
    await mustReject(
      () => runTool('readFile', { path: '../outside.txt' }, Mode.BUILD),
      /outside the project directory/i
    );
  });

  await check('glob lists created files', async () => {
    const out = await runTool('glob', { pattern: '*.txt' }, Mode.BUILD);
    if (!JSON.stringify(out).includes('a.txt')) throw new Error('glob missed a.txt');
  });

  // ── SWE-bench capability gates ─────────────────────────────────────
  await check('ambiguous edit rejected (no silent wrong fix)', async () => {
    await writeFile(join(sandbox, 'amb.js'), 'x=1;x=1;x=1;', 'utf-8');
    await mustReject(
      () => runTool('editFile', { path: 'amb.js', oldString: 'x=1;', newString: 'x=2;' }, 'SWE'),
      /ambiguous/i
    );
  });

  await check('batch edit atomic across files', async () => {
    await writeFile(join(sandbox, 'c1.js'), 'v1', 'utf-8');
    await writeFile(join(sandbox, 'c2.js'), 'v1', 'utf-8');
    const r = await runTool('batchEdit', {
      operations: [
        { filePath: 'c1.js', oldString: 'v1', newString: 'v2' },
        { filePath: 'c2.js', oldString: 'v1', newString: 'v2' },
      ],
    }, 'SWE');
    if (!r.success) throw new Error('batchEdit failed');
    const [o1, o2] = await Promise.all([
      readFile(join(sandbox, 'c1.js'), 'utf-8'),
      readFile(join(sandbox, 'c2.js'), 'utf-8'),
    ]);
    if (o1 !== 'v2' || o2 !== 'v2') throw new Error('batchEdit not applied to both files');
  });

  await check('runTests returns structured PASS/FAIL', async () => {
    const r = await runTool(
      'runTests', { command: 'node -e "console.log(\'PASS suite-a\');console.log(\'FAIL suite-b\')"' }, 'SWE');
    if (r.summary?.passed !== 1 || r.summary?.failed !== 1) {
      throw new Error(`expected 1/1, got ${JSON.stringify(r.summary)}`);
    }
  });

  await check('runTests surfaces nonzero exit codes', async () => {
    const r = await runTool('runTests', { command: 'node -e "process.exit(3)"' }, 'SWE');
    if (r.exitCode !== 3) throw new Error(`expected exit 3, got ${r.exitCode}`);
  });

  await check('applyPatch applies mid-file hunks via @@ offsets', async () => {
    await writeFile(join(sandbox, 'mid.js'), 'l1\nl2\nl3 target\nl4\nl5\n', 'utf-8');
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
    const r = await runTool('applyPatch', { patch }, 'SWE');
    if (!r.success) throw new Error('applyPatch failed');
    const onDisk = await readFile(join(sandbox, 'mid.js'), 'utf-8');
    if (onDisk !== 'l1\nl2\nl3 FIXED\nl4\nl5\n') throw new Error(`mid-file hunk misapplied: ${JSON.stringify(onDisk)}`);
  });

  await check('applyPatch rejects mismatched context', async () => {
    await writeFile(join(sandbox, 'q.js'), 'aaa\nbbb\n', 'utf-8');
    const bad = ['--- a/q.js', '+++ b/q.js', '@@ -1,2 +1,2 @@', ' aaa', '-zzz', '+yyy'].join('\n');
    await mustReject(() => runTool('applyPatch', { patch: bad }, 'SWE'), /mismatch|not found/i);
  });

  await check('undo restores pre-fix state', async () => {
    await runTool('writeFile', { path: 'u.js', content: 'good' }, 'SWE');
    await runTool('writeFile', { path: 'u.js', content: 'broken' }, 'SWE');
    await runTool('undoLastChange', {}, 'SWE');
    const onDisk = await readFile(join(sandbox, 'u.js'), 'utf-8');
    if (onDisk !== 'good') throw new Error(`undo did not restore: ${JSON.stringify(onDisk)}`);
  });

  await check('codeMap localizes symbols without reading files', async () => {
    await writeFile(join(sandbox, 'calc.js'), 'export function div(a,b){return a/b;}\n', 'utf-8');
    const r = await runTool('codeMap', { path: '.' }, 'PLAN');
    const calc = r.files.find((f) => f.file === 'calc.js');
    if (!calc || !calc.symbols.some((s) => s.name === 'div')) {
      throw new Error('codeMap missed div in calc.js');
    }
  });

  await check('SWE helpers enforce FAIL_TO_PASS gates', async () => {    const { parseTestOutput, isFixAccepted, buildSweSystemPrompt } = await import('./../src/agent/swe.js');
    const parsed = parseTestOutput('PASS login\nFAIL checkout\n');
    if (parsed.summary.passed !== 1 || parsed.summary.failed !== 1) throw new Error('parseTestOutput wrong');
    const gate = isFixAccepted(['checkout'], ['login'], { passed: ['login', 'checkout'], failed: [] });
    if (!gate.accepted) throw new Error('valid fix rejected by gate');
    const prompt = buildSweSystemPrompt();
    if (!/REPRODUCE/.test(prompt) || !/REGRESS/.test(prompt)) throw new Error('SWE prompt missing phases');
  });

  process.chdir(previousCwd);
  await rm(sandbox, { recursive: true, force: true }).catch(() => {});

  const passed = checks.filter((c) => c.ok).length;
  if (verbose) {
    for (const c of checks) {
      console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : ` — ${c.error}`}`);
    }
    console.log(`\n${passed}/${checks.length} checks passed`);
    if (passed < checks.length) {
      console.log('Interpretation: each FAIL is a capability that would cost real SWE-bench points.');
    }
  }
  // `results` alias kept for the `sentinel bench` CLI and CI gates.
  return { passed, total: checks.length, checks, results: checks };
}

const invokedDirectly = (() => {
  try {
    return resolve(process.argv[1] || '') === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (invokedDirectly) {
  const { passed, total } = await runMiniBench({ verbose: true });
  process.exit(passed === total ? 0 : 1);
}

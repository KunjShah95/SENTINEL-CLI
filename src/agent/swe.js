/**
 * SWE-bench workflow helpers — the disciplined loop that separates
 * 70%+ agents from 30% agents on SWE-bench Verified / SWE-bench Pro.
 *
 * Workflow: REPRODUCE → LOCALIZE → FIX → VERIFY → REGRESS
 *   1. REPRODUCE: create a minimal repro script / run FAIL_TO_PASS tests first.
 *   2. LOCALIZE: grep + read, narrow to the smallest responsible scope.
 *   3. FIX: smallest possible edit (editFile/batchEdit), never a rewrite.
 *   4. VERIFY: re-run repro + FAIL_TO_PASS tests via runTests.
 *   5. REGRESS: run PASS_TO_PASS tests, undo if anything regressed.
 *
 * Pure functions only — no filesystem access — so they are unit-testable
 * and usable from the prompt builder, the CLI, and the bench harness.
 */

export const SWE_MODE = 'SWE';
export const SWE_MAX_ITERATIONS = 60;
export const SWE_TOOL_RESULT_CAP = 30000;

export const SWE_PHASES = Object.freeze([
  'REPRODUCE',
  'LOCALIZE',
  'FIX',
  'VERIFY',
  'REGRESS',
]);

/**
 * Build the SWE system prompt. Deliberately the opposite of the generic
 * BUILD prompt ("be decisive"): SWE-bench winners are disciplined and
 * test-driven, not fast.
 */
export function buildSweSystemPrompt() {
  return [
    'You are a senior software engineer fixing a real GitHub issue.',
    'You work in the project directory with file and shell tools.',
    'Follow the SWE loop STRICTLY, in order. Do not skip steps:',
    '',
    '1. REPRODUCE — Before touching source code, reproduce the bug.',
    '   Run the failing tests with runTests, or create a repro script with writeFile and run it with bash.',
    '   If you cannot reproduce, say so and stop — do not guess a fix.',
    '2. LOCALIZE — Use codeMap for a repo symbol overview, then grep + readFile to narrow to the smallest responsible function.',
    '   Read the test file first; it is the specification.',
    '3. FIX — Make the SMALLEST edit that fixes the cause (editFile preferred).',
    '   Never rewrite whole files. Never change public APIs or test files to make tests pass.',
    '   Preview risky edits with diffFile first.',
    '4. VERIFY — Re-run the repro + failing tests. All must pass.',
    '5. REGRESS — Run the related passing suite (PASS_TO_PASS). If anything regressed, undoLastChange and try again.',
    '',
    'Rules:',
    '- Batch independent reads/greps in one block.',
    '- Keep edits surgical: one root cause, minimal diff.',
    '- Every bash/test command must finish within its timeout; use runTests for test commands so output is parsed.',
    '- End with: files changed, root cause (1 line), tests run (names + pass/fail).',
    '',
    'Available tools: readFile, listDirectory, glob, grep, codeMap, writeFile, editFile,',
    'batchEdit, bash, runTests, applyPatch, diffFile, undoLastChange, redoLastUndo, searchWeb.',
  ].join('\n');
}

/**
 * Parse raw test-runner output into structured FAIL_TO_PASS / PASS_TO_PASS
 * style results. Handles jest, pytest, mocha, vitest, and node:test shapes.
 *
 * @param {string} output raw stdout+stderr
 * @returns {{passed: string[], failed: string[], summary: {passed: number, failed: number}, framework: string}}
 */
export function parseTestOutput(output = '') {
  const text = String(output);
  const passed = [];
  const failed = [];
  let framework = 'unknown';

  const patterns = [
    { re: /^(PASS|FAIL)\s+(.+)$/gm, kind: 'jest' }, // jest: "PASS path" / "FAIL path"
    { re: /^(PASSED|FAILED|ERROR)\s+(.+)$/gm, kind: 'pytest' },
    { re: /^\s*\d+\)\s+(.+)$/gm, kind: 'mocha-fail' }, // mocha failing list
  ];

  for (const { re, kind } of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      if (framework === 'unknown' && kind !== 'mocha-fail') framework = kind;
      if (kind === 'jest' || kind === 'pytest') {
        const status = m[1];
        const name = m[2].trim();
        if (/^(PASS|PASSED)$/.test(status)) passed.push(name);
        else failed.push(name);
      }
    }
    re.lastIndex = 0;
  }

  // mocha / node:test summary lines: "3 passing", "2 failing"
  const passingMatch = text.match(/(\d+)\s+passing/i);
  const failingMatch = text.match(/(\d+)\s+failing/i);
  if (passingMatch || failingMatch) framework = framework === 'unknown' ? 'mocha' : framework;

  // pytest summary: "3 passed, 1 failed"
  const pyPassed = text.match(/(\d+)\s+passed/i);
  const pyFailed = text.match(/(\d+)\s+failed/i);
  if ((pyPassed || pyFailed) && framework === 'unknown') framework = 'pytest';

  // Fallback: TAP / node:test "ok N" / "not ok N"
  const tapOk = text.match(/^ok\s+\d+\s*-?\s*(.*)$/gm) || [];
  const tapNotOk = text.match(/^not ok\s+\d+\s*-?\s*(.*)$/gm) || [];
  if ((tapOk.length || tapNotOk.length) && passed.length === 0 && failed.length === 0) {
    framework = 'tap';
    for (const line of tapOk) passed.push(String(line).replace(/^ok\s+\d+\s*-?\s*/, '').trim() || 'test');
    for (const line of tapNotOk) failed.push(String(line).replace(/^not ok\s+\d+\s*-?\s*/, '').trim() || 'test');
  }

  // If counts known from summary but individual names missing, synthesize counts
  if (passed.length === 0 && failed.length === 0) {
    const nPass = Number(passingMatch?.[1] ?? pyPassed?.[1] ?? tapOk.length ?? 0);
    const nFail = Number(failingMatch?.[1] ?? pyFailed?.[1] ?? tapNotOk.length ?? 0);
    for (let i = 0; i < nPass; i++) passed.push(`passing-test-${i + 1}`);
    for (let i = 0; i < nFail; i++) failed.push(`failing-test-${i + 1}`);
  }

  return {
    passed,
    failed,
    summary: { passed: passed.length, failed: failed.length },
    framework,
  };
}

/**
 * Decide whether a fix is acceptable under SWE-bench rules:
 * all FAIL_TO_PASS must pass, no PASS_TO_PASS may regress.
 *
 * @param {string[]} failToPass tests that must now pass
 * @param {string[]} passToPass tests that must keep passing
 * @param {{passed: string[], failed: string[]}} results parsed test results
 */
export function isFixAccepted(failToPass = [], passToPass = [], results = { passed: [], failed: [] }) {
  const passedSet = new Set(results.passed || []);
  const failedSet = new Set(results.failed || []);
  // Match by substring so "suite/test-name" matches "test-name"
  const isPassing = (name) =>
    passedSet.has(name) || [...passedSet].some((p) => p.includes(name) || name.includes(p));
  const isFailing = (name) =>
    failedSet.has(name) || [...failedSet].some((f) => f.includes(name) || name.includes(f));

  const unFixed = (failToPass || []).filter((t) => !isPassing(t));
  const regressed = (passToPass || []).filter((t) => isFailing(t));
  return { accepted: unFixed.length === 0 && regressed.length === 0, unFixed, regressed };
}

/**
 * Build a minimal unified-diff-style patch record for export
 * (SWE-bench harnesses evaluate `git diff`, so every fix must be exportable).
 */
export function formatPatchRecord({ files = [], testsRun = [], model = 'unknown' } = {}) {
  const lines = [
    `Model: ${model}`,
    `Files: ${files.length ? files.join(', ') : '(none)'}`,
    `Tests: ${testsRun.length ? testsRun.join(', ') : '(none)'}`,
  ];
  return lines.join('\n');
}

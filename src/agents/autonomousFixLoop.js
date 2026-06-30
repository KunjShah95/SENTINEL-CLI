// Autonomous Fix Loop: scan -> fix -> validate -> RE-SCAN (prove vuln gone) -> iterate
//
// This is the differentiator: a generic agent stops at "here's a patch".
// This loop keeps going until the scanner confirms the finding is actually
// resolved (or a max-iteration / regression guard trips), then optionally
// writes the proven fix back to disk and records the outcome for learning.

import fs from 'fs';
import { unifiedScan, isAutoFixable } from './unifiedScan.js';
import { proposeFixes } from './fixer_agent.js';
import { validateFix } from './validator_agent.js';

const SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

// Stable signature for an issue so we can tell "resolved" from "new".
function sig(e) {
  return `${e.type || 'Error'}|${e.message || ''}|${e.line ?? 'null'}`;
}

function atOrAbove(severity, threshold) {
  return (SEVERITY_ORDER[severity || 'info'] ?? 0) >= (SEVERITY_ORDER[threshold] ?? 0);
}

/**
 * Run the autonomous fix loop on a single code string.
 *
 * @param {string} code           Source to scan/fix.
 * @param {object} options
 * @param {string} [options.filename]     Used for language detection + scanning.
 * @param {number} [options.maxIterations=5]
 * @param {string} [options.failOn]       Only target issues at/above this severity (e.g. 'high').
 * @param {boolean}[options.useLLM=true]
 * @param {boolean}[options.writeBack=false]  Write proven fix to `filename`.
 * @param {object} [options.learning]     AgentLearningSystem instance (already init()'d).
 * @returns {Promise<object>} report
 */
async function runFixLoop(code, options = {}) {
  const {
    filename = 'code.js',
    maxIterations = 5,
    failOn = null,
    useLLM = true,
    writeBack = false,
    learning = null
  } = options;

  const startedAt = Date.now();
  const scanOpts = { filename };

  const initialErrors = await unifiedScan(code, scanOpts);
  const targeted = failOn
    ? initialErrors.filter(e => atOrAbove(e.severity, failOn))
    : initialErrors;

  // Only auto-fixable findings drive the `proven` guarantee. Report-only findings
  // (bugs/quality/perf the fixer can't deterministically resolve) are surfaced but
  // never block proven — otherwise the loop could never converge.
  const fixTargets = targeted.filter(isAutoFixable);
  const reportOnly = targeted.filter(e => !isAutoFixable(e));

  const report = {
    filename,
    iterations: 0,
    initialCount: initialErrors.length,
    targetedCount: fixTargets.length,
    reportOnly,
    reportOnlyCount: reportOnly.length,
    resolved: [],
    remaining: [],
    regressionsIntroduced: [],
    syntaxValid: true,
    proven: false,
    finalCode: code,
    wroteFile: false,
    history: []
  };

  if (fixTargets.length === 0) {
    report.proven = true;
    report.unfixableRemaining = reportOnly;
    report.clean = reportOnly.length === 0;
    await record(learning, 'fixer', filename, true, startedAt, 'no-op');
    return report;
  }

  let working = code;
  let outstanding = fixTargets;
  const initialSigs = new Set(initialErrors.map(sig));
  // Only block a fix if it introduces a finding at/above this bar — low-severity
  // noise (e.g. an env-var reference replacing a hardcoded secret) must not veto
  // a critical fix.
  const regressionThreshold = failOn || 'high';

  for (let i = 0; i < maxIterations && outstanding.length > 0; i++) {
    report.iterations = i + 1;

    // 1. Propose compounded fixes for the still-outstanding issues.
    const { fixedCode } = await proposeFixes(working, outstanding, { useLLM, context: { filename } });

    if (fixedCode === working) {
      // Fixer made no change — further iteration won't help.
      report.history.push({ iteration: i + 1, note: 'fixer produced no change; stopping' });
      break;
    }

    // 2. Syntax-validate the candidate. Reject regressions (don't ship broken code).
    const validation = validateFix(working, fixedCode, outstanding, { filename });
    if (!validation.passes) {
      report.history.push({
        iteration: i + 1,
        note: 'candidate failed syntax validation; rolled back',
        details: validation.details
      });
      report.syntaxValid = false;
      break;
    }
    report.syntaxValid = true;

    // 3. RE-SCAN the candidate — this is the proof step.
    const rescan = await unifiedScan(fixedCode, scanOpts);
    const rescanSigs = new Set(rescan.map(sig));

    // New findings the fix introduced (regressions) at/above the threshold.
    const regressions = rescan.filter(e => !initialSigs.has(sig(e)) && atOrAbove(e.severity, regressionThreshold));
    if (regressions.length > 0) {
      report.regressionsIntroduced = regressions;
      report.history.push({
        iteration: i + 1,
        note: 'candidate introduced new findings; rolled back',
        regressions: regressions.map(sig)
      });
      break;
    }

    // Accept the candidate.
    working = fixedCode;

    // Recompute outstanding against the new scan (auto-fixable, in-scope, original).
    outstanding = (failOn ? rescan.filter(e => atOrAbove(e.severity, failOn)) : rescan)
      .filter(e => isAutoFixable(e) && initialSigs.has(sig(e)));

    report.history.push({
      iteration: i + 1,
      remaining: outstanding.length,
      accepted: true
    });

    if (outstanding.length === 0) break;

    // Avoid infinite loop if the same set keeps coming back unchanged.
    const stillSame = outstanding.every(e => rescanSigs.has(sig(e)));
    if (stillSame && i > 0 && report.history[i - 1]?.remaining === outstanding.length) {
      report.history.push({ iteration: i + 1, note: 'no progress between iterations; stopping' });
      break;
    }
  }

  report.finalCode = working;

  // Final reconciliation: what got fixed vs what's left.
  const finalScan = await unifiedScan(working, scanOpts);
  const finalSigs = new Set(finalScan.map(sig));
  const inScope = failOn ? finalScan.filter(e => atOrAbove(e.severity, failOn)) : finalScan;
  report.resolved = fixTargets.filter(e => !finalSigs.has(sig(e)));
  report.remaining = inScope.filter(e => isAutoFixable(e) && initialSigs.has(sig(e)));
  // Findings the loop can't auto-fix (eval, bugs, etc.) still present at threshold —
  // a human must address these. `proven` = auto-fix succeeded; `clean` = nothing left.
  report.unfixableRemaining = inScope.filter(e => !isAutoFixable(e));
  report.proven = report.remaining.length === 0 && report.regressionsIntroduced.length === 0;
  report.clean = report.proven && report.unfixableRemaining.length === 0;

  // Optional write-back — only when proven and code actually changed.
  if (writeBack && report.proven && working !== code && filename) {
    try {
      fs.writeFileSync(filename, working, 'utf8');
      report.wroteFile = true;
    } catch (e) {
      report.history.push({ note: `write-back failed: ${e.message}` });
    }
  }

  await record(learning, 'fixer', filename, report.proven, startedAt,
    report.proven ? `resolved ${report.resolved.length}` : `remaining ${report.remaining.length}`);

  return report;
}

async function record(learning, agentType, filename, success, startedAt, note) {
  if (!learning?.recordTask) return;
  try {
    await learning.recordTask(agentType,
      { type: 'fix', language: filename?.split('.').pop() || 'unknown' },
      { success, duration: Date.now() - startedAt, error: success ? null : note });
  } catch { /* learning is best-effort */ }
}

/** Convenience: run the loop against a file on disk. */
async function runFixLoopOnFile(filePath, options = {}) {
  const code = fs.readFileSync(filePath, 'utf8');
  return runFixLoop(code, { ...options, filename: filePath });
}

/**
 * Run the per-file fix loop across many files and aggregate the result.
 *
 * @param {string[]} paths            File paths to process.
 * @param {object}   [options]        Forwarded to `runFixLoop` per file.
 * @param {object}   [options.learning]  Shared AgentLearningSystem instance,
 *                                        threaded through every file so learning
 *                                        accumulates across the whole batch.
 * @returns {Promise<{files: object[], totals: {targeted:number, resolved:number, remaining:number, proven:number}}>}
 */
async function runFixLoopOnPaths(paths, options = {}) {
  const list = Array.isArray(paths) ? paths : [paths];

  const report = {
    files: [],
    totals: { targeted: 0, resolved: 0, remaining: 0, proven: 0 }
  };

  for (const filePath of list) {
    let fileReport;
    try {
      fileReport = await runFixLoopOnFile(filePath, options);
    } catch (e) {
      fileReport = {
        filename: filePath,
        error: e.message,
        targetedCount: 0,
        resolved: [],
        remaining: [],
        proven: false
      };
    }

    report.files.push(fileReport);
    report.totals.targeted += fileReport.targetedCount || 0;
    report.totals.resolved += fileReport.resolved?.length || 0;
    report.totals.remaining += fileReport.remaining?.length || 0;
    if (fileReport.proven) report.totals.proven += 1;
  }

  return report;
}

export { runFixLoop, runFixLoopOnFile, runFixLoopOnPaths, sig };

import chalk from 'chalk';
import path from 'path';
import { promises as fs } from 'fs';
import { runFixLoopOnFile } from '../agents/autonomousFixLoop.js';

/**
 * `sentinel fix` — autonomous security fix loop as a first-class CLI command.
 *
 * Wraps the scan → fix → validate → RE-SCAN loop in `autonomousFixLoop.js`.
 * Unlike a generic "here's a patch" fixer, this proves each finding is gone by
 * re-scanning the candidate before accepting it, then optionally writes the
 * proven fix back to disk. Designed to double as a CI gate via `--fail-on`.
 */

const DEFAULT_GLOB_IGNORE = ['node_modules/**', 'dist/**', 'build/**', '.git/**'];

/**
 * Expand a list of file paths / globs into concrete, de-duplicated file paths.
 * A literal existing file is used as-is; anything else is treated as a glob.
 */
async function expandTargets(patterns) {
  const { glob } = await import('glob');
  const seen = new Set();
  const files = [];

  for (const pattern of patterns) {
    let matches = [];

    // Prefer a literal file when it exists (avoids glob escaping headaches on Windows).
    try {
      const stat = await fs.stat(pattern);
      if (stat.isFile()) {
        matches = [pattern];
      }
    } catch {
      // Not a literal file — fall through to glob expansion.
    }

    if (matches.length === 0) {
      matches = await glob(pattern, {
        cwd: process.cwd(),
        ignore: DEFAULT_GLOB_IGNORE,
        nodir: true,
        windowsPathsNoEscape: true,
      });
    }

    for (const match of matches) {
      const resolved = path.resolve(process.cwd(), match);
      if (!seen.has(resolved)) {
        seen.add(resolved);
        files.push(match);
      }
    }
  }

  return files;
}

function printFileReport(report) {
  const name = report.filename;
  console.log(chalk.cyan(`\n  ${name}`));
  console.log(chalk.gray('  ' + '─'.repeat(Math.max(10, name.length))));

  if (report.error) {
    console.log(chalk.red(`  ✗ Error: ${report.error}`));
    return;
  }

  if ((report.targetedCount || 0) === 0) {
    console.log(chalk.gray('  No targeted issues found.'));
  }

  for (const issue of report.resolved || []) {
    const where = issue.line != null ? `:${issue.line}` : '';
    console.log(chalk.green(`  ✓ ${issue.type || 'Issue'}${where}`) + chalk.gray(` — ${issue.message || ''}`));
  }

  for (const issue of report.remaining || []) {
    const where = issue.line != null ? `:${issue.line}` : '';
    console.log(chalk.red(`  ✗ ${issue.type || 'Issue'}${where}`) + chalk.gray(` — ${issue.message || ''}`));
  }

  for (const reg of report.regressionsIntroduced || []) {
    const where = reg.line != null ? `:${reg.line}` : '';
    console.log(chalk.yellow(`  ⚠ regression: ${reg.type || 'Issue'}${where}`) + chalk.gray(` — ${reg.message || ''}`));
  }

  // Findings the loop can't auto-fix — surfaced so a human addresses them.
  for (const issue of report.unfixableRemaining || []) {
    const where = issue.line != null ? `:${issue.line}` : '';
    console.log(chalk.yellow(`  ⚠ needs human: ${issue.severity || ''} ${issue.type || 'Issue'}${where}`) + chalk.gray(` — ${issue.message || ''}`));
  }

  const proven = report.proven
    ? chalk.green.bold('YES')
    : chalk.red.bold('NO');
  const clean = report.clean
    ? chalk.green.bold('YES')
    : chalk.red.bold('NO');
  console.log(
    `  ${chalk.white('Iterations:')} ${report.iterations ?? 0}` +
    `  ${chalk.white('Resolved:')} ${(report.resolved || []).length}` +
    `  ${chalk.white('Remaining:')} ${(report.remaining || []).length}` +
    `  ${chalk.white('PROVEN:')} ${proven}` +
    `  ${chalk.white('CLEAN:')} ${clean}`
  );

  if (report.wroteFile) {
    console.log(chalk.green('  ↳ wrote proven fix to disk'));
  }
}

/**
 * Run the fix command. Returns the aggregate result so it stays testable.
 *
 * @param {string[]} patterns  File paths and/or globs.
 * @param {object}   options   { loop, failOn, write, maxIter, llm }
 * @returns {Promise<{ files: object[], totals: object, exitCode: number }>}
 */
export async function runFixCommand(patterns = [], options = {}) {
  const {
    loop = false,
    failOn = null,
    write = false,
    maxIter = 5,
    llm = true,
  } = options;

  if (!patterns || patterns.length === 0) {
    console.error(chalk.red('✗ No files specified. Usage: sentinel fix <file|glob...> --loop'));
    return { files: [], totals: { proven: 0, unproven: 0 }, exitCode: 1 };
  }

  const targets = await expandTargets(patterns);

  if (targets.length === 0) {
    console.log(chalk.yellow('No matching files found.'));
    return { files: [], totals: { proven: 0, unproven: 0 }, exitCode: 0 };
  }

  console.log(chalk.bold.cyan('\n🛠️  Sentinel Autonomous Fix'));
  console.log(
    chalk.gray(
      `  Mode: ${loop ? 'autonomous loop' : 'single-pass'}` +
      `  ·  Files: ${targets.length}` +
      `  ·  Write-back: ${write ? 'on' : 'off'}` +
      `  ·  LLM: ${llm ? 'on' : 'off'}` +
      (failOn ? `  ·  Fail-on: ${failOn}` : '')
    )
  );

  // `--loop` enables multi-iteration autonomy; without it we do a single pass.
  const maxIterations = loop ? Math.max(1, maxIter) : 1;

  const files = [];
  const totals = { targeted: 0, resolved: 0, remaining: 0, proven: 0, clean: 0, wrote: 0 };

  for (const target of targets) {
    let report;
    try {
      report = await runFixLoopOnFile(target, {
        maxIterations,
        failOn: failOn || null,
        useLLM: llm,
        writeBack: write,
      });
    } catch (e) {
      report = {
        filename: target,
        error: e.message,
        targetedCount: 0,
        resolved: [],
        remaining: [],
        proven: false,
      };
    }

    printFileReport(report);
    files.push(report);
    totals.targeted += report.targetedCount || 0;
    totals.resolved += (report.resolved || []).length;
    totals.remaining += (report.remaining || []).length;
    if (report.proven) totals.proven += 1;
    if (report.clean) totals.clean += 1;
    if (report.wroteFile) totals.wrote += 1;
  }

  const provenFiles = totals.proven;
  const unprovenFiles = files.length - provenFiles;
  const uncleanFiles = files.length - totals.clean;

  console.log(chalk.bold.cyan('\n  Summary'));
  console.log(chalk.gray('  ' + '─'.repeat(30)));
  console.log(`  ${chalk.white('Files:')}     ${files.length}`);
  console.log(`  ${chalk.green('Proven:')}    ${provenFiles}`);
  console.log(`  ${chalk.red('Unproven:')}  ${unprovenFiles}`);
  console.log(`  ${chalk.green('Clean:')}     ${totals.clean}`);
  console.log(`  ${chalk.yellow('Unclean:')}   ${uncleanFiles}`);
  console.log(`  ${chalk.white('Resolved:')}  ${totals.resolved}`);
  console.log(`  ${chalk.white('Remaining:')} ${totals.remaining}`);
  if (write) console.log(`  ${chalk.white('Written:')}   ${totals.wrote}`);
  console.log('');

  // CI gate: when --fail-on is set, fail if any file isn't CLEAN — i.e. anything
  // at/above the threshold remains, including findings a human must fix.
  let exitCode = 0;
  if (failOn && uncleanFiles > 0) {
    console.error(
      chalk.red(`✗ ${uncleanFiles} file(s) still have findings at or above '${failOn}' (auto-fixed or not)`)
    );
    exitCode = 1;
  } else {
    console.log(chalk.green('✓ All targeted files clean'));
  }

  return { files, totals: { ...totals, unproven: unprovenFiles, unclean: uncleanFiles }, exitCode };
}

export default { runFixCommand };

#!/usr/bin/env node

/**
 * Coverage runner — runs all test suites with coverage and reports results.
 *
 * Usage:
 *   node scripts/coverage.mjs                   # runs everything
 *   node scripts/coverage.mjs --node            # node:test only
 *   node scripts/coverage.mjs --jest            # Jest only
 *   node scripts/coverage.mjs --open            # opens HTML report in browser
 *
 * Requirements: Node >= 20 (for --experimental-test-coverage)
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─── node:test-compatible files (updated as new tests are added) ─────────────

const NODE_TEST_FILES = [
  'shared-tools.test.js',
  'server-routes.test.js',
  'server-api.test.js',
  'pr-bot-server.test.js',
  'review-pipeline.test.js',
  'analyzerWorker.test.js',
  'sast-runner.test.js',
  'configValidator.test.js',
  'linter.test.js',
  'fileOperations.test.js',
  'sarifGenerator.test.js',
  'errorHandler.test.js',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cwp(...segments) {
  return resolve(ROOT, ...segments);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: ROOT,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, FORCE_COLOR: '1' },
      ...opts,
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

// ─── Node:test coverage ────────────────────────────────────────────────────

async function runNodeCoverage() {
  const testFiles = NODE_TEST_FILES.map((f) => cwp('__tests__', f));
  const missing = testFiles.filter((f) => !existsSync(f));
  if (missing.length > 0) {
    console.error(`\n  ✖ Missing node:test files:\n${missing.map((f) => `    ${relative(ROOT, f)}`).join('\n')}\n`);
    return false;
  }

  console.log('\n  ════════════════════════════════════════════');
  console.log(`  🟢  node:test — running ${NODE_TEST_FILES.length} files with coverage`);
  console.log('  ════════════════════════════════════════════\n');

  try {
    await run('node', [
      '--experimental-test-coverage',
      '--test',
      ...NODE_TEST_FILES.map((f) => cwp('__tests__', f)),
    ]);
    console.log('\n  ✅ node:test — all passed\n');
    return true;
  } catch {
    console.error('\n  ❌ node:test — some tests failed\n');
    return false;
  }
}

// ─── Jest coverage ──────────────────────────────────────────────────────────

async function runJestCoverage() {
  if (!existsSync(cwp('node_modules', 'jest'))) {
    console.log('  ⚠️  Jest not installed — skipping Jest coverage\n');
    return true;
  }

  console.log('\n  ════════════════════════════════════════════');
  console.log('  🟡  Jest — running with --coverage');
  console.log('  ════════════════════════════════════════════\n');

  try {
    await run('node', [
      '--experimental-vm-modules',
      'node_modules/jest/bin/jest.js',
      '--coverage',
    ]);
    console.log('\n  ✅ Jest — all passed\n');
    return true;
  } catch {
    console.error('\n  ❌ Jest — some tests failed\n');
    return false;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const runNode = args.length === 0 || args.includes('--node');
  const runJest = args.length === 0 || args.includes('--jest');

  let nodeOk = true;
  let jestOk = true;

  if (runNode) {
    nodeOk = await runNodeCoverage();
  }

  if (runJest) {
    jestOk = await runJestCoverage();
  }

  // Summary
  console.log('\n  ──────────────────────────────────────────────');
  console.log('  📊  Coverage Summary');
  console.log('  ──────────────────────────────────────────────');
  if (runNode) console.log(`     node:test  ${nodeOk ? '✅ pass' : '❌ fail'}`);
  if (runJest) console.log(`     Jest       ${jestOk ? '✅ pass' : '❌ fail'}`);
  console.log('');

  const reportDir = cwp('coverage');
  const lcovPath = cwp('coverage', 'lcov-report', 'index.html');
  const nodeReport = cwp('coverage', 'node-test');

  if (existsSync(lcovPath)) {
    console.log(`  📄  Jest HTML report:  ${relative(ROOT, lcovPath)}`);
  }
  if (existsSync(nodeReport)) {
    console.log(`  📄  node:test report:  ${relative(ROOT, nodeReport)}`);
  }
  if (existsSync(reportDir)) {
    console.log(`  📁  All reports in:    ${relative(ROOT, reportDir)}/\n`);
  }

  // Open browser if --open flag was passed
  if (args.includes('--open') && existsSync(lcovPath)) {
    console.log('  🌐  Opening HTML report...\n');
    if (process.platform === 'win32') {
      const { exec } = await import('node:child_process');
      exec(`start "" "${lcovPath}"`, { stdio: 'ignore' });
    } else {
      const openCmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
      await run(openCmd, [lcovPath]).catch(() => {});
    }
  }

  process.exit(nodeOk && jestOk ? 0 : 1);
}

main();

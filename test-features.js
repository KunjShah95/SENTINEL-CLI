#!/usr/bin/env node

/**
 * Sentinel CLI v1.9.0 - Complete Feature Test Suite
 * Tests all CLI commands to ensure they're properly integrated
 */

import { execSync } from 'child_process';
import chalk from 'chalk';

const tests = [
  // Core commands
  { cmd: 'sentinel --version', desc: 'Version check' },
  { cmd: 'sentinel --help', desc: 'Help display' },
  
  // Analysis commands
  { cmd: 'sentinel analyze --help', desc: 'Analyze command' },
  { cmd: 'sentinel security-audit --help', desc: 'Security audit' },
  { cmd: 'sentinel full-scan --help', desc: 'Full scan' },
  { cmd: 'sentinel frontend --help', desc: 'Frontend analysis' },
  { cmd: 'sentinel backend --help', desc: 'Backend analysis' },
  
  // New AI-powered features
  { cmd: 'sentinel pr-description --help', desc: 'PR Description Generator' },
  { cmd: 'sentinel commit-msg --help', desc: 'Commit Message Suggester' },
  { cmd: 'sentinel inline-comments --help', desc: 'Inline Comments Generator' },
  { cmd: 'sentinel test-suggestions --help', desc: 'Test Suggestions' },
  { cmd: 'sentinel complexity --help', desc: 'Complexity Analysis' },
  { cmd: 'sentinel best-practices --help', desc: 'Best Practices Analysis' },
  { cmd: 'sentinel multi-file --help', desc: 'Multi-File Analysis' },
  { cmd: 'sentinel pr-summary --help', desc: 'PR Summary Generator' },
  
  // Management commands
  { cmd: 'sentinel rules --help', desc: 'Custom Rules Management' },
  { cmd: 'sentinel team --help', desc: 'Team Workspace Management' },
  { cmd: 'sentinel status --help', desc: 'System Status' },
  { cmd: 'sentinel benchmark --help', desc: 'Performance Benchmarks' },
  
  // Utility commands
  { cmd: 'sentinel config --help', desc: 'Configuration' },
  { cmd: 'sentinel cache --help', desc: 'Cache Management' },
  { cmd: 'sentinel validate --help', desc: 'Config Validation' },
];

console.log(chalk.cyan.bold('\n🧪 Sentinel CLI Feature Test Suite\n'));
console.log(chalk.gray('─'.repeat(60)));

let passed = 0;
let failed = 0;

for (const test of tests) {
  try {
    execSync(`node src/core/cli.js ${test.cmd}`, { 
      stdio: 'pipe',
      cwd: process.cwd()
    });
    console.log(chalk.green(`✓ ${test.desc}`));
    passed++;
  } catch (error) {
    console.log(chalk.red(`✗ ${test.desc}`));
    failed++;
  }
}

console.log(chalk.gray('─'.repeat(60)));
console.log(chalk.bold(`\nResults: ${passed} passed, ${failed} failed`));

if (failed === 0) {
  console.log(chalk.green.bold('\n✅ All features are properly integrated!\n'));
} else {
  console.log(chalk.yellow.bold(`\n⚠️  ${failed} feature(s) need attention\n`));
}

process.exit(failed > 0 ? 1 : 0);

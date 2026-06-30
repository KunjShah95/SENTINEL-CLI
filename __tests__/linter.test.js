/**
 * Unit tests for Linter — pure functions that don't require external tools.
 *
 * The Linter class depends on `exec`/`npx` for running ESLint, Prettier, etc.
 * These tests focus on the pure logic: argument building, output parsing,
 * issue flattening, and result summarization.
 *
 * Run with:
 *   node --test __tests__/linter.test.js
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { Linter } from '../src/utils/linter.js';

let linter;

before(async () => {
  const mod = await import('../src/utils/linter.js');
  linter = new mod.Linter();
});

// ─── getESLintArgs ──────────────────────────────────────────────────────────

describe('Linter.getESLintArgs', () => {
  test('returns default args without fix', () => {
    const args = linter.getESLintArgs(false, 'json');
    assert.ok(args.includes('--format'));
    assert.ok(args.includes('json'));
    assert.ok(!args.includes('--fix'));
    assert.ok(args.some(a => a.startsWith('.'))); // target directory
  });

  test('includes --fix when fix=true', () => {
    const args = linter.getESLintArgs(true, 'json');
    assert.ok(args.includes('--fix'));
  });

  test('defaults format to json for unknown formats', () => {
    const args = linter.getESLintArgs(false, 'unknown');
    const fmtIdx = args.indexOf('--format');
    assert.notEqual(fmtIdx, -1);
    assert.equal(args[fmtIdx + 1], 'json');
  });
});

// ─── parseESLintOutput ──────────────────────────────────────────────────────

describe('Linter.parseESLintOutput', () => {
  const sampleOutput = JSON.stringify([
    { filePath: '/test/a.js', errorCount: 1, warningCount: 0, messages: [{ ruleId: 'no-eval', severity: 2, message: 'eval is evil', line: 5, column: 3 }] },
    { filePath: '/test/b.js', errorCount: 0, warningCount: 0, messages: [] },
  ]);

  test('parses valid JSON output with errors', () => {
    const result = linter.parseESLintOutput(sampleOutput, 'json');
    assert.equal(result.success, false);
    assert.equal(result.framework, 'eslint');
    assert.equal(result.summary.files, 2);
    assert.equal(result.summary.errors, 1);
    assert.equal(result.summary.warnings, 0);
  });

  test('parses valid JSON output with no errors', () => {
    const cleanOutput = JSON.stringify([
      { filePath: '/test/a.js', errorCount: 0, warningCount: 0, messages: [] },
    ]);
    const result = linter.parseESLintOutput(cleanOutput, 'json');
    assert.equal(result.success, true);
    assert.equal(result.summary.errors, 0);
  });

  test('returns error wrapper for invalid JSON', () => {
    const result = linter.parseESLintOutput('not-json', 'json');
    assert.equal(result.success, false);
    assert.match(result.error, /Failed to parse ESLint output/);
  });

  test('returns raw output for non-json format', () => {
    const result = linter.parseESLintOutput('some text output', 'stylish');
    assert.equal(result.success, true);
    assert.equal(result.output, 'some text output');
  });
});

// ─── flattenESLintIssues ────────────────────────────────────────────────────

describe('Linter.flattenESLintIssues', () => {
  const sampleResults = [
    {
      filePath: '/test/app.js',
      messages: [
        { ruleId: 'no-eval', severity: 2, message: 'No eval', line: 1, column: 5, source: 'eval(x)' },
        { ruleId: 'no-debugger', severity: 1, message: 'No debugger', line: 10, column: 1, source: 'debugger;' },
      ],
    },
  ];

  test('flattens issues with correct severity mapping', () => {
    const issues = linter.flattenESLintIssues(sampleResults);
    assert.equal(issues.length, 2);
    assert.equal(issues[0].severity, 'error');   // severity 2 → error
    assert.equal(issues[1].severity, 'warning'); // severity 1 → warning
  });

  test('includes file path, line, column, source', () => {
    const issues = linter.flattenESLintIssues(sampleResults);
    assert.equal(issues[0].file, '/test/app.js');
    assert.equal(issues[0].line, 1);
    assert.equal(issues[0].column, 5);
    assert.equal(issues[0].source, 'eval(x)');
  });

  test('returns empty array for empty input', () => {
    const issues = linter.flattenESLintIssues([]);
    assert.deepEqual(issues, []);
  });
});

// ─── countFiles ─────────────────────────────────────────────────────────────

describe('Linter.countFiles', () => {
  test('parses "5 files" from Prettier output', () => {
    assert.equal(linter.countFiles('5 files formatted'), 5);
  });

  test('parses "1 file" singular', () => {
    assert.equal(linter.countFiles('1 file formatted'), 1);
  });

  test('returns 0 when no match', () => {
    assert.equal(linter.countFiles('No files to format'), 0);
  });
});

// ─── summarizeResults ────────────────────────────────────────────────────────

describe('Linter.summarizeResults', () => {
  test('summarizes mixed results', () => {
    const results = [
      { success: true, summary: { errors: 0, warnings: 1 } },
      { success: false, summary: { errors: 3, warnings: 2 } },
      { success: true, summary: { errors: 0, warnings: 0 } },
    ];
    const summary = linter.summarizeResults(results);
    assert.equal(summary.totalLinters, 3);
    assert.equal(summary.passed, 2);
    assert.equal(summary.failed, 1);
    assert.equal(summary.totalErrors, 3);
    assert.equal(summary.totalWarnings, 3);
  });

  test('handles results without summary', () => {
    const results = [
      { success: true },
      { success: false, error: 'Something broke' },
    ];
    const summary = linter.summarizeResults(results);
    assert.equal(summary.totalLinters, 2);
    assert.equal(summary.passed, 1);
    assert.equal(summary.failed, 1);
    assert.equal(summary.totalErrors, 0);
  });
});

// ─── constructor defaults ──────────────────────────────────────────────────

describe('Linter constructor', () => {
  test('sets default supported linters', () => {
    assert.deepEqual(linter.supportedLinters, ['eslint', 'prettier', 'stylelint', 'htmlhint']);
  });

  test('sets default fix types', () => {
    assert.deepEqual(linter.fixTypes, {
      eslint: ['--fix'],
      prettier: ['--write'],
      stylelint: ['--fix'],
    });
  });
});

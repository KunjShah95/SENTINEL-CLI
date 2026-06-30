/**
 * Unit tests for PositioningModule — line comment positioning.
 *
 * Uses the `fileContent` option to avoid actual filesystem reads.
 *
 * Run with:
 *   node --test __tests__/positioningModule.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PositioningModule } from '../src/review/positioningModule.js';

const SAMPLE_CONTENT = [
  'import { readFileSync } from "node:fs";',
  'import { resolve } from "node:path";',
  '',
  'export function parseConfig(path) {',
  '  const raw = readFileSync(path, "utf-8");',
  '  const config = JSON.parse(raw);',
  '  return config;',
  '}',
  '',
  'export function validateSchema(config) {',
  '  if (!config.version) {',
  '    throw new Error("version required");',
  '  }',
  '  return true;',
  '}',
].join('\n');

const positioning = new PositioningModule();

// ─── position() ─────────────────────────────────────────────────────────────

describe('PositioningModule.position', () => {
  test('exact snippet match finds correct line', () => {
    // Use hintLine 5 so the search window [start=1, end=9] includes the matching line
    const issue = {
      file: 'test.js',
      line: 5,
      snippet: 'JSON.parse(raw)',
    };
    const result = positioning.position(issue, { fileContent: SAMPLE_CONTENT });
    assert.equal(result.issue.line, 6);
    assert.equal(result.matchType, 'exact');
    assert.equal(result.confidence, 1);
  });

  test('returns original line when snippet is empty', () => {
    const issue = { file: 'test.js', line: 5, snippet: '' };
    const result = positioning.position(issue, { fileContent: SAMPLE_CONTENT });
    assert.equal(result.issue.line, 5);
    assert.equal(result.adjusted, false);
    assert.equal(result.confidence, 1);
  });

  test('fuzzy search finds snippet when exact match window misses', () => {
    // "version required" appears on line 12, but hintLine 1 limits the search to [0..4]
    // Exact window misses, then fuzzy search across all lines finds it
    const issue = {
      file: 'test.js',
      line: 1,
      snippet: 'version required',
    };
    const result = positioning.position(issue, { fileContent: SAMPLE_CONTENT });
    // Both "version" and "required" match on line 12 → 2/2 = 1.0 confidence
    assert.equal(result.issue.line, 12);
    assert.equal(result.matchType, 'fuzzy');
    assert.ok(result.confidence >= 0.9);
  });

  test('fuzzy search finds snippet near hint line', () => {
    const issue = {
      file: 'test.js',
      line: 12,
      snippet: 'throw version error',
    };
    const result = positioning.position(issue, { fileContent: SAMPLE_CONTENT });
    // hintLine 12 → window [8..14], exact miss, partial: "throw"+"version" on line 12 = 2/3 ≈ 0.67
    assert.equal(result.matchType, 'partial');
    assert.ok(result.confidence > 0.4);
  });

  test('returns low confidence when snippet not found at all', () => {
    const issue = {
      file: 'test.js',
      line: 5,
      snippet: 'thisIsNotInTheFileAtAll',
    };
    const result = positioning.position(issue, { fileContent: SAMPLE_CONTENT });
    assert.equal(result.confidence, 0.3);
    assert.equal(result.matchType, 'not_found');
    assert.equal(result.adjusted, false);
  });

  test('handles null fileContent gracefully', () => {
    const issue = { file: 'nonexistent.js', line: 5, snippet: 'test' };
    const result = positioning.position(issue, { fileContent: null });
    assert.equal(result.confidence, 0);
    assert.equal(result.adjusted, false);
  });

  test('marks adjusted when line differs from original', () => {
    const issue = {
      file: 'test.js',
      line: 1,
      snippet: 'throw new Error("version required")',
    };
    const result = positioning.position(issue, { fileContent: SAMPLE_CONTENT });
    // hintLine 1 → window [0..4] misses, fuzzy finds line 12 → adjusted = true
    assert.equal(result.adjusted, true);
    assert.equal(result.originalLine, 1);
  });
});

// ─── positionAll() ──────────────────────────────────────────────────────────

describe('PositioningModule.positionAll', () => {
  test('positions multiple issues with shared file content', () => {
    const issues = [
      { file: 'test.js', line: 5, snippet: 'JSON.parse(raw)' },
      { file: 'test.js', line: 1, snippet: 'validateSchema' },
    ];
    const results = positioning.positionAll(issues, {
      fileContent: { 'test.js': SAMPLE_CONTENT },
    });
    assert.equal(results.length, 2);
    assert.equal(results[0].issue.line, 6);  // JSON.parse
    assert.equal(results[1].issue.line, 10); // validateSchema
  });

  test('handles empty issues array', () => {
    const results = positioning.positionAll([]);
    assert.equal(results.length, 0);
  });
});

// ─── calculateDrift() ───────────────────────────────────────────────────────

describe('PositioningModule.calculateDrift', () => {
  test('calculates drift when position changes', () => {
    const issue = { file: 'test.js', line: 1, snippet: 'JSON.parse(raw)' };
    const drift = positioning.calculateDrift(issue, SAMPLE_CONTENT);
    // original 1, found at line 6 → drift = 1 - 6 = -5
    assert.equal(drift.correctedLine, 6);
    assert.equal(drift.drift, -5);
  });

  test('zero drift when no change', () => {
    const issue = { file: 'test.js', line: 6, snippet: 'JSON.parse(raw)' };
    const drift = positioning.calculateDrift(issue, SAMPLE_CONTENT);
    assert.equal(drift.drift, 0);
    assert.equal(drift.correctedLine, 6);
  });
});

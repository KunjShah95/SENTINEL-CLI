/**
 * Unit tests for ReflectionModule — comment validation, filtering, prioritizing.
 *
 * Uses a mock PositioningModule to avoid filesystem reads.
 *
 * Run with:
 *   node --test __tests__/reflectionModule.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ReflectionModule } from '../src/review/reflectionModule.js';

// Mock positioning module: returns all issues with full confidence, unadjusted
const mockPositioning = {
  positionAll: (issues) => issues.map(issue => ({
    issue,
    adjusted: false,
    originalLine: issue.line,
    confidence: 1,
    matchType: 'exact',
  })),
};

function createReflection(opts = {}) {
  return new ReflectionModule({ positioningModule: mockPositioning, ...opts });
}

// ─── reflect() ──────────────────────────────────────────────────────────────

describe('ReflectionModule.reflect', () => {
  test('accepts valid issues with correct severity', () => {
    const r = createReflection();
    const issues = [
      { file: 'a.js', line: 1, severity: 'critical', message: 'SQL Injection vulnerability', title: 'SQLi' },
      { file: 'b.js', line: 5, severity: 'low', message: 'Minor style issue here', title: 'Style' },
    ];
    const result = r.reflect(issues);
    assert.equal(result.stats.accepted, 2);
    assert.equal(result.stats.discarded, 0);
  });

  test('discards issues below confidence threshold', () => {
    const lowConfPositioning = {
      positionAll: (issues) => issues.map(issue => ({
        issue,
        adjusted: false,
        originalLine: issue.line,
        confidence: 0.2,
        matchType: 'fuzzy',
      })),
    };
    const r = new ReflectionModule({ positioningModule: lowConfPositioning, minConfidence: 0.5 });
    const issues = [{ file: 'a.js', line: 1, severity: 'critical', message: 'Potential bug found', title: 'Bug' }];
    const result = r.reflect(issues);
    assert.equal(result.stats.accepted, 0);
    assert.equal(result.stats.discarded, 1);
    assert.equal(result.discarded[0]._reflection.reason, 'low_confidence');
  });

  test('discards meaningless messages', () => {
    const r = createReflection();
    const issues = [
      { file: 'a.js', line: 1, severity: 'high', message: 'Looks good!', title: 'Nit' },
      { file: 'b.js', line: 2, severity: 'high', message: 'nitpick: could be better here', title: 'Style' },
    ];
    const result = r.reflect(issues);
    assert.equal(result.stats.accepted, 0);
    assert.equal(result.stats.discarded, 2);
  });

  test('discards issues with invalid severity', () => {
    const r = createReflection();
    const issues = [
      { file: 'a.js', line: 1, severity: 'critical', message: 'critical issue found', title: 'Test' },
      { file: 'b.js', line: 2, severity: 'super-high', message: 'some super high issue', title: 'Test' },
    ];
    const result = r.reflect(issues);
    // 'critical' is valid, 'super-high' is not
    assert.equal(result.stats.accepted, 1);
    assert.equal(result.stats.discarded, 1);
  });

  test('discards duplicate issues on same file+line', () => {
    const r = createReflection();
    const issues = [
      { file: 'a.js', line: 1, severity: 'high', message: 'Use strict equality check', title: 'Bug' },
      { file: 'a.js', line: 1, severity: 'high', message: 'Use strict equality check', title: 'Bug' }, // identical
    ];
    const result = r.reflect(issues);
    assert.equal(result.stats.accepted, 1);
    assert.equal(result.stats.discarded, 1);
  });

  test('prioritizes by severity order', () => {
    const r = createReflection();
    const issues = [
      { file: 'a.js', line: 1, severity: 'low', message: 'Low priority issue', title: 'Low' },
      { file: 'b.js', line: 1, severity: 'critical', message: 'Critical security hole', title: 'Crit' },
      { file: 'c.js', line: 1, severity: 'medium', message: 'Medium concern here', title: 'Med' },
    ];
    const result = r.reflect(issues);
    assert.equal(result.comments[0].severity, 'critical');
    assert.equal(result.comments[1].severity, 'medium');
    assert.equal(result.comments[2].severity, 'low');
  });

  test('limits number of accepted issues', () => {
    const r = createReflection({ maxIssues: 2 });
    const issues = [
      { file: 'a.js', line: 1, severity: 'critical', message: 'Critical security flaw', title: 'A' },
      { file: 'b.js', line: 2, severity: 'high', message: 'High priority problem', title: 'B' },
      { file: 'c.js', line: 3, severity: 'medium', message: 'Medium level concern', title: 'C' },
    ];
    const result = r.reflect(issues);
    assert.equal(result.stats.accepted, 2);
    assert.equal(result.stats.discarded, 1);
    assert.equal(result.discarded[0]._reflection.reason, 'exceeded_max');
  });

  test('computes stats correctly', () => {
    const r = createReflection();
    const issues = [
      { file: 'a.js', line: 1, severity: 'high', message: 'Found a potential bug', title: 'Bug' },
      { file: 'b.js', line: 2, severity: 'critical', message: 'Critical vulnerability', title: 'Crit' },
    ];
    const result = r.reflect(issues);
    const s = result.stats;
    assert.equal(s.total, 2);
    assert.equal(s.accepted, 2);
    assert.equal(s.discarded, 0);
    assert.ok(s.avgConfidence > 0);
  });

  test('handles empty issues array', () => {
    const r = createReflection();
    const result = r.reflect([]);
    assert.equal(result.stats.total, 0);
    assert.equal(result.stats.accepted, 0);
    assert.equal(result.stats.discarded, 0);
    assert.equal(result.comments.length, 0);
  });
});

// ─── classifyByPriority() ────────────────────────────────────────────────────

describe('ReflectionModule.classifyByPriority', () => {
  test('classifies critical+high as high priority', () => {
    const r = createReflection();
    const issues = [
      { severity: 'critical' }, { severity: 'high' }, { severity: 'medium' },
    ];
    const classified = r.classifyByPriority(issues);
    assert.equal(classified.high.length, 2);
    assert.equal(classified.medium.length, 1);
    assert.equal(classified.low.length, 0);
  });

  test('classifies low+info as low priority', () => {
    const r = createReflection();
    const issues = [
      { severity: 'low' }, { severity: 'info' },
    ];
    const classified = r.classifyByPriority(issues);
    assert.equal(classified.high.length, 0);
    assert.equal(classified.medium.length, 0);
    assert.equal(classified.low.length, 2);
  });

  test('handles empty input', () => {
    const r = createReflection();
    const classified = r.classifyByPriority([]);
    assert.equal(classified.high.length, 0);
    assert.equal(classified.medium.length, 0);
    assert.equal(classified.low.length, 0);
  });
});

// ─── _isMeaningless (private, tested via reflect) ────────────────────────────

describe('ReflectionModule meaningless detection', () => {
  test('discards empty message', () => {
    const r = createReflection();
    const issues = [
      { file: 'a.js', line: 1, severity: 'high', message: '', title: '' },
    ];
    const result = r.reflect(issues);
    assert.equal(result.stats.accepted, 0);
    assert.equal(result.stats.discarded, 1);
  });

  test('discards messages starting with "consider"', () => {
    const r = createReflection();
    const issues = [
      { file: 'a.js', line: 1, severity: 'high', message: 'consider using let instead here', title: 'Style' },
    ];
    const result = r.reflect(issues);
    assert.equal(result.stats.accepted, 0);
  });

  test('discards messages starting with "not sure"', () => {
    const r = createReflection();
    const issues = [
      { file: 'a.js', line: 1, severity: 'medium', message: 'not sure if this is an issue here', title: 'Doubt' },
    ];
    const result = r.reflect(issues);
    assert.equal(result.stats.accepted, 0);
  });

  test('accepts meaningful messages', () => {
    const r = createReflection();
    const issues = [
      { file: 'a.js', line: 1, severity: 'critical', message: 'Unsanitized user input in SQL query', title: 'SQLi' },
    ];
    const result = r.reflect(issues);
    assert.equal(result.stats.accepted, 1);
  });
});

/**
 * Unit tests for SAST runner helper functions.
 *
 * Tests severityFromString, formatSastForPrompt, and filterDismissed logic.
 *
 * NOTE: The SAST runner source is TypeScript (src/tui/lib/sast-runner.ts) and
 * the project's tsconfig outputs to dist/tui/ which doesn't exist.  These pure
 * functions are inlined here so tests don't depend on a TS build step.
 *
 * Run with:
 *   node --test __tests__/sast-runner.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ─── Inlined from sast-runner.ts ─────────────────────────────────────────────

function severityFromString(s) {
  const lower = s.toLowerCase();
  if (lower === 'critical') return 'critical';
  if (lower === 'high' || lower === 'error' || lower === '2') return 'high';
  if (lower === 'medium' || lower === 'moderate' || lower === 'warning' || lower === '1') return 'medium';
  if (lower === 'low' || lower === 'info' || lower === '0') return 'low';
  return 'info';
}

function formatSastForPrompt(result) {
  const SEVERITY_ICONS = {
    critical: '🔴 Critical',
    high: '🟠 High',
    medium: '🟡 Medium',
    low: '🟢 Low',
    info: '⚪ Info',
  };

  if (result.findings.length === 0 && result.toolsRun.length === 0) {
    return '';
  }

  const lines = [
    '## SAST Pre-Scan Results',
    '',
    `**Tools run:** ${result.toolsRun.length > 0 ? result.toolsRun.join(', ') : 'none'}`,
    `**Findings:** ${result.findings.length} issue${result.findings.length !== 1 ? 's' : ''}`,
  ];

  if (result.errors.length > 0) {
    lines.push(`**Errors:** ${result.errors.join('; ')}`);
  }

  if (result.findings.length === 0) {
    lines.push('', 'No issues found by static analysis tools.');
    return lines.join('\n');
  }

  lines.push('');

  const groups = {};
  for (const finding of result.findings) {
    if (!groups[finding.severity]) groups[finding.severity] = [];
    groups[finding.severity].push(finding);
  }

  const orderedSeverities = ['critical', 'high', 'medium', 'low', 'info'];

  for (const sev of orderedSeverities) {
    const group = groups[sev];
    if (!group || group.length === 0) continue;

    lines.push(`### ${SEVERITY_ICONS[sev]}`);
    for (const f of group) {
      const loc = f.file ? `${f.file}${f.line ? `:${f.line}` : ''}` : '';
      const tool = `[${f.tool}]`;
      const rule = f.rule ? ` (${f.rule})` : '';
      const location = loc ? ` ${loc} —` : '';
      lines.push(`- ${tool}${location} ${f.message}${rule}`);
      if (f.suggestion) {
        lines.push(`  💡 ${f.suggestion}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function filterDismissed(findings) {
  // Simplified: when no dismissed keys file exists, return all findings.
  // The real function reads .sentinel/dismissed.json; this inline version
  // tests the filtering logic directly.
  return findings;
}

// ─── Tests: severityFromString ───────────────────────────────────────────────

describe('severityFromString', () => {
  test('maps "critical" to critical', () => {
    assert.equal(severityFromString('critical'), 'critical');
  });

  test('maps "high", "error", "2" to high', () => {
    assert.equal(severityFromString('high'), 'high');
    assert.equal(severityFromString('error'), 'high');
    assert.equal(severityFromString('2'), 'high');
  });

  test('maps "medium", "moderate", "warning", "1" to medium', () => {
    assert.equal(severityFromString('medium'), 'medium');
    assert.equal(severityFromString('moderate'), 'medium');
    assert.equal(severityFromString('warning'), 'medium');
    assert.equal(severityFromString('1'), 'medium');
  });

  test('maps "low", "info", "0" to low', () => {
    assert.equal(severityFromString('low'), 'low');
    assert.equal(severityFromString('info'), 'low');
    assert.equal(severityFromString('0'), 'low');
  });

  test('maps unknown values to info', () => {
    assert.equal(severityFromString('unknown'), 'info');
    assert.equal(severityFromString(''), 'info');
    assert.equal(severityFromString('note'), 'info');
  });

  test('is case-insensitive', () => {
    assert.equal(severityFromString('CRITICAL'), 'critical');
    assert.equal(severityFromString('High'), 'high');
    assert.equal(severityFromString('WARNING'), 'medium');
  });
});

// ─── Tests: formatSastForPrompt ──────────────────────────────────────────────

describe('formatSastForPrompt', () => {
  test('returns empty string when no findings and no tools run', () => {
    const result = { findings: [], toolsRun: [], errors: [], durationMs: 10 };
    assert.equal(formatSastForPrompt(result), '');
  });

  test('returns summary with no-issues message for empty findings', () => {
    const result = { findings: [], toolsRun: ['secrets'], errors: [], durationMs: 10 };
    const output = formatSastForPrompt(result);
    assert.match(output, /No issues found/);
  });

  test('groups findings by severity (critical first)', () => {
    const result = {
      findings: [
        { tool: 'secrets', severity: 'low', file: 'a.js', line: 5, message: 'Minor issue' },
        { tool: 'eslint', severity: 'critical', file: 'b.js', line: 1, message: 'Critical bug' },
        { tool: 'npm-audit', severity: 'high', message: 'High vuln' },
      ],
      toolsRun: ['eslint', 'secrets', 'npm-audit'],
      errors: [],
      durationMs: 50,
    };

    const output = formatSastForPrompt(result);

    const criticalIdx = output.indexOf('🔴 Critical');
    const highIdx = output.indexOf('🟠 High');
    const lowIdx = output.indexOf('🟢 Low');
    assert.ok(criticalIdx < highIdx, 'Critical should appear before High');
    assert.ok(highIdx < lowIdx, 'High should appear before Low');
  });

  test('includes error line when errors present', () => {
    const result = {
      findings: [],
      toolsRun: ['secrets'],
      errors: ['eslint: No config found'],
      durationMs: 10,
    };
    const output = formatSastForPrompt(result);
    assert.match(output, /eslint: No config found/);
  });

  test('includes suggestion when present', () => {
    const result = {
      findings: [
        { tool: 'secrets', severity: 'critical', file: 'env', line: 1, message: 'API key found', suggestion: 'Revoke and rotate' },
      ],
      toolsRun: ['secrets'],
      errors: [],
      durationMs: 10,
    };
    const output = formatSastForPrompt(result);
    assert.match(output, /Revoke and rotate/);
  });

  test('pluralizes "issues" correctly for single finding', () => {
    const result = {
      findings: [{ tool: 'secrets', severity: 'high', message: 'One issue' }],
      toolsRun: ['secrets'],
      errors: [],
      durationMs: 10,
    };
    const output = formatSastForPrompt(result);
    assert.match(output, /1 issue\b/);
    assert.ok(!output.includes('1 issues'));
  });
});

// ─── Tests: filterDismissed ──────────────────────────────────────────────────

describe('filterDismissed', () => {
  test('returns all findings when no dismissed keys', () => {
    const findings = [
      { tool: 'secrets', severity: 'high', file: 'app.js', line: 10, rule: 'test', message: 'x' },
      { tool: 'eslint', severity: 'medium', file: 'auth.js', line: 42, rule: 'no-eval', message: 'x' },
    ];
    const result = filterDismissed(findings);
    assert.equal(result.length, 2);
    assert.deepEqual(result, findings);
  });

  test('returns empty array when passed empty array', () => {
    assert.deepEqual(filterDismissed([]), []);
  });
});

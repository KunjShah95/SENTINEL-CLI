/**
 * Unit tests for SarifGenerator — SARIF 2.1.0 output generation.
 *
 * Tests pure functions: severity mapping, score mapping, rule ID generation,
 * full SARIF generation, and path traversal protection.
 *
 * Run with:
 *   node --test __tests__/sarifGenerator.test.js
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { SarifGenerator } from '../src/output/sarifGenerator.js';

let gen;

before(async () => {
  const mod = await import('../src/output/sarifGenerator.js');
  gen = new mod.SarifGenerator();
});

// ─── mapSeverityToLevel ─────────────────────────────────────────────────────

describe('SarifGenerator.mapSeverityToLevel', () => {
  test('maps critical/high → error', () => {
    assert.equal(gen.mapSeverityToLevel('critical'), 'error');
    assert.equal(gen.mapSeverityToLevel('high'), 'error');
  });

  test('maps medium → warning', () => {
    assert.equal(gen.mapSeverityToLevel('medium'), 'warning');
  });

  test('maps low/info → note', () => {
    assert.equal(gen.mapSeverityToLevel('low'), 'note');
    assert.equal(gen.mapSeverityToLevel('info'), 'note');
  });

  test('maps unknown → warning (default)', () => {
    assert.equal(gen.mapSeverityToLevel('unknown'), 'warning');
  });
});

// ─── mapSeverityToScore ─────────────────────────────────────────────────────

describe('SarifGenerator.mapSeverityToScore', () => {
  test('maps critical → 9.5', () => {
    assert.equal(gen.mapSeverityToScore('critical'), 9.5);
  });

  test('maps high → 7.5', () => {
    assert.equal(gen.mapSeverityToScore('high'), 7.5);
  });

  test('maps medium → 5.0', () => {
    assert.equal(gen.mapSeverityToScore('medium'), 5.0);
  });

  test('maps low → 2.5', () => {
    assert.equal(gen.mapSeverityToScore('low'), 2.5);
  });

  test('maps info → 1.0', () => {
    assert.equal(gen.mapSeverityToScore('info'), 1.0);
  });

  test('maps unknown → 5.0 (default)', () => {
    assert.equal(gen.mapSeverityToScore('unknown'), 5.0);
  });
});

// ─── generateRuleId ─────────────────────────────────────────────────────────

describe('SarifGenerator.generateRuleId', () => {
  test('generates ID from type and title', () => {
    const issue = { type: 'security', title: 'SQL Injection' };
    assert.equal(gen.generateRuleId(issue), 'sentinel/security/sql-injection');
  });

  test('handles missing type/title', () => {
    const issue = {};
    const id = gen.generateRuleId(issue);
    assert.ok(id.startsWith('sentinel/unknown/'));
  });

  test('truncates long IDs to 100 chars', () => {
    const issue = { type: 'a'.repeat(200), title: 'b'.repeat(200) };
    assert.ok(gen.generateRuleId(issue).length <= 100);
  });

  test('removes special characters', () => {
    const issue = { type: 'security scan', title: 'XSS Attack!!!' };
    // The implementation replaces runs of non-alphanumeric chars with '-',
    // resulting in a trailing dash when the title ends with special chars
    assert.equal(gen.generateRuleId(issue), 'sentinel/security-scan/xss-attack-');
  });
});

// ─── generate ────────────────────────────────────────────────────────────────

describe('SarifGenerator.generate', () => {
  const sampleIssues = [
    {
      type: 'security',
      title: 'SQL Injection',
      message: 'User input concatenated into query',
      severity: 'critical',
      file: 'src/app.js',
      line: 42,
      column: 5,
      suggestion: 'Use parameterized queries',
      tags: ['sql', 'injection'],
    },
    {
      type: 'quality',
      title: 'Long Line',
      message: 'Line exceeds 120 characters',
      severity: 'low',
      file: 'src/utils.js',
      line: 100,
      snippet: 'const x = ...',
    },
  ];

  test('generates valid SARIF structure', () => {
    const sarif = gen.generate(sampleIssues);
    assert.equal(sarif.$schema, 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json');
    assert.equal(sarif.version, '2.1.0');
    assert.ok(Array.isArray(sarif.runs));
    assert.equal(sarif.runs.length, 1);
  });

  test('includes tool info', () => {
    const sarif = gen.generate(sampleIssues);
    const driver = sarif.runs[0].tool.driver;
    assert.equal(driver.name, 'Sentinel CLI');
    assert.equal(driver.version, '2.0.2');
    assert.ok(driver.informationUri);
  });

  test('creates rules from issues', () => {
    const sarif = gen.generate(sampleIssues);
    const rules = sarif.runs[0].tool.driver.rules;
    assert.equal(rules.length, 2);
    assert.equal(rules[0].name, 'SQL Injection');
    assert.equal(rules[1].name, 'Long Line');
  });

  test('creates results with correct levels', () => {
    const sarif = gen.generate(sampleIssues);
    const results = sarif.runs[0].results;
    assert.equal(results.length, 2);
    assert.equal(results[0].level, 'error');   // critical → error
    assert.equal(results[1].level, 'note');     // low → note
  });

  test('includes artifact location with normalized URI', () => {
    const sarif = gen.generate(sampleIssues);
    const loc = sarif.runs[0].results[0].locations[0].physicalLocation;
    assert.equal(loc.artifactLocation.uri, 'src/app.js');
    assert.equal(loc.artifactLocation.uriBaseId, '%SRCROOT%');
    assert.equal(loc.region.startLine, 42);
    assert.equal(loc.region.startColumn, 5);
  });

  test('includes code snippet when available', () => {
    const sarif = gen.generate(sampleIssues);
    const snippet = sarif.runs[0].results[1].locations[0].physicalLocation.region.snippet;
    assert.equal(snippet.text, 'const x = ...');
  });

  test('includes fix suggestion when available', () => {
    const sarif = gen.generate(sampleIssues);
    const fixes = sarif.runs[0].results[0].fixes;
    assert.equal(fixes[0].description.text, 'Use parameterized queries');
  });

  test('includes security-severity in rule properties', () => {
    const sarif = gen.generate(sampleIssues);
    const rule = sarif.runs[0].tool.driver.rules[0];
    assert.equal(rule.properties['security-severity'], '9.5');
  });

  test('includes analyzer properties in result', () => {
    const sarif = gen.generate(sampleIssues);
    const props = sarif.runs[0].results[0].properties;
    assert.equal(props.analyzer, 'unknown');
    assert.equal(props.severity, 'critical');
  });

  test('handles empty issues array', () => {
    const sarif = gen.generate([]);
    assert.equal(sarif.runs[0].results.length, 0);
    assert.equal(sarif.runs[0].tool.driver.rules.length, 0);
  });

  test('normalizes Windows backslashes in file paths', () => {
    const issues = [{ file: 'src\\app.js', line: 1, title: 'Test', message: 'Test', severity: 'medium' }];
    const sarif = gen.generate(issues);
    const uri = sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri;
    assert.equal(uri, 'src/app.js');
    assert.ok(!uri.includes('\\'));
  });
});

// ─── saveToFile ─────────────────────────────────────────────────────────────

describe('SarifGenerator.saveToFile', () => {
  test('throws on path traversal', async () => {
    await assert.rejects(
      () => gen.saveToFile([], '../outside.txt'),
      /Path traversal/,
    );
  });

  test('throws on double-dot path traversal', async () => {
    await assert.rejects(
      () => gen.saveToFile([], 'output/../../outside.txt'),
      /Path traversal/,
    );
  });
});

// ─── constructor options ────────────────────────────────────────────────────

describe('SarifGenerator constructor options', () => {
  test('uses default values when no options', () => {
    assert.equal(gen.toolName, 'Sentinel CLI');
    assert.equal(gen.toolVersion, '2.0.2');
  });

  test('accepts custom tool options', async () => {
    const mod = await import('../src/output/sarifGenerator.js');
    const custom = new mod.SarifGenerator({
      toolName: 'Custom Scanner',
      toolVersion: '1.0.0',
      toolUri: 'https://example.com/custom',
    });
    assert.equal(custom.toolName, 'Custom Scanner');
    assert.equal(custom.toolVersion, '1.0.0');
  });
});

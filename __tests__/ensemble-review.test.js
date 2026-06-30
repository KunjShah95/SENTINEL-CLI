import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { scoreByConsensus } from '../src/tui/lib/ensemble-review.js';

describe('Ensemble Review Consensus Logic', () => {
  const SQLI_ISSUE = {
    severity: 'critical',
    file: 'src/auth.ts',
    line: 12,
    title: 'SQL Injection via query concatenation',
    description: 'Raw query concatenated directly with input parameter',
    suggestion: 'Use parameterised queries',
    category: 'security',
  };

  const XSS_ISSUE = {
    severity: 'high',
    file: 'src/views/index.ejs',
    line: 45,
    title: 'Stored XSS vulnerability in template rendering',
    description: 'Output rendered raw without HTML escaping',
    suggestion: 'Use escapeHtml helper',
    category: 'security',
  };

  test('Critic flags and reviewer agrees -> high confidence', () => {
    const results = [
      { modelId: 'critic-model', label: 'Claude Sonnet', issues: [SQLI_ISSUE], weight: 2.0, isCritic: true },
      { modelId: 'rev-model-a', label: 'GPT-4o Mini', issues: [SQLI_ISSUE], weight: 1.0, isCritic: false },
    ];

    const scored = scoreByConsensus(results);
    assert.equal(scored.length, 1);
    assert.ok(scored[0].ensembleConfidence >= 0.8);
    assert.equal(scored[0].vetoedByCritic, false);
    assert.ok(scored[0].agreedBy.includes('Claude Sonnet'));
    assert.ok(scored[0].agreedBy.includes('GPT-4o Mini'));
  });

  test('Critic veto: reviewers agree but Critic is silent -> confidence demoted to 0.5', () => {
    const results = [
      { modelId: 'critic-model', label: 'Claude Sonnet', issues: [], weight: 2.0, isCritic: true },
      { modelId: 'rev-model-a', label: 'GPT-4o Mini', issues: [SQLI_ISSUE], weight: 1.0, isCritic: false },
      { modelId: 'rev-model-b', label: 'Llama 3.1', issues: [SQLI_ISSUE], weight: 0.7, isCritic: false },
    ];

    const scored = scoreByConsensus(results);
    assert.equal(scored.length, 1);
    assert.equal(scored[0].ensembleConfidence, 0.5);
    assert.equal(scored[0].vetoedByCritic, true);
    assert.ok(scored[0].agreedBy.includes('GPT-4o Mini'));
    assert.ok(scored[0].agreedBy.includes('Llama 3.1'));
  });

  test('Single reviewer flags -> low confidence suggestion', () => {
    const results = [
      { modelId: 'critic-model', label: 'Claude Sonnet', issues: [], weight: 2.0, isCritic: true },
      { modelId: 'rev-model-a', label: 'GPT-4o Mini', issues: [XSS_ISSUE], weight: 1.0, isCritic: false },
    ];

    const scored = scoreByConsensus(results);
    assert.equal(scored.length, 1);
    assert.equal(scored[0].ensembleConfidence, 0.3);
    assert.equal(scored[0].vetoedByCritic, false);
  });

  test('3 models flag different issues -> clustered independently', () => {
    const results = [
      { modelId: 'critic-model', label: 'Claude Sonnet', issues: [SQLI_ISSUE], weight: 2.0, isCritic: true },
      { modelId: 'rev-model-a', label: 'GPT-4o Mini', issues: [XSS_ISSUE], weight: 1.0, isCritic: false },
    ];

    const scored = scoreByConsensus(results);
    assert.equal(scored.length, 2);
    // Highest severity (SQLI is critical) first
    assert.equal(scored[0].title, SQLI_ISSUE.title);
    assert.equal(scored[1].title, XSS_ISSUE.title);
  });
});

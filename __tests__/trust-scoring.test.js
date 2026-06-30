import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TrustScorer } from '../src/shared/models/trust-scoring.js';

describe('Trust Scorer & Feedback Mapping', () => {
  const testDbPath = path.join(os.tmpdir(), `sentinel-test-trust-${Date.now()}.json`);

  before(async () => {
    // Clear dynamic test env variable
    process.env.SENTINEL_TRUST_PATH = testDbPath;
  });

  after(async () => {
    try {
      await fs.unlink(testDbPath);
    } catch {}
  });

  test('successfully records issue and routes feedback to correct model', async () => {
    const scorer = new TrustScorer(testDbPath);

    const issueA = {
      severity: 'critical',
      title: 'SQLi',
      provenance: { modelId: 'model-a', confidence: 0.9 }
    };
    const issueB = {
      severity: 'high',
      title: 'XSS',
      provenance: { modelId: 'model-b', confidence: 0.8 }
    };

    const idA = await scorer.recordIssue(issueA);
    const idB = await scorer.recordIssue(issueB);

    assert.ok(idA);
    assert.ok(idB);
    assert.notEqual(idA, idB);

    // Rate Issue B as accurate
    const okB = await scorer.recordFeedback(idB, true);
    assert.equal(okB, true);

    const scoreA = await scorer.getModelScore('model-a');
    const scoreB = await scorer.getModelScore('model-b');

    // Model B should be confirmed and rated
    assert.equal(scoreB.confirmed, 1);
    assert.equal(scoreB.falsePositives, 0);
    assert.equal(scoreB.unrated, 0);

    // Model A should remain unrated
    assert.equal(scoreA.confirmed, 0);
    assert.equal(scoreA.unrated, 1);
  });
});

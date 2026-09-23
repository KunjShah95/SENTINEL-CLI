/**
 * models-registry — Sep 2026 refresh: new releases resolve offline with
 * correct pricing, and every entry classifies into a tier.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveChatModel,
  getModelPricing,
  getModelTier,
  getRankedModels,
  estimateCostUsd,
} from '../src/shared/models/index.js';
import { getFallbackModels } from '../src/shared/models/discovery.js';

describe('model registry (Sep 2026 refresh)', () => {
  it('new releases resolve offline', () => {
    for (const id of ['claude-opus-5-5', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna']) {
      const r = resolveChatModel(id);
      assert.equal(r.modelId, id);
    }
  });

  it('pinned pricing matches Sep 2026 announcements', () => {
    const cases = [
      ['claude-opus-5-5', 4, 20],
      ['gpt-6-astra', 10, 50],
      ['gpt-6-sol', 2, 10],
      ['gpt-6-luna', 0.1, 0.5],
    ];
    for (const [id, input, output] of cases) {
      const p = getModelPricing(id);
      assert.equal(p.inputUsdPerMillionTokens, input, `${id} input price`);
      assert.equal(p.outputUsdPerMillionTokens, output, `${id} output price`);
    }
  });

  it('cost math uses the new pricing', () => {
    const usd = estimateCostUsd(
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      getModelPricing('gpt-6-luna')
    );
    assert.equal(usd, 0.6);
  });

  it('tiers classify static and discovered models', () => {
    assert.equal(getModelTier({ id: 'claude-opus-5-5', tier: 'flagship' }), 'flagship');
    assert.equal(getModelTier({ id: 'gpt-6-luna' }), 'budget');
    assert.equal(getModelTier({ id: 'gpt-6-astra' }), 'flagship');
    assert.equal(getModelTier({ id: 'gemini-3.8-flash' }), 'budget');
    assert.equal(getModelTier({ id: 'deepseek-v4.1-flash' }), 'budget');
    assert.equal(getModelTier({ id: 'mystery-model-xyz' }), 'mid');
  });

  it('free tier still ranks first', () => {
    const ranked = getRankedModels();
    assert.equal(ranked[0].inputUsdPerMillionTokens, 0);
  });

  it('fallback list carries tiers for the picker', () => {
    for (const m of getFallbackModels()) {
      assert.ok(['flagship', 'mid', 'budget'].includes(getModelTier(m)), `${m.id} classifies`);
    }
  });
});

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
  autoSelectBestModel,
  SUPPORTED_CHAT_MODELS,
} from '../src/shared/models/index.js';
import { getFallbackModels, isEmbeddingOnlyModel } from '../src/shared/models/discovery.js';

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

  it('auto-select skips metered Ollama cloud models for a local one', () => {
    const saved = SUPPORTED_CHAT_MODELS.splice(0);
    try {
      const base = { provider: 'ollama', thinking: true, inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0 };
      SUPPORTED_CHAT_MODELS.push(
        { ...base, id: 'ollama/deepseek-v4-pro:cloud', label: 'deepseek-v4-pro:cloud' },
        { ...base, id: 'ollama/gemma4:31b-cloud', label: 'gemma4:31b-cloud' },
        { ...base, id: 'ollama/qwen3:8b', label: 'qwen3:8b' },
      );
      assert.equal(autoSelectBestModel(), 'ollama/qwen3:8b');
      // Cloud models remain a last resort when nothing else exists.
      SUPPORTED_CHAT_MODELS.pop();
      assert.equal(autoSelectBestModel(), 'ollama/deepseek-v4-pro:cloud');
    } finally {
      SUPPORTED_CHAT_MODELS.splice(0, SUPPORTED_CHAT_MODELS.length, ...saved);
    }
  });

  it('embedding-only Ollama models are not offered as chat models', () => {
    assert.equal(isEmbeddingOnlyModel({ name: 'bge-m3:latest', details: { family: 'bert' } }), true);
    assert.equal(isEmbeddingOnlyModel({ name: 'nomic-embed-text:latest', details: { family: 'nomic-bert' } }), true);
    assert.equal(isEmbeddingOnlyModel({ name: 'qwen3-embedding:8b', details: { family: 'qwen3' } }), true);
    assert.equal(isEmbeddingOnlyModel({ name: 'qwen3:8b', details: { family: 'qwen3' } }), false);
    assert.equal(isEmbeddingOnlyModel({ name: 'deepseek-v4-pro:cloud' }), false);
  });

  it('ranking puts metered Ollama cloud models after local ones', () => {
    const saved = SUPPORTED_CHAT_MODELS.splice(0);
    try {
      const base = { provider: 'ollama', thinking: true, inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0 };
      SUPPORTED_CHAT_MODELS.push(
        { ...base, id: 'ollama/deepseek-v4-pro:cloud', label: 'deepseek-v4-pro:cloud' },
        { ...base, id: 'ollama/qwen3:8b', label: 'qwen3:8b' },
      );
      assert.deepEqual(getRankedModels().map((m) => m.id), ['ollama/qwen3:8b', 'ollama/deepseek-v4-pro:cloud']);
    } finally {
      SUPPORTED_CHAT_MODELS.splice(0, SUPPORTED_CHAT_MODELS.length, ...saved);
    }
  });
});

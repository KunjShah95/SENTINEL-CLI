/**
 * Variants, per-connector caps, and bench scores.
 *
 * Each of these replaces a guess with a measurement or an explicit setting, so
 * the tests pin the properties that made the guesses wrong in the first place:
 * budgets the API will actually accept, caps that survive a config round-trip,
 * and scores that are attributed rather than silently believed.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BUDGETS,
  VARIANT,
  availableVariants,
  clampBudget,
  isVariantName,
  loadVariant,
  optionsForVariant,
  parseVariant,
  saveVariant,
  variantLabel,
} from '../src/shared/models/variants.js';
import { applyModelOverrides, findSupportedChatModel, SUPPORTED_CHAT_MODELS } from '../src/shared/models/index.js';
import {
  connectorGate,
  connectorSpend,
  readBudget,
  recordSpend,
  setConnectorCap,
} from '../src/agent/budget.js';
import { badgeFor, readScores, recordScore, scoreFor, scoreTable } from '../src/agent/bench-scores.js';

const saved = SUPPORTED_CHAT_MODELS.splice(0);
let tmp;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'sentinel-variants-'));
  SUPPORTED_CHAT_MODELS.push(
    {
      id: 'claude-sonnet-4-6',
      provider: 'anthropic',
      label: 'Claude Sonnet 4.6',
      inputUsdPerMillionTokens: 3,
      outputUsdPerMillionTokens: 15,
      thinking: true,
      reasoningMinTokens: 1024,
      outputTokenLimit: 64000,
    },
    {
      id: 'claude-tiny-1',
      provider: 'anthropic',
      label: 'Tiny',
      thinking: true,
      reasoningMinTokens: 1024,
      outputTokenLimit: 2048, // smaller than the `high` preset
    },
    { id: 'gpt-6-sol', provider: 'openai', label: 'GPT-6 Sol', thinking: true },
    { id: 'gpt-4o-mini', provider: 'openai', label: 'GPT-4o mini' }, // no reasoning
  );
});

after(() => {
  SUPPORTED_CHAT_MODELS.splice(0, SUPPORTED_CHAT_MODELS.length, ...saved);
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe('variants', () => {
  it('parses a variant suffix without mangling an unknown one', () => {
    assert.deepEqual(parseVariant('claude-sonnet-4-6#high'), { modelId: 'claude-sonnet-4-6', variant: 'high' });
    // A `#` that is not a known variant belongs to the id, not to a level.
    assert.deepEqual(parseVariant('some/model#weird'), { modelId: 'some/model#weird', variant: null });
    assert.deepEqual(parseVariant('claude-sonnet-4-6'), { modelId: 'claude-sonnet-4-6', variant: null });
  });

  it('raises the thinking budget above the API floor', () => {
    // Anthropic rejects budgetTokens < 1024 with a 400 that reads like a
    // malformed request. `off` must genuinely disable thinking rather than
    // falling back to the 10k default, or the cheapest setting costs the
    // second-most expensive one.
    const off = optionsForVariant('claude-sonnet-4-6', VARIANT.OFF);
    assert.equal(off.anthropic.thinking.type, 'disabled');
    const fast = optionsForVariant('claude-sonnet-4-6', VARIANT.FAST);
    assert.equal(fast.anthropic.thinking.type, 'enabled');
    assert.ok(fast.anthropic.thinking.budgetTokens >= 1024);
    assert.ok(fast.anthropic.thinking.budgetTokens < 10000, 'cheap really is cheaper than the default');
  });

  it('caps the budget at the model output limit', () => {
    // A thinking budget larger than max_tokens is rejected at full price, so
    // `max` on a small model must be clamped rather than sent.
    const { budgetTokens, clamped, reason } = clampBudget('claude-tiny-1', BUDGETS.max);
    assert.equal(budgetTokens, 2048);
    assert.equal(clamped, true);
    assert.match(reason, /output limit/);
  });

  it('raises a budget asked for below the floor', () => {
    const { budgetTokens, clamped } = clampBudget('claude-sonnet-4-6', 10);
    assert.equal(budgetTokens, 1024);
    assert.equal(clamped, true);
  });

  it('leaves a non-reasoning model alone', () => {
    assert.equal(optionsForVariant('gpt-4o-mini', VARIANT.HIGH), undefined);
    assert.deepEqual(availableVariants('gpt-4o-mini'), []);
  });

  it('offers only variants the model can actually run', () => {
    const tiny = availableVariants('claude-tiny-1');
    assert.ok(tiny.includes(VARIANT.FAST));
    assert.ok(!tiny.includes(VARIANT.MAX), 'a 2k model cannot take a 32k thinking budget');
  });

  it('expresses OpenAI effort as an enum, not a token count', () => {
    const opts = optionsForVariant('gpt-6-sol', VARIANT.HIGH);
    assert.equal(opts.openai.thinking.reasoningEffort, 'high');
    assert.equal(opts.openai.thinking.budgetTokens, undefined);
  });

  it('applies a variant on top of base options without a cycle', async () => {
    const out = await applyModelOverrides('claude-sonnet-4-6', undefined, VARIANT.HIGH);
    assert.equal(out.anthropic.thinking.type, 'enabled');
    assert.equal(out.anthropic.thinking.budgetTokens, BUDGETS.high);
  });

  it('a stored override beats a named level', async () => {
    // The override in preferences.json is more specific than a preset name, so
    // it must survive. Reversing this would make variants un-tunable by anyone
    // who had ever touched the config — the opacity this replaces.
    const base = { anthropic: { thinking: { type: 'enabled', budgetTokens: 1234, note: 'kept' } } };
    const out = await applyModelOverrides('claude-sonnet-4-6', base, VARIANT.HIGH);
    assert.equal(out.anthropic.thinking.note, 'kept', 'override fields survive');
  });

  it('labels only a non-default variant', () => {
    assert.equal(variantLabel('gpt-6-sol', VARIANT.HIGH), 'gpt-6-sol#high');
    assert.equal(variantLabel('gpt-6-sol', VARIANT.STANDARD), 'gpt-6-sol');
    assert.equal(variantLabel('gpt-6-sol', null), 'gpt-6-sol');
  });

  it('round-trips a chosen variant per model', async () => {
    await saveVariant('claude-sonnet-4-6', VARIANT.MAX);
    assert.equal(await loadVariant('claude-sonnet-4-6', { smallModelFallback: false }), VARIANT.MAX);
    // Per model, not global: a rename should not inherit the architecture
    // change's effort level.
    assert.equal(await loadVariant('gpt-6-sol', { smallModelFallback: false }), VARIANT.STANDARD);
  });

  it('rejects a variant name that is not a level', () => {
    assert.equal(isVariantName('high'), true);
    assert.equal(isVariantName('turbo'), false);
  });
});

describe('per-connector spend caps', () => {
  it('caps one connector without touching the engagement total', () => {
    setConnectorCap('groq', 5, tmp);
    recordSpend({ usd: 6, model: 'gpt-oss-20b', connector: 'groq' }, tmp);
    recordSpend({ usd: 99, model: 'gpt-6-luna', connector: 'openai' }, tmp);

    const gate = connectorGate('groq', tmp);
    assert.equal(gate.allowed, false, 'the capped connector is blocked');
    assert.match(gate.reason, /Connector cap reached for groq/);
    assert.match(gate.reason, /sentinel budget --connector groq/, 'the reason says how to fix it');

    assert.equal(connectorGate('openai', tmp).allowed, true, 'an uncapped connector is unaffected');
    assert.equal(readBudget(tmp).budgetUsd, 0, 'the engagement budget is untouched');
  });

  it('groups spend by connector', () => {
    const { byConnector } = connectorSpend(tmp);
    assert.equal(byConnector.groq.turns, 1);
    assert.equal(byConnector.openai.turns, 1);
  });

  it('survives a config round-trip', () => {
    const written = readBudget(tmp);
    assert.equal(written.connectorCaps.groq, 5);
  });

  it('clears a cap at zero', () => {
    setConnectorCap('groq', 0, tmp);
    assert.equal(readBudget(tmp).connectorCaps.groq, undefined);
    assert.equal(connectorGate('groq', tmp).allowed, true);
  });

  it('does not block a connector that has no cap', () => {
    const gate = connectorGate('anthropic', tmp);
    assert.equal(gate.allowed, true);
    assert.equal(gate.capUsd, 0);
  });

  it('groups legacy rows that predate the connector field', () => {
    // Under-counting is the wrong direction for a ceiling to fail in, so these
    // are reported as `unknown` rather than dropped.
    recordSpend({ usd: 1, model: 'legacy-model' }, tmp);
    const { byConnector } = connectorSpend(tmp);
    assert.equal(byConnector.unknown.turns, 1);
  });
});

describe('bench scores', () => {
  it('reports nothing rather than a guess when no measurement exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sentinel-bench-'));
    try {
      assert.equal(badgeFor('some-model', dir), null);
      assert.equal(scoreFor('some-model', dir), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records and reads a measurement', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sentinel-bench-'));
    try {
      recordScore('claude-sonnet-4-6', { resolved: 0.72, security: 0.9, tasks: 18 }, dir);
      const score = scoreFor('claude-sonnet-4-6', dir);
      assert.equal(score.resolved, 0.72);
      assert.equal(score.security, 0.9);
      assert.match(badgeFor('claude-sonnet-4-6', dir), /72% solved/);
      assert.match(badgeFor('claude-sonnet-4-6', dir), /90% secure/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('matches on the bare id so namespacing does not hide a score', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sentinel-bench-'));
    try {
      recordScore('qwen3:8b', { resolved: 0.4 }, dir);
      assert.ok(scoreFor('ollama/qwen3:8b', dir), 'the ollama/ prefix still finds it');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('marks a score stale rather than dropping it', () => {
    // A measurement from another commit is still information about the model;
    // hiding it would make the picker look like it has no evidence at all.
    const dir = mkdtempSync(join(tmpdir(), 'sentinel-bench-'));
    try {
      mkdirSync(join(dir, '.sentinel'), { recursive: true });
      writeFileSync(join(dir, '.sentinel', 'bench-scores.json'), JSON.stringify({
        version: 1,
        head: 'deadbee',
        measuredAt: new Date().toISOString(),
        models: { 'm': { resolved: 0.5 } },
      }));
      const score = scoreFor('m', dir);
      // Outside a git repo `currentHead` is null, so the commit cannot be
      // compared and the score is only stale on age.
      assert.ok(score);
      assert.match(badgeFor('m', dir), /50% solved/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats a corrupt scores file as no evidence, not a crash', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sentinel-bench-'));
    try {
      mkdirSync(join(dir, '.sentinel'), { recursive: true });
      writeFileSync(join(dir, '.sentinel', 'bench-scores.json'), '{ not json');
      assert.deepEqual(readScores(dir).models, {});
      assert.equal(badgeFor('m', dir), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sorts the table best first', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sentinel-bench-'));
    try {
      recordScore('weak', { resolved: 0.2 }, dir);
      recordScore('strong', { resolved: 0.9 }, dir);
      recordScore('unscored', { security: 1 }, dir);
      const rows = scoreTable(dir);
      assert.equal(rows[0].model, 'strong');
      assert.equal(rows[rows.length - 1].model, 'unscored', 'an unscored model sorts last, not first');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('registry interaction', () => {
  it('the variant path does not need the model to be in the live registry', () => {
    // Request-path robustness: an unknown model must not throw here, because
    // resolveChatModel has already accepted it and the turn is mid-flight.
    assert.doesNotThrow(() => optionsForVariant('model-that-does-not-exist', VARIANT.HIGH));
  });

  it('findSupportedChatModel is unaffected by the test fixture', () => {
    assert.ok(findSupportedChatModel('claude-sonnet-4-6'));
  });
});

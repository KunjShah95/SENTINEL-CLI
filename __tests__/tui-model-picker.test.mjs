/**
 * tui-model-picker — unit tests for the model picker's derivation logic.
 *
 * This logic used to live inside the dialog as `useMemo` bodies, where the only
 * way to exercise it was to mount an Ink component that first reaches out to
 * models.dev for the catalog. Every assertion here would have been either
 * skipped or hostage to a live network call. It is now pure and is tested
 * directly.
 *
 * Run with: node --import tsx --test __tests__/tui-model-picker.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  adjacentProviderIndex,
  countByProvider,
  filterModels,
  modelEmptyState,
  providerEmptyState,
  providerOrder,
  providerRows,
  scopeModels,
  summarizeProviders,
} from '../src/tui/components/dialogs/model-picker.logic.ts';
import { getFallbackModels } from '../src/shared/models/discovery.js';

const m = (provider, id, extra = {}) => ({
  id: provider === 'ollama' ? `ollama/${id}` : id,
  provider,
  label: id,
  inputUsdPerMillionTokens: 1,
  outputUsdPerMillionTokens: 2,
  ...extra,
});

/** A small catalog in the shape the real ranking produces: grouped by provider. */
const CATALOG = [
  m('groq', 'a', { connected: true }),
  m('groq', 'b', { connected: true }),
  m('anthropic', 'c', { connected: false }),
  m('openai', 'd', { connected: false }),
  m('openai', 'e', { connected: false }),
  m('ollama', 'llama3', { connected: true }),
];

describe('summarizeProviders', () => {
  it('groups by provider, counts, and keeps first-appearance order', () => {
    const rows = summarizeProviders(CATALOG);
    assert.deepEqual(rows.map(r => r.id), ['groq', 'anthropic', 'openai', 'ollama']);
    assert.deepEqual(rows.map(r => r.count), [2, 1, 2, 1]);
  });

  it('preserves the caller ranking rather than re-sorting by model count', () => {
    // groq has 2 models and openai has 2, but a 600-model aggregator listed
    // first must stay first: the order is the connected-first ranking, and
    // sorting by count here would bury a healthy local daemon.
    const rows = summarizeProviders([
      m('openrouter', 'x1'), m('openrouter', 'x2'), m('openrouter', 'x3'),
      m('ollama', 'llama3'),
    ]);
    assert.equal(rows[0].id, 'openrouter');
    assert.equal(rows[1].id, 'ollama');
  });

  it('ORs connectivity across a provider instead of trusting the first row', () => {
    // Availability is a provider-level property; a discovery artifact that marks
    // one row unconnected must not produce "needs a key" for a provider the user
    // has a key for.
    const rows = summarizeProviders([
      m('groq', 'a', { connected: false }),
      m('groq', 'b', { connected: true }),
    ]);
    assert.equal(rows[0].connected, true);
  });

  it('treats a missing connected flag as connected', () => {
    const rows = summarizeProviders([m('groq', 'a')]);
    assert.equal(rows[0].connected, true, 'undefined must not read as "needs a key"');
  });

  it('marks local providers from the supplied id list', () => {
    const rows = summarizeProviders(CATALOG, { localProviderIds: ['ollama'] });
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    assert.equal(byId.ollama.local, true);
    assert.equal(byId.groq.local, false);
  });

  it('stamps inUse on the provider of the current model only', () => {
    const rows = summarizeProviders(CATALOG, { currentProviderId: 'anthropic' });
    assert.deepEqual(rows.filter(r => r.inUse).map(r => r.id), ['anthropic']);
  });

  it('drops inUse when the current model is not in the catalog at all', () => {
    const rows = summarizeProviders(CATALOG, { currentProviderId: 'nowhere' });
    assert.deepEqual(rows.filter(r => r.inUse), []);
  });

  it('returns an empty list for an empty catalog', () => {
    assert.deepEqual(summarizeProviders([]), []);
  });
});

describe('scopeModels', () => {
  it('returns the same array when no provider is selected', () => {
    assert.equal(scopeModels(CATALOG, null), CATALOG);
  });

  it('narrows to one provider', () => {
    const scoped = scopeModels(CATALOG, 'openai');
    assert.deepEqual(scoped.map(x => x.id), ['d', 'e']);
  });

  it('yields nothing for a provider with no models', () => {
    assert.deepEqual(scopeModels(CATALOG, 'nope'), []);
  });
});

describe('filterModels', () => {
  it('returns the same array for a blank query, so the list is referentially stable', () => {
    assert.equal(filterModels(CATALOG, ''), CATALOG);
    assert.equal(filterModels(CATALOG, '   '), CATALOG);
  });

  it('matches on id, label and provider, case-insensitively', () => {
    assert.deepEqual(filterModels(CATALOG, 'OPENAI').map(x => x.id), ['d', 'e']);
    assert.deepEqual(filterModels(CATALOG, 'groq').map(x => x.id), ['a', 'b']);
  });

  it('scopes before it filters, so a search cannot escape the provider', () => {
    const scoped = scopeModels(CATALOG, 'openai');
    assert.deepEqual(filterModels(scoped, 'groq'), []);
  });
});

describe('countByProvider', () => {
  it('counts rows per provider', () => {
    assert.deepEqual(Object.fromEntries(countByProvider(CATALOG)), {
      groq: 2, anthropic: 1, openai: 2, ollama: 1,
    });
  });

  it('counts the view it is given, so a header narrows with the list', () => {
    const counts = countByProvider(filterModels(scopeModels(CATALOG, 'openai'), 'd'));
    assert.equal(counts.get('openai'), 1);
    assert.equal(counts.get('groq'), undefined, 'a provider scrolled out is not counted');
  });
});

describe('providerOrder', () => {
  it('lists each provider once, in first-appearance order', () => {
    assert.deepEqual(providerOrder(CATALOG), ['groq', 'anthropic', 'openai', 'ollama']);
  });
});

describe('adjacentProviderIndex', () => {
  it('moves to the first model of the next provider', () => {
    assert.equal(adjacentProviderIndex(CATALOG, 0, 1), 2, 'groq -> anthropic');
  });

  it('moves to the first model of the previous provider', () => {
    assert.equal(adjacentProviderIndex(CATALOG, 2, -1), 0, 'anthropic -> groq');
  });

  it('wraps at both ends so the keys cycle instead of dead-ending', () => {
    assert.equal(adjacentProviderIndex(CATALOG, 5, 1), 0, 'last -> first');
    assert.equal(adjacentProviderIndex(CATALOG, 0, -1), 5, 'first -> last');
  });

  it('walks the whole ring and returns to the start', () => {
    let idx = 0;
    const seen = [idx];
    for (let i = 0; i < 3; i++) {
      idx = adjacentProviderIndex(CATALOG, idx, 1);
      seen.push(idx);
    }
    assert.deepEqual(seen, [0, 2, 3, 5]);
  });

  it('returns -1 when there is nothing to move to', () => {
    assert.equal(adjacentProviderIndex([], 0, 1), -1);
  });

  it('falls back to the first provider when the cursor is off the list', () => {
    // A stale index used to be able to send ←→ somewhere arbitrary; -1 from
    // the caller means "leave the cursor alone", not "jump to the top".
    assert.equal(adjacentProviderIndex(CATALOG, 99, 1), 0);
  });
});

describe('modelEmptyState', () => {
  const base = { loading: false, loadError: null, modelCount: 5, filteredCount: 5, query: '' };

  it('renders nothing while loading — the caller draws its own progress line', () => {
    assert.equal(modelEmptyState({ ...base, loading: true }), null);
  });

  it('renders nothing when there are matches', () => {
    assert.equal(modelEmptyState(base), null);
  });

  it('blames the load, not the search, when the catalog threw', () => {
    const s = modelEmptyState({ ...base, loadError: 'fetch failed', filteredCount: 0 });
    assert.match(s.text, /fetch failed/);
    assert.equal(s.isError, true);
  });

  it('does not blame the search when the catalog came back empty', () => {
    // discovery.js resolves to [] on a fetch failure rather than throwing, so a
    // dropped wifi lands here. The old single message said "No models match your
    // search", which sent the user off to backspace a query that never caused it.
    const s = modelEmptyState({ ...base, modelCount: 0, filteredCount: 0, query: 'sonnet' });
    assert.equal(s.isError, true);
    assert.match(s.text, /No models found/);
    assert.doesNotMatch(s.text, /sonnet/);
    assert.doesNotMatch(s.text, /match/i);
  });

  it('names the provider when a search misses inside a narrowed list', () => {
    const s = modelEmptyState({
      ...base, filteredCount: 0, query: 'zzz', providerLabel: 'OpenRouter',
    });
    assert.equal(s.isError, false);
    assert.match(s.text, /OpenRouter/);
    assert.match(s.text, /zzz/);
  });
});

describe('providerEmptyState', () => {
  it('reports a failed load as an error', () => {
    const s = providerEmptyState({ loading: false, loadError: 'nope', providerCount: 0 });
    assert.equal(s.isError, true);
    assert.match(s.text, /nope/);
  });

  it('explains an empty provider list instead of showing a blank box', () => {
    const s = providerEmptyState({ loading: false, loadError: null, providerCount: 0 });
    assert.match(s.text, /No providers found/);
  });

  it('stays silent when there is at least one provider', () => {
    assert.equal(providerEmptyState({ loading: false, loadError: null, providerCount: 3 }), null);
  });
});

describe('providerRows', () => {
  const rows = summarizeProviders(CATALOG);

  it('carries the true index, so a scrolled window cannot highlight the wrong row', () => {
    // The bug this guards: indexOf(row) inside the render, which is only equal
    // to the real index when the window starts at zero.
    const windowed = providerRows(rows, 2, 2);
    assert.deepEqual(windowed.map(r => r.index), [2, 3]);
    assert.deepEqual(windowed.map(r => r.provider.id), ['openai', 'ollama']);
  });

  it('clamps a window that runs past the end', () => {
    assert.equal(providerRows(rows, 3, 10).length, 1);
    assert.deepEqual(providerRows(rows, 99, 5), []);
  });
});

describe('the drill-down, end to end', () => {
  it('picking a provider narrows the model list to exactly its models', () => {
    const providers = summarizeProviders(CATALOG);
    const openai = providers.find(p => p.id === 'openai');
    const scoped = scopeModels(CATALOG, openai.id);
    assert.deepEqual(filterModels(scoped, '').map(x => x.id), ['d', 'e']);
    assert.equal(countByProvider(scoped).get('openai'), 2);
    // Every surviving row belongs to the chosen provider — the invariant the
    // ←→ cycling bug broke, where headers and rows came from different arrays.
    assert.ok(scoped.every(x => x.provider === 'openai'));
  });

  it('←→ steps provider to provider within a narrowed list', () => {
    // With one provider selected there is nothing to step to, and the cursor
    // must stay put rather than wrap to itself from an empty order list.
    const scoped = scopeModels(CATALOG, 'openai');
    assert.equal(adjacentProviderIndex(scoped, 0, 1), 0);
  });

  it('works against the real pinned fallback catalog', () => {
    const fallback = getFallbackModels().map(x => ({
      ...x,
      connected: ['groq', 'ollama'].includes(x.provider),
    }));
    const providers = summarizeProviders(fallback);
    assert.ok(providers.length >= 4, 'the pinned list spans several providers');
    assert.deepEqual(
      providers.map(p => p.id),
      [...new Set(fallback.map(x => x.provider))],
      'provider order matches the ranking that produced the catalog',
    );
    assert.equal(
      providers.reduce((n, p) => n + p.count, 0),
      fallback.length,
      'every model is accounted for by exactly one provider',
    );
  });
});
/**
 * Pure derivations behind the model picker.
 *
 * These were inline `useMemo` bodies inside the dialog, which made them
 * untestable in practice: the only way to exercise "group 860 models by
 * provider" or "walk to the next provider" was to mount an Ink component that
 * first reaches the network for the models.dev catalog. Any assertion about
 * ordering or grouping was therefore either skipped or hostage to a live fetch.
 *
 * Nothing here touches React, the terminal, the network, or module state, so the
 * whole file is exercised directly by the unit tests with a hand-built catalog.
 * The dialog keeps only the wiring.
 */

/** The shape the picker needs from a registry model. */
export type ModelEntry = {
  id: string;
  provider: string;
  label: string;
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
  thinking?: boolean;
  toolCall?: boolean;
  /** False when the provider has no credential/daemon behind it yet. */
  connected?: boolean;
};

/** One row of the provider list reached with ctrl+a. */
export type ProviderSummary = {
  id: string;
  /** Models the catalog offers for this provider, connected or not. */
  count: number;
  connected: boolean;
  local: boolean;
  inUse: boolean;
};

/**
 * One entry per provider, in the order they first appear in the catalog.
 *
 * That order is whatever ranking the caller passed in — `getBrowseModels()`
 * returns connected providers first — so the list leads with providers that can
 * actually run something and stays consistent with the ←→ cycling below. Sorting
 * by model count here would put a 600-model aggregator above a healthy 12-model
 * local daemon.
 *
 * `connected` ORs across the provider's rows rather than taking the first.
 * Availability is a provider-level property, so a disagreement between rows is a
 * discovery artifact — and reporting "needs a key" for a provider the user has a
 * key for is the worse of the two errors.
 */
export function summarizeProviders(
  models: ModelEntry[],
  { localProviderIds = [], currentProviderId = null }: { localProviderIds?: string[]; currentProviderId?: string | null } = {},
): ProviderSummary[] {
  const local = new Set(localProviderIds);
  const byId = new Map<string, ProviderSummary>();
  for (const m of models) {
    let entry = byId.get(m.provider);
    if (!entry) {
      entry = {
        id: m.provider,
        count: 0,
        connected: false,
        local: local.has(m.provider),
        inUse: false,
      };
      byId.set(m.provider, entry);
    }
    entry.count++;
    if (m.connected !== false) entry.connected = true;
  }
  if (currentProviderId) {
    const entry = byId.get(currentProviderId);
    // `inUse` is a property of the current conversation, not of the catalog, so
    // it is stamped here rather than derived from the rows — and it is dropped
    // entirely when the model in use is not in the list at all.
    if (entry) entry.inUse = true;
  }
  return [...byId.values()];
}

/**
 * The models reachable at this level: the whole catalog, or one provider.
 *
 * Kept separate from `filterModels` because the ←→ cycling indexes into this
 * array too — and that indexing is only correct if it walks the same array the
 * cursor points into. Folding the narrowing into the query filter made the two
 * disagree whenever both were active.
 */
export function scopeModels(models: ModelEntry[], providerFilter: string | null): ModelEntry[] {
  return providerFilter ? models.filter(m => m.provider === providerFilter) : models;
}

/**
 * Narrow by free-text. An empty query returns `scoped` itself rather than a
 * copy, so the "no query" case stays referentially stable and does not churn
 * the cursor-clamping effect on every render.
 */
export function filterModels(scoped: ModelEntry[], query: string): ModelEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return scoped;
  return scoped.filter(m =>
    m.id.toLowerCase().includes(q) ||
    m.label.toLowerCase().includes(q) ||
    m.provider.toLowerCase().includes(q),
  );
}

/**
 * How many rows each provider has *in the current view*.
 *
 * The header count used to be a `filter(...).length` evaluated per header per
 * render — roughly 16 × 860 comparisons on every frame of a list that
 * re-renders on every keystroke. Counting once per change turns the header into
 * a map lookup.
 *
 * Derived from the filtered list, not the catalog, so a provider narrowing or a
 * search narrows the number along with the rows — which is what the number
 * claims to be.
 */
export function countByProvider(models: ModelEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of models) counts.set(m.provider, (counts.get(m.provider) ?? 0) + 1);
  return counts;
}

/** Providers in first-appearance order, which is their grouping order. */
export function providerOrder(models: ModelEntry[]): string[] {
  const order: string[] = [];
  for (const m of models) {
    if (order[order.length - 1] !== m.provider) order.push(m.provider);
  }
  return order;
}

/**
 * Index of the first model belonging to a provider, or -1.
 *
 * Wrapping is deliberate: ←→ from the first provider goes to the last and back,
 * so the keys cycle instead of dead-ending at the ends of the list.
 */
export function firstIndexOfProvider(models: ModelEntry[], provider: string): number {
  return models.findIndex(m => m.provider === provider);
}

/**
 * Where a ←/→ step lands: the first model of the adjacent provider.
 *
 * `currentIndex` is the cursor into the same array. Returns -1 when there is
 * nothing to move to, which the caller treats as "leave the cursor alone"
 * rather than "jump to the top".
 */
export function adjacentProviderIndex(models: ModelEntry[], currentIndex: number, step: number): number {
  const order = providerOrder(models);
  if (order.length === 0) return -1;
  const current = models[currentIndex]?.provider;
  const idx = current ? order.indexOf(current) : -1;
  const len = order.length;
  const next = order[(((idx < 0 ? 0 : idx + step) % len) + len) % len];
  return firstIndexOfProvider(models, next);
}

/**
 * Which empty state, if any, the model list should show.
 *
 * The distinction is the whole point. `discoverAllModels` swallows fetch
 * failures and resolves to `[]` (see the `.catch(() => [])` in discovery.js),
 * so a dropped connection arrives as "loaded, zero models" — and the obvious
 * rendering for that is "No models match your search", which blames the user's
 * typing for a failed fetch. A single message here cannot tell those apart, so
 * the state is resolved in one place where they can.
 */
export function modelEmptyState(
  { loading, loadError, modelCount, filteredCount, query, providerLabel }:
  { loading: boolean; loadError?: string | null; modelCount: number; filteredCount: number; query: string; providerLabel?: string | null },
): { text: string; isError: boolean } | null {
  if (loading) return null;                 // the caller renders its own progress line
  if (loadError) return { text: `Could not load the model catalog: ${loadError}`, isError: true };
  if (modelCount === 0) {
    return { text: 'No models found — check connectivity with `sentinel health`.', isError: true };
  }
  if (filteredCount === 0) {
    const q = query.trim();
    const where = providerLabel ? ` in ${providerLabel}` : '';
    return { text: `No models${where} match "${q}"`, isError: false };
  }
  return null;
}

/** The provider list's counterpart to `modelEmptyState`. */
export function providerEmptyState(
  { loading, loadError, providerCount }:
  { loading: boolean; loadError?: string | null; providerCount: number },
): { text: string; isError: boolean } | null {
  if (loading) return null;
  if (loadError) return { text: `Could not load providers: ${loadError}`, isError: true };
  if (providerCount === 0) {
    return { text: 'No providers found — check connectivity with `sentinel health`.', isError: true };
  }
  return null;
}

/**
 * The window slice for the provider list, with each row carrying its true index.
 *
 * Computing the index here (rather than calling `providers.indexOf(row)` inside
 * the render) turns a linear scan per visible row into arithmetic — and, more
 * usefully, makes the index impossible to get wrong.
 */
export function providerRows(
  providers: ProviderSummary[],
  start: number,
  count: number,
): { provider: ProviderSummary; index: number }[] {
  return providers
    .slice(start, start + count)
    .map((provider, slot) => ({ provider, index: start + slot }));
}
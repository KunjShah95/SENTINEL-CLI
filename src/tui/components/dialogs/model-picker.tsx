import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../../providers/theme/index.js';
import { useDialog } from '../../providers/dialog/index.js';
import { useViewport, windowRange } from '../oc/overlay.js';
import { variantLabel } from '../../../shared/models/variants.js';
import { chordOf, keybinds as activeKeybinds } from '../../keybinds.js';
import {
  adjacentProviderIndex,
  countByProvider,
  filterModels,
  modelEmptyState,
  providerEmptyState,
  providerRows,
  scopeModels,
  summarizeProviders,
  type ModelEntry,
  type ProviderSummary,
} from './model-picker.logic.js';

export type { ModelEntry, ProviderSummary } from './model-picker.logic.js';

type ModelPickerDialogProps = {
  currentModel: string;
  onSelect: (modelId: string) => void;
};

/** Registry IDs are normally `provider/model`, but keep this defensive for
 * providers that return an unqualified ID. The picker owns the provider badge,
 * so printing the full ID beside it would duplicate the prefix. */
export function modelDisplayName(model: Pick<ModelEntry, 'id' | 'provider'>): string {
  const prefix = `${model.provider}/`;
  return model.id.startsWith(prefix) ? model.id.slice(prefix.length) : model.id;
}

export function ModelPickerDialog({ currentModel, onSelect }: ModelPickerDialogProps) {
  const { colors } = useTheme();
  const { close } = useDialog();
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [filtered, setFiltered] = useState<ModelEntry[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [query, setQuery] = useState('');
  /**
   * Which of the two levels is on screen. `models` is the flat list every other
   * key has always driven; `providers` is the ctrl+a drill-down. Keeping them as
   * one component rather than a dialog inside a dialog is what lets Enter and
   * Escape carry a selection back down instead of tearing the whole picker down.
   */
  const [view, setView] = useState<'models' | 'providers'>('models');
  /** Provider the list is narrowed to, or null for the whole catalog. */
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [providerIdx, setProviderIdx] = useState(0);
  // Effort level chosen for the highlighted model. Switching effort is not a
  // model switch — the conversation stays — so it is a property of the
  // selection rather than something baked into what gets passed back.
  const [variant, setVariant] = useState<string>('');
  const [variantsFor, setVariantsFor] = useState<string[]>([]);
  const [badge, setBadge] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * Set when the catalog load throws outright.
   *
   * This is not the same as an empty list, and collapsing the two is how the
   * picker ends up lying. `discoverAllModels` swallows fetch failures and
   * resolves to `[]` (see the `.catch(() => [])` in discovery.js), so a total
   * network failure arrives here as "loaded, zero models" — and the obvious
   * rendering for that is "No models match your search", which blames the user's
   * typing for a dropped wifi.
   */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [providerLabels, setProviderLabels] = useState<Record<string, string>>({});
  const [providerLocal, setProviderLocal] = useState<Record<string, boolean>>({});
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    (async () => {
      try {
        // The browse view, not `getRankedModels()`: the runtime registry only
        // holds connected providers, which made this list show nothing but the
        // local daemon. Widening it here is read-only — it does not touch the
        // registry that auto-select and failover read, so an unconnected pick
        // still cannot become the default.
        const { getBrowseModels } = await import('../../../shared/models/index.js');
        const all: ModelEntry[] = await getBrowseModels();
        setModels(all);
        setFiltered(all);
        const currentIdx = all.findIndex(m => m.id === currentModel);
        if (currentIdx >= 0) setSelectedIdx(currentIdx);
        // Connector labels, so a header reads "Vercel AI Gateway" rather than
        // "VERCEL-AI-GATEWAY". The registry owns the spelling. `local` rides
        // along from the same rows so the provider list can say "runs on your
        // machine" without a second lookup that could disagree about an id.
        const { listConnectors } = await import('../../../shared/connectors/registry.js');
        const connectors = listConnectors() as { id: string; label: string; local?: boolean }[];
        setProviderLabels(Object.fromEntries(connectors.map(c => [c.id, c.label])));
        setProviderLocal(Object.fromEntries(connectors.map(c => [c.id, c.local === true])));
      } catch (e) {
        // Surfaced rather than swallowed: the dialog now says what failed and
        // what to run, instead of showing an empty list that reads like a
        // no-results search.
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [currentModel]);

  // Provider of the model actually in use — not of the highlighted row. Tracking
  // the highlight made a search for "sonnet" stamp "· in use" onto OpenRouter
  // while the conversation was still running on LM Studio.
  const currentProviderId = models.find((m) => m.id === currentModel)?.provider;

  /**
   * The models reachable at this level: the whole catalog, or one provider.
   */
  const scoped = useMemo(() => scopeModels(models, providerFilter), [models, providerFilter]);

  useEffect(() => {
    const next = filterModels(scoped, query);
    setFiltered(next);
    // Only a real query change resets the cursor. Resetting whenever `scoped`
    // changes would fight the clamp below and lose the user's place on the
    // provider-narrowing paths, which set the cursor themselves.
    if (query.trim()) setSelectedIdx(0);
  }, [query, scoped]);

  /**
   * Keep the cursor inside the list it is pointing at.
   *
   * Every path that changes `filtered` today also resets the cursor, but that is
   * an invariant held together by convention across three handlers — and the
   * failure mode is silent and bad: a stale index renders rows with nothing
   * highlighted and makes Enter a no-op, with no error anywhere. Clamping here
   * costs two cheap no-op setState calls per keystroke and makes the invariant
   * structural.
   */
  useEffect(() => {
    setSelectedIdx(i => Math.max(0, Math.min(i, filtered.length - 1)));
    setScrollOffset(o => Math.max(0, Math.min(o, Math.max(0, filtered.length - 1))));
  }, [filtered]);

  /**
   * How many rows each provider has *in the current view*.
   *
   * The header count used to be a `filtered.filter(...).length` evaluated per
   * header per render — roughly 16 × 860 comparisons on every frame, on a list
   * that re-renders on every keystroke. Counting once per `filtered` change
   * turns the header into a map lookup.
   *
   * It is derived from `filtered`, not `models`, so a provider filter or a
   * search narrows the header count along with the rows. That is what the number
   * is claiming to be.
   */
  const visibleCountByProvider = useMemo(() => countByProvider(filtered), [filtered]);

  /**
   * One entry per provider, in the order they first appear in the ranked
   * catalog. See `summarizeProviders` for why that order is preserved.
   */
  const providers = useMemo<ProviderSummary[]>(
    () => summarizeProviders(models, {
      localProviderIds: Object.keys(providerLocal).filter(id => providerLocal[id]),
      currentProviderId: currentProviderId ?? null,
    }),
    [models, providerLocal, currentProviderId],
  );

  // The catalog loads asynchronously, so the provider list grows after the
  // dialog opens. Clamping here keeps the highlight on a real row instead of
  // pointing past the end of a list that was shorter a frame ago.
  useEffect(() => {
    setProviderIdx(i => Math.max(0, Math.min(i, providers.length - 1)));
  }, [providers.length]);

  // Recompute the effort levels and the measured score whenever the highlight
  // moves, so the footer describes what Enter would actually select.
  useEffect(() => {
    // On the provider level there is no highlighted model, so there is no effort
    // level to describe. Leaving the previous model's levels on screen would
    // promise an option that the next Enter cannot deliver.
    if (view === 'providers') { setVariantsFor([]); setBadge(null); return; }
    const m = filtered[selectedIdx];
    if (!m) { setVariantsFor([]); setBadge(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const variants = await import('../../../shared/models/variants.js');
        const levels = variants.availableVariants(m.id);
        if (!cancelled) setVariantsFor(levels);
      } catch { if (!cancelled) setVariantsFor([]); }
      try {
        const bench = await import('../../../agent/bench-scores.js');
        const b = bench.badgeFor(m.id);
        if (!cancelled) setBadge(b);
      } catch { if (!cancelled) setBadge(null); }
    })();
    return () => { cancelled = true; };
  }, [filtered, selectedIdx, view]);

  const handleSelect = useCallback((m: ModelEntry, v?: string) => {
    // The variant rides on the id so everything downstream — the pref, the
    // session header, the cost record — can see which effort level produced the
    // spend without a second piece of state that can disagree.
    onSelect(variantLabel(m.id, v ?? null));
    close();
  }, [onSelect, close]);

  // A fixed page of 18 overflowed a short terminal, clipping the list and hiding
  // the footer hints. Size the page to the viewport instead.
  //
  // The budget counts *lines*, not models, because provider headers share the
  // same space. A 18-model page would grow to 36 rendered lines the moment
  // headers appeared, and the dialog would clip its own footer again.
  const { rows } = useViewport();
  const PAGE = Math.max(5, Math.min(16, rows - 16));
  // One line per provider, and this level has no search box above it — so it has
  // more room than the model list does, not less.
  const PROVIDER_PAGE = Math.max(3, Math.min(16, rows - 10));

  /**
   * The visible window, with a header line emitted whenever the provider
   * changes. Headers carry no selection index, so `selectedIdx` still indexes
   * `filtered` directly and the arrow-key math is untouched.
   *
   * Suppressed when the list is narrowed to one provider: every row then carries
   * the same header, so it would repeat once per model.
   */
  const display = useMemo(() => {
    const out: Array<{ header?: string; model?: ModelEntry; index: number; connected?: boolean }> = [];
    let i = scrollOffset;
    while (i < filtered.length && out.length < PAGE) {
      const m = filtered[i];
      const prev = i > 0 ? filtered[i - 1] : null;
      if ((!prev || prev.provider !== m.provider) && out.length >= PAGE) break;
      if (!prev || prev.provider !== m.provider) {
        out.push({ header: m.provider, index: i, connected: m.connected !== false });
      }
      out.push({ model: m, index: i });
      i++;
    }
    return out;
  }, [filtered, scrollOffset, PAGE, providerFilter]);

  /** Drop the provider narrowing and show the whole catalog again. */
  const clearProviderFilter = useCallback(() => {
    setProviderFilter(null);
    setSelectedIdx(0);
    setScrollOffset(0);
  }, []);

  /** Move between providers. Indexes `filtered` so the target really exists. */
  const jumpToAdjacentProvider = useCallback((step: number) => {
    const first = adjacentProviderIndex(filtered, selectedIdx, step);
    if (first < 0) return;
    setSelectedIdx(first);
    setScrollOffset(o => (first < o ? first : Math.max(o, first - PAGE + 1)));
  }, [filtered, selectedIdx, PAGE]);

  /** ctrl+a: toggle between the flat list and the provider drill-down. */
  const toggleProviders = useCallback(() => {
    if (loading) return;
    if (view === 'providers') {
      setView('models');
      return;
    }
    // A live search box above a provider list that ignores it reads as a broken
    // filter, so the two levels never hold a query at the same time.
    setQuery('');
    setView('providers');
  }, [view, loading]);

  useInput((input, key) => {
    // Escape is handled FIRST, before the chord table is consulted at all.
    //
    // This ordering is load-bearing. The dialog is opened with
    // `closeOnEscape: false`, so nothing else in the app can dismiss it — if the
    // chord lookup ran first and a config rebound `model.dialog.provider` to
    // `escape` (with `session.interrupt` unbound so it wins the table), Escape
    // would toggle levels forever and the dialog could never be closed. Escape
    // must mean "up one level, or out" unconditionally.
    if (key.escape) {
      if (view === 'providers') setView('models');
      else close();
      return;
    }

    // Resolved through the compiled table rather than hardcoded, so the chord
    // honours `cli.keybinds`. `ctrl+a` also resolves to `input.line.home` in the
    // prompt table — different table, different owner, no conflict.
    const chord = chordOf(input, key as any);
    if (chord && activeKeybinds().app.get(chord) === 'model.dialog.provider') {
      toggleProviders();
      return;
    }

    if (view === 'providers') {
      if (key.upArrow || input === 'k') {
        setProviderIdx(i => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow || input === 'j') {
        setProviderIdx(i => Math.min(providers.length - 1, i + 1));
        return;
      }
      // Home/End are free on this level because there is no text input here.
      // They are deliberately NOT bound on the model level, where they belong to
      // the caret in the search box.
      if (key.home) { setProviderIdx(0); return; }
      if (key.end) { setProviderIdx(Math.max(0, providers.length - 1)); return; }
      if (key.return) {
        const p = providers[providerIdx];
        if (!p) return;
        setProviderFilter(p.id);
        setView('models');
        setSelectedIdx(0);
        setScrollOffset(0);
        return;
      }
      return;
    }

    // `v` cycles the effort level of whatever is highlighted. Shift-V steps
    // back, so a user who overshoots does not have to cycle all the way round.
    if (!query.trim() && (input === 'v' || input === 'V') && variantsFor.length > 0) {
      const at = variantsFor.indexOf(variant);
      const step = input === 'V' ? -1 : 1;
      const next = at < 0
        ? variantsFor[0]
        : variantsFor[(at + step + variantsFor.length) % variantsFor.length];
      setVariant(next);
      return;
    }
    // Backspace clears the provider narrowing, but only once the search box is
    // empty — otherwise it belongs to the query the user is still typing.
    if (key.backspace && !query && providerFilter) {
      clearProviderFilter();
      return;
    }
    if (key.upArrow || (!query && input === 'k')) {
      setSelectedIdx(i => {
        const next = Math.max(0, i - 1);
        setScrollOffset(o => next < o ? next : o);
        return next;
      });
      return;
    }
    if (key.downArrow || (!query && input === 'j')) {
      setSelectedIdx(i => {
        const next = Math.min(filtered.length - 1, i + 1);
        setScrollOffset(o => next >= o + PAGE ? next - (PAGE - 1) : o);
        return next;
      });
      return;
    }
    if (key.leftArrow) {
      if (!query.trim()) jumpToAdjacentProvider(-1);
      return;
    }
    if (key.rightArrow) {
      if (!query.trim()) jumpToAdjacentProvider(1);
      return;
    }
    if (key.return && filtered[selectedIdx]) {
      handleSelect(filtered[selectedIdx], variant);
    }
  });

  const getProviderColor = (p: string) => {
    const map: Record<string, string> = {
      groq: '#00D4AA', openai: '#00A67E', anthropic: '#7C3AED',
      google: '#4285F4', mistral: '#FF6F00', deepseek: '#6C5CE7',
      xai: '#000000', together: '#FF6B6B', fireworks: '#E91E63',
      perplexity: '#1A1A2E', openrouter: '#FF8C00',
      'github-copilot': '#6CC644', ollama: '#00BCD4', lmstudio: '#607D8B',
    };
    return map[p] || colors.info;
  };

  const providerName = (id: string) => providerLabels[id] || id;

  // The catalog is ~860 models; the count is what tells the user whether the
  // list is the full catalog or only what their credentials reached.
  const liveCount = models.filter((m) => m.connected).length;
  const providerCount = providers.length;
  const shownModels = display.reduce((n, r) => n + (r.model ? 1 : 0), 0);
  const hiddenCount = Math.max(0, filtered.length - scrollOffset - shownModels);
  const providerLabel = providerFilter ? providerName(providerFilter) : null;
  const emptyModels = modelEmptyState({
    loading, loadError,
    modelCount: models.length,
    filteredCount: filtered.length,
    query,
    providerLabel,
  });

  const { start: providerStart, count: providerCountShown } = windowRange(
    providers.length, providerIdx, PROVIDER_PAGE,
  );

  const emptyProviders = providerEmptyState({ loading, loadError, providerCount: providers.length });

  if (view === 'providers') {
    const connectedProviders = providers.filter(p => p.connected).length;
    return (
      <Box flexDirection="column" gap={1} width="100%">
        <Text dimColor>
          {loading
            ? 'Loading providers…'
            : `${providerCount} providers · ${connectedProviders} connected`}
        </Text>
        {emptyProviders ? (
          <Text color={emptyProviders.isError ? colors.error : undefined}>{emptyProviders.text}</Text>
        ) : (
        <Box flexDirection="column">
          {providerRows(providers, providerStart, providerCountShown).map(({ provider: p, index: i }) => {
            const isSelected = i === providerIdx;
            // A provider with nothing behind it is still selectable — browsing
            // what a provider offers before paying for it is the point — so this
            // only changes the colour, never the row's availability.
            const tone = isSelected
              ? colors.selection
              : p.connected ? colors.text : colors.dimSeparator;
            const mark = !p.connected && !p.local
              ? <Text color={colors.dimSeparator}>🔑 needs a key</Text>
              : p.local
                ? <Text dimColor>runs on your machine</Text>
                : null;
            return (
              <Box key={p.id} flexDirection="row" gap={1}>
                <Text color={isSelected ? colors.selection : colors.dimSeparator}>
                  {isSelected ? '▶' : p.inUse ? '●' : ' '}
                </Text>
                <Text color={getProviderColor(p.id)} bold={isSelected}>
                  {p.connected ? '✓' : p.local ? '🔗' : ' '}
                </Text>
                <Text bold={isSelected} color={tone}>
                  {providerName(p.id)}
                </Text>
                <Text dimColor>{`${p.count} models`}</Text>
                {mark}
                {/* Which provider the model list is currently narrowed to. Without
                    this, arriving at ctrl+a from a filtered list gave no way to
                    see the filter existed short of going back. */}
                {p.id === providerFilter && <Text color={colors.primary}>· filtering</Text>}
                {p.inUse && <Text color={colors.success}>· in use</Text>}
              </Box>
            );
          })}
        </Box>
        )}
        {providerCountShown < providers.length && (
          <Text dimColor>{`...${providers.length - providerStart - providerCountShown} more`}</Text>
        )}
        <Box flexDirection="row" gap={2} flexWrap="wrap">
          <Text dimColor>↑↓ navigate  Enter filter models  ctrl+a back  Esc back</Text>
          <Text dimColor>{`${providerIdx + 1}/${providers.length}`}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1} width="100%">
      <Text dimColor>
        Current: {currentModel}
      </Text>
      {providerFilter && (
        <Text color={colors.primary}>
          {`▸ ${providerName(providerFilter)} only — ${filtered.length} models · backspace to clear`}
        </Text>
      )}
      <Box borderStyle="single" borderColor={colors.primary} paddingX={1}>
        <TextInput
          value={query}
          onChange={setQuery}
          placeholder="Search models (name, provider)..."
          focus
        />
      </Box>
      <Text dimColor>
        {loading
          ? 'Loading catalog…'
          : `${filtered.length} shown · ${liveCount} connected across ${providerCount} providers`}
      </Text>
      {loading ? (
        <Text dimColor>Fetching provider catalog…</Text>
      ) : emptyModels ? (
        <Text color={emptyModels.isError ? colors.error : undefined}>{emptyModels.text}</Text>
      ) : (
        <Box flexDirection="column">
          {display.map((row, i) => {
            if (row.header) {
              return (
                <Box key={`h${row.index}`} flexDirection="row" gap={1}>
                  <Text> </Text>
                  <Text color={getProviderColor(row.header)} bold>
                    {providerName(row.header).toUpperCase()}
                  </Text>
                  <Text dimColor>
                    {visibleCountByProvider.get(row.header) ?? 0}
                  </Text>
                  {/* Connection is a property of the provider, so it is stated
                      once per section. Repeating 🔑 per row also broke column
                      alignment: the emoji is double-width, so every marked row
                      sat one column left of the unmarked ones beside it. */}
                  {row.connected === false && <Text dimColor>🔑 needs a key</Text>}
                  {row.header === currentProviderId && <Text color={colors.success}>· in use</Text>}
                </Box>
              );
            }
            const m = row.model!;
            const isSelected = row.index === selectedIdx;
            const isCurrent = m.id === currentModel;
            const isFree = m.inputUsdPerMillionTokens === 0 && m.outputUsdPerMillionTokens === 0;
            const priceStr = isFree ? '' : ` \$${m.inputUsdPerMillionTokens}/\$${m.outputUsdPerMillionTokens}`;
            // Unconnected rows stay selectable but recede, so "connected" is
            // legible at a glance without hiding the provider you may want next.
            const mark = m.connected === false ? colors.dimSeparator : undefined;
            return (
              <Box key={m.id} flexDirection="row" gap={1}>
                <Text color={isSelected ? colors.selection : colors.dimSeparator}>
                  {isSelected ? '▶' : isCurrent ? '●' : ' '}
                </Text>
                <Text bold={isSelected} color={isSelected ? colors.selection : mark}>
                  {modelDisplayName(m)}
                  {isSelected && variant ? `#${variant}` : ''}
                </Text>
                <Text dimColor>
                  {m.thinking ? '🧠' : ''}{m.toolCall ? '🔧' : ''}{priceStr}
                </Text>
              </Box>
            );
          })}
          {hiddenCount > 0 && (
            <Text dimColor>{`...${hiddenCount} more`}</Text>
          )}
        </Box>
      )}
      <Box flexDirection="row" gap={2} flexWrap="wrap">
        <Text dimColor>
          {`↑↓ navigate  ←→ provider  ctrl+a providers  Enter select  Esc close  Type to filter`}
        </Text>
        {variantsFor.length > 0 && (
          <Text dimColor>{`  v effort: ${variant || '(default)'} (${variantsFor.length} levels)`}</Text>
        )}
      </Box>
      {badge && <Text dimColor>{`Measured here: ${badge}`}</Text>}
    </Box>
  );
}

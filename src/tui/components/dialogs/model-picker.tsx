import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../../providers/theme/index.js';
import { useDialog } from '../../providers/dialog/index.js';
import { useViewport } from '../oc/overlay.js';
import { variantLabel } from '../../../shared/models/variants.js';

type ModelEntry = {
  id: string;
  provider: string;
  label: string;
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
  thinking?: boolean;
  toolCall?: boolean;
};

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
  // Effort level chosen for the highlighted model. Switching effort is not a
  // model switch — the conversation stays — so it is a property of the
  // selection rather than something baked into what gets passed back.
  const [variant, setVariant] = useState<string>('');
  const [variantsFor, setVariantsFor] = useState<string[]>([]);
  const [badge, setBadge] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    (async () => {
      try {
        const { getRankedModels } = await import('../../../shared/models/index.js');
        const all = getRankedModels();
        setModels(all);
        setFiltered(all);
        const currentIdx = all.findIndex(m => m.id === currentModel);
        if (currentIdx >= 0) setSelectedIdx(currentIdx);
      } catch (e) {
        // models not available — dialog shows empty
      }
    })();
  }, [currentModel]);

  useEffect(() => {
    if (!query.trim()) {
      setFiltered(models);
      return;
    }
    const q = query.toLowerCase();
    setFiltered(models.filter(m =>
      m.id.toLowerCase().includes(q) ||
      m.label.toLowerCase().includes(q) ||
      m.provider.toLowerCase().includes(q)
    ));
    setSelectedIdx(0);
  }, [query, models]);

  // Recompute the effort levels and the measured score whenever the highlight
  // moves, so the footer describes what Enter would actually select.
  useEffect(() => {
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
  }, [filtered, selectedIdx]);

  const handleSelect = useCallback((m: ModelEntry, v?: string) => {
    // The variant rides on the id so everything downstream — the pref, the
    // session header, the cost record — can see which effort level produced the
    // spend without a second piece of state that can disagree.
    onSelect(variantLabel(m.id, v ?? null));
    close();
  }, [onSelect, close]);

  // A fixed page of 18 overflowed a short terminal, clipping the list and hiding
  // the footer hints. Size the page to the viewport instead.
  const { rows } = useViewport();
  const PAGE = Math.max(5, Math.min(18, rows - 12));
  const visible = filtered.slice(scrollOffset, scrollOffset + PAGE);

  useInput((input, key) => {
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
      if (!query.trim()) {
        const currentProvider = filtered[selectedIdx]?.provider;
        if (currentProvider) {
          const providers = [...new Set(models.map(m => m.provider))];
          const idx = providers.indexOf(currentProvider);
          const prevProvider = idx > 0 ? providers[idx - 1] : providers[providers.length - 1];
          const firstOfProvider = models.findIndex(m => m.provider === prevProvider);
          if (firstOfProvider >= 0) setSelectedIdx(firstOfProvider);
        }
      }
      return;
    }
    if (key.rightArrow) {
      if (!query.trim()) {
        const currentProvider = filtered[selectedIdx]?.provider;
        if (currentProvider) {
          const providers = [...new Set(models.map(m => m.provider))];
          const idx = providers.indexOf(currentProvider);
          const nextProvider = idx < providers.length - 1 ? providers[idx + 1] : providers[0];
          const firstOfProvider = models.findIndex(m => m.provider === nextProvider);
          if (firstOfProvider >= 0) setSelectedIdx(firstOfProvider);
        }
      }
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

  return (
    <Box flexDirection="column" gap={1} width="100%">
      <Text dimColor>
        Current: {currentModel}
      </Text>
      <Box borderStyle="single" borderColor={colors.primary} paddingX={1}>
        <TextInput
          value={query}
          onChange={setQuery}
          placeholder="Search models (name, provider)..."
          focus
        />
      </Box>
      {filtered.length === 0 ? (
        <Text dimColor>No models match your search</Text>
      ) : (
        <Box flexDirection="column">
          {visible.map((m, i) => {
            const isSelected = i + scrollOffset === selectedIdx;
            const isCurrent = m.id === currentModel;
            const isFree = m.inputUsdPerMillionTokens === 0 && m.outputUsdPerMillionTokens === 0;
            const priceStr = isFree ? '' : ` \$${m.inputUsdPerMillionTokens}/\$${m.outputUsdPerMillionTokens}`;
            return (
              <Box key={m.id} flexDirection="row" gap={1}>
                <Text color={isSelected ? colors.selection : colors.dimSeparator}>
                  {isSelected ? '▶' : isCurrent ? '●' : ' '}
                </Text>
                <Text color={getProviderColor(m.provider)} bold={isSelected}>
                  {m.provider}/
                </Text>
                <Text bold={isSelected} color={isSelected ? colors.selection : undefined}>
                  {modelDisplayName(m)}
                  {isSelected && variant ? `#${variant}` : ''}
                </Text>
                <Text dimColor>
                  {m.thinking ? '🧠' : ''}{m.toolCall ? '🔧' : ''}{priceStr}
                </Text>
              </Box>
            );
          })}
          {filtered.length > visible.length && (
            <Text dimColor>{`...${filtered.length - visible.length} more`}</Text>
          )}
        </Box>
      )}
      <Box flexDirection="row" gap={2} flexWrap="wrap">
        <Text dimColor>↑↓ navigate  ←→ provider  Enter select  Esc close  Type to filter</Text>
        {variantsFor.length > 0 && (
          <Text dimColor>{`  v effort: ${variant || '(default)'} (${variantsFor.length} levels)`}</Text>
        )}
      </Box>
      {badge && <Text dimColor>{`Measured here: ${badge}`}</Text>}
    </Box>
  );
}

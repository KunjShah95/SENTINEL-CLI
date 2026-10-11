/**
 * Variant picker — opencode's `variant.list`.
 *
 * The `v` key inside the model picker cycles effort one level at a time and
 * prints the level count in the footer, which tells the user that other levels
 * exist but not what they cost. Effort is the one setting that changes price
 * (see the header note in `shared/models/variants.js`), so picking it blind is
 * the wrong default: this dialog names every level, what it does to the
 * reasoning budget, and which one is in effect.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../../providers/theme/index.js';
import { useDialog } from '../../providers/dialog/index.js';
import { useViewport, windowRange } from '../oc/overlay.js';
import { BUDGETS, VARIANT, availableVariants, loadVariant, saveVariant, variantLabel } from '../../../shared/models/variants.js';

/** What each level means, in the user's terms rather than token counts. */
const LEVEL_NOTES: Record<string, string> = {
  [VARIANT.OFF]: 'No reasoning — fastest and cheapest',
  [VARIANT.FAST]: 'Brief reasoning — routine edits',
  [VARIANT.STANDARD]: 'Balanced — the default',
  [VARIANT.HIGH]: 'Deep reasoning — architecture, tricky bugs',
  [VARIANT.MAX]: 'Maximum — slowest and most expensive',
};

type VariantListDialogProps = {
  modelId: string;
  onSelect: (modelId: string) => void;
};

export function VariantListDialog({ modelId, onSelect }: VariantListDialogProps) {
  const { colors } = useTheme();
  const { close } = useDialog();
  const [levels, setLevels] = useState<string[]>([]);
  const [current, setCurrent] = useState<string>('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const levels = availableVariants(modelId);
        const stored = await loadVariant(modelId);
        if (cancelled) return;
        setLevels(levels);
        setCurrent(stored);
        // Start on the level in effect rather than at the top, so Enter on an
        // untouched dialog changes nothing instead of silently resetting effort
        // to `standard`.
        const at = levels.indexOf(stored);
        if (at >= 0) setSelectedIdx(at);
      } catch {
        if (!cancelled) setLevels([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [modelId]);

  useInput((input, key) => {
    // No text field on this level, so vim keys are free here and do not collide
    // with typing.
    if (key.upArrow || input === 'k') {
      setSelectedIdx(i => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow || input === 'j') {
      setSelectedIdx(i => Math.min(levels.length - 1, i + 1));
      return;
    }
    if (key.return) {
      const level = levels[selectedIdx];
      if (!level) return;
      (async () => {
        // Persisted before the model id changes, because the variant is stored
        // per model and the picker reloads it on the next open. Saving after
        // would race the re-read.
        await saveVariant(modelId, level);
        onSelect(variantLabel(modelId, level));
        close();
      })();
    }
  });

  const rows = useMemo(
    () => levels.map((level, i) => ({
      level,
      index: i,
      budget: BUDGETS[level],
      isCurrent: level === current,
      note: LEVEL_NOTES[level] || '',
    })),
    [levels, current],
  );

  const { rows: viewportRows } = useViewport();
  const visible = Math.max(3, Math.min(10, viewportRows - 10));
  const { start, count } = windowRange(rows.length, selectedIdx, visible);

  return (
    <Box flexDirection="column" gap={1} width="100%">
      <Text dimColor>
        {modelId}
      </Text>
      <Box borderStyle="single" borderColor={colors.border} paddingX={1}>
        <Box flexDirection="column">
          {loading ? (
            <Text dimColor>Loading effort levels…</Text>
          ) : rows.length === 0 ? (
            // Not an error: a model without reasoning support has exactly one
            // level, which is "none". Saying so is more useful than an empty box.
            <Text dimColor>
              {'This model does not offer reasoning levels — effort cannot be changed.'}
            </Text>
          ) : (
            rows.slice(start, start + count).map(r => {
              const isSelected = r.index === selectedIdx;
              const tone = isSelected ? colors.selection : r.isCurrent ? colors.success : undefined;
              return (
                <Box key={r.level} flexDirection="column">
                  <Box flexDirection="row" gap={1}>
                    <Text color={isSelected ? colors.selection : colors.dimSeparator}>
                      {isSelected ? '▶' : r.isCurrent ? '●' : ' '}
                    </Text>
                    <Text bold={isSelected} color={tone}>
                      {r.level}
                    </Text>
                    <Text dimColor>
                      {r.budget > 0 ? `${r.budget.toLocaleString()} token budget` : 'no reasoning'}
                    </Text>
                  </Box>
                  <Text dimColor>{`  ${r.note}`}</Text>
                </Box>
              );
            })
          )}
        </Box>
      </Box>
      {!loading && rows.length > 0 && (
        <Text dimColor>↑↓ navigate  Enter apply  Esc close</Text>
      )}
    </Box>
  );
}
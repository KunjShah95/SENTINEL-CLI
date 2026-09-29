import React, { useRef } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../providers/theme/index.js';
import { DialogSearchList } from '../dialog-search-list.js';
import type { Theme } from '../../theme.js';

/**
 * opencode dialog-theme-list: fuzzy list, the highlighted theme previews
 * live, Enter keeps it, closing without choosing restores the original.
 */
export function ThemePickerDialog({ onClose }: { onClose: () => void }) {
  const { theme, themes, setTheme, colors } = useTheme();
  const original = useRef(theme.name);
  const chosen = useRef(false);

  React.useEffect(() => () => {
    if (!chosen.current) setTheme(original.current);
  }, [setTheme]);

  return (
    <Box flexDirection="column">
      <DialogSearchList<Theme>
        items={themes}
        getKey={(t) => t.name}
        placeholder="Search themes…"
        filterFn={(t, q) => t.name.toLowerCase().includes(q.toLowerCase())}
        onHighlight={(t) => setTheme(t.name)}
        onSelect={(t) => {
          chosen.current = true;
          setTheme(t.name);
          onClose();
        }}
        renderItem={(t, selected) => (
          <Text>
            <Text color={t.colors.primary}>{'■'}</Text>
            <Text color={t.colors.secondary}>{'■'}</Text>
            <Text color={t.colors.accent}>{'■ '}</Text>
            <Text color={selected ? colors.primary : colors.text} bold={selected}>{t.name}</Text>
            {t.name === original.current ? <Text color={colors.textMuted}>{'  (current)'}</Text> : null}
            {t.source === 'opencode' ? <Text color={colors.textMuted}>{'  opencode'}</Text> : null}
          </Text>
        )}
      />
      <Text color={colors.textMuted}>{'↑↓ preview · enter apply · esc cancel'}</Text>
    </Box>
  );
}

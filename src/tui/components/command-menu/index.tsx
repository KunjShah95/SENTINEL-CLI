import React, { useCallback, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../../providers/theme/index.js';
import { getFilteredCommands } from './commands.js';
import { recordCommand } from '../../lib/command-mru.js';
import type { CommandContext } from './types.js';

const MAX_VISIBLE = 10;

const CAT_ICON: Record<string, string> = {
  general:  '◎',
  scan:     '◈',
  git:      '⎇',
  actions:  '◆',
  settings: '⬡',
  output:   '▪',
  views:    '▸',
  ci:       '⊕',
  server:   '⚙',
};

const CAT_COLOR_KEY: Record<string, string> = {
  general: 'info',   scan: 'warning', git: 'primary', actions: 'success',
  settings: 'planMode', output: 'info', views: 'primary', ci: 'warning', server: 'info',
};

type Props = { onClose: () => void; ctx: CommandContext };

export function CommandMenu({ onClose, ctx }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { colors } = useTheme();

  const filtered = getFilteredCommands(query);
  const visible = filtered.slice(0, MAX_VISIBLE);

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    setSelectedIndex(0);
  }, []);

  const handleSubmit = useCallback(() => {
    const cmd = filtered[selectedIndex];
    if (!cmd) return;
    recordCommand(cmd.name);
    if (cmd.action) { cmd.action(ctx); } else { ctx.execute(cmd.value.replace(/^\//, '')); }
    onClose();
  }, [filtered, selectedIndex, ctx, onClose]);

  useInput((input, key) => {
    if (key.upArrow)   { setSelectedIndex(p => Math.max(0, p - 1)); return; }
    if (key.downArrow) { setSelectedIndex(p => Math.min(Math.max(filtered.length - 1, 0), p + 1)); return; }
    if (key.escape)    { onClose(); return; }
  });

  // Group visible items by category
  const categories: Record<string, typeof visible> = {};
  for (const cmd of visible) {
    const cat = cmd.category || 'general';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(cmd);
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.primary}
      paddingX={1}
      paddingY={0}
      width="100%"
    >
      {/* Header */}
      <Box flexDirection="row" gap={2} paddingY={0}>
        <Text bold color={colors.primary}>{'◆ Command Palette'}</Text>
        <Text dimColor>{'↑↓ navigate · Enter run · Esc close'}</Text>
        {filtered.length > 0 && <Text dimColor>{`${filtered.length} commands`}</Text>}
      </Box>

      {/* Search input */}
      <Box borderStyle="single" borderColor={colors.dimSeparator} paddingX={1} marginBottom={1}>
        <Text color={colors.dimSeparator}>{'/'}</Text>
        <TextInput
          value={query}
          onChange={handleChange}
          onSubmit={handleSubmit}
          placeholder="Search commands..."
          focus
        />
      </Box>

      {/* Results */}
      {visible.length === 0 ? (
        <Box paddingX={2} paddingY={1}>
          <Text dimColor>{'No commands match. Try: review, scan, loop, fix...'}</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {visible.map((cmd, i) => {
            const isSelected = i === selectedIndex;
            const cat = cmd.category || 'general';
            const colorKey = CAT_COLOR_KEY[cat] || 'dimSeparator';
            const catColor = (colors as any)[colorKey];
            const icon = CAT_ICON[cat] || '·';

            return (
              <Box
                key={cmd.value}
                flexDirection="row"
                gap={1}
                paddingX={1}
                paddingY={0}
              >
                {/* Selection indicator */}
                <Text color={isSelected ? colors.primary : colors.dimSeparator}>
                  {isSelected ? '▶' : ' '}
                </Text>

                {/* Category icon */}
                <Text color={isSelected ? colors.primary : catColor}>{icon}</Text>

                {/* Command name */}
                <Text
                  bold={isSelected}
                  color={isSelected ? colors.primary : catColor}
                >
                  {cmd.name.padEnd(16)}
                </Text>

                {/* Description */}
                <Text dimColor>{cmd.description}</Text>
              </Box>
            );
          })}
          {filtered.length > MAX_VISIBLE && (
            <Box paddingLeft={4} paddingY={0}>
              <Text dimColor>{`+${filtered.length - MAX_VISIBLE} more — keep typing to filter`}</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../../providers/theme/index.js';
import { getFilteredCommands } from './commands.js';
import { recordCommand } from '../../lib/command-mru.js';
import type { CommandContext } from './types.js';

const MAX_VISIBLE = 8;

type Props = {
  onClose: () => void;
  ctx: CommandContext;
};

function getCategoryColor(category: string | undefined, colors: Record<string, string>): string {
  switch (category) {
    case 'general': return colors.info;
    case 'scan': return colors.warning;
    case 'git': return colors.primary;
    case 'actions': return colors.success;
    case 'settings': return colors.planMode;
    case 'output': return colors.info;
    case 'views': return colors.primary;
    case 'ci': return colors.warning;
    case 'server': return colors.info;
    default: return colors.dimSeparator;
  }
}

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
    if (filtered[selectedIndex]) {
      const cmd = filtered[selectedIndex];
      recordCommand(cmd.name);
      if (cmd.action) {
        cmd.action(ctx);
      } else {
        ctx.execute(cmd.value.replace(/^\//, ''));
      }
      onClose();
    }
  }, [filtered, selectedIndex, ctx, onClose]);

  useInput((input, key) => {
    if (key.upArrow) { setSelectedIndex(p => Math.max(0, p - 1)); return; }
    if (key.downArrow) { setSelectedIndex(p => Math.min(filtered.length - 1, p + 1)); return; }
    if (key.escape) { onClose(); return; }
  });

  return (
    <Box flexDirection="column" borderStyle="double" borderColor={colors.primary} paddingX={1} paddingY={0} width="100%">
      <Box marginBottom={0}>
        <Text bold color={colors.primary}>{'⌘ Command Palette  '}</Text>
        <Text dimColor>{'↑↓ navigate  Enter run  Esc close'}</Text>
      </Box>
      <Box borderStyle="single" borderColor={colors.dimSeparator} paddingX={1}>
        <TextInput
          value={query}
          onChange={handleChange}
          onSubmit={handleSubmit}
          placeholder="Type a command..."
          focus
        />
      </Box>
      <Box flexDirection="column" marginTop={0}>
        {visible.length === 0 ? (
          <Text dimColor>{'No matching commands'}</Text>
        ) : (
          visible.map((cmd, i) => {
            const isSelected = i === selectedIndex;
            const catColor = getCategoryColor(cmd.category, colors);
            return (
              <Box key={cmd.value} flexDirection="row" gap={1} paddingX={1}>
                <Text color={isSelected ? colors.primary : colors.dimSeparator}>
                  {isSelected ? '>' : ' '}
                </Text>
                <Text bold={isSelected} color={isSelected ? colors.primary : catColor} >
                  {cmd.name.padEnd(14)}
                </Text>
                <Text dimColor>{cmd.description}</Text>
              </Box>
            );
          })
        )}
        {filtered.length > MAX_VISIBLE ? (
          <Text dimColor paddingLeft={2}>{`...${filtered.length - MAX_VISIBLE} more`}</Text>
        ) : null}
      </Box>
    </Box>
  );
}

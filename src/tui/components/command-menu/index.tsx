import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useKeyboardLayer } from '../../providers/keyboard-layer/index.js';
import { useTheme } from '../../providers/theme/index.js';
import { getFilteredCommands } from './commands.js';
import { recordCommand } from '../../lib/command-mru.js';
import type { CommandContext } from './types.js';

const MAX_VISIBLE = 8;

type Props = {
  onClose: () => void;
  ctx: CommandContext;
};

export function CommandMenu({ onClose, ctx }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { isTopLayer, push, pop } = useKeyboardLayer();
  const { colors } = useTheme();

  useEffect(() => {
    push('command-menu');
    return () => pop('command-menu');
  }, [push, pop]);

  const filtered = getFilteredCommands(query);

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    setSelectedIndex(0);
  }, []);

  const handleSubmit = useCallback(
    (_value: string) => {
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
    },
    [filtered, selectedIndex, ctx, onClose]
  );

  useInput((input, key) => {
    if (!isTopLayer('command-menu')) return;
    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    }
    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(filtered.length - 1, prev + 1));
    }
    if (key.escape) {
      onClose();
    }
  });

  const visibleItems = filtered.slice(0, MAX_VISIBLE);

  const getCategoryColor = (category?: string) => {
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
  };

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.dimSeparator} padding={1} gap={1}>
      <TextInput
        value={query}
        onChange={handleChange}
        onSubmit={handleSubmit}
        placeholder="Type a command..."
      />
      <Box flexDirection="column">
        {visibleItems.map((cmd, i) => {
          const isSelected = i === selectedIndex;
          return (
            <Box
              key={cmd.value}
              flexDirection="row"
              gap={1}
              paddingX={1}
            >
              <Text color={getCategoryColor(cmd.category)} bold={isSelected}>
                {isSelected ? '> ' : '  '}{cmd.name}
              </Text>
              <Text dimColor>{cmd.description}</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

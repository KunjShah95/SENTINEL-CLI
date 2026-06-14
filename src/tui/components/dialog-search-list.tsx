import React, { useCallback, useState, type ReactNode } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useKeyboardLayer } from '../providers/keyboard-layer/index.js';
import { useTheme } from '../providers/theme/index.js';

const MAX_VISIBLE_ITEMS = 6;

type DialogSearchListProps<T> = {
  items: T[];
  onSelect: (item: T) => void;
  onHighlight?: (item: T) => void;
  filterFn: (item: T, query: string) => boolean;
  renderItem: (item: T, isSelected: boolean) => ReactNode;
  getKey: (item: T) => string;
  placeholder?: string;
  emptyText?: string;
};

export function DialogSearchList<T>({
  items,
  onSelect,
  onHighlight,
  filterFn,
  renderItem,
  getKey,
  placeholder = 'Search...',
  emptyText = 'No results',
}: DialogSearchListProps<T>) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchValue, setSearchValue] = useState('');
  const { isTopLayer } = useKeyboardLayer();
  const { colors } = useTheme();

  const filtered = items.filter((item) => filterFn(item, searchValue));

  const handleChange = useCallback((value: string) => {
    setSearchValue(value);
    setSelectedIndex(0);
  }, []);

  const handleSubmit = useCallback(
    (_value: string) => {
      if (filtered[selectedIndex]) {
        onSelect(filtered[selectedIndex]);
      }
    },
    [filtered, selectedIndex, onSelect]
  );

  useInput((input, key) => {
    if (!isTopLayer('dialog')) return;
    if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => Math.min(filtered.length - 1, prev + 1));
    }
    if (key.escape) {
      setSearchValue('');
    }
  });

  const visibleItems = filtered.slice(0, MAX_VISIBLE_ITEMS);

  return (
    <Box flexDirection="column" gap={1}>
      <TextInput
        value={searchValue}
        onChange={handleChange}
        onSubmit={handleSubmit}
        placeholder={placeholder}
      />
      {filtered.length === 0 ? (
        <Text dimColor>{emptyText}</Text>
      ) : (
        <Box flexDirection="column">
          {visibleItems.map((item, i) => {
            const isSelected = i === selectedIndex;
            return (
              <Box key={getKey(item)} flexDirection="row">
                {renderItem(item, isSelected)}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

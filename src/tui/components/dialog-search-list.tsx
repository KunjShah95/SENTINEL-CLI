import React, { useCallback, useState, type ReactNode } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
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
  const { colors } = useTheme();

  const filtered = items.filter(item => filterFn(item, searchValue));

  const handleChange = useCallback((value: string) => {
    setSearchValue(value);
    setSelectedIndex(0);
  }, []);

  const handleSubmit = useCallback(() => {
    if (filtered[selectedIndex]) {
      onSelect(filtered[selectedIndex]);
    }
  }, [filtered, selectedIndex, onSelect]);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(filtered.length - 1, prev + 1));
      return;
    }
    if (input === 'k' && !key.ctrl) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return;
    }
    if (input === 'j' && !key.ctrl) {
      setSelectedIndex(prev => Math.min(filtered.length - 1, prev + 1));
      return;
    }
    if (key.escape) {
      setSearchValue('');
    }
  });

  const visible = filtered.slice(0, MAX_VISIBLE_ITEMS);

  return (
    <Box flexDirection="column" gap={1}>
      <Box borderStyle="single" borderColor={colors.primary} paddingX={1}>
        <TextInput
          value={searchValue}
          onChange={handleChange}
          onSubmit={handleSubmit}
          placeholder={placeholder}
          focus
        />
      </Box>
      {filtered.length === 0 ? (
        <Text dimColor>{emptyText}</Text>
      ) : (
        <Box flexDirection="column">
          {visible.map((item, i) => {
            const isSelected = i === selectedIndex;
            return (
              <Box key={getKey(item)} flexDirection="row">
                {renderItem(item, isSelected)}
              </Box>
            );
          })}
          {filtered.length > MAX_VISIBLE_ITEMS ? (
            <Text dimColor>{`...${filtered.length - MAX_VISIBLE_ITEMS} more`}</Text>
          ) : null}
        </Box>
      )}
    </Box>
  );
}

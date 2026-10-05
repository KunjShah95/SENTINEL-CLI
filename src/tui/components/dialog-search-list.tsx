import React, { useCallback, useState, type ReactNode } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../providers/theme/index.js';
import { windowRange } from './oc/overlay.js';

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
    // (j/k navigation removed: it swallowed those letters from the search box.)
    if (key.escape) {
      setSearchValue('');
    }
  });

  // Keep the highlighted item previewed (theme picker) and on screen.
  const highlighted = filtered[selectedIndex];
  React.useEffect(() => {
    if (highlighted && onHighlight) onHighlight(highlighted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlighted]);

  const { start: windowStart, count } = windowRange(filtered.length, selectedIndex, MAX_VISIBLE_ITEMS);
  const visible = filtered.slice(windowStart, windowStart + count);

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
            const isSelected = windowStart + i === selectedIndex;
            return (
              <Box key={getKey(item)} flexDirection="row">
                {renderItem(item, isSelected)}
              </Box>
            );
          })}
          {filtered.length > count ? (
            <Text dimColor>{`${selectedIndex + 1}/${filtered.length}`}</Text>
          ) : null}
        </Box>
      )}
    </Box>
  );
}

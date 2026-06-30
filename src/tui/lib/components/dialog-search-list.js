import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useCallback, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../providers/theme/index.js';
const MAX_VISIBLE_ITEMS = 6;
export function DialogSearchList({ items, onSelect, onHighlight, filterFn, renderItem, getKey, placeholder = 'Search...', emptyText = 'No results' }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchValue, setSearchValue] = useState('');
  const { colors } = useTheme();
  const filtered = items.filter(item => filterFn(item, searchValue));
  const handleChange = useCallback((value) => {
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
  return (_jsxs(Box, { flexDirection: 'column', gap: 1, children: [_jsx(Box, { borderStyle: 'single', borderColor: colors.primary, paddingX: 1, children: _jsx(TextInput, { value: searchValue, onChange: handleChange, onSubmit: handleSubmit, placeholder: placeholder, focus: true }) }), filtered.length === 0 ? (_jsx(Text, { dimColor: true, children: emptyText })) : (_jsxs(Box, { flexDirection: 'column', children: [visible.map((item, i) => {
    const isSelected = i === selectedIndex;
    return (_jsx(Box, { flexDirection: 'row', children: renderItem(item, isSelected) }, getKey(item)));
  }), filtered.length > MAX_VISIBLE_ITEMS ? (_jsx(Text, { dimColor: true, children: `...${filtered.length - MAX_VISIBLE_ITEMS} more` })) : null] }))] }));
}

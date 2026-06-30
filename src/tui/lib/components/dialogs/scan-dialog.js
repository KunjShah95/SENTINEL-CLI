import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useCallback } from 'react';
import { Box, Text } from 'ink';
import { DialogSearchList } from '../dialog-search-list.js';
import { useTheme } from '../../providers/theme/index.js';
const SCAN_TARGETS = [
  { id: '.', label: 'Current directory', description: 'Scan entire project' },
  { id: 'src', label: 'Source code', description: 'Scan src/ directory' },
  { id: 'diff', label: 'Staged changes', description: 'Scan git diff only' },
  { id: 'custom', label: 'Custom path', description: 'Specify a path to scan' },
];
export function ScanDialogContent({ onSelect }) {
  const { colors } = useTheme();
  const handleSelect = useCallback((item) => {
    onSelect(item.id);
  }, [onSelect]);
  return (_jsx(DialogSearchList, { items: SCAN_TARGETS, onSelect: handleSelect, filterFn: (item, query) => item.label.toLowerCase().includes(query.toLowerCase()), renderItem: (item, isSelected) => (_jsxs(Box, { flexDirection: 'row', gap: 1, children: [_jsx(Text, { bold: isSelected, color: isSelected ? colors.selection : undefined, children: item.label }), _jsx(Text, { dimColor: true, children: item.description })] })), getKey: item => item.id, placeholder: 'Select scan target...', emptyText: 'No matching targets' }));
}

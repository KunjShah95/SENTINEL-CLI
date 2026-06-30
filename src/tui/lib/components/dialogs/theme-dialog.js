import { jsxs as _jsxs, jsx as _jsx } from 'react/jsx-runtime';
import { useCallback } from 'react';
import { Text } from 'ink';
import { DialogSearchList } from '../dialog-search-list.js';
import { useTheme } from '../../providers/theme/index.js';
import { useDialog } from '../../providers/dialog/index.js';
export function ThemeDialogContent() {
  const { themes, setTheme, theme: currentTheme } = useTheme();
  const dialog = useDialog();
  const handleSelect = useCallback((t) => {
    setTheme(t.name);
    dialog.close();
  }, [setTheme, dialog]);
  return (_jsx(DialogSearchList, { items: themes, onSelect: handleSelect, filterFn: (item, query) => item.name.toLowerCase().includes(query.toLowerCase()), renderItem: (item, isSelected) => (_jsxs(Text, { color: isSelected ? currentTheme.colors.selection : undefined, children: [item.name === currentTheme.name ? ' • ' : '   ', item.name] })), getKey: item => item.name, placeholder: 'Search themes...', emptyText: 'No matching themes' }));
}

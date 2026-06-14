import React, { useCallback } from 'react';
import { Text } from 'ink';
import { DialogSearchList } from '../dialog-search-list.js';
import { useTheme } from '../../providers/theme/index.js';
import { useDialog } from '../../providers/dialog/index.js';

export function ThemeDialogContent() {
  const { themes, setTheme, theme: currentTheme } = useTheme();
  const dialog = useDialog();

  const handleSelect = useCallback((t: (typeof themes)[0]) => {
    setTheme(t.name);
    dialog.close();
  }, [setTheme, dialog]);

  return (
    <DialogSearchList
      items={themes}
      onSelect={handleSelect}
      filterFn={(item, query) => item.name.toLowerCase().includes(query.toLowerCase())}
      renderItem={(item, isSelected) => (
        <Text color={isSelected ? currentTheme.colors.selection : undefined}>
          {item.name === currentTheme.name ? ' • ' : '   '}{item.name}
        </Text>
      )}
      getKey={item => item.name}
      placeholder="Search themes..."
      emptyText="No matching themes"
    />
  );
}

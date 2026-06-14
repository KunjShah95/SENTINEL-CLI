import React, { useCallback } from 'react';
import { Box, Text } from 'ink';
import { DialogSearchList } from '../dialog-search-list.js';
import { useTheme } from '../../providers/theme/index.js';

const SCAN_TARGETS = [
  { id: '.', label: 'Current directory', description: 'Scan entire project' },
  { id: 'src', label: 'Source code', description: 'Scan src/ directory' },
  { id: 'diff', label: 'Staged changes', description: 'Scan git diff only' },
  { id: 'custom', label: 'Custom path', description: 'Specify a path to scan' },
];

type Props = {
  onSelect: (target: string) => void;
};

export function ScanDialogContent({ onSelect }: Props) {
  const { colors } = useTheme();

  const handleSelect = useCallback(
    (item: (typeof SCAN_TARGETS)[0]) => {
      onSelect(item.id);
    },
    [onSelect]
  );

  return (
    <DialogSearchList
      items={SCAN_TARGETS}
      onSelect={handleSelect}
      filterFn={(item, query) =>
        item.label.toLowerCase().includes(query.toLowerCase())
      }
      renderItem={(item, isSelected) => (
        <Box flexDirection="row" gap={1}>
          <Text color={isSelected ? colors.selection : undefined} bold={isSelected}>
            {item.label}
          </Text>
          <Text dimColor>{item.description}</Text>
        </Box>
      )}
      getKey={(item) => item.id}
      placeholder="Select scan target..."
      emptyText="No matching targets"
    />
  );
}

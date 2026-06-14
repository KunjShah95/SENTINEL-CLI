import React, { useCallback } from 'react';
import { Box, Text } from 'ink';
import { DialogSearchList } from '../dialog-search-list.js';
import { useTheme } from '../../providers/theme/index.js';

const ANALYZER_MODES = [
  { id: 'quick', label: 'Quick scan', description: 'Fast analysis of recent changes' },
  { id: 'full', label: 'Full scan', description: 'Run all available analyzers' },
  { id: 'security', label: 'Security audit', description: 'Comprehensive security scan' },
  { id: 'frontend', label: 'Frontend', description: 'React + TypeScript + A11y' },
  { id: 'backend', label: 'Backend', description: 'Security + API + Performance' },
  { id: 'container', label: 'Container', description: 'Docker + K8s security' },
  { id: 'secrets', label: 'Secrets', description: 'Scan for secrets and sensitive data' },
  { id: 'lint', label: 'Lint', description: 'Run ESLint and code quality checks' },
  { id: 'complexity', label: 'Complexity', description: 'Analyze code complexity' },
  { id: 'best-practices', label: 'Best Practices', description: 'Check against best practices' },
  { id: 'multi-file', label: 'Multi-File', description: 'Cross-file dependency analysis' },
];

type Props = {
  onSelect: (mode: string) => void;
};

export function AnalyzeDialogContent({ onSelect }: Props) {
  const { colors } = useTheme();

  const handleSelect = useCallback(
    (item: (typeof ANALYZER_MODES)[0]) => {
      onSelect(item.id);
    },
    [onSelect]
  );

  return (
    <DialogSearchList
      items={ANALYZER_MODES}
      onSelect={handleSelect}
      filterFn={(item, query) =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.description.toLowerCase().includes(query.toLowerCase())
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
      placeholder="Search analyzers..."
      emptyText="No matching analyzers"
    />
  );
}

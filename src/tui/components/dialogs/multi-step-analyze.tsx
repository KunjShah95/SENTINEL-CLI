import React, { useCallback, useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../../providers/theme/index.js';
import { DialogSearchList } from '../dialog-search-list.js';
import { useDialog } from '../../providers/dialog/index.js';

const TARGETS = [
  { id: '.', label: 'Current directory', description: 'Scan entire project' },
  { id: 'src', label: 'Source code', description: 'Scan src/ directory' },
  { id: 'diff', label: 'Staged changes', description: 'Scan git diff only' },
];

const ANALYZERS = [
  { id: 'security', label: 'Security Audit', description: 'Vulnerabilities, injections, crypto' },
  { id: 'secrets', label: 'Secret Scanning', description: 'API keys, tokens, credentials' },
  { id: 'quality', label: 'Code Quality', description: 'Complexity, maintainability, style' },
  { id: 'bugs', label: 'Bug Detection', description: 'Null pointers, race conditions, errors' },
  { id: 'performance', label: 'Performance', description: 'Memory, N+1 queries, perf issues' },
  { id: 'dependency', label: 'Dependencies', description: 'Outdated/vulnerable packages' },
];

type Props = {
  onRun: (target: string, analyzers: string[]) => void;
};

export function MultiStepAnalyzeDialog({ onRun }: Props) {
  const { colors } = useTheme();
  const { close } = useDialog();
  const [step, setStep] = useState<'target' | 'input' | 'confirm'>('target');
  const [target, setTarget] = useState('.');
  const [analyzersInput, setAnalyzersInput] = useState('security, quality, bugs');
  const [customPath, setCustomPath] = useState('');

  const handleTargetSelect = useCallback((item: (typeof TARGETS)[0]) => {
    setTarget(item.id);
    setStep('input');
  }, []);

  const handleAnalyzersSubmit = useCallback(
    (value: string) => {
      const raw = value || analyzersInput;
      const selected = raw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      if (selected.length > 0) {
        setAnalyzersInput(raw);
        setStep('confirm');
      }
    },
    [analyzersInput]
  );

  const handleConfirm = useCallback(
    (_value: string) => {
      const selected = analyzersInput
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      onRun(customPath || target, selected.length > 0 ? selected : ['security', 'quality', 'bugs']);
      close();
    },
    [target, analyzersInput, customPath, onRun, close]
  );

  if (step === 'target') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>{'Step 1: Select Target'}</Text>
        <Text dimColor>{'What files do you want to analyze?'}</Text>
        <DialogSearchList
          items={TARGETS}
          onSelect={handleTargetSelect}
          filterFn={(item, q) => item.label.toLowerCase().includes(q.toLowerCase())}
          renderItem={(item, isSelected) => (
            <Box flexDirection="row" gap={1}>
              <Text color={isSelected ? colors.selection : undefined} bold={isSelected}>
                {item.label}
              </Text>
              <Text dimColor>{item.description}</Text>
            </Box>
          )}
          getKey={item => item.id}
          placeholder="Search targets..."
          emptyText="No matching targets"
        />
        <Box flexDirection="row" gap={1} paddingTop={1}>
          <Text dimColor>{'Press Enter to select, Esc to cancel'}</Text>
        </Box>
      </Box>
    );
  }

  if (step === 'input') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>{'Step 2: Select Analyzers'}</Text>
        <Text dimColor>{'Enter comma-separated analyzer names (or press Enter for defaults):'}</Text>
        <Box flexDirection="column" gap={1} paddingY={1}>
          {ANALYZERS.map(a => (
            <Box key={a.id} flexDirection="row" gap={1}>
              <Text color={colors.primary}>{'●'}</Text>
              <Text bold>{a.label}</Text>
              <Text dimColor>{a.description}</Text>
            </Box>
          ))}
        </Box>
        <TextInput
          value={analyzersInput}
          onChange={setAnalyzersInput}
          onSubmit={handleAnalyzersSubmit}
          placeholder="security, quality, bugs"
        />
        <Text dimColor>{'Default: security, quality, bugs'}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{'Step 3: Confirm & Run'}</Text>
      <Box flexDirection="column" gap={1} paddingY={1}>
        <Box flexDirection="row" gap={1}>
          <Text bold>{'Target:'}</Text>
          <Text>{customPath || target}</Text>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text bold>{'Analyzers:'}</Text>
          <Text>{analyzersInput}</Text>
        </Box>
      </Box>
      <TextInput
        value=""
        onChange={() => {}}
        onSubmit={handleConfirm}
        placeholder="Press Enter to run, Esc to cancel"
      />
    </Box>
  );
}

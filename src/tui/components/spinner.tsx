import React from 'react';
import { Box, Text } from 'ink';
import InkSpinner from 'ink-spinner';

type Mode = 'BUILD' | 'PLAN' | 'REVIEW' | 'SCAN' | 'FIX';
type Props = { mode?: Mode; label?: string };

const MODE_COLOR: Record<Mode, string> = {
  BUILD: '#00D4AA', PLAN: '#7C3AED', REVIEW: '#DC2626', SCAN: '#F59E0B', FIX: '#EF4444',
};

const MODE_LABEL: Record<Mode, string> = {
  BUILD: 'Thinking', PLAN: 'Planning', REVIEW: 'Analyzing', SCAN: 'Scanning', FIX: 'Fixing',
};

export function Spinner({ mode = 'BUILD', label }: Props) {
  const color = MODE_COLOR[mode];
  const text = label ?? `${MODE_LABEL[mode]}...`;
  return (
    <Box flexDirection="row" gap={1} paddingLeft={4}>
      <Text color={color}><InkSpinner type="dots" /></Text>
      <Text dimColor>{text}</Text>
    </Box>
  );
}

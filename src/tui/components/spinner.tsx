import React from 'react';
import { Text } from 'ink';
import InkSpinner from 'ink-spinner';

type Mode = 'BUILD' | 'PLAN' | 'REVIEW' | 'SCAN' | 'FIX';
type Props = { mode?: Mode };

export function Spinner({ mode = 'BUILD' }: Props) {
  const color = mode === 'PLAN' ? '#7C3AED' : mode === 'REVIEW' ? '#EF4444' : '#00D4AA';
  return (
    <Text color={color}>
      <InkSpinner type="dots" />
      {` ${mode === 'REVIEW' ? 'Analyzing...' : 'Thinking...'}`}
    </Text>
  );
}

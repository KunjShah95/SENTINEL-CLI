import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../providers/theme/index.js';

type Props = { message: string; mode?: 'BUILD' | 'PLAN' | 'REVIEW' | 'SCAN' | 'FIX' };

export function UserMessage({ message, mode = 'BUILD' }: Props) {
  const { colors } = useTheme();
  const borderColor =
    mode === 'PLAN'
      ? colors.planMode
      : mode === 'REVIEW'
        ? colors.warning || colors.planMode
        : colors.primary;
  return (
    <Box width="100%" flexDirection="column">
      <Box
        borderStyle="single"
        borderColor={borderColor}
        width="100%"
        paddingX={2}
        paddingY={0}
      >
        <Text dimColor>{message}</Text>
      </Box>
    </Box>
  );
}

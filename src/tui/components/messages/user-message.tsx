import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../providers/theme/index.js';

type Mode = 'BUILD' | 'PLAN' | 'REVIEW' | 'SCAN' | 'FIX';
type Props = { message: string; mode?: Mode };

const MODE_COLOR_KEY: Record<Mode, string> = {
  BUILD: 'success', PLAN: 'planMode', REVIEW: 'critical', SCAN: 'warning', FIX: 'error',
};

export function UserMessage({ message, mode = 'BUILD' }: Props) {
  const { colors } = useTheme();
  const modeColor = (colors as any)[MODE_COLOR_KEY[mode]] ?? colors.primary;

  return (
    <Box flexDirection="column" marginY={1} paddingLeft={2}>
      {/* Header */}
      <Box flexDirection="row" gap={1} marginBottom={1}>
        <Text bold color={colors.primary}>{'▶'}</Text>
        <Text bold color={colors.primary}>{'You'}</Text>
        <Text dimColor>{'·'}</Text>
        <Text bold color={modeColor}>{mode}</Text>
      </Box>
      {/* Content */}
      <Box paddingLeft={4}>
        <Text>{message}</Text>
      </Box>
    </Box>
  );
}

import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../providers/theme/index.js';

type Props = { message: string };

export function ErrorMessage({ message }: Props) {
  const { colors } = useTheme();
  return (
    <Box flexDirection="column" marginY={1} paddingLeft={2}>
      <Box flexDirection="row" gap={1} marginBottom={1}>
        <Text bold color={colors.error}>{'✗'}</Text>
        <Text bold color={colors.error}>{'Error'}</Text>
      </Box>
      <Box paddingLeft={4}>
        <Text color={colors.error}>{message}</Text>
      </Box>
    </Box>
  );
}

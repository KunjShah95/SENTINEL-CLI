import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../providers/theme/index.js';

type Props = { message: string };

export function ErrorMessage({ message }: Props) {
  const { colors } = useTheme();
  return (
    <Box width="100%" alignItems="center">
      <Box borderStyle="single" borderColor={colors.error} width="100%" paddingX={2} paddingY={0}>
        <Text dimColor>{message}</Text>
      </Box>
    </Box>
  );
}

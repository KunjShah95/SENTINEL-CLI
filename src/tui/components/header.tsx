import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../providers/theme/index.js';

export function Header() {
  const { colors } = useTheme();
  return (
    <Box justifyContent="center" alignItems="center" paddingY={1}>
      <Box flexDirection="column" alignItems="center">
        <Text bold color={colors.primary}>{'SENTINEL'}</Text>
        <Text dimColor>{'AI-Powered Code Guardian'}</Text>
      </Box>
    </Box>
  );
}

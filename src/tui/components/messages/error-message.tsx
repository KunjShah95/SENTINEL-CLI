import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../providers/theme/index.js';

type Props = { message: string };

export function ErrorMessage({ message }: Props) {
  const { colors } = useTheme();
  return (
    <Box width="100%" paddingY={1} paddingX={1}>
      <Box borderStyle="single" borderColor={colors.error} paddingX={2} paddingY={1} width="100%">
        <Text color={colors.error} dimColor>
          {`Error: ${message}`}
        </Text>
      </Box>
    </Box>
  );
}

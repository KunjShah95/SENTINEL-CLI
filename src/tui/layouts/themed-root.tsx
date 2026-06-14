import React, { type ReactNode } from 'react';
import { Box } from 'ink';
import { useTheme } from '../providers/theme/index.js';

type Props = { children: ReactNode };

export function ThemedRoot({ children }: Props) {
  const { colors } = useTheme();
  return (
    <Box width="100%" flexGrow={1} flexDirection="column">
      {children}
    </Box>
  );
}

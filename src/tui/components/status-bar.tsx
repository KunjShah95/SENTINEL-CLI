import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../providers/theme/index.js';

type Mode = 'BUILD' | 'PLAN' | 'REVIEW' | 'SCAN' | 'FIX';
type Props = { mode?: Mode; model?: string; statusText?: string };

function getBadgeColor(mode: Mode, colors: any): string {
  switch (mode) {
    case 'BUILD': return colors.success;
    case 'PLAN': return colors.planMode;
    case 'REVIEW': return colors.warning;
    case 'SCAN': return colors.info;
    case 'FIX': return colors.error;
    default: return colors.primary;
  }
}

export function StatusBar({ mode = 'BUILD', model = 'Sentinel AI', statusText }: Props) {
  const { colors } = useTheme();
  const badgeColor = getBadgeColor(mode, colors);
  return (
    <Box flexDirection="row" gap={1} paddingLeft={1}>
      <Text bold color={badgeColor}>{`[${mode}]`}</Text>
      <Text dimColor>{'›'}</Text>
      <Text>{model}</Text>
      {statusText ? (
        <>
          <Text dimColor>{'|'}</Text>
          <Text dimColor>{statusText}</Text>
        </>
      ) : null}
    </Box>
  );
}

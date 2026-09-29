import React from 'react';
import { Text } from 'ink';
import { useTheme } from '../../providers/theme/index.js';
import { LeftBar } from '../oc/primitives.js';

type Props = { message: string };

/** opencode assistant error: red left bar, muted message on the panel. */
export function ErrorMessage({ message }: Props) {
  const { colors } = useTheme();
  return (
    <LeftBar color={colors.error} background={colors.backgroundPanel}>
      <Text color={colors.textMuted} wrap="wrap">{message}</Text>
    </LeftBar>
  );
}

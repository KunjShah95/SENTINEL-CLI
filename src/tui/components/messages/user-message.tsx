import React from 'react';
import { Text } from 'ink';
import { useTheme } from '../../providers/theme/index.js';
import { modeColor } from '../../theme.js';
import { LeftBar } from '../oc/primitives.js';

type Props = { message: string; mode?: string; queued?: boolean };

/**
 * opencode UserMessage: a left "┃" bar in the agent color over the panel
 * background. Steering messages (sent mid-turn, prefixed "↪") show a
 * QUEUED-style badge like opencode's pending prompts.
 */
export function UserMessage({ message, mode = 'BUILD', queued }: Props) {
  const { colors } = useTheme();
  const color = modeColor(colors, mode);
  const steering = queued ?? message.startsWith('↪ ');
  const text = steering ? message.replace(/^↪ /, '') : message;
  return (
    <LeftBar color={color} background={colors.backgroundPanel}>
      <Text color={colors.text} wrap="wrap">{text}</Text>
      {steering ? (
        <Text>
          <Text backgroundColor={color} color={colors.background} bold>{' STEER '}</Text>
          <Text color={colors.textMuted}>{' delivered to the running turn'}</Text>
        </Text>
      ) : null}
    </LeftBar>
  );
}

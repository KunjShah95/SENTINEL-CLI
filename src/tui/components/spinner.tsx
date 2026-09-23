import React from 'react';
import { Box, Text } from 'ink';

type Mode = 'BUILD' | 'PLAN' | 'REVIEW' | 'SCAN' | 'FIX';
type Props = { mode?: Mode; label?: string };

const MODE_COLOR: Record<Mode, string> = {
  BUILD: '#00D4AA', PLAN: '#7C3AED', REVIEW: '#DC2626', SCAN: '#F59E0B', FIX: '#EF4444',
};

const MODE_LABEL: Record<Mode, string> = {
  BUILD: 'Thinking', PLAN: 'Planning', REVIEW: 'Analyzing', SCAN: 'Scanning', FIX: 'Fixing',
};

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Zero-dependency spinner (replaces ink-spinner, which was removed). */
export function Spinner({ mode = 'BUILD', label }: Props) {
  const [frame, setFrame] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 80);
    return () => clearInterval(t);
  }, []);
  const color = MODE_COLOR[mode];
  const text = label ?? `${MODE_LABEL[mode]}...`;
  return (
    <Box flexDirection="row" gap={1} paddingLeft={4}>
      <Text color={color}>{FRAMES[frame]}</Text>
      <Text dimColor>{text}</Text>
    </Box>
  );
}

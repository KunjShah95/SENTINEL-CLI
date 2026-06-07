import { useEffect, useState } from 'react';
import { useTheme } from '../providers/theme';

export type Mode = 'BUILD' | 'PLAN' | 'REVIEW' | 'SCAN' | 'FIX';

const FRAMES = ['\u25D0', '\u25D3', '\u25D1', '\u25D2'];

type Props = { mode?: Mode };

export function Spinner({ mode = 'BUILD' }: Props) {
  const { colors } = useTheme();
  const [frame, setFrame] = useState(0);
  const activeColor =
    mode === 'PLAN'
      ? colors.planMode
      : mode === 'REVIEW'
        ? colors.warning || colors.planMode
        : colors.primary;

  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % FRAMES.length), 120);
    return () => clearInterval(id);
  }, []);

  return (
    <box flexDirection="row" gap={1}>
      <text fg={activeColor}>{FRAMES[frame]}</text>
      <text fg={activeColor}>Processing...</text>
    </box>
  );
}

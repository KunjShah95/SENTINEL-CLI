import React, { useCallback, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../providers/theme/index.js';

type Mode = 'BUILD' | 'PLAN' | 'REVIEW' | 'SCAN' | 'FIX';
type Props = {
  onSubmit: (value: string) => void;
  onCommand?: (command: string) => void;
  onSlashCommand?: () => void;
  disabled?: boolean;
  placeholder?: string;
  mode?: Mode;
  onModeToggle?: () => void;
  onCommandPalette?: () => void;
};

export function InputBar({ onSubmit, onCommand, onSlashCommand, disabled = false, placeholder = 'Ask Sentinel...', mode = 'BUILD', onModeToggle, onCommandPalette }: Props) {
  const [value, setValue] = useState('');
  const { colors } = useTheme();
  const activeColor = mode === 'PLAN' ? colors.planMode : mode === 'REVIEW' ? colors.critical : colors.primary;

  useInput((input, key) => {
    if (key.tab) { onModeToggle?.(); return; }
    if (key.ctrl && input === 'p') { onCommandPalette?.(); }
  });

  const handleSubmit = useCallback((submitted: string) => {
    const trimmed = submitted.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('/')) {
      if (onSlashCommand) { onSlashCommand(); return; }
      if (onCommand) { onCommand(trimmed); return; }
    }
    onSubmit(trimmed);
    setValue('');
  }, [onSubmit, onCommand, onSlashCommand]);

  return (
    <Box flexDirection="row" borderStyle="single" borderColor={activeColor} paddingX={1}>
      <Text color={activeColor}>{`[${mode}] `}</Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder={disabled ? 'Processing...' : placeholder}
        focus={!disabled}
      />
    </Box>
  );
}

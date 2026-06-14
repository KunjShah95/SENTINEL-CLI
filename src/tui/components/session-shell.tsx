import React, { type ReactNode } from 'react';
import { Box, Text } from 'ink';
import { InputBar } from './input-bar.js';
import { Spinner } from './spinner.js';
import { StatusBar } from './status-bar.js';

type Mode = 'BUILD' | 'PLAN' | 'REVIEW' | 'SCAN' | 'FIX';
type Props = {
  children: ReactNode;
  onSubmit: (value: string) => void;
  onCommand?: (command: string) => void;
  onSlashCommand?: () => void;
  inputDisabled?: boolean;
  loading?: boolean;
  mode?: Mode;
  onModeToggle?: () => void;
  onCommandPalette?: () => void;
  model?: string;
  statusText?: string;
};

export function SessionShell({ children, onSubmit, onCommand, onSlashCommand, inputDisabled = false, loading = false, mode = 'BUILD', onModeToggle, onCommandPalette, model, statusText }: Props) {
  return (
    <Box flexDirection="column" flexGrow={1} width="100%" paddingY={1} paddingX={2} gap={1}>
      <Box flexGrow={1} flexDirection="column" overflow="hidden">
        {children}
      </Box>
      {loading ? (
        <Box flexShrink={0} paddingLeft={1}>
          <Spinner mode={mode} />
        </Box>
      ) : null}
      <Box flexShrink={0}>
        <InputBar
          onSubmit={onSubmit}
          onCommand={onCommand}
          onSlashCommand={onSlashCommand}
          disabled={inputDisabled}
          mode={mode}
          onModeToggle={onModeToggle}
          onCommandPalette={onCommandPalette}
        />
      </Box>
      <Box flexShrink={0} flexDirection="row" justifyContent="space-between">
        <StatusBar mode={mode} model={model} statusText={statusText} />
        <Text dimColor>{'Tab:Mode  Ctrl+P:Commands'}</Text>
      </Box>
    </Box>
  );
}

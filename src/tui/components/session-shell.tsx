import React, { type ReactNode } from 'react';
import { Box, Text } from 'ink';
import { InputBar } from './input-bar.js';
import { Spinner } from './spinner.js';
import { StatusBar } from './status-bar.js';
import { useTheme } from '../providers/theme/index.js';

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
  sessionId?: string;
  tokenUsage?: { estimated: number; limit: number; percentage: number };
  compacting?: boolean;
  serverStatus?: 'connected' | 'local';
};

export function SessionShell({
  children,
  onSubmit,
  onCommand,
  onSlashCommand,
  inputDisabled = false,
  loading = false,
  mode = 'BUILD',
  onModeToggle,
  onCommandPalette,
  model,
  statusText,
  sessionId,
  tokenUsage,
  compacting,
  serverStatus,
}: Props) {
  const { colors } = useTheme();

  return (
    <Box flexDirection="column" flexGrow={1} width="100%">
      {/* Thin header line */}
      <Box
        flexDirection="row"
        paddingX={2}
        borderStyle="single"
        borderColor={colors.dimSeparator}
        gap={2}
      >
        <Text bold color={colors.primary}>{'◆ SENTINEL'}</Text>
        <Text color={colors.dimSeparator}>{'│'}</Text>
        {model ? <Text dimColor>{model.replace('claude-', '').replace('-latest', '')}</Text> : null}
        <Text color={colors.dimSeparator}>{'│'}</Text>
        <Text bold color={
          mode === 'REVIEW' ? colors.critical :
          mode === 'PLAN'   ? colors.planMode  :
          mode === 'SCAN'   ? colors.warning   :
          mode === 'FIX'    ? colors.error     : colors.success
        }>{mode}</Text>
        {statusText && (
          <>
            <Text color={colors.dimSeparator}>{'│'}</Text>
            <Text dimColor>{statusText}</Text>
          </>
        )}
      </Box>

      {/* Message area */}
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {children}
      </Box>

      {/* Spinner shown while loading */}
      {loading ? (
        <Box flexShrink={0}>
          <Spinner mode={mode} />
        </Box>
      ) : null}

      {/* Input bar */}
      <Box flexShrink={0} paddingX={1}>
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

      {/* Status bar */}
      <Box flexShrink={0}>
        <StatusBar
          mode={mode}
          model={model}
          statusText={statusText}
          sessionId={sessionId}
          tokenUsage={tokenUsage}
          compacting={compacting}
          serverStatus={serverStatus}
        />
      </Box>
    </Box>
  );
}

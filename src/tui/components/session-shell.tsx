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
  onShellCommand?: (command: string) => void;
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
  costUsd?: number;
  showThinking?: boolean;
  showDetails?: boolean;
};

export function SessionShell({
  children,
  onSubmit,
  onCommand,
  onSlashCommand,
  onShellCommand,
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
  costUsd,
  showThinking = true,
  showDetails = true,
}: Props) {
  const { colors } = useTheme();

  const modeColor =
    mode === 'BUILD'  ? colors.success   :
    mode === 'PLAN'   ? colors.planMode  :
    mode === 'REVIEW' ? colors.critical  :
    mode === 'SCAN'   ? colors.warning   : colors.error;

  const shortModel = model
    ? model.replace('claude-', '').replace('gpt-4', 'gpt4').replace('-latest', '')
    : null;

  return (
    <Box flexDirection="column" flexGrow={1} width="100%">
      {/* Header */}
      <Box
        flexDirection="row"
        paddingX={2}
        paddingY={0}
        alignItems="center"
        gap={2}
      >
        <Text color={colors.dimSeparator}>{'◈'}</Text>
        {shortModel ? <Text dimColor>{shortModel}</Text> : null}
        <Text bold color={modeColor}>{mode}</Text>
        {compacting && <Text color={colors.warning}>{'⟳ compacting…'}</Text>}
        {statusText && <Text dimColor>{statusText}</Text>}
        {serverStatus === 'connected' && <Text color={colors.success}>{'⬤'}</Text>}
        <Box flexGrow={1} />
      </Box>

      <Box flexShrink={0}><Text color={colors.dimSeparator}>{'─'.repeat(80)}</Text></Box>

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
          onShellCommand={onShellCommand}
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
          costUsd={costUsd}
          showThinking={showThinking}
          showDetails={showDetails}
        />
      </Box>
    </Box>
  );
}

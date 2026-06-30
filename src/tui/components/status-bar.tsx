import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../providers/theme/index.js';

type Mode = 'BUILD' | 'PLAN' | 'REVIEW' | 'SCAN' | 'FIX';
type Props = {
  mode?: Mode;
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

function useGitBranch() {
  const [branch, setBranch] = useState('');
  useEffect(() => {
    import('child_process').then(({ execSync }) => {
      try { setBranch(execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', { encoding: 'utf-8' }).trim()); } catch {}
    });
  }, []);
  return branch;
}

function Pipe({ colors }: { colors: any }) {
  return <Text color={colors.dimSeparator}>{' · '}</Text>;
}

export function StatusBar({ mode = 'BUILD', model, statusText, sessionId, tokenUsage, compacting, serverStatus, costUsd, showThinking = true, showDetails = true }: Props) {
  const { colors } = useTheme();
  const branch = useGitBranch();

  const modeColor =
    mode === 'BUILD'  ? colors.success   :
    mode === 'PLAN'   ? colors.planMode  :
    mode === 'REVIEW' ? colors.critical  :
    mode === 'SCAN'   ? colors.warning   : colors.error;

  const [provider, modelName] = model ? (model.includes('/') ? model.split('/') : [null, model]) : [null, null];
  const shortModel = modelName
    ? modelName.replace('claude-', '').replace('-latest', '').replace('gpt-4', 'gpt4')
    : null;

  return (
    <Box
      flexDirection="row"
      borderStyle="single"
      borderColor={colors.dimSeparator}
      paddingX={1}
      width="100%"
      alignItems="center"
      minHeight={1}
    >
      <Text bold color={modeColor}>{mode}</Text>

      {shortModel && (
        <><Pipe colors={colors} /><Text dimColor>{shortModel}</Text></>
      )}

      {branch && (
        <><Pipe colors={colors} /><Text dimColor>{branch}</Text></>
      )}

      {sessionId && (
        <><Pipe colors={colors} /><Text dimColor>{'#'}{sessionId.slice(0, 8)}</Text></>
      )}

      {compacting && (
        <><Pipe colors={colors} /><Text color={colors.warning}>{'⟳ compacting…'}</Text></>
      )}

      {!showThinking && <><Pipe colors={colors} /><Text color={colors.thinking}>{'thinking⊘'}</Text></>}
      {!showDetails && <><Pipe colors={colors} /><Text color={colors.info}>{'details⊘'}</Text></>}

      <Box flexGrow={1} />

      {serverStatus === 'connected' && <Text dimColor color={colors.success}>{'⬤'}</Text>}
      {serverStatus === 'local' && <Text dimColor color={colors.warning}>{'◌'}</Text>}

      <Text dimColor>{'  ? help'}</Text>
    </Box>
  );
}

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
};

const MODE_SYMBOL: Record<Mode, string> = {
  BUILD: '⬡ BUILD', PLAN: '◎ PLAN', REVIEW: '⊕ REVIEW', SCAN: '◈ SCAN', FIX: '⚙ FIX',
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
  return <Text color={colors.dimSeparator}>{' │ '}</Text>;
}

export function StatusBar({ mode = 'BUILD', model, statusText, sessionId, tokenUsage, compacting, serverStatus }: Props) {
  const { colors } = useTheme();
  const branch = useGitBranch();

  const modeColor =
    mode === 'BUILD'  ? colors.success   :
    mode === 'PLAN'   ? colors.planMode  :
    mode === 'REVIEW' ? colors.critical  :
    mode === 'SCAN'   ? colors.warning   : colors.error;

  const shortModel = model
    ? model.replace('claude-', '').replace('-latest', '').replace('gpt-4', 'gpt4')
    : null;

  return (
    <Box
      flexDirection="row"
      borderStyle="single"
      borderColor={colors.dimSeparator}
      paddingX={1}
      width="100%"
      alignItems="center"
    >
      <Text bold color={modeColor}>{MODE_SYMBOL[mode]}</Text>

      {shortModel && (<><Pipe colors={colors} /><Text dimColor>{shortModel}</Text></>)}

      {branch && (
        <>
          <Pipe colors={colors} />
          <Text color={colors.info}>{'⎇ '}</Text>
          <Text dimColor>{branch}</Text>
        </>
      )}

      {sessionId && (
        <>
          <Pipe colors={colors} />
          <Text dimColor>{'#'}{sessionId.slice(0, 8)}</Text>
        </>
      )}

      {statusText && (
        <>
          <Pipe colors={colors} />
          <Text dimColor>{statusText}</Text>
        </>
      )}

      {compacting && (
        <>
          <Pipe colors={colors} />
          <Text color={colors.warning}>{'⟳ compacting…'}</Text>
        </>
      )}

      {tokenUsage && tokenUsage.estimated > 0 && (
        <>
          <Pipe colors={colors} />
          <Text color={
            tokenUsage.percentage >= 80 ? colors.error :
            tokenUsage.percentage >= 60 ? colors.warning : colors.dimSeparator
          }>
            {`~${(tokenUsage.estimated / 1000).toFixed(1)}k/${(tokenUsage.limit / 1000).toFixed(0)}k tok`}
          </Text>
        </>
      )}

      {serverStatus && (
        <>
          <Pipe colors={colors} />
          <Text color={serverStatus === 'connected' ? colors.success : colors.warning}>
            {serverStatus === 'connected' ? '⬤ server' : '◌ local'}
          </Text>
        </>
      )}

      <Box flexGrow={1} />
      <Text dimColor>{'Ctrl+P commands · Tab mode'}</Text>
    </Box>
  );
}

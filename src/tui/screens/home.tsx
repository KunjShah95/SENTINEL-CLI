import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../providers/theme/index.js';
import { useNavigate } from 'react-router';

type Mode = 'BUILD' | 'PLAN' | 'REVIEW' | 'SCAN' | 'FIX';

const MODES: Mode[] = ['BUILD', 'PLAN', 'REVIEW', 'SCAN', 'FIX'];

const MODE_COLOR_MAP: Record<Mode, string> = {
  BUILD: 'success', PLAN: 'planMode', REVIEW: 'critical', SCAN: 'warning', FIX: 'error',
};

function useGitInfo() {
  const [info, setInfo] = useState('');
  useEffect(() => {
    import('child_process').then(({ execSync }) => {
      try {
        const branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', { encoding: 'utf-8' }).trim();
        const commit = execSync('git rev-parse --short HEAD 2>/dev/null', { encoding: 'utf-8' }).trim();
        if (branch) setInfo(`${branch} @ ${commit}`);
      } catch {}
    });
  }, []);
  return info;
}

export function Home() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('BUILD');
  const [inputValue, setInputValue] = useState('');
  const { colors } = useTheme();
  const { exit } = useApp();
  const gitInfo = useGitInfo();

  const modeColor = (colors as any)[MODE_COLOR_MAP[mode]] ?? colors.primary;

  const handleSubmit = useCallback((value: string) => {
    if (!value.trim()) return;
    const lower = value.toLowerCase().trim().replace(/^\//, '');
    if (lower === 'review')    { navigate('/review'); return; }
    if (lower === 'loop')      { navigate('/loop'); return; }
    if (lower === 'dashboard') { navigate('/dashboard'); return; }
    navigate('/session', { state: { message: value, mode } });
    setInputValue('');
  }, [navigate, mode]);

  useInput((input, key) => {
    if (key.ctrl && input === 'r') { navigate('/review'); return; }
    if (key.ctrl && input === 'l') { navigate('/loop'); return; }
    if (key.ctrl && input === 'd') { navigate('/dashboard'); return; }
    if (key.ctrl && input === 'c') { exit(); return; }
    if (key.tab) {
      setMode(prev => MODES[(MODES.indexOf(prev) + 1) % MODES.length]);
    }
  });

  const cwd = process.cwd().replace(process.env.HOME || '', '~');

  return (
    <Box flexDirection="column" width="100%" paddingX={2}>
      {/* Spacer */}
      <Box height={2} />

      {/* Brand */}
      <Box flexDirection="column" alignItems="center" marginBottom={1}>
        <Text bold color={colors.primary}>{'◈ Sentinel'}</Text>
        <Text dimColor>{'AI-Powered Security & Code Analysis'}</Text>
        <Box height={1} />
        <Text dimColor>{cwd}</Text>
        {gitInfo && <Text dimColor color={colors.info}>{gitInfo}</Text>}
      </Box>

      {/* Spacer */}
      <Box height={2} />

      {/* Mode selector */}
      <Box flexDirection="row" justifyContent="center" gap={3} marginBottom={1}>
        {MODES.map(m => (
          <Text
            key={m}
            bold={m === mode}
            color={m === mode ? (colors as any)[MODE_COLOR_MAP[m]] : colors.dimSeparator}
          >
            {m}
          </Text>
        ))}
      </Box>

      {/* Input */}
      <Box paddingX={4}>
        <Box
          flexDirection="row"
          borderStyle="round"
          borderColor={modeColor}
          paddingX={2}
          width="100%"
        >
          <Text bold color={modeColor}>{mode.slice(0, 1)}</Text>
          <TextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            placeholder="Ask anything, or type /command..."
          />
        </Box>
      </Box>

      {/* Spacer */}
      <Box height={1} />

      {/* Hints */}
      <Box flexDirection="row" justifyContent="center" gap={4}>
        <Text dimColor>{'/review'}</Text>
        <Text dimColor>{'/loop'}</Text>
        <Text dimColor>{'/dashboard'}</Text>
        <Text dimColor>{'Tab mode'}</Text>
        <Text dimColor>{'Ctrl+C exit'}</Text>
      </Box>

      {/* Fill remaining space */}
      <Box flexGrow={1} />
    </Box>
  );
}

import React, { useCallback, useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../providers/theme/index.js';
import { useNavigate } from 'react-router';

type Mode = 'BUILD' | 'PLAN' | 'REVIEW' | 'SCAN' | 'FIX';

const QUICK_ACTIONS = [
  { cmdKey: 'review', description: 'CodeRabbit-style security review of git diff', color: '#DC2626' },
  { cmdKey: 'loop', description: 'Loop Engine — review/watch/pipeline/CI loops', color: '#7C3AED' },
  { cmdKey: 'analyze', description: 'Analyze code for issues', color: '#60A5FA' },
  { cmdKey: 'full-scan', description: 'Run all available analyzers', color: '#F59E0B' },
  { cmdKey: 'security', description: 'Comprehensive security audit', color: '#EF4444' },
  { cmdKey: 'diff', description: 'Review staged changes', color: '#34D399' },
  { cmdKey: 'agents', description: 'Run multi-agent pipeline', color: '#A78BFA' },
  { cmdKey: 'fix', description: 'Auto-fix detected issues', color: '#10B981' },
  { cmdKey: 'status', description: 'Show system status', color: '#88C0D0' },
  { cmdKey: 'help', description: 'Show available commands', color: '#81A1C1' },
];

export function Home() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('BUILD');
  const [inputValue, setInputValue] = useState('');
  const { colors } = useTheme();
  const { exit } = useApp();

  const handleSubmit = useCallback((value: string) => {
    if (!value.trim()) return;
    const lower = value.toLowerCase().trim();
    if (lower === '/review' || lower === 'review') { navigate('/review'); return; }
    if (lower === '/loop' || lower === 'loop') { navigate('/loop'); return; }
    if (lower === '/dashboard' || lower === 'dashboard') { navigate('/dashboard'); return; }
    navigate('/session', { state: { message: value, mode } });
    setInputValue('');
  }, [navigate, mode]);

  useInput((input, key) => {
    if (key.ctrl && input === 'r') { navigate('/review'); return; }
    if (key.ctrl && input === 'l') { navigate('/loop'); return; }
    if (key.ctrl && input === 'c') { exit(); return; }
    if (key.tab) {
      setMode(prev => {
        const modes: Mode[] = ['BUILD', 'PLAN', 'REVIEW', 'SCAN', 'FIX'];
        return modes[(modes.indexOf(prev) + 1) % modes.length];
      });
    }
  });

  const modeColor = mode === 'REVIEW' ? colors.critical
    : mode === 'PLAN' ? colors.planMode
    : mode === 'SCAN' ? colors.warning
    : mode === 'FIX' ? colors.error
    : colors.primary;

  return (
    <Box flexDirection="column" padding={2}>
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color={colors.primary}>{'SENTINEL  '}</Text>
        <Text dimColor>{'AI-Powered Security Code Guardian'}</Text>
      </Box>

      <Box flexDirection="row" gap={2} marginBottom={1}>
        <Box borderStyle="round" borderColor={colors.critical} paddingX={2} flexGrow={1}>
          <Text bold color={colors.critical}>{'🔴 SECURITY REVIEW  '}</Text>
          <Text color={colors.primary}>{'CodeRabbit-style AI review  '}</Text>
          <Text dimColor>{'Ctrl+R  /review'}</Text>
        </Box>
        <Box borderStyle="round" borderColor="#7C3AED" paddingX={2} flexGrow={1}>
          <Text bold color="#7C3AED">{'⟳ LOOP ENGINE  '}</Text>
          <Text color={colors.primary}>{'Auto-review/fix/CI loops  '}</Text>
          <Text dimColor>{'Ctrl+L  /loop'}</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {QUICK_ACTIONS.map(a => (
          <Box key={a.cmdKey} flexDirection="row" gap={1}>
            <Text color={a.color}>{`/${a.cmdKey.padEnd(12)}`}</Text>
            <Text dimColor>{a.description}</Text>
          </Box>
        ))}
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>{'Mode: '}</Text>
        <Text bold color={modeColor}>{mode}</Text>
        <Text dimColor>{'  Tab to cycle  Ctrl+R: review  Ctrl+L: loop engine'}</Text>
      </Box>

      <Box borderStyle="single" borderColor={modeColor} paddingX={1}>
        <Text color={modeColor}>{`[${mode}] `}</Text>
        <TextInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          placeholder="Type a message or /command..."
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>{'Ctrl+P: commands  Tab: mode  Ctrl+R: review  Ctrl+L: loop  Ctrl+C: exit'}</Text>
      </Box>
    </Box>
  );
}

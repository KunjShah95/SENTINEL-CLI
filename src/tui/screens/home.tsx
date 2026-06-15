import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../providers/theme/index.js';
import { useNavigate } from 'react-router';

type Mode = 'BUILD' | 'PLAN' | 'REVIEW' | 'SCAN' | 'FIX';

const MODES: Mode[] = ['BUILD', 'PLAN', 'REVIEW', 'SCAN', 'FIX'];

const QUICK_ACTIONS = [
  { key: 'review',   icon: '⊕', desc: 'CodeRabbit-style security review of git diff',  color: '#DC2626', nav: '/review' },
  { key: 'loop',     icon: '⟳', desc: 'Loop Engine — agentic review/watch/pipeline',    color: '#7C3AED', nav: '/loop'   },
  { key: 'analyze',  icon: '◈', desc: 'Analyze code for issues',                        color: '#60A5FA', nav: null      },
  { key: 'full-scan',icon: '⬡', desc: 'Run all available analyzers',                    color: '#F59E0B', nav: null      },
  { key: 'diff',     icon: '±', desc: 'Review staged changes',                          color: '#34D399', nav: null      },
  { key: 'agents',   icon: '◆', desc: 'Multi-agent pipeline — scanner/fixer/validator', color: '#A78BFA', nav: null      },
  { key: 'fix',      icon: '⚙', desc: 'Auto-fix detected security issues',              color: '#10B981', nav: null      },
  { key: 'dashboard',icon: '▪', desc: 'System dashboard — providers, models, stats',    color: '#88C0D0', nav: '/dashboard'},
];

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

const MODE_COLOR_MAP: Record<Mode, string> = {
  BUILD: 'success', PLAN: 'planMode', REVIEW: 'critical', SCAN: 'warning', FIX: 'error',
};

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
    if (lower === 'loop' || lower === 'watch' || lower === 'pipeline') { navigate('/loop'); return; }
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
    <Box flexDirection="column" width="100%">

      {/* ── Title bar ── */}
      <Box
        flexDirection="row"
        borderStyle="single"
        borderColor={colors.dimSeparator}
        paddingX={2}
        alignItems="center"
        gap={2}
      >
        <Text bold color={colors.primary}>{'◆ SENTINEL'}</Text>
        <Text color={colors.dimSeparator}>{'│'}</Text>
        <Text dimColor>{'AI Security Code Guardian'}</Text>
        {gitInfo && (
          <>
            <Text color={colors.dimSeparator}>{'│'}</Text>
            <Text color={colors.info}>{'⎇'}</Text>
            <Text dimColor>{gitInfo}</Text>
          </>
        )}
        <Text color={colors.dimSeparator}>{'│'}</Text>
        <Text dimColor>{cwd}</Text>
      </Box>

      {/* ── Feature CTAs ── */}
      <Box flexDirection="row" gap={1} paddingX={2} paddingY={1}>
        <Box
          borderStyle="round"
          borderColor={colors.critical}
          paddingX={2}
          paddingY={0}
          flexGrow={1}
        >
          <Text bold color={colors.critical}>{'⊕ SECURITY REVIEW'}</Text>
          <Text dimColor>{'  CodeRabbit-style · Ctrl+R · /review'}</Text>
        </Box>
        <Box
          borderStyle="round"
          borderColor="#7C3AED"
          paddingX={2}
          paddingY={0}
          flexGrow={1}
        >
          <Text bold color="#7C3AED">{'⟳ LOOP ENGINE'}</Text>
          <Text dimColor>{'  Auto-fix loops · Ctrl+L · /loop'}</Text>
        </Box>
      </Box>

      {/* ── Divider ── */}
      <Box paddingX={2} marginBottom={1}>
        <Text dimColor>{'─'.repeat(60)}</Text>
      </Box>

      {/* ── Quick actions ── */}
      <Box flexDirection="column" paddingX={4} marginBottom={1}>
        {QUICK_ACTIONS.map(a => (
          <Box key={a.key} flexDirection="row" gap={2}>
            <Text color={a.color}>{a.icon}</Text>
            <Text color={a.color}>{`/${a.key}`.padEnd(14)}</Text>
            <Text dimColor>{a.desc}</Text>
          </Box>
        ))}
      </Box>

      {/* ── Divider ── */}
      <Box paddingX={2} marginBottom={1}>
        <Text dimColor>{'─'.repeat(60)}</Text>
      </Box>

      {/* ── Mode indicator ── */}
      <Box flexDirection="row" gap={2} paddingX={4} marginBottom={1}>
        {MODES.map(m => (
          <Box key={m} flexDirection="row" gap={0}>
            <Text
              bold={m === mode}
              color={m === mode ? (colors as any)[MODE_COLOR_MAP[m]] : colors.dimSeparator}
            >
              {m === mode ? `[${m}]` : m}
            </Text>
          </Box>
        ))}
        <Text dimColor>{'← Tab to cycle'}</Text>
      </Box>

      {/* ── Input ── */}
      <Box paddingX={2} paddingBottom={1}>
        <Box
          borderStyle="single"
          borderColor={modeColor}
          paddingX={2}
          width="100%"
        >
          <Text color={modeColor}>{`${mode} ▸ `}</Text>
          <TextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            placeholder="Ask anything, or type /command..."
          />
        </Box>
      </Box>

      {/* ── Keybind hints ── */}
      <Box flexDirection="row" gap={3} paddingX={4}>
        <Text dimColor>{'Ctrl+R review'}</Text>
        <Text dimColor>{'Ctrl+L loop'}</Text>
        <Text dimColor>{'Ctrl+D dashboard'}</Text>
        <Text dimColor>{'Ctrl+P commands'}</Text>
        <Text dimColor>{'Tab mode'}</Text>
        <Text dimColor>{'Ctrl+C exit'}</Text>
      </Box>

    </Box>
  );
}

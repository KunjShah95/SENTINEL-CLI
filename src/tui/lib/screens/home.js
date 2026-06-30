import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from 'react/jsx-runtime';
import { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../providers/theme/index.js';
import { useNavigate } from 'react-router';
const MODES = ['BUILD', 'PLAN', 'REVIEW', 'SCAN', 'FIX'];
const QUICK_ACTIONS = [
  { key: 'review', icon: '⊕', desc: 'CodeRabbit-style security review of git diff', color: '#DC2626', nav: '/review' },
  { key: 'loop', icon: '⟳', desc: 'Loop Engine — agentic review/watch/pipeline', color: '#7C3AED', nav: '/loop' },
  { key: 'analyze', icon: '◈', desc: 'Analyze code for issues', color: '#60A5FA', nav: null },
  { key: 'full-scan', icon: '⬡', desc: 'Run all available analyzers', color: '#F59E0B', nav: null },
  { key: 'diff', icon: '±', desc: 'Review staged changes', color: '#34D399', nav: null },
  { key: 'agents', icon: '◆', desc: 'Multi-agent pipeline — scanner/fixer/validator', color: '#A78BFA', nav: null },
  { key: 'fix', icon: '⚙', desc: 'Auto-fix detected security issues', color: '#10B981', nav: null },
  { key: 'dashboard', icon: '▪', desc: 'System dashboard — providers, models, stats', color: '#88C0D0', nav: '/dashboard' },
];
function useGitInfo() {
  const [info, setInfo] = useState('');
  useEffect(() => {
    import('child_process').then(({ execSync }) => {
      try {
        const branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', { encoding: 'utf-8' }).trim();
        const commit = execSync('git rev-parse --short HEAD 2>/dev/null', { encoding: 'utf-8' }).trim();
        if (branch)
          setInfo(`${branch} @ ${commit}`);
      }
      catch { }
    });
  }, []);
  return info;
}
const MODE_COLOR_MAP = {
  BUILD: 'success', PLAN: 'planMode', REVIEW: 'critical', SCAN: 'warning', FIX: 'error',
};
export function Home() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('BUILD');
  const [inputValue, setInputValue] = useState('');
  const { colors } = useTheme();
  const { exit } = useApp();
  const gitInfo = useGitInfo();
  const modeColor = colors[MODE_COLOR_MAP[mode]] ?? colors.primary;
  const handleSubmit = useCallback((value) => {
    if (!value.trim())
      return;
    const lower = value.toLowerCase().trim().replace(/^\//, '');
    if (lower === 'review') {
      navigate('/review');
      return;
    }
    if (lower === 'loop' || lower === 'watch' || lower === 'pipeline') {
      navigate('/loop');
      return;
    }
    if (lower === 'dashboard') {
      navigate('/dashboard');
      return;
    }
    navigate('/session', { state: { message: value, mode } });
    setInputValue('');
  }, [navigate, mode]);
  useInput((input, key) => {
    if (key.ctrl && input === 'r') {
      navigate('/review');
      return;
    }
    if (key.ctrl && input === 'l') {
      navigate('/loop');
      return;
    }
    if (key.ctrl && input === 'd') {
      navigate('/dashboard');
      return;
    }
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }
    if (key.tab) {
      setMode(prev => MODES[(MODES.indexOf(prev) + 1) % MODES.length]);
    }
  });
  const cwd = process.cwd().replace(process.env.HOME || '', '~');
  return (_jsxs(Box, { flexDirection: 'column', width: '100%', children: [_jsxs(Box, { flexDirection: 'row', borderStyle: 'single', borderColor: colors.dimSeparator, paddingX: 2, alignItems: 'center', gap: 2, children: [_jsx(Text, { bold: true, color: colors.primary, children: '◆ SENTINEL' }), _jsx(Text, { color: colors.dimSeparator, children: '│' }), _jsx(Text, { dimColor: true, children: 'AI Security Code Guardian' }), gitInfo && (_jsxs(_Fragment, { children: [_jsx(Text, { color: colors.dimSeparator, children: '│' }), _jsx(Text, { color: colors.info, children: '⎇' }), _jsx(Text, { dimColor: true, children: gitInfo })] })), _jsx(Text, { color: colors.dimSeparator, children: '│' }), _jsx(Text, { dimColor: true, children: cwd })] }), _jsxs(Box, { flexDirection: 'row', gap: 1, paddingX: 2, paddingY: 1, children: [_jsxs(Box, { borderStyle: 'round', borderColor: colors.critical, paddingX: 2, paddingY: 0, flexGrow: 1, children: [_jsx(Text, { bold: true, color: colors.critical, children: '⊕ SECURITY REVIEW' }), _jsx(Text, { dimColor: true, children: '  CodeRabbit-style · Ctrl+R · /review' })] }), _jsxs(Box, { borderStyle: 'round', borderColor: '#7C3AED', paddingX: 2, paddingY: 0, flexGrow: 1, children: [_jsx(Text, { bold: true, color: '#7C3AED', children: '⟳ LOOP ENGINE' }), _jsx(Text, { dimColor: true, children: '  Auto-fix loops · Ctrl+L · /loop' })] })] }), _jsx(Box, { paddingX: 2, marginBottom: 1, children: _jsx(Text, { dimColor: true, children: '─'.repeat(60) }) }), _jsx(Box, { flexDirection: 'column', paddingX: 4, marginBottom: 1, children: QUICK_ACTIONS.map(a => (_jsxs(Box, { flexDirection: 'row', gap: 2, children: [_jsx(Text, { color: a.color, children: a.icon }), _jsx(Text, { color: a.color, children: `/${a.key}`.padEnd(14) }), _jsx(Text, { dimColor: true, children: a.desc })] }, a.key))) }), _jsx(Box, { paddingX: 2, marginBottom: 1, children: _jsx(Text, { dimColor: true, children: '─'.repeat(60) }) }), _jsxs(Box, { flexDirection: 'row', gap: 2, paddingX: 4, marginBottom: 1, children: [MODES.map(m => (_jsx(Box, { flexDirection: 'row', gap: 0, children: _jsx(Text, { bold: m === mode, color: m === mode ? colors[MODE_COLOR_MAP[m]] : colors.dimSeparator, children: m === mode ? `[${m}]` : m }) }, m))), _jsx(Text, { dimColor: true, children: '← Tab to cycle' })] }), _jsx(Box, { paddingX: 2, paddingBottom: 1, children: _jsxs(Box, { borderStyle: 'single', borderColor: modeColor, paddingX: 2, width: '100%', children: [_jsx(Text, { color: modeColor, children: `${mode} ▸ ` }), _jsx(TextInput, { value: inputValue, onChange: setInputValue, onSubmit: handleSubmit, placeholder: 'Ask anything, or type /command...' })] }) }), _jsxs(Box, { flexDirection: 'row', gap: 3, paddingX: 4, children: [_jsx(Text, { dimColor: true, children: 'Ctrl+R review' }), _jsx(Text, { dimColor: true, children: 'Ctrl+L loop' }), _jsx(Text, { dimColor: true, children: 'Ctrl+D dashboard' }), _jsx(Text, { dimColor: true, children: 'Ctrl+P commands' }), _jsx(Text, { dimColor: true, children: 'Tab mode' }), _jsx(Text, { dimColor: true, children: 'Ctrl+C exit' })] })] }));
}

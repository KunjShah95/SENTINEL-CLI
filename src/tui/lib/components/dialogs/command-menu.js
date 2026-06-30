import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useCallback, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../../providers/theme/index.js';
import { useDialog } from '../../providers/dialog/index.js';
import { useToast } from '../../providers/toast/index.js';
import { usePromptConfig } from '../../providers/prompt-config/index.js';
import { Auth } from '../../lib/api-client.js';
const MAX_VISIBLE = 9;
const UPGRADE_URL = 'https://sentinel.dev/billing';
export const COMMAND_MENU_CLEAR_EVENT = 'sentinel:chat:clear';
const COMMANDS = [
  { name: '/help', description: 'Show available commands' },
  { name: '/clear', description: 'Clear the current chat history' },
  { name: '/mode', description: 'Toggle between BUILD and PLAN mode' },
  { name: '/model', description: 'Switch to a different model', usage: '/model <name>' },
  { name: '/login', description: 'Sign in to Sentinel' },
  { name: '/logout', description: 'Sign out' },
  { name: '/upgrade', description: 'Open billing page to upgrade' },
  { name: '/status', description: 'Show session, mode, and model' },
];
export function CommandMenu({ onClear, sessionId }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { colors } = useTheme();
  const { close } = useDialog();
  const toast = useToast();
  const { mode, model, toggleMode, setModel, availableModels } = usePromptConfig();
  const { entries, isModelSubMenu } = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed === '/model' || trimmed.startsWith('/model ')) {
      const prefix = trimmed.length > 6 ? trimmed.slice(7).trim().toLowerCase() : '';
      const matches = availableModels
        .filter(m => !prefix || m.id.toLowerCase().includes(prefix) || (m.label || '').toLowerCase().includes(prefix))
        .map(m => ({ name: `/model ${m.id}`, description: m.label || m.id }));
      return { entries: matches, isModelSubMenu: true };
    }
    const needle = trimmed.replace(/^\//, '').toLowerCase();
    const filtered = needle.length === 0
      ? COMMANDS
      : COMMANDS.filter(c => c.name.slice(1).toLowerCase().startsWith(needle) || c.description.toLowerCase().includes(needle));
    return { entries: filtered, isModelSubMenu: false };
  }, [query, availableModels]);
  const runCommand = useCallback(async (entry) => {
    if (entry.name.startsWith('/model ')) {
      const id = entry.name.slice(7).trim();
      if (id) {
        setModel(id);
        toast.success(`Model: ${id}`);
      }
      close();
      return;
    }
    switch (entry.name) {
    case '/clear':
      if (onClear) {
        onClear();
      }
      else {
        try {
          const g = globalThis;
          if (typeof g.dispatchEvent === 'function')
            g.dispatchEvent(new g.Event(COMMAND_MENU_CLEAR_EVENT));
        }
        catch { }
      }
      toast.success('Chat cleared');
      break;
    case '/mode':
      toggleMode();
      toast.info(`Mode: ${mode === 'BUILD' ? 'PLAN' : 'BUILD'}`);
      break;
    case '/model':
      setQuery('/model ');
      return;
    case '/login':
      try {
        const res = await Auth.devLogin();
        const { saveAuth } = await import('../../../server/api/client.js');
        saveAuth({ token: res.token, userId: res.userId });
        toast.success(`Signed in as ${res.userId}`);
      }
      catch (e) {
        toast.error(e?.message || 'Login failed');
      }
      break;
    case '/logout':
      try {
        const { getAuth, clearAuth } = await import('../../../server/api/client.js');
        const auth = getAuth?.();
        if (auth?.token) {
          try {
            await Auth.devLogout(auth.token);
          }
          catch { }
        }
        clearAuth?.();
        toast.success('Signed out');
      }
      catch (e) {
        toast.error(e?.message || 'Logout failed');
      }
      break;
    case '/upgrade':
      toast.info(`Upgrade: ${UPGRADE_URL}`);
      break;
    case '/status':
      toast.info(`session=${sessionId ? sessionId.slice(0, 8) : 'none'} mode=${String(mode)} model=${model}`);
      break;
    }
    close();
  }, [close, onClear, toggleMode, setModel, mode, model, sessionId, toast]);
  const handleChange = useCallback((value) => {
    setQuery(value);
    setSelectedIndex(0);
  }, []);
  const handleSubmit = useCallback((_value) => {
    const entry = entries[selectedIndex];
    if (entry)
      runCommand(entry);
  }, [entries, selectedIndex, runCommand]);
  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(p => Math.max(0, p - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex(p => Math.min(Math.max(entries.length - 1, 0), p + 1));
      return;
    }
    if (key.escape) {
      close();
      return;
    }
    if (!key.ctrl && !key.meta && /^[1-9]$/.test(input)) {
      const n = parseInt(input) - 1;
      if (entries[n])
        runCommand(entries[n]);
    }
  });
  const visible = entries.slice(0, MAX_VISIBLE);
  const nameWidth = isModelSubMenu ? 32 : 18;
  return (_jsxs(Box, { flexDirection: 'column', gap: 1, children: [_jsx(Box, { borderStyle: 'single', borderColor: colors.primary, paddingX: 1, children: _jsx(TextInput, { value: query, onChange: handleChange, onSubmit: handleSubmit, placeholder: isModelSubMenu ? 'Filter models...' : 'Type a command...', focus: true }) }), entries.length === 0 ? (_jsx(Text, { dimColor: true, children: isModelSubMenu ? 'No matching models' : 'No matching commands' })) : (_jsx(Box, { flexDirection: 'column', children: visible.map((entry, i) => {
    const isSelected = i === selectedIndex;
    const numberHint = i < 9 ? String(i + 1) : ' ';
    return (_jsxs(Box, { flexDirection: 'row', gap: 1, paddingX: 1, children: [_jsx(Text, { dimColor: true, color: colors.dimSeparator, children: numberHint }), _jsx(Text, { bold: isSelected, color: isSelected ? colors.selection : colors.primary, children: (entry.usage || entry.name).padEnd(nameWidth) }), _jsx(Text, { dimColor: true, children: entry.description })] }, entry.name));
  }) })), _jsxs(Box, { flexDirection: 'row', gap: 2, paddingX: 1, children: [_jsx(Text, { dimColor: true, children: '↑↓ select' }), _jsx(Text, { dimColor: true, children: 'Enter run' }), _jsx(Text, { dimColor: true, children: '1-9 jump' }), _jsx(Text, { dimColor: true, children: 'Esc close' })] })] }));
}

import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useCallback, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../../providers/theme/index.js';
import { getFilteredCommands } from './commands.js';
import { recordCommand } from '../../lib/command-mru.js';
const MAX_VISIBLE = 10;
const CAT_ICON = {
  general: '◎',
  scan: '◈',
  git: '⎇',
  actions: '◆',
  settings: '⬡',
  output: '▪',
  views: '▸',
  ci: '⊕',
  server: '⚙',
};
const CAT_COLOR_KEY = {
  general: 'info', scan: 'warning', git: 'primary', actions: 'success',
  settings: 'planMode', output: 'info', views: 'primary', ci: 'warning', server: 'info',
};
export function CommandMenu({ onClose, ctx }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { colors } = useTheme();
  const filtered = getFilteredCommands(query);
  const visible = filtered.slice(0, MAX_VISIBLE);
  const handleChange = useCallback((value) => {
    setQuery(value);
    setSelectedIndex(0);
  }, []);
  const handleSubmit = useCallback(() => {
    const cmd = filtered[selectedIndex];
    if (!cmd)
      return;
    recordCommand(cmd.name);
    if (cmd.action) {
      cmd.action(ctx);
    }
    else {
      ctx.execute(cmd.value.replace(/^\//, ''));
    }
    onClose();
  }, [filtered, selectedIndex, ctx, onClose]);
  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(p => Math.max(0, p - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex(p => Math.min(Math.max(filtered.length - 1, 0), p + 1));
      return;
    }
    if (key.escape) {
      onClose();
      return;
    }
  });
  // Group visible items by category
  const categories = {};
  for (const cmd of visible) {
    const cat = cmd.category || 'general';
    if (!categories[cat])
      categories[cat] = [];
    categories[cat].push(cmd);
  }
  return (_jsxs(Box, { flexDirection: 'column', borderStyle: 'round', borderColor: colors.primary, paddingX: 1, paddingY: 0, width: '100%', children: [_jsxs(Box, { flexDirection: 'row', gap: 2, paddingY: 0, children: [_jsx(Text, { bold: true, color: colors.primary, children: '◆ Command Palette' }), _jsx(Text, { dimColor: true, children: '↑↓ navigate · Enter run · Esc close' }), filtered.length > 0 && _jsx(Text, { dimColor: true, children: `${filtered.length} commands` })] }), _jsxs(Box, { borderStyle: 'single', borderColor: colors.dimSeparator, paddingX: 1, marginBottom: 1, children: [_jsx(Text, { color: colors.dimSeparator, children: '/' }), _jsx(TextInput, { value: query, onChange: handleChange, onSubmit: handleSubmit, placeholder: 'Search commands...', focus: true })] }), visible.length === 0 ? (_jsx(Box, { paddingX: 2, paddingY: 1, children: _jsx(Text, { dimColor: true, children: 'No commands match. Try: review, scan, loop, fix...' }) })) : (_jsxs(Box, { flexDirection: 'column', children: [visible.map((cmd, i) => {
    const isSelected = i === selectedIndex;
    const cat = cmd.category || 'general';
    const colorKey = CAT_COLOR_KEY[cat] || 'dimSeparator';
    const catColor = colors[colorKey];
    const icon = CAT_ICON[cat] || '·';
    return (_jsxs(Box, { flexDirection: 'row', gap: 1, paddingX: 1, paddingY: 0, children: [_jsx(Text, { color: isSelected ? colors.primary : colors.dimSeparator, children: isSelected ? '▶' : ' ' }), _jsx(Text, { color: isSelected ? colors.primary : catColor, children: icon }), _jsx(Text, { bold: isSelected, color: isSelected ? colors.primary : catColor, children: cmd.name.padEnd(16) }), _jsx(Text, { dimColor: true, children: cmd.description })] }, cmd.value));
  }), filtered.length > MAX_VISIBLE && (_jsx(Box, { paddingLeft: 4, paddingY: 0, children: _jsx(Text, { dimColor: true, children: `+${filtered.length - MAX_VISIBLE} more — keep typing to filter` }) }))] }))] }));
}

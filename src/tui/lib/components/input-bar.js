import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../providers/theme/index.js';
const MODE_SYMBOL = {
  BUILD: '⬡', PLAN: '◎', REVIEW: '⊕', SCAN: '◈', FIX: '⚙',
};
const MODE_COLOR_KEY = {
  BUILD: 'success', PLAN: 'planMode', REVIEW: 'critical', SCAN: 'warning', FIX: 'error',
};
const MAX_SUGGESTIONS = 10;
const MENTION_REGEX = /(?:^|\s)@([^\s@]*)$/;
function extractMentionToken(text) {
  const m = text.match(MENTION_REGEX);
  return m ? m[1] : null;
}
export function InputBar({ onSubmit, onCommand, onSlashCommand, disabled = false, placeholder = 'Ask Sentinel anything, or /command...', mode = 'BUILD', onModeToggle, onCommandPalette }) {
  const [value, setValue] = useState('');
  const [mentionToken, setMentionToken] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { colors } = useTheme();
  const activeColor = colors[MODE_COLOR_KEY[mode]] ?? colors.primary;
  const modeSymbol = MODE_SYMBOL[mode];
  useEffect(() => {
    if (mentionToken === null) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { executeLocalTool } = await import('../../shared/tools/index.js');
        const pattern = mentionToken.length > 0 ? `**/*${mentionToken}*` : '**/*';
        const result = await executeLocalTool('glob', { pattern });
        if (cancelled)
          return;
        const files = Array.isArray(result?.files) ? result.files : [];
        setSuggestions(files.slice(0, MAX_SUGGESTIONS));
        setSelectedIndex(0);
      }
      catch {
        if (!cancelled)
          setSuggestions([]);
      }
    })();
    return () => { cancelled = true; };
  }, [mentionToken]);
  const insertSelected = useCallback(() => {
    if (mentionToken === null || suggestions.length === 0)
      return;
    const selected = suggestions[selectedIndex];
    if (!selected)
      return;
    setValue(value.replace(/@[^\s@]*$/, `@${selected} `));
    setMentionToken(null);
    setSuggestions([]);
  }, [mentionToken, suggestions, selectedIndex, value]);
  useInput((input, key) => {
    if (mentionToken !== null && suggestions.length > 0) {
      if (key.upArrow) {
        setSelectedIndex(p => Math.max(0, p - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex(p => Math.min(suggestions.length - 1, p + 1));
        return;
      }
      if (key.tab) {
        insertSelected();
        return;
      }
      if (key.escape) {
        setMentionToken(null);
        setSuggestions([]);
        return;
      }
      return;
    }
    if (key.tab) {
      onModeToggle?.();
      return;
    }
    if (key.ctrl && input === 'p') {
      onCommandPalette?.();
      return;
    }
  });
  const handleChange = useCallback((next) => {
    setValue(next);
    setMentionToken(extractMentionToken(next));
  }, []);
  const handleSubmit = useCallback((submitted) => {
    if (mentionToken !== null && suggestions.length > 0) {
      insertSelected();
      return;
    }
    const trimmed = submitted.trim();
    if (!trimmed)
      return;
    if (trimmed.startsWith('/')) {
      if (onSlashCommand) {
        onSlashCommand();
        return;
      }
      if (onCommand) {
        onCommand(trimmed);
        return;
      }
    }
    onSubmit(trimmed);
    setValue('');
    setMentionToken(null);
    setSuggestions([]);
  }, [onSubmit, onCommand, onSlashCommand, mentionToken, suggestions, insertSelected]);
  const showSuggestions = mentionToken !== null && suggestions.length > 0;
  return (_jsxs(Box, { flexDirection: 'column', width: '100%', children: [showSuggestions ? (_jsx(Box, { flexDirection: 'column', borderStyle: 'single', borderColor: colors.info, paddingX: 2, marginBottom: 0, children: suggestions.map((fp, i) => {
    const isSel = i === selectedIndex;
    return (_jsxs(Box, { flexDirection: 'row', gap: 1, children: [_jsx(Text, { color: isSel ? colors.primary : colors.dimSeparator, children: isSel ? '▶' : ' ' }), _jsx(Text, { bold: isSel, color: isSel ? colors.primary : colors.info, children: fp })] }, fp));
  }) })) : null, _jsxs(Box, { flexDirection: 'row', borderStyle: 'round', borderColor: disabled ? colors.dimSeparator : activeColor, paddingX: 1, width: '100%', alignItems: 'center', children: [_jsx(Text, { bold: true, color: activeColor, children: `${modeSymbol} ` }), _jsx(TextInput, { value: value, onChange: handleChange, onSubmit: handleSubmit, placeholder: disabled ? '  Processing...' : placeholder, focus: !disabled })] })] }));
}

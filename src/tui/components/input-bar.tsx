import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../providers/theme/index.js';

type Mode = 'BUILD' | 'PLAN' | 'REVIEW' | 'SCAN' | 'FIX';

type Props = {
  onSubmit: (value: string) => void;
  onCommand?: (command: string) => void;
  onSlashCommand?: () => void;
  disabled?: boolean;
  placeholder?: string;
  mode?: Mode;
  onModeToggle?: () => void;
  onCommandPalette?: () => void;
};

const MAX_SUGGESTIONS = 10;
const MENTION_REGEX = /(?:^|\s)@([^\s@]*)$/;

function extractMentionToken(text: string): string | null {
  const match = text.match(MENTION_REGEX);
  return match ? match[1] : null;
}

export function InputBar({
  onSubmit,
  onCommand,
  onSlashCommand,
  disabled = false,
  placeholder = 'Ask Sentinel to do anything...',
  mode = 'BUILD',
  onModeToggle,
  onCommandPalette,
}: Props) {
  const [value, setValue] = useState('');
  const [mentionToken, setMentionToken] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { colors } = useTheme();

  const activeColor = mode === 'PLAN' ? colors.planMode
    : mode === 'REVIEW' ? colors.critical
    : mode === 'SCAN' ? colors.warning
    : mode === 'FIX' ? colors.error
    : colors.primary;

  useEffect(() => {
    if (mentionToken === null) { setSuggestions([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const { executeLocalTool } = await import('../../shared/tools/index.js');
        const pattern = mentionToken.length > 0 ? `**/*${mentionToken}*` : '**/*';
        const result = await executeLocalTool('glob', { pattern });
        if (cancelled) return;
        const files: string[] = Array.isArray(result?.files) ? result.files : [];
        setSuggestions(files.slice(0, MAX_SUGGESTIONS));
        setSelectedIndex(0);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    })();
    return () => { cancelled = true; };
  }, [mentionToken]);

  const insertSelected = useCallback(() => {
    if (mentionToken === null || suggestions.length === 0) return;
    const selected = suggestions[selectedIndex];
    if (!selected) return;
    const newValue = value.replace(/@[^\s@]*$/, `@${selected} `);
    setValue(newValue);
    setMentionToken(null);
    setSuggestions([]);
  }, [mentionToken, suggestions, selectedIndex, value]);

  useInput((input, key) => {
    if (mentionToken !== null && suggestions.length > 0) {
      if (key.upArrow) { setSelectedIndex(p => Math.max(0, p - 1)); return; }
      if (key.downArrow) { setSelectedIndex(p => Math.min(suggestions.length - 1, p + 1)); return; }
      if (key.tab) { insertSelected(); return; }
      if (key.escape) { setMentionToken(null); setSuggestions([]); return; }
      return;
    }
    if (key.tab) { onModeToggle?.(); return; }
    if (key.ctrl && input === 'p') { onCommandPalette?.(); return; }
  });

  const handleChange = useCallback((next: string) => {
    setValue(next);
    setMentionToken(extractMentionToken(next));
  }, []);

  const handleSubmit = useCallback((submitted: string) => {
    if (mentionToken !== null && suggestions.length > 0) {
      insertSelected();
      return;
    }
    const trimmed = submitted.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('/')) {
      if (onSlashCommand) { onSlashCommand(); return; }
      if (onCommand) { onCommand(trimmed); return; }
    }
    onSubmit(trimmed);
    setValue('');
    setMentionToken(null);
    setSuggestions([]);
  }, [onSubmit, onCommand, onSlashCommand, mentionToken, suggestions, insertSelected]);

  const showSuggestions = mentionToken !== null && suggestions.length > 0;

  return (
    <Box flexDirection="column" width="100%">
      {showSuggestions ? (
        <Box flexDirection="column" paddingX={1} borderStyle="single" borderColor={colors.info}>
          {suggestions.map((filePath, i) => {
            const isSelected = i === selectedIndex;
            return (
              <Text key={filePath} bold={isSelected} color={isSelected ? colors.primary : colors.info}>
                {`${isSelected ? '> ' : '  '}${filePath}`}
              </Text>
            );
          })}
        </Box>
      ) : null}
      <Box flexDirection="row" borderStyle="single" borderColor={activeColor} paddingX={1}>
        <Text color={activeColor}>{`[${mode}] `}</Text>
        <TextInput
          value={value}
          onChange={handleChange}
          onSubmit={handleSubmit}
          placeholder={disabled ? 'Processing...' : placeholder}
          focus={!disabled}
        />
      </Box>
    </Box>
  );
}

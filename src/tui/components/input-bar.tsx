import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../providers/theme/index.js';

type Mode = 'BUILD' | 'PLAN' | 'REVIEW' | 'SCAN' | 'FIX';

const MODE_COLOR_KEY: Record<Mode, string> = {
  BUILD: 'success', PLAN: 'planMode', REVIEW: 'critical', SCAN: 'warning', FIX: 'error',
};

type Props = {
  onSubmit: (value: string) => void;
  onCommand?: (command: string) => void;
  onSlashCommand?: () => void;
  onShellCommand?: (command: string) => void;
  disabled?: boolean;
  placeholder?: string;
  mode?: Mode;
  onModeToggle?: () => void;
  onCommandPalette?: () => void;
};

const MAX_SUGGESTIONS = 10;
const MENTION_REGEX = /(?:^|\s)@([^\s@]*)$/;

function extractMentionToken(text: string): string | null {
  const m = text.match(MENTION_REGEX);
  return m ? m[1] : null;
}

export function InputBar({
  onSubmit,
  onCommand,
  onSlashCommand,
  onShellCommand,
  disabled = false,
  placeholder = 'Ask anything, or /command...',
  mode = 'BUILD',
  onModeToggle,
  onCommandPalette,
}: Props) {
  const [value, setValue] = useState('');
  const [mentionToken, setMentionToken] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { colors } = useTheme();

  const activeColor = (colors as any)[MODE_COLOR_KEY[mode]] ?? colors.primary;
  const isShell = value.startsWith('!');

  useEffect(() => {
    if (mentionToken === null) { setSuggestions([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const { getAgentSuggestions } = await import('../../shared/tools/agent-mentions.js');
        const agentSuggestions = getAgentSuggestions(mentionToken);
        if (agentSuggestions.length > 0 && !cancelled) {
          const agentItems = agentSuggestions.map(a => `@${a.name}`);
          setSuggestions(agentItems.slice(0, MAX_SUGGESTIONS));
          setSelectedIndex(0);
          return;
        }
        const { executeLocalTool } = await import('../../shared/tools/index.js');
        const pattern = mentionToken.length > 0 ? `**/*${mentionToken}*` : '**/*';
        const result = await executeLocalTool('glob', { pattern });
        if (cancelled) return;
        const files: string[] = Array.isArray((result as any)?.files) ? (result as any).files : [];
        setSuggestions(files.slice(0, MAX_SUGGESTIONS));
        setSelectedIndex(0);
      } catch { if (!cancelled) setSuggestions([]); }
    })();
    return () => { cancelled = true; };
  }, [mentionToken]);

  const insertSelected = useCallback(() => {
    if (mentionToken === null || suggestions.length === 0) return;
    const selected = suggestions[selectedIndex];
    if (!selected) return;
    setValue(value.replace(/@[^\s@]*$/, `@${selected} `));
    setMentionToken(null);
    setSuggestions([]);
  }, [mentionToken, suggestions, selectedIndex, value]);

  useInput((input, key) => {
    if (mentionToken !== null && suggestions.length > 0) {
      if (key.upArrow)   { setSelectedIndex(p => Math.max(0, p - 1)); return; }
      if (key.downArrow) { setSelectedIndex(p => Math.min(suggestions.length - 1, p + 1)); return; }
      if (key.tab)       { insertSelected(); return; }
      if (key.escape)    { setMentionToken(null); setSuggestions([]); return; }
      return;
    }
    if (key.tab)                   { onModeToggle?.(); return; }
    if (key.ctrl && input === 'p') { onCommandPalette?.(); return; }
  });

  const handleChange = useCallback((next: string) => {
    setValue(next);
    setMentionToken(extractMentionToken(next));
  }, []);

  const handleSubmit = useCallback((submitted: string) => {
    if (mentionToken !== null && suggestions.length > 0) { insertSelected(); return; }
    const trimmed = submitted.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('!')) {
      if (onShellCommand) { onShellCommand(trimmed.slice(1)); return; }
    }
    if (trimmed.startsWith('/')) {
      if (onSlashCommand) { onSlashCommand(); return; }
      if (onCommand)      { onCommand(trimmed); return; }
    }
    onSubmit(trimmed);
    setValue('');
    setMentionToken(null);
    setSuggestions([]);
  }, [onSubmit, onCommand, onSlashCommand, onShellCommand, mentionToken, suggestions, insertSelected]);

  const showSuggestions = mentionToken !== null && suggestions.length > 0;

  return (
    <Box flexDirection="column" width="100%">
      {showSuggestions ? (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={colors.info}
          paddingX={2}
          marginBottom={0}
        >
          {suggestions.map((fp, i) => {
            const isSel = i === selectedIndex;
            return (
              <Box key={fp} flexDirection="row" gap={1}>
                <Text color={isSel ? colors.primary : colors.dimSeparator}>{isSel ? '▶' : ' '}</Text>
                <Text bold={isSel} color={isSel ? colors.primary : colors.info}>{fp}</Text>
              </Box>
            );
          })}
        </Box>
      ) : null}

      <Box
        flexDirection="row"
        borderStyle="round"
        borderColor={disabled ? colors.dimSeparator : activeColor}
        paddingX={1}
        width="100%"
        alignItems="center"
      >
        <Text bold color={isShell ? colors.warning : activeColor}>
          {isShell ? '$' : mode.slice(0, 1)}
        </Text>
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

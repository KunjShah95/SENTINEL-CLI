import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../providers/theme/index.js';
import { modeColor } from '../theme.js';
import { SPLIT_BORDER, shortModelName, titlecase } from './oc/primitives.js';

type Mode = 'BUILD' | 'PLAN' | 'REVIEW' | 'SCAN' | 'FIX';

type Props = {
  model?: string;
  /** A turn is running: Enter steers it. */
  busy?: boolean;
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

const MAX_SUGGESTIONS = 8;
const MENTION_REGEX = /(?:^|\s)@([^\s@]*)$/;

// All registered slash commands with descriptions
const SLASH_COMMANDS: Array<{ name: string; description: string; args?: string }> = [
  { name: 'help',     description: 'Show available commands' },
  { name: 'model',    description: 'Switch model or open picker', args: '[id]' },
  { name: 'models',   description: 'List available models by provider' },
  { name: 'health',   description: 'Show provider/memory/uptime status' },
  { name: 'commit',   description: 'Generate commit message from staged changes' },
  { name: 'diff',     description: 'Preview git diff', args: '[--staged|branch|file]' },
  { name: 'undo',     description: 'Undo last file change' },
  { name: 'redo',     description: 'Redo last undone change' },
  { name: 'export',   description: 'Export session to Markdown' },
  { name: 'share',    description: 'Export session to file' },
  { name: 'session',  description: 'Manage sessions', args: '[list|switch <id>|delete <id>]' },
  { name: 'compact',  description: 'Summarize session to free context' },
  { name: 'clear',    description: 'Clear all messages' },
  { name: 'new',      description: 'Start a new session' },
  { name: 'mode',     description: 'Toggle BUILD / PLAN mode' },
  { name: 'setup',    description: 'Configure AI providers' },
  { name: 'editor',   description: 'Compose next message in $EDITOR' },
  { name: 'thinking', description: 'Toggle reasoning block display' },
  { name: 'details',  description: 'Toggle tool detail display' },
  { name: 'mcp',      description: 'MCP server info and usage' },
  { name: 'goal',     description: 'Work until an evaluator confirms a condition', args: '<condition>' },
  { name: 'steer',    description: 'Redirect the running turn', args: '<message>' },
  { name: 'fork',     description: 'Branch this session' },
  { name: 'theme',    description: 'Pick a theme (40+, incl. all opencode themes)', args: '[name]' },
  { name: 'context',  description: 'Show the context budget' },
  { name: 'sessions', description: 'Toggle the session panel' },
];

function extractMentionToken(text: string): string | null {
  const m = text.match(MENTION_REGEX);
  return m ? m[1] : null;
}

function getSlashSuggestions(text: string): typeof SLASH_COMMANDS {
  if (!text.startsWith('/')) return [];
  const query = text.slice(1).split(/\s/)[0].toLowerCase();
  // Only show suggestions while still on the command word (no space yet)
  if (text.includes(' ')) return [];
  return SLASH_COMMANDS.filter(c => c.name.startsWith(query));
}

export function InputBar({
  model,
  busy = false,
  onSubmit,
  onCommand,
  onSlashCommand,
  onShellCommand,
  disabled = false,
  placeholder = 'Ask anything · /command · !shell',
  mode = 'BUILD',
  onModeToggle,
  onCommandPalette,
}: Props) {
  const [value, setValue] = useState('');
  const [mentionToken, setMentionToken] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [slashSuggestions, setSlashSuggestions] = useState<typeof SLASH_COMMANDS>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { colors } = useTheme();

  const activeColor = modeColor(colors, mode);
  const barColor = activeColor;
  const modeLabel = titlecase(mode);
  const { name: modelName, provider } = shortModelName(model);
  const isShell = value.startsWith('!');

  // Update slash suggestions as user types
  useEffect(() => {
    const slash = getSlashSuggestions(value);
    setSlashSuggestions(slash);
    if (slash.length > 0) setSelectedIndex(0);
  }, [value]);

  // File/agent mention suggestions
  useEffect(() => {
    if (mentionToken === null) { setSuggestions([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const { getAgentSuggestions } = await import('../../shared/tools/agent-mentions.js');
        const agentSuggestions = getAgentSuggestions(mentionToken);
        if (agentSuggestions.length > 0 && !cancelled) {
          setSuggestions(agentSuggestions.map(a => `@${a.name}`).slice(0, MAX_SUGGESTIONS));
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

  const insertMentionSelected = useCallback(() => {
    if (mentionToken === null || suggestions.length === 0) return;
    const selected = suggestions[selectedIndex];
    if (!selected) return;
    setValue(value.replace(/@[^\s@]*$/, `@${selected} `));
    setMentionToken(null);
    setSuggestions([]);
  }, [mentionToken, suggestions, selectedIndex, value]);

  const insertSlashSelected = useCallback(() => {
    if (slashSuggestions.length === 0) return;
    const selected = slashSuggestions[Math.min(selectedIndex, slashSuggestions.length - 1)];
    if (!selected) return;
    // Complete the command word; add a space if it takes args
    setValue(selected.args ? `/${selected.name} ` : `/${selected.name}`);
    setSlashSuggestions([]);
  }, [slashSuggestions, selectedIndex]);

  const hasSuggestions = mentionToken !== null && suggestions.length > 0;
  const hasSlash = slashSuggestions.length > 0;

  useInput((input, key) => {
    if (hasSuggestions || hasSlash) {
      const listLen = hasSuggestions ? suggestions.length : slashSuggestions.length;
      if (key.upArrow)   { setSelectedIndex(p => Math.max(0, p - 1)); return; }
      if (key.downArrow) { setSelectedIndex(p => Math.min(listLen - 1, p + 1)); return; }
      if (key.tab)       { hasSuggestions ? insertMentionSelected() : insertSlashSelected(); return; }
      if (key.escape)    {
        setMentionToken(null);
        setSuggestions([]);
        setSlashSuggestions([]);
        return;
      }
      // Only swallow navigation keys — let other keys fall through to text input
    }
    if (!hasSuggestions && !hasSlash) {
      if (key.tab)                   { onModeToggle?.(); return; }
      if (key.ctrl && input === 'p') { onCommandPalette?.(); return; }
    }
  });

  const handleChange = useCallback((next: string) => {
    setValue(next);
    setMentionToken(extractMentionToken(next));
  }, []);

  const clearInput = useCallback(() => {
    setValue('');
    setMentionToken(null);
    setSuggestions([]);
    setSlashSuggestions([]);
  }, []);

  const handleSubmit = useCallback((submitted: string) => {
    // Complete autocomplete selection on Enter if suggestions are open
    if (hasSuggestions) { insertMentionSelected(); return; }
    if (hasSlash && slashSuggestions.length === 1) {
      // Single match — complete and execute immediately
      const sel = slashSuggestions[0];
      if (!sel.args) {
        clearInput();
        onSubmit(`/${sel.name}`);
        return;
      }
      insertSlashSelected();
      return;
    }
    if (hasSlash) { insertSlashSelected(); return; }

    const trimmed = submitted.trim();
    if (!trimmed) return;

    // Always clear input first, regardless of routing path
    clearInput();

    if (trimmed.startsWith('!')) {
      const shellCmd = trimmed.slice(1).trim();
      if (shellCmd && onShellCommand) { onShellCommand(shellCmd); return; }
      // No onShellCommand wired — fall through to submit so it reaches wrappedSubmit
    }

    if (trimmed.startsWith('/')) {
      // Prefer onCommand if provided, else fall through to onSubmit (wrappedSubmit handles it)
      if (onCommand) { onCommand(trimmed); return; }
      // onSlashCommand (palette opener) is intentionally NOT called here —
      // it drops the command text. Route through onSubmit instead.
    }

    onSubmit(trimmed);
  }, [onSubmit, onCommand, onShellCommand, hasSuggestions, hasSlash, slashSuggestions,
      insertMentionSelected, insertSlashSelected, clearInput]);

  return (
    <Box flexDirection="column" width="100%">
      {/* Slash command autocomplete */}
      {hasSlash ? (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={activeColor}
          paddingX={1}
          marginBottom={0}
        >
          {slashSuggestions.slice(0, MAX_SUGGESTIONS).map((cmd, i) => {
            const isSel = i === selectedIndex;
            return (
              <Box key={cmd.name} flexDirection="row" gap={1}>
                <Text color={isSel ? activeColor : colors.dimSeparator}>{isSel ? '▶' : ' '}</Text>
                <Text bold={isSel} color={isSel ? activeColor : colors.primary}>
                  {'/' + cmd.name}
                  {cmd.args ? <Text color={colors.dimSeparator}>{' ' + cmd.args}</Text> : null}
                </Text>
                <Text dimColor>{'  ' + cmd.description}</Text>
              </Box>
            );
          })}
          <Text dimColor>{'  Tab to complete · ↑↓ navigate · Esc dismiss'}</Text>
        </Box>
      ) : null}

      {/* @mention / file autocomplete */}
      {hasSuggestions ? (
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

      {/* opencode prompt: left bar in the agent color, element background,
          then a meta row "Build · model provider". */}
      <Box
        borderStyle={SPLIT_BORDER}
        borderTop={false}
        borderRight={false}
        borderBottom={false}
        borderLeftColor={disabled ? colors.border : (isShell ? colors.warning : barColor)}
        width="100%"
      >
        <Box
          flexDirection="column"
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          flexGrow={1}
          backgroundColor={colors.backgroundElement}
        >
          <Box flexDirection="row">
            {isShell ? <Text color={colors.warning}>{'$ '}</Text> : null}
            <TextInput
              value={value}
              onChange={handleChange}
              onSubmit={handleSubmit}
              placeholder={disabled ? 'Compacting…' : (busy ? 'Type to steer the running turn…' : placeholder)}
              focus={!disabled}
            />
          </Box>
          <Box flexDirection="row" justifyContent="space-between" paddingTop={1}>
            <Text>
              <Text color={isShell ? colors.warning : barColor}>{isShell ? 'Shell' : modeLabel}</Text>
              {modelName && !isShell ? <Text color={colors.textMuted}>{' · '}</Text> : null}
              {modelName && !isShell ? <Text color={colors.text}>{modelName}</Text> : null}
              {provider && !isShell ? <Text color={colors.textMuted}>{` ${provider}`}</Text> : null}
            </Text>
            <Text color={colors.textMuted}>
              <Text color={colors.text}>tab</Text>{' mode  '}
              <Text color={colors.text}>ctrl+p</Text>{' commands'}
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

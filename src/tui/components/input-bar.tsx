import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { PromptInput } from './prompt-input.js';
import { useTheme } from '../providers/theme/index.js';
import { modeColor } from '../theme.js';
import { shortModelName, titlecase } from './oc/primitives.js';
import { composerTip } from './oc/chrome.js';

type Mode = 'BUILD' | 'PLAN' | 'REVIEW' | 'SCAN' | 'FIX';

type Props = {
  model?: string;
  /** A turn is running: Enter steers it. */
  busy?: boolean;
  onSubmit: (value: string) => void;
  onShellCommand?: (command: string) => void;
  disabled?: boolean;
  placeholder?: string;
  mode?: Mode;
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
  { name: 'mode',     description: 'Show or change agent mode', args: '[build|plan|review]' },
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
  onShellCommand,
  disabled = false,
  placeholder = 'Ask anything · /command · !shell',
  mode = 'BUILD',
}: Props) {
  const [value, setValue] = useState('');
  const [mentionToken, setMentionToken] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [slashSuggestions, setSlashSuggestions] = useState<typeof SLASH_COMMANDS>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { colors } = useTheme();

  // Prompt history: up/down walk submitted prompts, like opencode. Held in refs
  // so walking it never re-renders this component on every arrow press.
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef(-1);
  const draftRef = useRef('');

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
    // Mode, palette and the other app-level chords are owned by Session through
    // the shared keybind table. Handling ctrl+p here as well made it toggle the
    // palette twice per press, i.e. not at all.
  }, { isActive: !disabled });

  const handleChange = useCallback((next: string) => {
    setValue(next);
    setMentionToken(extractMentionToken(next));
  }, []);

  const clearInput = useCallback(() => {
    setValue('');
    setMentionToken(null);
    setSuggestions([]);
    setSlashSuggestions([]);
    historyIdxRef.current = -1;
    draftRef.current = '';
  }, []);

  /** Walk submitted prompts. Returns null when there is nothing to restore. */
  const handleHistory = useCallback((direction: 'prev' | 'next'): string | null => {
    const history = historyRef.current;
    if (history.length === 0) return null;
    let idx = historyIdxRef.current;
    if (direction === 'prev') {
      if (idx === -1) draftRef.current = '';
      idx = idx === -1 ? history.length - 1 : Math.max(0, idx - 1);
    } else {
      if (idx === -1) return null;
      idx = idx + 1;
      if (idx >= history.length) {
        historyIdxRef.current = -1;
        return draftRef.current || null;
      }
    }
    historyIdxRef.current = idx;
    return history[idx];
  }, []);

  const pushHistory = useCallback((entry: string) => {
    const trimmed = entry.trim();
    if (!trimmed) return;
    const history = historyRef.current;
    if (history[history.length - 1] !== trimmed) history.push(trimmed);
    // Bound it: this lives for the lifetime of the process.
    if (history.length > 200) history.splice(0, history.length - 200);
  }, []);

  const handleSubmit = useCallback((submitted: string) => {
    // Complete autocomplete selection on Enter if suggestions are open
    if (hasSuggestions) { insertMentionSelected(); return; }
    if (hasSlash) {
      // Enter runs the highlighted command unless it has a REQUIRED
      // argument (`<x>`); optional ones (`[x]`) run bare, like opencode.
      const sel = slashSuggestions[Math.min(selectedIndex, slashSuggestions.length - 1)];
      if (sel && (!sel.args || sel.args.startsWith('['))) {
        clearInput();
        onSubmit(`/${sel.name}`);
        return;
      }
      insertSlashSelected();
      return;
    }

    const trimmed = submitted.trim();
    if (!trimmed) return;

    // Always clear input first, regardless of routing path
    clearInput();
    pushHistory(trimmed);

    if (trimmed.startsWith('!')) {
      const shellCmd = trimmed.slice(1).trim();
      if (shellCmd && onShellCommand) { onShellCommand(shellCmd); return; }
      // No onShellCommand wired — fall through to submit so it reaches wrappedSubmit
    }

    onSubmit(trimmed);
  }, [onSubmit, onShellCommand, hasSuggestions, hasSlash, slashSuggestions, selectedIndex,
      insertMentionSelected, insertSlashSelected, clearInput, pushHistory]);

  const isCommand = value.startsWith('/') && !isShell;
  const headerTitle = isShell ? 'Shell' : isCommand ? 'Command' : modeLabel;
  const headerDetail = busy
    ? 'enter steer'
    : isShell
      ? 'enter run'
      : isCommand
        ? 'enter run · tab complete'
        : 'enter send · shift+enter newline';
  const borderColor = disabled
    ? colors.border
    : isShell
      ? colors.warning
      : isCommand
        ? colors.accent
        : colors.border;
  const caretColor = isShell ? colors.warning : isCommand ? colors.accent : barColor;

  return (
    <Box flexDirection="column" width="100%" paddingLeft={2}>
      {hasSlash ? (
        <Box flexDirection="column" marginBottom={1}>
          {slashSuggestions.slice(0, MAX_SUGGESTIONS).map((cmd, i) => {
            const isSel = i === selectedIndex;
            return (
              <Box key={cmd.name} flexDirection="row">
                <Text color={isSel ? activeColor : colors.textMuted}>{isSel ? '› ' : '  '}</Text>
                <Text bold={isSel} color={isSel ? activeColor : colors.primary}>
                  {'/' + cmd.name}
                  {cmd.args ? <Text color={colors.textMuted}>{' ' + cmd.args}</Text> : null}
                </Text>
                <Text color={colors.textMuted}>{'  ' + cmd.description}</Text>
              </Box>
            );
          })}
        </Box>
      ) : null}

      {hasSuggestions ? (
        <Box flexDirection="column" marginBottom={1}>
          {suggestions.map((fp, i) => {
            const isSel = i === selectedIndex;
            return (
              <Box key={fp} flexDirection="row">
                <Text color={isSel ? colors.primary : colors.textMuted}>{isSel ? '› ' : '  '}</Text>
                <Text bold={isSel} color={isSel ? colors.primary : colors.info}>{fp}</Text>
              </Box>
            );
          })}
        </Box>
      ) : null}

      {/* MiniMax composer header. Hidden while a turn runs — the activity
          line already owns steer / stop for that moment. */}
      {busy ? null : (
        <Box flexDirection="row" width="100%">
          <Box flexShrink={0}>
            <Text wrap="truncate">
              <Text bold color={caretColor}>{headerTitle}</Text>
              <Text color={colors.textMuted}>{` · ${headerDetail}`}</Text>
            </Text>
          </Box>
          {!value ? (
            <Box flexGrow={1} justifyContent="flex-end" marginLeft={2}>
              <Text color={colors.textMuted} wrap="truncate-end">{composerTip()}</Text>
            </Box>
          ) : null}
        </Box>
      )}

      {/* Rounded editor (MiniMax) with opencode's "Build · model provider" row. */}
      <Box
        borderStyle="round"
        borderColor={borderColor}
        flexDirection="column"
        paddingX={1}
        width="100%"
      >
        <Box flexDirection="row">
          <Text bold color={caretColor}>{'› '}</Text>
          <PromptInput
            value={value}
            onChange={handleChange}
            onSubmit={handleSubmit}
            onHistory={handleHistory}
            busy={busy}
            placeholder={disabled ? '…' : (busy ? 'Type to steer the running turn…' : placeholder)}
            focus={!disabled}
          />
        </Box>
        <Box flexDirection="row" justifyContent="space-between">
          <Text>
            <Text color={caretColor}>{isShell ? 'Shell' : modeLabel}</Text>
            {modelName && !isShell ? <Text color={colors.textMuted}>{' · '}</Text> : null}
            {modelName && !isShell ? <Text color={colors.text}>{modelName}</Text> : null}
            {provider && !isShell ? <Text color={colors.textMuted}>{` ${provider}`}</Text> : null}
          </Text>
          <Text color={colors.textMuted}>
            <Text color={colors.text}>/mode</Text>{' change mode  '}
            <Text color={colors.text}>ctrl+p</Text>{' commands'}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

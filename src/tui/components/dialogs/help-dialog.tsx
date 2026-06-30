import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../providers/theme/index.js';

const SECTIONS: Array<{ title: string; bindings: Array<{ keys: string; desc: string }> }> = [
  {
    title: 'Chat & Input',
    bindings: [
      { keys: 'Enter', desc: 'Send message' },
      { keys: 'Tab', desc: 'Toggle mode (BUILD/PLAN)' },
      { keys: 'Ctrl+P', desc: 'Command palette' },
      { keys: '!<cmd>', desc: 'Run shell command' },
      { keys: '@<name>', desc: 'File/agent mention completion' },
    ],
  },
  {
    title: 'Leader Keys (Ctrl+X)',
    bindings: [
      { keys: 'Ctrl+X T', desc: 'Toggle thinking blocks' },
      { keys: 'Ctrl+X D', desc: 'Toggle tool details' },
      { keys: 'Ctrl+X M', desc: 'Open model picker' },
      { keys: 'Ctrl+X P', desc: 'Toggle command palette' },
      { keys: 'Ctrl+X C', desc: 'Clear messages' },
      { keys: 'Ctrl+X N', desc: 'New session' },
      { keys: 'Ctrl+X S', desc: 'Toggle session panel' },
      { keys: 'Ctrl+X E', desc: 'Open external editor' },
      { keys: 'Ctrl+X L', desc: 'Open session logs' },
      { keys: 'Ctrl+X ?', desc: 'Show help (this dialog)' },
    ],
  },
  {
    title: 'Direct Keybinds',
    bindings: [
      { keys: 'Ctrl+S', desc: 'Toggle session panel' },
      { keys: 'Ctrl+X', desc: 'Enter leader key mode (3s timeout)' },
      { keys: 'Ctrl+?', desc: 'Show help overlay' },
      { keys: 'Esc', desc: 'Close dialog / cancel' },
    ],
  },
  {
    title: 'Slash Commands',
    bindings: [
      { keys: '/model [id]', desc: 'Switch model (or open picker)' },
      { keys: '/mode', desc: 'Toggle mode' },
      { keys: '/thinking', desc: 'Toggle thinking blocks' },
      { keys: '/details', desc: 'Toggle tool details' },
      { keys: '/clear', desc: 'Clear messages' },
      { keys: '/new', desc: 'Start new session' },
      { keys: '/setup', desc: 'AI provider setup' },
      { keys: '/compact', desc: 'Compact session' },
      { keys: '/undo', desc: 'Undo last change' },
      { keys: '/redo', desc: 'Redo last undo' },
      { keys: '/editor', desc: 'Open external $EDITOR' },
      { keys: '/init', desc: 'Init project AGENTS.md' },
      { keys: '/health', desc: 'System health check' },
      { keys: '/models', desc: 'List all models' },
      { keys: '/session list|switch <id>|delete <id>', desc: 'Manage sessions' },
      { keys: '/share', desc: 'Share current session' },
      { keys: '/help', desc: 'List slash commands' },
    ],
  },
  {
    title: 'Review & Security',
    bindings: [
      { keys: '/review [file]', desc: 'Review changes' },
      { keys: '/review-branch <branch>', desc: 'Review branch diff' },
      { keys: '/scan [path]', desc: 'Security scan' },
      { keys: '/sast [path]', desc: 'Run SAST analyzers' },
      { keys: '/sarif [path]', desc: 'Export SARIF report' },
      { keys: '/vulndb [search|get|tags]', desc: 'Query vulnerability DB' },
      { keys: '/trust [modelId]', desc: 'View model trust scores' },
      { keys: '/feedback <id> accurate|fp', desc: 'Rate issue accuracy' },
      { keys: '/hooks', desc: 'Install git pre-push hooks' },
    ],
  },
  {
    title: 'Advanced',
    bindings: [
      { keys: '/loop <prompt>', desc: 'Auto-iterate until DONE' },
      { keys: '/agents', desc: 'List background agents' },
      { keys: '/background <prompt>', desc: 'Launch background agent' },
      { keys: '/parallel', desc: 'Parallel specialist review' },
      { keys: '/commit', desc: 'Generate commit message' },
      { keys: '/wizard', desc: 'Multi-step analysis wizard' },
      { keys: '/diff [--staged|branch|file]', desc: 'Show git diff' },
      { keys: '/test <file>', desc: 'Generate unit tests' },
      { keys: '/export', desc: 'Export session to file' },
      { keys: '/context', desc: 'Show/create context file' },
      { keys: '/dismiss <file:line:rule> [reason]', desc: 'Dismiss finding' },
    ],
  },
];

export function HelpDialog() {
  const { colors } = useTheme();
  return (
    <Box flexDirection="column" gap={1} width="100%">
      <Text bold>Keyboard & Command Reference</Text>
      <Text dimColor>Press Esc to close</Text>
      {SECTIONS.map((section) => (
        <Box key={section.title} flexDirection="column">
          <Text bold color={colors.primary}>{section.title}</Text>
          {section.bindings.map(({ keys, desc }) => (
            <Box key={keys} flexDirection="row" gap={2} marginLeft={1}>
              <Text color={colors.info} bold>{keys.padEnd(28)}</Text>
              <Text dimColor>{desc}</Text>
            </Box>
          ))}
        </Box>
      ))}
      <Box flexDirection="row" gap={2} marginTop={1}>
        <Text dimColor>↑↓ navigate  Esc close</Text>
      </Box>
    </Box>
  );
}

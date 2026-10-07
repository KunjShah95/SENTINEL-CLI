import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../providers/theme/index.js';

/**
 * The slash commands this build actually dispatches.
 *
 * Every entry below was verified against `screens/session.tsx` (the inline
 * handlers) and `commands/index.ts` (the registry). The previous version of
 * this file advertised 17 commands that exist nowhere — `/init`, `/review`,
 * `/review-branch`, `/scan`, `/sast`, `/sarif`, `/vulndb`, `/trust`,
 * `/feedback`, `/hooks`, `/loop`, `/agents`, `/background`, `/parallel`,
 * `/wizard`, `/test`, `/dismiss` — and every one of them answered
 * `Unknown command "…"` from session.tsx:298.
 *
 * A help dialog is a promise. Listing a command that does not work is worse
 * than listing nothing, because the user finds out at the moment they needed
 * it, by typing something the app told them to type.
 *
 * Note also that this list is still hand-maintained and therefore still able to
 * drift from the registry. It is the third place command names live (the other
 * two being session.tsx's dispatch and commands/index.ts); that is a known
 * duplication, not a fixed one, and the fix is to derive this from the registry.
 */
const SECTIONS: Array<{ title: string; bindings: Array<{ keys: string; desc: string }> }> = [
  {
    title: 'Chat & Input',
    bindings: [
      { keys: 'Enter', desc: 'Send message' },
      { keys: 'Shift+Enter / Ctrl+J', desc: 'Insert a newline in the prompt' },
      { keys: '↑ / ↓', desc: 'Walk prompt history' },
      { keys: 'Ctrl+A / Ctrl+E', desc: 'Start / end of line' },
      { keys: 'Ctrl+U / Ctrl+K', desc: 'Delete to line start / end' },
      { keys: 'Ctrl+W', desc: 'Delete the previous word' },
      { keys: 'Tab', desc: 'Complete the highlighted autocomplete item' },
      { keys: 'Ctrl+P', desc: 'Command palette' },
      { keys: '!<cmd>', desc: 'Run shell command' },
      { keys: '@<name>', desc: 'File/agent mention completion' },
      { keys: '/steer <message>', desc: 'Redirect a turn that is already running' },
    ],
  },
  {
    title: 'Leader Keys (Ctrl+X)',
    bindings: [
      { keys: 'Ctrl+X M', desc: 'Open model picker' },
      { keys: 'Ctrl+X N', desc: 'New session' },
      { keys: 'Ctrl+X B', desc: 'Toggle the session sidebar' },
      { keys: 'Ctrl+X L', desc: 'List sessions' },
      { keys: 'Ctrl+X S', desc: 'Status / health' },
      { keys: 'Ctrl+X C', desc: 'Compact the session' },
      { keys: 'Ctrl+X U / Ctrl+X R', desc: 'Undo / redo the last change' },
      { keys: 'Ctrl+X X', desc: 'Export the session' },
      { keys: 'Ctrl+X Y', desc: 'Copy the last message' },
      { keys: 'Ctrl+X E / Ctrl+X I', desc: 'Open external editor' },
      { keys: 'Ctrl+X T / Ctrl+X D', desc: 'Toggle thinking / tool details' },
      { keys: 'Ctrl+X Q', desc: 'Quit' },
    ],
  },
  {
    title: 'Direct Keybinds',
    bindings: [
      { keys: 'Ctrl+X', desc: 'Enter leader mode (1.5s timeout)' },
      { keys: 'Ctrl+P', desc: 'Command palette' },
      { keys: 'Ctrl+L', desc: 'Session log viewer' },
      { keys: 'Ctrl+/', desc: 'Show this help' },
      { keys: 'Esc', desc: 'Interrupt the turn / close a dialog' },
    ],
  },
  {
    title: 'Scrolling the transcript',
    bindings: [
      { keys: 'PageUp / PageDown', desc: 'Scroll a page' },
      { keys: 'Ctrl+Alt+U / Ctrl+Alt+D', desc: 'Scroll half a page' },
      { keys: 'Ctrl+Alt+Y / Ctrl+Alt+E', desc: 'Scroll one line' },
      { keys: 'Ctrl+G', desc: 'Jump to the first message' },
      { keys: 'Ctrl+Alt+G', desc: 'Jump to the newest (follow the tail)' },
      { keys: '⇅ N in the footer', desc: 'You are N lines up from the live edge' },
    ],
  },
  {
    title: 'Slash Commands',
    bindings: [
      { keys: '/model [id]', desc: 'Switch model (or open picker)' },
      { keys: '/mode [build|plan|review]', desc: 'Show or set the agent mode' },
      { keys: '/thinking', desc: 'Toggle thinking blocks' },
      { keys: '/details', desc: 'Toggle tool details' },
      { keys: '/clear', desc: 'Clear messages' },
      { keys: '/new', desc: 'Start new session' },
      { keys: '/setup', desc: 'AI provider setup' },
      { keys: '/compact', desc: 'Compact session' },
      { keys: '/context', desc: 'Show the context / token breakdown' },
      { keys: '/theme [name]', desc: 'Pick a theme' },
      { keys: '/goal <condition>', desc: 'Work until the condition is verified' },
      { keys: '/fork', desc: 'Branch this session' },
      { keys: '/editor', desc: 'Open external $EDITOR' },
      { keys: '/health', desc: 'System health check' },
      { keys: '/models', desc: 'List all models' },
      { keys: '/sessions', desc: 'Toggle the session panel' },
      { keys: '/session list|switch <id>|delete <id>', desc: 'Manage sessions' },
      { keys: '/share', desc: 'Share current session' },
      { keys: '/export', desc: 'Export session to file' },
      { keys: '/help', desc: 'List slash commands' },
    ],
  },
  {
    title: 'Git',
    bindings: [
      { keys: '/commit', desc: 'Generate a commit message from staged changes' },
      { keys: '/diff [--staged|branch|file]', desc: 'Show git diff' },
      { keys: '/undo', desc: 'Undo last change' },
      { keys: '/redo', desc: 'Redo last undo' },
    ],
  },
  {
    title: 'Also available',
    bindings: [
      { keys: '/mcp', desc: 'MCP server status' },
      { keys: '/<custom>', desc: 'Any command in .sentinel/commands/' },
      { keys: '/<template>', desc: 'Any prompt template in .sentinel/prompts/' },
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
              <Text color={colors.textSecondary} dimColor>{desc}</Text>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}

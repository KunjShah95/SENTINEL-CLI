import type { Command, CommandContext } from './types.js';

export const COMMANDS: Command[] = [
  {
    name: 'session',
    description: 'Browse, fork or delete chat sessions (Ctrl+X B)',
    value: '/sessions',
    category: 'general',
    action: (ctx: CommandContext) => ctx.toggleSessionPanel(),
  },
  {
    name: 'model',
    description: 'Switch the AI model (opens the picker)',
    value: '/model',
    category: 'general',
    action: (ctx: CommandContext) => ctx.execute('model'),
  },
  {
    name: 'setup',
    description: 'Configure AI providers (API keys)',
    value: '/setup',
    category: 'general',
    action: (ctx: CommandContext) => ctx.execute('setup'),
  },
  {
    name: 'commit',
    description: 'Generate a commit message from staged changes',
    value: '/commit',
    category: 'git',
    action: (ctx: CommandContext) => ctx.execute('commit'),
  },
  {
    name: 'diff',
    description: 'Preview a git diff (staged, branch, or file)',
    value: '/diff',
    category: 'git',
    action: (ctx: CommandContext) => ctx.execute('diff'),
  },
  {
    name: 'undo',
    description: 'Undo the last file change',
    value: '/undo',
    category: 'actions',
    action: (ctx: CommandContext) => ctx.execute('undo'),
  },
  {
    name: 'redo',
    description: 'Redo the last undone change',
    value: '/redo',
    category: 'actions',
    action: (ctx: CommandContext) => ctx.execute('redo'),
  },
  {
    name: 'export',
    description: 'Export the session to Markdown',
    value: '/export',
    category: 'general',
    action: (ctx: CommandContext) => ctx.execute('export'),
  },
  {
    name: 'health',
    description: 'Show providers, memory, uptime',
    value: '/health',
    category: 'general',
    action: (ctx: CommandContext) => ctx.execute('health'),
  },
  {
    name: 'compact',
    description: 'Summarize the session to free context',
    value: '/compact',
    category: 'general',
    action: (ctx: CommandContext) => ctx.execute('compact'),
  },
  {
    name: 'thinking',
    description: 'Toggle reasoning-block visibility',
    value: '/thinking',
    category: 'general',
    action: (ctx: CommandContext) => ctx.execute('thinking'),
  },
  {
    name: 'details',
    description: 'Toggle tool-call details',
    value: '/details',
    category: 'general',
    action: (ctx: CommandContext) => ctx.execute('details'),
  },
  {
    name: 'editor',
    description: 'Compose the next message in $EDITOR',
    value: '/editor',
    category: 'general',
    action: (ctx: CommandContext) => ctx.execute('editor'),
  },
  {
    name: 'clear',
    description: 'Clear the conversation',
    value: '/clear',
    category: 'general',
    action: (ctx: CommandContext) => ctx.execute('clear'),
  },
  {
    name: 'new',
    description: 'Start a new session',
    value: '/new',
    category: 'general',
    action: (ctx: CommandContext) => ctx.execute('new'),
  },
];

/** Filter commands by query (name, description, or value substring). */
export function getFilteredCommands(query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return COMMANDS;
  return COMMANDS.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.value.toLowerCase().includes(q)
  );
}

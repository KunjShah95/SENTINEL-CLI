import type { CommandContext } from './types.js';
import type { CommandHandler } from './types.js';

import { handleCommit, handleDiff } from './git.js';
import { handleHealth, handleHelp, handleMcp, handleContextDev } from './system.js';
import { handleModels, handleModel } from './model-commands.js';
import { handleUndo, handleRedo, handleExport, handleShare, handleSession } from './session-cmds.js';

async function executeIn(ctx: CommandContext, handler: CommandHandler): Promise<boolean> {
  await handler(ctx);
  return true;
}

export const registry: Record<string, CommandHandler> = {
  commit: handleCommit,
  diff: handleDiff,
  health: handleHealth,
  help: handleHelp,
  mcp: handleMcp,
  contextdev: handleContextDev,
  models: handleModels,
  model: handleModel,
  undo: handleUndo,
  redo: handleRedo,
  export: handleExport,
  share: handleShare,
  session: handleSession,
  sessions: handleSession,
};

export async function executeCommand(cmd: string, ctx: CommandContext): Promise<boolean> {
  const handler = registry[cmd];
  if (handler) {
    return executeIn(ctx, handler);
  }
  return false;
}

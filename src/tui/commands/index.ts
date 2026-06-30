import type { CommandContext, CommandHandler } from './types.js';
import { handleReview, handleReviewBranch, handleReviewFile, handleScan, handleSast, handleParallel, handleSarif } from './review.js';
import { handleFix, handleTest } from './fix.js';
import { handleVulndb } from './vulndb.js';
import { handleTrust, handleFeedback } from './trust.js';
import { handleDismiss, handleDismissList, handleDismissRemove } from './dismiss.js';
import { handleCommit, handleDiff } from './git.js';
import { handleHealth, handleInit, handleHooks, handleMcp, handleHelp, handleContext } from './system.js';
import { handleModels, handleModel } from './model-commands.js';
import { handleUndo, handleRedo, handleExport, handleShare, handleSession } from './session-cmds.js';
import { handleLoop } from './loop.js';
import { handleWizard } from './wizard.js';
import { handleBackground, handleAgents } from './background.js';

const registry: Record<string, CommandHandler> = {
  review: handleReview,
  'review-branch': handleReviewBranch,
  'review-file': handleReviewFile,
  scan: handleScan,
  sast: handleSast,
  parallel: handleParallel,
  sarif: handleSarif,
  fix: handleFix,
  test: handleTest,
  vulndb: handleVulndb,
  trust: handleTrust,
  feedback: handleFeedback,
  dismiss: handleDismiss,
  'dismiss-list': handleDismissList,
  'dismiss-remove': handleDismissRemove,
  commit: handleCommit,
  diff: handleDiff,
  health: handleHealth,
  init: handleInit,
  hooks: handleHooks,
  mcp: handleMcp,
  help: handleHelp,
  context: handleContext,
  models: handleModels,
  model: handleModel,
  undo: handleUndo,
  redo: handleRedo,
  export: handleExport,
  share: handleShare,
  session: handleSession,
  sessions: handleSession,
  loop: handleLoop,
  wizard: handleWizard,
  background: handleBackground,
  agents: handleAgents,
  // Aliases
  'review-file': handleReviewFile,
};

export async function executeCommand(cmd: string, ctx: CommandContext): Promise<boolean> {
  const handler = registry[cmd];
  if (handler) {
    await handler(ctx);
    return true;
  }
  return false;
}

export { type CommandContext, type CommandHandler } from './types.js';

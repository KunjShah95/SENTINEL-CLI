/**
 * Agent teams (ported from learn-claude-code s09–s13 and claw-code
 * team_cron_registry.rs), kept Pi-minimal.
 *
 * - The lead spawns named teammates. Each runs the SAME agent loop in the
 *   background with a fresh history and its own mailbox; the lead is not
 *   blocked.
 * - Results and messages travel through mailbox.js and are injected into
 *   the recipient's next model call. No polling tool, no shared messages[].
 * - Optional worktree isolation (s12): the teammate works in its own
 *   `git worktree` on a fresh branch, so parallel edits never collide. Tool
 *   paths resolve against that directory via runInWorkdir().
 * - Teammates cannot ask the user anything. Their permissions are derived
 *   from the lead's grants (see teammatePermission).
 */
import { post, trackPending, resolvePending } from './mailbox.js';
import { classifyBashCommand } from './bash-validation.js';
import { isReadOnlyTool } from '../shared/schemas/mode.js';
import { createWorktree, worktreePatch, applyPatchToRoot, removeWorktree } from './worktree.js';

export { createWorktree };

export const MAX_TEAMMATES = 4;
const NAME_RE = /^[a-z][a-z0-9-]{0,31}$/;
const FILE_TOOLS = new Set(['writeFile', 'editFile', 'batchEdit', 'applyPatch', 'todoWrite', 'undoLastChange', 'redoLastUndo']);

const team = new Map(); // name -> member

export function listTeam() {
  return [...team.values()].map(({ name, mode, status, worktree, branch, startedAt, finishedAt }) => ({
    name, mode, status, worktree, branch, startedAt, finishedAt,
  }));
}

export function resetTeam() {
  team.clear();
}

/**
 * Permission policy for a background teammate (nobody to ask):
 *   - read-only tools and provably read-only bash: allow
 *   - destructive bash: deny, always
 *   - file edits inside an isolated worktree: allow (they land on a branch)
 *   - otherwise: only tools the user granted the lead for the session; a
 *     headless lead (no permission callback) defers to the config policy,
 *     exactly as the lead itself would.
 */
export function teammatePermission({ leadAllowAll, leadHeadless, isolated }) {
  return async (toolName, _id, input) => {
    if (isReadOnlyTool(toolName) || toolName === 'sendMessage' || toolName === 'teamStatus' || toolName === 'bgCheck') {
      return 'allow';
    }
    if (toolName === 'bash' || toolName === 'runTests' || toolName === 'bgRun') {
      const c = classifyBashCommand(input?.command);
      if (c.destructive) return 'deny';
      if (c.readOnly) return 'allow';
    }
    if (isolated && FILE_TOOLS.has(toolName)) return 'allow';
    if (leadAllowAll?.has(toolName)) return 'allow';
    // Headless lead: no grant to inherit, defer to the config policy exactly
    // as the lead itself would (null = not pre-authorized).
    if (leadHeadless) return null;
    return 'deny';
  };
}

/**
 * Start a teammate. `runTurn` is the loop generator (injected to avoid an
 * import cycle with loop.js). Returns immediately.
 */
export function spawnTeammate(input, ctx) {
  const { runTurn, owner = 'lead', workdir, model, createStream, leadAllowAll, leadHeadless } = ctx;
  const name = String(input?.name || '');
  const prompt = String(input?.prompt || '');
  if (!NAME_RE.test(name)) throw new Error('name must be lowercase letters, digits, dashes (max 32), starting with a letter');
  if (!prompt.trim()) throw new Error('prompt is required');
  if (team.get(name)?.status === 'running') throw new Error(`teammate ${name} is already running`);
  const running = [...team.values()].filter((m) => m.status === 'running').length;
  if (running >= MAX_TEAMMATES) throw new Error(`team is full (${MAX_TEAMMATES} running teammates)`);

  const mode = input?.mode === 'PLAN' ? 'PLAN' : 'BUILD';
  let wt = null;
  if (input?.isolation === 'worktree') wt = createWorktree(name, workdir);
  const member = {
    name, mode, owner, status: 'running', startedAt: Date.now(),
    worktree: wt ? wt.dir : null, branch: wt ? wt.branch : null,
    baseSha: wt?.baseSha ?? null, root: wt?.root ?? null,
  };
  team.set(name, member);
  const pendingId = `team:${name}`;
  trackPending(owner, pendingId);

  const brief = [
    `You are teammate "${name}" working for the lead agent "${owner}".`,
    wt ? `You work in an isolated git worktree on branch ${wt.branch}; commit nothing, the lead merges.` : '',
    'Use sendMessage to ask the lead a blocking question only if you cannot proceed. When done, reply with a concise summary of what you changed and verified.',
    '',
    prompt,
  ].filter(Boolean).join('\n');

  (async () => {
    let text = '';
    let status = 'completed';
    try {
      for await (const ev of runTurn({
        history: [{ id: `team_${name}_${Date.now()}`, role: 'user', parts: [{ type: 'text', text: brief }] }],
        mode,
        model,
        createStream,
        trajectory: false,
        agentName: name,
        workdir: wt ? wt.dir : workdir,
        subagentDepth: 1,
        onPermissionRequest: teammatePermission({ leadAllowAll, leadHeadless, isolated: !!wt }),
      })) {
        if (ev.event === 'text') text += ev.data.delta;
        else if (ev.event === 'error') {
          status = 'failed';
          text += `\n[error: ${ev.data.message}]`;
        }
      }
    } catch (e) {
      status = 'failed';
      text += `\n[crashed: ${e?.message || e}]`;
    }
    member.status = status;
    member.finishedAt = Date.now();
    resolvePending(owner, pendingId);
    post(owner, {
      type: 'teammate_result',
      from: name,
      status,
      worktree: member.worktree,
      branch: member.branch,
      text: text.trim().slice(0, 6000) || '(no summary)',
    });
  })();

  return { started: true, name, mode, worktree: member.worktree, branch: member.branch };
}

/**
 * Bring an isolated teammate's work home.
 *   action 'diff'    — return the patch (for review) and keep everything
 *   action 'apply'   — apply to the main tree (checkpointed), remove worktree
 *   action 'discard' — remove worktree and branch without applying
 */
export async function mergeTeammate(input) {
  const name = String(input?.name || '');
  const action = ['diff', 'apply', 'discard'].includes(input?.action) ? input.action : 'apply';
  const m = team.get(name);
  if (!m) throw new Error(`unknown teammate: ${name}`);
  if (!m.worktree) throw new Error(`${name} did not run in a worktree; its edits are already in the main tree`);
  if (m.status === 'running') throw new Error(`${name} is still running`);
  if (m.status === 'merged' || m.status === 'discarded') throw new Error(`${name} was already ${m.status}`);
  const wt = { dir: m.worktree, branch: m.branch, root: m.root };
  if (action === 'discard') {
    removeWorktree(wt);
    m.status = 'discarded';
    return { discarded: true, name };
  }
  const { patch, files, added, removed } = worktreePatch(m.worktree, m.baseSha);
  if (action === 'diff') {
    return { name, files, added, removed, patch: patch.length > 20_000 ? `${patch.slice(0, 20_000)}\n…[patch truncated]` : patch };
  }
  const res = await applyPatchToRoot(m.root, patch, files);
  if (!res.applied) {
    return { applied: false, name, reason: res.reason, hint: `Worktree kept at ${m.worktree} (branch ${m.branch}); resolve manually or discard.` };
  }
  removeWorktree(wt);
  m.status = 'merged';
  return { applied: true, name, method: res.method, files, added, removed };
}

export function sendTeamMessage(input, { from = 'lead' } = {}) {
  const to = String(input?.to || '');
  const text = String(input?.text || '');
  if (!to || !text.trim()) throw new Error('to and text are required');
  if (to !== 'lead' && !team.has(to)) throw new Error(`unknown teammate: ${to}`);
  if (to === from) throw new Error('cannot message yourself');
  post(to, { type: 'message', from, text });
  return { delivered: true, to };
}

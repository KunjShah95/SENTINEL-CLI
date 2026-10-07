/**
 * Agent teams — now a thin shell over the task primitive.
 *
 * This module used to own everything: a status Map, its own permission policy,
 * its own worktree lifecycle and its own merge path. All four now live in
 * `task.js`, because `race.js` and `replay.js` were already importing
 * `teammatePermission` from here — a permission policy for one feature living
 * inside another, purely because the right home did not exist yet.
 *
 * What is left here is the *shape* a team has, and nothing else:
 *
 *   - a name, so a teammate is addressable by `sendMessage`
 *   - a brief, which is what makes it a teammate rather than a task
 *   - the mailbox delivery, so the lead learns about it next turn
 *
 * A teammate is now literally:
 *
 *   createTask({ kind: 'agent', name, prompt, permission: 'teammate',
 *                isolation: input.isolation === 'worktree' ? 'worktree' : 'none',
 *                run: ({ permission }) => runTurn({ ..., onPermissionRequest: permission }) })
 *
 * The exported API is unchanged on purpose. `loop.js`, `race.js`, `replay.js`
 * and the existing tests all import these names, and a unification that
 * rewrites every call site at once is a unification nobody can review.
 */
import { post, trackPending, resolvePending } from './mailbox.js';
import {
  createTask,
  getTask,
  listTasks,
  // `awaitTask` deliberately NOT re-exported: the name-based `awaitTeammate`
  // that needed it is gone, and an unused re-export is a lie about the surface.
  cancelTask,
  mergeTask,
  onTaskEvent,
  taskPermission,
  STATUS,
  PERMISSIONS,
  MAX_CONCURRENT,
} from './task.js';

export { createTask, cancelTask, mergeTask, taskPermission, PERMISSIONS, MAX_CONCURRENT };

/** How many teammates one lead may run at once. */
export const MAX_TEAMMATES = 4;

const NAME_RE = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * name -> task id. The task registry owns status, isolation and cleanup; this
 * map exists only so `listTeam` and `sendMessage` can resolve a friendly name
 * to an id without scanning every task.
 */
const byName = new Map();

/** Resolve a teammate name to its task, or undefined. */
function memberTask(name) {
  const id = byName.get(name);
  return id ? getTask(id) : null;
}

/**
 * Teammate status, in the shape the TUI and CLI already render.
 *
 * `status` is the task's own status — a failed teammate reports failed for the
 * same reason everything else does, rather than because this module kept a
 * second copy of the truth — translated into the vocabulary that already
 * existed, so callers are not forced to know the primitive's `done`.
 */
const TEAM_STATUS = {
  [STATUS.PENDING]: 'running',
  [STATUS.RUNNING]: 'running',
  [STATUS.DONE]: 'completed',
  [STATUS.FAILED]: 'failed',
  [STATUS.CANCELLED]: 'failed',
};

export function listTeam() {
  return listTasks({ kind: 'agent' })
    .filter((t) => byName.has(t.name))
    .map((t) => ({
      name: t.name,
      mode: t.mode,
      status: TEAM_STATUS[t.status] || t.status,
      worktree: t.isolation === 'worktree' ? t.workdir : null,
      branch: t.branch,
      startedAt: t.startedAt,
      finishedAt: t.finishedAt,
    }));
}

export function resetTeam() {
  for (const t of listTasks({ kind: 'agent' })) {
    if (byName.has(t.name) && (t.status === 'running' || t.status === 'pending')) {
      cancelTask(t.id, 'team reset');
    }
  }
  byName.clear();
}

/**
 * Permission policy for a background teammate.
 *
 * Kept as a named export because `race.js` and `replay.js` use it and because it
 * reads well at the call site — but it is now one rung of the ladder rather than
 * a policy of its own. The behaviour is unchanged.
 */
export function teammatePermission({ leadAllowAll, leadHeadless, isolated }) {
  return taskPermission(PERMISSIONS.TEAMMATE, { isolated, leadAllowAll, headless: leadHeadless });
}

/**
 * Start a teammate. `runTurn` is the loop generator (injected to avoid an
 * import cycle with loop.js). Returns immediately.
 */
export function spawnTeammate(input, ctx) {
  // `leadAllowAll` and `leadHeadless` are no longer read here: the teammate's
  // permissions come from createTask's ladder, which is handed the same values
  // through `meta` below. They stay destructured out of the contract because
  // loop.js still passes them and a silently-ignored permission input is how a
  // policy regression ships.
  const { runTurn, owner = 'lead', workdir, model, createStream, leadAllowAll, leadHeadless } = ctx;
  const name = String(input?.name || '');
  const prompt = String(input?.prompt || '');

  // Validation stays here rather than in createTask: these are the *team*
  // rules (a name you can address, a prompt to act on), not task-kind rules.
  if (!NAME_RE.test(name)) {
    throw new Error('name must be lowercase letters, digits, dashes (max 32), starting with a letter');
  }
  if (!prompt.trim()) throw new Error('prompt is required');
  if (memberTask(name)?.status === 'running') throw new Error(`teammate ${name} is already running`);
  const running = listTasks({ kind: 'agent', status: 'running' }).length;
  if (running >= MAX_TEAMMATES) throw new Error(`team is full (${MAX_TEAMMATES} running teammates)`);

  const mode = input?.mode === 'PLAN' ? 'PLAN' : 'BUILD';
  const isolation = input?.isolation === 'worktree' ? 'worktree' : 'none';

  const brief = [
    `You are teammate "${name}" working for the lead agent "${owner}".`,
    isolation === 'worktree'
      ? 'You work in an isolated git worktree; commit nothing, the lead merges.'
      : '',
    'Use sendMessage to ask the lead a blocking question only if you cannot proceed. When done, reply with a concise summary of what you changed and verified.',
    '',
    prompt,
  ].filter(Boolean).join('\n');

  const { id, task, rejected } = createTask({
    kind: 'agent',
    name,
    prompt: brief,
    mode,
    model,
    permission: PERMISSIONS.TEAMMATE,
    isolation,
    cwd: workdir,
    maxConcurrent: MAX_TEAMMATES,
    // The lead's grants and headlessness reach the teammate through the
    // primitive, which builds the callback. Pass them as data rather than
    // rebuilding the policy here — two implementations of one policy is the
    // thing this refactor exists to remove.
    meta: { leadAllowAll, headless: leadHeadless },
    run: async ({ workdir: dir, permission, signal }) => {
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
          workdir: dir,
          // A teammate is depth 1: it may not spawn anything further. The
          // primitive counts depth, so this holds for every task kind at once.
          subagentDepth: 1,
          signal,
          onPermissionRequest: permission,
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
      return { summary: text.trim().slice(0, 6000) || '(no summary)', status, text };
    },
  });

  if (rejected) throw new Error(rejected);

  byName.set(name, id);
  // The lead is owed a result until this task reports.
  const pendingId = `team:${name}`;
  trackPending(owner, pendingId);

  // Deliver the outcome to the lead's mailbox. Subscribing rather than
  // wrapping: the task primitive already emits one terminal event, so this is
  // a listener, not a second place that decides when a task is finished.
  const deliver = () => {
    resolvePending(owner, pendingId);
    const finished = getTask(id);
    if (!finished) return;
    const status =
      finished.status === STATUS.DONE ? finished.result?.status || 'completed' : finished.status;
    const text =
      finished.result?.summary ||
      (finished.status === STATUS.FAILED ? `[crashed: ${finished.error}]` : '(no summary)');
    post(owner, {
      type: 'teammate_result',
      from: name,
      status,
      worktree: finished.isolation === 'worktree' ? finished.workdir : null,
      branch: finished.branch,
      text: String(text).slice(0, 6000),
    });
  };

  let settled = false;
  const off = onTaskEvent((ev) => {
    if (ev.task?.id !== id) return;
    if (!['task.finished', 'task.failed', 'task.cancelled'].includes(ev.type)) return;
    settled = true;
    off();
    deliver();
  });

  // The subscription is installed after createTask returns, and a task whose
  // body resolves immediately will already have emitted its terminal event by
  // then. Checking here is what stops the fastest possible teammate from
  // silently never reporting back.
  const already = getTask(id);
  if (!settled && already && already.status !== STATUS.RUNNING && already.status !== STATUS.PENDING) {
    off();
    deliver();
  }

  return {
    started: true,
    name,
    mode,
    worktree: task.isolation === 'worktree' ? task.workdir : null,
    branch: task.branch,
  };
}

/**
 * Bring an isolated teammate's work home.
 *   action 'diff'    — return the patch (for review) and keep everything
 *   action 'apply'   — apply to the main tree (checkpointed), remove worktree
 *   action 'discard' — remove worktree and branch without applying
 *
 * Now a lookup plus `mergeTask`, which owns the worktree lifecycle.
 */
export async function mergeTeammate(input) {
  const name = String(input?.name || '');
  const action = ['diff', 'apply', 'discard'].includes(input?.action) ? input.action : 'apply';
  const id = byName.get(name);
  if (!id) throw new Error(`unknown teammate: ${name}`);
  return mergeTask(id, action);
}

export function sendTeamMessage(input, { from = 'lead' } = {}) {
  const to = String(input?.to || '');
  const text = String(input?.text || '');
  if (!to || !text.trim()) throw new Error('to and text are required');
  if (to !== 'lead' && !memberTask(to)) throw new Error(`unknown teammate: ${to}`);
  if (to === from) throw new Error('cannot message yourself');
  post(to, { type: 'message', from, text });
  return { delivered: true, to };
}

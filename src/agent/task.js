/**
 * Task — the single primitive for concurrent work.
 *
 * Before this module, seven mechanisms could start work: spawnAgent,
 * spawnTeammate, bgRun, race, watch, mini, and sessions. Each invented its own
 * status store, its own worktree handling, and its own permission policy.
 * `race.js` and `replay.js` both imported `teammatePermission` out of
 * `team.js` — a permission policy for one feature, living inside another,
 * because the second feature needed it and no right home existed.
 *
 * So: one primitive. A task is the only unit of concurrent work, and the
 * differences between those seven are configuration, not behaviour.
 *
 *   a subagent          = createTask({ await: true,  isolation: 'none' })
 *   a teammate          = createTask({ await: false, isolation: 'worktree' })
 *   a race candidate    = createTask({ isolation: 'worktree', score: fn })
 *   a background command= createTask({ kind: 'command', model: null })
 *
 * Design notes that are load-bearing rather than stylistic:
 *
 *  - A Task is a plain object, not a class. It is serialised into trajectory
 *    JSONL and printed by the TUI, and a class hierarchy makes both worse.
 *  - `permission` is a NAME, never a closure. It has to be inspectable from a
 *    transcript, comparable in a test, and printable by `sentinel tasks`.
 *  - Depth is counted once, here, instead of being spelled three ways
 *    (`subagentDepth >= 1`, MAX_TEAMMATES, RACE_MAX).
 *  - Cleanup is the primitive's job. A task that owns a worktree cannot leak
 *    one by being forgotten, because cancel and completion both release it.
 */
import { randomUUID } from 'node:crypto';
import { createWorktree, removeWorktree, worktreePatch, applyPatchToRoot } from './worktree.js';
import { isReadOnlyTool } from '../shared/schemas/mode.js';
import { isShellTool, isFileTool, isWebCommitTool } from '../shared/tool-taxonomy.js';
import { classifyBashCommand } from './bash-validation.js';
import { getWorkdir } from '../shared/tools/workdir.js';

export const TASK_VERSION = '1';

/** Ordered most to least capable. A task may never hold a rung above its parent's. */
export const PERMISSIONS = Object.freeze({
  INHERIT: 'inherit',     // the caller's own policy — replay, watch
  TEAMMATE: 'teammate',   // read/write in its own worktree, non-destructive shell
  READONLY: 'readonly',   // reads only, plus read-only shell commands
  NONE: 'none',           // deny everything; the explicit floor
});

const CAPABILITY = Object.freeze({
  [PERMISSIONS.INHERIT]: 3,
  [PERMISSIONS.TEAMMATE]: 2,
  [PERMISSIONS.READONLY]: 1,
  [PERMISSIONS.NONE]: 0,
});

export const STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

export const KINDS = Object.freeze(['agent', 'command']);

/** Default ceiling on simultaneously running tasks, across every kind. */
export const MAX_CONCURRENT = 6;

/** Default nesting depth. 1 means "a task may not spawn a task". */
export const MAX_DEPTH = 1;

// Classification lives in tool-taxonomy.js. These were local copies, and a
// local copy of "which tools write files" is how the permission ladder ends up
// disagreeing with the receipt ledger about whether a turn mutated anything.

/** Name of the rung a task holds, after clamping to its parent. */
export function resolvePermission(requested, parentTask) {
  // Look the rung up by VALUE. PERMISSIONS is keyed by constant name, so
  // `PERMISSIONS[requested]` is undefined for a valid rung string and every
  // lookup would silently fall through to the default — which is to make every
  // task a teammate. That is the dangerous direction to fail in.
  const known = Object.values(PERMISSIONS);
  const want = known.includes(requested) ? requested : PERMISSIONS.TEAMMATE;

  if (!parentTask) return want === PERMISSIONS.INHERIT ? PERMISSIONS.TEAMMATE : want;

  // A task may never hold a rung above its parent's. Comparing by capability
  // rather than by name means a new rung cannot be added in the wrong place.
  const parentCap = CAPABILITY[parentTask.permission] ?? CAPABILITY[PERMISSIONS.TEAMMATE];
  const wantCap = CAPABILITY[want] ?? CAPABILITY[PERMISSIONS.TEAMMATE];
  if (wantCap > parentCap) return parentTask.permission;
  return want;
}

/**
 * The one permission callback, built from a rung name.
 *
 * `readonly` is a list, not "does not write": searchWeb and skill are both
 * read-only and both reach outside the project, and a rule derived from
 * writability would grant them without anyone deciding to.
 */
export function taskPermission(policy, { isolated = false, leadAllowAll = null, headless = false } = {}) {
  return async function (toolName, _id, input) {
    if (policy === PERMISSIONS.NONE) return 'deny';

    if (isReadOnlyTool(toolName) || toolName === 'sendMessage' || toolName === 'taskStatus') {
      // `webRead` and `webProbe` are allowed here by virtue of being in
      // `isReadOnlyTool`, which is correct: reading a page and resolving what a
      // button does both change nothing. The commitment is `webAct`, which is
      // not read-only and falls through to the rung ladder below.
      return 'allow';
    }

    if (isWebCommitTool(toolName)) {
      // A rung that cannot write files cannot act on a third party's account.
      //
      // This is not a policy preference, it is the same reasoning as
      // "destructive is denied at every rung": a `readonly` subagent exists to
      // gather and report, and a browser commit is the one tool class with no
      // checkpoint, no diff, and no rollback. Denying it at `readonly` is what
      // makes `audit.js`'s Delegation class meaningful for browser work —
      // without it, the recorded `rung` field would say `readonly` on a record
      // whose effect was a sent message.
      if (policy === PERMISSIONS.READONLY) return 'deny';
      // Absorbing and external effects are denied at every rung below
      // `inherit`. A teammate works in its own worktree; there is no worktree
      // for "an email that was sent".
      const rev = input?.effect?.reversibility;
      if (rev === 'absorbing' || rev === 'external') return 'deny';
      if (rev === undefined) return 'deny'; // no descriptor, no action
      // fall through: reversible/compensable inherits like any other write
    }

    if (isShellTool(toolName)) {
      const c = classifyBashCommand(input?.command);
      // Destructive is denied at every rung, even under an explicit grant.
      // Approving one once is what turns a repo's history into a list of
      // things that nearly happened.
      if (c.destructive) return 'deny';
      if (c.readOnly) return 'allow';
      // A state-changing but non-destructive command is NOT settled here: it
      // falls through to the grants below, so it inherits whatever the lead
      // was given rather than being decided by this function alone.
      if (policy === PERMISSIONS.READONLY) return 'deny';
    } else if (policy === PERMISSIONS.READONLY) {
      return 'deny';
    }

    // Isolation first: a teammate with a worktree can edit safely without
    // anyone having granted it, because its bytes land on a branch.
    if (isolated && isFileTool(toolName)) return 'allow';

    // Then inheritance. A teammate must never exceed its lead, but it need not
    // be weaker: if the lead was granted editFile for the session, a teammate
    // editing the same tree is the lead's own grant being reused, not an
    // escalation. Refusing here would make teammates less capable than the
    // agent that spawned them, which is not a safety property.
    if (leadAllowAll?.has(toolName)) return 'allow';

    // Headless parent: no grant to inherit, so defer to the caller's config
    // policy exactly as the parent itself would (null = not pre-authorized).
    // Returning 'allow' here would make teammates MORE permissive than the
    // lead, which is the one thing this policy must never do.
    if (headless) return null;

    return 'deny';
  };
}

/** Describe a rung in one line. Used by `sentinel tasks`. */
export function describePermission(policy) {
  switch (policy) {
  case PERMISSIONS.READONLY: return 'read-only: files, read-only commands, and page reads/probes — never a browser commit';
  case PERMISSIONS.TEAMMATE: return 'teammate: writes inside its own worktree, no destructive commands';
  case PERMISSIONS.NONE: return 'none: every tool call refused';
  case PERMISSIONS.INHERIT:
  default: return 'inherit: the policy of whoever started this task';
  }
}

const tasks = new Map();      // id -> Task
const children = new Map();   // parent id -> Set<id>
const controllers = new Map(); // id -> AbortController
const listeners = new Set();

function emit(event, task, extra = {}) {
  const payload = { type: event, task: { ...task }, ...extra };
  for (const fn of listeners) {
    // A listener that throws must not take down the task it is watching.
    try { fn(payload); } catch { /* best-effort */ }
  }
}

export function onTaskEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function runningTasks() {
  return [...tasks.values()].filter((t) => t.status === STATUS.RUNNING || t.status === STATUS.PENDING);
}

function depthOf(parentTask, depthSeed = 0) {
  // A real parent is authoritative. Otherwise the creator's seed applies, so
  // "the lead spawned this" is depth 1 and "a subagent spawned this" is depth 2
  // and therefore refused.
  return parentTask ? (parentTask.depth ?? 0) + 1 : depthSeed + 1;
}

/**
 * Start a task.
 *
 * `spec.run(ctx)` is the caller-supplied body; ctx carries everything the body
 * needs and nothing it does not. The primitive handles admission (depth,
 * concurrency), isolation (worktree), lifecycle, and cleanup — so a task kind
 * never reimplements any of them.
 *
 * @returns {{ id: string, task: Task }} immediately, never a promise. Waiting
 *   is `awaitTask`, so a caller that does not care does not block.
 */
export function createTask(spec = {}) {
  const {
    kind = 'agent',
    id: idHint = null,
    name = null,
    prompt = '',
    mode = 'PLAN',
    model = null,
    parent = null,
    owner = null,
    permission: requestedPermission,
    isolation = 'none',
    cwd = getWorkdir(),
    maxConcurrent = MAX_CONCURRENT,
    maxDepth = MAX_DEPTH,
    /**
     * The depth of whatever is creating this task, when the creator is not
     * itself a task — which is the common case: the agent loop is the creator
     * of most tasks and is not in the registry. Without this seed a subagent
     * of a subagent would compute depth 0 and the depth limit would never
     * fire, because depth is otherwise derived from `parent` alone.
     */
    depthSeed = 0,
    run,
    meta = {},
  } = spec;

  // Admission failures RETURN a rejection, they never throw. A caller that is
  // handling three parallel spawns should not have to wrap each one in
  // try/catch, and a throw here would escape a `for` loop over tool calls and
  // take down the whole turn instead of one spawn.
  if (!KINDS.includes(kind)) return rejected(`unknown task kind: ${kind}`);
  if (typeof run !== 'function') return rejected('a task needs a run function');
  if (kind === 'agent' && !String(prompt).trim()) return rejected('an agent task needs a prompt');
  // A caller may own its own id namespace — background commands are `bg_*`,
  // teammates are addressed by name — so a hint is allowed, but validated,
  // because these ids reach log lines, mailbox payloads and `sentinel tasks`.
  if (idHint != null && !/^[\w-]{1,64}$/.test(String(idHint))) {
    return rejected(`invalid task id: ${JSON.stringify(String(idHint))}`);
  }

  const parentTask = parent ? tasks.get(parent) : null;
  if (parent && !parentTask) return rejected(`unknown parent task: ${parent}`);

  const depth = depthOf(parentTask, depthSeed);
  if (depth > maxDepth) {
    return rejected(
      depth === 2
        ? 'Tasks cannot spawn further tasks (depth limit 1). Do the work inline.'
        : `task nesting deeper than ${maxDepth}`,
    );
  }

  const running = runningTasks();
  // Counted BEFORE this task is inserted, so the message counts what was
  // already running rather than including the task being refused.
  if (running.length >= maxConcurrent) {
    return rejected(`too many tasks running (${running.length}/${maxConcurrent}); wait for one to finish`);
  }

  const permission = resolvePermission(requestedPermission, parentTask);
  const needsWorktree = isolation === 'worktree' && kind === 'agent';

  const task = {
    id: idHint || `task_${randomUUID().slice(0, 8)}`,
    version: TASK_VERSION,
    kind,
    name: name || (kind === 'command' ? `cmd_${randomUUID().slice(0, 4)}` : `task_${randomUUID().slice(0, 4)}`),
    parent: parentTask ? parentTask.id : null,
    owner,
    status: STATUS.PENDING,
    mode: kind === 'agent' ? mode : null,
    model: kind === 'agent' ? model : null,
    permission,
    isolation: needsWorktree ? 'worktree' : 'none',
    workdir: cwd,
    branch: null,
    baseSha: null,
    depth,
    startedAt: null,
    finishedAt: null,
    result: null,
    error: null,
    ...meta,
  };

  const controller = new AbortController();

  let worktree = null;
  if (needsWorktree) {
    try {
      worktree = createWorktree(task.name, cwd);
      task.workdir = worktree.dir;
      task.branch = worktree.branch;
      task.baseSha = worktree.baseSha;
      task.root = worktree.root;
    } catch (e) {
      task.status = STATUS.FAILED;
      task.error = `worktree: ${e?.message || e}`;
      task.finishedAt = Date.now();
      tasks.set(task.id, task);
      emit('task.failed', task, { error: task.error });
      return { id: task.id, task };
    }
  }

  tasks.set(task.id, task);
  controllers.set(task.id, controller);
  if (parentTask) {
    if (!children.has(parentTask.id)) children.set(parentTask.id, new Set());
    children.get(parentTask.id).add(task.id);
  }

  task.status = STATUS.RUNNING;
  task.startedAt = Date.now();
  emit('task.started', task);

  // Fire and forget. The promise is stored so awaitTask can join it, and so an
  // unhandled rejection cannot escape: a failed task reports through `result`.
  const promise = (async () => {
    try {
      const result = await run({
        id: task.id,
        signal: controller.signal,
        workdir: task.workdir,
        branch: task.branch,
        baseSha: task.baseSha,
        permission: taskPermission(permission, {
          isolated: task.isolation === 'worktree',
          leadAllowAll: meta.leadAllowAll || null,
          headless: Boolean(meta.headless),
        }),
      });
      task.result = result ?? null;
      task.status = controller.signal.aborted ? STATUS.CANCELLED : STATUS.DONE;
      if (controller.signal.aborted) task.error = 'cancelled';
    } catch (e) {
      task.status = STATUS.FAILED;
      task.error = e?.message || String(e);
    } finally {
      task.finishedAt = Date.now();
      // The primitive owns cleanup. A task cannot leak a worktree by being
      // forgotten, because this runs on the failure path too.
      releaseWorktree(task, worktree);
      controllers.delete(task.id);
      emit(task.status === STATUS.DONE ? 'task.finished' : task.status === STATUS.CANCELLED ? 'task.cancelled' : 'task.failed', task, {
        error: task.error,
      });
    }
  })();
  promise.catch(() => { /* already recorded on the task */ });

  return { id: task.id, task };
}

function rejected(reason) {
  return { id: null, task: null, rejected: reason };
}

function releaseWorktree(task, worktree) {
  if (!worktree) return;
  // Keep the worktree if it produced a patch: mergeTeammate needs the diff,
  // and a task that failed after writing still has work worth recovering.
  task.worktreeKept = true;
}

export function getTask(id) {
  return tasks.get(id) || null;
}

/** Tasks, newest first. Filter by parent, status, or kind. */
export function listTasks({ parent, status, kind } = {}) {
  return [...tasks.values()]
    .filter((t) => (parent === undefined ? true : t.parent === parent))
    .filter((t) => (status === undefined ? true : t.status === status))
    .filter((t) => (kind === undefined ? true : t.kind === kind))
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
}

export function listChildTasks(id) {
  return [...(children.get(id) || [])].map((cid) => tasks.get(cid)).filter(Boolean);
}

/** Cooperative cancel. A running task sees the signal; cleanup happens on exit. */
export function cancelTask(id, reason = 'cancelled') {
  const t = tasks.get(id);
  if (!t) return false;
  if (t.status !== STATUS.RUNNING && t.status !== STATUS.PENDING) return false;
  const controller = controllers.get(id);
  if (controller) {
    try { controller.abort(new Error(reason)); } catch { /* ignore */ }
  }
  t.status = STATUS.CANCELLED;
  t.error = reason;
  t.finishedAt = Date.now();
  emit('task.cancelled', t, { reason });
  return true;
}

/** Wait for a task. Returns its Task, so the caller reads `result` from one place. */
export function awaitTask(id, { timeoutMs = 0 } = {}) {
  const t = tasks.get(id);
  if (!t) return Promise.reject(new Error(`unknown task: ${id}`));
  if (t.status !== STATUS.RUNNING && t.status !== STATUS.PENDING) return Promise.resolve(t);

  return new Promise((resolve, reject) => {
    let timer = null;
    const off = onTaskEvent((ev) => {
      if (ev.task.id !== id) return;
      if (['task.finished', 'task.failed', 'task.cancelled'].includes(ev.type)) {
        if (timer) clearTimeout(timer);
        off();
        resolve(ev.task);
      }
    });
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        off();
        reject(new Error(`task ${id} did not finish within ${timeoutMs}ms`));
      }, timeoutMs);
      // Do not hold the process open just to wait for a task.
      timer.unref?.();
    }
  });
}

/** Wait for every running child of a task, in order. */
export async function awaitChildren(id, opts = {}) {
  const out = [];
  for (const cid of children.get(id) || []) {
    try {
      out.push(await awaitTask(cid, opts));
    } catch {
      const t = tasks.get(cid);
      if (t) out.push(t);
    }
  }
  return out;
}

/**
 * Bring an isolated task's work home.
 *   'diff'    — return the patch for review, keep everything
 *   'apply'   — apply to the main tree (checkpointed), then remove the worktree
 *   'discard' — remove the worktree and branch without applying
 *
 * This is what `teamMerge` was. It lives here because cleanup is the
 * primitive's responsibility and merging is cleanup with a diff attached.
 */
export async function mergeTask(id, action = 'apply') {
  const t = tasks.get(id);
  if (!t) throw new Error(`unknown task: ${id}`);
  if (action !== 'diff' && action !== 'apply' && action !== 'discard') {
    throw new Error(`unknown merge action: ${action}`);
  }
  // Once a task's worktree has been merged away or discarded there is nothing
  // left to merge. This check has to come first: retrying `git` against a
  // removed worktree fails with a bare ENOENT that says nothing about the
  // real problem.
  if (t.mergeState === 'merged') throw new Error(`${t.name} was already merged`);
  if (t.mergeState === 'discarded') throw new Error(`${t.name} was already discarded`);
  if (t.isolation !== 'worktree') {
    throw new Error(`${t.name} did not run in a worktree; its edits are already in the main tree`);
  }
  if (t.status === STATUS.RUNNING || t.status === STATUS.PENDING) {
    throw new Error(`${t.name} is still running`);
  }

  const worktree = { dir: t.workdir, branch: t.branch, root: t.root };
  if (action === 'discard') {
    removeWorktree(worktree);
    t.mergeState = 'discarded';
    return { discarded: true, name: t.name };
  }

  const { patch, files, added, removed } = worktreePatch(t.workdir, t.baseSha);
  if (action === 'diff') {
    return {
      name: t.name, files, added, removed,
      patch: patch.length > 20_000 ? `${patch.slice(0, 20_000)}\n…[patch truncated]` : patch,
    };
  }

  // The await is load-bearing: applyPatchToRoot checkpoints the touched files
  // first, so it is async. Without await, `res` is a Promise, `res.applied` is
  // undefined, and every merge reports failure while leaving the patch unapplied.
  const res = await applyPatchToRoot(t.root, patch, files);
  if (!res.applied) {
    return {
      applied: false, name: t.name, reason: res.reason,
      hint: `Worktree kept at ${t.workdir} (branch ${t.branch}); resolve manually or discard.`,
    };
  }
  removeWorktree(worktree);
  t.mergeState = 'merged';
  return { applied: true, name: t.name, method: res.method, files, added, removed };
}

/** One line per task, for `sentinel tasks`. */
export function renderTasks(list = listTasks()) {
  if (!list.length) return 'No tasks. Start one with an agent that can spawn teammates.';
  const lines = [`${list.length} task(s):`];
  for (const t of list) {
    const bits = [
      `  ${t.id}`,
      t.status.padEnd(9),
      (t.kind === 'command' ? 'cmd ' : '') + t.name,
      `depth=${t.depth}`,
      `perm=${t.permission}`,
      t.isolation === 'worktree' ? `worktree ${t.branch}` : '',
      t.error ? `error=${t.error}` : '',
    ].filter(Boolean);
    lines.push(bits.join('  '));
    if (t.result?.summary) lines.push(`    ${String(t.result.summary).slice(0, 160)}`);
  }
  return lines.join('\n');
}

export function resetTasks() {
  for (const t of tasks.values()) {
    if (t.status === STATUS.RUNNING || t.status === STATUS.PENDING) cancelTask(t.id, 'reset');
    if (t.isolation === 'worktree' && t.workdir) {
      try { removeWorktree({ dir: t.workdir, branch: t.branch, root: t.root }); } catch { /* ignore */ }
    }
  }
  tasks.clear();
  children.clear();
  controllers.clear();
}

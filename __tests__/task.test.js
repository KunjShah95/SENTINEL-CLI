/**
 * Task primitive — admission, permission ladder, isolation, cleanup.
 *
 * No model, no network, no git: `run` is a stub, and the git-backed tests
 * declare that they need a real repository. Everything asserted here is a
 * property of the primitive rather than of any task kind.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PERMISSIONS,
  STATUS,
  MAX_CONCURRENT,
  resolvePermission,
  taskPermission,
  describePermission,
  createTask,
  getTask,
  listTasks,
  listChildTasks,
  cancelTask,
  awaitTask,
  awaitChildren,
  onTaskEvent,
  mergeTask,
  renderTasks,
  resetTasks,
} from '../src/agent/task.js';

let dir;
before(async () => { dir = await mkdtemp(join(tmpdir(), 'sentinel-task-')); });
after(async () => { resetTasks(); await rm(dir, { recursive: true, force: true }); });

/** A task that resolves after `ms`, with an optional result. */
function sleeper(ms = 0, result = { summary: 'done' }) {
  return ({ signal }) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve(result), ms);
      signal?.addEventListener?.('abort', () => {
        clearTimeout(t);
        reject(new Error('cancelled'));
      }, { once: true });
    });
}

// ─── the permission ladder ───────────────────────────────────────────────────

describe('resolvePermission', () => {
  test('a task may never hold a rung above its parent', () => {
    const parent = { permission: PERMISSIONS.READONLY, depth: 0 };
    assert.equal(resolvePermission(PERMISSIONS.TEAMMATE, parent), PERMISSIONS.READONLY);
    assert.equal(resolvePermission(PERMISSIONS.INHERIT, parent), PERMISSIONS.READONLY);
  });

  test('a task may hold an equal or lower rung', () => {
    const parent = { permission: PERMISSIONS.TEAMMATE, depth: 0 };
    assert.equal(resolvePermission(PERMISSIONS.READONLY, parent), PERMISSIONS.READONLY);
    assert.equal(resolvePermission(PERMISSIONS.TEAMMATE, parent), PERMISSIONS.TEAMMATE);
  });

  test('an unrecognised rung falls back to teammate, never to the top', () => {
    assert.equal(resolvePermission('inherit-everything'), PERMISSIONS.TEAMMATE);
    assert.equal(resolvePermission(undefined), PERMISSIONS.TEAMMATE);
  });

  test('a root task cannot be INHERIT, which has nothing to inherit from', () => {
    assert.equal(resolvePermission(PERMISSIONS.INHERIT, null), PERMISSIONS.TEAMMATE);
  });

  test('every rung describes itself', () => {
    for (const p of Object.values(PERMISSIONS)) {
      assert.ok(describePermission(p).length > 5, `${p} needs a description`);
    }
  });
});

// ─── the four rungs, asserted as callbacks ───────────────────────────────────

describe('taskPermission', () => {
  const call = (policy, tool, input, opts = {}) =>
    taskPermission(policy, opts)(tool, 'id1', input || {});

  test('none refuses everything, including reads', async () => {
    assert.equal(await call(PERMISSIONS.NONE, 'readFile', { path: 'a.js' }), 'deny');
    assert.equal(await call(PERMISSIONS.NONE, 'grep', { pattern: 'x' }), 'deny');
  });

  test('readonly allows reads and read-only commands', async () => {
    assert.equal(await call(PERMISSIONS.READONLY, 'readFile', { path: 'a.js' }), 'allow');
    assert.equal(await call(PERMISSIONS.READONLY, 'grep', { pattern: 'x' }), 'allow');
    assert.equal(await call(PERMISSIONS.READONLY, 'bash', { command: 'git status' }), 'allow');
  });

  test('readonly refuses writes and state-changing commands', async () => {
    assert.equal(await call(PERMISSIONS.READONLY, 'writeFile', { path: 'a.js' }), 'deny');
    assert.equal(await call(PERMISSIONS.READONLY, 'editFile', { path: 'a.js' }), 'deny');
    assert.equal(await call(PERMISSIONS.READONLY, 'bash', { command: 'npm install' }), 'deny');
  });

  test('readonly is a list, not "does not write": searchWeb and skill pass', async () => {
    // Both are read-only and both reach outside the project. Deriving the rule
    // from writability would grant them without anyone deciding to.
    assert.equal(await call(PERMISSIONS.READONLY, 'searchWeb', { query: 'x' }), 'allow');
    assert.equal(await call(PERMISSIONS.READONLY, 'skill', { name: 'x' }), 'allow');
  });

  test('destructive commands are denied at every rung above none', async () => {
    for (const p of [PERMISSIONS.READONLY, PERMISSIONS.TEAMMATE, PERMISSIONS.INHERIT]) {
      assert.equal(await call(p, 'bash', { command: 'rm -rf /' }), 'deny', `${p} must deny rm -rf /`);
      assert.equal(await call(p, 'bash', { command: 'git push --force origin main' }), 'deny');
      assert.equal(await call(p, 'bash', { command: 'git reset --hard' }), 'deny');
    }
  });

  test('teammate writes only inside its own worktree', async () => {
    assert.equal(
      await call(PERMISSIONS.TEAMMATE, 'writeFile', { path: 'a.js' }, { isolated: true }),
      'allow',
    );
    assert.equal(
      await call(PERMISSIONS.TEAMMATE, 'writeFile', { path: 'a.js' }, { isolated: false }),
      'deny',
      'without isolation a write would land in the main tree',
    );
  });

  test('a teammate inherits the lead grants it was given', async () => {
    // The shipped contract: a teammate is never MORE capable than its lead, but
    // it is not required to be weaker. Inheriting the lead's editFile grant is
    // that grant being reused, not an escalation.
    const leadAllowAll = new Set(['editFile']);
    assert.equal(
      await call(PERMISSIONS.TEAMMATE, 'editFile', { path: 'x' }, { leadAllowAll, isolated: false }),
      'allow',
    );
    assert.equal(
      await call(PERMISSIONS.TEAMMATE, 'writeFile', { path: 'x' }, { leadAllowAll, isolated: false }),
      'deny',
      'a grant for one tool must not cover another',
    );
  });

  test('a teammate with a worktree edits without any grant', async () => {
    // Isolation is what makes the edit safe: the bytes land on a branch.
    assert.equal(
      await call(PERMISSIONS.TEAMMATE, 'editFile', { path: 'x' }, { isolated: true }),
      'allow',
    );
    assert.equal(
      await call(PERMISSIONS.TEAMMATE, 'editFile', { path: 'x' }, { isolated: false }),
      'deny',
      'without a worktree and without a grant there is nowhere safe to write',
    );
  });

  test('isolation does not smuggle shell past the ladder', async () => {
    // A worktree makes FILE writes safe. It does not make `npm install` safe,
    // which is why the shell check runs before the isolation check.
    const isolated = { isolated: true };
    assert.equal(await call(PERMISSIONS.TEAMMATE, 'bash', { command: 'npm install' }, isolated), 'deny');
    assert.equal(await call(PERMISSIONS.TEAMMATE, 'bash', { command: 'rm -rf /' }, isolated), 'deny');
    assert.equal(await call(PERMISSIONS.TEAMMATE, 'bash', { command: 'git status' }, isolated), 'allow');
  });

  test('a headless teammate defers rather than inventing permission', async () => {
    // null means "not pre-authorized": the caller's config policy decides,
    // exactly as it would for the parent. Anything else is a silent allow.
    assert.equal(
      await call(PERMISSIONS.TEAMMATE, 'bash', { command: 'npm publish' }, { headless: true }),
      null,
    );
  });
});

// ─── admission ───────────────────────────────────────────────────────────────

describe('createTask admission', () => {
  test('an unknown kind is refused', () => {
    const r = createTask({ kind: 'wormhole', run: sleeper() });
    assert.match(r.rejected, /unknown task kind/);
  });

  test('a task without a run function is refused', () => {
    const r = createTask({ kind: 'agent', prompt: 'x' });
    assert.match(r.rejected, /run function/);
  });

  test('an agent task without a prompt is refused; a command task may have none', () => {
    assert.match(createTask({ kind: 'agent', run: sleeper() }).rejected, /prompt/);
    assert.ok(createTask({ kind: 'command', run: sleeper() }).id);
  });

  test('depth is limited to 1, so a task cannot spawn a task', async () => {
    // Every task has a creator, so a top-level task is already depth 1 — "the
    // lead spawned this". That makes the limit mean exactly one thing: only
    // the lead starts tasks, and nothing a task starts can start anything.
    const parent = createTask({ kind: 'agent', prompt: 'parent', run: sleeper(50) });
    assert.equal(parent.task.depth, 1);

    const child = createTask({
      kind: 'agent', prompt: 'child', parent: parent.id, run: sleeper(1),
      permission: PERMISSIONS.TEAMMATE,
    });
    assert.equal(child.id, null, 'a task may not start a task');
    assert.match(child.rejected, /cannot spawn further tasks/);
    assert.match(child.rejected, /Do the work inline/, 'the refusal must say what to do instead');

    await awaitTask(parent.id);
  });

  test('depthSeed makes the limit fire for a creator that is not a task', async () => {
    // The agent loop starts most tasks and is not itself in the registry, so
    // there is no `parent` to derive depth from. A seed of 0 is the lead:
    // depth 1, allowed. A seed of 1 is a subagent, so its child would be
    // depth 2 and must be refused — without the seed that child would compute
    // depth 1 and slip through the limit entirely.
    const lead = createTask({ kind: 'agent', prompt: 'lead', run: sleeper(50), depthSeed: 0 });
    assert.equal(lead.task.depth, 1);

    const subSub = createTask({ kind: 'agent', prompt: 'sub-sub', run: sleeper(1), depthSeed: 1 });
    assert.equal(subSub.id, null, 'a subagent may not start a task of its own');
    assert.match(subSub.rejected, /cannot spawn further tasks/);

    await awaitTask(lead.id);
  });

  test('a raised maxDepth permits real nesting, for callers that want it', async () => {
    // The depth limit is a default, not a hard-coded rule: a caller that owns
    // its own supervision budget can widen it.
    const parent = createTask({ kind: 'agent', prompt: 'p', run: sleeper(50) });
    const child = createTask({
      kind: 'agent', prompt: 'c', parent: parent.id, run: sleeper(5, { summary: 'c' }),
      permission: PERMISSIONS.TEAMMATE, maxDepth: 3,
    });
    assert.equal(child.task.depth, 2);
    assert.ok(child.id);

    const grandchild = createTask({
      kind: 'agent', prompt: 'g', parent: child.id, run: sleeper(5, { summary: 'g' }),
      permission: PERMISSIONS.TEAMMATE, maxDepth: 3,
    });
    assert.equal(grandchild.task.depth, 3);

    await awaitTask(grandchild.id);
    await awaitTask(child.id);
    await awaitTask(parent.id);
  });

  test('concurrency is capped across every kind, not per kind', async () => {
    const started = [];
    const runs = Array.from({ length: MAX_CONCURRENT }, (_, i) =>
      createTask({ kind: 'command', name: `c${i}`, run: async () => {
        started.push(i);
        await new Promise((r) => setTimeout(r, 40));
      } }),
    );
    assert.ok(runs.every((r) => r.id), 'the first N must all start');

    const overflow = createTask({ kind: 'command', name: 'overflow', run: sleeper(1) });
    assert.equal(overflow.id, null);
    assert.match(overflow.rejected, new RegExp(`${MAX_CONCURRENT}/${MAX_CONCURRENT}`));

    await Promise.all(runs.map((r) => awaitTask(r.id)));
    // And capacity returns: the next task starts.
    const after = createTask({ kind: 'command', name: 'after', run: sleeper(1) });
    assert.ok(after.id, 'capacity must be released when tasks finish');
    await awaitTask(after.id);
  });

  test('an unknown parent is refused rather than silently becoming a root task', () => {
    const r = createTask({ kind: 'agent', prompt: 'x', parent: 'task_deadbeef', run: sleeper() });
    assert.match(r.rejected, /unknown parent task/);
  });
});

// ─── lifecycle ───────────────────────────────────────────────────────────────

describe('task lifecycle', () => {
  test('createTask returns immediately and does not block on the body', async () => {
    const started = Date.now();
    const { id } = createTask({ kind: 'command', run: () => new Promise((r) => setTimeout(r, 60)) });
    assert.ok(Date.now() - started < 40, 'createTask must not await the body');
    await awaitTask(id);
    assert.equal(getTask(id).status, STATUS.DONE);
  });

  test('a successful task records its result', async () => {
    const { id } = createTask({
      kind: 'agent', prompt: 'summarise', run: sleeper(1, { summary: 'the answer', costUsd: 0.01 }),
    });
    const t = await awaitTask(id);
    assert.equal(t.status, STATUS.DONE);
    assert.equal(t.result.summary, 'the answer');
    assert.equal(t.result.costUsd, 0.01);
    assert.ok(t.startedAt && t.finishedAt);
  });

  test('a throwing task fails without rejecting anything', async () => {
    const { id } = createTask({
      kind: 'agent', prompt: 'x',
      run: () => Promise.reject(new Error('model exploded')),
    });
    const t = await awaitTask(id);
    assert.equal(t.status, STATUS.FAILED);
    assert.match(t.error, /model exploded/);
  });

  test('cancel is cooperative and the body observes it', async () => {
    let observed = false;
    const { id } = createTask({
      kind: 'command',
      run: ({ signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => { observed = true; reject(new Error('cancelled')); }, { once: true });
          setTimeout(resolve, 5000);
        }),
    });
    assert.equal(cancelTask(id, 'user stopped it'), true);
    const t = await awaitTask(id);
    assert.equal(observed, true, 'the body must see the signal');
    assert.ok(t.status === STATUS.CANCELLED || t.status === STATUS.FAILED);
  });

  test('cancelling a finished task is a no-op', async () => {
    const { id } = createTask({ kind: 'command', run: sleeper(1) });
    await awaitTask(id);
    assert.equal(cancelTask(id), false);
  });

  test('cancelling an unknown task is false, not a throw', () => {
    assert.equal(cancelTask('task_nope'), false);
  });

  test('awaitTask on an unknown task rejects', async () => {
    await assert.rejects(() => awaitTask('task_nope'), /unknown task/);
  });

  test('awaitTask on a finished task resolves immediately', async () => {
    const { id } = createTask({ kind: 'command', run: sleeper(1) });
    await awaitTask(id);
    assert.equal((await awaitTask(id)).status, STATUS.DONE);
  });

  test('awaitTask times out rather than hanging forever', async () => {
    const { id } = createTask({ kind: 'command', run: () => new Promise((r) => setTimeout(r, 5000)) });
    await assert.rejects(() => awaitTask(id, { timeoutMs: 30 }), /did not finish within/);
    cancelTask(id);
  });
});

// ─── children and events ─────────────────────────────────────────────────────

describe('children and events', () => {
  test('children are addressable and waitable as a group', async () => {
    const parent = createTask({
      kind: 'agent', prompt: 'parent',
      run: ({ id }) => Promise.all([0, 1, 2].map((i) => Promise.resolve(
        createTask({
          kind: 'command', name: `child${i}`, parent: id,
          run: sleeper(5, { summary: `s${i}` }), maxDepth: 3,
        }),
      ))),
    });
    const kids = listChildTasks(parent.id);
    assert.equal(kids.length, 3);
    const done = await awaitChildren(parent.id);
    assert.equal(done.length, 3);
    assert.ok(done.every((t) => t.status === STATUS.DONE));
  });

  test('exactly one lifecycle event stream, with start and one terminal event', async () => {
    // Other suites in this file create tasks too, and `task.started` fires
    // synchronously inside createTask — before the id is returned. So buffer
    // everything and filter once the id is known.
    const all = [];
    const off = onTaskEvent((ev) => all.push({ type: ev.type, id: ev.task?.id }));
    try {
      const { id } = createTask({ kind: 'command', run: sleeper(5) });
      await awaitTask(id);
      const seen = all.filter((e) => e.id === id).map((e) => e.type);
      assert.equal(seen.filter((t) => t === 'task.started').length, 1);
      assert.equal(seen.filter((t) => ['task.finished', 'task.failed', 'task.cancelled'].includes(t)).length, 1);
      assert.deepEqual(seen, ['task.started', 'task.finished']);
    } finally {
      off();
    }
  });

  test('a listener that throws does not take down the task', async () => {
    const off = onTaskEvent(() => { throw new Error('bad listener'); });
    try {
      const { id } = createTask({ kind: 'command', run: sleeper(1) });
      assert.equal((await awaitTask(id)).status, STATUS.DONE);
    } finally {
      off();
    }
  });

  test('unsubscribing actually stops delivery', async () => {
    const seen = [];
    const off = onTaskEvent((ev) => seen.push(ev.type));
    off();
    const { id } = createTask({ kind: 'command', run: sleeper(1) });
    await awaitTask(id);
    assert.equal(seen.length, 0);
  });
});

// ─── listing ─────────────────────────────────────────────────────────────────

describe('listTasks', () => {
  test('filters by status, kind and parent, newest first', async () => {
    const a = createTask({ kind: 'command', name: 'a', run: sleeper(30) });
    const b = createTask({ kind: 'agent', prompt: 'b', run: sleeper(30) });
    const done = createTask({ kind: 'command', name: 'done', run: sleeper(1) });
    await awaitTask(done.id);

    assert.ok(listTasks({ kind: 'command' }).every((t) => t.kind === 'command'));
    assert.ok(listTasks({ status: STATUS.DONE }).every((t) => t.status === STATUS.DONE));
    assert.ok(listTasks({ parent: null }).every((t) => t.parent === null));
    assert.ok(listTasks().length >= 3);
    void a; void b;
    cancelTask(a.id); cancelTask(b.id);
    await Promise.all([awaitTask(a.id), awaitTask(b.id)]);
  });

  test('renderTasks shows the fields that matter and hides nothing', async () => {
    const { id } = createTask({
      kind: 'agent', prompt: 'x', permission: PERMISSIONS.READONLY,
      run: sleeper(1, { summary: 'a summary line' }),
    });
    await awaitTask(id);
    const out = renderTasks([getTask(id)]);
    assert.match(out, /done/);
    assert.match(out, /perm=readonly/);
    assert.match(out, /depth=1/);
    assert.match(out, /a summary line/);
  });

  test('renderTasks on an empty list says so rather than printing nothing', () => {
    assert.match(renderTasks([]), /No tasks/);
  });
});

// ─── worktree isolation (git) ───────────────────────────────────────────────

describe('worktree isolation', () => {
  let repo;
  before(async () => {
    repo = await mkdtemp(join(tmpdir(), 'sentinel-task-git-'));
    const g = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
    g('init', '-q');
    g('config', 'user.email', 't@t.test');
    g('config', 'user.name', 't');
    await writeFile(join(repo, 'value.txt'), 'original\n');
    g('add', '.');
    g('commit', '-qm', 'init');
  });
  after(async () => { resetTasks(); await rm(repo, { recursive: true, force: true }); });

  test('isolation: worktree gives the task its own directory and branch', async () => {
    const { id } = createTask({
      kind: 'agent', prompt: 'edit', cwd: repo, isolation: 'worktree',
      run: async ({ workdir, branch }) => {
        assert.notEqual(workdir, repo, 'the body must not run in the main tree');
        assert.match(branch, /^sentinel\//);
        await writeFile(join(workdir, 'value.txt'), 'changed\n');
        return { summary: 'edited' };
      },
    });
    await awaitTask(id);

    const done = getTask(id);
    assert.equal(done.isolation, 'worktree');
    assert.ok(done.branch);
    assert.equal(
      (await readFile(join(repo, 'value.txt'), 'utf8')).trim(),
      'original',
      'the main tree must be untouched until a merge',
    );
    // Discard, so this test does not leak a worktree into the next one.
    await mergeTask(id, 'discard');
  });

  test('diff returns the patch and keeps the worktree', async () => {
    const { id } = createTask({
      kind: 'agent', prompt: 'edit', cwd: repo, isolation: 'worktree',
      run: async ({ workdir }) => {
        await writeFile(join(workdir, 'value.txt'), 'from diff\n');
      },
    });
    await awaitTask(id);
    const d = await mergeTask(id, 'diff');
    assert.match(d.patch, /from diff/);
    assert.ok(d.files.includes('value.txt'));
    assert.equal(execFileSync('git', ['worktree', 'list'], { cwd: repo, encoding: 'utf8' }).trim().split('\n').length, 2);
    await mergeTask(id, 'discard');
  });

  test('apply lands the patch in the main tree and removes the worktree', async () => {
    const { id } = createTask({
      kind: 'agent', prompt: 'edit', cwd: repo, isolation: 'worktree',
      run: async ({ workdir }) => {
        await writeFile(join(workdir, 'value.txt'), 'merged\n');
      },
    });
    await awaitTask(id);
    const res = await mergeTask(id, 'apply');
    assert.equal(res.applied, true, res.reason || '');
    // Read the working tree, not HEAD: apply writes the files and does not
    // commit. HEAD is still the pre-merge commit, which is correct.
    assert.equal((await readFile(join(repo, 'value.txt'), 'utf8')).trim(), 'merged');
    assert.equal(execFileSync('git', ['worktree', 'list'], { cwd: repo, encoding: 'utf8' }).trim().split('\n').length, 1);
  });

  test('discard removes the worktree without applying', async () => {
    const before = (await readFile(join(repo, 'value.txt'), 'utf8')).trim();
    const { id } = createTask({
      kind: 'agent', prompt: 'edit', cwd: repo, isolation: 'worktree',
      run: async ({ workdir }) => {
        await writeFile(join(workdir, 'value.txt'), 'discarded\n');
      },
    });
    await awaitTask(id);
    assert.equal((await mergeTask(id, 'discard')).discarded, true);
    assert.equal(execFileSync('git', ['worktree', 'list'], { cwd: repo, encoding: 'utf8' }).trim().split('\n').length, 1);
    assert.equal(
      (await readFile(join(repo, 'value.txt'), 'utf8')).trim(),
      before,
      'a discarded task must not change the main tree',
    );
  });

  test('merging a task with no worktree is refused with a reason', async () => {
    const { id } = createTask({ kind: 'agent', prompt: 'x', cwd: repo, run: sleeper(1) });
    await awaitTask(id);
    await assert.rejects(() => mergeTask(id, 'apply'), /did not run in a worktree/);
  });

  test('merging a running task is refused', async () => {
    const { id } = createTask({
      kind: 'agent', prompt: 'x', cwd: repo, isolation: 'worktree',
      run: () => new Promise((r) => setTimeout(r, 5000)),
    });
    await assert.rejects(() => mergeTask(id, 'apply'), /still running/);
    cancelTask(id);
    await awaitTask(id);
  });

  test('an unknown merge action is refused', async () => {
    const { id } = createTask({
      kind: 'agent', prompt: 'x', cwd: repo, isolation: 'worktree', run: sleeper(1),
    });
    await awaitTask(id);
    await assert.rejects(() => mergeTask(id, 'obliterate'), /unknown merge action/);
    await mergeTask(id, 'discard');
  });

  test('merging or discarding twice is refused by name, not by a git ENOENT', async () => {
    const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
    // Commit whatever the previous test left behind: an uncommitted main tree
    // would make this patch conflict, and a failed apply never sets
    // mergeState, so the guard under test would never be reached.
    git('add', '-A');
    git('commit', '-qm', 'baseline', '--allow-empty');

    const merged = createTask({
      kind: 'agent', prompt: 'x', cwd: repo, isolation: 'worktree',
      run: async ({ workdir }) => { await writeFile(join(workdir, 'value.txt'), 'twice\n'); },
    });
    await awaitTask(merged.id);
    const first = await mergeTask(merged.id, 'apply');
    assert.equal(first.applied, true, first.reason || 'apply must succeed to reach the guard');

    await assert.rejects(() => mergeTask(merged.id, 'apply'), /already merged/);
    await assert.rejects(() => mergeTask(merged.id, 'diff'), /already merged/);

    git('add', '-A');
    git('commit', '-qm', 'after merge', '--allow-empty');

    const dropped = createTask({
      kind: 'agent', prompt: 'x', cwd: repo, isolation: 'worktree',
      run: async ({ workdir }) => { await writeFile(join(workdir, 'value.txt'), 'gone\n'); },
    });
    await awaitTask(dropped.id);
    await mergeTask(dropped.id, 'discard');
    await assert.rejects(() => mergeTask(dropped.id, 'apply'), /already discarded/);
  });

  test('a command task never gets a worktree even if asked', async () => {
    const { id, task } = createTask({
      kind: 'command', cwd: repo, isolation: 'worktree', run: sleeper(1),
    });
    await awaitTask(id);
    assert.equal(task.isolation, 'none', 'a shell command has nothing to isolate');
    assert.equal(task.workdir, repo);
  });
});

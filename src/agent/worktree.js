/**
 * Git worktree lifecycle for isolated agents (learn-claude-code s12):
 * create → agent works → collect a patch against the base commit →
 * apply it to the main tree (checkpointed, so undoLastChange reverts it) →
 * remove the worktree and its branch.
 *
 * Everything shells out to git with execFileSync (no shell parsing of
 * names or paths).
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { tmpdir } from 'node:os';

const git = (args, cwd, opts = {}) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...opts });

export function repoRoot(cwd) {
  try {
    return git(['rev-parse', '--show-toplevel'], cwd).trim();
  } catch {
    throw new Error('worktree isolation needs a git repository');
  }
}

function excludeWorktrees(root) {
  try {
    const rel = git(['rev-parse', '--git-path', 'info/exclude'], root).trim();
    const file = isAbsolute(rel) ? rel : join(root, rel);
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (!current.split(/\r?\n/).includes('.sentinel/worktrees/')) {
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, `${current && !current.endsWith('\n') ? '\n' : ''}.sentinel/worktrees/\n`);
    }
  } catch { /* cosmetic: keeps the nested worktree out of `git status` */ }
}

/** Create `.sentinel/worktrees/<name>` on a fresh branch at HEAD. */
export function createWorktree(name, cwd) {
  const root = repoRoot(cwd);
  const base = join(root, '.sentinel', 'worktrees');
  mkdirSync(base, { recursive: true });
  const dir = join(base, name);
  if (existsSync(dir)) throw new Error(`worktree already exists: ${relative(root, dir)}`);
  const baseSha = git(['rev-parse', 'HEAD'], root).trim();
  const branch = `sentinel/${name}-${Date.now().toString(36)}`;
  git(['worktree', 'add', '-b', branch, dir, baseSha], root);
  excludeWorktrees(root);
  return { dir, branch, baseSha, root };
}

/**
 * Everything the agent changed in the worktree (committed or not, including
 * new files) as one binary-safe patch against the base commit.
 */
/** Harness runtime state the agent produces as a side effect — never part of its work. */
export const RUNTIME_PATHSPECS = Object.freeze([
  ':(exclude).sentinel/audits',
  ':(exclude).sentinel/checkpoints',
  ':(exclude).sentinel/redo',
  ':(exclude).sentinel/trajectories',
  ':(exclude).sentinel/worktrees',
  ':(exclude).sentinel/todos.json',
]);

export function worktreePatch(dir, baseSha) {
  git(['add', '-A', '--', '.', ...RUNTIME_PATHSPECS], dir);
  const scope = ['--', '.', ...RUNTIME_PATHSPECS];
  const patch = git(['diff', '--cached', '--binary', baseSha, ...scope], dir);
  const files = git(['diff', '--cached', '--name-only', baseSha, ...scope], dir).split('\n').filter(Boolean);
  const numstat = git(['diff', '--cached', '--numstat', baseSha, ...scope], dir).split('\n').filter(Boolean);
  let added = 0;
  let removed = 0;
  for (const line of numstat) {
    const [a, r] = line.split('\t');
    added += Number(a) || 0;
    removed += Number(r) || 0;
  }
  return { patch, files, added, removed };
}

/**
 * Apply a patch to the main tree. Plain apply first; on conflict fall back
 * to a 3-way merge. Touched files are checkpointed beforehand.
 */
export async function applyPatchToRoot(root, patch, files = []) {
  if (!patch.trim()) return { applied: false, reason: 'empty patch', files: [] };
  try {
    const { createCheckpoint } = await import('../shared/tools/checkpoint.js');
    const { runInWorkdir } = await import('../shared/tools/workdir.js');
    await runInWorkdir(root, () => createCheckpoint(files.map((f) => join(root, f))));
  } catch { /* checkpoint is best-effort, the patch is still recoverable from the branch */ }
  const tmp = join(tmpdir(), `sentinel-merge-${Date.now()}-${Math.random().toString(36).slice(2)}.patch`);
  writeFileSync(tmp, patch);
  try {
    try {
      git(['apply', '--whitespace=nowarn', tmp], root);
      return { applied: true, method: 'apply', files };
    } catch {
      try {
        git(['apply', '--3way', '--whitespace=nowarn', tmp], root);
        return { applied: true, method: '3way', files };
      } catch (e) {
        return { applied: false, reason: String(e.stderr || e.message).trim().slice(0, 2000), files };
      }
    }
  } finally {
    try { unlinkSync(tmp); } catch { /* ignore */ }
  }
}

export function removeWorktree({ dir, branch, root }) {
  try { git(['worktree', 'remove', '--force', dir], root); } catch { /* already gone */ }
  if (branch) {
    try { git(['branch', '-D', branch], root); } catch { /* already gone */ }
  }
}

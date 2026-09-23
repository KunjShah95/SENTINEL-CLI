/**
 * Minimal git helpers (sync, child_process based) — used by TUI commands
 * like /diff and /commit. No external git library.
 */
import { execSync } from 'child_process';

export type GitDiffOptions = {
  staged?: boolean;
  branch?: string;
  file?: string;
};

function run(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 });
  } catch {
    return null;
  }
}

/** Unified diff for staged changes, a branch, a file, or the working tree. */
export function getGitDiff(opts: GitDiffOptions = {}): string | null {
  if (opts.staged) return run('git diff --cached --no-color');
  if (opts.branch) return run(`git diff --no-color ${JSON.stringify(opts.branch)}...HEAD`);
  if (opts.file) return run(`git diff --no-color HEAD -- ${JSON.stringify(opts.file)}`);
  const working = run('git diff --no-color');
  if (working && working.trim()) return working;
  return run('git diff --cached --no-color');
}

/** Files touched by the staged diff or vs a branch. */
export function getChangedFiles(opts: GitDiffOptions = {}): string[] {
  const out = opts.staged
    ? run('git diff --cached --name-only')
    : opts.branch
      ? run(`git diff --name-only ${JSON.stringify(opts.branch)}...HEAD`)
      : run('git diff --name-only HEAD');
  if (!out) return [];
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

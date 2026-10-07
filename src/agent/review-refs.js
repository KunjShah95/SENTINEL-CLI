/**
 * The diff inputs to a review — everything that has to work with no network.
 *
 * Four shapes, because a reviewer is useful against more than one thing:
 *
 *   uncommitted   `git diff HEAD` — the work in front of you right now
 *   a branch      `git diff <base>...HEAD` — what a branch changed
 *   a worktree    the patch an existing task produced, via worktreePatch
 *   staged        `git diff --cached` — what is about to be committed
 *
 * The no-network constraint is the design, not a limitation. It is what makes
 * this testable, what makes `sentinel review` work offline and behind a proxy,
 * and what keeps a credential out of the CLI. Reading a pull request from GitHub
 * is a separate concern with a separate cost and a separate failure mode.
 */
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { parsePatches, diffSize } from './review-diff.js';
import { worktreePatch } from './worktree.js';

const exec = promisify(execFile);

export const REVIEW_MAX_LINES = 800;

/** Largest file read as text. Beyond this a finding is not about one file. */
const MAX_FILE_BYTES = 200_000;

/** Run git in a directory. Never throws for a non-zero exit. */
async function git(args, cwd, timeoutMs = 30_000) {
  const { stdout } = await exec('git', args, { cwd, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

/** Is this a git repository, and is there anything to commit? */
export async function repoState(cwd) {
  try {
    const inside = await git(['rev-parse', '--is-inside-work-tree'], cwd);
    if (inside.trim() !== 'true') return { isRepo: false, head: null, branch: null, dirty: false };
  } catch {
    return { isRepo: false, head: null, branch: null, dirty: false };
  }
  const [head, branch] = await Promise.all([
    git(['rev-parse', 'HEAD'], cwd).then((s) => s.trim()).catch(() => null),
    git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd).then((s) => s.trim()).catch(() => null),
  ]);
  const dirty = await git(['status', '--porcelain'], cwd).then((s) => s.trim().length > 0).catch(() => false);
  return { isRepo: true, head, branch, dirty };
}

/**
 * Every reviewable diff in a repository, as parsed files.
 *
 * @returns {Promise<{files: object[], ref: string|null, kind: string, stats: object}>}
 */
export async function collectReviewableDiff({ cwd, base = null, staged = false, patch = null }) {
  // An explicit patch wins: that is how a task's worktree diff gets reviewed
  // without touching the main checkout.
  if (patch != null) {
    const files = parsePatches([patch]);
    return { files, ref: base, kind: 'patch', stats: withCount(diffSize(files)) };
  }

  if (base) {
    // Three dots, not two: the diff a reviewer wants is what this branch added on
    // top of where it forked, not everything differing from the current tip.
    const out = await git(['diff', '--no-color', '--unified=3', `${base}...HEAD`], cwd);
    const files = parsePatches(splitPatches(out));
    return { files, ref: `${base}...HEAD`, kind: 'branch', stats: withCount(diffSize(files)) };
  }

  if (staged) {
    const out = await git(['diff', '--no-color', '--unified=3', '--cached'], cwd);
    const files = parsePatches(splitPatches(out));
    return { files, ref: 'staged changes', kind: 'staged', stats: withCount(diffSize(files)) };
  }

  // Uncommitted, staged plus unstaged: a review of "the work in front of you"
  // that silently ignores half of it is worse than no review.
  const out = await git(['diff', '--no-color', '--unified=3', 'HEAD'], cwd);
  const files = parsePatches(splitPatches(out));

  // Untracked files are part of the change someone is about to commit, and
  // `git diff HEAD` does not include them. Treating a brand new file as "no
  // change" is exactly the silent gap this feature exists to avoid.
  const untracked = await git(['ls-files', '--others', '--exclude-standard'], cwd).catch(() => '');
  for (const rel of untracked.split('\n').map((s) => s.trim()).filter(Boolean)) {
    if (files.some((f) => f.path === rel)) continue;
    const parsed = parseUntracked(cwd, rel);
    if (parsed) files.push(parsed);
  }

  return {
    files,
    ref: 'uncommitted changes',
    kind: 'uncommitted',
    stats: withCount(diffSize(files)),
  };
}

/**
 * Synthesise an all-additions patch for a new file.
 *
 * The file's contents become the diff, so findings can point at real line
 * numbers in it — which is the property the whole review rests on.
 */
export function parseUntracked(cwd, rel) {
  let text;
  try {
    text = readFileSync(`${cwd}/${rel}`, 'utf-8');
  } catch {
    return null;
  }
  // A NUL byte is the usual marker for a binary file read as utf-8. There is no
  // line-oriented review of a PNG, and pretending otherwise skips it silently.
  if (text.includes('\u0000') || text.length > MAX_FILE_BYTES) return null;

  const body = text.split('\n');
  // A trailing newline yields a final empty element that is not a source line.
  if (body.length && body[body.length - 1] === '') body.pop();

  const patch = [
    '--- /dev/null',
    `+++ b/${rel}`,
    `@@ -0,0 +1,${body.length} @@`,
    ...body.map((line) => `+${line}`),
  ].join('\n');
  return parsePatches([patch])[0] || null;
}

/**
 * Split a multi-file `git diff` into one patch per file.
 *
 * `diff --git` starts a file, and that is the boundary to trust: a hunk header
 * can appear inside file content, and `diff --git` appears in commit messages.
 */
export function splitPatches(stdout) {
  const out = [];
  let current = null;
  for (const line of (stdout || '').split('\n')) {
    if (line.startsWith('diff --git ')) {
      if (current) out.push(current.join('\n'));
      current = [];
      continue;
    }
    if (current) current.push(line);
  }
  if (current) out.push(current.join('\n'));
  return out.filter((p) => p.includes('\n--- ') || p.startsWith('--- '));
}

/** The diff an existing task produced, for reviewing a teammate's work. */
export function reviewTargetWorktree({ dir, baseSha }) {
  const patch = worktreePatch(dir, baseSha);
  const files = patch?.patch ? parsePatches([patch.patch]) : [];
  return {
    files,
    ref: baseSha ? `worktree vs ${baseSha.slice(0, 7)}` : 'worktree',
    kind: 'worktree',
    stats: withCount(diffSize(files)),
  };
}

function withCount(stats) {
  return {
    files: stats.fileCount ?? 0,
    additions: stats.additions,
    deletions: stats.deletions,
    total: stats.total,
  };
}

/**
 * Should this diff be reviewed at all?
 *
 * The cap is the only cost control, and it is checked before anything reaches a
 * model. A refusal carries a reason, because a bare boolean cannot distinguish
 * "decided not to look" from "broken".
 *
 * Kept as its own narrow function because `sentinel review` has no author, no
 * draft state and no origin — it is reviewing the tree in front of it, which is
 * trusted by construction. The full `decideReview` in `review-policy.js` handles
 * the hosted case where those are all present. Both share one cap.
 */
export function decideReviewable({ stats, maxLines = REVIEW_MAX_LINES }) {
  if (!stats || !stats.files) {
    return { review: false, reason: 'no changes to review' };
  }
  if (stats.total > maxLines) {
    return { review: false, reason: `diff is ${stats.total} lines, over the ${maxLines}-line cap` };
  }
  return { review: true, reason: `${stats.files} file(s), +${stats.additions} -${stats.deletions}` };
}

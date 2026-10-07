/**
 * Checking out a pull request.
 *
 * A review needs the changed files on disk, and there are exactly two ways to
 * get them: ask GitHub for the patch and apply it, or clone the repository and
 * check out the head. PR Owl does the second, and the reason is worth stating
 * because it looks like unnecessary work.
 *
 * Applying a patch gives the agent a diff and nothing else. The reviewer then
 * has to reconstruct the file's context by eye, which is exactly where a
 * reviewer's judgement is worst: it cannot grep for the callers of a function
 * it is looking at, cannot read the module the change is imported by, and
 * cannot tell whether a changed line is dead code. Cloning gives it the
 * repository, and the changed files are simply the working tree.
 *
 * The cost is a clone. That is bounded by caching one clone per repository on
 * disk and fetching, which is a few seconds of network rather than a few
 * hundred megabytes.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export type CheckoutOptions = {
  /** Where clones live. One directory per repo, reused across reviews. */
  cacheDir: string;
  /** The PR's base branch, e.g. `main`. */
  baseRef: string;
  /** ms. A clone of a large monorepo is the slowest thing in a review. */
  timeoutMs?: number;
};

/**
 * Fetch, check out the head, and leave the working tree on the PR's commit.
 *
 * `git fetch` is called with an explicit refspec rather than `git pull`, and
 * `git checkout --force` rather than a bare checkout, because the cache
 * directory is reused: without both, the second review of a repository fails on
 * a dirty tree left by the first.
 */
export async function checkoutPr(
  repoUrl: string,
  headSha: string,
  opts: CheckoutOptions,
): Promise<{ dir: string; reused: boolean }> {
  const dir = join(opts.cacheDir, cacheKey(repoUrl));
  mkdirSync(opts.cacheDir, { recursive: true });

  const git = (args: string[], cwd?: string) =>
    exec('git', args, { cwd, timeout: opts.timeoutMs ?? 120_000, maxBuffer: 32 * 1024 * 1024 });

  let reused = false;
  try {
    await git(['rev-parse', '--git-dir'], dir);
    reused = true;
  } catch {
    rmSync(dir, { recursive: true, force: true });
    await git(['clone', '--filter=blob:none', '--no-checkout', repoUrl, dir]);
  }

  // Shallow enough to stay quick, deep enough that a base-branch comparison has
  // something to compare against.
  await git(['fetch', '--depth', '50', 'origin', `+refs/heads/${opts.baseRef}:refs/remotes/origin/${opts.baseRef}`, headSha], dir);
  await git(['checkout', '--force', '--detach', headSha], dir);
  // A PR's own commits must not be able to install hooks that outlive the
  // review, and the index must be clean or the diff the agent reads is fiction.
  await git(['reset', '--hard', headSha], dir);
  await git(['clean', '-fdx', '-e', 'node_modules'], dir);

  return { dir, reused };
}

/** Repository URL for the API's clone endpoint. */
export function cloneUrl(repoFullName: string): string {
  return `https://github.com/${repoFullName}.git`;
}

/**
 * A cache directory name that cannot collide.
 *
 * The obvious choice is a slug: replace slashes with dashes. It is not injective —
 * `acme/api` and `acme-api` both become `acme-api` — and a collision is the worst
 * failure this module has: the second review finds an existing clone, treats it as
 * its own, and comments on one repository with line numbers from another. The
 * first 16 hex characters of a hash over the URL cannot collide in practice.
 */
export function cacheKey(repoUrl: string): string {
  const normalised = repoUrl.replace(/^https?:\/\//, '').replace(/\.git$/, '');
  return createHash('sha256').update(normalised).digest('hex').slice(0, 16);
}

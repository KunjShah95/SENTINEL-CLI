/** Shared shapes. Kept in one file so the route and the queue cannot disagree. */

import type { FileDiff } from './diff';

/**
 * What the webhook route hands the queue.
 *
 * `headRepo`, `title`, `body`, `author`, `draft` and `baseRef` ride along rather
 * than being fetched again, because they are already in the webhook payload. The
 * only thing that genuinely needs an API call is the file list, which is not in
 * the event.
 */
export type QueueJob = {
  id: string;
  repo: string;
  prNumber: number;
  headSha: string;
  headRepo: string | null;
  title: string;
  body: string | null;
  author: string;
  draft: boolean;
  baseRef: string;
};

/** The subset of GitHub's pull_request payload PR Owl reads. */
export type PullRequestEvent = {
  action: string;
  repository: { full_name: string };
  pull_request: {
    number: number;
    title: string;
    body: string | null;
    draft: boolean;
    user: { login: string };
    head: { sha: string; repo: { full_name: string | null } | null };
    base: { repo: { full_name: string } };
    additions: number;
    deletions: number;
    changed_files: number;
  };
  installation?: { id: number };
};

/** One file from GET /repos/{owner}/{repo}/pulls/{n}/files. */
export type GitHubFile = {
  filename: string;
  previous_filename?: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
};

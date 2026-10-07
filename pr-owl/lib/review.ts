/**
 * The reviewer: one task, one pull request.
 *
 * This is the file where the unification pays for itself. A PR review is
 * concurrent work — several repositories, several PRs, several reviewer passes
 * over one diff — and before the primitive it would have needed its own status
 * store, its own permission policy and its own cancellation. Instead it is one
 * `createTask` call with a rung chosen from the same ladder as everything else:
 *
 *   same-repo PR   teammate   read/write, but the checked-out copy is ours
 *   fork PR        readonly   the head commit is a stranger's code
 *
 * The second line is the whole security model of an autonomous reviewer, and it
 * is now enforced by the same code that stops a subagent editing files.
 */

import { DEFAULT_CHAT_MODEL_ID } from '../../src/shared/models/index.js';
import type { FileDiff } from './diff.js';
import { runReview, stripJson } from '../../src/agent/review.js';
import type { QueueJob } from './types.js';

export type Finding = {
  path: string;
  line: number;
  side: 'RIGHT' | 'LEFT';
  severity: 'critical' | 'warning' | 'nit';
  message: string;
};

export type ReviewOutcome = {
  summary: string;
  findings: Finding[];
  /** Findings the diff parser could not place. Reported, never posted silently. */
  dropped: Array<{ path: string; line: number; reason: string }>;
  costUsd: number;
  model: string;
};

/**
 * Run one review.
 *
 * This used to build its own task and drive its own agent turn, duplicating
 * Sentinel's `runReview`. It now delegates. Three of the things it had drifted
 * on were not cosmetic:
 *
 *   - it did not pass `subagentDepth: 1`, so a review of a stranger's patch
 *     could spawn teammates;
 *   - it did not pass the `rung`, so every call the reviewer made was recorded
 *     as *not assessable* rather than as clean;
 *   - it re-derived its own model text, so the `## PR Owl` body lost the prose
 *     the model wrote when it supplied no structured summary.
 *
 * The task's `run` returns the outcome rather than posting anything. Posting is
 * the caller's job, on purpose: a task should produce a result, and something
 * that can fail independently should perform the side effect. A review whose
 * comments are rejected by the API is still a review that cost money.
 */
export async function reviewPullRequest(
  job: QueueJob,
  opts: {
    repoDir: string;
    files: FileDiff[];
    additions: number;
    deletions: number;
    brief: string;
    readOnly: boolean;
    model?: string;
    /** Injected in tests; production leaves it unset and the loop streams for real. */
    createStream?: unknown;
  },
): Promise<ReviewOutcome> {
  const model = opts.model || process.env.PR_OWL_MODEL || DEFAULT_CHAT_MODEL_ID;

  const out = await runReview({
    brief: opts.brief,
    // The repository is already checked out into a directory PR Owl owns. A
    // worktree here would be a second copy of a tree nothing will merge.
    cwd: opts.repoDir,
    readOnly: opts.readOnly,
    model,
    name: `review-${job.repo.replace('/', '-')}-${job.prNumber}`,
    owner: 'pr-owl',
    meta: { repo: job.repo, pr: job.prNumber, headSha: job.headSha },
    createStream: (opts.createStream ?? null) as never,
    files: opts.files,
  });

  return {
    // PR Owl's own body: the finding counts plus the model's prose, which
    // `runReview` hands back as `raw` rather than leaving us to reconstruct it.
    summary: summarise(out.raw, out.findings),
    findings: out.findings as Finding[],
    dropped: out.dropped,
    costUsd: out.costUsd,
    model,
  };
}

/**
 * There is no cancel path, and that is not an oversight.
 *
 * An earlier version had `cancelReview()`, which called
 * `cancelTask(`pr-owl:${prKey}`)` — an id that no `createTask` call ever returns,
 * so it could not have cancelled anything. It was never called either. When a
 * pull request gets a new head mid-review the right behaviour is the one the
 * queue already implements: let the running review finish against the head it
 * was given, and review the newer head afterwards. Cancelling would discard a
 * paid-for review and still have to run the next one.
 */

/** The comment PR Owl posts as the review body. */
export function summarise(text: string, findings: Finding[]): string {
  const counts = { critical: 0, warning: 0, nit: 0 };
  for (const f of findings) counts[f.severity]++;

  const header = findings.length
    ? `${counts.critical} critical, ${counts.warning} warning, ${counts.nit} nit.`
    : 'No defects found.';

  // Cut the payload out with the SAME scanner that parsed it, by delegating to
  // Sentinel's `stripJson`. This used to be a third copy of that scan, and the
  // two had already drifted — this one collapsed runs of blank lines and
  // Sentinel's does not. The failure mode is a review body showing raw JSON,
  // which looks broken rather than merely wrong.
  const prose = stripJson(text);

  return [`## PR Owl`, '', header, '', prose].filter(Boolean).join('\n').slice(0, 65_000);
}

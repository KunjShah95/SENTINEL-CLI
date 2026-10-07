/**
 * Review policy now lives in Sentinel. This file is a shim.
 *
 * The decision logic is not GitHub-specific — "is this worth a model call, and is
 * the reviewer allowed to write?" applies equally to a hosted reviewer and to
 * `sentinel review`. It moved to `src/agent/review-policy.js` so there is one
 * implementation, because two copies of a cost cap drift and a drifted cost cap
 * is an invoice nobody predicted.
 *
 * What stays here: the GitHub-shaped input. This file turns a pull request event
 * and a list of changed files into the subject `decideReview` expects.
 */
import {
  decideReview,
  buildPolicyBrief,
  DEFAULT_REVIEW_POLICY,
  GENERATED_PATTERNS,
  isGeneratedOnly,
} from '../../src/agent/review-policy.js';
import { isUntrustedOrigin, exceedsDiffCap, describeTrust } from '../../src/agent/review-trust.js';

import type { FileDiff } from './diff.js';

// `isFromFork` is the name this app always used; the shared function is the more
// precise `isUntrustedOrigin`, which also covers a fork that no longer exists.
export { decideReview, isGeneratedOnly, GENERATED_PATTERNS, DEFAULT_REVIEW_POLICY };
export { isUntrustedOrigin as isFromFork, exceedsDiffCap, describeTrust };
export { buildPolicyBrief };

/** The GitHub-shaped fields of a pull request that policy needs. */
export type ReviewRequest = {
  repo: string;
  prNumber: number;
  /** `head.repo.full_name` — null for a fork whose repository was deleted. */
  headRepo: string | null;
  baseRepo: string;
  headSha: string;
  title: string;
  body: string | null;
  author: string;
  draft: boolean;
  additions: number;
  deletions: number;
  files: FileDiff[];
};

/**
 * Adapt a pull request to the shared decision function.
 *
 * The one interesting line is the `trusted` computation, and it is deliberately
 * `isUntrustedOrigin` rather than `source !== headRepo`. A deleted fork arrives
 * with `head.repo` as null, and an equality check would report that as "not a
 * fork" — granting a stranger's commit full authority in exactly the case where
 * you know least about where it came from.
 */
export function decidePullRequest(req: ReviewRequest, policy = DEFAULT_REVIEW_POLICY) {
  const trusted = !isUntrustedOrigin(req.baseRepo, req.headRepo);
  return decideReview(
    {
      source: req.repo,
      author: req.author,
      draft: req.draft,
      trusted,
      additions: req.additions,
      deletions: req.deletions,
      files: req.files,
    },
    policy,
  );
}

/**
 * The review brief.
 *
 * The `untrusted` flag reaches the prompt as well as the rung, because an agent
 * that does not know it is reading a stranger's code reasons about it differently.
 * Enforcement is still the ladder — this is a hint, not a control.
 */
export function buildBriefForPullRequest(
  req: ReviewRequest,
  decision?: { review?: boolean; readOnly?: boolean },
): string {
  return buildPolicyBrief({
    title: req.title,
    ref: `pull request #${req.prNumber} on ${req.repo} @ ${req.headSha.slice(0, 7)}`,
    // `baseRepo` is the authoritative origin and `headRepo` is where this
    // change actually came from. When they differ the head is a stranger's
    // commit — including when it is null, which is a deleted fork and the case
    // where we know least.
    untrusted: isUntrustedOrigin(req.baseRepo ?? req.repo, req.headRepo),
    stats: { files: req.files.length, additions: req.additions, deletions: req.deletions },
    // Read-only unless a caller explicitly says otherwise. Defaulting the other
    // way would let a caller that forgot to pass a decision hand write access to
    // an untrusted review.
    readOnly: decision?.readOnly ?? true,
  });
}

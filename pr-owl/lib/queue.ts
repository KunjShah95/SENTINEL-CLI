/**
 * PR Owl's reusable half now lives in Sentinel. This file is a shim.
 *
 * The direction of dependency was backwards. `pr-owl/` reached up into
 * `../../src/agent/` for the task primitive, the loop and the diff parser, while
 * keeping its own copies of the diff parser, the finding validator and the JSON
 * scanner. Six imports pointed out of the app and into the CLI, and two of the
 * things on that list had already drifted — see `lib/diff.ts`.
 *
 * The fix is to invert it: Sentinel owns the reusable half (`review-diff`,
 * `review`, `review-refs`, `review-queue`, `review-policy`, `review-trust`) and
 * this app is a delivery shell — HTTP in, GitHub API out, nothing else.
 *
 * What legitimately stays here is `github.ts` (the REST calls), `checkout.ts`
 * (git), `webhook.ts` (signature verification for GitHub's specific headers) and
 * `owl.ts` (the composition root). Those are transport concerns, and transport
 * concerns belong to the app that has the transport.
 */

// The queue, policy and trust model all moved. They are not GitHub-specific and
// not reviewer-specific: they are "start work, but do it once" and "should this
// be done at all, and under what authority".
export {
  CoalescingQueue,
  pullRequestKey,
  jobId,
  DEFAULT_CONCURRENCY,
  DEFAULT_MAX_QUEUED,
  DEFAULT_JOB_TIMEOUT_MS,
} from '../../src/agent/review-queue.js';

export {
  decideReview,
  buildPolicyBrief,
  isGeneratedOnly,
  GENERATED_PATTERNS,
  DEFAULT_REVIEW_POLICY,
  REVIEW_MAX_LINES_DEFAULT,
} from '../../src/agent/review-policy.js';

export {
  isTrustedOrigin,
  isUntrusted,
  isUntrustedOrigin,
  exceedsDiffCap,
  describeTrust,
} from '../../src/agent/review-trust.js';

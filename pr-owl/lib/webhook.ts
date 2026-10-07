/**
 * GitHub webhook signature verification.
 *
 * This is the one piece of PR Owl that must be exactly right, because it is
 * the only thing standing between the public internet and a reviewer that
 * spends money and posts comments on your repository.
 *
 * GitHub signs each delivery with `X-Hub-Signature-256: sha256=<hex>`:
 *
 *   digest = HMAC-SHA256(key = webhook secret, message = <the RAW body>)
 *
 * Three failure modes, each of which has shipped a security bug somewhere:
 *
 *   1. Verifying the RE-SERIALISED body. `JSON.parse` then `JSON.stringify`
 *      does not round-trip — key order survives, but whitespace, number
 *      formatting and unicode escapes do not. The digest will not match a
 *      legitimately signed delivery, or worse, will match after you "fix" it by
 *      normalising both sides, which lets an attacker choose their own
 *      canonical form.
 *      -> This is why `verify` takes a string that was never parsed.
 *
 *   2. Using `===` to compare digests. A string comparison returns on the first
 *      differing byte, so its running time leaks how much of a guessed digest
 *      was correct. `timingSafeEqual` is the fix, and it throws on a length
 *      mismatch rather than returning false — so the lengths are compared first.
 *
 *   3. Verifying AFTER acting. Everything that costs money or touches a
 *      repository must happen behind the check.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'x-hub-signature-256';
export const DELIVERY_HEADER = 'x-github-delivery';
export const EVENT_HEADER = 'x-github-event';

/** The events PR Owl acts on. Everything else is acknowledged and ignored. */
export const HANDLED_EVENTS = Object.freeze([
  'pull_request',
  'pull_request_review_comment',
  'check_suite',
]);

/**
 * Only these actions start a review. `opened` and `synchronize` are the two
 * that matter: one is a new PR, the other is a push to the branch.
 *
 * `closed` and `edited` are excluded on purpose. A review triggered by someone
 * fixing a typo in the description costs a model call to say the same thing
 * again, and on a busy repository that is how an AI reviewer becomes the most
 * expensive line item in the CI bill.
 */
export const REVIEWED_ACTIONS = Object.freeze(['opened', 'synchronize', 'reopened']);

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'missing-signature' | 'malformed-signature' | 'no-secret' | 'mismatch' };

/**
 * Verify a delivery. `rawBody` must be the exact bytes GitHub sent.
 *
 * Returns a result rather than throwing: a rejected delivery is an ordinary
 * event (a misconfigured proxy strips the header), not an exception the caller
 * should have to wrap.
 */
export function verifySignature(rawBody: string, signature: string | null | undefined, secret: string | null | undefined): VerifyResult {
  if (!secret) return { ok: false, reason: 'no-secret' };
  if (!signature) return { ok: false, reason: 'missing-signature' };
  if (!signature.startsWith('sha256=')) return { ok: false, reason: 'malformed-signature' };

  const expected = `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  // timingSafeEqual throws on unequal lengths, so a truncated or padded
  // signature is a mismatch, not a 500.
  if (a.length !== b.length) return { ok: false, reason: 'mismatch' };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: 'mismatch' };
}

/** Should this delivery start a review? */
export function shouldReview(event: string | null | undefined, action: string | null | undefined): boolean {
  if (!event || !HANDLED_EVENTS.includes(event)) return false;
  if (event !== 'pull_request') return false;
  return !!action && REVIEWED_ACTIONS.includes(action);
}

/**
 * Is this a PR from a fork?
 *
 * The dangerous case for a reviewer with write access: a fork's head commit is
 * attacker-controlled code, and any step that executes it — a test run, a
 * build, a linter — runs on our infrastructure. Flagged for the caller to
 * decide on; see `policy.ts`.
 */
export function isFromFork(repoFullName: string, headRepoFullName: string | null | undefined): boolean {
  if (!headRepoFullName) return true;
  return headRepoFullName !== repoFullName;
}

/** Refuse to act on a PR that asks for too much. A diff cap is a cost cap. */
export function exceedsDiffCap(additions: number, deletions: number, cap: number): boolean {
  return additions + deletions > cap;
}

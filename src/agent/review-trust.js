/**
 * Trust classification for reviewed work.
 *
 * Moved into Sentinel from the PR Owl app, and generalised: it started as "is
 * this a fork?" and is now "do I control the origin of this code?"
 *
 * The distinction is the security model of an autonomous reviewer. A change
 * authored in your own repository is code you wrote. A change whose head commit
 * someone else chose is code an attacker chose, and anything that executes it —
 * a test command, a build, a linter, a `postinstall` hook — is remote code
 * execution on your infrastructure.
 *
 * Nothing here can make that safe on its own. It decides WHO gets the stronger
 * rung; the rung itself is `task.js`'s permission ladder, the same code that stops
 * a subagent editing files.
 */

/**
 * Is this change's origin one we control?
 *
 * Defaults to TRUE when there is nothing to compare. That is the dangerous
 * direction to fail in: an absent comparison means "trusted", so a caller that
 * forgets to pass `sourceRef` gets full authority rather than none.
 *
 * @param {string} source       the authoritative origin, e.g. `acme/api`
 * @param {string|null} sourceRef where this change actually came from
 * @returns {boolean} true when the origin is ours
 */
export function isTrustedOrigin(source, sourceRef) {
  if (!sourceRef) return true;
  return sourceRef === source;
}

/**
 * Why the two defaults differ, because it looks like an inconsistency.
 *
 * `isTrustedOrigin` answers "are these the same?" and returns true when there is
 * nothing to compare — a local working copy has no origin to check, and refusing
 * to review your own uncommitted work would make the feature useless.
 *
 * `isUntrustedOrigin` answers "is this a foreign commit?" and returns TRUE when
 * there is nothing to compare, because a foreign commit with no recorded origin
 * is exactly the case you know least about. A fork whose head repository has
 * been deleted arrives with no ref at all; treating that as "not a fork" grants a
 * stranger's commit full authority, because the one case where you know least is
 * the case you would trust most.
 *
 * @param {string} source
 * @param {string|null} sourceRef
 * @returns {boolean} true when the origin is foreign or unknown
 */
export function isUntrustedOrigin(source, sourceRef) {
  if (!sourceRef) return true;
  return sourceRef !== source;
}

/**
/**
 * Whether a reviewed change's origin is one we control.
 *
 * An ALIAS for `isUntrustedOrigin`, named for the property the callers actually
 * branch on. Kept so that `review-policy.js` reads as prose and does not have to
 * explain a double negative at every call site.
 *
 * @returns {boolean} true when the origin is foreign or unknown
 */
export function isUntrusted(source, sourceRef) {
  return isUntrustedOrigin(source, sourceRef);
}

/**
 * The one cap that works before any token is spent.
 *
 * @returns {boolean} true when the change is too large to review
 */
export function exceedsDiffCap(additions, deletions, cap) {
  return (Number(additions) || 0) + (Number(deletions) || 0) > cap;
}

/**
 * A short, stable label for a review's origin, for logs and reports.
 *
 * Deliberately coarse. Anything finer invites someone to treat the label as a
 * guarantee, and the only guarantee here is which rung the reviewer got.
 */
export function describeTrust(trusted) {
  return trusted ? 'trusted' : 'untrusted';
}

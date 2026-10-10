/**
 * The version — one place that knows it.
 *
 * ## Why this exists
 *
 * The version string was in six places and only one of them was the truth:
 *
 *     package.json           the actual value
 *     package-lock.json      copy 1, written by npm
 *     src/cli/main.js        copy 2, re-implemented the package.json walk
 *     bin/sentinel.js        copy 3, re-implemented it again, slightly differently
 *     src/tui/lib/version.ts copy 4, re-implemented it a third time with candidate paths
 *     src/agent/mcp-client.js        a hardcoded literal
 *     src/shared/fetch-url.js         a hardcoded literal
 *     website/lib/site.ts            a hardcoded literal, in a different subtree
 *
 * Five of those drift the moment a release ships. The v3.4.0 release commit
 * bumped all of them by hand — it worked, and it worked *by luck*, because
 * nothing said a sixth place existed. This is the same duplication
 * `tool-taxonomy.js` documents: it produces no failure, so nothing tells you
 * about the next one.
 *
 * The two hardcoded literals were the real hazard. An MCP server receiving
 * `CLIENT_INFO.version: '3.4.0'` from an actually-3.5.0 build is a protocol lie
 * that no test fails on.
 *
 * ## What is NOT solved here
 *
 * `package-lock.json` and `website/lib/site.ts` are still copies, and cannot be
 * made to read this file:
 *   - npm owns the lockfile's two version fields and rewrites them itself.
 *   - `website/` is a separate build with its own toolchain; it has no access to
 *     this module at build time.
 * Both are still bumped by the release, deliberately, and `check:version` exists
 * to fail if they are missed.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** What to report when the truth cannot be read. Never a plausible-looking lie. */
export const UNKNOWN_VERSION = '0.0.0';

let cached = null;

/**
 * Read the version from `package.json`.
 *
 * Walks up from this module rather than assuming a depth, so the file works
 * whether it is imported from `src/`, from `bin/`, or from `src/tui/lib/` —
 * three different distances from the root, which is why each of those callers
 * previously wrote its own walk with its own hardcoded depth and its own guess.
 *
 * Memoized: this is called at import time by several modules, and the answer
 * cannot change within a process.
 */
export function getVersion() {
  if (cached !== null) return cached;
  cached = readVersion();
  return cached;
}

function readVersion() {
  // Start at this file's directory and walk up to five levels looking for a
  // package.json that names this package. Checking the name rather than just
  // finding the first package.json means a nested dependency's manifest — or the
  // one in `website/` — cannot be mistaken for ours.
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      if (pkg?.name === 'sentinel-cli' && typeof pkg.version === 'string') return pkg.version;
    } catch {
      // Not here, unreadable, or not JSON — keep walking.
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return UNKNOWN_VERSION;
}

/** `v3.5.0`, for user-facing banners. */
export function getDisplayVersion() {
  return `v${getVersion()}`;
}

/** The `User-Agent` this build identifies as. */
export function userAgent() {
  return `Mozilla/5.0 (compatible; sentinel-cli/${getVersion()}; +https://github.com/KunjShah95/SENTINEL-CLI)`;
}

/**
 * Reset the memo. Test-only.
 *
 * Exported because a test that asserts the lookup *fails* cleanly needs to
 * clear the cache, and because a release-bump test needs to observe a change.
 */
export function _resetVersionCache() {
  cached = null;
}

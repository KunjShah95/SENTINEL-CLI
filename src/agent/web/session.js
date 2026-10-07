/**
 * web/session — a leased browser capability.
 *
 * ## Why a session object at all
 *
 * A tool call that opens a browser, acts, and exits is unauditable and
 * unrecallable. There is no moment at which a human can say stop, and no record
 * of what the session was doing when it was stopped.
 *
 * So a browser session is modelled the way `watch.js` already models a standing
 * loop: a thing with a lease, a deadline, a budget, and an out-of-band control
 * channel. `sentinel steer` works because `watch` is a file-backed queue rather
 * than an in-memory loop. The same property is what makes a browser session
 * safe to leave running and possible to revoke.
 *
 * ## Three invariants
 *
 * 1. **The agent never holds the human's credentials.** A session gets a
 *    dedicated profile directory under `.sentinel/web/profiles/<id>`, created
 *    empty. Nothing is imported from a real browser profile. If the agent needs
 *    to be logged in, a human logs *that* profile in, watching it happen.
 *
 * 2. **A session may not outlive its lease.** `leaseMs` is checked before every
 *    action. An expired session refuses to act rather than acting once more on
 *    its way out — the same "fail toward charging you" asymmetry `budget.js`
 *    documents for a ceiling set in the same millisecond a turn finished.
 *
 * 3. **Absorbing and external effects are counted against a ceiling.** Money
 *    has a budget in this harness (`budget.js`). Irreversibility is a currency
 *    too, and an agent that can spend it without limit will eventually spend it
 *    on something that cannot be walked back.
 *
 * ## The fifth thing a session cannot do
 *
 * Sessions are single-purpose. `allowedOrigins` is checked on navigation, and a
 * session opened for one host cannot wander to another without being reopened.
 * An agent with the whole internet and a logged-in session is not a browsing
 * tool; it is an account takeover with extra steps.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureStateDir, stateDir } from '../../utils/state-dir.js';
import { getWorkdir } from '../../shared/tools/workdir.js';
import { REVERSIBILITY, severity } from './effect.js';

/**
 * Ordered worst-last, re-exported for callers that build their own switch.
 * Kept as a re-export rather than a second definition: two lists of "what is
 * irreversible" is precisely the drift `tool-taxonomy.js` exists to prevent.
 */
export { REVERSIBILITY };

/** Default lease. Long enough for real work, short enough to matter. */
export const DEFAULT_LEASE_MS = 15 * 60 * 1000;

/** How many irreversible effects a session may perform without a new ceiling. */
export const DEFAULT_IRREVERSIBLE_CEILING = 0;

/** Where session state and profiles live, both under `.sentinel/`. */
export function webDir(cwd = getWorkdir()) {
  return join(stateDir(cwd), 'web');
}

function sessionsFile(cwd = getWorkdir()) {
  return join(webDir(cwd), 'sessions.json');
}

/**
 * A live session handle.
 *
 * Deliberately a plain object with methods rather than a class: the state is
 * persisted as JSON, so a class would imply an authority over its own fields
 * that the file does not have. Anyone can hand-edit `sessions.json`, so every
 * field read back has to be trusted no more than any other file input.
 */
export function createSession({
  // No `cwd`. It was accepted and defaulted but never read here, so it implied a
  // scoping that did not exist — sessions are stored per-project by
  // saveSessions/loadSessions, which take their own `cwd`, and the browser
  // profile is resolved later by ensureProfile(session). Removing the parameter
  // is the honest fix; silently defaulting it to the process cwd would have made
  // it look meaningful.
  label = null,
  origins = [],
  leaseMs = DEFAULT_LEASE_MS,
  irreversibleCeiling = DEFAULT_IRREVERSIBLE_CEILING,
  now = Date.now(),
  driver = null,
} = {}) {
  const id = `web_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const s = {
    id,
    label,
    // Normalized once, at creation. An origin list that is compared raw would
    // treat `https://Example.com` and `https://example.com/` as two origins.
    origins: origins.map(normalizeOrigin).filter(Boolean),
    createdAt: now,
    expiresAt: now + leaseMs,
    irreversibleCeiling,
    irreversibleSpent: 0,
    // The delegated identity. `null` means anonymous: the agent is a stranger
    // with no privileges at all, which is the safest default and the one that
    // requires an explicit act of configuration to leave.
    identity: null,
    // Origin and account actually reached, as opposed to the ones declared. The
    // auditor compares the two, and the difference is a `Scope` finding.
    lastOrigin: null,
    lastAccountRef: null,
    actions: 0,
    revoked: false,
    driver,
  };
  return s;
}

function normalizeOrigin(origin) {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Whether the lease has run out. */
export function isExpired(session, now = Date.now()) {
  return !session || now >= Number(session.expiresAt || 0);
}

/**
 * Whether a session may still perform an effect of this severity.
 *
 * Returns a refusal object rather than a boolean because every refusal here has
 * a distinct reason a human needs to see, and "denied" is not actionable.
 */
export function checkAct(session, effect, now = Date.now()) {
  if (!session) return { ok: false, reason: 'no session' };
  if (session.revoked) return { ok: false, reason: 'session revoked' };
  if (isExpired(session, now)) {
    return {
      ok: false,
      reason: `lease expired at ${new Date(Number(session.expiresAt)).toISOString()}`,
      hint: 'open a new session with a longer lease',
    };
  }

  const host = effect?.host;
  if (session.origins?.length && !session.origins.includes(host)) {
    return {
      ok: false,
      reason: `origin ${host} is not in this session's allowlist`,
      hint: `allowed: ${session.origins.join(', ')}`,
    };
  }

  // The accounting. Only the two irreversible classes are counted; spending
  // budget on a reversible click would train the ceiling to be meaningless.
  const sev = severity(effect);
  const irreversible = effect?.reversibility === REVERSIBILITY.ABSORBING
    || effect?.reversibility === REVERSIBILITY.EXTERNAL;
  if (irreversible) {
    const spent = Number(session.irreversibleSpent || 0);
    const ceiling = Number(session.irreversibleCeiling ?? DEFAULT_IRREVERSIBLE_CEILING);
    if (spent >= ceiling) {
      return {
        ok: false,
        reason: `irreversible ceiling reached (${spent}/${ceiling})`,
        hint: effect.reversibility === REVERSIBILITY.EXTERNAL
          ? `this action is ${effect.reversibility} and reaches ${effect.recipient || 'a third party'}`
          : 'raise the ceiling deliberately, or have a human perform it',
        severity: sev,
      };
    }
  }

  return { ok: true, irreversible, severity: sev };
}

/**
 * Record an action against a session.
 *
 * Called only after a dispatch succeeds. The counter and the reached origin are
 * the state the audit needs; nothing else about the action is kept here, because
 * `audit-trail.js` already owns the durable record and duplicating it would be
 * the drift `tool-taxonomy.js` exists to prevent.
 */
export function recordAction(session, effect, now = Date.now()) {
  session.actions = Number(session.actions || 0) + 1;
  session.lastOrigin = effect?.origin ?? session.lastOrigin;
  if (effect?.accountRef) session.lastAccountRef = effect.accountRef;
  if (effect?.reversibility === REVERSIBILITY.ABSORBING || effect?.reversibility === REVERSIBILITY.EXTERNAL) {
    session.irreversibleSpent = Number(session.irreversibleSpent || 0) + 1;
  }
  session.expiresAt = session.expiresAt ?? now + DEFAULT_LEASE_MS;
  return session;
}

/** Revoke. Idempotent, and takes effect on the next check rather than after one. */
export function revokeSession(session) {
  if (!session) return session;
  session.revoked = true;
  // Collapsing the lease to now means the expiry check and the revoked check
  // agree, so a caller testing either one gets the same answer.
  session.expiresAt = Math.min(Number(session.expiresAt || Infinity), Date.now());
  return session;
}

// ── Persistence ────────────────────────────────────────────────────────

/**
 * Persist sessions. A corrupt or missing file is an empty list.
 *
 * Fails closed for the same reason `risk-ledger.js` does: a session file that
 * cannot be read must not be read as "no restrictions".
 */
export function saveSessions(sessions, cwd = getWorkdir()) {
  try {
    ensureStateDir(cwd);
    mkdirSync(webDir(cwd), { recursive: true });
    const serializable = (sessions || []).map(({ driver, ...rest }) => ({ ...rest, hasDriver: !!driver }));
    writeFileSync(sessionsFile(cwd), JSON.stringify({ version: 1, sessions: serializable }, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

export function loadSessions(cwd = getWorkdir()) {
  const file = sessionsFile(cwd);
  if (!existsSync(file)) return [];
  try {
    const doc = JSON.parse(readFileSync(file, 'utf-8'));
    if (!doc || !Array.isArray(doc.sessions)) return [];
    return doc.sessions.filter((s) => s && typeof s.id === 'string');
  } catch {
    return [];
  }
}

/** The live process handle, which `sessions.json` deliberately cannot hold. */
const live = new Map();

export function registerSession(session) {
  live.set(session.id, session);
  return session;
}

export function getSession(id, cwd = getWorkdir()) {
  const h = live.get(id);
  if (h) return h;
  const found = loadSessions(cwd).find((s) => s.id === id);
  if (found) {
    // No driver: a rehydrated session can be inspected but cannot act. Handing
    // back a handle that looks actionable and is not would be worse than null.
    Object.defineProperty(found, 'driver', { value: null, enumerable: false });
    return found;
  }
  return null;
}

export function listSessions(cwd = getWorkdir()) {
  return loadSessions(cwd);
}

/**
 * The profile directory for a session — dedicated, empty, and disposable.
 *
 * `rmSync` is not called here; a session that ends should be cleaned up
 * explicitly so the log of what happened survives the profile it happened in.
 */
export function profileDir(session, cwd = getWorkdir()) {
  return join(webDir(cwd), 'profiles', session.id);
}

export function ensureProfile(session, cwd = getWorkdir()) {
  const dir = profileDir(session, cwd);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Destroy a session's profile. Credentials in it die with it. */
export function destroyProfile(session, cwd = getWorkdir()) {
  try {
    rmSync(profileDir(session, cwd), { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

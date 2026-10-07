/**
 * web-tools — `webProbe`, `webAct`, `webRead`, `webSession`.
 *
 * ## The split, and why it is not negotiable
 *
 * Computer use is normally one tool: `computer(action, ...)`. That collapses
 * observation and commitment into a single verb, which makes "should this be
 * allowed?" unanswerable — the same policy has to cover "read a page" and
 * "confirm a payment".
 *
 * This harness already draws that line for files, and draws it well: `readFile`
 * never prompts, `writeFile` is a different permission category, and `audit.js`
 * ranks intent `read_only < unknown < write < state` so a write under a read
 * grant is a `Scope` finding. Browser use takes the same line and gets the same
 * machinery for free:
 *
 *   webRead   observation.  Never prompts, like `readFile`.
 *   webProbe  resolution.   Resolves an action to its effect. Changes nothing.
 *   webAct    commitment.   Requires a descriptor, a live session, and a human.
 *
 * `webProbe` is the highest-value tool in this file. Without it the agent clicks
 * blind and infers what happened from the resulting page, which is the failure
 * mode that makes browser agents unreviewable. With it, the agent resolves first,
 * reads the role and accessible name and the endpoint it would hit, and then
 * asks. That is the same courtesy the blast-radius gate extends to a risky file
 * write: state the target and the rollback *before* the thing moves.
 *
 * ## The descriptor is not a suggestion
 *
 * `webAct` refuses a call with no descriptor. It refuses an undeclared
 * reversibility class. It refuses when the descriptor contradicts what the probe
 * observed. These are not validation niceties — they are the mechanism that
 * makes the `Semantic` gap class in `audit.js` checkable, by forcing the fields
 * an auditor needs to exist before the effect rather than trying to recover them
 * afterwards.
 *
 * ## No model, no network on the refusal paths
 *
 * Every refusal here is computed from the descriptor, the session, and the
 * policy. The same posture `audit.js` and `onboard.js` hold: the parts that
 * decide safety should be deterministic, so they give the same answer twice and
 * work with no provider configured.
 */
import {
  describeEffect, explainEffect, classifyEffect, severity, sameEffect,
  REVERSIBILITY,
} from './web/effect.js';
import {
  createSession, registerSession, getSession, listSessions, revokeSession,
  checkAct, recordAction, isExpired, ensureProfile, destroyProfile, saveSessions,
  DEFAULT_LEASE_MS, DEFAULT_IRREVERSIBLE_CEILING,
} from './web/session.js';
import * as driver from './web/driver.js';

/** Refusal helper. Every refusal in this file is shaped like this. */
function refuse(reason, extra = {}) {
  return { error: reason, refused: true, ...extra };
}

/**
 * Resolve a driver for a session, reporting unavailability honestly.
 *
 * A browser that cannot start is a *capability* failure, so it is reported as
 * one. Returning an empty successful result here would let an agent conclude the
 * page was empty and try the next selector, which is how a missing browser turns
 * into a hundred refused clicks in a log nobody reads.
 */
async function requireDriver(session) {
  if (!session?.driver) {
    // `findBrowser()` is what `launch()` reports through `r.looked` on failure,
    // so it is not called again here — an unused second probe would be a
    // redundant filesystem scan on every tool call.
    const r = await driver.launch({ profileDir: ensureProfile(session) });
    if (!r.available) {
      session.driver = null;
      return { error: r.reason, looked: r.looked ?? [], capability: 'browser-unavailable' };
    }
    session.driver = r;
  }
  return { driver: session.driver };
}

function persistSession(session) {
  const all = listSessions().filter((s) => s.id !== session.id);
  all.push(session);
  saveSessions(all);
}

// ── webSession — open, inspect, revoke ──────────────────────────────────

/**
 * Open a leased session scoped to specific origins.
 *
 * `origins` is required to be explicit rather than defaulting to "everything".
 * An agent holding a logged-in session and the whole internet is not a browsing
 * tool; it is an account takeover with extra steps. Naming the hosts up front is
 * the cheap half of the containment, and it is the half that survives a
 * prompt-injection in page content.
 */
async function webSessionImpl(input) {
  const action = input?.action || 'open';

  if (action === 'list') {
    return {
      sessions: listSessions().map((s) => ({
        id: s.id,
        label: s.label,
        origins: s.origins,
        identity: s.identity,
        actions: s.actions ?? 0,
        irreversibleSpent: s.irreversibleSpent ?? 0,
        revoked: !!s.revoked,
        expired: isExpired(s),
        expiresAt: s.expiresAt ? new Date(s.expiresAt).toISOString() : null,
        actionable: !!getSession(s.id)?.driver,
      })),
    };
  }

  if (action === 'revoke') {
    const s = getSession(input?.sessionId);
    if (!s) return refuse(`no session ${JSON.stringify(input?.sessionId)}`);
    revokeSession(s);
    persistSession(s);
    return { sessionId: s.id, revoked: true, note: 'the next action check refuses; an in-flight page is unaffected until it returns' };
  }

  if (action === 'close') {
    const s = getSession(input?.sessionId);
    if (!s) return refuse(`no session ${JSON.stringify(input?.sessionId)}`);
    revokeSession(s);
    destroyProfile(s);
    persistSession(s);
    return { sessionId: s.id, closed: true, profileDestroyed: true };
  }

  // open
  if (!Array.isArray(input?.origins) || input.origins.length === 0) {
    return refuse('webSession requires an explicit origins allowlist (e.g. ["https://example.com"])');
  }
  const bad = input.origins.filter((o) => {
    try { new URL(o); return false; } catch { return true; }
  });
  if (bad.length) return refuse(`origins must be absolute URLs; rejected: ${bad.join(', ')}`);

  const s = createSession({
    label: input?.label ?? null,
    origins: input.origins,
    leaseMs: typeof input?.leaseMs === 'number' ? input.leaseMs : DEFAULT_LEASE_MS,
    irreversibleCeiling: typeof input?.irreversibleCeiling === 'number'
      ? input.irreversibleCeiling
      : DEFAULT_IRREVERSIBLE_CEILING,
  });

  const found = driver.findBrowser();
  const launched = found ? await driver.launch({ profileDir: ensureProfile(s) }) : { available: false, reason: 'no Chrome or Edge binary found', looked: [] };
  if (launched.available) {
    s.driver = launched;
    s.browser = launched.browser;
  }

  registerSession(s);
  persistSession(s);

  return {
    sessionId: s.id,
    origins: s.origins,
    leaseExpires: new Date(s.expiresAt).toISOString(),
    irreversibleCeiling: s.irreversibleCeiling,
    // The agent has no credentials by default. A human logs this profile in,
    // watching it happen — the harness never imports a real browser profile.
    identity: null,
    browser: s.browser ?? null,
    profileDir: `.sentinel/web/profiles/${s.id}`,
    capability: s.driver ? 'ready' : launched.reason,
    note: s.driver
      ? 'Profile is dedicated and empty. Log in through this profile if the task needs an identity; the harness will not import yours.'
      : 'Read and probe work without a browser only if one is installed. No browser was found.',
  };
}

// ── webRead — observation ───────────────────────────────────────────────

/**
 * Navigate and read.
 *
 * Read-only in the same sense `readFile` is: it does not prompt, and it cannot
 * commit anything. A `GET` is not an effect.
 */
async function webReadImpl(input) {
  const s = getSession(input?.sessionId);
  if (!s) return refuse('no session — open one with webSession first');

  const check = checkAct(s, { host: null, reversibility: REVERSIBILITY.REVERSIBLE });
  if (!check.ok) return refuse(`session is not usable: ${check.reason}`, check);

  const d = await requireDriver(s);
  if (d.error) return d;

  if (input?.url) {
    const host = (() => {
      try { return new URL(input.url).host.toLowerCase(); } catch { return null; }
    })();
    if (!host) return refuse(`url must be absolute (got ${JSON.stringify(input.url)})`);
    if (s.origins.length && !s.origins.includes(host)) {
      return refuse(`${host} is not in this session's allowlist`, { hint: `allowed: ${s.origins.join(', ')}` });
    }
    const nav = await driver.navigate(d.driver, input.url);
    if (!nav.ok) return refuse(`navigation failed: ${nav.error}`);
  }

  const page = await driver.readPage(d.driver, {
    maxChars: input?.maxChars ?? 20000,
    selector: input?.selector ?? null,
  });
  if (page.error) return page;

  s.lastOrigin = page.url;
  recordAction(s, { host: null, reversibility: REVERSIBILITY.REVERSIBLE });
  persistSession(s);

  return {
    url: page.url,
    title: page.title,
    text: page.text,
    truncated: page.truncated,
    actionsRemaining: null,
  };
}

// ── webProbe — resolution, the highest-value tool here ──────────────────

/**
 * Resolve an intended action to its concrete effect, changing nothing.
 *
 * This is the only place in the browser path where no irreversible thing has
 * happened yet. It answers the three questions an approver needs and that a
 * selector cannot: what does this element *actually* call itself, is it inside
 * a form that would submit, and what would it send.
 */
async function webProbeImpl(input) {
  const s = getSession(input?.sessionId);
  if (!s) return refuse('no session — open one with webSession first');

  const d = await requireDriver(s);
  if (d.error) return d;

  if (!input?.selector) return refuse('selector is required');

  const resolved = await driver.resolveTarget(d.driver, input.selector);
  if (resolved.error) return refuse(`probe failed: ${resolved.error}`, { selector: input.selector });

  const hint = driver.inferReversibility({
    writes: resolved.formAction ? [{ method: resolved.formMethod, url: resolved.formAction }] : [],
    method: resolved.formMethod,
    url: resolved.formAction ?? resolved.href ?? resolved.url,
  });

  const accountRef = await currentIdentity(d.driver);

  return {
    // Everything a human needs to answer "is this the thing you meant".
    target: {
      selector: resolved.selector,
      tag: resolved.tag,
      role: resolved.role,
      name: resolved.name,
      submitsForm: resolved.submitsForm,
      formAction: resolved.formAction,
      formMethod: resolved.formMethod,
      disabled: resolved.disabled,
      text: resolved.text,
    },
    origin: resolved.url,
    account: accountRef,
    // Advisory. The model must still assert a class; this only tells it when its
    // assertion would contradict what the browser shows.
    suggested: hint,
    // The shape `webAct` needs. Named explicitly so the model can echo it back
    // rather than reconstructing the fields.
    descriptorTemplate: {
      action: `click ${resolved.role} "${resolved.name || resolved.selector}"`,
      origin: resolved.url,
      resourceId: resolved.formAction || resolved.href || resolved.selector,
      reversibility: hint.reversibility === REVERSIBILITY.UNKNOWN ? null : hint.reversibility,
      accountRef: accountRef?.accountRef ?? undefined,
    },
    note: 'Nothing was changed. Pass a completed descriptor to webAct to commit this action.',
  };
}

/**
 * Read who the page thinks we are.
 *
 * Reported rather than inferred from cookies or storage, which are both
 * unreliable and a place where the answer could come from page script that the
 * agent does not control. A page that lies about this is a page whose blast
 * radius the descriptor cannot be trusted on, so this returns what is observable
 * and no more.
 */
async function currentIdentity(d) {
  try {
    const res = await d.cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const txt = (document.querySelector('[data-account], [data-user-account], [aria-label*="account" i]') || {}).textContent;
        const who = document.querySelector('meta[name="user-email"], meta[property="profile:username"]');
        const label = (txt || (who && who.content) || '').trim().replace(/\\s+/g,' ').slice(0, 120);
        return label ? { accountRef: label, source: 'page-markup' } : null;
      })()`,
      returnByValue: true,
    }, 8000);
    return res?.result?.value ?? null;
  } catch {
    return null;
  }
}

// ── webAct — commitment ─────────────────────────────────────────────────

/**
 * Perform an action that has been probed and described.
 *
 * Three gates, in this order, and none of them is skippable:
 *
 *   1. A valid, complete descriptor.   (the fields an auditor will need)
 *   2. A live session that permits it.  (lease, allowlist, irreversible ceiling)
 *   3. Agreement with the probe.        (what changed vs what was declared)
 *
 * Gate 3 is the one a normal implementation drops. It is also the only thing
 * standing between a stale selector and an irreversible action: a page re-renders
 * between probe and act, `#confirm` now points somewhere else, and without the
 * comparison that divergence is invisible — which is precisely the `Semantic`
 * class `audit.js` currently has to declare unobservable.
 */
async function webActImpl(input) {
  const s = getSession(input?.sessionId);
  if (!s) return refuse('no session — open one with webSession first');

  const described = describeEffect(input?.effect);
  if (!described.ok) {
    return refuse(described.error, {
      missing: described.missing ?? [],
      required: 'an effect descriptor naming the action, origin, resource, and reversibility class',
      hint: 'run webProbe first and use its descriptorTemplate',
    });
  }
  const effect = described.effect;

  const check = checkAct(s, effect);
  if (!check.ok) return refuse(`refused: ${check.reason}`, { hint: check.hint ?? null, severity: check.severity ?? null });

  const d = await requireDriver(s);
  if (d.error) return d;

  // Gate 3: re-probe and compare. Cheap, and the only place staleness shows up.
  const resolved = await driver.resolveTarget(d.driver, input?.selector ?? effect.resourceId);
  if (resolved.error) {
    return refuse(`the action no longer resolves: ${resolved.error}`, {
      hint: 'the page changed since the probe — re-probe before acting',
      drifted: true,
    });
  }

  const declaredHost = effect.host;
  const reachedHost = (() => {
    try { return new URL(resolved.url).host.toLowerCase(); } catch { return null; }
  })();
  if (reachedHost && declaredHost && reachedHost !== declaredHost) {
    return refuse(`probe/declaration mismatch: declared ${declaredHost}, page is on ${reachedHost}`, {
      declaredOrigin: effect.origin,
      reachedOrigin: resolved.url,
      drifted: true,
    });
  }

  // Same-account check. The worst browser failure is not a wrong page, it is the
  // right page under the wrong identity, and nothing about a URL reveals it.
  if (effect.accountRef) {
    const now = await currentIdentity(d.driver);
    if (now?.accountRef && now.accountRef !== effect.accountRef) {
      return refuse(`account mismatch: declared ${effect.accountRef}, page shows ${now.accountRef}`, {
        declaredAccount: effect.accountRef,
        reachedAccount: now.accountRef,
        drifted: true,
        hint: 'this is the wrong-account failure mode; do not proceed on the page you are on',
      });
    }
  }

  // Only now does anything irreversible happen.
  //
  // `kind` is restricted to click. Typing is deliberately not a separate verb
  // here: keystrokes are harmless in isolation and the cost lives entirely in the
  // submission that follows, so modelling `type` as its own action would create
  // a cheap way to fill a form with no descriptor for the submit — the exact
  // laundering this module exists to prevent. Filling a field is `webRead`-shaped
  // work against a real page and is not yet supported.
  if (input?.kind === 'type') {
    return refuse('kind "type" is not supported: fill a field, then probe the submit control and describe THAT action', {
      hint: 'the irreversible part of a form is the submission, so that is the action that needs a descriptor',
    });
  }

  const result = await driver.click(d.driver, input?.selector ?? effect.resourceId);
  if (result.error) return refuse(`action failed: ${result.error}`);

  // The verdict the descriptor gets checked against: a click that issued a
  // mutating request when the model claimed it was reversible is a finding, and
  // it is reported rather than quietly accepted.
  const observed = driver.inferReversibility({ writes: result.writes, url: result.url });
  // Two contradictions, not one. "Declared reversible but something mutated" is
  // the obvious one. The reverse — declared irreversible when nothing happened —
  // matters just as much: it means the descriptor was guessed rather than
  // derived, which is the behaviour that would let the next call skip the probe.
  const contradicted = (effect.reversibility === REVERSIBILITY.REVERSIBLE && result.mutated)
    || ((effect.reversibility === REVERSIBILITY.ABSORBING
      || effect.reversibility === REVERSIBILITY.EXTERNAL) && !result.mutated);

  recordAction(s, effect);
  s.lastOrigin = result.url ?? effect.origin;
  persistSession(s);

  return {
    // Recorded explicitly so `loop.js` puts the verified descriptor on the
    // dispatch side and the auditor can compare it against what was granted.
    effect,
    drifted: false,
    action: effect.action,
    origin: effect.origin,
    resourceId: effect.resourceId,
    reversibility: effect.reversibility,
    severity: severity(effect),
    url: result.url,
    // What the click actually caused, which is the concrete thing an auditor
    // reads six weeks later.
    requests: result.requests,
    mutated: result.mutated,
    observedReversibility: observed,
    contradicted,
    contradiction: contradicted
      ? (result.mutated
        ? `declared reversible but ${result.writes.length} mutating request(s) were issued — audit this as a Scope finding`
        : 'declared an irreversible class but no mutating request was observed — the descriptor looks guessed rather than probed')
      : null,
    irreversibleSpent: s.irreversibleSpent,
    irreversibleCeiling: s.irreversibleCeiling,
    rollback: explainEffect(effect),
    verification: 'Re-read the resource from an authoritative endpoint before claiming this succeeded. A page rendering "done" is not a receipt.',
  };
}

export const webTools = {
  webSession: webSessionImpl,
  webRead: webReadImpl,
  webProbe: webProbeImpl,
  webAct: webActImpl,
};

export { classifyEffect, explainEffect, sameEffect, driver, DEFAULT_LEASE_MS, DEFAULT_IRREVERSIBLE_CEILING };

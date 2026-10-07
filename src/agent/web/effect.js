/**
 * web/effect — the effect descriptor: what a browser action would actually do.
 *
 * ## Why this file exists
 *
 * Every safety primitive in this harness is derived from a fact that is cheap to
 * record at approval time. `risk-ledger.js` grades a command *shape*. `audit.js`
 * compares `workdir`. `blast-radius.js` matches a path against a glob.
 *
 * All three work because a file action has a stable, nameable target. "Write to
 * `src/auth/session.ts`" is an answer. It can be shown to a human, compared
 * across two runs, and matched against a policy.
 *
 * A browser click has no such name. `click(selector)` is the same verb whether it
 * opens a settings page or confirms a charge. The risk is not in the verb, it is
 * in *what the verb resolves to* — the account, the record, the endpoint, the
 * third party. So a shape-based ledger cannot grade it, and running one anyway
 * produces the worst possible failure: a ledger that learns from repetition and
 * eventually green-lights whatever it saw most often.
 *
 * The fix is not a better classifier. It is to make the model name the resource
 * *before* the action runs. This module owns that descriptor and the one thing
 * the rest of the system most needs from it: how reversible is it.
 *
 * ## The four classes
 *
 *   reversible  an in-product undo exists
 *   compensable a compensating action exists (delete what was created)
 *   absorbing   cannot be undone — sent mail, posted comment, published page
 *   external    affects a third party — they see it, they cannot be un-seen
 *
 * `absorbing` is the local irreversibility; `external` is the irreversible part
 * that leaves the machine. `external` is treated as strictly worse than
 * `absorbing` because it is the only class where a mistake is not merely
 * unrecoverable but *someone else's* problem.
 *
 * ## Deliberately not a heuristic
 *
 * Nothing here guesses. `classifyEffect` grades only what the caller declared,
 * and `requiredFieldsFor` is what the tool schema demands. Where the answer is
 * unknown, `classifyEffect` returns `unknown` and the caller is expected to
 * refuse — the same fail-closed posture `risk-ledger.js` takes on a missing
 * ledger, because an approving descriptor that does not exist is not consent.
 */

/** Ordered worst-last. Index order is the severity order; do not reorder. */
export const REVERSIBILITY = Object.freeze({
  REVERSIBLE: 'reversible',
  COMPENSABLE: 'compensable',
  ABSORBING: 'absorbing',
  EXTERNAL: 'external',
  UNKNOWN: 'unknown',
});

/** The classes a caller may actually assert. `unknown` is derived, never declared. */
const ASSERTABLE = Object.freeze([
  REVERSIBILITY.REVERSIBLE,
  REVERSIBILITY.COMPENSABLE,
  REVERSIBILITY.ABSORBING,
  REVERSIBILITY.EXTERNAL,
]);

/** Severity rank. Higher is worse. Drives `external > absorbing` precedence. */
export const SEVERITY = Object.freeze({
  [REVERSIBILITY.REVERSIBLE]: 0,
  [REVERSIBILITY.COMPENSABLE]: 1,
  [REVERSIBILITY.ABSORBING]: 2,
  [REVERSIBILITY.EXTERNAL]: 3,
  [REVERSIBILITY.UNKNOWN]: 4,
});

/**
 * Fields required before an effect may be dispatched, by class.
 *
 * A `reversible` action needs only enough to be undone: the origin and the
 * resource are what "undo" refers to. An `external` action needs the recipient,
 * because "who did this reach" is the question a human needs answered before
 * saying yes, and it is not recoverable from the URL afterwards.
 *
 * This is the mechanism that shrinks the `Semantic` gap class. `audit.js`
 * currently reports `Semantic` as unverifiable *because* those divergences leave
 * every recorded field unchanged. These fields are recorded, pre-execution, and
 * compared — so a descriptor that changed between probe and dispatch is a
 * `Scope` finding rather than an invisible one.
 */
export const REQUIRED_FIELDS = Object.freeze({
  [REVERSIBILITY.REVERSIBLE]: Object.freeze(['origin', 'resourceId']),
  [REVERSIBILITY.COMPENSABLE]: Object.freeze(['origin', 'resourceId', 'compensatingAction']),
  [REVERSIBILITY.ABSORBING]: Object.freeze(['origin', 'resourceId']),
  [REVERSIBILITY.EXTERNAL]: Object.freeze(['origin', 'resourceId', 'recipient']),
});

/** The one field every action must carry, regardless of class. */
export const COMMON_FIELDS = Object.freeze(['action', 'origin']);

/**
 * Normalize and validate a descriptor supplied by a model.
 *
 * Returns a result object rather than throwing, because the caller is a tool
 * dispatcher that has to turn a refusal into something the model can read and
 * correct. `error` names the missing field explicitly — the same courtesy the
 * file tool schema extends when a required field is absent.
 *
 * @param {object} input raw descriptor from the model
 * @returns {{ok: true, effect: object} | {ok: false, error: string, missing?: string[]}}
 */
export function describeEffect(input = {}) {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: 'effect must be an object' };
  }

  const action = typeof input.action === 'string' ? input.action.trim() : '';
  if (!action) return { ok: false, error: 'effect.action is required' };

  const origin = typeof input.origin === 'string' ? input.origin.trim() : '';
  if (!origin) return { ok: false, error: 'effect.origin is required' };

  // Origins are compared as registrable domains for policy purposes, but an
  // origin is also a *record*: "did this land where the probe said it would"
  // is only answerable with the full value. Both are kept.
  let registrable;
  try {
    const u = new URL(origin);
    registrable = u.host.toLowerCase();
  } catch {
    return { ok: false, error: `effect.origin must be an absolute URL (got ${JSON.stringify(origin)})` };
  }

  const reversibility = typeof input.reversibility === 'string'
    ? input.reversibility.trim().toLowerCase()
    : '';

  // The whole point: an undeclared class is not silently treated as mild. It is
  // `unknown`, and `unknown` is the worst rank, so the tool layer refuses by
  // default rather than proceeding on an optimistic reading.
  if (!reversibility) {
    return {
      ok: false,
      error: 'effect.reversibility is required and must be one of: ' + ASSERTABLE.join(', '),
      missing: ['reversibility'],
    };
  }
  if (!ASSERTABLE.includes(reversibility)) {
    return {
      ok: false,
      error: `effect.reversibility must be one of: ${ASSERTABLE.join(', ')} (got ${JSON.stringify(input.reversibility)})`,
      missing: ['reversibility'],
    };
  }

  const required = [...COMMON_FIELDS, ...REQUIRED_FIELDS[reversibility]];
  const missing = required.filter((f) => {
    const v = input[f];
    return v === undefined || v === null || (typeof v === 'string' && !v.trim());
  });
  if (missing.length) {
    return {
      ok: false,
      error: `effect.${reversibility} is missing required field(s): ${missing.join(', ')}`,
      missing,
    };
  }

  const effect = {
    action,
    origin,
    host: registrable,
    reversibility,
    resourceId: String(input.resourceId).trim(),
  };

  if (input.compensatingAction) effect.compensatingAction = String(input.compensatingAction).trim();
  if (input.recipient) effect.recipient = String(input.recipient).trim();
  if (typeof input.accountRef === 'string' && input.accountRef.trim()) {
    effect.accountRef = input.accountRef.trim();
  }

  return { ok: true, effect };
}

/**
 * Grade an already-normalized effect.
 *
 * Separate from `describeEffect` so that policy code cannot accidentally treat a
 * validation result as a decision. `unknown` is returned when there is no
 * effect, which keeps every caller's `if (severity(x) >= N)` branch honest.
 */
export function classifyEffect(effect) {
  if (!effect || !ASSERTABLE.includes(effect.reversibility)) return REVERSIBILITY.UNKNOWN;
  return effect.reversibility;
}

/** Numeric severity. Higher is worse; `unknown` outranks everything. */
export function severity(effect) {
  return SEVERITY[classifyEffect(effect)] ?? SEVERITY[REVERSIBILITY.UNKNOWN];
}

/**
 * Whether one descriptor matches another, on the fields that decide the effect.
 *
 * Used by the tool layer to check that a dispatch matches its probe, and by
 * `audit.js` to promote a descriptor change into a `Scope` finding.
 *
 * Compares only asserted fields — a dispatch that adds `recipient` to a probe
 * that lacked one is a change, and is reported. Missing-vs-present is a
 * mismatch rather than a lenient pass, because the probe's silence is exactly
 * what a laundering attempt would look like.
 */
export function sameEffect(a, b) {
  if (!a || !b) return false;
  const fields = ['action', 'origin', 'resourceId', 'reversibility', 'compensatingAction', 'recipient'];
  for (const f of fields) {
    const av = a[f];
    const bv = b[f];
    const aHas = av !== undefined && av !== null && av !== '';
    const bHas = bv !== undefined && bv !== null && bv !== '';
    if (aHas !== bHas) return false;
    if (aHas && String(av) !== String(bv)) return false;
  }
  return true;
}

/**
 * Human-readable summary for a permission prompt.
 *
 * The blast-radius gate established the format this follows: state the target,
 * then name the rollback, before anything moves. Same courtesy, different
 * coordinate system.
 */
export function explainEffect(effect) {
  const cls = classifyEffect(effect);
  if (cls === REVERSIBILITY.UNKNOWN) {
    return 'Unknown effect. No descriptor was supplied, so nothing can be graded or rolled back.';
  }
  const L = [];
  if (cls === REVERSIBILITY.EXTERNAL) {
    L.push(`Affects someone else — ${effect.recipient}. They will see this and cannot un-see it.`);
  } else if (cls === REVERSIBILITY.ABSORBING) {
    L.push('This cannot be undone. There is no undo and no compensating action.');
  } else if (cls === REVERSIBILITY.COMPENSABLE) {
    L.push(`Rollback: ${effect.compensatingAction}`);
  } else {
    L.push(`Undo: available in-product at ${effect.origin}${effect.resourceId ? ` for ${effect.resourceId}` : ''}`);
  }
  L.push(`Action: ${effect.action} on ${effect.origin}`);
  if (effect.resourceId) L.push(`Target: ${effect.resourceId}`);
  if (effect.accountRef) L.push(`Account: ${effect.accountRef}`);
  L.push(`Class: ${cls}`);
  return L.join('\n');
}

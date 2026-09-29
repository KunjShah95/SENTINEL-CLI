/**
 * Blast-radius gate — make "safe" mean something before a risky write.
 *
 * A forward-deployed engineer does not decide a change is safe because the
 * tool said yes. On a path they do not own, they state the file and line that
 * justifies the change and name the rollback before touching anything. This
 * module makes that automatic for the changes where being wrong is expensive.
 *
 * Two signals decide a path is sensitive, and both are cheap:
 *
 *   1. It LOOKS like a blast centre — a migration, a CI workflow, a lockfile,
 *      a schema, the deploy config, auth or billing code. These are the files
 *      where a small edit has an outsized effect and a rollback is rarely
 *      just "revert".
 *   2. The onboarding survey already called it a risk area — high churn with
 *      no test covering it. Reuse `onboard.js` rather than re-deriving.
 *
 * The gate BLOCKS ONCE. That is deliberate and it matches the Stop hook's
 * forced-verification pattern: the first write to a sensitive path is refused
 * with the requirement spelled out, and the agent's next move must include the
 * justification. A gate that blocks forever trains people to disable it; a
 * gate that asks once and records the answer is a habit.
 */
import { existsSync } from 'node:fs';
import { analyzeRepo } from './onboard.js';

/** Path shapes where a small edit has an outsized blast radius. */
const SENSITIVE_PATTERNS = [
  [/(^|\/)(migrations?|alembic|db\/migrate)(\/|$)/i, 'database migration'],
  [/\.(sql)$/i, 'raw SQL'],
  [/(^|\/)\.github\/workflows\//i, 'CI workflow — this gates every merge'],
  [/(^|\/)(Dockerfile|docker-compose[^/]*|Makefile)$/i, 'build or deploy definition'],
  [/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|go\.sum|poetry\.lock)$/i, 'lockfile'],
  [/(^|\/)(schema\.(prisma|sql|graphql)|.*\.schema\.(json|ts))$/i, 'schema definition'],
  [/(^|\/)(auth|authentication|login|session|billing|payments?|permissions?|rbac|security)[^/]*\.[a-z]+$/i, 'auth / billing / permissions code'],
  [/(^|\/)(auth|authentication|billing|payments?|permissions?|rbac|security)[^/]*\/[^/]*$/i, 'auth / billing / permissions code'],
  [/(^|\/)\.sentinel\/config\.ya?ml$|(^|\/)sentinel\.ya?ml$/i, 'the project\'s own permission config'],
  [/(^|\/)\.env(\.|$)/i, 'environment secrets'],
  [/(^|\/)(terraform|infra)\//i, 'infrastructure definition'],
  [/(^|\/)k8s\//i, 'cluster definition'],
];

/** Every path a single tool call would write. */
export function targetPaths(toolName, input) {
  if (!input) return [];
  if (toolName === 'writeFile' || toolName === 'editFile') return input.path ? [String(input.path)] : [];
  if (toolName === 'batchEdit') return (input.operations || []).map((o) => o?.filePath).filter(Boolean).map(String);
  if (toolName === 'applyPatch') return [...String(input.patch || '').matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]);
  return [];
}

/** Whether one path is a blast centre, and why. */
export function classifyTarget(path) {
  const p = String(path || '').replace(/\\/g, '/');
  const reasons = [];
  for (const [re, why] of SENSITIVE_PATTERNS) if (re.test(p)) reasons.push(why);
  return { path: p, sensitive: reasons.length > 0, reasons };
}

/**
 * The sensitive targets in one call, or an empty list.
 * @returns {{ sensitive: boolean, targets: Array<{path, reasons}> }}
 */
export function blastRadius(toolName, input) {
  const targets = targetPaths(toolName, input)
    .map(classifyTarget)
    .filter((t) => t.sensitive);
  return { sensitive: targets.length > 0, targets };
}

/** Paths the onboarding survey flagged as high churn with no test coverage. */
export function surveyedRiskPaths(cwd) {
  try {
    if (!existsSync(cwd)) return new Set();
    return new Set(analyzeRepo(cwd).risk.map((r) => r.path));
  } catch {
    // The survey is an enrichment, never a dependency: if it cannot run, the
    // gate still works off the path patterns alone.
    return new Set();
  }
}

/**
 * The prompt injected the first time a turn touches something risky. It asks
 * for the two things an FDE states out loud, and both are checkable by a human
 * reading the transcript.
 */
export function justificationPrompt(radius) {
  const L = ['Before this change lands, state two things — this path is a blast centre:'];
  for (const t of radius.targets) L.push(`  - \`${t.path}\` (${t.reasons.join('; ')})`);
  L.push('');
  L.push('1. JUSTIFICATION — the file:line that shows why this change is correct, read before you edited.');
  L.push('2. ROLLBACK — the exact command or edit that undoes it if it is wrong.');
  L.push('');
  L.push('Then repeat the same tool call. Do not paraphrase the change; state the evidence.');
  return L.join('\n');
}

/**
 * Per-turn gate state. `asked` records what has already been challenged so the
 * gate blocks once per path per turn, not once per write.
 */
export function createGateState() {
  return { asked: new Set(), justified: false };
}

/**
 * @param surveyed optional set of paths the onboarding survey flagged as
 *   high-churn-with-no-tests. Deliberately opt-in and NOT wired into the loop:
 *   `analyzeRepo` shells out to git twice, and paying that on every write
 *   would be a performance regression to buy a marginal extra signal. Callers
 *   that already hold a survey can pass it in.
 * @returns {null | { block: true, reason: string }} — null means the write may
 * proceed. A block is a request for a justification, not a refusal.
 */
export function checkBlastRadius({ toolName, input, state, surveyed = null }) {
  const radius = blastRadius(toolName, input);
  const extra = surveyed
    ? targetPaths(toolName, input)
      .map((p) => String(p).replace(/\\/g, '/'))
      .filter((p) => surveyed.has(p))
      .map((p) => ({ path: p, reasons: ['flagged by `sentinel onboard`: high churn, no test covers it'] }))
    : [];
  const targets = [...radius.targets, ...extra.filter((t) => !radius.targets.some((r) => r.path === t.path))];
  if (!targets.length) return null;
  const firstTime = targets.some((t) => !state.asked.has(t.path));
  if (!firstTime) return null;
  for (const t of targets) state.asked.add(t.path);
  return { block: true, reason: justificationPrompt({ targets }) };
}

/** True when the assistant's text carries an explicit justification + rollback. */
export function looksJustified(text) {
  const t = String(text || '');
  return /\b(justif|rollback|roll back|blast radius|undo|revert)\w*\b/i.test(t)
    && /[:\n]/.test(t);
}

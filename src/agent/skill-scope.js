/**
 * Per-turn tool scope, narrowed by a skill that declares `allowed-tools`.
 *
 * ## The problem this exists to solve
 *
 * A skill's `allowed-tools:` frontmatter says "while I am loaded, use these
 * tools and no others". Claude Code enforces it. Sentinel parsed the key and
 * did nothing with it, which is the worst of both answers: the key looked
 * load-bearing and was not.
 *
 * ## The design question
 *
 * A skill is loaded *mid-turn* — the model calls the `skill` tool at iteration
 * 4 and keeps going. So a naive implementation removes tools from the set the
 * model was already shown at iteration 1, and the agent's next call fails
 * against a list it has never seen. That is the objection that stopped this
 * being built the first time, and it is the right objection: a tool that
 * vanishes mid-turn is a bug that presents as an agent that has forgotten how
 * to read files.
 *
 * So the toolset is **not** narrowed. The call is **refused**, loudly, with the
 * skill named. Three properties fall out:
 *
 *   - The model was shown the tool, so a refusal is legible: it reads "the
 *     `audit` skill only allows readFile, grep, codeMap", not "no such tool".
 *   - It is attributable — the refusal names the skill that constrained it, so
 *     `sentinel audit` can say which declaration was the binding one.
 *   - It is recoverable: the model can finish the skill's work with the tools
 *     it does have, or drop the skill.
 *
 * ## Composition
 *
 * Two loaded skills intersect. A skill with no declaration imposes nothing, so
 * one unrestricted skill cannot widen another skill's restriction — which is the
 * whole failure mode of a union, and the reason a union is not used here.
 *
 * ## Lifetime
 *
 * The scope is per-turn and ends with it. A constraint that outlived the turn
 * would apply to a request that never loaded the skill, and the skill would be
 * deciding what unrelated work is allowed to do.
 */
import { skillAllowedTools } from './skills.js';

/** Create the per-turn scope. Empty, and imposes nothing until a skill says so. */
export function createSkillScope() {
  return { loaded: [] };
}

/**
 * Record a skill the model just loaded.
 *
 * Called with the skill's *record*, not its name, because the declaration is on
 * the record and re-resolving it here would mean the gate and the tool could
 * read different files if the tree changed between the two.
 */
export function noteSkillLoaded(scope, skill) {
  if (!scope || !skill || typeof skill.name !== 'string') return scope;
  if (scope.loaded.some((s) => s.name === skill.name)) return scope;
  scope.loaded.push({ name: skill.name, allowed: skillAllowedTools(skill) });
  return scope;
}

/**
 * The skills currently constraining the turn, or null when none is.
 *
 * Each entry is `{ name, allowed }` with `allowed` a Set. Only skills that
 * actually declared something appear — a skill with no `allowed-tools` is
 * loaded but unconstrained, and listing it here would make a refusal name a
 * skill that did not cause it.
 */
export function activeConstraints(scope) {
  if (!scope) return [];
  return scope.loaded.filter((s) => s.allowed && s.allowed.size);
}

/** The intersection of every loaded skill's declaration, or null if unconstrained. */
export function effectiveAllowedTools(scope) {
  const active = activeConstraints(scope);
  if (active.length === 0) return null;
  let out = null;
  for (const { allowed } of active) {
    if (out === null) {
      out = new Set(allowed);
      continue;
    }
    for (const t of [...out]) if (!allowed.has(t)) out.delete(t);
  }
  return out;
}

/**
 * Refuse a call that a loaded skill excludes.
 *
 * Returns null when the call is fine. The message names the binding skills and
 * lists what they allow, because a refusal the model cannot act on is a refusal
 * it will retry identically.
 *
 * `skill` itself is always permitted — a skill that could not load another
 * skill would be a one-way door, and a restriction that blocks its own escape
 * hatch is a trap rather than a policy.
 *
 * MCP tools are exempt. A skill author cannot enumerate third-party tool names,
 * so a declaration that excluded unknown names would exclude every external
 * tool, silently, for reasons the author never stated.
 */
export function checkSkillScope(scope, toolName) {
  if (toolName === 'skill') return null;
  const active = activeConstraints(scope);
  if (active.length === 0) return null;
  const allowed = effectiveAllowedTools(scope);
  if (allowed === null || allowed.has(toolName)) return null;
  const names = active.map((s) => `"${s.name}"`).join(' and ');
  const permitted = [...allowed].sort().join(', ') || '(nothing)';
  return {
    gate: 'skillScope',
    reason:
      `The ${names} skill declares allowed-tools and does not include ${toolName}. ` +
      `Permitted while it is loaded: ${permitted}. ` +
      'Finish the skill\'s work with those, or invoke the skill again without it.',
  };
}

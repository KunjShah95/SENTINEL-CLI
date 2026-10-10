/**
 * Handing a skill to an agent you did not become.
 *
 * Two callers delegate: `spawnSubagentTask` (waits for the summary) and
 * `team.js` (fire-and-forget, optionally in a worktree). Both take a `skills`
 * field, both load the same bodies, and both must produce the same message —
 * otherwise a workflow would behave differently depending on whether you
 * delegated it or waited for it, which is a bug nobody would think to look for.
 *
 * It lives here rather than in `loop.js` for the same reason `gates.js`,
 * `tasks.js` and `hooks.js` do: it is one concern, has no turn state, and can
 * be tested with literals.
 *
 * The design question this module answers is *how a delegated agent learns it
 * has a workflow at all*. A subagent starts with one user message and a system
 * prompt. The skill listing is in that prompt, so a model that notices will call
 * the `skill` tool — but "will notice" is not a guarantee, and a delegation that
 * depends on the callee having an idea is a delegation you do not have. So the
 * body is prepended, named, and fenced.
 */
import { resolveSkill, applySkillArgs, listSkillScripts } from './skills.js';

/**
 * Normalize a `skills` field into `[{ name, args }]`.
 *
 * Three shapes are accepted because three shapes are what models send:
 *
 *   "review"                              one skill, no arguments
 *   ["review", "tdd"]                     several
 *   [{ name: "review", args: ["a.js"] }]  one, with arguments
 *
 * A bare string is deliberately not split on whitespace or commas. A skill name
 * is an identifier, and inventing separators means a name containing a space
 * becomes two wrong names rather than one right one.
 */
export function normalizeSkillNames(skills) {
  const list = Array.isArray(skills) ? skills : skills === undefined || skills === null ? [] : [skills];
  const out = [];
  for (const entry of list) {
    if (typeof entry === 'string') {
      const name = entry.trim();
      if (name) out.push({ name, args: [] });
      continue;
    }
    if (entry && typeof entry === 'object' && typeof entry.name === 'string' && entry.name.trim()) {
      out.push({ name: entry.name.trim(), args: normalizeArgs(entry.args) });
    }
  }
  // Deduped by name, first occurrence wins. Two entries for one skill injects its
  // body twice, and an agent reading a workflow twice reads it as two separate
  // instructions and may try to follow both.
  const seen = new Set();
  return out.filter((s) => (seen.has(s.name) ? false : seen.add(s.name)));
}

// Local rather than imported from `skills.js`, which owns the same rule. Kept
// inline so this module has no dependency edge to the skill registry and can be
// imported from `loop.js` without a cycle; the test below pins the two to the
// same behaviour so they cannot drift.
function normalizeArgs(args) {
  if (args === undefined || args === null) return [];
  const list = Array.isArray(args) ? args : [args];
  return list
    .filter((a) => a !== undefined && a !== null)
    .map((a) => (typeof a === 'string' ? a : String(a)))
    .filter((a) => a.length > 0);
}

/**
 * Render loaded skills as a preamble for a delegated agent's first message.
 *
 * Returns `{ text, error }`. An unknown skill is an error rather than a silent
 * skip: a delegated agent asked to use a workflow that does not exist would
 * otherwise proceed on the prompt alone and report success, which is the one
 * failure mode that looks most like working.
 *
 * The preamble names the skills up front. An agent that cannot tell which
 * workflows it was handed cannot tell the difference between following one and
 * improvising something adjacent to it.
 *
 * @param cwd the *delegated agent's* directory, not `process.cwd()`. A teammate
 *   in an isolated worktree has its own tree, and resolving the skill against
 *   the lead's cwd either misses it or grades a different one.
 */
export function buildSkillPreamble(skills, cwd, { heading = 'skill' } = {}) {
  const entries = normalizeSkillNames(skills);
  if (entries.length === 0) return { text: '', error: null };

  const loaded = [];
  for (const { name, args } of entries) {
    const skill = resolveSkill(name, cwd);
    if (!skill) {
      return {
        text: '',
        error:
          `Unknown ${heading}: ${name}. Omit \`skills\` to delegate without one, ` +
          'or list the directory with listDirectory to find the right name.',
      };
    }
    loaded.push({
      name: skill.name,
      body: applySkillArgs(skill.body, args),
      scripts: listSkillScripts(skill),
    });
  }

  const names = loaded.map((l) => l.name).join(', ');
  const blocks = loaded
    .map(({ name, body, scripts }) =>
      [
        `<skill name="${name}">`,
        body,
        scripts.length
          ? '\nThis skill ships scripts. Run one with the runSkillScript tool: ' +
            `{ name: "${name}", script: "<path>", args: [...] }. Available: ${scripts.join(', ')}.`
          : '',
        '</skill>',
      ]
        .filter(Boolean)
        .join('\n')
    )
    .join('\n\n');

  return {
    text:
      `You were given ${loaded.length === 1 ? 'a skill' : `${loaded.length} skills`} (${names}) to follow for this task. ` +
      'Follow the stated workflow; it is the method, and your prompt is the task.\n\n' +
      `${blocks}\n\n---\n\n`,
    error: null,
  };
}

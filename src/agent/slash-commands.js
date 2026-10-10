/**
 * `/name args…` — one syntax for two things.
 *
 * A user typing `/review auth.js` cannot reasonably be told which of two
 * registries it should have gone in. Prompt templates (markdown files in
 * `.sentinel/prompts`) and skills (a `SKILL.md` per directory under
 * `.sentinel/skills`) are different mechanisms with different capabilities — a
 * template is a static prompt, a skill has bundled scripts and metadata — but
 * from the keyboard they are the same gesture, and splitting them means the
 * user has to know which is which.
 *
 * So they share one syntax and one argument parser. The split is *what resolves
 * the name*, and it is decided once here:
 *
 *   1. A prompt template wins. It is the more specific mechanism and the older
 *      one; a project that had `/review` before skills existed must not have it
 *      silently change meaning because someone installed a skill of that name.
 *   2. Otherwise a skill, with the same `$1` and `$ARGUMENTS` substitution —
 *      `substituteArgs` is shared with the template path, so a body cannot mean
 *      `$1` differently depending on which registry it came from.
 *   3. Otherwise the text passes through untouched. `/help`, `/steer` and every
 *      TUI command land here and must survive unchanged.
 *
 * This is the explicit-invocation path. It is also the *only* way to reach a
 * skill marked `disable-model-invocation`, which is the whole point of that
 * frontmatter key: the skill is withheld from the model but a human can still
 * run it.
 *
 * It lives in its own module because both registries have to be visible at once,
 * and `skills.js` already imports from `prompt-templates.js` — a dispatcher
 * inside either one would be a cycle.
 */
import { listPromptTemplates, parseCommandArgs, expandPromptTemplate, SLASH_RE } from './prompt-templates.js';
import { resolveSkill, applySkillArgs, listSkillScripts, listSkills } from './skills.js';

// Re-exported so callers that only care about "is this a slash command?" do not
// have to know which of the two modules owns the syntax.
export { SLASH_RE };

/** Parse `/name args…`. Returns null when the text is not a slash command. */
export function parseSlashCommand(text) {
  const m = SLASH_RE.exec(String(text || '').trim());
  if (!m) return null;
  return { name: m[1], argsString: m[2] || '' };
}

/**
 * Resolve `/name args…` against templates then skills.
 *
 * @returns {{text: string, template: ?string, skill: ?string, scripts: string[],
 *   error: ?string}} `text` is the input unchanged when nothing matched.
 */
export function expandSlashCommand(text, cwd = process.cwd()) {
  const passthrough = { text, template: null, skill: null, scripts: [], error: null };
  const parsed = parseSlashCommand(text);
  if (!parsed) return passthrough;

  const args = parseCommandArgs(parsed.argsString);

  // The template branch is *delegated*, not reimplemented. This function used to
  // carry its own copy of the slash regex, the registry lookup, and the
  // substitution — three copies of what `expandPromptTemplate` already does,
  // which is the shape of drift `tool-taxonomy.js` exists to prevent. Calling it
  // means a template changed in one place cannot be unchanged in the other.
  const tpl = expandPromptTemplate(text, cwd);
  if (tpl.template) {
    return { text: tpl.text, template: tpl.template, skill: null, scripts: [], error: null };
  }

  const skill = resolveSkill(parsed.name, cwd);
  if (!skill) return passthrough;

  // The frontmatter is included, not just the body. A skill invoked from the
  // keyboard has no system-prompt listing to supply the name and description,
  // so without them the model receives a workflow with no way to know which one
  // it is — the same reason `skillImpl` returns them.
  const scripts = listSkillScripts(skill);
  const header = `You are running the "${skill.name}" skill${skill.description ? ` (${skill.description})` : ''}. Follow it.`;
  const scriptNote = scripts.length
    ? `\n\nThis skill ships scripts. Run one with the runSkillScript tool: { name: "${skill.name}", script: "<path>", args: [...] }. Available: ${scripts.join(', ')}.`
    : '';

  return {
    text: `${header}${scriptNote}\n\n${applySkillArgs(skill.body, args)}`,
    template: null,
    skill: skill.name,
    scripts,
    error: null,
  };
}

/**
 * `/name` completions for the input bar: skills and templates together, so the
 * suggestion list is not missing the half of the namespace the user is typing.
 */
export function slashCommandSuggestions(prefix, cwd = process.cwd()) {
  const p = String(prefix || '').replace(/^\//, '').toLowerCase();
  const out = [];
  const seen = new Set();
  const add = (name, source) => {
    const key = `${source}:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name, source, label: `/${name}`, description: source === 'skill' ? 'skill' : 'prompt' });
  };
  for (const t of listPromptTemplates(cwd)) add(t.name, 'template');
  // `listSkills` is not imported: the dispatcher already owns the skill lookup
  // and a second registry walk per keystroke is not worth it. Only the names
  // already resolvable matter, and `resolveSkill` is the authority on those.
  for (const name of knownSkillNames(cwd)) add(name, 'skill');
  return out.filter((s) => s.name.toLowerCase().startsWith(p));
}

let _skillNames = null;

/**
 * Skill names for completions, memoized per process.
 *
 * Best-effort: a failure returns an empty list rather than throwing, because
 * this runs inside an input bar's render path, where an exception takes down
 * the UI rather than showing fewer suggestions. `cwd` is fixed per session, so
 * the memo is safe; a second project in the same process is the one case that
 * would show stale names, and completions are advisory.
 */
function knownSkillNames(cwd) {
  try {
    if (!_skillNames) _skillNames = listSkills(cwd).map((s) => s.name);
    return _skillNames;
  } catch {
    return [];
  }
}

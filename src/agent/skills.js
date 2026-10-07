/**
 * Skills — reusable workflow prompts loaded on demand, not upfront.
 *
 * Claude Code lesson: list skill names + descriptions in context (cheap),
 * expand the full SKILL.md only when the model invokes the Skill tool.
 * Skills live in `.sentinel/skills/<name>/SKILL.md` (project) or
 * `.claude/skills/<name>/SKILL.md` (Claude-compatible). Each file starts
 * with `name:` / `description:` frontmatter lines, then the workflow body.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { homedir } from 'node:os';

export function skillDirs(cwd = process.cwd(), { includeGlobal = true } = {}) {
  const dir = resolve(cwd);
  const home = homedir();
  // skills.sh and the major coding assistants use the same SKILL.md format,
  // but not the same install directory. Read all of the conventional project
  // and global locations so one installed skill is available to Sentinel
  // without copying it into `.sentinel/skills`.
  const projectDirs = [
    join(dir, '.sentinel', 'skills'),
    join(dir, '.claude', 'skills'),
    join(dir, '.codex', 'skills'),
    join(dir, '.agents', 'skills'),
    join(dir, '.opencode', 'skills'),
  ];
  const globalDirs = [
    join(home, '.sentinel', 'skills'),
    join(home, '.claude', 'skills'),
    join(home, '.codex', 'skills'),
    join(home, '.agents', 'skills'),
    join(home, '.opencode', 'skills'),
  ];
  return [...new Set(includeGlobal ? [...projectDirs, ...globalDirs] : projectDirs)];
}

function parseSkillFile(file) {
  let raw;
  try {
    raw = readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
  const lines = raw.split(/\r?\n/);
  let name = null;
  let description = null;
  let bodyStart = 0;
  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        bodyStart = i + 1;
        break;
      }
      const m = /^([A-Za-z]+):\s*(.*)$/.exec(lines[i]);
      if (m && m[1].toLowerCase() === 'name') name = m[2].trim();
      if (m && m[1].toLowerCase() === 'description') description = m[2].trim();
    }
  }
  if (!name) name = basename(join(file, '..'));
  if (!description) description = (lines[bodyStart] || '').trim().slice(0, 120);
  const body = lines.slice(bodyStart).join('\n').trim();
  return { name, description, body, file };
}

export function listSkills(cwd = process.cwd(), options = {}) {
  const out = [];
  const seen = new Set();
  for (const dir of skillDirs(cwd, options)) {
    if (!existsSync(dir)) continue;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const file = join(dir, e.name, 'SKILL.md');
      if (!existsSync(file)) continue;
      const skill = parseSkillFile(file);
      if (skill && !seen.has(skill.name)) {
        seen.add(skill.name);
        out.push({ name: skill.name, description: skill.description });
      }
    }
  }
  return out;
}

export function getSkillPrompt(name, cwd = process.cwd(), options = {}) {
  for (const dir of skillDirs(cwd, options)) {
    const direct = join(dir, name, 'SKILL.md');
    if (existsSync(direct)) {
      const skill = parseSkillFile(direct);
      if (skill) return skill.body;
    }
    if (!existsSync(dir)) continue;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const skill = parseSkillFile(join(dir, e.name, 'SKILL.md'));
      if (skill && skill.name === name) return skill.body;
    }
  }
  return null;
}

/**
 * Budget for the skill listing in the system prompt.
 *
 * This section is a FIXED PREFIX: it is rebuilt every turn and re-sent on every
 * one of the up-to-25 (BUILD) / 60 (SWE) model calls in a turn. A user with a
 * large global skill library was measured at 208 skills / 57.5k chars ≈ 14.4k
 * tokens — which was 96% of the whole system prompt, re-billed every iteration.
 * Two providers cannot even cache it (only Anthropic gets `cache_control`
 * today), so on the other twelve it is 359k–862k tokens of pure per-turn tax.
 *
 * The listing is therefore capped, and what survives the cap is chosen by
 * relevance to the request rather than by directory order.
 */
export const SKILL_LISTING_CHAR_CAP = 2000;
export const SKILL_DESCRIPTION_CHAR_CAP = 120;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'is',
  'are', 'be', 'it', 'this', 'that', 'as', 'at', 'by', 'from', 'we', 'you',
  'i', 'my', 'our', 'your', 'do', 'does', 'if', 'then', 'so', 'but', 'not',
  'can', 'will', 'should', 'would', 'there', 'their', 'them', 'they', 'he',
  'she', 'his', 'her', 'have', 'has', 'had', 'was', 'were', 'about', 'into',
  'use', 'using', 'used', 'when', 'what', 'which', 'who', 'how', 'all', 'any',
  'add', 'new', 'get', 'set', 'make', 'made', 'run', 'via', 'per',
]);

/** Lowercase word tokens, stopwords and 1-char noise removed. */
function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Score a skill against the request. Deliberately simple and dependency-free:
 * token overlap plus a bonus for a literal name hit. A cheap lexical match that
 * is occasionally generous beats an embedding model that has to be downloaded,
 * run, and re-run per turn on a tool that must stay instant.
 *
 * Returns 0 for no signal at all, which keeps an unmatched skill out of the
 * prompt unless the budget has room left over.
 */
export function scoreSkill(skill, requestTokens) {
  if (!requestTokens.size) return 0;
  const name = String(skill.name || '').toLowerCase();
  let score = 0;
  // A literal hit on the skill's own name is the strongest signal available.
  if (name && requestTokens.has(name)) score += 6;
  const nameTokens = new Set(tokenize(skill.name));
  const descTokens = new Set(tokenize(skill.description));
  for (const t of requestTokens) {
    if (nameTokens.has(t)) score += 3;
    else if (descTokens.has(t)) score += 1;
  }
  return score;
}

/**
 * One-line-per-skill listing for system-prompt injection, budgeted.
 *
 * Skills that match the request come first; the rest fill whatever budget is
 * left so the model can still discover an unlisted skill by name (the `skill`
 * tool resolves from disk, not from this list). When even the best N do not
 * fit, the section says so and points at discovery instead of silently
 * dropping the capability.
 */
export function formatSkillListing(cwd = process.cwd(), options = {}) {
  const { request = '', charCap = SKILL_LISTING_CHAR_CAP, ...listOptions } = options || {};
  const skills = listSkills(cwd, listOptions);
  if (skills.length === 0) return '';

  const requestTokens = new Set(tokenize(request));
  const scored = skills.map((skill) => ({ skill, score: scoreSkill(skill, requestTokens) }));
  const matched = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  const rest = scored.filter((s) => s.score === 0);

  const render = ({ name, description }) =>
    `- ${name}: ${String(description || '').replace(/\s+/g, ' ').trim().slice(0, SKILL_DESCRIPTION_CHAR_CAP)}`;

  const header =
    'Available skills (invoke with the skill tool BEFORE handling the request yourself). ' +
    'Skills matching the request are listed first.';
  const lines = [];
  let used = header.length;
  let overflow = 0;

  // A helper, so "it did not fit" is counted in one place instead of guessed at
  // from a loop index — which is what made the first cut of this miscount.
  const tryPush = (line) => {
    if (used + line.length + 1 > charCap) return false;
    lines.push(line);
    used += line.length + 1;
    return true;
  };

  for (const { skill } of matched) if (!tryPush(render(skill))) overflow++;
  for (const { skill } of rest) if (!tryPush(render(skill))) overflow++;

  if (lines.length === 0) {
    // Over budget even after capping descriptions: emit names only rather than
    // nothing, so the model still knows the tool is worth reaching for.
    for (const { skill } of [...matched, ...rest]) {
      if (!tryPush(`- ${skill.name}`)) break;
    }
  }

  let note = '';
  if (overflow > 0) {
    note = `\n…${overflow} more skill${overflow === 1 ? '' : 's'} not listed — list .sentinel/skills with listDirectory, or invoke one by name with the skill tool.`;
  }
  return `${header}\n${lines.join('\n')}${note}`;
}

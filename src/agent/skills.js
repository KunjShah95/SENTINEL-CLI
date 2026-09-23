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

export function skillDirs(cwd = process.cwd()) {
  const dir = resolve(cwd);
  return [join(dir, '.sentinel', 'skills'), join(dir, '.claude', 'skills')];
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

export function listSkills(cwd = process.cwd()) {
  const out = [];
  const seen = new Set();
  for (const dir of skillDirs(cwd)) {
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

export function getSkillPrompt(name, cwd = process.cwd()) {
  for (const dir of skillDirs(cwd)) {
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

/** One-line-per-skill listing for system-prompt injection (cheap). */
export function formatSkillListing(cwd = process.cwd()) {
  const skills = listSkills(cwd);
  if (skills.length === 0) return '';
  const lines = skills.map((s) => `- ${s.name}: ${s.description}`);
  return `Available skills (invoke with the skill tool BEFORE handling the request yourself):\n${lines.join('\n')}`;
}

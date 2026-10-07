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

/** One-line-per-skill listing for system-prompt injection (cheap). */
export function formatSkillListing(cwd = process.cwd(), options = {}) {
  const skills = listSkills(cwd, options);
  if (skills.length === 0) return '';
  const lines = skills.map((s) => `- ${s.name}: ${s.description}`);
  return `Available skills (invoke with the skill tool BEFORE handling the request yourself):\n${lines.join('\n')}`;
}

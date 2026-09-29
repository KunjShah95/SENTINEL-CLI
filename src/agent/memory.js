/**
 * Persistent memory (ported from learn-claude-code s09_memory).
 *
 * One Markdown file per record under .sentinel/memory/, YAML-ish
 * frontmatter (name / description / type), and a regenerated MEMORY.md
 * index. The prompt carries only the index (cheap); the model reads a full
 * record with readFile when a line looks relevant — the same
 * list-cheap/expand-on-demand pattern as skills.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getWorkdir } from '../shared/tools/workdir.js';

export const MEMORY_TYPES = Object.freeze(['user', 'feedback', 'project', 'reference']);
export const MEMORY_INDEX_CAP = 3000;
const INDEX_FILE = 'MEMORY.md';

export function memoryDir(cwd = getWorkdir()) {
  return join(cwd, '.sentinel', 'memory');
}

export function memorySlug(name) {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  if (!slug) throw new Error('memory name must contain letters or digits');
  return slug;
}

const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();

export function memoryDocument({ name, type, description, body }) {
  return `---\nname: ${oneLine(name)}\ndescription: ${oneLine(description)}\ntype: ${type}\n---\n\n${String(body || '').trim()}\n`;
}

export function parseMemory(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text || '');
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  if (!meta.name) return null;
  return { name: meta.name, description: meta.description || '', type: meta.type || 'project', body: m[2].trim() };
}

export function listMemories(cwd = getWorkdir()) {
  const dir = memoryDir(cwd);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.md') || f === INDEX_FILE) continue;
    try {
      const rec = parseMemory(readFileSync(join(dir, f), 'utf8'));
      if (rec) out.push({ ...rec, file: f });
    } catch { /* unreadable record: skip */ }
  }
  return out;
}

export function rebuildMemoryIndex(cwd = getWorkdir()) {
  const dir = memoryDir(cwd);
  mkdirSync(dir, { recursive: true });
  const lines = listMemories(cwd).map((m) => `- [${m.name}](${m.file}) (${m.type}) — ${m.description}`);
  writeFileSync(join(dir, INDEX_FILE), lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
  return lines;
}

export function writeMemory({ name, type = 'project', description = '', body = '' }, cwd = getWorkdir()) {
  if (!MEMORY_TYPES.includes(type)) throw new Error(`type must be one of ${MEMORY_TYPES.join(', ')}`);
  if (!oneLine(description)) throw new Error('description is required');
  if (!String(body).trim()) throw new Error('body is required');
  const file = `${memorySlug(name)}.md`;
  mkdirSync(memoryDir(cwd), { recursive: true });
  writeFileSync(join(memoryDir(cwd), file), memoryDocument({ name, type, description, body }), 'utf8');
  rebuildMemoryIndex(cwd);
  return { file: `.sentinel/memory/${file}` };
}

export function deleteMemory(name, cwd = getWorkdir()) {
  const p = join(memoryDir(cwd), `${memorySlug(name)}.md`);
  if (!existsSync(p)) return { deleted: false };
  unlinkSync(p);
  rebuildMemoryIndex(cwd);
  return { deleted: true };
}

/** Prompt section: the index only, capped. Null when there is no memory. */
export function buildMemorySection(cwd = getWorkdir()) {
  const mems = listMemories(cwd);
  if (!mems.length) return null;
  let index = mems.map((m) => `- .sentinel/memory/${m.file} (${m.type}) — ${m.description}`).join('\n');
  if (index.length > MEMORY_INDEX_CAP) index = `${index.slice(0, MEMORY_INDEX_CAP)}\n…[index truncated]`;
  return [
    '# Memory',
    'Records saved in earlier sessions. Read a record with readFile when it looks relevant; memories may be stale, so verify facts against the code before relying on them.',
    index,
  ].join('\n');
}

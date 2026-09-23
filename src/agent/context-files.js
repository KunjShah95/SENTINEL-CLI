/**
 * Project context files — JS runtime twin of src/tui/lib/context-file.ts.
 *
 * Claude Code reads CLAUDE.md at every directory level; Sentinel reads the
 * same files (plus SENTINEL.md / AGENTS.md) and injects them into the system
 * prompt so the model follows project conventions without being told twice.
 * Plain files, no database — the repo is the index.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const MAX_CHARS_PER_FILE = 3000;

const CONTEXT_FILE_NAMES = [
  'SENTINEL.md',
  'CLAUDE.md',
  'AGENTS.md',
  '.sentinel/context.md',
];

export function loadContextFiles(cwd = process.cwd()) {
  const dir = resolve(cwd);
  const results = [];
  for (const name of CONTEXT_FILE_NAMES) {
    const absPath = join(dir, name);
    if (!existsSync(absPath)) continue;
    let content;
    try {
      content = readFileSync(absPath, 'utf-8');
    } catch {
      continue;
    }
    if (content.length > MAX_CHARS_PER_FILE) {
      const truncated = content.slice(0, MAX_CHARS_PER_FILE);
      const lastNewline = truncated.lastIndexOf('\n');
      content = lastNewline > MAX_CHARS_PER_FILE / 2
        ? truncated.slice(0, lastNewline) + '\n\n[... truncated ...]'
        : truncated + '\n\n[... truncated ...]';
    }
    results.push({ path: absPath, content: content.trim(), source: name });
  }
  return results;
}

export function buildContextInjection(files) {
  if (!files || files.length === 0) return '';
  return files
    .map((f) => `## Project Context (from ${f.source})\n\n${f.content}`)
    .join('\n\n---\n\n');
}

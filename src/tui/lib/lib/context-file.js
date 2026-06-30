/**
 * Context File Loader — reads project context files (SENTINEL.md, CLAUDE.md,
 * .sentinel/context.md) and injects them into prompts, similar to how
 * Claude Code reads CLAUDE.md.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
// ─── Constants ────────────────────────────────────────────────────────────────
/** Max characters to read from any single context file. */
const MAX_CHARS_PER_FILE = 3000;
/** Context file names searched in order of priority. */
const CONTEXT_FILE_NAMES = [
  'SENTINEL.md',
  'CLAUDE.md',
  '.sentinel/context.md',
];
// ─── Core functions ───────────────────────────────────────────────────────────
/**
 * Load all context files that exist in `cwd`.
 * Returns them in priority order: SENTINEL.md → CLAUDE.md → .sentinel/context.md.
 */
export function loadContextFiles(cwd) {
  const dir = resolve(cwd ?? process.cwd());
  const results = [];
  for (const source of CONTEXT_FILE_NAMES) {
    const absPath = join(dir, source);
    if (!existsSync(absPath))
      continue;
    let content;
    try {
      content = readFileSync(absPath, 'utf-8');
    }
    catch {
      continue;
    }
    // Trim to max chars, breaking at a newline boundary where possible
    if (content.length > MAX_CHARS_PER_FILE) {
      const truncated = content.slice(0, MAX_CHARS_PER_FILE);
      const lastNewline = truncated.lastIndexOf('\n');
      content = lastNewline > MAX_CHARS_PER_FILE / 2
        ? truncated.slice(0, lastNewline) + '\n\n[... truncated ...]'
        : truncated + '\n\n[... truncated ...]';
    }
    results.push({ path: absPath, content: content.trim(), source });
  }
  return results;
}
/**
 * Format a list of context files into a single markdown block suitable for
 * injection at the top of a prompt.
 */
export function buildContextInjection(files) {
  if (files.length === 0)
    return '';
  const sections = files.map(f => {
    return `## Project Context (from ${f.source})\n\n${f.content}\n\n---`;
  });
  return sections.join('\n\n');
}
/**
 * Prepend context files to `prompt` if any exist in `cwd`.
 * Returns the original prompt unchanged when no context files are found.
 */
export function injectContextIntoPrompt(prompt, cwd) {
  const files = loadContextFiles(cwd);
  if (files.length === 0)
    return prompt;
  const injection = buildContextInjection(files);
  return `${injection}\n\n${prompt}`;
}
// ─── Template creator ─────────────────────────────────────────────────────────
const SENTINEL_MD_TEMPLATE = `# Project Context

## About This Project
[Describe your project here]

## Security Notes
[List any security considerations, sensitive areas, or areas to focus on]

## Architecture
[Brief architecture overview]

## Out of Scope
[List anything Sentinel should NOT touch or fix]
`;
/**
 * Create a SENTINEL.md template in `cwd` if none of the supported context
 * files already exist. No-ops silently when a file already exists.
 */
export function createDefaultContextFile(cwd) {
  const dir = resolve(cwd ?? process.cwd());
  // Don't create if any context file already exists
  for (const source of CONTEXT_FILE_NAMES) {
    if (existsSync(join(dir, source)))
      return;
  }
  // Ensure the sentinel dir exists if we ever need it (not needed for SENTINEL.md at root)
  const sentinelDir = join(dir, '.sentinel');
  try {
    if (!existsSync(sentinelDir)) {
      mkdirSync(sentinelDir, { recursive: true });
    }
  }
  catch {
    // Non-fatal: we'll still write SENTINEL.md at the root
  }
  const targetPath = join(dir, 'SENTINEL.md');
  try {
    writeFileSync(targetPath, SENTINEL_MD_TEMPLATE, 'utf-8');
  }
  catch {
    // Silently ignore write errors (read-only FS, permissions, etc.)
  }
}

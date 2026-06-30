/**
 * Local tool execution — sandboxed file system + grep/glob + bash.
 *
 * All tools resolve their target path inside the current working directory
 * and refuse to escape. The PLAN mode guard blocks write/edit/bash.
 *
 * Mirrors packages/cli/src/lib/local-tools.ts from Nightcode (Node-compatible
 * subset — no Bun.spawn or Bun.Glob, falls back to Node primitives).
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { createPatch } from 'diff';
import { Mode, isReadOnlyTool } from '../schemas/mode.js';
import { runSandboxed } from './sandbox.js';
import { createCheckpoint, restoreCheckpoint, redoCheckpoint } from './checkpoint.js';
import { toolInputSchemas, READ_ONLY_TOOL_NAMES, BUILD_TOOL_NAMES, isReadOnly } from './schemas.js';

// Re-export so callers can do `import { Mode, toolInputSchemas } from "./tools"`.
export {
  Mode,
  isReadOnlyTool,
  toolInputSchemas,
  READ_ONLY_TOOL_NAMES,
  BUILD_TOOL_NAMES,
  isReadOnly,
};

export const MAX_FILE_SIZE = 10_000;
export const MAX_RESULTS = 200;
export const MAX_MATCHES = 50;
export const MAX_OUTPUT = 20_000;
export const DEFAULT_TIMEOUT = 30_000;

export function resolveInsideCwd(inputPath) {
  const cwd = process.cwd();
  const target = path.isAbsolute(inputPath) ? inputPath : path.resolve(cwd, inputPath);

  if (process.platform === 'win32') {
    if (target.startsWith('\\\\')) {
      throw new Error('Path is outside the project directory');
    }
    if (target.includes(':') && !/^[a-zA-Z]:[\\/]/.test(target)) {
      throw new Error('Path is outside the project directory');
    }
  }

  let resolvedTarget = target;
  let resolvedCwd = cwd;
  try {
    resolvedTarget = realpathSync(target);
    resolvedCwd = realpathSync(cwd);
  } catch {}

  const rel = path.relative(resolvedCwd, resolvedTarget);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path is outside the project directory');
  }
  return { cwd: resolvedCwd, resolved: resolvedTarget, relative: rel || '.' };
}

export function truncate(value, limit) {
  if (typeof value !== 'string') return value;
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n... (truncated, ${value.length} total chars)`;
}

async function readFileImpl(input) {
  const p = input?.path;
  if (typeof p !== 'string') throw new Error('path is required');
  const { resolved, relative } = resolveInsideCwd(p);
  const content = await fs.readFile(resolved, 'utf-8');
  if (content.length > MAX_FILE_SIZE) {
    return {
      content: content.slice(0, MAX_FILE_SIZE),
      truncated: true,
      totalLength: content.length,
      path: relative,
    };
  }
  return { content, path: relative };
}

async function listDirectoryImpl(input) {
  const p = input?.path ?? '.';
  const { resolved, relative } = resolveInsideCwd(p);
  const names = await fs.readdir(resolved);
  const entries = [];
  for (const name of names) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    const full = path.join(resolved, name);
    try {
      const st = await fs.stat(full);
      entries.push({ name, type: st.isDirectory() ? 'directory' : 'file' });
    } catch {
      // skip
    }
  }
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return { path: relative || '.', entries };
}

async function globImpl(input) {
  const pattern = input?.pattern;
  const cwdDir = input?.path ?? '.';
  if (typeof pattern !== 'string' || pattern.length === 0) {
    throw new Error('pattern is required');
  }
  const { resolved, relative } = resolveInsideCwd(cwdDir);

  const files = [];
  let truncated = false;
  await walkDir(resolved, '', files, pattern, MAX_RESULTS + 1);
  if (files.length > MAX_RESULTS) {
    files.length = MAX_RESULTS;
    truncated = true;
  }
  const out = {
    files: files.map(f => path.posix.join(relative === '.' ? '' : relative, f).replace(/\\/g, '/')),
  };
  if (truncated) out.truncated = true;
  return out;
}

async function walkDir(base, rel, out, pattern, cap) {
  if (out.length >= cap) return;
  let entries;
  try {
    entries = await fs.readdir(path.join(base, rel), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= cap) return;
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const childRel = rel ? path.posix.join(rel, entry.name) : entry.name;
    if (entry.isDirectory()) {
      await walkDir(base, childRel, out, pattern, cap);
    } else if (entry.isFile()) {
      if (matchGlob(entry.name, pattern) || matchGlob(childRel, pattern)) {
        out.push(childRel);
      }
    }
  }
}

function matchGlob(name, pattern) {
  // Small glob: supports `*`, `**`, and `?`. Does NOT support `{a,b}`, `[abc]`.
  if (!pattern.includes('*') && !pattern.includes('?')) return name === pattern;
  const re = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\?/g, '[^/]')
        .replace(/\*\*/g, '::')
        .replace(/\*/g, '[^/]*')
        .replace(/::/g, '.*') +
      '$'
  );
  return re.test(name);
}

function validateRegexPattern(pattern) {
  if (/\([^()]*[+*][^()]*\)[+*?]/.test(pattern)) {
    throw new Error('Pattern contains nested quantifiers which may cause excessive backtracking');
  }
  if (/\([^()]*\|[^()]*\)[+*?]/.test(pattern)) {
    throw new Error('Pattern contains alternation inside quantified groups which may cause excessive backtracking');
  }
}

async function grepImpl(input) {
  const pattern = input?.pattern;
  const cwdDir = input?.path ?? '.';
  const include = input?.include;
  if (typeof pattern !== 'string' || pattern.length === 0) {
    throw new Error('pattern is required');
  }
  const { resolved } = resolveInsideCwd(cwdDir);
  let regex;
  try {
    validateRegexPattern(pattern);
    regex = new RegExp(pattern);
  } catch (e) {
    throw new Error(`Invalid regex: ${e.message}`);
  }
  const matches = [];
  await walkDirGrep(
    resolved,
    '',
    { matches, pattern, regex, include, cap: MAX_MATCHES + 1 },
    null,
    MAX_MATCHES + 1
  );
  const out = { matches: matches.slice(0, MAX_MATCHES) };
  if (matches.length > MAX_MATCHES) {
    out.truncated = true;
    out.totalMatches = matches.length;
  }
  return out;
}

async function walkDirGrep(base, rel, ctx, _parent, cap) {
  let entries;
  try {
    entries = await fs.readdir(path.join(base, rel), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (ctx.matches.length >= cap) return;
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const childRel = rel ? path.posix.join(rel, entry.name) : entry.name;
    if (entry.isDirectory()) {
      await walkDirGrep(base, childRel, ctx, null, cap);
    } else if (entry.isFile()) {
      if (ctx.include && !matchGlob(entry.name, ctx.include)) continue;
      const full = path.join(base, childRel);
      let content;
      try {
        content = await fs.readFile(full, 'utf-8');
      } catch {
        continue;
      }
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (regexExec(ctx.regex, lines[i])) {
          ctx.matches.push({ file: childRel, line: i + 1, content: lines[i] });
          if (ctx.matches.length >= cap) return;
        }
      }
    }
  }
}

function regexExec(re, s) {
  // Reset lastIndex to be safe
  re.lastIndex = 0;
  return re.test(s);
}

async function writeFileImpl(input) {
  const p = input?.path;
  const content = input?.content;
  if (typeof p !== 'string') throw new Error('path is required');
  if (typeof content !== 'string') throw new Error('content is required');
  const { resolved, relative } = resolveInsideCwd(p);
  // Checkpoint before overwriting
  try {
    await createCheckpoint([resolved]);
  } catch {}
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, content, 'utf-8');
  return {
    success: true,
    path: relative,
    bytesWritten: Buffer.byteLength(content, 'utf-8'),
  };
}

async function editFileImpl(input) {
  const p = input?.path;
  const oldString = input?.oldString;
  const newString = input?.newString;
  if (typeof p !== 'string') throw new Error('path is required');
  if (typeof oldString !== 'string') throw new Error('oldString is required');
  if (typeof newString !== 'string') throw new Error('newString is required');
  const { resolved, relative } = resolveInsideCwd(p);
  const current = await fs.readFile(resolved, 'utf-8');
  const occurrences = current.split(oldString).length - 1;
  if (occurrences === 0) throw new Error('oldString not found in file');
  if (occurrences > 1) {
    throw new Error(`oldString is ambiguous; found ${occurrences} matches`);
  }
  // Checkpoint before editing
  try {
    await createCheckpoint([resolved]);
  } catch {}
  await fs.writeFile(resolved, current.replace(oldString, newString), 'utf-8');
  return { success: true, path: relative };
}

async function batchEditImpl(input) {
  const operations = input?.operations;
  const fallback = input?.fallback ?? false;

  if (!Array.isArray(operations) || operations.length < 1 || operations.length > 10) {
    throw new Error('operations must be an array of 1-10 edit operations');
  }

  const resolved = [];
  for (const op of operations) {
    if (typeof op.filePath !== 'string') throw new Error('Each operation must have a filePath');
    if (typeof op.oldString !== 'string') throw new Error('Each operation must have an oldString');
    if (typeof op.newString !== 'string') throw new Error('Each operation must have a newString');

    const { resolved: r, relative } = resolveInsideCwd(op.filePath);
    const content = await fs.readFile(r, 'utf-8');
    const occurrences = content.split(op.oldString).length - 1;
    if (occurrences === 0) throw new Error(`oldString not found in ${relative}`);
    if (occurrences > 1)
      throw new Error(`oldString is ambiguous in ${relative}; found ${occurrences} matches`);

    resolved.push({ ...op, resolved: r, relative, content });
  }

  const backups = [];
  try {
    for (const { resolved: r } of resolved) {
      const backup = r + '.batchbak';
      await fs.copyFile(r, backup);
      backups.push(backup);
    }

    const succeeded = [];
    const errors = [];

    for (let i = 0; i < resolved.length; i++) {
      const op = resolved[i];
      try {
        const current = await fs.readFile(op.resolved, 'utf-8');
        await fs.writeFile(op.resolved, current.replace(op.oldString, op.newString), 'utf-8');
        succeeded.push(op.relative);
      } catch (err) {
        if (!fallback) {
          for (let j = 0; j < backups.length; j++) {
            try {
              await fs.copyFile(backups[j], resolved[j].resolved);
            } catch {}
          }
          for (const b of backups) {
            try {
              await fs.rm(b);
            } catch {}
          }
          return { success: false, error: 'Batch edit failed, all changes reverted' };
        }
        errors.push({ file: op.relative, error: err.message });
      }
    }

    for (const b of backups) {
      try {
        await fs.rm(b);
      } catch {}
    }

    if (errors.length > 0) {
      return {
        success: true,
        partial: true,
        operations: succeeded.length,
        files: succeeded,
        errors,
      };
    }

    return { success: true, operations: resolved.length, files: succeeded };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function runBashImpl(input) {
  const command = input?.command;
  const timeout = input?.timeout ?? DEFAULT_TIMEOUT;
  if (typeof command !== 'string' || command.length === 0) {
    throw new Error('command is required');
  }

  return new Promise(resolve => {
    try {
      const stdout = runSandboxed(command, {
        cwd: process.cwd(),
        timeout,
        env: { ...process.env, TERM: 'dumb' },
      });
      resolve({
        stdout: truncate(stdout?.toString() || '', MAX_OUTPUT),
        stderr: '',
        exitCode: 0,
        timedOut: false,
      });
    } catch (err) {
      resolve({
        stdout: truncate(err.stdout?.toString() || '', MAX_OUTPUT),
        stderr: truncate(err.stderr?.toString() || '', MAX_OUTPUT),
        exitCode: err.status || 1,
        timedOut: false,
      });
    }
  });
}

async function searchWebImpl(input) {
  const query = input?.query;
  const count = input?.count ?? 5;
  if (typeof query !== 'string' || query.length === 0) {
    throw new Error('query is required');
  }
  const endpoint =
    (process.env.SEARCH_WEB_ENDPOINT || 'https://html.duckduckgo.com/html/').replace(/\/+$/, '') +
    '/';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const url = `${endpoint}?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const html = await res.text();
    const results = [];
    const linkRe = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    const linkMatches = [];
    let m;
    while ((m = linkRe.exec(html)) !== null && linkMatches.length < count) {
      linkMatches.push({ url: m[1], title: m[2].replace(/<[^>]+>/g, '').trim() });
    }
    const snippetMatches = [];
    while ((m = snippetRe.exec(html)) !== null && snippetMatches.length < count) {
      snippetMatches.push(m[1].replace(/<[^>]+>/g, '').trim());
    }
    for (let i = 0; i < Math.min(linkMatches.length, count); i++) {
      results.push({
        title: linkMatches[i].title,
        snippet: snippetMatches[i] || '',
        url: linkMatches[i].url,
      });
    }
    if (results.length === 0) {
      const fallbackUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`;
      const fallbackRes = await fetch(fallbackUrl, { signal: AbortSignal.timeout(10_000) });
      const data = await fallbackRes.json();
      if (data.AbstractText) {
        results.push({
          title: data.Heading || query,
          snippet: data.AbstractText,
          url: data.AbstractURL || '',
        });
      }
      if (data.Results) {
        for (const r of data.Results.slice(0, count)) {
          results.push({ title: r.Text || '', snippet: r.Text || '', url: r.FirstURL || '' });
        }
      }
    }
    return { results };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      return { error: 'Search request timed out' };
    }
    return { error: err.message };
  }
}

async function diffFileImpl(input) {
  const p = input?.path;
  const newContent = input?.newContent;
  if (typeof p !== 'string') throw new Error('path is required');
  if (typeof newContent !== 'string') throw new Error('newContent is required');
  const { resolved, relative } = resolveInsideCwd(p);
  let oldContent = '';
  try {
    oldContent = await fs.readFile(resolved, 'utf-8');
  } catch {
    // File doesn't exist yet — diff against empty
  }
  const patch = createPatch(relative, oldContent, newContent, 'current', 'proposed');
  return { diff: patch, path: relative };
}

async function undoLastChangeImpl(_input) {
  const result = await restoreCheckpoint();
  return {
    success: true,
    restored: result.restored,
    deleted: result.deleted,
    message: `Restored ${result.restored.length} file(s)${result.deleted.length > 0 ? `, removed ${result.deleted.length} new file(s)` : ''}.`,
  };
}

async function redoLastUndoImpl(_input) {
  const result = await redoCheckpoint();
  return {
    success: true,
    restored: result.restored,
    deleted: result.deleted,
    message: `Redid ${result.restored.length} file(s)${result.deleted.length > 0 ? `, removed ${result.deleted.length} new file(s)` : ''}.`,
  };
}

const TOOL_IMPLS = {
  readFile: readFileImpl,
  listDirectory: listDirectoryImpl,
  glob: globImpl,
  grep: grepImpl,
  searchWeb: searchWebImpl,
  writeFile: writeFileImpl,
  editFile: editFileImpl,
  batchEdit: batchEditImpl,
  bash: runBashImpl,
  diffFile: diffFileImpl,
  undoLastChange: undoLastChangeImpl,
  redoLastUndo: redoLastUndoImpl,
};

export const readOnlyToolContracts = Object.freeze({
  readFile: {
    description: 'Read a file from the current project directory.',
    inputSchema: toolInputSchemas.readFile,
  },
  listDirectory: {
    description: 'List entries in a directory under the current project directory.',
    inputSchema: toolInputSchemas.listDirectory,
  },
  glob: {
    description: 'Find files matching a glob pattern under the current project directory.',
    inputSchema: toolInputSchemas.glob,
  },
  grep: {
    description:
      'Search file contents with a regular expression under the current project directory.',
    inputSchema: toolInputSchemas.grep,
  },
  searchWeb: {
    description: 'Search the web and return relevant results (titles, snippets, URLs).',
    inputSchema: toolInputSchemas.searchWeb,
  },
});

export const buildToolContracts = Object.freeze({
  ...readOnlyToolContracts,
  writeFile: {
    description: 'Create or overwrite a file under the current project directory.',
    inputSchema: toolInputSchemas.writeFile,
  },
  editFile: {
    description: 'Replace exact text in a file under the current project directory.',
    inputSchema: toolInputSchemas.editFile,
  },
  batchEdit: {
    description: 'Apply multiple file edits atomically with rollback on failure.',
    inputSchema: toolInputSchemas.batchEdit,
  },
  bash: {
    description: 'Run a shell command in the current project directory.',
    inputSchema: toolInputSchemas.bash,
  },
  diffFile: {
    description: 'Preview a unified diff of proposed changes to a file without applying them.',
    inputSchema: toolInputSchemas.diffFile,
  },
  undoLastChange: {
    description: 'Undo the last file change by restoring from the most recent checkpoint.',
    inputSchema: toolInputSchemas.undoLastChange,
  },
});

export function getToolContracts(mode) {
  if (mode === Mode.PLAN || mode === Mode.REVIEW) return readOnlyToolContracts;
  return buildToolContracts;
}

export function getToolNames(mode) {
  return mode === Mode.PLAN || mode === Mode.REVIEW
    ? READ_ONLY_TOOL_NAMES
    : Object.keys(buildToolContracts);
}

/**
 * Execute a local tool call.
 * 1. Permission check (allow/deny/ask) — runs first
 * 2. Mode check (PLAN/REVIEW/SCAN block writes; FIX blocks shell)
 * 3. Execute the tool implementation
 *
 * @param {string} toolName
 * @param {object} input
 * @param {string} mode
 * @param {object} [options]
 * @param {function} [options.onPermissionAsk] — callback for 'ask' policy
 */
export async function executeLocalTool(toolName, input, mode = Mode.BUILD, options = {}) {
  // ── Permission check (opencode-inspired) ──────────────────────────
  let permCheck;
  try {
    const { checkPermission } = await import('./permissions.js');
    permCheck = checkPermission(toolName);
    if (!permCheck.allowed) {
      throw new Error(permCheck.message || `Tool ${toolName} is denied by permission policy`);
    }
    // If policy is 'ask' and no auto-confirm callback, still allow in CLI mode
    // (the TUI handles the confirmation UI separately)
  } catch (permErr) {
    if (permErr.message?.includes('permission policy') || permErr.message?.includes('denied')) {
      throw permErr;
    }
    // If permissions module isn't available, fall through
  }

  // ── Mode check ─────────────────────────────────────────────────────
  const { isToolAllowedInMode } = await import('../schemas/mode.js');
  if (!isToolAllowedInMode(toolName, mode)) {
    throw new Error(`Tool ${toolName} is not available in ${mode} mode`);
  }

  const impl = TOOL_IMPLS[toolName];
  if (!impl) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  return await impl(input);
}

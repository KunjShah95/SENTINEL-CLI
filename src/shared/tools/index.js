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
import { runSandboxedAsync } from './sandbox.js';
import { createCheckpoint, restoreCheckpoint, redoCheckpoint } from './checkpoint.js';
import { toolInputSchemas, READ_ONLY_TOOL_NAMES, BUILD_TOOL_NAMES, isReadOnly } from './schemas.js';
import { getWorkdir } from './workdir.js';
import { withFileMutationQueues } from './mutation-queue.js';
import { normalizeSkillNames } from '../../agent/skill-delegation.js';
import { tailWithNotice } from './truncate.js';

// Re-export so callers can import Mode and toolInputSchemas from this module directly.
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
  const cwd = getWorkdir();
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
  } catch {
    // ignore
  }

  const rel = path.relative(resolvedCwd, resolvedTarget);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path is outside the project directory');
  }
  return { cwd: resolvedCwd, resolved: resolvedTarget, relative: rel || '.' };
}

/**
 * Models routinely send `timeout: 60` meaning seconds. Found in a live run:
 * 60 was read as ms and killed `node test.js` instantly (exit 124), twice.
 * Values below 1000 are therefore seconds; anything else is ms. Clamped
 * to [1s, 30min].
 */
export function normalizeTimeoutMs(value, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback;
  const ms = value < 1000 ? value * 1000 : value;
  return Math.min(30 * 60_000, Math.max(1000, Math.round(ms)));
}

export function truncate(value, limit) {
  if (typeof value !== 'string') return value;
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n... (truncated, ${value.length} total chars)`;
}

/**
 * Read a file, optionally a window of it.
 *
 * ## Why offset/limit exist
 *
 * The context compactor (`src/agent/context-budget.js`) shrinks an oversized
 * read to a head window plus a notice naming the call that fetches the rest.
 * That only works if the notice points at a real call — a truncation the model
 * cannot act on is data loss with extra steps. So the recovery path has to
 * exist at the tool layer, not just in the prompt.
 *
 * They also serve the ordinary case: an agent that needs to check three
 * definitions in a 4000-line file does not need the file.
 *
 * The window is line-based because the compactor's hints are line offsets. A
 * character offset would be cheaper to compute but would slice mid-token and
 * mid-identifier, and a re-read that starts inside a string literal produces
 * output that looks plausible and is wrong.
 */
async function readFileImpl(input) {
  const p = input?.path;
  if (typeof p !== 'string') throw new Error('path is required');
  const { resolved, relative } = resolveInsideCwd(p);
  const content = await fs.readFile(resolved, 'utf-8');

  const offset = typeof input?.offset === 'number' && input.offset >= 0 ? Math.floor(input.offset) : null;
  const limit = typeof input?.limit === 'number' && input.limit > 0 ? Math.floor(input.limit) : null;

  if (offset !== null || limit !== null) {
    // split('\n') is correct here even though it leaves a trailing '' on a
    // newline-terminated file: line N is at index N, and the offset a caller
    // echoes back is a line index, not a byte position.
    const lines = content.split('\n');
    const start = offset ?? 0;
    const end = limit === null ? lines.length : Math.min(lines.length, start + limit);
    const slice = lines.slice(start, end);
    const out = {
      content: slice.join('\n'),
      path: relative,
      offset: start,
      lineCount: slice.length,
      totalLines: lines.length,
    };
    if (start > 0) out.startedAtLine = start + 1;
    if (end < lines.length) {
      out.partial = true;
      // The continuation call, so the model does not have to reconstruct the
      // arithmetic. This is the field the compactor's notice mirrors.
      out.nextOffset = end;
    }
    return out;
  }

  if (content.length > MAX_FILE_SIZE) {
    return {
      content: content.slice(0, MAX_FILE_SIZE),
      truncated: true,
      totalLength: content.length,
      totalLines: content.split('\n').length,
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

const CODEMAP_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py']);
const CODEMAP_MAX_FILES = 100;
const CODEMAP_MAX_SYMBOLS_PER_FILE = 100;
const CODEMAP_MAX_FILE_BYTES = 100_000;

/**
 * codeMap — repo symbol map (Aider repo-map / Cursor indexing, minimal form).
 * Returns top-level functions/classes/exports per code file so the agent can
 * LOCALIZE without reading every file. Regex-based: fast, dependency-free,
 * honest about not being a language server.
 */
async function codeMapImpl(input) {
  const cwdDir = input?.path ?? '.';
  const { resolved } = resolveInsideCwd(cwdDir);
  const files = [];
  await walkDirCodeMap(resolved, '', files, CODEMAP_MAX_FILES + 1);
  const out = [];
  for (const rel of files.slice(0, CODEMAP_MAX_FILES)) {
    const full = path.join(resolved, rel);
    let stat;
    try {
      stat = await fs.stat(full);
    } catch {
      continue;
    }
    if (stat.size > CODEMAP_MAX_FILE_BYTES) {
      out.push({ file: rel, symbols: [], skipped: 'file too large' });
      continue;
    }
    let content;
    try {
      content = await fs.readFile(full, 'utf-8');
    } catch {
      continue;
    }
    out.push({ file: rel, symbols: extractSymbols(rel, content).slice(0, CODEMAP_MAX_SYMBOLS_PER_FILE) });
  }
  const result = { files: out };
  if (files.length > CODEMAP_MAX_FILES) result.truncated = true;
  return result;
}

async function walkDirCodeMap(base, rel, out, cap) {
  if (out.length >= cap) return;
  let entries;
  try {
    entries = await fs.readdir(path.join(base, rel), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= cap) return;
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
    const childRel = rel ? path.posix.join(rel, entry.name) : entry.name;
    if (entry.isDirectory()) {
      await walkDirCodeMap(base, childRel, out, cap);
    } else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf('.');
      const ext = dot >= 0 ? entry.name.slice(dot) : '';
      if (CODEMAP_EXTS.has(ext)) out.push(childRel);
    }
  }
}

export function extractSymbols(file, content) {
  const symbols = [];
  const lines = content.split(/\r?\n/);
  const isPy = file.endsWith('.py');
  const jsPatterns = [
    { re: /^\s*export\s+default\s+(?:async\s+)?function\s+(\w+)/, kind: 'function' },
    { re: /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/, kind: 'function' },
    { re: /^\s*export\s+default\s+class\s+(\w+)/, kind: 'class' },
    { re: /^\s*(?:export\s+)?class\s+(\w+)/, kind: 'class' },
    { re: /^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/, kind: 'function' },
    { re: /^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?[\w$]+\s*=>/, kind: 'function' },
    { re: /^\s*export\s*\{([^}]+)\}/, kind: 'exports' },
  ];
  lines.forEach((line, i) => {
    if (isPy) {
      const m = /^\s*(def|class)\s+(\w+)/.exec(line);
      if (m) symbols.push({ name: m[2], kind: m[1] === 'class' ? 'class' : 'function', line: i + 1 });
      return;
    }
    for (const { re, kind } of jsPatterns) {
      const m = re.exec(line);
      if (m) {
        if (kind === 'exports') {
          for (const name of m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean)) {
            symbols.push({ name, kind, line: i + 1 });
          }
        } else {
          symbols.push({ name: m[1], kind, line: i + 1 });
        }
        break;
      }
    }
  });
  return symbols;
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
  } catch {
    // ignore
  }
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
  } catch {
    // ignore
  }
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
        await fs.writeFile(op.resolved, op.content.replace(op.oldString, op.newString), 'utf-8');
        succeeded.push(op.relative);
      } catch (err) {
        if (!fallback) {
          for (let j = 0; j < backups.length; j++) {
            try {
              await fs.copyFile(backups[j], resolved[j].resolved);
            } catch {
              // ignore
            }
          }
          for (const b of backups) {
            try {
              await fs.rm(b);
            } catch {
              // ignore
            }
          }
          return { success: false, error: 'Batch edit failed, all changes reverted' };
        }
        errors.push({ file: op.relative, error: err.message });
      }
    }

    for (const b of backups) {
      try {
        await fs.rm(b);
      } catch {
        // ignore
      }
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

async function runBashImpl(input) {
  const command = input?.command;
  const timeout = normalizeTimeoutMs(input?.timeout, DEFAULT_TIMEOUT);
  if (typeof command !== 'string' || command.length === 0) {
    throw new Error('command is required');
  }
  const r = await runSandboxedAsync(command, {
    cwd: getWorkdir(),
    timeout,
    env: { ...process.env, TERM: 'dumb' },
  });
  return {
    stdout: tailWithNotice(r.stdout, MAX_OUTPUT),
    stderr: tailWithNotice(r.stderr, MAX_OUTPUT),
    exitCode: r.exitCode,
    timedOut: r.timedOut,
  };
}

async function searchWebImpl(input) {
  // Multi-provider chain (Exa → Tavily → Brave → DuckDuckGo) lives in
  // web-search.js. This remains the tool entry point so the tool contract,
  // permissions, and modes are unchanged.
  const { search, formatSearchResults } = await import('../web-search.js');
  const outcome = await search({ query: input?.query, count: input?.count });
  if (!outcome.results.length && outcome.errors.length) {
    return { error: formatSearchResults(outcome) };
  }
  return { provider: outcome.provider, results: outcome.results };
}

async function fetchUrlImpl(input) {
  const { fetchUrl } = await import('../fetch-url.js');
  return fetchUrl({ url: input?.url, maxChars: input?.maxChars });
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

async function todoWriteImpl(input) {
  const { writeTodos, formatTodoList } = await import('../../agent/tasks.js');
  const todos = writeTodos(input.todos);
  return { success: true, todos, rendered: formatTodoList(todos) };
}

async function todoReadImpl(_input) {
  const { readTodos, formatTodoList } = await import('../../agent/tasks.js');
  const todos = readTodos();
  return { todos, rendered: todos.length ? formatTodoList(todos) : '(no todos yet)' };
}

async function memoryWriteImpl(input) {
  const { writeMemory } = await import('../../agent/memory.js');
  return { success: true, ...writeMemory(input) };
}

async function memoryDeleteImpl(input) {
  const { deleteMemory } = await import('../../agent/memory.js');
  return deleteMemory(input.name);
}

/**
 * memoryRecall — read the cross-agent store (agentmemory), which holds
 * observations from every assistant on this machine, not just Sentinel.
 * Degrades to an empty result when the server is down rather than erroring, so
 * the model can call it freely.
 */
async function memoryRecallImpl(input) {
  const { recall } = await import('../../agent/memory-bridge.js');
  const result = await recall({
    query: input?.query,
    limit: input?.limit,
    project: input?.project,
  });
  if (!result.ok) {
    return { ok: false, results: [], note: `agentmemory unavailable (${result.skipped})` };
  }
  return {
    ok: true,
    count: result.count,
    results: result.results.map((r) => ({
      content: String(r.content || r.text || r.summary || '').slice(0, 500),
      concepts: r.concepts || undefined,
      files: r.files || undefined,
    })),
  };
}

/** memoryRemember — write to the cross-agent store so other assistants see it. */
async function memoryRememberImpl(input) {
  const { remember } = await import('../../agent/memory-bridge.js');
  const out = await remember({
    content: input?.content,
    concepts: Array.isArray(input?.concepts) ? input.concepts : undefined,
    files: Array.isArray(input?.files) ? input.files : undefined,
    project: input?.project,
    agentId: input?.agentId || 'sentinel',
  });
  if (!out.stored) {
    return { stored: false, note: `agentmemory unavailable (${out.skipped}) — use memoryWrite for the local store` };
  }
  // A near-duplicate is a success: the server kept one copy and told us about
  // the existing one rather than storing a second.
  return { stored: true, similarTo: out.similarTo || null };
}

/**
 * `skill` — expand a SKILL.md body into context. Runs nothing.
 *
 * The frontmatter is echoed back with the body. It used to be dropped, which
 * meant that once the body was expanded the model could no longer see the
 * skill's own name and description — the two facts it needs in order to decide
 * whether to stack a second skill on top of the one it just loaded.
 *
 * Bundled scripts are listed too. A skill that ships `scripts/verify.sh` is
 * asking to be run, and if the model cannot see that from here it will
 * improvise a shell command to reach the same file.
 */
async function skillImpl(input) {
  const { resolveSkill, applySkillArgs, listSkillScripts } = await import('../../agent/skills.js');

  const expandOne = (name, args) => {
    const skill = resolveSkill(name);
    if (!skill) {
      throw new Error(
        `Unknown skill: ${name}. Use listDirectory on .sentinel/skills to discover skills, ` +
        'or omit `names` to load one skill at a time.',
      );
    }
    const scripts = listSkillScripts(skill);
    const out = {
      name: skill.name,
      description: skill.description,
      prompt: applySkillArgs(skill.body, args),
    };
    if (args !== undefined) out.args = args;
    if (scripts.length) {
      out.scripts = scripts;
      out.scriptHint =
        `This skill ships ${scripts.length} script(s). Run one with the runSkillScript tool: ` +
        `{ name: "${skill.name}", script: "<path from scripts>", args: [...] }.`;
    }
    return out;
  };

  // `names` is the stacked form. A model that wants two workflows used to have
  // to emit two tool calls in one message, and the answers came back as two
  // unordered parallel results — the loop batches read-only calls with no
  // ordering guarantee, so which body appeared first was a race. Asking for both
  // in one call makes the order the caller's.
  //
  // `viaNames` matters and is easy to get wrong: a bare `name` carries its args
  // at the top level, so normalizing it produces an entry with none of its own.
  // Taking that entry's empty `args` expands the body with every placeholder
  // left in place, which looks like a broken skill rather than a lost argument.
  const viaNames = Array.isArray(input.names) && input.names.length > 0;
  const names = normalizeSkillNames(viaNames ? input.names : input.name);
  if (names.length > 1) {
    // Dedupe by name, first occurrence wins — see normalizeSkillNames. Two
    // entries for one skill would inject its body twice, and the model reads a
    // duplicated workflow as two separate instructions.
    const loaded = names.map(({ name, args }) => expandOne(name, args));
    return {
      count: loaded.length,
      skills: loaded,
      names: loaded.map((s) => s.name),
      prompt: loaded.map((s) => `<skill name="${s.name}">\n${s.prompt}\n</skill>`).join('\n\n'),
    };
  }
  if (names.length === 1) return expandOne(names[0].name, viaNames ? names[0].args : input.args);
  throw new Error('skill requires `name` or `names`.');
}

/**
 * `runSkillScript` — execute a script bundled inside a skill.
 *
 * ## Why this is not a field on the `skill` tool
 *
 * Because `skill` is read-only, and in a read-only tool's contract "run the
 * file next to the skill" is not a detail. Skills install from a registry
 * (`.claude/skills`, `.codex/skills`, `~/.opencode/skills` are all read by
 * `skillDirs`), so a skill directory is code from somewhere else that a user
 * did not write and has not read. A PLAN-mode turn — which is refused
 * `bash`, refused `runTests`, and refused every write — would acquire the
 * ability to execute that code if execution hung off the `skill` tool.
 *
 * So execution is its own tool, classified as shell, gated by the same mode
 * check, permission policy, blast-radius gate, and risk ledger as `bash`.
 * The cost is one more name for the model to learn; the alternative is a
 * read-only tool that runs code.
 *
 * ## Why the command is built once
 *
 * ## Why the command is built once
 *
 * The command string is constructed by `skillScriptCommand` and used for
 * execution, the permission prompt, the risk grade, and bash validation. Four
 * layers grading four independently-assembled strings would mean the gate
 * approves one command while a different one runs.
 */
async function runSkillScriptImpl(input) {
  const { resolveSkill, resolveSkillScript, listSkillScripts, skillScriptCommand } =
    await import('../../agent/skills.js');
  const skill = resolveSkill(input.name);
  if (!skill) throw new Error(`Unknown skill: ${input.name}`);
  const resolved = resolveSkillScript(skill, input.script);
  if (resolved.error) {
    // The suffix depends on what we actually know. For a refusal (traversal,
    // absolute path) `available` is absent — the scripts list would be
    // irrelevant noise next to "you asked for something outside this skill",
    // and claiming "this skill ships no scripts" when it ships three is worse
    // than saying nothing.
    const suffix = resolved.available
      ? resolved.available.length
        ? ` Available scripts: ${resolved.available.join(', ')}.`
        : ' This skill ships no scripts.'
      : '';
    throw new Error(suffix ? `${resolved.error}. ${suffix.trim()}` : resolved.error);
  }
  // The absolute path, not `resolved.relative`: the relative form is only
  // meaningful from the skill directory, and the command runs with the project
  // as cwd. The sandbox binds `/` read-only and the cwd writable, so an
  // absolute path into a home-directory skill resolves without needing the
  // skill directory to be inside the project.
  const workdir = getWorkdir();
  const command = skillScriptCommand({
    scriptPath: resolved.path,
    runner: resolved.runner,
    args: input.args,
  });
  const timeout = normalizeTimeoutMs(input.timeout, DEFAULT_TIMEOUT);
  const r = await runSandboxedAsync(command, {
    cwd: workdir,
    timeout,
    env: { ...process.env, TERM: 'dumb' },
  });
  return {
    skill: skill.name,
    script: resolved.relative,
    command,
    stdout: tailWithNotice(r.stdout, MAX_OUTPUT),
    stderr: tailWithNotice(r.stderr, MAX_OUTPUT),
    exitCode: r.exitCode,
    timedOut: r.timedOut,
    availableScripts: listSkillScripts(skill),
  };
}

/**
 * runTests — bash twin that returns STRUCTURED results.
 * SWE-bench harnesses distinguish FAIL_TO_PASS vs PASS_TO_PASS; raw stdout
 * forces the model to guess. This parses jest/pytest/mocha/tap output so
 * the agent can decide accepted vs regressed without re-reading logs.
 */
async function runTestsImpl(input) {
  const command = input?.command;
  const timeout = normalizeTimeoutMs(input?.timeout, 120000);
  if (typeof command !== 'string' || command.length === 0) {
    throw new Error('command is required');
  }
  const r = await runSandboxedAsync(command, {
    cwd: getWorkdir(),
    timeout,
    env: { ...process.env, TERM: 'dumb', CI: '1' },
  });
  const stdout = tailWithNotice(r.stdout, MAX_OUTPUT);
  const stderr = tailWithNotice(r.stderr, MAX_OUTPUT);
  const { exitCode, timedOut } = r;
  const combined = `${stdout}\n${stderr}`;
  const parsed = parseTestOutputLocal(combined);
  return {
    command,
    exitCode,
    timedOut,
    passed: parsed.passed.slice(0, 100),
    failed: parsed.failed.slice(0, 100),
    summary: parsed.summary,
    framework: parsed.framework,
    output: truncate(combined, MAX_OUTPUT),
  };
}

function parseTestOutputLocal(text) {
  const passed = [];
  const failed = [];
  let framework = 'unknown';
  const jestRe = /^(PASS|FAIL)\s+(.+)$/gm;
  let m;
  while ((m = jestRe.exec(text)) !== null) {
    if (framework === 'unknown') framework = 'jest';
    if (m[1] === 'PASS') passed.push(m[2].trim());
    else failed.push(m[2].trim());
  }
  const pyRe = /^(PASSED|FAILED|ERROR)\s+(.+)$/gm;
  while ((m = pyRe.exec(text)) !== null) {
    if (framework === 'unknown') framework = 'pytest';
    if (m[1] === 'PASSED') passed.push(m[2].trim());
    else failed.push(m[2].trim());
  }
  const tapOk = text.match(/^ok\s+\d+\s*-?\s*(.*)$/gm) || [];
  const tapNotOk = text.match(/^not ok\s+\d+\s*-?\s*(.*)$/gm) || [];
  if ((tapOk.length || tapNotOk.length) && passed.length === 0 && failed.length === 0) {
    framework = 'tap';
    for (const l of tapOk) passed.push(String(l).replace(/^ok\s+\d+\s*-?\s*/, '').trim() || 'test');
    for (const l of tapNotOk) failed.push(String(l).replace(/^not ok\s+\d+\s*-?\s*/, '').trim() || 'test');
  }
  if (passed.length === 0 && failed.length === 0) {
    const nPass = Number(text.match(/(\d+)\s+passing/i)?.[1] ?? text.match(/(\d+)\s+passed/i)?.[1] ?? 0);
    const nFail = Number(text.match(/(\d+)\s+failing/i)?.[1] ?? text.match(/(\d+)\s+failed/i)?.[1] ?? 0);
    for (let i = 0; i < nPass; i++) passed.push(`passing-test-${i + 1}`);
    for (let i = 0; i < nFail; i++) failed.push(`failing-test-${i + 1}`);
    if ((nPass || nFail) && framework === 'unknown') framework = 'generic';
  }
  return { passed, failed, summary: { passed: passed.length, failed: failed.length }, framework };
}

/**
 * applyPatch — apply a unified diff safely (git-apply compatible subset).
 * SWE-bench evaluates `git diff`; agents that can only editFile struggle
 * with multi-hunk patches. Supports `--- a/file` / `+++ b/file` headers
 * with `@@` hunks; checkpoints every touched file first.
 */
async function applyPatchImpl(input) {
  const patchText = input?.patch;
  if (typeof patchText !== 'string' || patchText.length === 0) {
    throw new Error('patch is required');
  }
  const files = splitPatchByFile(patchText);
  if (files.length === 0) throw new Error('No file patches found (expected "--- " / "+++ " headers)');
  const touched = [];
  for (const { file, hunks } of files) {
    const { resolved, relative } = resolveInsideCwd(file);
    let current = '';
    try {
      current = await fs.readFile(resolved, 'utf-8');
    } catch {
      current = '';
    }
    try {
      await createCheckpoint([resolved]);
    } catch { /* ignore */ }
    const updated = applyHunks(current, hunks, relative);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, updated, 'utf-8');
    touched.push(relative);
  }
  return { success: true, files: touched };
}

function splitPatchByFile(patchText) {
  const lines = patchText.split(/\r?\n/);
  const files = [];
  let cur = null;
  for (const line of lines) {
    if (line.startsWith('--- ')) {
      const name = line.slice(4).trim().replace(/^a\//, '');
      cur = { old: name, hunks: [], new: null, file: null };
    } else if (line.startsWith('+++ ') && cur) {
      cur.new = line.slice(4).trim().replace(/^b\//, '');
      cur.file = cur.new && cur.new !== '/dev/null' ? cur.new : cur.old;
      files.push(cur);
    } else if (cur && (/^@@/.test(line) || /^[ +-\\]/.test(line) || line === '')) {
      cur.hunks.push(line);
    }
  }
  return files.filter((f) => f.file && f.file !== '/dev/null');
}

function parseHunkHeader(line, rel) {
  const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
  if (!m) throw new Error(`Bad hunk header in ${rel}: "${line.slice(0, 80)}"`);
  return { oldStart: Number(m[1]), oldCount: Number(m[2] ?? 1) };
}

function applyHunks(original, hunkLines, rel) {
  const hasTrailingNewline = original.endsWith('\n');
  const origLines = original.split('\n');
  // Drop the artifact empty string from a trailing newline so line numbers
  // match diff semantics (diff counts "a\nb\n" as 2 lines, not 3).
  if (hasTrailingNewline && origLines[origLines.length - 1] === '') origLines.pop();
  const out = [];
  let oi = 0; // 0-based index into origLines of next unconsumed line
  let hi = 0;
  while (hi < hunkLines.length && !hunkLines[hi].startsWith('@@')) hi++;
  if (hi >= hunkLines.length) {
    throw new Error(`Patch for ${rel} has no @@ hunks`);
  }
  while (hi < hunkLines.length) {
    const header = hunkLines[hi];
    if (!header.startsWith('@@')) {
      hi++;
      continue;
    }
    const { oldStart } = parseHunkHeader(header, rel);
    const hunkBase = oldStart - 1; // to 0-based
    if (hunkBase < oi) {
      throw new Error(`Overlapping hunks in ${rel} at "${header.slice(0, 60)}"`);
    }
    // Copy unchanged gap between previous hunk and this one verbatim.
    while (oi < hunkBase) {
      if (oi >= origLines.length) throw new Error(`Hunk starts beyond EOF in ${rel}`);
      out.push(origLines[oi++]);
    }
    hi++;
    // Consume hunk body
    while (hi < hunkLines.length && !hunkLines[hi].startsWith('@@')) {
      const line = hunkLines[hi++];
      if (line.startsWith(' ') || line === '') {
        const expected = line.slice(1);
        if (oi < origLines.length && origLines[oi] === expected) {
          out.push(origLines[oi++]);
        } else if (expected === '' && oi >= origLines.length) {
          // trailing-newline artifact — ignore
        } else {
          throw new Error(`Patch context mismatch in ${rel}: expected "${expected.slice(0, 80)}"`);
        }
      } else if (line.startsWith('-')) {
        const expected = line.slice(1);
        if (oi < origLines.length && origLines[oi] === expected) {
          oi++; // drop
        } else {
          throw new Error(`Patch removal mismatch in ${rel}: expected "${expected.slice(0, 80)}"`);
        }
      } else if (line.startsWith('+')) {
        out.push(line.slice(1));
      } else if (line.startsWith('\\')) {
        // "\ No newline at end of file" — ignore
      }
    }
  }
  while (oi < origLines.length) out.push(origLines[oi++]);
  return out.join('\n') + (hasTrailingNewline ? '\n' : '');
}

/**
 * Serialize mutations per target file (pi-mono file-mutation-queue): with
 * teammates and background subagents, two writers can race on one file.
 * Paths that fail to resolve fall through so the impl reports the error.
 */
function queued(impl, pathsOf) {
  return async (input) => {
    let paths = [];
    try {
      paths = pathsOf(input).map((p) => resolveInsideCwd(p).resolved);
    } catch {
      return impl(input);
    }
    return paths.length ? withFileMutationQueues(paths, () => impl(input)) : impl(input);
  };
}

const TOOL_IMPLS = {
  readFile: readFileImpl,
  listDirectory: listDirectoryImpl,
  glob: globImpl,
  grep: grepImpl,
  codeMap: codeMapImpl,
  searchWeb: searchWebImpl,
  fetchUrl: fetchUrlImpl,
  memoryRecall: memoryRecallImpl,
  memoryRemember: memoryRememberImpl,
  writeFile: queued(writeFileImpl, (i) => [i?.path]),
  editFile: queued(editFileImpl, (i) => [i?.path]),
  batchEdit: queued(batchEditImpl, (i) => (Array.isArray(i?.operations) ? i.operations.map((o) => o?.filePath) : [])),
  bash: runBashImpl,
  runTests: runTestsImpl,
  applyPatch: queued(applyPatchImpl, (i) => (typeof i?.patch === 'string' ? splitPatchByFile(i.patch).map((f) => f.file) : [])),
  diffFile: diffFileImpl,
  undoLastChange: undoLastChangeImpl,
  redoLastUndo: redoLastUndoImpl,
  todoWrite: todoWriteImpl,
  todoRead: todoReadImpl,
  skill: skillImpl,
  runSkillScript: runSkillScriptImpl,
  memoryWrite: memoryWriteImpl,
  memoryDelete: memoryDeleteImpl,
  // Browser tools. Lazily bound rather than imported at module load: `web-tools`
  // reaches for the filesystem state dir on call, and pulling it in eagerly
  // would make every tool registry load touch the disk — including in the TUI,
  // where no browser is ever opened.
  webSession: async (input) => (await import('../../agent/web-tools.js')).webSession(input),
  webRead: async (input) => (await import('../../agent/web-tools.js')).webRead(input),
  webProbe: async (input) => (await import('../../agent/web-tools.js')).webProbe(input),
  webAct: async (input) => (await import('../../agent/web-tools.js')).webAct(input),
};

export const readOnlyToolContracts = Object.freeze({
  readFile: {
    description:
      'Read a file. Pass offset/limit (0-based lines) for a window instead of the whole file — ' +
      'cheaper when you only need part of a large one, and the way to recover a read that was elided.',
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
  codeMap: {
    description:
      'Map repo symbols (functions/classes/exports per file) for bug localization without reading every file.',
    inputSchema: toolInputSchemas.codeMap,
  },
  searchWeb: {
    description:
      'Search the web and return titles, URLs, and short snippets. Use for current facts, library/framework docs, and error-message lookups. Pair with fetchUrl when a snippet is not enough.',
    inputSchema: toolInputSchemas.searchWeb,
  },
  fetchUrl: {
    description:
      'Fetch a web page and return its readable text content (scripts/styles/nav stripped). ' +
      'Use after searchWeb to read the actual page. Avoid when a snippet suffices. ' +
      'If CONTEXT_DEV_API_KEY is configured this renders JavaScript and bypasses bot walls, which is what you want for client-rendered sites; pass prefer="direct" to force the free direct fetch.',
    inputSchema: toolInputSchemas.fetchUrl,
  },
  diffFile: {
    description: 'Preview a unified diff of proposed changes to a file without applying them.',
    inputSchema: toolInputSchemas.diffFile,
  },
  todoRead: {
    description: 'Read the current task list.',
    inputSchema: toolInputSchemas.todoRead,
  },
  skill: {
    description:
      'Load a skill workflow by name. Invoke BEFORE handling a matching request yourself. ' +
      'Pass `args` to fill $1 / $ARGUMENTS placeholders in the skill body. ' +
      'Pass `names: [...]` instead of `name` to stack several in one call — they load in the order given, which two separate calls do not guarantee. ' +
      'Returns any bundled scripts.',
    inputSchema: toolInputSchemas.skill,
  },
  bgCheck: {
    description: 'Show status/output of background commands (one id, or all). Results also arrive automatically as notifications.',
    inputSchema: toolInputSchemas.bgCheck,
  },
  teamStatus: {
    description: 'List teammates (status, worktree, branch) and background commands.',
    inputSchema: toolInputSchemas.teamStatus,
  },

  // ── Browser: observe, then commit ──
  //
  // The descriptions carry the ordering rule, because a model that reaches for
  // `webAct` first will happily click blind. `webProbe` exists to be the thing
  // it reaches for instead, and the description is the only place that says so.
  webSession: {
    description:
      'Open, list, revoke, or close a leased browser session. Opening requires an explicit origins allowlist and creates a dedicated empty profile — your credentials are never imported. Sessions expire; revoke to cut one off mid-task.',
    inputSchema: toolInputSchemas.webSession,
  },
  webRead: {
    description:
      'Open a page in the session browser and read its text. Observation only — changes nothing. Use this before probing an action you intend to take.',
    inputSchema: toolInputSchemas.webRead,
  },
  webProbe: {
    description:
      'Resolve what a click would actually do WITHOUT performing it: the element\'s role and accessible name, whether it submits a form, the endpoint it would hit, and a suggested reversibility class. Always probe before webAct. Nothing is changed by probing.',
    inputSchema: toolInputSchemas.webProbe,
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
  runTests: {
    description: 'Run a test command and return STRUCTURED pass/fail lists (prefer over bash for tests).',
    inputSchema: toolInputSchemas.runTests,
  },
  applyPatch: {
    description: 'Apply a unified diff patch (--- a/file, +++ b/file, @@ hunks) to the project.',
    inputSchema: toolInputSchemas.applyPatch,
  },
  diffFile: {
    description: 'Preview a unified diff of proposed changes to a file without applying them.',
    inputSchema: toolInputSchemas.diffFile,
  },
  undoLastChange: {
    description: 'Undo the last file change by restoring from the most recent checkpoint.',
    inputSchema: toolInputSchemas.undoLastChange,
  },
  todoWrite: {
    description: 'Overwrite the full task list (plan-then-execute: send ALL todos every call).',
    inputSchema: toolInputSchemas.todoWrite,
  },
  todoRead: {
    description: 'Read the current task list.',
    inputSchema: toolInputSchemas.todoRead,
  },
  skill: {
    description:
      'Load a skill workflow by name. Invoke BEFORE handling a matching request yourself. ' +
      'Pass `args` to fill $1 / $ARGUMENTS placeholders in the skill body. ' +
      'Pass `names: [...]` instead of `name` to stack several in one call — they load in the order given, which two separate calls do not guarantee. ' +
      'Returns any bundled scripts.',
    inputSchema: toolInputSchemas.skill,
  },
  runSkillScript: {
    description:
      'Run a script bundled inside a skill (load the skill first to see its scripts). ' +
      '`script` is a path relative to the skill directory, e.g. "scripts/verify.sh". ' +
      'Gated like bash: it executes a file, so it is refused in PLAN/REVIEW/SCAN/FIX modes and may ask for approval.',
    inputSchema: toolInputSchemas.runSkillScript,
  },
  spawnAgent: {
    description:
      'Delegate a bounded subtask to a fresh subagent. Returns its final summary text. ' +
      'Pass `skills` (a name, or [{name, args}]) to load a skill workflow into the subagent — it follows the stated workflow instead of improvising one.',
    inputSchema: toolInputSchemas.spawnAgent,
  },
  memoryWrite: {
    description: 'Save a durable memory record for future sessions (type: user|feedback|project|reference). Only non-obvious facts not derivable from the code.',
    inputSchema: toolInputSchemas.memoryWrite,
  },
  memoryDelete: {
    description: 'Delete a memory record that turned out to be wrong or stale.',
    inputSchema: toolInputSchemas.memoryDelete,
  },
  memoryRecall: {
    description:
      'Search the CROSS-AGENT memory store (agentmemory) for what other assistants on this machine already learned. Returns observations from every agent, not just Sentinel. Use for "have we tried this before" questions. Returns empty when the store is offline.',
    inputSchema: toolInputSchemas.memoryRecall,
  },
  memoryRemember: {
    description:
      'Save a durable insight to the CROSS-AGENT store so Cursor, Claude Code, and others can recall it too. Use memoryWrite for Sentinel-local records; use this when the fact should reach other assistants.',
    inputSchema: toolInputSchemas.memoryRemember,
  },

  // The one tool in this file that commits an effect a human cannot undo from
  // a checkpoint. The description states the cost in the first sentence because
  // a model that treats this like `editFile` will get it wrong, and the refusals
  // downstream assume it was told.
  webAct: {
    description:
      'PERFORM a probed browser action. Requires an `effect` descriptor naming the action, origin, resource, and reversibility class (reversible | compensable | absorbing | external), plus a sessionId. Re-probes first and refuses if the page drifted from what you declared — including acting under a different account. Prefer webRead and webProbe; prefer a human for anything absorbing or external.',
    inputSchema: toolInputSchemas.webAct,
  },
  bgRun: {
    description: 'Start a long shell command (build, test suite, server) in the background; returns an id immediately. Its result is delivered as a notification.',
    inputSchema: toolInputSchemas.bgRun,
  },
  spawnTeammate: {
    description: 'Start a named teammate agent that works in parallel (optionally isolation="worktree" for its own git worktree/branch). Its summary arrives as a notification. Propose the team to the user first. Pass `skills` to hand the teammate a workflow to follow.',
    inputSchema: toolInputSchemas.spawnTeammate,
  },
  sendMessage: {
    description: 'Send a message to a teammate by name (or to "lead"). Delivered before its next model call.',
    inputSchema: toolInputSchemas.sendMessage,
  },
  teamMerge: {
    description: 'Bring a finished worktree teammate\'s work home: action "diff" to review its patch, "apply" to apply it to the main tree (undoable) and remove the worktree, "discard" to throw it away.',
    inputSchema: toolInputSchemas.teamMerge,
  },

  /**
   * The one tool for concurrent work.
   *
   * Six names used to do this — spawnAgent, spawnTeammate, bgRun, bgCheck,
   * teamStatus, teamMerge, plus sendMessage — and the model had to learn which of
   * them to reach for. They were all the same primitive with different
   * arguments, so they are now one tool with an `action`.
   *
   * The six legacy names are still accepted, unchanged and undeprecated in
   * behaviour, because a transcript recorded with them must still replay. What
   * changed is what the model is *shown*: one tool and one description. That is
   * the part that changes model behaviour, and it is why this is a prompt change
   * rather than a refactor.
   */
  task: {
    description:
      'Start and manage concurrent work. Actions: ' +
      '"spawn" starts a subagent (prompt, mode, skills) and WAITS for its summary; ' +
      '"spawn-async" starts one that reports back later (name, prompt, mode, isolation, skills); ' +
      '"run" starts a shell command in the background (command, timeout); ' +
      '"status" lists running and finished work; ' +
      '"check" reads one background command\'s output (id); ' +
      '"merge" brings a finished worktree teammate home (name, action: diff|apply|discard); ' +
      '"cancel" stops one (id); ' +
      '"message" sends a note to a teammate (to, text).',
    inputSchema: toolInputSchemas.task,
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
 * Validate a tool call's input against its hand-rolled schema.
 *
 * Returns an error string, or null when the input is acceptable. This is the
 * step `executeLocalTool` did not have: `toolInputSchemas` was written, exported,
 * referenced from every contract, and never called, so ~200 lines of validators
 * guarded nothing. Every implementation validates its own fields, but only the
 * fields that implementation happens to care about — `editFileImpl` checks
 * `oldString` is a string, while `batchEditImpl` re-checks its whole operation
 * list, and neither knows what the schema says about the tool.
 *
 * Two deliberate properties:
 *
 *   - **Unknown tools pass.** A validator that threw for an unrecognised name
 *     would refuse every MCP tool, which has its own schema and its own trust
 *     story.
 *   - **Unknown fields are dropped, not rejected.** The validators project a
 *     value rather than checking a shape, so an extra key the model invented
 *     disappears instead of erroring. Rejecting would turn a hallucinated
 *     optional parameter into a failed turn; the model reads the result and
 *     carries on without the field it asked for.
 *
 * The error text is deliberately the schema's own, because it is already written
 * for the model ("path is required", not "E_VALIDATION"). The loop turns it into
 * a tool result, so the model gets to correct itself.
 */
export function validateToolInput(toolName, input) {
  const schema = toolInputSchemas[toolName];
  if (!schema || typeof schema !== 'function') return null;
  try {
    schema(input);
    return null;
  } catch (e) {
    return `${toolName}: ${e.message}`;
  }
}

/**
 * Validate and return the normalized input, or the original if validation fails.
 *
 * The defaults inside the validators (`searchWeb.count`, `runTests.timeout`,
 * `todoRead`) only exist in that projected value, so callers that want the
 * defaults must use this rather than `validateToolInput`. Returns the input
 * unchanged when there is no schema, or when the input is invalid — the caller
 * has already turned that case into an error by then.
 */
export function coerceToolInput(toolName, input) {
  const schema = toolInputSchemas[toolName];
  if (!schema || typeof schema !== 'function') return input;
  try {
    return schema(input);
  } catch {
    return input;
  }
}

/**
 * Execute a local tool call.
 * 1. Mode check (PLAN/REVIEW/SCAN block writes; FIX blocks shell) — a mode
 *    boundary is a hard capability gate, so it wins over any permission ask
 * 2. Permission check (allow/deny/ask)
 * 3. Execute the tool implementation
 *
 * Validation lives in `validateToolInput` above rather than in this function,
 * because the loop calls it before the permission prompt while `executeLocalTool`
 * is reached only after. The two are not redundant: this one is the boundary for
 * anything else that calls a tool directly (the MCP bridge, tests, the review
 * path), and it is the last chance to catch a malformed call before an
 * implementation touches the filesystem.
 *
 * @param {string} toolName
 * @param {object} input
 * @param {string} mode
 * @param {object} [options]
 * @param {function} [options.onPermissionAsk] — callback for 'ask' policy
 */
export async function executeLocalTool(toolName, input, mode = Mode.BUILD, _options = {}) {
  // ── Mode check ─────────────────────────────────────────────────────
  const { isToolAllowedInMode } = await import('../schemas/mode.js');
  if (!isToolAllowedInMode(toolName, mode)) {
    throw new Error(`Tool ${toolName} is not available in ${mode} mode`);
  }

  // ── Permission check ───────────────────────────────────────────────
  // Skip when the caller (loop.js executeOneTool) already obtained user approval.
  if (!_options.preAuthorized) {
    try {
      const { checkPermission } = await import('./permissions.js');
      const permCheck = checkPermission(toolName);
      if (!permCheck.allowed) {
        throw new Error(permCheck.message || `Tool ${toolName} is denied by permission policy`);
      }
    } catch (permErr) {
      if (permErr.message?.includes('permission policy') || permErr.message?.includes('denied') || permErr.message?.includes('confirmation')) {
        throw permErr;
      }
      // If permissions module isn't available, fall through
    }
  }

  const impl = TOOL_IMPLS[toolName];
  if (!impl) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  // Validation last, before dispatch. The loop already ran it, but this
  // function is also the direct entry point for anything that bypasses the
  // loop, and a schema that only the happy path checks is not a check.
  const invalid = validateToolInput(toolName, input);
  if (invalid) throw new Error(invalid);

  return await impl(input);
}

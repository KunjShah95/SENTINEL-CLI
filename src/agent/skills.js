/**
 * Skills — reusable workflow prompts loaded on demand, not upfront.
 *
 * Claude Code lesson: list skill names + descriptions in context (cheap),
 * expand the full SKILL.md only when the model invokes the Skill tool.
 * Skills live in `skills/<name>/SKILL.md` (shipped with this repo) or in one of
 * the conventional project/global directories — `.sentinel`, `.claude`,
 * `.codex`, `.agents`, `.opencode`. Each file starts with `name:` /
 * `description:` frontmatter lines, then the workflow body.
 *
 * Two capabilities beyond "expand the body", both because a body alone is not
 * always enough to run a workflow:
 *
 *   - **Arguments.** A skill body may contain `$1`, `$ARGUMENTS`, `${1:-def}`.
 *     The substitution engine is `substituteArgs` from `prompt-templates.js`,
 *     owned there and reused here rather than forked, because two
 *     implementations of bash-style placeholders is how `/name` and the skill
 *     tool end up disagreeing about what `$1` means.
 *
 *   - **Bundled scripts.** A skill may ship executable files alongside
 *     SKILL.md. Running one is shell execution, so it is a *separate tool*
 *     (`runSkillScript`) classified as shell, never a field on the read-only
 *     `skill` tool. See the note on `runSkillScript` in `tools/index.js`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, basename, relative, isAbsolute, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { substituteArgs } from './prompt-templates.js';

export function skillDirs(cwd = process.cwd(), { includeGlobal = true, includeBuiltin = true } = {}) {
  const dir = resolve(cwd);
  const home = homedir();
  // `skills/` at the repo root is the *shipped* location — the one a clone gets,
  // and the only one inside this repository that git tracks.
  //
  // It is FIRST among the project dirs, not last. A shipped default is a
  // baseline, and a baseline that sits at the bottom of the precedence list can
  // never be reached once any other registry defines the same name — which is
  // exactly what happened here: an untracked `.sentinel/skills/` copy shadowed
  // it, so the skill that ships is the one that never ran. Project-local skill
  // directories are still shadowed in the usual way (`.claude` and friends come
  // after, and `.sentinel` after those), but a shipped skill is not something
  // the user's own state directory should be able to silently replace.
  //
  // It exists because `.sentinel/` is gitignored. A skill placed there is
  // untracked by definition, which is how this repository came to describe a
  // skill that no clone had.
  //
  // `includeBuiltin: false` (below) excludes the package's own shipped skills.
  // That answers a real and different question — "what has this *project*
  // installed?" — and is what a test isolating one directory wants.
  const projectDirs = [
    join(dir, 'skills'),
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
  // The package's OWN `skills/` — the ones that ship with Sentinel.
  //
  // A separate category, last, and NOT gated by `includeGlobal`. Two reasons,
  // and the second is the one that bit:
  //
  //   1. Last, so a user's own skill of the same name wins over the shipped
  //      default. An override is a deliberate choice and must beat a baseline.
  //   2. Not gated. `includeGlobal: false` exists so a test does not read the
  //      developer's real `~/.claude/skills`. Silently dropping Sentinel's own
  //      bundled workflow along with it means a shipped skill is reachable only
  //      when the caller happens to leave the flag off — which is exactly what
  //      happened the first time this was wired up.
  //
  // In development this is the same directory as `<cwd>/skills` and deduplicates
  // away. For an installed package it is the only route to a shipped skill at
  // all: the user's cwd is their project, not `node_modules/sentinel-cli`. Found
  // by simulating an install — the tarball carried the SKILL.md and the skill
  // still would not resolve.
  const builtinDirs = [join(packageRoot(), 'skills')];
  return [...new Set([
    ...projectDirs,
    ...(includeGlobal ? globalDirs : []),
    ...(includeBuiltin ? builtinDirs : []),
  ])];
}

/**
 * The installed package's root — the directory holding this package's
 * `package.json`.
 *
 * The same walk `src/version.js` performs, and deliberately so: that module
 * already answers "where is the package I am part of", and a second walk here
 * would be two answers to one question, free to disagree after a repackage.
 */
function packageRoot() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
      if (pkg?.name === 'sentinel-cli') return dir;
    } catch {
      // keep walking
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Unreachable in a working install; falls back to cwd rather than throwing, so
  // a packaging problem cannot take down skill discovery.
  return resolve('.');
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
  // `allowed-tools` and friends. The key pattern admits hyphens, which the
  // previous `/^([A-Za-z]+):/` did not — so every hyphenated Claude Code key
  // (`disable-model-invocation`, `allowed-tools`, `argument-hint`) was silently
  // dropped rather than read and ignored. The difference matters: a skill
  // author writing `disable-model-invocation: true` was asking for something
  // specific and got a skill that ignores them.
  const meta = {};
  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        bodyStart = i + 1;
        break;
      }
      const m = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(lines[i]);
      if (m) meta[m[1].toLowerCase()] = m[2].trim();
    }
  }
  name = meta.name || null;
  description = meta.description || null;
  if (!name) name = basename(join(file, '..'));
  if (!description) description = (lines[bodyStart] || '').trim().slice(0, 120);
  const body = lines.slice(bodyStart).join('\n').trim();
  // `dir` is carried on every parsed skill so a script can be resolved relative
  // to the skill without a second directory scan. Previously the only place a
  // skill path was built was `join(dir, name, 'SKILL.md')`, which is why nothing
  // could find anything else inside a skill directory.
  return {
    name,
    description,
    body,
    file,
    dir: join(file, '..'),
    // A truthy value only. `false`, `no`, `off`, `0` and an empty value all mean
    // "still invoke me" — a skill author who writes `disable-model-invocation:
    // false` should not get a skill that never loads, and treating any
    // non-empty string as true would do exactly that.
    disableModelInvocation: isTruthy(meta['disable-model-invocation']),
    argumentHint: meta['argument-hint'] || '',
    allowedTools: meta['allowed-tools'] || '',
  };
}

/**
 * The tools a skill declares, as a set, or null when it declares none.
 *
 * `allowed-tools` is a Claude Code key. It was parsed here and ignored for a
 * while, which is the worst of both answers: the key looked load-bearing and was
 * not. It is now enforced by `skill-scope.js`, which **refuses** a call the
 * declaration excludes rather than narrowing the advertised toolset.
 *
 * That distinction is the whole design. A skill loads *mid-turn*, so removing
 * tools the model was already shown makes its next call fail against a list it
 * has never seen — an agent that looks like it has forgotten how to read files.
 * A refusal names the binding skill and says what is permitted, so the failure
 * is legible and the model can proceed with the tools it does have.
 *
 * This function only *parses*. Policy — intersection across loaded skills,
 * per-turn lifetime, the `skill` tool's exemption — belongs to the scope module.
 */
export function skillAllowedTools(skill) {
  return parseAllowedTools(skill?.allowedTools);
}

function parseAllowedTools(value) {
  if (!value) return null;
  const list = String(value)
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  return list.length ? new Set(list) : null;
}

/** Frontmatter truthiness. Anything that is not explicitly off is on. */
function isTruthy(value) {
  if (value === undefined || value === null) return false;
  const v = String(value).trim().toLowerCase();
  return v !== '' && v !== 'false' && v !== 'no' && v !== 'off' && v !== '0';
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
        out.push({
          name: skill.name,
          description: skill.description,
          // Carried so callers can filter. A skill marked
          // `disable-model-invocation` is still resolvable by name — it just is
          // not advertised, so the model cannot reach for it on its own.
          disableModelInvocation: skill.disableModelInvocation,
          argumentHint: skill.argumentHint,
        });
      }
    }
  }
  return out;
}

/**
 * Resolve a skill to its parsed record (name, description, body, file, dir).
 *
 * Returns null when there is no such skill. Two resolution paths, in order:
 *
 *   1. Direct hit on `<dir>/<name>/SKILL.md`.
 *   2. A scan of each skills directory, matching the frontmatter `name`.
 *
 * Path 1 exists so a skill can be invoked by name even when the listing in the
 * system prompt was truncated to fit the budget — the model is told it may do
 * this, and it only works because resolution goes to disk. Path 2 exists so a
 * skill whose directory name differs from its `name:` is still reachable.
 */
export function resolveSkill(name, cwd = process.cwd(), options = {}) {
  if (typeof name !== 'string' || name.length === 0) return null;
  for (const dir of skillDirs(cwd, options)) {
    const direct = join(dir, name, 'SKILL.md');
    if (existsSync(direct)) {
      const skill = parseSkillFile(direct);
      if (skill) return skill;
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
      if (skill && skill.name === name) return skill;
    }
  }
  return null;
}

/**
 * A skill body with `args` substituted in.
 *
 * `args` accepts the array a model naturally produces (`["foo", "bar"]`) and a
 * bare string, because a small model asked for arguments will send
 * `{ args: "src/index.js" }` as readily as `{ args: ["src/index.js"] }`, and
 * refusing the string form would fail a correct intent over punctuation.
 */
export function getSkillPrompt(name, cwd = process.cwd(), options = {}) {
  const { args, ...resolveOptions } = options || {};
  const skill = resolveSkill(name, cwd, resolveOptions);
  if (!skill) return null;
  return applySkillArgs(skill.body, args);
}

/**
 * Substitute call arguments into a skill body.
 *
 * Single-pass, inherited from `substituteArgs`: an argument value is never
 * re-scanned for placeholders. A skill invoked as `run $1` with `$1 = "$2"`
 * renders the literal `$2`, it does not expand again.
 */
export function applySkillArgs(body, args) {
  const list = normalizeSkillArgs(args);
  if (list.length === 0) return body;
  return substituteArgs(body, list);
}

export function normalizeSkillArgs(args) {
  if (args === undefined || args === null) return [];
  const list = Array.isArray(args) ? args : [args];
  return list
    .filter((a) => a !== undefined && a !== null)
    .map((a) => (typeof a === 'string' ? a : String(a)))
    .filter((a) => a.length > 0);
}

/**
 * Extensions a bundled script may have, and how each is invoked.
 *
 * The value is a list of candidate interpreters, most-preferred first. A single
 * name per extension does not survive contact with a real machine: on Windows
 * there is no `sh` and no `python3` — a script failing with
 * `'sh' is not recognized as an internal or external command` and exit 1 is a
 * true statement about the wrong thing, and the model reads it as the script
 * being broken rather than the interpreter being absent.
 */
const SCRIPT_RUNNERS = Object.freeze({
  '.sh': ['sh', 'bash'],
  '.bash': ['sh', 'bash'],
  '.js': ['node'],
  '.mjs': ['node'],
  '.cjs': ['node'],
  '.py': ['python3', 'python', 'py'],
  '.ps1': ['powershell', 'pwsh'],
});

/**
 * Windows `System32\bash.exe` is the WSL launcher, not a shell.
 *
 * It resolves on PATH, so a naive probe accepts it, and then it fails with
 * `127: /bin/bash: C:\...: No such file or directory` — because WSL needs a
 * `/mnt/c/...` path and was handed a Windows one. Reporting that to the model
 * as a failed script is worse than reporting that no interpreter is available:
 * the script is fine, and the honest answer names the actual problem.
 */
function isWslLauncher(path) {
  return process.platform === 'win32' && /[\\/]system32[\\/]bash\.exe$/i.test(path);
}

export function isScriptFile(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 && Object.prototype.hasOwnProperty.call(SCRIPT_RUNNERS, name.slice(dot).toLowerCase());
}

function runnersFor(file) {
  const dot = file.lastIndexOf('.');
  return dot > 0 ? SCRIPT_RUNNERS[file.slice(dot).toLowerCase()] : undefined;
}

// Memoized per process. Probing is a PATH scan, and this runs inside a tool
// call that may be batched ten deep.
const _which = new Map();

/**
 * Resolve an interpreter name against PATH, or null.
 *
 * Sync on purpose — this is called from `resolveSkillScript`, which the gates
 * call synchronously. Uses PATHEXT on Windows because `node` lives at
 * `node.exe` and `sh` would not be found without it.
 */
export function whichCommand(name) {
  if (_which.has(name)) return _which.get(name);
  let found = null;
  try {
    const pathEnv = process.env.PATH || '';
    const exts =
      process.platform === 'win32'
        ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
        : [''];
    const dirs = pathEnv.split(process.platform === 'win32' ? ';' : ':').filter(Boolean);
    const candidates = process.platform === 'win32'
      ? exts.map((e) => name.toLowerCase() + e.toLowerCase())
      : [name];
    outer: for (const dir of dirs) {
      for (const cand of candidates) {
        try {
          if (statSync(join(dir, cand)).isFile()) { found = join(dir, cand); break outer; }
        } catch {
          // keep looking
        }
      }
    }
  } catch {
    found = null;
  }
  _which.set(name, found);
  return found;
}

/** Pick the first interpreter for a script that actually exists on this machine. */
export function resolveRunner(file, label) {
  const name = label || file;
  const candidates = runnersFor(file);
  if (!candidates) return { error: `Unsupported script type: ${name}` };
  for (const candidate of candidates) {
    const path = whichCommand(candidate);
    if (path && !isWslLauncher(path)) return { runner: candidate, runnerPath: path };
  }
  return { error: `No interpreter available to run ${name} (looked for: ${candidates.join(', ')})` };
}

/**
 * The scripts a skill ships, as bare relative paths.
 *
 * Scanned one directory deep from the skill root. A skill's `scripts/` folder
 * is the convention; top-level files count too because a one-file skill that
 * puts its helper next to SKILL.md should not need a folder. SKILL.md itself is
 * never a script.
 */
export function listSkillScripts(skill) {
  if (!skill?.dir || !existsSync(skill.dir)) return [];
  try {
    readdirSync(skill.dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  const walk = (dirAbs, prefix) => {
    let found;
    try {
      found = readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of found) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const relPath = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) {
        // One level deep only. A skill that ships a node_modules or a vendored
        // tree should not turn discovery into a full-tree scan of the project.
        if (prefix) continue;
        walk(join(dirAbs, e.name), relPath);
        continue;
      }
      if (!e.isFile()) continue;
      if (prefix === '' && e.name.toLowerCase() === 'skill.md') continue;
      if (isScriptFile(e.name)) out.push(relPath);
    }
  };
  walk(skill.dir, '');
  return out.sort();
}

/**
 * Resolve a script path inside a skill, refusing anything that escapes it.
 *
 * The traversal check is the whole point of this function. A skill directory is
 * trusted less than the project (they install from a registry), so
 * `script: "../../../../usr/local/bin/whatever"` must fail here rather than at
 * the shell. Both checks are needed: `relative()` alone does not stop an
 * absolute path on Windows, and the resolved realpath check catches a symlink
 * that points outside even though the textual path looks contained.
 */
export function resolveSkillScript(skill, script) {
  if (!skill?.dir) return { error: 'Skill has no directory.' };
  if (typeof script !== 'string' || script.trim().length === 0) {
    return { error: 'script is required' };
  }
  if (isAbsolute(script) || /^[a-zA-Z]:[\\/]/.test(script) || script.includes('\0')) {
    return { error: 'script must be a relative path inside the skill directory' };
  }
  const base = resolve(skill.dir);
  const target = resolve(base, script);
  const rel = relative(base, target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || rel.split(sep)[0] === '..') {
    return { error: 'script must stay inside the skill directory' };
  }
  if (!existsSync(target)) {
    return { error: `No such script in skill ${skill.name}: ${script}`, available: listSkillScripts(skill) };
  }
  let st;
  try {
    st = statSync(target);
  } catch {
    return { error: `Cannot stat script: ${script}` };
  }
  if (!st.isFile()) return { error: `Not a file: ${script}` };
  // Labelled with the skill-relative path, not the absolute one: this string is
  // shown to the model, and a `C:\Users\<name>\...` path in a tool result leaks
  // the account name for no benefit.
  const { runner, runnerPath, error } = resolveRunner(target, rel.split(sep).join('/'));
  if (!runner) {
    return { error, available: listSkillScripts(skill) };
  }
  return { path: target, relative: rel.split(sep).join('/'), runner, runnerPath };
}

/**
 * The shell command for a bundled script.
 *
 * This string is what the permission prompt, the risk ledger, and bash
 * validation all see, so it is built once here and reused rather than each
 * layer assembling its own version of it. If they disagreed about what is about
 * to run, the gate would be grading something other than what executes.
 *
 * Quoting is shell-specific, and the difference is not cosmetic:
 *
 *   - POSIX `sh` treats a backslash inside double quotes as an escape. Doubling
 *     every backslash — the obvious thing to write — mangles any argument that
 *     contains one.
 *   - Windows `cmd` does not treat a backslash as an escape at all. Escaping it
 *     produces `C:\\Users\\…`, which happens to resolve because the Win32 path
 *     APIs collapse repeated separators, and fails for anything that is not a
 *     path. That is "works by accident" in the one case most likely to be
 *     tested and silently wrong in the rest.
 *
 * So POSIX uses single quotes (with the one character that needs escaping
 * handled the standard way) and Windows uses double quotes with backslashes
 * left alone.
 */
export function skillScriptCommand({ scriptPath, runner, args = [], workdir = '' }) {
  const win = process.platform === 'win32';
  const q = (s) => {
    const v = String(s);
    if (/^[A-Za-z0-9_./:=@-]+$/.test(v)) return v;
    // POSIX: close the quote, emit an escaped quote, reopen — `'it'\''s'`.
    // The escape sequence is written as a string built from parts because a
    // literal containing a backslash before a quote trips the quote rule, and
    // a `\x27` escape would be less readable than the thing it produces.
    const escaped = ['\'', '\\', '\''].join('');
    return win ? `"${v.replace(/"/g, '""')}"` : `'${v.replace(/'/g, escaped)}'`;
  };
  const parts = [runner, q(scriptPath), ...args.map(q)];
  const cmd = parts.join(' ');
  return workdir ? `cd ${q(workdir)} && ${cmd}` : cmd;
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
  const {
    request = '',
    charCap = SKILL_LISTING_CHAR_CAP,
    // Off by default: a skill marked `disable-model-invocation` is reachable
    // only by explicit name, so it stays out of the advertisement unless the
    // caller is building a listing for a human (the CLI, the MCP server).
    includeHidden = false,
    ...listOptions
  } = options || {};
  const all = listSkills(cwd, listOptions);
  const skills = includeHidden ? all : all.filter((s) => !s.disableModelInvocation);
  // Empty either way — including when every installed skill is hidden. The
  // `skill` tool description is in the prompt regardless, so the capability is
  // still discoverable by name; only the advertisement is withheld.
  if (skills.length === 0) return '';

  const requestTokens = new Set(tokenize(request));
  const scored = skills.map((skill) => ({ skill, score: scoreSkill(skill, requestTokens) }));
  const matched = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  const rest = scored.filter((s) => s.score === 0);

  /**
   * One line per skill. The `argument-hint` rides inside the description rather
   * than on a line of its own, so it costs nothing for the skills that do not
   * have one.
   *
   * It is here at all because the model is a caller. `argument-hint` is the
   * author telling a human what to pass, and the model is the other caller: a
   * hint it cannot see is a `skill({name})` with no `args`, which loads a
   * workflow whose `$1` is still an unsubstituted placeholder.
   */
  const render = ({ name, description, argumentHint }) => {
    const desc = String(description || '').replace(/\s+/g, ' ').trim().slice(0, SKILL_DESCRIPTION_CHAR_CAP);
    return `- ${name}: ${desc}${argumentHint ? ` (args: ${argumentHint})` : ''}`;
  };

  // The header carries the invocation rules because it is the only place the
  // model is told them before it decides. `args` and the script tool are named
  // here rather than left to be discovered by a failed call: a capability the
  // model cannot name is a capability it will not use.
  //
  // Kept short on purpose. This string is a fixed prefix re-sent on every model
  // call in a turn — the budget comment above says the whole section was 96% of
  // the system prompt — so every word here is paid for up to 60 times.
  const header =
    'Available skills (invoke with the skill tool BEFORE handling the request yourself; matching skills first). ' +
    'Fill $1/$ARGUMENTS via `args`. Run a skill\'s scripts with runSkillScript. ' +
    'The user can also invoke one by name as /skill-name.';
  const lines = [];
  // The overflow note is reserved up front, worst case.
  //
  // It was not, and the section came out at `cap + 113` characters on a real
  // 208-skill install — every number was measured correctly and the total was
  // still over, because the last thing appended was the one thing never
  // counted. The note matters most precisely when the list is full, so its
  // cost cannot be the one cost that is invisible.
  const NOTE_RESERVE = '…999 more skills not listed — list .sentinel/skills with listDirectory, or invoke one by name with the skill tool.'.length;
  let used = header.length + NOTE_RESERVE;
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

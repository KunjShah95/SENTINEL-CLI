/**
 * Hooks — extension points around the loop, never rewrites of the loop.
 *
 * Claude Code lesson: PreToolUse / PostToolUse / Stop hooks intercept the
 * single query() path. Sentinel ships three layers:
 *   1. Built-in PreToolUse guard (dangerous commands blocked, no config).
 *   2. Code-registered hooks via on()/runHooks() (tests, TUI, future plugins).
 *   3. Stop verification: before the turn ends, remind the model to run
 *      tests (Ralph-Wiggum style, max STOP_RETRIES retries).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const registry = { preToolUse: [], postToolUse: [], stop: [] };

export function on(hook, fn) {
  if (!registry[hook]) throw new Error(`Unknown hook: ${hook}`);
  registry[hook].push(fn);
  return () => {
    const i = registry[hook].indexOf(fn);
    if (i >= 0) registry[hook].splice(i, 1);
  };
}

export function clearHooks() {
  registry.preToolUse.length = 0;
  registry.postToolUse.length = 0;
  registry.stop.length = 0;
}

export async function runHooks(hook, ctx) {
  for (const fn of registry[hook] || []) {
    const r = await fn(ctx);
    if (r && r.block) return r;
  }
  return null;
}

// ── Built-in PreToolUse guard ──────────────────────────────────────────
const DANGEROUS = [
  /\brm\s+-rf\s+(\/|~|\$HOME|\*)/,
  /\bmkfs\b/,
  /:\(\)\s*{\s*:\|:\s*&\s*}\s*;/,
  /\bshutdown\b|\breboot\b|\bhalt\b/,
];

export function builtinPreToolUseGuard(toolName, input) {
  if (toolName === 'bash' || toolName === 'runTests') {
    const cmd = String(input?.command || '');
    for (const re of DANGEROUS) {
      if (re.test(cmd)) {
        return { block: true, reason: `Blocked dangerous command pattern: ${re.source}` };
      }
    }
  }
  if ((toolName === 'writeFile' || toolName === 'editFile') && typeof input?.path === 'string') {
    if (/(^|\/)\.env(\.|$)/.test(input.path) || input.path.endsWith('.pem')) {
      return { block: true, reason: `Refusing to write secrets file: ${input.path}` };
    }
  }
  return null;
}

// ── PostToolUse audit (best-effort, never throws) ──────────────────────
export function auditToolUse({ toolName, ok, cwd = process.cwd() }) {
  try {
    const dir = join(cwd, '.sentinel', 'audits');
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      join(dir, `${new Date().toISOString().slice(0, 10)}.jsonl`),
      JSON.stringify({ ts: new Date().toISOString(), toolName, ok: !!ok }) + '\n'
    );
  } catch {
    // Audit is observability, not control flow.
  }
}

// ── Stop verification ──────────────────────────────────────────────────
export const STOP_RETRIES = 2;

/**
 * Decide whether the model may stop. Returns a blocking message appended
 * to history when the turn changed files but never ran tests — forcing one
 * more iteration (Ralph-Wiggum loop). Pure function for testability.
 */
const TEST_DIRS = ['test', 'tests', '__tests__', 'spec'];
const TEST_MARKERS = ['pytest.ini', 'tox.ini', 'go.mod', 'Cargo.toml', 'phpunit.xml', 'build.gradle', 'pom.xml'];
const NPM_PLACEHOLDER = /no test specified/i;

/**
 * Whether the project has a test suite to run. Answers false only when it is
 * clearly absent, so an unfamiliar layout still gets the Stop hook: the cost
 * of a wrong "no" is an unverified edit, the cost of a wrong "yes" is one
 * failing `npm test`.
 */
export function projectHasTests(dir) {
  try {
    if (TEST_DIRS.some((d) => existsSync(join(dir, d)))) return true;
    if (TEST_MARKERS.some((f) => existsSync(join(dir, f)))) return true;
    const pyproject = join(dir, 'pyproject.toml');
    if (existsSync(pyproject) && /\[tool\.pytest/.test(readFileSync(pyproject, 'utf8'))) return true;
    const makefile = join(dir, 'Makefile');
    if (existsSync(makefile) && /^test\s*:/m.test(readFileSync(makefile, 'utf8'))) return true;
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      const test = JSON.parse(readFileSync(pkg, 'utf8'))?.scripts?.test;
      return typeof test === 'string' && test.trim() !== '' && !NPM_PLACEHOLDER.test(test);
    }
    return false;
  } catch {
    return true;
  }
}

export function checkStop({ wroteFiles, ranTests, mode, hasTests = true }) {
  if (mode !== 'BUILD' && mode !== 'SWE') return null;
  if (wroteFiles && !ranTests && hasTests) {
    return 'Stop hook: files were changed but no tests were run. Run the relevant test command (runTests preferred) and report results before finishing.';
  }
  return null;
}

#!/usr/bin/env node
/**
 * Wait until the working tree stops changing, then say whether it is committable.
 *
 *   node scripts/tree-quiet.mjs [--quiet-seconds 45] [--timeout 600]
 *
 * ## Why this exists
 *
 * This repository is being written by more than one agent. Committing while a
 * refactor is half-landed captures a snapshot nobody tested — and the failure is
 * silent, because a commit is just a tree that happened to parse.
 *
 * It already happened here: `providers.js` was briefly broken with `OPENAI_COMPAT`
 * and `ENV_KEYS` undefined, and a commit taken at that moment would have shipped
 * a file that does not run. Judging "is it safe yet" by eye, once per turn, is a
 * bad instrument. This is a better one.
 *
 * ## What it does
 *
 * Polls the mtime of every tracked-and-untracked source file. When nothing has
 * moved for `--quiet-seconds`, the tree is considered settled and it runs the
 * full `release:check`. Prints one of:
 *
 *   COMMITTABLE   tree settled, lint + typecheck + imports + all tests green
 *   NOT GREEN     tree settled, but the check failed — with the summary
 *   STILL MOVING  another writer never paused; gives up after --timeout
 *
 * Exit code 0 only for COMMITTABLE, so it can gate a script that commits.
 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
};
const QUIET_SECONDS = arg('quiet-seconds', 45);
const TIMEOUT_SECONDS = arg('timeout', 600);

// Directories that change on their own: build output, installed dependencies,
// and the gitignored runtime state that every turn writes to.
const IGNORE = /(^|[\\/])(node_modules|\.git|dist|coverage|\.sentinel|\.next|__snapshots__)([\\/]|$)/;
const SUFFIX = /\.(js|mjs|cjs|ts|tsx|json|md|yaml|yml)$/;

function snapshot() {
  const out = new Map();
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (IGNORE.test(p)) continue;
      if (e.isDirectory()) { walk(p); continue; }
      if (!SUFFIX.test(e.name)) continue;
      try { out.set(p, statSync(p).mtimeMs); } catch { /* raced with a writer */ }
    }
  };
  walk(ROOT);
  return out;
}

function changedSince(prev, now) {
  const changed = [];
  for (const [p, t] of now) {
    if (!prev.has(p) || prev.get(p) !== t) changed.push(relative(ROOT, p));
  }
  for (const p of prev.keys()) if (!now.has(p)) changed.push(relative(ROOT, p) + ' (deleted)');
  return changed;
}

const DIM = '\x1b[2m';
const OFF = '\x1b[0m';
const started = Date.now();

console.log(`Waiting for a ${QUIET_SECONDS}s pause in file writes (timeout ${TIMEOUT_SECONDS}s)…`);
let prev = snapshot();
let quietSince = Date.now();

while (true) {
  if ((Date.now() - started) / 1000 > TIMEOUT_SECONDS) {
    console.log(`\nSTILL MOVING — files changed continuously for ${TIMEOUT_SECONDS}s.`);
    console.log(`${DIM}Another writer is active. Committing now would capture a half-landed refactor.${OFF}`);
    process.exit(2);
  }
  await new Promise((r) => setTimeout(r, 5000));
  const now = snapshot();
  const changed = changedSince(prev, now);
  prev = now;

  if (changed.length > 0) {
    quietSince = Date.now();
    console.log(`${DIM}  ${changed.length} file(s) changed; the quiet clock restarts.${OFF}`);
  } else if (Date.now() - quietSince >= QUIET_SECONDS * 1000) {
    console.log(`\nTree has been quiet for ${QUIET_SECONDS}s. Running release:check…\n`);
    break;
  }
}

const r = spawnSync('npm', ['run', 'release:check'], {
  cwd: ROOT, shell: process.platform === 'win32', encoding: 'utf-8',
});
const log = `${r.stdout || ''}${r.stderr || ''}`;
const lines = log.split('\n').filter(Boolean);

const pick = (re) => lines.filter((l) => re.test(l)).slice(-4);
const summary = [...pick(/^# (tests|pass|fail) /), ...pick(/^(Tests|Test Suites):/)];
for (const s of summary) console.log(`  ${s}`);

if (r.status !== 0) {
  console.log('\nNOT GREEN — the tree settled but the check failed:');
  const errs = lines.filter((l) => /\berror\b|\b✖\b|not ok/.test(l)).slice(0, 12);
  for (const e of errs) console.log(`  ${e}`);
  process.exit(1);
}

if (!existsSync(join(ROOT, '.git'))) {
  console.log('\nCOMMITTABLE (no .git here — nothing to commit to)');
  process.exit(0);
}
const status = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf-8' }).stdout || '';
const n = status.split('\n').filter(Boolean).length;
console.log(`\nCOMMITTABLE — lint, typecheck, imports and every test pass. ${n} path(s) changed.`);
process.exit(0);

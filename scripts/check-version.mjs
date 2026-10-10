#!/usr/bin/env node
/**
 * Fail if the reported version is inconsistent anywhere.
 *
 *   node scripts/check-version.mjs
 *
 * ## Why this exists
 *
 * `package.json` is the truth and five other places held copies. Five of them
 * drift the moment a release ships, silently:
 *
 *   - a stale `CLIENT_INFO.version` tells an MCP server the wrong version
 *   - a stale `user-agent` misattributes traffic
 *   - a stale `package-lock.json` makes `npm ci` install from a different tree
 *   - a stale website constant ships the wrong download banner
 *   - a stale TUI banner prints the wrong thing to the user
 *
 * The v3.4.0 release bumped all of them by hand and was correct — by luck,
 * because nothing said a sixth place could not exist. This is the check that
 * makes the luck unnecessary.
 *
 * ## Why it resolves instead of grepping
 *
 * The first version of this script scanned each file for `\d+\.\d+\.\d+`. It
 * reported package.json's own dependency versions as mismatches, and flagged the
 * comments in this repository that *mention* a version while explaining the bug
 * it fixes. Both false positives are fatal to a check like this: a check that
 * cries wolf gets deleted, which is worse than having none.
 *
 * So it asks the question that actually matters — *what does each surface
 * report?* — by resolving each one and comparing values. A file that hardcodes
 * a literal still fails here, because it reports the wrong value. That is the
 * property we care about, and unlike grep it cannot be confused by a comment.
 *
 * Exit 0 when consistent, 1 otherwise.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const rel = (p) => pathToFileURL(join(ROOT, p)).href;

const expected = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const surfaces = [];

function record(name, reported, note) {
  surfaces.push({ name, reported, note });
}

// ── 1. The single source ───────────────────────────────────────────────────
const version = await import(rel('src/version.js'));
record('src/version.js', version.getVersion(), 'the source of truth');

// ── 2. The npm-owned lockfile ──────────────────────────────────────────────
// npm rewrites these two fields itself, so they are asserted rather than
// derived — but only those two fields, not the ~400 dependency versions that
// also live in the file.
const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
record('package-lock.json .version', lock.version, 'npm-owned');
record('package-lock.json .packages[""].version', lock.packages?.['']?.version, 'npm-owned');

// ── 3. The website ─────────────────────────────────────────────────────────
// A separate build with its own toolchain, so it cannot import from src/. It
// stays a literal, and this is what keeps it honest. Parsed structurally rather
// than grepped, so a version mentioned in prose there would not trip it.
const sitePath = join(ROOT, 'website', 'lib', 'site.ts');
if (existsSync(sitePath)) {
  const m = /version:\s*["']([^"']+)["']/.exec(readFileSync(sitePath, 'utf8'));
  record('website/lib/site.ts', m?.[1] ?? '(not found)', 'separate build — a literal');
} else {
  record('website/lib/site.ts', '(file missing)', 'not checked');
}

// ── 4. The derived surfaces ────────────────────────────────────────────────
// These used to be literals. They now read src/version.js, so what matters is
// not that they contain no digits — it is that they report the right value.
record('user-agent (fetch-url)', version.userAgent().match(/sentinel-cli\/([\d.]+)/)?.[1], 'derived');

try {
  const mcp = await import(rel('src/agent/mcp-client.js'));
  record('mcp-client CLIENT_INFO', mcp.CLIENT_INFO?.version ?? '(absent)', 'derived');
} catch (e) {
  record('mcp-client import', `(failed: ${e.message})`, 'derived');
}

// The CLI's own report, the one a user actually types.
try {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [join(ROOT, 'bin', 'sentinel.js'), '--version'], { encoding: 'utf8' });
  record('sentinel --version', (r.stdout || '').trim(), 'derived');
} catch (e) {
  record('sentinel --version', `(failed: ${e.message})`, 'derived');
}

// The TUI banner reads through the same module.
try {
  const { getVersion: tuiVersion } = await import(rel('src/tui/lib/version.ts'));
  record('tui getVersion()', tuiVersion(), 'derived');
} catch {
  record('tui getVersion()', '(ts not importable from plain node — re-export asserted by source)', 'derived');
}

const wrong = surfaces.filter((s) => s.reported !== expected);

// ── Report ─────────────────────────────────────────────────────────────────
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const OFF = '\x1b[0m';

if (wrong.length) {
  console.log(`${RED}version mismatch${OFF} — package.json says ${expected}\n`);
  for (const s of wrong) console.log(`  ${s.name.padEnd(38)} reports ${s.reported}`);
  console.log(`\n${DIM}Bump package.json, then npm install (for the lockfile) and website/lib/site.ts.${OFF}`);
  console.log(`${DIM}Everything else derives from src/version.js and needs no bump.${OFF}\n`);
  process.exit(1);
}

console.log(`${GREEN}version consistent${OFF} — ${expected}\n`);
for (const s of surfaces) {
  console.log(`  ${s.reported.padEnd(12)} ${s.name.padEnd(38)} ${DIM}${s.note}${OFF}`);
}
console.log();

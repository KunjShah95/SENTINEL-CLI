/**
 * Onboarding survey — the forward-deployed engineer's week one.
 *
 * A new engineer joining an unfamiliar repo spends days answering: where does
 * it start, who owns what, what actually gates the merge, and which files are
 * both hot and untested. Every one of those answers is computable from files
 * already on disk, so this module computes them without a model in the loop:
 * `analyzeRepo()` is pure analysis over the filesystem plus two read-only git
 * queries.
 *
 * The split matters. Analysis is deterministic and testable without an API
 * key; `sentinel onboard` layers ONE model turn on top to interpret the survey
 * into prose. If the model is unavailable the survey still stands on its own.
 *
 * Everything here is read-only. Nothing in this file writes to the working
 * tree.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, extname, sep } from 'node:path';

/**
 * Every path in the survey is POSIX, whatever the host OS. Two sources feed
 * the analysis — the filesystem walk (OS-native separators) and git log
 * (always POSIX) — and they are compared against each other for test
 * proximity and tree membership. Mixing them makes every comparison fail
 * silently on Windows: a hot file looks untested because its sibling test
 * carries a different separator.
 */
const posix = (p) => p.split(sep).join('/');
const dirOf = (p) => p.split('/').slice(0, -1).join('/');
const topOf = (p) => p.split('/')[0];
/** All ancestor directories of a path, deepest first ('' → []). */
const ancestors = (dir) => {
  if (!dir) return [];
  const parts = dir.split('/');
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'));
};

import { getWorkdir } from '../shared/tools/workdir.js';
export const ONBOARD_VERSION = '1';
export const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next',
  '.venv', 'venv', '__pycache__', '.cache', '.turbo', 'vendor', 'target',
  '.sentinel', '.idea', '.vscode-test', 'tmp',
]);

const SOURCE_EXT = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.py',
  '.rb', '.go', '.rs', '.java', '.kt', '.c', '.h', '.cc', '.cpp', '.hpp',
  '.cs', '.php', '.swift', '.scala', '.sh', '.sql',
]);
const TEST_RE = /(^|\/)(__tests__|tests?|spec|e2e)(\/|$)|\.(test|spec)\.[a-z]+$|_test\.[a-z]+$|test_[^/]+\.py$/i;

export const HOTSPOT_LIMIT = 15;
export const OWNER_DEPTH = 2;

/**
 * Docs and data are not code paths. Listing `README.md` under "hot files with
 * no tests" is technically true and completely useless — it buries the one
 * finding a reader should act on.
 */
export function isNonCodePath(p) {
  const base = p.split('/').pop();
  if (DOC_EXT.has(extname(base).toLowerCase())) return true;
  // Manifests and lock-adjacent config are edited constantly and tested by
  // CI, not by unit tests. Naming them "uncovered" buries the real findings.
  if (/^(?:package\.json|pyproject\.toml|setup\.cfg|setup\.py|Cargo\.toml|go\.mod|Gemfile|composer\.json|pom\.xml|build\.gradle)$/i.test(base)) return true;
  if (/\.(?:json|ya?ml|toml|ini|cfg|lock)$/i.test(base)) return true;
  return GENERATED_RE.test(p);
}

/** Root-level test directories that conventionally cover the whole tree. */
const SHARED_TEST_DIRS = new Set(['__tests__', 'test', 'tests', 'spec', 'e2e']);

/** Read-only git; absent repo, absent git, or a non-zero exit all degrade to null. */
function git(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/**
 * Walk the tree once, bucketing every file we care about. Single pass matters:
 * a naive implementation that stats each directory repeatedly is O(n·depth) and
 * gets slow on exactly the large repos onboarding exists for.
 */
function walk(root, limit = 20000) {
  const files = [];
  const dirs = [];
  const stack = [''];
  while (stack.length && files.length < limit) {
    const rel = stack.pop();
    let entries;
    try {
      entries = readdirSync(join(root, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    dirs.push(rel ? posix(rel) : '.');
    for (const e of entries) {
      const child = rel ? `${rel}${sep}${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) stack.push(child);
      } else if (e.isFile()) {
        let size = 0;
        try { size = statSync(join(root, child)).size; } catch { /* raced with delete */ }
        files.push({ path: posix(child), size });
      }
    }
  }
  return { files, dirs };
}

/** Entry points: declared first, then the idioms that actually get executed. */
export function findEntryPoints(root, files, pkg) {
  const found = [];
  const add = (label, detail) => {
    if (!found.some((f) => f.path === detail)) found.push({ label, path: detail });
  };
  if (pkg?.bin) {
    const bins = typeof pkg.bin === 'string' ? { [pkg.name || 'bin']: pkg.bin } : pkg.bin;
    for (const [name, p] of Object.entries(bins || {})) add(`bin:${name}`, String(p));
  }
  if (pkg?.main) add('package.main', String(pkg.main));
  if (pkg?.exports) add('package.exports', '.');
  for (const f of files) {
    if (/^(cmd|bin|app)\//.test(f.path) && /\.(js|mjs|ts|go|py|rb)$/.test(f.path)) {
      add('conventional', f.path);
    }
    if (f.path === 'main.py' || f.path === 'app.py' || f.path === 'server.py') {
      add('python entry', f.path);
    }
  }
  return found.slice(0, 20);
}

function readPkg(root) {
  const file = join(root, 'package.json');
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

/**
 * Generated, vendored, and lock files change constantly and are never where
 * the interesting work happens. Left in, `package-lock.json` outranks every
 * source file and the whole ranking becomes noise — so they are ranked out
 * of the hotspot list and reported separately.
 */
const GENERATED_RE = /(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|Gemfile\.lock|Cargo\.lock|go\.sum|bun\.lockb?)$|\.min\.(?:js|css)$|\.map$|\.lock$|(?:^|\/)(?:\d+-)*[a-f0-9]{20,}\.(?:min\.)?(?:js|css)$|(?:^|\/)__snapshots__\/|(?:^|\/)(?:dist|build|out|coverage|generated|vendor|third_party|node_modules)\//i;
const DOC_EXT = new Set(['.md', '.mdx', '.rst', '.txt', '.adoc']);

export function isGeneratedPath(p) {
  return GENERATED_RE.test(p);
}

/**
 * Hotspots = churn from `git log --numstat`, intersected with the working
 * tree. `numstat` gives lines changed per commit per file, which is the
 * cheapest available proxy for "where does work happen".
 *
 * Generated files are tallied separately rather than dropped, so the survey
 * can say "40% of your churn is a lockfile" instead of silently omitting it.
 */
export function analyzeChurn(root, knownPaths) {
  const out = git(['log', '--numstat', '--format=', '-n', '500', '--no-merges'], root);
  if (out == null) return { available: false, hotspots: [], generated: [], removed: [] };
  const stats = new Map();
  const generated = new Map();
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const [a, d, file] = line.split('\t');
    if (!file) continue;
    const p = posix(file);
    // Binary files report '-' for both counts.
    const added = a === '-' ? 0 : Number(a) || 0;
    const removed = d === '-' ? 0 : Number(d) || 0;
    const bucket = isGeneratedPath(p) ? generated : stats;
    const s = bucket.get(p) || { path: p, changed: 0, commits: new Set() };
    s.changed += added + removed;
    s.commits.add(`${added}:${removed}`);
    bucket.set(p, s);
  }
  const allChanged = [...stats.values(), ...generated.values()].reduce((n, s) => n + s.changed, 0);
  // Rank the live tree, but report deleted-and-rewritten history separately:
  // a file that churned hugely before being removed is a story about the
  // project's past, not a place to go make changes.
  const ranked = [...stats.values()]
    .map((s) => ({
      path: s.path,
      changed: s.changed,
      commits: s.commits.size,
      inTree: knownPaths.has(s.path),
      code: knownPaths.has(s.path) ? !isNonCodePath(s.path) : false,
    }))
    .sort((a, b) => {
      // Live code first, then live non-code, then gone.
      const rank = (h) => (h.inTree && h.code ? 0 : h.inTree ? 1 : 2);
      return rank(a) - rank(b) || b.changed - a.changed || a.path.localeCompare(b.path);
    });
  const hotspots = ranked.slice(0, HOTSPOT_LIMIT);
  const removed = ranked.filter((h) => !h.inTree && h.changed > 0)
    .sort((a, b) => b.changed - a.changed)
    .slice(0, 10)
    .map((h) => ({ path: h.path, changed: h.changed, commits: h.commits }));
  const generatedTop = [...generated.values()]
    .sort((a, b) => b.changed - a.changed)
    .slice(0, 5)
    .map((s) => ({ path: s.path, changed: s.changed, share: allChanged ? Math.round((s.changed / allChanged) * 100) : 0 }));
  return {
    available: true,
    hotspots,
    generated: generatedTop,
    removed,
    generatedShare: allChanged ? [...generated.values()].reduce((n, s) => n + s.changed, 0) / allChanged : 0,
  };
}

/**
 * Ownership by directory, at OWNER_DEPTH levels. Deliberately shallow: the
 * point is "billing is John's area", which is true at depth 2 and false at
 * depth 5.
 */
/**
 * The same person often commits under two spellings (`KunjShah95` and
 * `KUNJ SHAH` in this very repo). Counting those as two contributors
 * overstates the bus factor, so ownership is tallied case- and
 * separator-insensitively while the display keeps git's own spelling.
 */
/**
 * `KunjShah95` and `Kunj Shah` are the same person; so are `KunjShah95` and
 * `kunjshah95`. Separators go, then a trailing run of digits is compared as a
 * unit, so a GitHub handle and a real name collapse to one identity.
 */
const identityKey = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/(\D*)\d+$/, '$1').replace(/\s+/g, '');

export function analyzeOwnership(root, dirs) {
  const out = git(['log', '--format=%an', '-n', '2000', '--no-merges'], root);
  if (out == null) return { available: false, owners: [], contributors: 0 };
  const names = out.split('\n').filter(Boolean);
  const tally = new Map();
  for (const d of dirs) {
    const hits = git(['log', '--format=%an', '-n', '60', '--no-merges', '--', d], root);
    if (!hits) continue;
    const counts = new Map();
    for (const a of hits.split('\n').filter(Boolean)) {
      const key = identityKey(a);
      const prev = counts.get(key);
      if (prev) prev.count++;
      else counts.set(key, { name: a, count: 1 });
    }
    const [key, { name, count }] = [...counts.entries()].sort((x, y) => y[1].count - x[1].count)[0] || [];
    if (key) tally.set(d, { dir: d, owner: name, key, commits: count });
  }
  const owners = [...tally.values()]
    .filter((o) => o.commits >= 2)
    .sort((a, b) => b.commits - a.commits)
    .slice(0, 25);
  return { available: true, owners, contributors: new Set(names.map(identityKey)).size };
}

/** `src/core/alpha.js` and `__tests__/alpha.test.js` name the same unit. */
function stemOf(p) {
  return p
    .split('/')
    .pop()
    .replace(/\.(test|spec)\.[a-z0-9]+$/i, '')
    .replace(/[._]test\.[a-z0-9]+$/i, '')
    .replace(/_test$/i, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .toLowerCase();
}

/**
 * Files that change often AND have no test anywhere near them.
 *
 * "Near" is two independent signals, because either alone produces false
 * alarms. Directory proximity catches co-located tests; name proximity catches
 * the far more common `src/foo.js` + `__tests__/foo.test.js` split, where the
 * test shares no directory with the file it covers.
 */
export function findRiskAreas(hotspots, files) {
  const testedDirs = new Set();
  const testedStems = new Set();
  for (const f of files) {
    if (!TEST_RE.test(f.path)) continue;
    for (const d of ancestors(dirOf(f.path))) testedDirs.add(d);
    testedStems.add(stemOf(f.path));
  }
  const risky = [];
  for (const h of hotspots) {
    if (!h.inTree) continue;
    // A manifest or a doc is not an untested code path, however often it
    // changes. Only source files can be "uncovered".
    if (isNonCodePath(h.path)) continue;
    const byDir = ancestors(dirOf(h.path)).some((d) => testedDirs.has(d));
    const byName = testedStems.has(stemOf(h.path));
    if (!byDir && !byName) {
      risky.push({
        path: h.path,
        changed: h.changed,
        commits: h.commits,
        reason: 'high churn, no test covers this file',
      });
    }
  }
  return risky.slice(0, HOTSPOT_LIMIT);
}

/**
 * Where the tests are, and where they are not.
 *
 * A repo-level test directory (`__tests__/`, `test/`, `spec/`) covers the
 * whole tree, so comparing top-level directory names alone reports every
 * source directory as untested — the exact opposite of the truth when all 17
 * test files sit in a root `__tests__/`. Coverage is therefore reported as
 * three states: shared (one test dir covers everything), partial, or none.
 */
export function analyzeTestTopology(files) {
  const srcDirs = new Map();
  const testDirs = new Set();
  let srcCount = 0;
  let testCount = 0;
  let loc = 0;
  for (const f of files) {
    const ext = extname(f.path).toLowerCase();
    const isTest = TEST_RE.test(f.path);
    if (isTest) testCount++;
    else if (SOURCE_EXT.has(ext)) srcCount++;
    if (SOURCE_EXT.has(ext)) loc += Math.round(f.size / 40);
    const top = topOf(f.path);
    if (isTest) testDirs.add(top);
    else if (SOURCE_EXT.has(ext)) srcDirs.set(top, (srcDirs.get(top) || 0) + 1);
  }
  const shared = [...testDirs].filter((d) => SHARED_TEST_DIRS.has(d));
  const untested = [...srcDirs.entries()]
    .filter(([dir]) => !testDirs.has(dir))
    .map(([dir, n]) => ({ dir, files: n }))
    .sort((a, b) => b.files - a.files);
  return {
    srcCount,
    testCount,
    estLoc: loc,
    untested,
    layout: shared.length ? 'shared' : untested.length ? 'per-directory' : 'none',
    sharedDirs: shared,
  };
}

/** What gates the merge: workflow names + the events they trigger on. */
export function analyzeCi(root) {
  const dir = join(root, '.github', 'workflows');
  if (!existsSync(dir)) return { available: false, workflows: [] };
  const workflows = [];
  let seen = false;
  for (const f of readdirSync(dir)) {
    if (!/\.ya?ml$/.test(f)) continue;
    seen = true;
    let text = '';
    try { text = readFileSync(join(dir, f), 'utf8'); } catch { /* unreadable */ }
    const name = /^name:\s*(.+)$/m.exec(text)?.[1]?.trim() || f.replace(/\.ya?ml$/, '');
    const on = /^on:\s*([^\n]+)/m.exec(text)?.[1]?.trim() || 'unknown';
    const triggers = [...text.matchAll(/^\s{2,4}(push|pull_request|workflow_dispatch|schedule|release):/gm)]
      .map((m) => m[1]);
    const jobs = [...text.matchAll(/^\s{2,4}([a-z0-9_-]+):\s*$/gm)].length;
    workflows.push({ file: `.github/workflows/${f}`, name, on, triggers: triggers.length ? triggers : [on], jobs });
  }
  return { available: seen, workflows };
}

/**
 * The whole survey. Read-only, deterministic given the same tree, and
 * designed to run without any model or API key.
 */
export function analyzeRepo(cwd = getWorkdir()) {
  const root = resolve(cwd);
  const { files, dirs } = walk(root);
  const knownPaths = new Set(files.map((f) => f.path));
  const pkg = readPkg(root);
  const sourceFiles = files.filter((f) => SOURCE_EXT.has(extname(f.path).toLowerCase()) && f.size > 0);
  const churn = analyzeChurn(root, knownPaths);
  const topDirs = dirs.filter((d) => d !== '.')
    .map((d) => ({ dir: d, depth: d.split('/').length }))
    .filter((d) => d.depth <= OWNER_DEPTH)
    .slice(0, 25);

  const report = {
    version: ONBOARD_VERSION,
    root,
    generatedAt: new Date().toISOString(),
    meta: {
      name: pkg?.name || root.split(sep).pop(),
      version: pkg?.version || null,
      description: pkg?.description || null,
      license: pkg?.license || null,
      engines: pkg?.engines?.node || null,
      isGitRepo: existsSync(join(root, '.git')),
      totalFiles: files.length,
      sourceFiles: sourceFiles.length,
      truncated: files.length >= 20000,
    },
    entryPoints: findEntryPoints(root, files, pkg),
    dependencies: {
      runtime: Object.keys(pkg?.dependencies || {}),
      dev: Object.keys(pkg?.devDependencies || {}),
      scripts: pkg?.scripts || {},
    },
    layout: topDirs,
    tests: analyzeTestTopology(files),
    ci: analyzeCi(root),
    churn,
    ownership: analyzeOwnership(root, topDirs.map((d) => d.dir)),
    risk: churn.available ? findRiskAreas(churn.hotspots, files) : [],
    docs: files
      .filter((f) => /\.md$/i.test(f.path) && (!f.path.includes('/') || /(^|\/)docs?\//i.test(f.path)))
      .map((f) => f.path)
      .slice(0, 30),
  };

  // Risk is only meaningful when we know which files are hot AND untested.
  report.summary = summarize(report);
  return report;
}

function pct(n, total) {
  return total ? Math.round((n / total) * 100) : 0;
}

function summarize(r) {
  const warnings = [];
  if (!r.meta.isGitRepo) warnings.push('not a git repository — churn, ownership, and CI are unavailable');
  if (!r.tests.testCount) warnings.push('no test files found');
  else if (r.tests.layout === 'per-directory' && r.tests.testCount < r.tests.srcCount / 10) {
    warnings.push(`only ${r.tests.testCount} test file(s) against ${r.tests.srcCount} source files`);
  }
  if (r.risk.length) {
    warnings.push(
      `${r.risk.length} hot source file(s) have no test covering them (see Risk areas) — ` +
      r.risk.slice(0, 3).map((x) => `\`${x.path}\``).join(', ') +
      (r.risk.length > 3 ? `, +${r.risk.length - 3} more` : ''),
    );
  }
  if (!r.ci.available) warnings.push('no CI workflows — nothing documented to gate the merge');
  if (r.tests.srcCount && !r.entryPoints.length) warnings.push('no entry point declared or detected');
  // Bus factor, measured two ways. One top committer across every mapped area
  // means recent work has a single owner no matter how many people have ever
  // committed; a repo with almost no history contributors is worse.
  if (r.ownership.available && r.ownership.owners.length >= 2) {
    const leads = new Map();
    for (const o of r.ownership.owners) {
      const k = identityKey(o.owner);
      leads.set(k, (leads.get(k) || 0) + 1);
    }
    const [top, areas] = [...leads.entries()].sort((a, b) => b[1] - a[1])[0];
    if (areas === r.ownership.owners.length) {
      warnings.push(`bus factor of 1 — ${top} is the top committer in all ${areas} mapped areas; ${r.ownership.contributors} contributor(s) in history`);
    } else if (r.ownership.contributors <= 2) {
      warnings.push(`bus factor of 1 — only ${r.ownership.contributors} contributor(s) in history`);
    }
  }
  if (r.churn.available && r.churn.generatedShare > 0.4) {
    warnings.push(`${Math.round(r.churn.generatedShare * 100)}% of measured churn is generated files (lockfiles, bundles) — real work is smaller than the diff suggests`);
  }
  return {
    testRatio: pct(r.tests.testCount, Math.max(r.tests.srcCount, 1)),
    coverage: r.tests.testCount ? r.tests.layout : 'none',
    riskCount: r.risk.length,
    warnings,
  };
}

/** Render the survey as the Markdown a human would actually read. */
export function renderOnboarding(report) {
  const L = [];
  const m = report.meta;
  L.push(`# ${m.name} — onboarding survey`);
  L.push('');
  L.push(`> Generated by \`sentinel onboard\` (survey v${report.version}). Deterministic analysis, no model in the loop.`);
  L.push('');
  L.push(`- **Version**: ${m.version || 'unknown'}${m.license ? ` · ${m.license}` : ''}${m.engines ? ` · node ${m.engines}` : ''}`);
  L.push(`- **Size**: ${m.sourceFiles} source files of ${m.totalFiles} total${m.truncated ? ' (scan truncated at 20000)' : ''}`);
  if (m.description) L.push(`- **What it is**: ${m.description}`);
  L.push('');

  L.push('## Entry points');
  L.push('');
  if (report.entryPoints.length) {
    for (const e of report.entryPoints) L.push(`- \`${e.path}\` — ${e.label}`);
  } else {
    L.push('_None declared or detected. This is the first thing to fix: a new engineer has no starting point._');
  }
  L.push('');

  if (report.ci.available && report.ci.workflows.length) {
    L.push('## What gates the merge');
    L.push('');
    for (const w of report.ci.workflows) {
      L.push(`- **${w.name}** (\`${w.file}\`) — on ${w.triggers.join(', ')} · ${w.jobs} job(s)`);
    }
    L.push('');
  }

  L.push('## Tests');
  L.push('');
  L.push(`${report.tests.testCount} test file(s) vs ${report.tests.srcCount} source file(s) (~${report.summary.testRatio}%). Layout: **${report.summary.coverage}**.`);
  if (report.tests.layout === 'shared') {
    L.push('');
    L.push(`All tests live in ${report.tests.sharedDirs.map((d) => `\`${d}/\``).join(', ')} and are not co-located with the code they cover — budget for finding the right test file by name.`);
  } else if (report.tests.untested.length) {
    L.push('');
    L.push('Source directories with no tests at all:');
    L.push('');
    for (const u of report.tests.untested.slice(0, 10)) L.push(`- \`${u.dir}/\` — ${u.files} file(s)`);
  }
  L.push('');

  if (report.churn.available && report.churn.hotspots.length) {
    L.push('## Where the work happens');
    L.push('');
    L.push('Live source files ranked by churn over the last 500 commits.');
    L.push('');
    L.push('| File | Commits | Lines changed |');
    L.push('| --- | --- | --- |');
    for (const h of report.churn.hotspots.filter((x) => x.inTree)) L.push(`| \`${h.path}\` | ${h.commits} | ${h.changed} |`);
    L.push('');
    if (report.churn.generated.length) {
      L.push(`Generated files account for ${Math.round(report.churn.generatedShare * 100)}% of measured churn and are excluded from the table above: ${report.churn.generated.map((g) => `\`${g.path}\` (${g.share}%)`).join(', ')}.`);
      L.push('');
    }
  }

  if (report.churn.available && report.churn.removed?.length) {
    L.push('## Removed, but still in the history');
    L.push('');
    L.push('These churned heavily before they were deleted. Useful context, not somewhere to make changes.');
    L.push('');
    for (const h of report.churn.removed.slice(0, 5)) L.push(`- \`${h.path}\` — ${h.commits} commits, ${h.changed} lines changed, no longer in the tree`);
    L.push('');
  }

  if (report.ownership.available && report.ownership.owners.length) {
    L.push('## Who owns what');
    L.push('');
    L.push(`${report.ownership.contributors} contributor(s) in the last 2000 commits. Bus factor by area (top committer):`);
    L.push('');
    for (const o of report.ownership.owners) L.push(`- \`${o.dir}/\` — ${o.owner} (${o.commits} commits)`);
    L.push('');
  }

  if (report.risk.length) {
    L.push('## Risk areas');
    L.push('');
    L.push('High churn and no test covering them — change here carefully, and write the test first.');
    L.push('');
    for (const r of report.risk) L.push(`- \`${r.path}\` — ${r.commits} commits, ${r.changed} lines changed, ${r.reason}`);
    L.push('');
  }

  if (Object.keys(report.dependencies.scripts).length) {
    L.push('## Commands');
    L.push('');
    for (const [k, v] of Object.entries(report.dependencies.scripts)) L.push(`- \`${k}\` — \`${v}\``);
    L.push('');
  }

  if (report.docs.length) {
    L.push('## Documentation');
    L.push('');
    L.push(report.docs.map((d) => `\`${d}\``).join(' · '));
    L.push('');
  }

  if (report.summary.warnings.length) {
    L.push('## What a new engineer should know first');
    L.push('');
    for (const w of report.summary.warnings) L.push(`- ${w}`);
    L.push('');
  }

  L.push('---');
  L.push('');
  L.push('Next: `sentinel outcome "<what the customer actually wants>"` to turn a vague ask into a');
  L.push('contract that can be verified, then work until it holds.');
  L.push('');
  return L.join('\n');
}

/** Files a `project` memory record should carry: where things live. */
export function memoryBody(report) {
  const L = [];
  L.push(`Onboarding survey for **${report.meta.name}** (generated by \`sentinel onboard\`).`);
  L.push('');
  if (report.entryPoints.length) {
    L.push(`Entry points: ${report.entryPoints.map((e) => `\`${e.path}\``).join(', ')}.`);
  }
  if (report.ci.available && report.ci.workflows.length) {
    L.push(`CI: ${report.ci.workflows.map((w) => `${w.name} (${w.triggers.join('/')})`).join(', ')}.`);
  }
  L.push(`Tests: ${report.tests.testCount} test file(s) against ${report.tests.srcCount} source file(s).`);
  if (report.risk.length) {
    L.push('');
    L.push('Risk areas (high churn, untested):');
    for (const r of report.risk) L.push(`- \`${r.path}\` — ${r.commits} commits, ${r.changed} lines changed`);
  }
  if (report.ownership.available && report.ownership.owners.length) {
    L.push('');
    L.push('Ownership:');
    for (const o of report.ownership.owners.slice(0, 10)) L.push(`- \`${o.dir}/\` — ${o.owner}`);
  }
  if (report.summary.warnings.length) {
    L.push('');
    L.push('Open questions for the team:');
    for (const w of report.summary.warnings) L.push(`- ${w}`);
  }
  return L.join('\n');
}

/** Onboarding todos, seeded only where the survey found a real gap. */
export function suggestTodos(report) {
  const todos = [];
  let n = 0;
  const add = (title) => { todos.push({ id: `onboard-${++n}`, title, status: 'pending' }); };
  if (!report.entryPoints.length) add('Document the entry point — nothing declares how this starts');
  if (report.tests.testCount === 0) add('Add a first test — the repo has no test files at all');
  for (const r of report.risk.slice(0, 5)) add(`Write a test for \`${r.path}\` before changing it (${r.commits} commits, no coverage)`);
  if (!report.ci.available) add('Add CI — nothing currently gates the merge');
  if (report.ownership.owners.length >= 2) {
    const leads = new Map();
    for (const o of report.ownership.owners) leads.set(identityKey(o.owner), (leads.get(identityKey(o.owner)) || 0) + 1);
    const [, areas] = [...leads.entries()].sort((a, b) => b[1] - a[1])[0];
    if (areas === report.ownership.owners.length) {
      add(`Reduce the bus factor: one person is the top committer in all ${areas} mapped areas`);
    }
  }
  if (!todos.length) add('Read the entry point and the test for it end to end');
  return todos;
}

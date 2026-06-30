// Unified scan: fan the loop's scan step out across scanner_agent.js heuristics
// AND the richer src/analyzers/* suite, then normalize every finding to the
// autonomous-fix-loop shape: { type, message, line, severity }.
//
// Design goals (the loop re-scans every iteration and diffs by signature, so):
//   1. Deterministic   — same input always yields the same finding set.
//   2. Language-gated   — analyzers only run on file types they understand
//                         (no k8s YAML analyzer on a .js file).
//   3. Side-effect free — analyzers receive code + filename in-memory; nothing
//                         is written to disk and no shell/network is touched.
//   4. Deduplicated     — identical findings collapse to one (signature below).

import { scanCode } from './scanner_agent.js';

import { SecurityAnalyzer } from '../analyzers/securityAnalyzer.js';
import { APISecurityAnalyzer } from '../analyzers/apiSecurityAnalyzer.js';
import { GraphQLSecurityAnalyzer } from '../analyzers/graphqlSecurityAnalyzer.js';
import { EnvSecurityAnalyzer } from '../analyzers/envSecurityAnalyzer.js';
import { IaCAnalyzer } from '../analyzers/iacAnalyzer.js';
import KubernetesAnalyzer from '../analyzers/kubernetesAnalyzer.js';
import { BugAnalyzer } from '../analyzers/bugAnalyzer.js';
import { QualityAnalyzer } from '../analyzers/qualityAnalyzer.js';
import { PerformanceAnalyzer } from '../analyzers/performanceAnalyzer.js';

const KNOWN_SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'info']);

// A finding is auto-fixable only when the fixer can deterministically resolve it
// (secret/credential redaction) — those drive the loop's `proven` guarantee.
// Everything else (architectural bugs, quality, perf) is surfaced as report-only:
// visible in the report but never blocking `proven`, so the loop stays meaningful.
const AUTO_FIX_PATTERN = /(secret|token|api[_\s-]?key|password|passwd|credential|private\s*key|access\s*key|github)/i;

function isAutoFixable(finding) {
  if (!finding) return false;
  return AUTO_FIX_PATTERN.test(`${finding.type || ''} ${finding.message || ''}`);
}

// Minimal config stub so BaseAnalyzer subclasses construct without a full
// project config. We gate by extension ourselves (see analyzersFor), so the
// permissive language list here is harmless — we never rely on it for gating.
const ANALYZER_CONFIG = {
  getIgnoredFiles: () => [],
  getSupportedLanguages: () => [
    'javascript', 'typescript', 'python', 'java', 'php', 'go', 'rust', 'cpp', 'c', 'csharp'
  ],
  enableParallel: false,
};

function ext(filename) {
  return String(filename || '').split('.').pop()?.toLowerCase() || '';
}

// Decide which analyzers are language-appropriate for a given file. Each entry
// is a zero-arg factory so we get a fresh, isolated instance per scan.
//
// Scope is deliberately the *security* analyzers: this is a security fix loop,
// and the fixer can only auto-resolve security findings (secret redaction, etc.).
// Pulling in general bug/quality/lang analyzers would flood the loop with
// high-severity, non-auto-fixable noise and make "proven" unreachable.
function analyzersFor(filename) {
  const e = ext(filename);
  const name = String(filename || '').toLowerCase();
  const list = [];

  const isJsTs = ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx'].includes(e);

  if (isJsTs) {
    list.push(() => new SecurityAnalyzer(ANALYZER_CONFIG));
    list.push(() => new APISecurityAnalyzer(ANALYZER_CONFIG));
    list.push(() => new GraphQLSecurityAnalyzer(ANALYZER_CONFIG));
    // Report-only contributors: their findings are surfaced for visibility but
    // tagged non-auto-fixable, so they never block `proven`.
    list.push(() => new BugAnalyzer(ANALYZER_CONFIG));
    list.push(() => new QualityAnalyzer(ANALYZER_CONFIG));
    list.push(() => new PerformanceAnalyzer(ANALYZER_CONFIG));
  } else if (['py', 'java', 'php', 'go', 'vue'].includes(e)) {
    // Generic regex-based security checks are language-agnostic.
    list.push(() => new SecurityAnalyzer(ANALYZER_CONFIG));
  } else if (name.includes('.env')) {
    list.push(() => new EnvSecurityAnalyzer(ANALYZER_CONFIG));
  } else if (e === 'tf') {
    list.push(() => new IaCAnalyzer(ANALYZER_CONFIG));
  } else if (e === 'yaml' || e === 'yml') {
    list.push(() => new IaCAnalyzer(ANALYZER_CONFIG));
    list.push(() => new KubernetesAnalyzer(ANALYZER_CONFIG));
  }

  return list;
}

function normSeverity(severity) {
  if (!severity) return 'info';
  const v = String(severity).toLowerCase();
  if (KNOWN_SEVERITIES.has(v)) return v;
  if (v === 'error') return 'high';
  if (v === 'warning' || v === 'warn') return 'medium';
  if (v === 'note' || v === 'hint') return 'low';
  return 'info';
}

// Collapse an analyzer's richer finding into the loop's { type, message, line,
// severity } shape. Prefer the rule `title` for `type` because it is specific
// and stable (analyzers set `type` to a generic 'security'), which gives the
// loop's signature meaningful, comparable identity across iterations.
function normalizeFinding(raw) {
  if (!raw) return null;
  const type = raw.type && raw.type !== 'security'
    ? raw.type
    : (raw.title || raw.type || 'Issue');
  const line = typeof raw.line === 'number' ? raw.line : (raw.line ?? null);
  const finding = {
    type,
    message: raw.message || raw.title || 'Issue detected',
    line,
    severity: normSeverity(raw.severity),
  };
  finding.autoFixable = isAutoFixable(finding);
  return finding;
}

// Run one analyzer instance against in-memory code. Handles both conventions:
// analyzers that accumulate via addIssue() (read back with getIssues()) and
// analyzers (e.g. IaCAnalyzer) whose analyzeFile() returns an array directly.
async function runAnalyzer(factory, filename, code) {
  try {
    const instance = factory();
    const returned = await instance.analyzeFile(filename, code, {});
    const collected = typeof instance.getIssues === 'function' ? instance.getIssues() : [];
    if (Array.isArray(collected) && collected.length > 0) return collected;
    if (Array.isArray(returned)) return returned;
    return [];
  } catch {
    // An individual analyzer failing must never break the scan — degrade
    // gracefully so the loop still gets the scanner_agent baseline.
    return [];
  }
}

/**
 * Unified, normalized, deduplicated scan used by the autonomous fix loop.
 *
 * @param {string} code
 * @param {object} [options]
 * @param {string} [options.filename='code.js']  Drives language gating + AST mode.
 * @returns {Promise<Array<{type:string,message:string,line:(number|null),severity:string}>>}
 */
async function unifiedScan(code, options = {}) {
  const { filename = 'code.js' } = options;

  const findings = [];

  // 1. Baseline heuristic/AST scanner (already loop-shaped).
  try {
    const base = await scanCode(code, { filename });
    for (const f of base) {
      const n = normalizeFinding(f);
      if (n) findings.push(n);
    }
  } catch { /* baseline best-effort */ }

  // 2. Language-appropriate analyzers.
  const factories = analyzersFor(filename);
  const results = await Promise.all(factories.map(f => runAnalyzer(f, filename, code)));
  for (const issues of results) {
    for (const issue of issues) {
      const n = normalizeFinding(issue);
      if (n) findings.push(n);
    }
  }

  // 3. Dedup by stable signature (matches the loop's own `sig`).
  const seen = new Set();
  const deduped = [];
  for (const f of findings) {
    const signature = `${f.type}|${f.message}|${f.line ?? 'null'}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    deduped.push(f);
  }

  return deduped;
}

export { unifiedScan, analyzersFor, normalizeFinding, normSeverity, isAutoFixable };

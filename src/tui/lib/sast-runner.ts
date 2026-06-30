/**
 * SAST Runner — detects and runs static analysis security tools available
 * in the user's project, then returns structured findings that can be merged
 * with the AI review prompt.
 *
 * Tools supported:
 *  - ESLint (security rules, if eslint binary found in node_modules/.bin)
 *  - Semgrep (if installed in PATH)
 *  - Secret scanning (always runs — no external tool needed)
 *  - npm audit (if package.json exists)
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { globSync } from 'glob';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SastFinding = {
  tool: 'eslint' | 'semgrep' | 'secrets' | 'npm-audit' | 'bandit' | 'gosec' | 'hadolint' | 'clippy' | 'custom';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  file?: string;
  line?: number;
  rule?: string;
  message: string;
  suggestion?: string;
};

export type SastRunResult = {
  findings: SastFinding[];
  toolsRun: string[];
  errors: string[];
  durationMs: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function exec(cmd: string, options: { timeout?: number; cwd?: string } = {}): string {
  return execSync(cmd, {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: options.timeout ?? 30_000,
    cwd: options.cwd,
  });
}

function tryExec(cmd: string, options: { timeout?: number; cwd?: string } = {}): { stdout: string; error: string | null } {
  try {
    const stdout = exec(cmd, options);
    return { stdout, error: null };
  } catch (e: any) {
    // execSync throws when exit code != 0; the output is still useful (e.g. eslint/semgrep write findings on stderr or stdout)
    const stdout: string =
      (e?.stdout as string) ||
      (e?.output?.filter(Boolean).join('') as string) ||
      '';
    const msg = e?.message || String(e);
    const isTimeout = msg.includes('timeout') || e?.code === 'ETIMEDOUT' || msg.includes('ETIMEDOUT');
    return { stdout, error: isTimeout ? `TIMEOUT after ${options.timeout || 30000}ms: ${msg}` : msg };
  }
}

export function severityFromString(s: string): SastFinding['severity'] {
  const lower = s.toLowerCase();
  if (lower === 'critical') return 'critical';
  if (lower === 'high' || lower === 'error' || lower === '2') return 'high';
  if (lower === 'medium' || lower === 'moderate' || lower === 'warning' || lower === '1') return 'medium';
  if (lower === 'low' || lower === 'info' || lower === '0') return 'low';
  return 'info';
}

// ─── 1. ESLint ────────────────────────────────────────────────────────────────

function runEslint(cwd: string): { findings: SastFinding[]; error: string | null; ran: boolean } {
  const eslintBin = join(cwd, 'node_modules', '.bin', 'eslint');
  if (!existsSync(eslintBin)) {
    return { findings: [], error: null, ran: false };
  }

  const hasEslintRc =
    existsSync(join(cwd, '.eslintrc')) ||
    existsSync(join(cwd, '.eslintrc.js')) ||
    existsSync(join(cwd, '.eslintrc.cjs')) ||
    existsSync(join(cwd, '.eslintrc.json')) ||
    existsSync(join(cwd, '.eslintrc.yaml')) ||
    existsSync(join(cwd, '.eslintrc.yml')) ||
    (() => {
      try {
        const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8'));
        return Boolean(pkg.eslintConfig);
      } catch {
        return false;
      }
    })();

  let cmd: string;
  if (hasEslintRc) {
    cmd = `"${eslintBin}" . --format json --ext .ts,.tsx,.js,.jsx,.mjs,.cjs`;
  } else {
    // Minimal security ruleset when no config exists
    const rules = JSON.stringify({
      'no-eval': ['error'],
      'no-implied-eval': ['error'],
      'no-new-func': ['error'],
      'no-script-url': ['error'],
    });
    cmd = `"${eslintBin}" . --format json --no-eslintrc --rule '${rules}' --ext .ts,.tsx,.js,.jsx,.mjs,.cjs`;
  }

  const { stdout, error } = tryExec(cmd, { cwd, timeout: 60_000 });
  if (!stdout.trim()) {
    return { findings: [], error, ran: true };
  }

  const findings: SastFinding[] = [];
  try {
    const results: Array<{
      filePath: string;
      messages: Array<{
        ruleId: string | null;
        severity: number;
        message: string;
        line?: number;
        endLine?: number;
        fix?: { text: string };
      }>;
    }> = JSON.parse(stdout);

    for (const file of results) {
      for (const msg of file.messages) {
        findings.push({
          tool: 'eslint',
          severity: msg.severity === 2 ? 'high' : msg.severity === 1 ? 'medium' : 'low',
          file: file.filePath.replace(cwd + '/', '').replace(cwd, ''),
          line: msg.line,
          rule: msg.ruleId ?? undefined,
          message: msg.message,
          suggestion: msg.fix?.text ? `Auto-fix available: ${msg.fix.text.slice(0, 120)}` : undefined,
        });
      }
    }
  } catch (parseErr) {
    return { findings, error: `ESLint JSON parse failed: ${parseErr}`, ran: true };
  }

  return { findings, error, ran: true };
}

// ─── 2. Semgrep ───────────────────────────────────────────────────────────────

function runSemgrep(cwd: string): { findings: SastFinding[]; error: string | null; ran: boolean } {
  // Check if semgrep is in PATH
  const { error: whichError } = tryExec('which semgrep');
  if (whichError) {
    return { findings: [], error: null, ran: false };
  }

  const { stdout, error } = tryExec('semgrep --config=auto --json .', { cwd, timeout: 30_000 });
  if (!stdout.trim()) {
    return { findings: [], error, ran: true };
  }

  const findings: SastFinding[] = [];
  try {
    const result: {
      results: Array<{
        check_id: string;
        path: string;
        start: { line: number };
        extra: {
          severity?: string;
          message: string;
          fix?: string;
          metadata?: { severity?: string };
        };
      }>;
    } = JSON.parse(stdout);

    for (const r of result.results ?? []) {
      const rawSev = r.extra?.severity ?? r.extra?.metadata?.severity ?? 'info';
      findings.push({
        tool: 'semgrep',
        severity: severityFromString(rawSev),
        file: r.path,
        line: r.start?.line,
        rule: r.check_id,
        message: r.extra?.message ?? r.check_id,
        suggestion: r.extra?.fix ? `Suggested fix: ${r.extra.fix.slice(0, 200)}` : undefined,
      });
    }
  } catch (parseErr) {
    return { findings, error: `Semgrep JSON parse failed: ${parseErr}`, ran: true };
  }

  return { findings, error, ran: true };
}

// ─── 3. Secret scanning ───────────────────────────────────────────────────────

const SECRET_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
  severity: SastFinding['severity'];
  suggestion: string;
}> = [
  {
    name: 'hardcoded-credential',
    pattern: /(password|passwd|secret|api_key|apikey|token|auth_token|access_token)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
    severity: 'critical',
    suggestion: 'Move credentials to environment variables or a secrets manager. Never commit credentials.',
  },
  {
    name: 'openai-api-key',
    pattern: /sk-[A-Za-z0-9]{20,}/g,
    severity: 'critical',
    suggestion: 'Revoke this OpenAI API key immediately and rotate it. Use environment variables instead.',
  },
  {
    name: 'stripe-live-key',
    pattern: /sk_live_[A-Za-z0-9]{20,}/g,
    severity: 'critical',
    suggestion: 'Revoke this Stripe live key immediately. Use environment variables.',
  },
  {
    name: 'aws-access-key',
    pattern: /AKIA[A-Z0-9]{16}/g,
    severity: 'critical',
    suggestion: 'Revoke this AWS access key immediately. Use IAM roles or environment variables.',
  },
  {
    name: 'github-token',
    pattern: /(ghp_|ghs_|github_pat_)[A-Za-z0-9]{10,}/g,
    severity: 'critical',
    suggestion: 'Revoke this GitHub token immediately. Use environment variables or GitHub secrets.',
  },
  {
    name: 'private-key-header',
    pattern: /-----BEGIN (RSA|EC|DSA|OPENSSH|PGP) PRIVATE KEY-----/g,
    severity: 'critical',
    suggestion: 'Private keys should never be committed. Remove and rotate the key immediately.',
  },
  {
    name: 'generic-secret-token',
    pattern: /(sk-|sk_live_|AKIA|ghp_|ghs_|github_pat_)[A-Za-z0-9]{10,}/g,
    severity: 'high',
    suggestion: 'This looks like a service API key. Move it to environment variables.',
  },
];

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.env', '.yaml', '.yml', '.toml']);
const EXCLUDE_DIRS = /(node_modules|\.git|dist|build|\.next|\.nuxt|coverage)/;

function getTrackedFiles(cwd: string): string[] {
  const { stdout, error } = tryExec('git ls-files', { cwd });
  if (error && !stdout) return [];
  return stdout
    .split('\n')
    .map(f => f.trim())
    .filter(Boolean)
    .filter(f => {
      if (EXCLUDE_DIRS.test(f)) return false;
      const ext = f.slice(f.lastIndexOf('.'));
      return SCAN_EXTENSIONS.has(ext);
    });
}

function runSecretScan(cwd: string): { findings: SastFinding[]; error: string | null } {
  const files = getTrackedFiles(cwd);
  const findings: SastFinding[] = [];
  const seen = new Set<string>(); // deduplicate

  for (const relPath of files) {
    const absPath = join(cwd, relPath);
    let content: string;
    try {
      content = readFileSync(absPath, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n');

    for (const { name, pattern, severity, suggestion } of SECRET_PATTERNS) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;

      let match: RegExpExecArray | null;
      // Find which line each match is on
      while ((match = pattern.exec(content)) !== null) {
        const matchStart = match.index;
        // Count newlines up to matchStart to find line number
        let lineNum = 1;
        for (let i = 0; i < matchStart; i++) {
          if (content[i] === '\n') lineNum++;
        }

        const key = `${relPath}:${lineNum}:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const lineText = lines[lineNum - 1] ?? '';
        const snippet = lineText.trim().slice(0, 80);

        findings.push({
          tool: 'secrets',
          severity,
          file: relPath,
          line: lineNum,
          rule: name,
          message: `Potential secret detected (pattern: ${name}) — \`${snippet}\``,
          suggestion,
        });
      }

      pattern.lastIndex = 0;
    }
  }

  return { findings, error: null };
}

// ─── 5. Bandit (Python) ────────────────────────────────────────────────────────

function findBinary(name: string): string | null {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const { error } = tryExec(`${cmd} ${name}`);
  return error ? null : name;
}

/** Check if the directory has any files matching the given extension(s) */
function hasMatchingFiles(cwd: string, exts: string[]): boolean {
  const { stdout } = tryExec(`git ls-files 2>/dev/null || echo .`, { cwd });
  if (!stdout) return false;
  return stdout.split('\n').some(f =>
    exts.some(ext => f.trim().endsWith(ext))
  );
}

function runBandit(cwd: string): { findings: SastFinding[]; error: string | null; ran: boolean } {
  if (!findBinary('bandit')) {
    return { findings: [], error: null, ran: false };
  }
  if (!hasMatchingFiles(cwd, ['.py', '.pyw'])) {
    return { findings: [], error: null, ran: false };
  }

  const { stdout, error } = tryExec('bandit -r . -f json --quiet 2>/dev/null || true', { cwd, timeout: 120_000 });
  if (!stdout.trim()) {
    return { findings: [], error, ran: true };
  }

  const findings: SastFinding[] = [];
  try {
    // bandit may wrap output in `|| true` — extract the first JSON object
    const jsonStart = stdout.indexOf('{');
    const jsonEnd = stdout.lastIndexOf('}') + 1;
    if (jsonStart === -1 || jsonEnd <= jsonStart) {
      return { findings, error: 'No JSON in bandit output', ran: true };
    }
    const parsed = JSON.parse(stdout.slice(jsonStart, jsonEnd));
    const results: Array<{
      filename: string;
      line_number: number;
      line_range?: number[];
      issue_severity: string;
      issue_confidence: string;
      test_id: string;
      test_name: string;
      issue_text: string;
      more_info?: string;
    }> = parsed.results ?? [];

    for (const r of results) {
      const rawSev = r.issue_severity || 'MEDIUM';
      const rawConf = r.issue_confidence || 'MEDIUM';
      // Only include HIGH/MEDIUM confidence findings to reduce noise
      if (rawConf !== 'HIGH' && rawConf !== 'MEDIUM') continue;
      if (rawSev === 'LOW') continue;

      findings.push({
        tool: 'bandit',
        severity: rawSev === 'HIGH' ? 'high' : rawSev === 'MEDIUM' ? 'medium' : 'low',
        file: r.filename,
        line: r.line_number,
        rule: r.test_id ? `bandit:${r.test_id}` : `bandit:${r.test_name}`,
        message: r.issue_text || `${r.test_name} (${r.test_id})`,
        suggestion: r.more_info ? `See: ${r.more_info}` : 'Review the flagged code for security issues.',
      });
    }
  } catch (parseErr) {
    return { findings, error: `Bandit JSON parse failed: ${parseErr}`, ran: true };
  }

  return { findings, error, ran: true };
}

// ─── 6. Gosec (Go) ────────────────────────────────────────────────────────────

function runGosec(cwd: string): { findings: SastFinding[]; error: string | null; ran: boolean } {
  if (!findBinary('gosec')) {
    return { findings: [], error: null, ran: false };
  }
  if (!hasMatchingFiles(cwd, ['.go'])) {
    return { findings: [], error: null, ran: false };
  }

  const { stdout, error } = tryExec('gosec -fmt=json ./... 2>/dev/null || true', { cwd, timeout: 120_000 });
  if (!stdout.trim()) {
    return { findings: [], error, ran: true };
  }

  const findings: SastFinding[] = [];
  try {
    const jsonStart = stdout.indexOf('{');
    const jsonEnd = stdout.lastIndexOf('}') + 1;
    if (jsonStart === -1 || jsonEnd <= jsonStart) {
      return { findings, error: 'No JSON in gosec output', ran: true };
    }
    const parsed = JSON.parse(stdout.slice(jsonStart, jsonEnd));
    const issues: Array<{
      severity: string;
      confidence: string;
      cwe?: { ID?: string };
      rule_id: string;
      details: string;
      file: string;
      line: string;
      column?: string;
    }> = parsed.Issues ?? [];

    for (const issue of issues) {
      const sev = issue.severity?.toLowerCase() || 'medium';
      const conf = issue.confidence?.toLowerCase() || 'medium';
      if (conf === 'low' || sev === 'low') continue;

      findings.push({
        tool: 'gosec',
        severity: sev === 'high' ? 'high' : 'medium',
        file: issue.file,
        line: parseInt(issue.line, 10) || undefined,
        rule: `gosec:${issue.rule_id}`,
        message: issue.details,
        suggestion: issue.cwe?.ID ? `CWE-${issue.cwe.ID}: https://cwe.mitre.org/data/definitions/${issue.cwe.ID}.html` : undefined,
      });
    }
  } catch (parseErr) {
    return { findings, error: `Gosec JSON parse failed: ${parseErr}`, ran: true };
  }

  return { findings, error, ran: true };
}

// ─── 7. Hadolint (Docker) ──────────────────────────────────────────────────────

function runHadolint(cwd: string): { findings: SastFinding[]; error: string | null; ran: boolean } {
  if (!findBinary('hadolint')) {
    return { findings: [], error: null, ran: false };
  }

  // Find Dockerfiles using Node.js glob (cross-platform)
  let dockerFiles: string[] = [];
  try {
    // Look for files matching Dockerfile pattern
    dockerFiles = globSync('**/Dockerfile*', {
      cwd,
      nodir: true,
      ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
    });
    // Also match lowercase 'dockerfile' (common on some platforms)
    if (dockerFiles.length === 0) {
      dockerFiles = globSync('**/dockerfile*', {
        cwd,
        nodir: true,
        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
      });
    }
  } catch {
    return { findings: [], error: null, ran: false };
  }

  if (dockerFiles.length === 0) {
    return { findings: [], error: null, ran: false };
  }

  const findings: SastFinding[] = [];
  let lastError: string | null = null;

  for (const df of dockerFiles) {
    const absPath = join(cwd, df);
    const { stdout, error } = tryExec(`hadolint --format json "${absPath}" 2>/dev/null || true`, { cwd, timeout: 30_000 });
    if (error) lastError = error;
    if (!stdout.trim()) continue;

    try {
      const jsonStart = stdout.indexOf('[');
      const jsonEnd = stdout.lastIndexOf(']') + 1;
      if (jsonStart === -1 || jsonEnd <= jsonStart) continue;

      const results: Array<{
        code: string;
        line: number;
        column?: number;
        level: string;
        message: string;
        file?: string;
      }> = JSON.parse(stdout.slice(jsonStart, jsonEnd));

      for (const r of results) {
        const level = r.level?.toLowerCase() || 'info';
        if (level === 'info' || level === 'style') continue;

        findings.push({
          tool: 'hadolint',
          severity: level === 'error' ? 'high' : 'medium',
          file: r.file && r.file !== '-' ? r.file : df,
          line: r.line,
          rule: `hadolint:${r.code}`,
          message: r.message,
          suggestion: `Rule ${r.code} — https://github.com/hadolint/hadolint/wiki/${r.code}`,
        });
      }
    } catch (parseErr) {
      lastError = `Hadolint JSON parse failed for ${df}: ${parseErr}`;
    }
  }

  return { findings, error: lastError, ran: true };
}

// ─── 8. Clippy (Rust) ──────────────────────────────────────────────────────────

function runClippy(cwd: string): { findings: SastFinding[]; error: string | null; ran: boolean } {
  if (!findBinary('cargo')) {
    return { findings: [], error: null, ran: false };
  }
  if (!hasMatchingFiles(cwd, ['.rs', 'Cargo.toml', 'Cargo.lock'])) {
    return { findings: [], error: null, ran: false };
  }

  const { stdout, error } = tryExec('cargo clippy --message-format=json 2>/dev/null || true', { cwd, timeout: 180_000 });
  if (!stdout.trim()) {
    return { findings: [], error, ran: true };
  }

  const findings: SastFinding[] = [];
  try {
    // Cargo outputs one JSON object per line (NDJSON)
    const lines = stdout.split('\n').filter(l => l.trim().startsWith('{'));

    for (const line of lines) {
      let parsed: {
        message?: {
          message?: string;
          level?: string;
          code?: { code?: string };
          spans?: Array<{ file_name?: string; line_start?: number; column_start?: number }>;
        };
        reason?: string;
      };
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      // Only process diagnostic messages (not compiler artifact messages)
      if (!parsed.message || parsed.reason === 'compiler-artifact') continue;

      const msg = parsed.message;
      const level = msg.level?.toLowerCase() || '';

      // Only include warnings and errors, not notes/help
      if (level !== 'warning' && level !== 'error') continue;

      const clippyCode = msg.code?.code || '';
      // Skip non-clippy diagnostics
      if (!clippyCode.startsWith('clippy::')) continue;

      const span = msg.spans?.[0];

      findings.push({
        tool: 'clippy',
        severity: level === 'error' ? 'medium' : 'low',
        file: span?.file_name,
        line: span?.line_start,
        rule: clippyCode,
        message: msg.message || '',
        suggestion: clippyCode
          ? `See: https://rust-lang.github.io/rust-clippy/master/index.html#${clippyCode.replace('::', '/')}`
          : 'Review the flagged code.',
      });
    }
  } catch (parseErr) {
    return { findings, error: `Clippy parse failed: ${parseErr}`, ran: true };
  }

  return { findings, error: null, ran: true };
}

// ─── 4. npm audit ─────────────────────────────────────────────────────────────

function runNpmAudit(cwd: string): { findings: SastFinding[]; error: string | null; ran: boolean } {
  if (!existsSync(join(cwd, 'package.json'))) {
    return { findings: [], error: null, ran: false };
  }

  const { stdout, error } = tryExec('npm audit --json', { cwd, timeout: 60_000 });
  if (!stdout.trim()) {
    return { findings: [], error, ran: true };
  }

  const findings: SastFinding[] = [];
  try {
    const result: {
      vulnerabilities?: Record<string, {
        name: string;
        severity: string;
        via: Array<string | { title?: string; url?: string; severity?: string }>;
        fixAvailable: boolean | { name: string; version: string };
        nodes?: string[];
      }>;
      // older npm audit format
      advisories?: Record<string, {
        module_name: string;
        severity: string;
        title: string;
        url: string;
        recommendation: string;
        findings: Array<{ paths: string[] }>;
      }>;
    } = JSON.parse(stdout);

    // npm v7+ format
    if (result.vulnerabilities) {
      for (const [, vuln] of Object.entries(result.vulnerabilities)) {
        const sev = severityFromString(vuln.severity);
        if (sev === 'low' || sev === 'info') continue; // skip low/info to reduce noise

        const viaText = vuln.via
          .map(v => (typeof v === 'string' ? v : v.title ?? v.url ?? ''))
          .filter(Boolean)
          .join(', ');

        const fixText = typeof vuln.fixAvailable === 'object'
          ? `Run: npm install ${vuln.fixAvailable.name}@${vuln.fixAvailable.version}`
          : vuln.fixAvailable
          ? 'Run: npm audit fix'
          : 'No automatic fix available — check for a patch or alternative package.';

        findings.push({
          tool: 'npm-audit',
          severity: sev,
          rule: `npm:${vuln.name}`,
          message: `Vulnerable dependency: ${vuln.name}${viaText ? ` — ${viaText}` : ''}`,
          suggestion: fixText,
        });
      }
    } else if (result.advisories) {
      // npm v6 format
      for (const [, adv] of Object.entries(result.advisories)) {
        const sev = severityFromString(adv.severity);
        if (sev === 'low' || sev === 'info') continue;

        findings.push({
          tool: 'npm-audit',
          severity: sev,
          rule: `npm:${adv.module_name}`,
          message: `${adv.module_name}: ${adv.title} — ${adv.url}`,
          suggestion: adv.recommendation,
        });
      }
    }
  } catch (parseErr) {
    return { findings, error: `npm audit JSON parse failed: ${parseErr}`, ran: true };
  }

  return { findings, error, ran: true };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

function loadDismissedKeys(): Set<string> {
  try {
    const fp = join(process.cwd(), '.sentinel', 'dismissed.json');
    if (!existsSync(fp)) return new Set();
    const data = JSON.parse(readFileSync(fp, 'utf-8'));
    return new Set(Object.keys(data.dismissals || {}));
  } catch {
    return new Set();
  }
}

export function filterDismissed(findings: SastFinding[]): SastFinding[] {
  const dismissed = loadDismissedKeys();
  if (dismissed.size === 0) return findings;
  return findings.filter(f => {
    const key = `${f.file || ''}:${f.line || 0}:${f.rule || ''}`;
    return !dismissed.has(key);
  });
}

/**
 * Run SAST using the new orchestrator (50+ tools).
 * Falls back to legacy runSast if orchestrator fails.
 */
export async function runSastOrchestrator(options: {
  target?: string;
  files?: string[];
  tools?: string[];
  disabledTools?: string[];
} = {}): Promise<SastRunResult> {
  const startTime = Date.now();
  const cwd = resolve(options.target ?? process.cwd());

  try {
    // Dynamic import of the ESM orchestrator
    const { SastOrchestrator } = await import('../../sast/sastOrchestrator.js');
    const orchestrator = new SastOrchestrator({
      cwd,
      enabledTools: options.tools || null,
      disabledTools: options.disabledTools || [],
    });

    // Get files to analyze
    let files = options.files || [];
    if (files.length === 0) {
      const { globSync } = await import('glob');
      files = globSync('**/*.{js,ts,jsx,tsx,py,go,java,kt,rs,rb,php,sh,sql,tf,yaml,yml}', {
        cwd,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
      });
    }

    const result = await orchestrator.analyze(files, { cwd });

    // Map findings to SastFinding format
    const findings: SastFinding[] = result.findings.map(f => ({
      tool: f.tool as SastFinding['tool'],
      severity: f.severity as SastFinding['severity'],
      file: f.file,
      line: f.line,
      rule: f.rule,
      message: f.message,
      suggestion: f.suggestion,
    }));

    return {
      findings: filterDismissed(findings),
      toolsRun: result.toolsRun,
      errors: result.errors,
      durationMs: Date.now() - startTime,
    };
  } catch {
    // Fall back to legacy runner
    return runSast({ target: cwd, tools: options.tools });
  }
}

export async function runSast(options: { target?: string; tools?: string[] } = {}): Promise<SastRunResult> {
  const startTime = Date.now();
  const cwd = resolve(options.target ?? process.cwd());
  const enabledTools = options.tools ?? ['eslint', 'semgrep', 'secrets', 'npm-audit', 'bandit', 'gosec', 'hadolint', 'clippy'];

  const findings: SastFinding[] = [];
  const toolsRun: string[] = [];
  const errors: string[] = [];

  // Run ESLint
  if (enabledTools.includes('eslint')) {
    const { findings: ef, error, ran } = runEslint(cwd);
    if (ran) {
      toolsRun.push('eslint');
      findings.push(...ef);
      if (error) errors.push(`eslint: ${error}`);
    }
  }

  // Run Semgrep
  if (enabledTools.includes('semgrep')) {
    const { findings: sf, error, ran } = runSemgrep(cwd);
    if (ran) {
      toolsRun.push('semgrep');
      findings.push(...sf);
      if (error) errors.push(`semgrep: ${error}`);
    }
  }

  // Run secret scanning (always available)
  if (enabledTools.includes('secrets')) {
    toolsRun.push('secrets');
    const { findings: secf, error } = runSecretScan(cwd);
    findings.push(...secf);
    if (error) errors.push(`secrets: ${error}`);
  }

  // Run npm audit
  if (enabledTools.includes('npm-audit')) {
    const { findings: nf, error, ran } = runNpmAudit(cwd);
    if (ran) {
      toolsRun.push('npm-audit');
      findings.push(...nf);
      if (error) errors.push(`npm-audit: ${error}`);
    }
  }

  // Run Bandit (Python)
  if (enabledTools.includes('bandit')) {
    const { findings: bf, error, ran } = runBandit(cwd);
    if (ran) {
      toolsRun.push('bandit');
      findings.push(...bf);
      if (error) errors.push(`bandit: ${error}`);
    }
  }

  // Run Gosec (Go)
  if (enabledTools.includes('gosec')) {
    const { findings: gf, error, ran } = runGosec(cwd);
    if (ran) {
      toolsRun.push('gosec');
      findings.push(...gf);
      if (error) errors.push(`gosec: ${error}`);
    }
  }

  // Run Hadolint (Docker)
  if (enabledTools.includes('hadolint')) {
    const { findings: hf, error, ran } = runHadolint(cwd);
    if (ran) {
      toolsRun.push('hadolint');
      findings.push(...hf);
      if (error) errors.push(`hadolint: ${error}`);
    }
  }

  // Run Clippy (Rust)
  if (enabledTools.includes('clippy')) {
    const { findings: cf, error, ran } = runClippy(cwd);
    if (ran) {
      toolsRun.push('clippy');
      findings.push(...cf);
      if (error) errors.push(`clippy: ${error}`);
    }
  }

  // Sort findings: critical first
  const severityOrder: Record<SastFinding['severity'], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    findings: filterDismissed(findings),
    toolsRun,
    errors,
    durationMs: Date.now() - startTime,
  };
}

// ─── Prompt formatter ─────────────────────────────────────────────────────────

const SEVERITY_ICONS: Record<SastFinding['severity'], string> = {
  critical: '🔴 Critical',
  high: '🟠 High',
  medium: '🟡 Medium',
  low: '🟢 Low',
  info: '⚪ Info',
};

export function formatSastForPrompt(result: SastRunResult): string {
  if (result.findings.length === 0 && result.toolsRun.length === 0) {
    return '';
  }

  const lines: string[] = [
    '## SAST Pre-Scan Results',
    '',
    `**Tools run:** ${result.toolsRun.length > 0 ? result.toolsRun.join(', ') : 'none'}`,
    `**Findings:** ${result.findings.length} issue${result.findings.length !== 1 ? 's' : ''}`,
  ];

  if (result.errors.length > 0) {
    lines.push(`**Errors:** ${result.errors.join('; ')}`);
  }

  if (result.findings.length === 0) {
    lines.push('', 'No issues found by static analysis tools.');
    return lines.join('\n');
  }

  lines.push('');

  // Group by severity
  const groups: Partial<Record<SastFinding['severity'], SastFinding[]>> = {};
  for (const finding of result.findings) {
    if (!groups[finding.severity]) groups[finding.severity] = [];
    groups[finding.severity]!.push(finding);
  }

  const orderedSeverities: SastFinding['severity'][] = ['critical', 'high', 'medium', 'low', 'info'];

  for (const sev of orderedSeverities) {
    const group = groups[sev];
    if (!group || group.length === 0) continue;

    lines.push(`### ${SEVERITY_ICONS[sev]}`);
    for (const f of group) {
      const loc = f.file ? `${f.file}${f.line ? `:${f.line}` : ''}` : '';
      const tool = `[${f.tool}]`;
      const rule = f.rule ? ` (${f.rule})` : '';
      const location = loc ? ` ${loc} —` : '';
      lines.push(`- ${tool}${location} ${f.message}${rule}`);
      if (f.suggestion) {
        lines.push(`  💡 ${f.suggestion}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

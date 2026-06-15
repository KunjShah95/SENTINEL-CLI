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

// ─── Types ────────────────────────────────────────────────────────────────────

export type SastFinding = {
  tool: 'eslint' | 'semgrep' | 'secrets' | 'npm-audit' | 'custom';
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

function severityFromString(s: string): SastFinding['severity'] {
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

function filterDismissed(findings: SastFinding[]): SastFinding[] {
  const dismissed = loadDismissedKeys();
  if (dismissed.size === 0) return findings;
  return findings.filter(f => {
    const key = `${f.file || ''}:${f.line || 0}:${f.rule || ''}`;
    return !dismissed.has(key);
  });
}

export async function runSast(options: { target?: string; tools?: string[] } = {}): Promise<SastRunResult> {
  const startTime = Date.now();
  const cwd = resolve(options.target ?? process.cwd());
  const enabledTools = options.tools ?? ['eslint', 'semgrep', 'secrets', 'npm-audit'];

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

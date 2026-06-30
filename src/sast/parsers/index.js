/**
 * SAST Output Parsers
 *
 * Normalizes output from 50+ SAST tools into a unified finding format.
 * Each parser handles tool-specific JSON/text output formats.
 */

/**
 * Unified finding format.
 */
function createFinding(tool, severity, file, line, rule, message, suggestion) {
  return {
    tool,
    severity: normalizeSeverity(severity),
    file: file || undefined,
    line: line ? parseInt(line) : undefined,
    rule: rule || undefined,
    message: message || 'Unknown issue',
    suggestion: suggestion || undefined,
  };
}

function normalizeSeverity(severity) {
  if (!severity) return 'medium';
  const s = String(severity).toLowerCase();
  if (/crit|block|fatal/.test(s)) return 'critical';
  if (/high|error|danger/.test(s)) return 'high';
  if (/med|warn/.test(s)) return 'medium';
  if (/low|note|info|style/.test(s)) return 'low';
  return 'medium';
}

// ─── Individual Parsers ──────────────────────────────────────────────────────

export function parseESLint(output) {
  try {
    const data = JSON.parse(output);
    const findings = [];
    for (const file of data) {
      for (const msg of file.messages || []) {
        findings.push(createFinding(
          'eslint', msg.severity >= 2 ? 'high' : 'medium',
          file.filePath, msg.line, msg.ruleId, msg.message, msg.fix ? 'Auto-fix available' : undefined
        ));
      }
    }
    return findings;
  } catch { return []; }
}

export function parseBiome(output) {
  try {
    const data = JSON.parse(output);
    return (data.diagnostics || data.files || []).map(d => createFinding(
      'biome', d.severity || d.category, d.file?.path, d.file?.line,
      d.category, d.message || d.description, d.suggestion
    ));
  } catch { return []; }
}

export function parseRuff(output) {
  try {
    const data = JSON.parse(output);
    return data.map(d => createFinding(
      'ruff', d.code ? 'medium' : 'low', d.filename || d.location?.row,
      d.location?.row || d.line, d.code, d.message, d.fix ? 'Fix available' : undefined
    ));
  } catch { return []; }
}

export function parseGolangciLint(output) {
  try {
    const data = JSON.parse(output);
    return (data.Issues || []).map(issue => createFinding(
      'golangci-lint', issue.Severity || 'medium',
      issue.Pos?.Filename, issue.Pos?.Line,
      issue.FromLinter, issue.Text
    ));
  } catch { return []; }
}

export function parseBandit(output) {
  try {
    const data = JSON.parse(output);
    return (data.results || []).map(r => createFinding(
      'bandit', r.issue_severity, r.filename, r.line_number,
      r.test_id, r.issue_text
    ));
  } catch { return []; }
}

export function parseSemgrep(output) {
  try {
    const data = JSON.parse(output);
    return (data.results || []).map(r => createFinding(
      'semgrep', r.extra?.severity || 'medium',
      r.path, r.start?.line, r.check_id, r.extra?.message
    ));
  } catch { return []; }
}

export function parseHadolint(output) {
  try {
    const data = JSON.parse(output);
    return data.map(d => createFinding(
      'hadolint', d.level, 'Dockerfile', d.line, d.code, d.message
    ));
  } catch { return []; }
}

export function parseShellCheck(output) {
  try {
    const data = JSON.parse(output);
    return data.map(d => createFinding(
      'shellcheck', d.level, d.file, d.line, `SC${d.code}`, d.message, d.fix ? d.fix : undefined
    ));
  } catch { return []; }
}

export function parseClippy(output) {
  const findings = [];
  const lines = output.split('\n');
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (msg.reason === 'compiler-message' && msg.message?.code) {
        const span = msg.message.spans?.[0];
        findings.push(createFinding(
          'clippy', msg.message.level === 'error' ? 'high' : 'medium',
          span?.file_name, span?.line_start,
          msg.message.code?.code, msg.message.message
        ));
      }
    } catch { /* skip non-JSON lines */ }
  }
  return findings;
}

export function parseRubocop(output) {
  try {
    const data = JSON.parse(output);
    const findings = [];
    for (const file of data.files || []) {
      for (const offense of file.offenses || []) {
        findings.push(createFinding(
          'rubocop', offense.severity, file.path, offense.location?.line,
          offense.cop_name, offense.message,
          offense.correctable ? 'Auto-correctable' : undefined
        ));
      }
    }
    return findings;
  } catch { return []; }
}

export function parsePhpstan(output) {
  try {
    const data = JSON.parse(output);
    const findings = [];
    for (const [file, fileErrors] of Object.entries(data.files || {})) {
      for (const err of fileErrors.messages || []) {
        findings.push(createFinding(
          'phpstan', 'medium', file, err.line, 'phpstan', err.message
        ));
      }
    }
    return findings;
  } catch { return []; }
}

export function parseSwiftlint(output) {
  try {
    const data = JSON.parse(output);
    return data.map(d => createFinding(
      'swiftlint', d.severity, d.file, d.line, d.rule_id, d.reason
    ));
  } catch { return []; }
}

export function parseCppcheck(output) {
  try {
    const data = JSON.parse(output);
    return (data.errors || []).map(e => createFinding(
      'cppcheck', e.severity, e.file || e.location?.file,
      e.line || e.location?.line, e.id, e.verbose || e.msg
    ));
  } catch { return []; }
}

export function parseTrivy(output) {
  try {
    const data = JSON.parse(output);
    const findings = [];
    for (const result of data.Results || []) {
      for (const vuln of result.Vulnerabilities || []) {
        findings.push(createFinding(
          'trivy', vuln.Severity, result.Target, undefined,
          vuln.VulnerabilityID, `${vuln.PkgName}: ${vuln.Title || vuln.Description?.slice(0, 200)}`
        ));
      }
    }
    return findings;
  } catch { return []; }
}

export function parseCheckov(output) {
  try {
    const data = JSON.parse(output);
    const findings = [];
    for (const check of data.results?.failed_checks || []) {
      findings.push(createFinding(
        'checkov', check.severity || 'high',
        check.file_path, check.file_line_range?.[0],
        check.check_id, check.check_result?.message || check.name
      ));
    }
    return findings;
  } catch { return []; }
}

export function parseActionlint(output) {
  try {
    const data = JSON.parse(output);
    return data.map(d => createFinding(
      'actionlint', 'medium', d.file, d.line, 'actionlint', d.message
    ));
  } catch { return []; }
}

export function parseOsvScanner(output) {
  try {
    const data = JSON.parse(output);
    const findings = [];
    for (const result of data.results || []) {
      for (const pkg of result.packages || []) {
        for (const vuln of pkg.groups || []) {
          findings.push(createFinding(
            'osv-scanner', vuln.max_severity || 'medium',
            pkg.package?.name, undefined,
            vuln.ids?.[0], vuln.ids?.join(', ')
          ));
        }
      }
    }
    return findings;
  } catch { return []; }
}

export function parseSqlfluff(output) {
  try {
    const data = JSON.parse(output);
    const findings = [];
    for (const file of data) {
      for (const violation of file.violations || []) {
        findings.push(createFinding(
          'sqlfluff', 'low', file.filepath, violation.start_line_no,
          violation.code, violation.description
        ));
      }
    }
    return findings;
  } catch { return []; }
}

export function parseNpmAudit(output) {
  try {
    const data = JSON.parse(output);
    const findings = [];
    for (const [name, vuln] of Object.entries(data.vulnerabilities || data.advisories || {})) {
      findings.push(createFinding(
        'npm-audit', vuln.severity, 'package.json', undefined,
        name, `${name}: ${vuln.title || vuln.overview || 'Vulnerability found'}`
      ));
    }
    return findings;
  } catch { return []; }
}

export function parseGenericJson(output, toolName) {
  try {
    const data = JSON.parse(output);
    // Try common patterns
    if (Array.isArray(data)) {
      return data.map(d => createFinding(
        toolName, d.severity || d.level || d.priority,
        d.file || d.path || d.filename,
        d.line || d.row || d.location?.line,
        d.rule || d.ruleId || d.code || d.id,
        d.message || d.msg || d.description
      ));
    }
    if (data.results) return parseGenericJson(JSON.stringify(data.results), toolName);
    if (data.issues) return parseGenericJson(JSON.stringify(data.issues), toolName);
    return [];
  } catch { return []; }
}

/**
 * Get the appropriate parser for a tool name.
 */
export function getParser(toolName) {
  const parsers = {
    'eslint': parseESLint,
    'biome': parseBiome,
    'oxlint': parseESLint, // Similar format
    'ruff': parseRuff,
    'pylint': parseGenericJson,
    'flake8': parseGenericJson,
    'bandit': parseBandit,
    'golangci-lint': parseGolangciLint,
    'gosec': parseGenericJson,
    'staticcheck': parseGenericJson,
    'semgrep': parseSemgrep,
    'hadolint': parseHadolint,
    'shellcheck': parseShellCheck,
    'clippy': parseClippy,
    'rubocop': parseRubocop,
    'brakeman': parseGenericJson,
    'swiftlint': parseSwiftlint,
    'phpstan': parsePhpstan,
    'phpmd': parseGenericJson,
    'psalm': parseGenericJson,
    'clang-tidy': parseGenericJson,
    'cppcheck': parseCppcheck,
    'trivy': parseTrivy,
    'checkov': parseCheckov,
    'tflint': parseGenericJson,
    'terrascan': parseGenericJson,
    'actionlint': parseActionlint,
    'zizmor': parseGenericJson,
    'osv-scanner': parseOsvScanner,
    'trufflehog': parseGenericJson,
    'ast-grep': parseGenericJson,
    'gitleaks': parseGenericJson,
    'bearer': parseGenericJson,
    'codeql': parseGenericJson,
    'detect-secrets': parseGenericJson,
    'whispers': parseGenericJson,
    'sqlfluff': parseSqlfluff,
    'npm-audit': parseNpmAudit,
    'pip-audit': parseGenericJson,
    'cargo-audit': parseGenericJson,
    'bundler-audit': parseGenericJson,
    'markdownlint': parseGenericJson,
    'stylelint': parseGenericJson,
    'htmlhint': parseGenericJson,
    'pmd': parseGenericJson,
    'infer': parseGenericJson,
    'spotbugs': parseGenericJson,
    'checkstyle': parseGenericJson,
    'detekt': parseGenericJson,
    'ktlint': parseGenericJson,
    'mypy': parseGenericJson,
  };

  return parsers[toolName] || ((output) => parseGenericJson(output, toolName));
}

export default getParser;

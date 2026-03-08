// Python Agent: Analyzes Python code for security and quality issues
// Uses comprehensive heuristic checks for Python code

import { execSync } from 'child_process';

export async function analyzePython(code, filePath = null) {
  const issues = [];
  
  // Comprehensive heuristic checks
  const checks = [
    { type: 'SecurityRisk', message: 'Usage of eval()', re: /eval\s*\(/, severity: 'critical' },
    { type: 'SecurityRisk', message: 'Usage of exec()', re: /exec\s*\(/, severity: 'critical' },
    { type: 'SecurityRisk', message: 'Insecure pickle usage', re: /pickle\.(loads|load)\s*\(/, severity: 'high' },
    { type: 'SecurityRisk', message: 'Insecure deserialization', re: /(yaml\.load|marshal\.load)\s*\(.*noalias\s*=\s*True/, severity: 'high' },
    { type: 'SecurityRisk', message: 'Requests with verify=False', re: /requests\.\w+\s*\([^)]*verify\s*=\s*False/, severity: 'high' },
    { type: 'SecurityRisk', message: 'Hardcoded password detected', re: /password\s*=\s*['"][^'"]{8,}['"]/i, severity: 'high' },
    { type: 'SecurityRisk', message: 'SQL injection risk', re: /execute\s*\(\s*['"].*%s.*['"]\s*%/, severity: 'critical' },
    { type: 'SecurityRisk', message: 'Command injection risk', re: /os\.system\s*\(|subprocess\.\w+\s*\(.*shell\s*=\s*True/, severity: 'critical' },
    { type: 'CodeQuality', message: 'Print statement used', re: /print\s*\(/, severity: 'low' },
    { type: 'CodeQuality', message: 'Bare except clause', re: /except\s*:/, severity: 'medium' },
    { type: 'CodeQuality', message: 'Global variable usage', re: /^([A-Z][A-Z0-9_]*)\s*=/m, severity: 'low' },
    { type: 'BestPractice', message: 'Missing type hints', re: /def\s+\w+\s*\([^)]*\)\s*(?!->)/, severity: 'low' },
    { type: 'BestPractice', message: 'Using == for None comparison', re: /==\s*None/, severity: 'low' },
    { type: 'Performance', message: 'Using + for string concatenation in loop', re: /for\s+\w+\s+in\s+.*:\s*\n\s*\w+\s*\+=/, severity: 'medium' },
  ];
  
  const lines = code.split('\n');
  for (const c of checks) {
    const matches = code.matchAll(new RegExp(c.re, 'g'));
    for (const match of matches) {
      const lineNum = lines.slice(0, match.index).join('\n').split('\n').length;
      issues.push({ type: c.type, message: c.message, file: filePath, line: lineNum, snippet: lines[lineNum - 1]?.trim(), severity: c.severity });
    }
  }
  
  return issues;
}

export async function validatePython(code) {
  try {
    execSync(`python3 -m py_compile -c "${code.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
    return { valid: true, errors: [] };
  } catch (_e) {
    try {
      execSync(`python -m py_compile -c "${code.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
      return { valid: true, errors: [] };
    } catch (e2) {
      return { valid: false, errors: [e2.message] };
    }
  }
}

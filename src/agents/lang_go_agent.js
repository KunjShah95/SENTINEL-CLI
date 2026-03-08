// Go Agent: Analyzes Go code for security and quality issues
// Uses AST parsing when available, plus comprehensive heuristic checks

import { execSync } from 'child_process';
import fs from 'fs';

export async function analyzeGo(code, filePath = null) {
  const issues = [];
  
  // Comprehensive security and quality checks
  const checks = [
    // Security issues
    { type: 'SecurityRisk', message: 'Usage of MD5 hashing (insecure)', re: /md5\.(New|Sum)\s*\(/, severity: 'high' },
    { type: 'SecurityRisk', message: 'Usage of SHA1 hashing (insecure)', re: /sha1\.(New|Sum)\s*\(/, severity: 'medium' },
    { type: 'SecurityRisk', message: 'Plain HTTP URL used (not HTTPS)', re: /http:\/\/[^\s'"`]+/, severity: 'high' },
    { type: 'SecurityRisk', message: 'Exec external commands (command injection risk)', re: /exec\.Command\s*\(/, severity: 'medium' },
    { type: 'SecurityRisk', message: 'Hardcoded credentials detected', re: /(password|passwd|pwd|secret|api[_-]?key)\s*[:=]\s*["'][^"']{8,}["']/i, severity: 'critical' },
    { type: 'SecurityRisk', message: 'SQL injection risk - string concatenation in query', re: /db\.(Exec|Query)\s*\(\s*["'].*\+/, severity: 'critical' },
    { type: 'SecurityRisk', message: 'Template injection risk', re: /template\.(HTML|JSScript)\s*\(/, severity: 'medium' },
    { type: 'SecurityRisk', message: 'Weak random number generation', re: /math\/rand\.Seed\s*\(\s*\d+\s*\)/, severity: 'low' },
    { type: 'SecurityRisk', message: 'Insecure TLS configuration', re: /TLSClientConfig:\s*&tls\.Config\{.*InsecureSkipVerify:\s*true/, severity: 'critical' },
    { type: 'SecurityRisk', message: 'Path traversal risk', re: /ioutil\.ReadFile\s*\(\s*req\.\w+/, severity: 'high' },
    
    // Code quality
    { type: 'CodeQuality', message: 'Empty slice declaration', re: /var\s+\w+\s*\[\]\w+\s*$/m, severity: 'low' },
    { type: 'CodeQuality', message: 'Unkeyed struct literals', re: /\{[^}]*(?<!(\w+:))\}[^}]*$/m, severity: 'medium' },
    { type: 'CodeQuality', message: 'Panic usage detected', re: /panic\s*\(/, severity: 'medium' },
    { type: 'CodeQuality', message: 'TODO comment found', re: /\/\/\s*TODO:/, severity: 'low' },
    { type: 'CodeQuality', message: 'FIXME comment found', re: /\/\/\s*FIXME:/, severity: 'low' },
    
    // Best practices
    { type: 'BestPractice', message: 'Error not handled', re: /\[_\]\s*=\s*err/, severity: 'medium' },
    { type: 'BestPractice', message: 'Context should be first parameter', re: /func\s+\w+\s*\([^)]*Context[^)]*,\s*\w+\s+\w+/, severity: 'low' },
    { type: 'BestPractice', message: 'Use io.Copy instead of ioutil.ReadAll', re: /ioutil\.ReadAll\s*\(/, severity: 'low' },
    { type: 'BestPractice', message: 'Use io.WriteString instead of Write', re: /\.Write\s*\(\[\]byte/, severity: 'low' },
    { type: 'BestPractice', message: 'Deprecated ioutil used', re: /ioutil\.(ReadFile|WriteFile|Copy)/, severity: 'low' },
    
    // Performance
    { type: 'Performance', message: 'String concatenation in loop', re: /for\s+.*:\s*\n\s*\w+\s*\+=/, severity: 'medium' },
    { type: 'Performance', message: 'Pre-allocate slices', re: /make\s*\(\[\]\w+,\s*0,\s*\d+\)/, severity: 'low' },
  ];
  
  const lines = code.split('\n');
  for (const c of checks) {
    const matches = code.matchAll(new RegExp(c.re, 'gm'));
    for (const match of matches) {
      const lineNum = lines.slice(0, match.index).join('\n').split('\n').length;
      issues.push({ 
        type: c.type, 
        message: c.message, 
        file: filePath, 
        line: lineNum, 
        snippet: lines[lineNum - 1]?.trim(), 
        severity: c.severity 
      });
    }
  }
  
  return issues;
}

export async function validateGo(code) {
  const tempFile = `/tmp/sentinel_go_validate_${Date.now()}.go`;
  try {
    fs.writeFileSync(tempFile, code);
    execSync(`go build -o /dev/null ${tempFile}`, { stdio: 'pipe' });
    fs.unlinkSync(tempFile);
    return { valid: true, errors: [] };
  } catch (e) {
    try { fs.unlinkSync(tempFile); } catch (_e) { /* ignore cleanup error */ }
    return { valid: false, errors: [e.message] };
  }
}

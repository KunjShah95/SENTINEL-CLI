export async function runSecurityChecks(code, filePath = null) {
  const issues = [];
  const checks = [
    { type: 'Security', message: 'Hardcoded password detected', re: /(password|pwd)\s*[:=]\s*['"][^'"]+['"]/i },
    { type: 'Security', message: 'Plain HTTP URL used', re: /http:\/\/[^\s'"]+/i },
    { type: 'Security', message: 'Insecure random (Math.random)', re: /Math\.random\s*\(/ },
  ];
  for (const c of checks) {
    if (c.re.test(code)) {
      issues.push({ type: c.type, message: c.message, file: filePath, line: null, snippet: null });
    }
  }
  return issues;
}

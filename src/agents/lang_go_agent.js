export async function analyzeGo(code, filePath = null) {
  const issues = [];
  const checks = [
    { type: 'GoRisk', message: 'Usage of md5 hashing', re: /md5\.New\s*\(/ },
    { type: 'GoRisk', message: 'Plain HTTP URL used', re: /http:\/\/[^\s'"]+/ },
    { type: 'GoRisk', message: 'Exec external commands', re: /exec\.Command\s*\(/ },
  ];
  for (const c of checks) {
    if (c.re.test(code)) {
      issues.push({ type: c.type, message: c.message, file: filePath, line: null, snippet: null });
    }
  }
  return issues;
}

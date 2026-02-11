export async function analyzePython(code, filePath = null) {
  const issues = [];
  const checks = [
    { type: 'PyRisk', message: 'Usage of eval()', re: /eval\s*\(/ },
    { type: 'PyRisk', message: 'Insecure pickle usage', re: /pickle\.loads\s*\(/ },
    { type: 'PyRisk', message: 'Requests with verify=False', re: /requests\.\w+\s*\([^)]*verify\s*=\s*False/ },
  ];
  for (const c of checks) {
    if (c.re.test(code)) {
      issues.push({ type: c.type, message: c.message, file: filePath, line: null, snippet: null });
    }
  }
  return issues;
}

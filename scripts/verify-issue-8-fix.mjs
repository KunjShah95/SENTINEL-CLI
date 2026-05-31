/** Verify issue #8 fix: console output prepends category labels. */
import ReportGenerator from '../src/output/reportGenerator.js';

const generator = new ReportGenerator();
const report = {
  summary: {
    totalIssues: 1,
    severityCounts: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
    typeCounts: { security: 1 },
  },
  metadata: { filesAnalyzed: 1, includeSnippets: false },
  issues: [
    {
      file: 'src/app.js',
      line: 10,
      column: 5,
      title: 'Hardcoded API key',
      message: 'API key found in source code',
      severity: 'critical',
      type: 'security',
      analyzer: 'security-analyzer',
      suggestion: 'Use environment variables',
    },
  ],
};

const output = generator.generateConsoleReport(report);

const checks = [
  { label: 'contains [SECURITY] on message line', ok: /\[SECURITY\].*API key found/.test(output) },
  { label: 'contains [SECURITY] on title line', ok: /\[SECURITY\].*Hardcoded API key/.test(output) },
  { label: 'does not print raw message without label', ok: !output.includes('📝 API key found') },
];

let failed = 0;
for (const c of checks) {
  console.log(c.ok ? `  [PASS] ${c.label}` : `  [FAIL] ${c.label}`);
  if (!c.ok) failed++;
}

if (failed > 0) {
  console.log('\n--- Output snippet ---');
  output.split('\n').filter((l) => l.includes('Hardcoded') || l.includes('API key')).forEach((l) => console.log(l));
  process.exit(1);
}

console.log('\nIssue #8 fix verified: category labels appear in console output.');
process.exit(0);

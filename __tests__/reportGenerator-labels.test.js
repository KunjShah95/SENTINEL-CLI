/**
 * Regression test for issue #8: category labels in console output.
 */
import ReportGenerator from '../src/output/reportGenerator.js';

describe('ReportGenerator console labels', () => {
  const sampleReport = {
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
        title: 'Hardcoded API key',
        message: 'API key found in source code',
        severity: 'critical',
        type: 'security',
        analyzer: 'security-analyzer',
      },
    ],
  };

  it('prepends category label to issue message in console output', () => {
    const generator = new ReportGenerator();
    const output = generator.generateConsoleReport(sampleReport);
    expect(output).toMatch(/\[SECURITY\].*API key found/);
  });

  it('prepends category label to issue title in console output', () => {
    const generator = new ReportGenerator();
    const output = generator.generateConsoleReport(sampleReport);
    expect(output).toMatch(/\[SECURITY\].*Hardcoded API key/);
  });
});

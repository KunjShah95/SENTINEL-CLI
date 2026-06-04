import { SarifGenerator } from '../src/output/sarifGenerator.js';

describe('SarifGenerator', () => {
  const sampleIssues = [
    {
      file: 'src/app.js',
      line: 10,
      column: 5,
      title: 'Hardcoded API key',
      message: 'API key found in source code',
      severity: 'critical',
      type: 'security',
      analyzer: 'security-analyzer',
      suggestion: 'Use environment variables instead',
      snippet: 'const key = "sk-12345"',
    },
    {
      file: 'src/utils.js',
      line: 25,
      title: 'Unused variable',
      message: 'Variable "temp" is declared but never used',
      severity: 'medium',
      type: 'quality',
      analyzer: 'linter',
    },
  ];

  let generator;

  beforeEach(() => {
    generator = new SarifGenerator();
  });

  it('generates valid SARIF 2.1.0 structure', () => {
    const sarif = generator.generate(sampleIssues);

    expect(sarif.$schema).toContain('sarif-schema-2.1.0.json');
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs).toHaveLength(1);
  });

  it('includes tool driver metadata', () => {
    const sarif = generator.generate(sampleIssues);
    const driver = sarif.runs[0].tool.driver;

    expect(driver.name).toBe('Sentinel CLI');
    expect(driver.informationUri).toContain('github.com');
  });

  it('maps critical severity to error level', () => {
    const sarif = generator.generate(sampleIssues);
    const criticalResult = sarif.runs[0].results.find(r => r.ruleId.includes('hardcoded-api-key'));

    expect(criticalResult).toBeDefined();
    expect(criticalResult.level).toBe('error');
  });

  it('maps medium severity to warning level', () => {
    const sarif = generator.generate(sampleIssues);
    const mediumResult = sarif.runs[0].results.find(r => r.ruleId.includes('unused-variable'));

    expect(mediumResult).toBeDefined();
    expect(mediumResult.level).toBe('warning');
  });

  it('includes location information for each result', () => {
    const sarif = generator.generate(sampleIssues);
    const result = sarif.runs[0].results[0];

    expect(result.locations).toHaveLength(1);
    expect(result.locations[0].physicalLocation.artifactLocation.uri).toBe('src/app.js');
    expect(result.locations[0].physicalLocation.region.startLine).toBe(10);
    expect(result.locations[0].physicalLocation.region.startColumn).toBe(5);
  });

  it('includes code snippet when available', () => {
    const sarif = generator.generate(sampleIssues);
    const result = sarif.runs[0].results.find(r => r.ruleId.includes('hardcoded-api-key'));

    expect(result.locations[0].physicalLocation.region.snippet).toBeDefined();
    expect(result.locations[0].physicalLocation.region.snippet.text).toBe('const key = "sk-12345"');
  });

  it('includes fix suggestions when available', () => {
    const sarif = generator.generate(sampleIssues);
    const result = sarif.runs[0].results.find(r => r.ruleId.includes('hardcoded-api-key'));

    expect(result.fixes).toHaveLength(1);
    expect(result.fixes[0].description.text).toBe('Use environment variables instead');
  });

  it('defines unique rules from issues', () => {
    const sarif = generator.generate(sampleIssues);
    const rules = sarif.runs[0].tool.driver.rules;

    expect(rules).toHaveLength(2);
    expect(rules[0].id).toContain('sentinel');
    expect(rules[0].shortDescription).toBeDefined();
    expect(rules[0].fullDescription).toBeDefined();
  });

  it('handles empty issues array', () => {
    const sarif = generator.generate([]);

    expect(sarif.runs[0].results).toHaveLength(0);
    expect(sarif.runs[0].tool.driver.rules).toHaveLength(0);
  });

  it('includes invocation metadata', () => {
    const sarif = generator.generate(sampleIssues);
    const invocation = sarif.runs[0].invocations[0];

    expect(invocation.executionSuccessful).toBe(true);
    expect(invocation.endTimeUtc).toBeDefined();
  });

  it('saves SARIF to file', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const tmpDir = process.env.TEMP || '/tmp';
    const outputPath = path.join(tmpDir, 'test-sarif-output.sarif');

    const resultPath = await generator.saveToFile(sampleIssues, outputPath);
    expect(resultPath).toBe(outputPath);

    const content = await fs.readFile(outputPath, 'utf8');
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe('2.1.0');

    await fs.unlink(outputPath);
  });

  it('rejects path traversal in output path', async () => {
    await expect(
      generator.saveToFile(sampleIssues, '../malicious.sarif')
    ).rejects.toThrow('Path traversal');
  });
});

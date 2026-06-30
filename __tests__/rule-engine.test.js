import { RuleEngine, getRuleEngine, resetRuleEngine } from '../src/rules/rule-engine.js';

describe('RuleEngine', () => {
  beforeEach(() => {
    resetRuleEngine();
  });

  test('loads system rules by default', async () => {
    const engine = new RuleEngine();
    const source = await engine.load();
    expect(source).toBe('system');
    expect(engine.loaded).toBe(true);
    expect(engine.rules.length).toBeGreaterThan(0);
  });

  test('resolves rules for matching file paths', async () => {
    const engine = new RuleEngine();
    await engine.load();
    const jsRules = engine.resolveRules('src/App.tsx');
    expect(jsRules.length).toBeGreaterThan(0);
    expect(jsRules[0].rule).toContain('XSS');

    const sqlRules = engine.resolveRules('src/query.sql');
    expect(sqlRules.length).toBeGreaterThan(0);
    expect(sqlRules[0].rule).toContain('SQL injection');
  });

  test('excludes node_modules', async () => {
    const engine = new RuleEngine();
    await engine.load();
    expect(engine.shouldAnalyze('node_modules/lodash/index.js')).toBe(false);
  });

  test('excludes binary files', async () => {
    const engine = new RuleEngine();
    await engine.load();
    expect(engine.shouldAnalyze('logo.png')).toBe(false);
    expect(engine.shouldAnalyze('image.jpg')).toBe(false);
  });

  test('includes source files', async () => {
    const engine = new RuleEngine();
    await engine.load();
    expect(engine.shouldAnalyze('src/index.js')).toBe(true);
    expect(engine.shouldAnalyze('src/components/Button.tsx')).toBe(true);
    expect(engine.shouldAnalyze('src/main.py')).toBe(true);
  });

  test('excludes test files by default', async () => {
    const engine = new RuleEngine();
    await engine.load();
    expect(engine.shouldAnalyze('src/test/java/com/example/Test.java')).toBe(false);
    expect(engine.shouldAnalyze('src/foo.test.tsx')).toBe(false);
    expect(engine.shouldAnalyze('src/foo.spec.js')).toBe(false);
  });

  test('include patterns override default excludes', async () => {
    const engine = new RuleEngine();
    await engine.load();
    engine.includePatterns = ['**/test/**'];
    engine.excludePatterns = [];
    expect(engine.shouldAnalyze('src/test/java/FooTest.java')).toBe(true);
  });

  test('singleton getRuleEngine caches instance', async () => {
    resetRuleEngine();
    const engine1 = await getRuleEngine();
    const engine2 = await getRuleEngine();
    expect(engine1).toBe(engine2);
  });
});

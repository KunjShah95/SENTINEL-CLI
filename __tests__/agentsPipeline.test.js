import { scanCode } from '../src/agents/scanner_agent.js';
import { applyMinimalFixes, proposeFixes } from '../src/agents/fixer_agent.js';
import { validateFix, detectLanguage } from '../src/agents/validator_agent.js';

describe('Agent Pipeline Core', () => {
  test('scanner detects eval usage as security risk', async () => {
    const code = `const userCode = '2+2';\neval(userCode);`;

    const issues = await scanCode(code, { filename: 'sample.js', enableAST: true });

    expect(Array.isArray(issues)).toBe(true);
    expect(issues.some(i => (i.message || '').toLowerCase().includes('eval'))).toBe(true);
    expect(issues.some(i => i.severity === 'critical')).toBe(true);
  });

  test('scanner detects GitHub token leak pattern', async () => {
    const code = `const token = 'ghp_123456789012345678901234567890123456';`;

    const issues = await scanCode(code, { filename: 'secrets.js', enableAST: false });

    expect(issues.some(i => i.type === 'SecretLeak')).toBe(true);
  });

  test('minimal fixer balances unclosed symbols', () => {
    const code = `function demo(a {\n  return [a;`;

    const fixed = applyMinimalFixes(code);

    expect(fixed).toContain(')');
    expect(fixed).toContain('}');
    expect(fixed).toContain(']');
  });

  test('proposeFixes returns proposals without LLM', async () => {
    const code = `eval('1+1')`;
    const errors = [{ type: 'SecurityRisk', message: 'Usage of eval() detected', severity: 'critical' }];

    const result = await proposeFixes(code, errors, { useLLM: false });

    expect(result).toHaveProperty('fixedCode');
    expect(Array.isArray(result.proposals)).toBe(true);
    expect(result.proposals.length).toBe(1);
    expect(result.proposals[0].description).toContain('SecurityRisk');
  });

  test('validator identifies JavaScript and validates fixed code', () => {
    const original = `function x(){ return 1 }`;
    const fixed = `function x(){ return 1; }`;

    const lang = detectLanguage(original, 'file.js');
    const validation = validateFix(original, fixed, [], { filename: 'file.js' });

    expect(lang).toBe('javascript');
    expect(validation.language).toBe('javascript');
    expect(validation.passes).toBe(true);
    expect(validation.details.some(d => d.check === 'syntax')).toBe(true);
  });
});

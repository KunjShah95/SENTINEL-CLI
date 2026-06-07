import { getLanguageAgent } from '../../src/agents/languageAgents.js';

describe('Harness Engineering: LanguageAgent self-correction', () => {
  let jsAgent;

  beforeAll(async () => {
    jsAgent = await getLanguageAgent('javascript');
  });

  test('safeRefactor should loop when LLM generates syntax errors', async () => {
    const originalCode = `
      function calculate(a, b) {
        return a + b;
      }
    `;

    // We mock the LLM callback.
    // First attempt: returns syntax error.
    // Second attempt: returns valid code.
    let attemptCount = 0;
    const mockLlmCallback = async (currentCode, instructions, feedback) => {
      attemptCount++;
      if (attemptCount === 1) {
        // Syntax error: missing brace
        return `
          function calculate(a, b) {
            return a - b;
        `;
      } else {
        // Valid code
        return `
          function calculate(a, b) {
            return a - b;
          }
        `;
      }
    };

    const result = await jsAgent.safeRefactor(originalCode, 'change addition to subtraction', mockLlmCallback);

    expect(attemptCount).toBe(2);
    expect(result.success).toBe(true);
    expect(result.code).toContain('return a - b;');
  });

  test('safeRefactor should fail after max retries if syntax error persists', async () => {
    const originalCode = `let a = 1;`;

    // LLM always generates bad syntax
    const mockLlmCallback = async () => {
      return `let a = 1;;;;;;; }`;
    };

    const result = await jsAgent.safeRefactor(originalCode, 'do something', mockLlmCallback, 2);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to generate valid code');
  });
});

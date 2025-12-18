(async () => {
  try {
    const { AIFixGenerator } = await import('../src/llm/aiFixGenerator.js');

    const mockLLM = {
      generateResponse: async () => JSON.stringify({
        fix: {
          summary: 'Fix',
          description: 'desc',
          code: "console.log('fixed')",
          confidence: 0.9,
        },
        analysis: { rootCause: 'RC', impact: 'low', complexity: 'simple' },
      }),
    };

    const g = new AIFixGenerator(mockLLM, {});

    const issue = {
      type: 'quality',
      severity: 'medium',
      analyzer: 'quality',
      message: 'unused var',
      file: 'test.js',
      line: 1,
      snippet: '1: console.log(1)'
    };

    const fix = await g.generateFix(issue);
    console.log('Fix result:', JSON.stringify(fix, null, 2));
  } catch (e) {
    console.error('Test failed:', e);
    process.exit(1);
  }
})();

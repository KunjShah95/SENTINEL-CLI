/**
 * Test Generator
 *
 * Generates unit tests with happy path, edge cases, and error cases.
 * Supports Jest, pytest, Go test, JUnit, and more.
 */

import path from 'path';

const TEST_FRAMEWORKS = {
  '.js': { framework: 'jest', ext: '.test.js', dir: '__tests__' },
  '.jsx': { framework: 'jest', ext: '.test.jsx', dir: '__tests__' },
  '.ts': { framework: 'jest', ext: '.test.ts', dir: '__tests__' },
  '.tsx': { framework: 'jest', ext: '.test.tsx', dir: '__tests__' },
  '.py': { framework: 'pytest', ext: '.py', dir: 'tests', prefix: 'test_' },
  '.go': { framework: 'go-test', ext: '_test.go', dir: '' },
  '.java': { framework: 'junit', ext: 'Test.java', dir: 'test' },
  '.rs': { framework: 'rust-test', ext: '', dir: '' },
  '.rb': { framework: 'rspec', ext: '_spec.rb', dir: 'spec' },
};

export class TestGenerator {
  constructor(options = {}) {
    this.llmClient = options.llmClient || null;
  }

  /**
   * Generate unit tests for a file.
   */
  async generateForFile(filePath, content) {
    const ext = path.extname(filePath);
    const testConfig = TEST_FRAMEWORKS[ext];
    if (!testConfig) return null;

    const symbols = this.extractExportedSymbols(content, ext);
    if (symbols.length === 0) return null;

    const basename = path.basename(filePath, ext);
    const dirName = path.dirname(filePath);

    let testFilePath;
    if (testConfig.prefix) {
      testFilePath = path.join(dirName, testConfig.dir, `${testConfig.prefix}${basename}${ext}`);
    } else {
      testFilePath = path.join(dirName, testConfig.dir, `${basename}${testConfig.ext}`);
    }
    testFilePath = testFilePath.replace(/\\/g, '/');

    let testContent;
    if (this.llmClient) {
      testContent = await this.generateWithLLM(filePath, content, symbols, testConfig);
    } else {
      testContent = this.generateTemplate(filePath, symbols, testConfig);
    }

    return { testFilePath, content: testContent, framework: testConfig.framework };
  }

  /**
   * Extract exported symbols from source code.
   */
  extractExportedSymbols(content, ext) {
    const symbols = [];
    const lines = content.split('\n');

    const patterns = [
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
      /(?:export\s+)?class\s+(\w+)/,
      /(?:export\s+)?(?:const|let)\s+(\w+)\s*=/,
      /(?:export\s+default\s+)/,
    ];

    for (let i = 0; i < lines.length; i++) {
      for (const pattern of patterns) {
        const match = lines[i].match(pattern);
        if (match && match[1]) {
          symbols.push({ name: match[1], line: i + 1, code: lines[i].trim() });
          break;
        }
      }
    }

    return symbols;
  }

  /**
   * Generate tests using LLM.
   */
  async generateWithLLM(filePath, content, symbols, testConfig) {
    const symbolNames = symbols.map(s => s.name).join(', ');

    const prompt = `Generate unit tests for the following file using ${testConfig.framework}:

File: ${filePath}
Exported symbols: ${symbolNames}

\`\`\`
${content.slice(0, 6000)}
\`\`\`

Generate comprehensive tests covering:
1. Happy path (normal usage)
2. Edge cases (empty inputs, null values, boundary conditions)
3. Error cases (invalid inputs, exceptions)

Return ONLY the test file content, no markdown fences or explanations.`;

    try {
      const response = await this.llmClient.chat(
        [{ role: 'user', content: prompt }],
        { maxTokens: 3000, timeout: 30_000 }
      );

      let testContent = response.content || response.message?.content || '';
      testContent = testContent.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim();

      return testContent || this.generateTemplate(filePath, symbols, testConfig);
    } catch {
      return this.generateTemplate(filePath, symbols, testConfig);
    }
  }

  /**
   * Generate a test template without LLM.
   */
  generateTemplate(filePath, symbols, testConfig) {
    const basename = path.basename(filePath);
    const importPath = `./${path.basename(filePath, path.extname(filePath))}`;

    switch (testConfig.framework) {
    case 'jest':
      return this.generateJestTemplate(basename, importPath, symbols);
    case 'pytest':
      return this.generatePytestTemplate(basename, importPath, symbols);
    case 'go-test':
      return this.generateGoTestTemplate(basename, symbols);
    default:
      return this.generateJestTemplate(basename, importPath, symbols);
    }
  }

  generateJestTemplate(basename, importPath, symbols) {
    let content = `// Auto-generated tests for ${basename}\n`;
    content += `import { ${symbols.map(s => s.name).join(', ')} } from '${importPath}';\n\n`;

    for (const symbol of symbols) {
      content += `describe('${symbol.name}', () => {\n`;
      content += `  test('should handle normal input', () => {\n`;
      content += `    // TODO: implement happy path test\n`;
      content += `    expect(${symbol.name}).toBeDefined();\n`;
      content += `  });\n\n`;
      content += `  test('should handle edge cases', () => {\n`;
      content += `    // TODO: test empty, null, boundary conditions\n`;
      content += `  });\n\n`;
      content += `  test('should handle error cases', () => {\n`;
      content += `    // TODO: test invalid inputs, exceptions\n`;
      content += `  });\n`;
      content += `});\n\n`;
    }

    return content;
  }

  generatePytestTemplate(basename, importPath, symbols) {
    let content = `# Auto-generated tests for ${basename}\n`;
    content += `from ${basename.replace(/\.py$/, '')} import ${symbols.map(s => s.name).join(', ')}\n\n`;

    for (const symbol of symbols) {
      content += `class Test${symbol.name.charAt(0).toUpperCase() + symbol.name.slice(1)}:\n`;
      content += `    def test_happy_path(self):\n`;
      content += `        # TODO: implement happy path test\n`;
      content += `        pass\n\n`;
      content += `    def test_edge_cases(self):\n`;
      content += `        # TODO: test empty, None, boundary conditions\n`;
      content += `        pass\n\n`;
      content += `    def test_error_cases(self):\n`;
      content += `        # TODO: test invalid inputs, exceptions\n`;
      content += `        pass\n\n\n`;
    }

    return content;
  }

  generateGoTestTemplate(basename, symbols) {
    let content = `package main\n\nimport "testing"\n\n`;

    for (const symbol of symbols) {
      content += `func Test${symbol.name}(t *testing.T) {\n`;
      content += `\t// TODO: implement test\n`;
      content += `}\n\n`;
    }

    return content;
  }
}

export default TestGenerator;

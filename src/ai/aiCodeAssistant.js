import { getLLMOrchestrator } from '../llm/llmOrchestrator.js';
import FileOperations from '../utils/fileOperations.js';
import ShellExecutor from '../utils/shellExecutor.js';

export class AICodeAssistant {
  constructor(options = {}) {
    this.projectPath = options.projectPath || process.cwd();
    this.files = new FileOperations(this.projectPath);
    this.shell = new ShellExecutor({ cwd: this.projectPath });
    this.llm = options.llm || getLLMOrchestrator();
  }

  async generateCode(description, language = 'javascript', context = {}) {
    const prompt = `You are an expert ${language} developer. Generate high-quality, production-ready code based on this description:

Description: ${description}

Requirements:
- Write clean, well-documented code
- Follow best practices
- Include proper error handling
- Use modern ${language} features
${context.existingCode ? `\nExisting code to build upon:\n${context.existingCode}` : ''}
${context.framework ? `\nFramework: ${context.framework}` : ''}

Respond with ONLY the code, no explanations.`;

    try {
      const response = await this.llm.chat([{ role: 'user', content: prompt }], {
        temperature: 0.3,
        maxTokens: 3000
      });
      return { success: true, code: response, language };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async explainCode(code, language = 'javascript') {
    const prompt = `Explain this ${language} code in simple, clear terms. Break down what each part does:

\`\`\`${language}
${code}
\`\`\`

Provide:
1. A brief summary (1-2 sentences)
2. What each major section does
3. Any potential issues or improvements`;

    try {
      const response = await this.llm.chat([{ role: 'user', content: prompt }], {
        temperature: 0.5,
        maxTokens: 2000
      });
      return { success: true, explanation: response };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async generateTests(code, language = 'javascript', testFramework = 'jest') {
    const prompt = `Generate comprehensive unit tests for this ${language} code using ${testFramework}:

\`\`\`${language}
${code}
\`\`\`

Requirements:
- Test all public functions/methods
- Include edge cases
- Use descriptive test names
- Follow ${testFramework} conventions
- Include both positive and negative test cases`;

    try {
      const response = await this.llm.chat([{ role: 'user', content: prompt }], {
        temperature: 0.3,
        maxTokens: 3000
      });
      return { success: true, tests: response, framework: testFramework };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async analyzeError(error, stackTrace = '', code = '') {
    const prompt = `Analyze this error and provide a solution:

Error: ${error}
${stackTrace ? `\nStack Trace:\n${stackTrace}` : ''}
${code ? `\nRelated Code:\n${code}` : ''}

Provide:
1. What the error means (in simple terms)
2. Why it likely happened
3. How to fix it
4. Prevention tips`;

    try {
      const response = await this.llm.chat([{ role: 'user', content: prompt }], {
        temperature: 0.3,
        maxTokens: 1500
      });
      return { success: true, analysis: response };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async refactorCode(code, goal, language = 'javascript') {
    const prompt = `Refactor this ${language} code to ${goal}:

Original Code:
\`\`\`${language}
${code}
\`\`\`

Provide the refactored code that:
- Achieves the goal: ${goal}
- Maintains the same functionality
- Is cleaner and more maintainable
- Follows best practices`;

    try {
      const response = await this.llm.chat([{ role: 'user', content: prompt }], {
        temperature: 0.3,
        maxTokens: 3000
      });
      return { success: true, refactored: response };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async suggestRefactoring(code) {
    const prompt = `Analyze this code and suggest improvements:

\`\`\`javascript
${code}
\`\`\`

Suggest:
1. Code smells and issues
2. Performance improvements
3. Better patterns/practices
4. Potential bugs
5. Readability improvements

Be specific and provide examples.`;

    try {
      const response = await this.llm.chat([{ role: 'user', content: prompt }], {
        temperature: 0.5,
        maxTokens: 2000
      });
      return { success: true, suggestions: response };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async completeCode(code, language = 'javascript') {
    const prompt = `Complete this partial ${language} code. Fill in the missing parts:

\`\`\`${language}
${code}
\`\`\`

Complete the code logically and return the full working code.`;

    try {
      const response = await this.llm.chat([{ role: 'user', content: prompt }], {
        temperature: 0.2,
        maxTokens: 2000
      });
      return { success: true, completed: response };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async optimizeCode(code, language = 'javascript') {
    const prompt = `Optimize this ${language} code for performance:

\`\`\`${language}
${code}
\`\`\`

Optimize for:
- Faster execution
- Lower memory usage
- Better algorithms
- Reduced complexity

Keep functionality the same.`;

    try {
      const response = await this.llm.chat([{ role: 'user', content: prompt }], {
        temperature: 0.3,
        maxTokens: 3000
      });
      return { success: true, optimized: response };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async documentCode(code, language = 'javascript') {
    const prompt = `Add comprehensive documentation to this ${language} code:

\`\`\`${language}
${code}
\`\`\`

Add:
- JSDoc comments for functions/classes
- Parameter descriptions
- Return type descriptions
- Usage examples
- @throws annotations where needed`;

    try {
      const response = await this.llm.chat([{ role: 'user', content: prompt }], {
        temperature: 0.3,
        maxTokens: 3000
      });
      return { success: true, documented: response };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async securityAudit(code) {
    const prompt = `Perform a security audit on this code:

\`\`\`javascript
${code}
\`\`\`

Check for:
- SQL injection vulnerabilities
- XSS vulnerabilities
- Authentication issues
- Authorization flaws
- Data exposure
- Common OWASP Top 10 issues

List each vulnerability found with severity and fix.`;

    try {
      const response = await this.llm.chat([{ role: 'user', content: prompt }], {
        temperature: 0.3,
        maxTokens: 2000
      });
      return { success: true, audit: response };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async convertCode(code, fromLanguage, toLanguage) {
    const prompt = `Convert this ${fromLanguage} code to ${toLanguage}:

\`\`\`${fromLanguage}
${code}
\`\`\`

Convert to equivalent ${toLanguage} code that:
- Has the same functionality
- Follows ${toLanguage} best practices
- Is idiomatic`;

    try {
      const response = await this.llm.chat([{ role: 'user', content: prompt }], {
        temperature: 0.3,
        maxTokens: 3000
      });
      return { success: true, converted: response, toLanguage };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async reviewCode(code) {
    const prompt = `Perform a comprehensive code review:

\`\`\`javascript
${code}
\`\`\`

Review for:
1. Code quality & readability
2. Performance issues
3. Potential bugs
4. Security concerns
5. Best practices
6. Maintainability

Rate each category and provide specific feedback.`;

    try {
      const response = await this.llm.chat([{ role: 'user', content: prompt }], {
        temperature: 0.5,
        maxTokens: 2500
      });
      return { success: true, review: response };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

export default AICodeAssistant;

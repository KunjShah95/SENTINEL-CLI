import { globalEventBus } from '../events/eventBus.js';
import { globalMetrics } from '../metrics/metricsCollector.js';

class AutoFixGenerator {
  constructor(options = {}) {
    this.llmProvider = options.llmProvider || 'local';
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    this.model = options.model || 'gpt-4';
    this.maxTokens = options.maxTokens || 2000;
    this.temperature = options.temperature || 0.3;
    this.eventBus = options.eventBus || globalEventBus;
    this.metrics = options.metrics || globalMetrics;
    this.fixTemplates = this.loadFixTemplates();
    this.confidenceThreshold = options.confidenceThreshold || 0.8;
  }

  loadFixTemplates() {
    return {
      'hardcoded-password': {
        description: 'Replace hardcoded password with environment variable',
        template: (match) => ({
          find: match[0],
          replace: 'process.env.DATABASE_PASSWORD',
          import: '',
        }),
        confidence: 0.95,
      },
      'sql-injection': {
        description: 'Use parameterized queries instead of string concatenation',
        template: (match, _context) => {
          const varName = match[1] || 'input';
          return {
            find: match[0],
            replace: `db.query('SELECT * FROM users WHERE id = ?', [${varName}])`,
            import: '',
          };
        },
        confidence: 0.9,
      },
      'xss-vulnerability': {
        description: 'Sanitize user input before rendering',
        template: () => ({
          find: /\.innerHTML\s*=\s*([^;]+)/,
          replace: '.textContent = sanitize($1)',
          import: "import { sanitize } from './utils';",
        }),
        confidence: 0.85,
      },
      'eval-usage': {
        description: 'Replace eval with safer alternatives',
        template: (match) => {
          const code = match[1];
          return {
            find: match[0],
            replace: `JSON.parse(${code})`,
            import: '',
          };
        },
        confidence: 0.8,
      },
      'console-statement': {
        description: 'Remove console statement or replace with logger',
        template: (match) => ({
          find: match[0],
          replace: match[0].replace(/console\.(log|warn|error)/, 'logger.$1'),
          import: "import logger from './logger';",
        }),
        confidence: 0.9,
      },
      'unused-variable': {
        description: 'Remove unused variable declaration',
        template: (match) => ({
          find: match[0],
          replace: '',
          import: '',
        }),
        confidence: 0.95,
      },
      'var-to-const': {
        description: 'Replace var with const or let',
        template: (match) => {
          const isReassigned = match.input?.includes(`${match[2]} =`);
          return {
            find: match[0],
            replace: `${isReassigned ? 'let' : 'const'} ${match[2]} = ${match[3]}`,
            import: '',
          };
        },
        confidence: 0.95,
      },
      'loose-equality': {
        description: 'Use strict equality',
        template: (match) => ({
          find: match[0],
          replace: match[0].replace('==', '==='),
          import: '',
        }),
        confidence: 0.95,
      },
      'magic-number': {
        description: 'Extract magic number to constant',
        template: (match) => ({
          find: match[1],
          replace: 'MAX_RETRY_COUNT',
          import: 'const MAX_RETRY_COUNT = 3;',
        }),
        confidence: 0.75,
      },
    };
  }

  async generateFix(issue, context = {}) {
    const timer = this.metrics.startTimer('autofix.generate');

    try {
      // Try template-based fix first
      const templateFix = await this.generateTemplateFix(issue);
      
      if (templateFix && templateFix.confidence >= this.confidenceThreshold) {
        this.metrics.endTimer(timer);
        return templateFix;
      }

      // Fall back to LLM-based fix
      if (this.llmProvider !== 'local' && this.apiKey) {
        const llmFix = await this.generateLLMFix(issue, context);
        this.metrics.endTimer(timer);
        return llmFix;
      }

      this.metrics.endTimer(timer);
      return null;
    } catch (error) {
      this.metrics.endTimer(timer);
      this.eventBus.emit('autofix:error', { issue, error: error.message });
      return null;
    }
  }

  async generateTemplateFix(issue) {
    const template = this.fixTemplates[issue.type];
    
    if (!template) {
      return null;
    }

    const snippet = issue.snippet || '';
    const match = this.findMatch(snippet, issue);

    if (!match) {
      return null;
    }

    const fix = template.template(match, snippet);

    return {
      type: 'template',
      description: template.description,
      confidence: template.confidence,
      changes: [{
        file: issue.file,
        line: issue.line,
        column: issue.column,
        find: fix.find,
        replace: fix.replace,
        import: fix.import,
      }],
      explanation: this.generateExplanation(issue, fix),
    };
  }

  findMatch(snippet, issue) {
    // Try to match the problematic code pattern
    const patterns = {
      'hardcoded-password': /(password|passwd|pwd)\s*=\s*['"][^'"]+['"]/i,
      'sql-injection': /(SELECT|INSERT|UPDATE|DELETE).*\+\s*(\w+)/i,
      'xss-vulnerability': /\.innerHTML\s*=\s*([^;]+)/,
      'eval-usage': /eval\s*\(\s*([^)]+)\s*\)/,
      'console-statement': /console\.(log|warn|error|info)\s*\([^)]*\)/,
      'unused-variable': /(?:var|let|const)\s+(\w+)\s*=\s*[^;]+;(?![\s\S]*\b\1\b)/,
      'var-to-const': /\b(var)\s+(\w+)\s*=\s*([^;]+)/,
      'loose-equality': /(?<![=!])=(?==)(?![=])/,
    };

    const pattern = patterns[issue.type];
    if (!pattern) return null;

    return snippet.match(pattern);
  }

  async generateLLMFix(issue, context) {
    const prompt = this.buildPrompt(issue, context);

    try {
      let response;

      switch (this.llmProvider) {
        case 'openai':
          response = await this.callOpenAI(prompt);
          break;
        case 'anthropic':
          response = await this.callAnthropic(prompt);
          break;
        case 'groq':
          response = await this.callGroq(prompt);
          break;
        default:
          throw new Error(`Unknown LLM provider: ${this.llmProvider}`);
      }

      return this.parseLLMResponse(response, issue);
    } catch (error) {
      console.error('LLM fix generation failed:', error.message);
      return null;
    }
  }

  buildPrompt(issue, context) {
    return `You are a security expert. Fix the following security issue:

Issue Type: ${issue.type}
Severity: ${issue.severity}
File: ${issue.file}:${issue.line}
Description: ${issue.message}

Current Code:
\`\`\`${context.language || 'javascript'}
${issue.snippet}
\`\`\`

Provide the fix in this JSON format:
{
  "description": "Brief description of the fix",
  "confidence": 0.95,
  "changes": [
    {
      "find": "exact code to find",
      "replace": "replacement code",
      "line": ${issue.line}
    }
  ],
  "explanation": "Why this fix resolves the issue"
}`;
  }

  async callOpenAI(prompt) {
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: this.apiKey });

    const response = await openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: 'You are a security expert specializing in code fixes.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: this.maxTokens,
      temperature: this.temperature,
    });

    return response.choices[0]?.message?.content;
  }

  async callAnthropic(prompt) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-opus-20240229',
        max_tokens: this.maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    return data.content?.[0]?.text;
  }

  async callGroq(prompt) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama3-70b-8192',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: this.maxTokens,
        temperature: this.temperature,
      }),
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content;
  }

  parseLLMResponse(content, issue) {
    try {
      // Extract JSON from markdown code block if present
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || 
                        content.match(/```\n?([\s\S]*?)\n?```/) ||
                        [null, content];

      const jsonStr = jsonMatch[1].trim();
      const fix = JSON.parse(jsonStr);

      return {
        type: 'llm',
        description: fix.description,
        confidence: fix.confidence,
        changes: fix.changes.map(c => ({
          file: issue.file,
          ...c,
        })),
        explanation: fix.explanation,
      };
    } catch (error) {
      console.error('Failed to parse LLM response:', error);
      return null;
    }
  }

  generateExplanation(issue, _fix) {
    const explanations = {
      'hardcoded-password': 'Hardcoded credentials are a security risk. Using environment variables keeps secrets out of source code.',
      'sql-injection': 'String concatenation in SQL queries allows attackers to inject malicious SQL. Parameterized queries prevent this.',
      'xss-vulnerability': 'innerHTML can execute malicious scripts. Use textContent or sanitize input to prevent XSS attacks.',
      'eval-usage': 'eval() executes arbitrary code and is dangerous. Use safer alternatives like JSON.parse() for data.',
      'console-statement': 'Console statements can leak sensitive information in production. Use a proper logging framework.',
    };

    return explanations[issue.type] || `Fixed ${issue.type} issue by applying best practices.`;
  }

  async applyFix(fix, dryRun = false) {
    const { promises: fs } = await import('fs');

    const results = [];

    for (const change of fix.changes) {
      try {
        const content = await fs.readFile(change.file, 'utf8');
        const lines = content.split('\n');
        const lineIndex = change.line - 1;

        if (lineIndex < 0 || lineIndex >= lines.length) {
          results.push({
            file: change.file,
            success: false,
            error: 'Line number out of range',
          });
          continue;
        }

        if (dryRun) {
          results.push({
            file: change.file,
            success: true,
            dryRun: true,
            original: lines[lineIndex],
            modified: lines[lineIndex].replace(change.find, change.replace),
          });
          continue;
        }

        // Apply the fix
        lines[lineIndex] = lines[lineIndex].replace(change.find, change.replace);

        // Add import if needed
        if (change.import && !content.includes(change.import)) {
          lines.unshift(change.import);
        }

        await fs.writeFile(change.file, lines.join('\n'));

        results.push({
          file: change.file,
          success: true,
          line: change.line,
        });

        this.metrics.incrementCounter('autofix.applied', 1, {
          type: fix.type,
          confidence: fix.confidence,
        });
      } catch (error) {
        results.push({
          file: change.file,
          success: false,
          error: error.message,
        });
      }
    }

    this.eventBus.emit('autofix:applied', {
      fix,
      results,
      dryRun,
    });

    return results;
  }

  async generateFixesForIssues(issues, options = {}) {
    const fixes = [];

    for (const issue of issues) {
      const fix = await this.generateFix(issue, options);
      
      if (fix && fix.confidence >= (options.confidenceThreshold || this.confidenceThreshold)) {
        fixes.push({
          issue,
          fix,
        });
      }
    }

    return fixes;
  }

  getStats() {
    return {
      templatesAvailable: Object.keys(this.fixTemplates).length,
      llmProvider: this.llmProvider,
      confidenceThreshold: this.confidenceThreshold,
    };
  }
}

export default AutoFixGenerator;

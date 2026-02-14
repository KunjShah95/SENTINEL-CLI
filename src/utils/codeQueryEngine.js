import LLMOrchestrator from '../llm/llmOrchestrator.js';
import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';

export class CodeQueryEngine {
  constructor(llmConfig = {}) {
    this.orchestrator = new LLMOrchestrator(llmConfig);
    this.codebaseContext = null;
    this.maxFiles = 20;
  }

  /**
   * Load codebase context for queries
   */
  async loadContext(basePath = '.') {
    const context = {
      files: [],
      structure: {},
      packageJson: null,
    };

    try {
      // Load package.json
      const packagePath = path.join(basePath, 'package.json');
      try {
        const packageContent = await fs.readFile(packagePath, 'utf8');
        context.packageJson = JSON.parse(packageContent);
      } catch (e) { /* Ignore */ }

      // Get file structure
      const patterns = ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx', '**/*.py', '**/*.java'];
      
      for (const pattern of patterns) {
        const { glob } = await import('glob');
        const files = await glob(pattern, { 
          cwd: basePath,
          ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**']
        });
        
        context.files.push(...files.slice(0, this.maxFiles));
      }

      // Load key files content
      for (const file of context.files.slice(0, 10)) {
        try {
          const content = await fs.readFile(path.join(basePath, file), 'utf8');
          context.structure[file] = {
            content: content.substring(0, 2000),
            size: content.length,
          };
        } catch (e) { /* Ignore */ }
      }

      this.codebaseContext = context;
      return context;
    } catch (error) {
      console.warn('Failed to load codebase context:', error.message);
      return context;
    }
  }

  /**
   * Answer natural language questions about the codebase
   */
  async ask(question, options = {}) {
    const context = this.codebaseContext || await this.loadContext(options.basePath || '.');
    
    const prompt = this.buildQueryPrompt(question, context);
    
    const systemPrompt = `You are Sentinel CLI, a code analysis assistant. 
Answer user questions about their codebase accurately and concisely.
Provide specific file paths and line numbers when possible.
If you're unsure, say so clearly.`;

    try {
      const result = await this.orchestrator.chat(prompt, { systemPrompt });
      return {
        answer: result.text,
        sources: this.findRelevantFiles(question, context),
      };
    } catch (error) {
      return {
        answer: `Error: ${error.message}`,
        sources: [],
      };
    }
  }

  /**
   * Explain a specific piece of code
   */
  async explain(filePath, options = {}) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      const lineNum = options.line || 1;
      const context = options.context || 5;
      
      const start = Math.max(0, lineNum - context - 1);
      const end = Math.min(lines.length, lineNum + context);
      const snippet = lines.slice(start, end).join('\n');
      
      const prompt = `Explain the following code from ${filePath}:${lineNum}:

\`\`\`
${snippet}
\`\`\`

Provide a clear explanation of what this code does.`;

      const result = await this.orchestrator.chat(prompt, {
        systemPrompt: 'You are a code explanation assistant. Explain code clearly and concisely.',
      });

      return {
        explanation: result.text,
        file: filePath,
        line: lineNum,
        snippet,
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Find security issues in natural language
   */
  async findSecurityIssues(query) {
    const context = this.codebaseContext || await this.loadContext();
    
    const prompt = `Analyze this codebase for security vulnerabilities based on: "${query}"

Files in codebase:
${Object.keys(context.structure).map(f => `- ${f}`).join('\n')}

Identify potential security issues, their severity, and suggest fixes.`;

    const result = await this.orchestrator.chat(prompt, {
      systemPrompt: 'You are a security expert. Identify vulnerabilities and suggest remediations.',
    });

    return {
      analysis: result.text,
      findings: this.extractSecurityFindings(result.text),
    };
  }

  /**
   * Suggest improvements for code
   */
  async suggestImprovements(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      
      const prompt = `Analyze this code and suggest improvements:

\`\`\`
${content.substring(0, 3000)}
\`\`\`

Focus on:
1. Code quality and readability
2. Performance optimizations
3. Security best practices
4. Error handling
5. Maintainability`;

      const result = await this.orchestrator.chat(prompt, {
        systemPrompt: 'You are a senior software engineer. Provide actionable improvement suggestions.',
      });

      return {
        suggestions: result.text,
        file: filePath,
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Build query prompt with context
   */
  buildQueryPrompt(question, context) {
    const fileList = Object.keys(context.structure).map(f => 
      `// ${f} (${context.structure[f].size} bytes)`
    ).join('\n');

    const dependencies = context.packageJson ? 
      `Dependencies: ${Object.keys(context.packageJson.dependencies || {}).join(', ')}` : '';

    return `
User Question: ${question}

Project Context:
- Files: ${context.files.length} files analyzed
- ${dependencies}

Key Files:
${fileList}

Provide a detailed answer to the user's question based on this codebase.
    `.trim();
  }

  /**
   * Find relevant files for a question
   */
  findRelevantFiles(question, context) {
    const keywords = question.toLowerCase().split(/\s+/);
    const relevant = [];

    for (const file of context.files) {
      const fileLower = file.toLowerCase();
      const score = keywords.filter(k => fileLower.includes(k)).length;
      if (score > 0) {
        relevant.push({ file, score });
      }
    }

    return relevant
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(r => r.file);
  }

  /**
   * Extract security findings from LLM response
   */
  extractSecurityFindings(text) {
    const findings = [];
    const severityPattern = /(critical|high|medium|low)\s+(?:severity|issue|vulnerability)/gi;
    
    let match;
    while ((match = severityPattern.exec(text)) !== null) {
      findings.push({
        severity: match[1].toLowerCase(),
        description: text.substring(Math.max(0, match.index - 50), match.index + 100),
      });
    }

    return findings;
  }
}

/**
 * CLI command for asking questions
 */
export async function runQuery(args) {
  const query = args.join(' ');
  
  if (!query) {
    console.log('Usage: sentinel ask "your question here"');
    console.log('\nExamples:');
    console.log('  sentinel ask "how does authentication work?"');
    console.log('  sentinel ask "find SQL injection vulnerabilities"');
    console.log('  sentinel ask "explain auth.js"');
    return;
  }

  const engine = new CodeQueryEngine();
  
  console.log(chalk.cyan('🔍 Analyzing codebase...\n'));
  
  // Detect query type
  if (query.includes('explain')) {
    const fileMatch = query.match(/(?:file\s+)?([\w./]+)/i);
    if (fileMatch) {
      const result = await engine.explain(fileMatch[1]);
      console.log(chalk.bold.cyan('\n📖 Explanation:'));
      console.log(result.explanation);
    }
  } else if (query.includes('security') || query.includes('vulnerability')) {
    const result = await engine.findSecurityIssues(query);
    console.log(chalk.bold.red('\n🔒 Security Analysis:'));
    console.log(result.analysis);
  } else {
    const result = await engine.ask(query);
    console.log(chalk.bold.cyan('\n💡 Answer:'));
    console.log(result.answer);
    
    if (result.sources.length > 0) {
      console.log(chalk.gray('\n📁 Relevant files:'));
      result.sources.forEach(f => console.log(`  - ${f}`));
    }
  }
}

export default CodeQueryEngine;

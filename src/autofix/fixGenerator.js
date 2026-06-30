/**
 * Fix Generator
 *
 * Pattern-based fix library + LLM fix generation with confidence scoring.
 */

const PATTERN_FIXES = {
  'no-console': {
    pattern: /console\.(log|warn|error|debug|info)\(/g,
    fix: (match) => `// ${match}`,
    confidence: 0.7,
    description: 'Comment out console statement',
  },
  'no-var': {
    pattern: /\bvar\s+/g,
    fix: () => 'const ',
    confidence: 0.8,
    description: 'Replace var with const (or let if reassigned)',
  },
  'no-unused-vars': {
    pattern: null,
    fix: null,
    confidence: 0.6,
    description: 'Remove unused variable declaration',
  },
  'prefer-const': {
    pattern: /\blet\s+(\w+)\s*=\s*([^;]+);\s*(?!.*\b\1\s*=)/g,
    fix: (match, _p1) => match.replace('let ', 'const '),
    confidence: 0.85,
    description: 'Convert let to const (variable is never reassigned)',
  },
  'eqeqeq': {
    pattern: /([^!=<>])==(?!=)/g,
    fix: (match) => match.replace('==', '==='),
    confidence: 0.95,
    description: 'Use strict equality (===)',
  },
  'no-eval': {
    pattern: null,
    fix: null,
    confidence: 0.5,
    description: 'Replace eval() with safer alternative',
  },
  'missing-semicolon': {
    pattern: null,
    fix: (match) => match + ';',
    confidence: 0.9,
    description: 'Add missing semicolon',
  },
};

export class FixGenerator {
  constructor(options = {}) {
    this.llmClient = options.llmClient || null;
    this.patternFixes = { ...PATTERN_FIXES, ...options.customPatterns };
  }

  /**
   * Generate a fix for an issue.
   */
  async generateFix(issue) {
    // Try pattern-based fix first
    const patternFix = this.tryPatternFix(issue);
    if (patternFix && patternFix.confidence >= 0.8) {
      return patternFix;
    }

    // Fall back to LLM fix generation
    if (this.llmClient) {
      return this.generateLLMFix(issue);
    }

    return patternFix || null;
  }

  /**
   * Try to apply a pattern-based fix.
   */
  tryPatternFix(issue) {
    const ruleId = issue.rule || issue.ruleId || issue.category || '';
    const pattern = this.patternFixes[ruleId];

    if (!pattern || !pattern.fix) return null;

    const snippet = issue.existingCode || issue.snippet || '';
    if (!snippet) return null;

    try {
      let fixedCode;
      if (pattern.pattern) {
        fixedCode = snippet.replace(pattern.pattern, pattern.fix);
      } else {
        fixedCode = pattern.fix(snippet);
      }

      if (fixedCode === snippet) return null; // No change

      return {
        code: fixedCode,
        original: snippet,
        confidence: pattern.confidence,
        description: pattern.description,
        type: 'pattern',
      };
    } catch {
      return null;
    }
  }

  /**
   * Generate a fix using LLM.
   */
  async generateLLMFix(issue) {
    try {
      const prompt = `Fix the following code issue:

Issue: ${issue.title}
Severity: ${issue.severity}
File: ${issue.path || issue.file || 'unknown'}
${issue.message ? `Description: ${issue.message}` : ''}

Code to fix:
\`\`\`
${issue.existingCode || issue.snippet || ''}
\`\`\`

Return ONLY the fixed code, no explanations or markdown fences.`;

      const response = await this.llmClient.chat(
        [{ role: 'user', content: prompt }],
        { maxTokens: 1000, timeout: 15_000 }
      );

      const fixedCode = (response.content || response.message?.content || '')
        .replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim();

      if (!fixedCode || fixedCode === (issue.existingCode || issue.snippet || '')) {
        return null;
      }

      return {
        code: fixedCode,
        original: issue.existingCode || issue.snippet || '',
        confidence: 0.7,
        description: `LLM-generated fix for: ${issue.title}`,
        type: 'llm',
      };
    } catch {
      return null;
    }
  }
}

export default FixGenerator;

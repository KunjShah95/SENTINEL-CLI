export class BaseAnalyzer {
  constructor(name, config) {
    this.name = name;
    this.config = config;
    this.issues = [];
    this.stats = {
      filesAnalyzed: 0,
      linesAnalyzed: 0,
      issuesFound: 0,
      executionTime: 0,
    };
  }

  /**
   * Main analysis method to be implemented by subclasses
   */
  async analyze(_files, _context) {
    throw new Error('analyze() must be implemented by subclass');
  }

  /**
   * Analyze a single file
   */
  async analyzeFile(_filePath, _content, _context) {
    throw new Error('analyzeFile() must be implemented by subclass');
  }

  /**
   * Get the name of this analyzer
   */
  getName() {
    return this.name;
  }

  /**
   * Get all issues found by this analyzer
   */
  getIssues() {
    return this.issues;
  }

  /**
   * Get analyzer statistics
   */
  getStats() {
    return this.stats;
  }

  /**
   * Add an issue to the findings
   */
  addIssue(issue) {
    const formattedIssue = {
      id: this.generateIssueId(),
      analyzer: this.name,
      severity: issue.severity || 'info',
      type: issue.type || 'general',
      title: issue.title,
      message: issue.message,
      file: issue.file,
      line: issue.line,
      column: issue.column,
      snippet: issue.snippet,
      suggestion: issue.suggestion,
      confidence: issue.confidence || 0.8,
      tags: issue.tags || [],
      ...issue,
    };

    this.issues.push(formattedIssue);
    this.stats.issuesFound++;
    return formattedIssue;
  }

  /**
   * Generate unique issue ID
   */
  generateIssueId() {
    return `${this.name.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if file should be analyzed based on configuration
   */
  shouldAnalyzeFile(filePath) {
    const ignoredFiles = this.config.getIgnoredFiles();
    const supportedLanguages = this.config.getSupportedLanguages();

    // Check if file is in ignored patterns
    for (const pattern of ignoredFiles) {
      if (this.matchesPattern(filePath, pattern)) {
        return false;
      }
    }

    // Check if file extension is supported
    const extension = filePath.split('.').pop()?.toLowerCase();
    const languageMap = {
      js: 'javascript',
      ts: 'typescript',
      py: 'python',
      java: 'java',
      php: 'php',
      go: 'go',
      rs: 'rust',
      cpp: 'cpp',
      c: 'c',
      cs: 'csharp',
    };

    const language = languageMap[extension];
    return language && supportedLanguages.includes(language);
  }

  /**
   * Check if file path matches glob pattern
   */
  matchesPattern(filePath, pattern) {
    // Simple glob matching for common patterns
    if (pattern.includes('**')) {
      const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
      return regex.test(filePath);
    }

    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '[^/]*'));
      return regex.test(filePath);
    }

    return filePath.includes(pattern);
  }

  /**
   * Get code snippet around a specific line
   */
  getCodeSnippet(content, line, context = 3) {
    const lines = content.split('\n');
    const start = Math.max(0, line - context - 1);
    const end = Math.min(lines.length, line + context);

    const snippet = lines
      .slice(start, end)
      .map((codeLine, index) => {
        const lineNumber = start + index + 1;
        const isTargetLine = lineNumber === line;
        const prefix = isTargetLine ? '>>> ' : '    ';
        return `${prefix}${lineNumber.toString().padStart(4)}: ${codeLine}`;
      })
      .join('\n');

    return {
      snippet,
      startLine: start + 1,
      endLine: end,
      targetLine: line,
      context: context,
    };
  }

  /**
   * Calculate code complexity metrics
   */
  calculateComplexity(code) {
    let complexity = 1;

    // Count decision points
    const decisionKeywords = [
      'if',
      'else',
      'elseif',
      'for',
      'while',
      'do',
      'case',
      'catch',
      'finally',
      'try',
      'switch',
      '&&',
      '||',
      '?',
      ':',
    ];

    for (const keyword of decisionKeywords) {
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Only use word boundaries for alphanumeric keywords to avoid invalid regex (e.g. /\b?\b/)
      const isWord = /^\w+$/.test(keyword);
      const pattern = isWord ? `\\b${escapedKeyword}\\b` : escapedKeyword;
      const regex = new RegExp(pattern, 'g');
      const matches = code.match(regex);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  /**
   * Estimate maintainability index (simplified)
   */
  calculateMaintainabilityIndex(code) {
    const lines = code.split('\n').length;
    const complexity = this.calculateComplexity(code);
    const comments = (code.match(/\/\/.*|\/\*[\s\S]*?\*\//g) || []).length;

    // Simple maintainability calculation
    let maintainability = 100;
    maintainability -= Math.min(lines / 10, 20); // Penalize long files
    maintainability -= Math.min(complexity * 2, 30); // Penalize high complexity
    maintainability += Math.min((comments / lines) * 50, 10); // Reward comments

    return Math.max(0, Math.min(100, maintainability));
  }

  /**
   * Check for common security patterns
   */
  checkSecurityPatterns(code, filePath) {
    const securityPatterns = [
      {
        name: 'SQL Injection',
        pattern: /(SELECT|INSERT|UPDATE|DELETE).*\+.*|execute\s*\(\s*['"][^'"]*['"]/gi,
        severity: 'high',
        type: 'security',
      },
      {
        name: 'Hardcoded Password',
        pattern: /(password|passwd|pwd)\s*=\s*['"][^'"]+['"]/gi,
        severity: 'medium',
        type: 'security',
      },
      {
        name: 'API Key Exposure',
        pattern: /(api[_-]?key|secret[_-]?key|token)\s*=\s*['"][^'"]{20,}['"]/gi,
        severity: 'medium',
        type: 'security',
      },
      {
        name: 'Eval Usage',
        pattern: /\beval\s*\(/gi,
        severity: 'high',
        type: 'security',
      },
      {
        name: 'InnerHTML Usage',
        pattern: /\.innerHTML\s*=/gi,
        severity: 'medium',
        type: 'security',
      },
    ];

    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      for (const pattern of securityPatterns) {
        if (pattern.pattern.test(line)) {
          issues.push({
            severity: pattern.severity,
            type: pattern.type,
            title: pattern.name,
            message: `Potential ${pattern.name.toLowerCase()} vulnerability detected`,
            file: filePath,
            line: lineNum + 1,
            column: line.search(pattern.pattern) + 1,
            snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
            tags: ['security', 'vulnerability'],
          });
        }
        // Always reset lastIndex for global regexes
        if (pattern.pattern.global) {
          pattern.pattern.lastIndex = 0;
        }
      }
    }

    return issues;
  }

  /**
   * Format issue for output
   */
  formatIssue(issue) {
    return {
      ...issue,
      formatted: {
        severity: this.formatSeverity(issue.severity),
        location: `${issue.file}:${issue.line}${issue.column ? ':' + issue.column : ''}`,
        type: issue.type.toUpperCase(),
      },
    };
  }

  /**
   * Format severity for display
   */
  formatSeverity(severity) {
    const colors = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵',
      info: 'ℹ️',
    };
    return colors[severity] || 'ℹ️';
  }

  /**
   * Filter issues by severity
   */
  filterBySeverity(severities) {
    return this.issues.filter(issue => severities.includes(issue.severity));
  }

  /**
   * Sort issues by severity and line number
   */
  sortIssues() {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

    return this.issues.sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;

      if (a.file !== b.file) {
        return a.file.localeCompare(b.file);
      }

      return (a.line || 0) - (b.line || 0);
    });
  }

  /**
   * Clear all issues and reset stats
   */
  reset() {
    this.issues = [];
    this.stats = {
      filesAnalyzed: 0,
      linesAnalyzed: 0,
      issuesFound: 0,
      executionTime: 0,
    };
  }
}

export default BaseAnalyzer;

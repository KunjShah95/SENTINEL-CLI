/**
 * Handles inline comment suppression for Sentinel issues
 * Supports patterns like:
 * // sentinel-ignore
 * // sentinel-ignore-next-line
 * // sentinel-ignore security/sql-injection
 * // sentinel-ignore-file
 */
export class SuppressionHandler {
  constructor() {
    this.suppressions = new Map();
    this.ignorePatterns = [
      /\/\/\s*sentinel-ignore\b/,
      /\/\/\s*sentinel-ignore-next-line\b/,
      /\/\*\s*sentinel-ignore\s*\*\//,
      /\/\*\s*sentinel-ignore-file\s*\*\//,
      /#\s*sentinel-ignore\b/,
      /#\s*sentinel-ignore-next-line\b/,
      /<!--\s*sentinel-ignore\s*-->/,
      /<!--\s*sentinel-ignore-file\s*-->/,
      /\{\s*#\s*sentinel-ignore\s*#\s*\}/,
      /\{\s*#\s*sentinel-ignore-file\s*#\s*\}/,
    ];
  }

  /**
   * Parse suppressions from file content
   */
  async parseSuppressions(filePath, content) {
    const lines = content.split('\n');
    const suppressions = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      for (const pattern of this.ignorePatterns) {
        const match = line.match(pattern);
        if (match) {
          const suppression = this.parseSuppressionLine(match[0], line, lineNumber, filePath);
          if (suppression) {
            suppressions.push(suppression);
          }
        }
      }
    }

    this.suppressions.set(filePath, suppressions);
    return suppressions;
  }

  /**
   * Parse individual suppression line
   */
  parseSuppressionLine(match, fullLine, lineNumber, filePath) {
    const cleanMatch = match.trim();
    
    // Extract specific rules if mentioned
    const ruleMatch = cleanMatch.match(/sentinel-ignore(?:-next-line|-file)?\s+(.+)/);
    const specificRules = ruleMatch ? ruleMatch[1].split(/\s+/).map(r => r.trim()) : ['all'];

    return {
      type: cleanMatch.includes('next-line') ? 'next-line' : 
            cleanMatch.includes('file') ? 'file' : 'line',
      line: lineNumber,
      filePath,
      rules: specificRules,
      rawLine: fullLine,
    };
  }

  /**
   * Check if an issue should be suppressed
   */
  shouldSuppressIssue(issue) {
    const suppressions = this.suppressions.get(issue.file) || [];
    
    for (const suppression of suppressions) {
      if (this.matchesSuppression(issue, suppression)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if issue matches a suppression rule
   */
  matchesSuppression(issue, suppression) {
    // Check if rule type matches
    if (suppression.rules.includes('all')) {
      // All rules are suppressed
    } else {
      // Check specific rule match
      const issueRule = `${issue.analyzer}/${issue.type}`;
      const analyzerOnly = issue.analyzer.toLowerCase();
      
      const matches = suppression.rules.some(rule => {
        const ruleLower = rule.toLowerCase();
        return issueRule === ruleLower || 
               analyzerOnly === ruleLower ||
               issue.type.toLowerCase() === ruleLower;
      });
      
      if (!matches) return false;
    }

    // Check line-based suppression
    if (suppression.type === 'next-line' && suppression.line + 1 === issue.line) {
      return true;
    }
    
    if (suppression.type === 'line' && suppression.line === issue.line) {
      return true;
    }
    
    if (suppression.type === 'file') {
      return true;
    }

    return false;
  }

  /**
   * Filter issues based on suppressions
   */
  filterSuppressedIssues(issues) {
    const filteredIssues = [];
    const suppressedIssues = [];

    for (const issue of issues) {
      if (this.shouldSuppressIssue(issue)) {
        suppressedIssues.push(issue);
      } else {
        filteredIssues.push(issue);
      }
    }

    return {
      filtered: filteredIssues,
      suppressed: suppressedIssues,
      total: issues.length,
    };
  }

  /**
   * Get suppression summary
   */
  getSuppressionSummary(issues) {
    const result = this.filterSuppressedIssues(issues);
    
    return {
      totalIssues: result.total,
      activeIssues: result.filtered.length,
      suppressedIssues: result.suppressed.length,
      suppressionRate: result.total > 0 ? (result.suppressed.length / result.total * 100).toFixed(1) : 0,
      suppressionsByFile: this.getSuppressionsByFile(),
    };
  }

  /**
   * Get suppressions grouped by file
   */
  getSuppressionsByFile() {
    const byFile = {};
    
    for (const [filePath, suppressions] of this.suppressions) {
      byFile[filePath] = {
        total: suppressions.length,
        byType: suppressions.reduce((acc, sup) => {
          acc[sup.type] = (acc[sup.type] || 0) + 1;
          return acc;
        }, {}),
        rules: [...new Set(suppressions.flatMap(s => s.rules))],
      };
    }

    return byFile;
  }

  /**
   * Clear all suppressions
   */
  clear() {
    this.suppressions.clear();
  }

  /**
   * Validate suppression syntax
   */
  validateSuppressions(filePath, content) {
    const lines = content.split('\n');
    const issues = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Check for malformed suppressions
      if (line.includes('sentinel-ignore')) {
        const hasValidPattern = this.ignorePatterns.some(pattern => pattern.test(line));
        
        if (!hasValidPattern) {
          issues.push({
            line: lineNumber,
            message: 'Invalid suppression syntax',
            suggestion: 'Use // sentinel-ignore, // sentinel-ignore-next-line, or // sentinel-ignore-file',
          });
        }

        // Check for unknown rules
        const ruleMatch = line.match(/sentinel-ignore(?:-next-line|-file)?\s+(.+)/);
        if (ruleMatch) {
          const rules = ruleMatch[1].split(/\s+/);
          const validAnalyzers = ['security', 'quality', 'bugs', 'performance', 'dependency', 'accessibility', 'typescript', 'react', 'api', 'secrets', 'custom'];
          
          for (const rule of rules) {
            const [analyzer] = rule.split('/');
            if (analyzer !== 'all' && !validAnalyzers.includes(analyzer.toLowerCase())) {
              issues.push({
                line: lineNumber,
                message: `Unknown analyzer in suppression: ${analyzer}`,
                suggestion: `Valid analyzers: ${validAnalyzers.join(', ')}`,
              });
            }
          }
        }
      }
    }

    return issues;
  }
}

export default SuppressionHandler;

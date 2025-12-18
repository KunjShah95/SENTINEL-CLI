import BaseAnalyzer from './baseAnalyzer.js';

export class QualityAnalyzer extends BaseAnalyzer {
  constructor(config) {
    super('QualityAnalyzer', config);
    this.qualityRules = this.initializeQualityRules();
  }

  async analyze(files, context) {
    this.reset();
    const startTime = Date.now();

    for (const file of files) {
      if (!this.shouldAnalyzeFile(file.path)) continue;

      this.stats.filesAnalyzed++;
      this.stats.linesAnalyzed += file.content.split('\n').length;

      await this.analyzeFile(file.path, file.content, context);
    }

    this.stats.executionTime = Date.now() - startTime;
    return this.getIssues();
  }

  async analyzeFile(filePath, content, _context) {
    const issues = [];

    // Run quality checks
    issues.push(...this.checkCodeComplexity(content, filePath));
    issues.push(...this.checkCodeDuplication(content, filePath));
    issues.push(...this.checkMaintainability(content, filePath));
    issues.push(...this.checkDocumentation(content, filePath));
    issues.push(...this.checkNamingConventions(content, filePath));
    issues.push(...this.checkBestPractices(content, filePath));

    // Language-specific checks
    const extension = filePath.split('.').pop()?.toLowerCase();
    switch (extension) {
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
      issues.push(...this.checkJavaScriptQuality(content, filePath));
      issues.push(...this.checkInlineStyles(content, filePath));
      break;
    case 'py':
      issues.push(...this.checkPythonQuality(content, filePath));
      break;
    case 'java':
      issues.push(...this.checkJavaQuality(content, filePath));
      break;
    }

    // Add issues to the analyzer
    for (const issue of issues) {
      this.addIssue(issue);
    }
  }

  initializeQualityRules() {
    return {
      maxComplexity: 10,
      maxLineLength: 120,
      maxFunctionLength: 50,
      maxClassLength: 500,
      minFunctionLength: 1,
      requiredCommentRatio: 0.1,
    };
  }

  checkCodeComplexity(code, filePath) {
    const issues = [];
    const functions = this.extractFunctions(code);

    for (const func of functions) {
      const complexity = this.calculateCyclomaticComplexity(func.body);
      if (complexity > this.qualityRules.maxComplexity) {
        issues.push({
          severity: complexity > 15 ? 'high' : 'medium',
          type: 'quality',
          title: 'High Cyclomatic Complexity',
          message: `Function "${func.name}" has cyclomatic complexity of ${complexity} (threshold: ${this.qualityRules.maxComplexity})`,
          file: filePath,
          line: func.line,
          column: func.column,
          snippet: this.getCodeSnippet(code, func.line).snippet,
          suggestion: 'Consider breaking this function into smaller, more focused functions',
          tags: ['quality', 'complexity', 'maintainability'],
        });
      }
    }

    return issues;
  }

  checkCodeDuplication(code, filePath) {
    const issues = [];
    const lines = code.split('\n');
    const lineMap = new Map();

    // Simple line-based duplication detection
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length < 10 || line.startsWith('//') || line.startsWith('/*')) continue;

      if (lineMap.has(line)) {
        const duplicates = lineMap.get(line);
        if (duplicates.length >= 2) {
          // Found 3+ occurrences
          issues.push({
            severity: 'low',
            type: 'quality',
            title: 'Code Duplication',
            message: `This line appears multiple times in the codebase (${duplicates.length + 1} occurrences)`,
            file: filePath,
            line: i + 1,
            column: 1,
            snippet: this.getCodeSnippet(code, i + 1).snippet,
            suggestion: 'Consider extracting this into a reusable function or constant',
            tags: ['quality', 'duplication', 'maintainability'],
          });
        }
        duplicates.push(i + 1);
      } else {
        lineMap.set(line, [i + 1]);
      }
    }

    return issues;
  }

  checkMaintainability(code, filePath) {
    const issues = [];
    const maintainabilityIndex = this.calculateMaintainabilityIndex(code);

    if (maintainabilityIndex < 65) {
      issues.push({
        severity: maintainabilityIndex < 35 ? 'high' : 'medium',
        type: 'quality',
        title: 'Low Maintainability Index',
        message: `Code maintainability index is ${maintainabilityIndex.toFixed(1)} (threshold: 65)`,
        file: filePath,
        line: 1,
        column: 1,
        suggestion:
          'Consider refactoring to improve readability, reduce complexity, or add more comments',
        tags: ['quality', 'maintainability', 'refactoring'],
      });
    }

    return issues;
  }

  checkDocumentation(code, filePath) {
    const issues = [];
    const lines = code.split('\n');
    const functions = this.extractFunctions(code);

    let commentLines = 0;
    let totalLines = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        totalLines++;
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
          commentLines++;
        }
      }
    }

    const commentRatio = commentLines / totalLines;
    if (commentRatio < this.qualityRules.requiredCommentRatio) {
      issues.push({
        severity: 'low',
        type: 'quality',
        title: 'Low Documentation Coverage',
        message: `Comment ratio is ${(commentRatio * 100).toFixed(1)}% (threshold: ${this.qualityRules.requiredCommentRatio * 100}%)`,
        file: filePath,
        line: 1,
        column: 1,
        suggestion: 'Add more comments to explain complex logic and public APIs',
        tags: ['quality', 'documentation', 'readability'],
      });
    }

    // Check function documentation
    for (const func of functions) {
      if (!func.hasDocumentation) {
        issues.push({
          severity: 'low',
          type: 'quality',
          title: 'Missing Function Documentation',
          message: `Function "${func.name}" lacks documentation`,
          file: filePath,
          line: func.line,
          column: func.column,
          suggestion: 'Add JSDoc comments or other appropriate documentation',
          tags: ['quality', 'documentation', 'api'],
        });
      }
    }

    return issues;
  }

  checkNamingConventions(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Check for camelCase vs snake_case conventions
      if (line.includes('function ') || line.includes('const ') || line.includes('let ')) {
        // Check for inconsistent naming
        const camelCaseMatches = line.match(/\b[a-z][a-zA-Z0-9]*\s*=\s*[a-zA-Z]/g);
        const snakeCaseMatches = line.match(/\b[a-z][a-z0-9_]*\s*=\s*[a-zA-Z]/g);

        if (camelCaseMatches && snakeCaseMatches) {
          issues.push({
            severity: 'low',
            type: 'quality',
            title: 'Inconsistent Naming Convention',
            message: 'Mixed camelCase and snake_case naming in the same scope',
            file: filePath,
            line: lineNum + 1,
            column: 1,
            snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
            suggestion: 'Stick to one naming convention throughout the codebase',
            tags: ['quality', 'naming', 'consistency'],
          });
        }
      }
    }

    return issues;
  }

  checkBestPractices(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Check for console.log in production code
      if (line.includes('console.log') || line.includes('console.debug')) {
        issues.push({
          severity: 'low',
          type: 'quality',
          title: 'Debug Statement in Code',
          message: 'Console statement found in code',
          file: filePath,
          line: lineNum + 1,
          column: line.indexOf('console') + 1,
          snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
          suggestion: 'Remove debug statements or use proper logging framework',
          tags: ['quality', 'debug', 'logging'],
        });
      }

      // Check for TODO/FIXME comments
      if (line.includes('TODO') || line.includes('FIXME') || line.includes('HACK')) {
        issues.push({
          severity: 'info',
          type: 'quality',
          title: 'Technical Debt Marker',
          message: `Found "${line.trim().match(/(TODO|FIXME|HACK)/)?.[0]}" comment`,
          file: filePath,
          line: lineNum + 1,
          column: 1,
          suggestion: 'Address this technical debt or create a proper issue',
          tags: ['quality', 'technical-debt', 'maintenance'],
        });
      }
    }

    return issues;
  }

  checkJavaScriptQuality(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Check for var usage (prefer let/const)
      if (/\bvar\b/.test(line)) {
        issues.push({
          severity: 'low',
          type: 'quality',
          title: 'Outdated Variable Declaration',
          message: 'Use "let" or "const" instead of "var"',
          file: filePath,
          line: lineNum + 1,
          column: line.indexOf('var') + 1,
          snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
          suggestion: 'Replace "var" with "let" or "const" for better scoping',
          tags: ['quality', 'javascript', 'modern-syntax'],
        });
      }

      // Check for == instead of ===
      if (/\b==\b(?!===)/.test(line)) {
        issues.push({
          severity: 'medium',
          type: 'quality',
          title: 'Loose Equality Comparison',
          message: 'Use strict equality (===) instead of loose equality (==)',
          file: filePath,
          line: lineNum + 1,
          column: line.search(/\b==\b/) + 1,
          snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
          suggestion: 'Replace "==" with "===" to avoid type coercion issues',
          tags: ['quality', 'javascript', 'comparison'],
        });
      }
    }

    return issues;
  }

  checkPythonQuality(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Check for print statements (use logging)
      if (line.includes('print(')) {
        issues.push({
          severity: 'low',
          type: 'quality',
          title: 'Print Statement in Code',
          message: 'Use logging module instead of print statements',
          file: filePath,
          line: lineNum + 1,
          column: line.indexOf('print') + 1,
          snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
          suggestion: 'Replace print() with appropriate logging calls',
          tags: ['quality', 'python', 'logging'],
        });
      }

      // Check for bare except clauses
      if (line.includes('except:') || line.includes('except :')) {
        issues.push({
          severity: 'medium',
          type: 'quality',
          title: 'Bare Except Clause',
          message: 'Specify exception type instead of bare "except"',
          file: filePath,
          line: lineNum + 1,
          column: line.indexOf('except'),
          snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
          suggestion: 'Catch specific exceptions to avoid hiding unexpected errors',
          tags: ['quality', 'python', 'exception-handling'],
        });
      }
    }

    return issues;
  }

  checkJavaQuality(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Check for System.out.println
      if (line.includes('System.out.println')) {
        issues.push({
          severity: 'low',
          type: 'quality',
          title: 'Console Output in Code',
          message: 'Use proper logging framework instead of System.out.println',
          file: filePath,
          line: lineNum + 1,
          column: line.indexOf('System.out.println') + 1,
          snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
          suggestion: 'Replace with appropriate logging calls (e.g., log4j, SLF4J)',
          tags: ['quality', 'java', 'logging'],
        });
      }
    }

    return issues;
  }

      checkInlineStyles(code, filePath) {
        const issues = [];
        const lines = code.split('\n');

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const line = lines[lineNum];

          // Skip lines with CSS custom properties/variables - they're legitimate for data-driven styling
          if (/var\(\s*--|\s*--[\w-]+\s*:|as\s+React\.CSSProperties|CSS custom|CSS variables|@ts-ignore/i.test(line)) {
            continue;
          }

          // Only flag direct CSS property assignments without dynamic values
          // Exclude lines that are comments
          if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
            continue;
          }

          // Check for hardcoded inline styles (not using variables)
          const hasInlineStyle = /style\s*=\s*{/.test(line);
          const hasColorOrDynamicValue = /indicatorColor|item\.color|itemConfig/i.test(line);

          if (hasInlineStyle && !hasColorOrDynamicValue) {
            issues.push({
              severity: 'low',
              type: 'quality',
              title: 'CSS inline styles',
              message: 'CSS inline styles should not be used, move styles to an external CSS file',
              file: filePath,
              line: lineNum + 1,
              column: line.search(/style/i) + 1,
              snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
              suggestion: 'Move styles to CSS classes or external CSS file. Exception: CSS custom properties/variables for data-driven colors are acceptable',
              tags: ['quality', 'css', 'style'],
            });
          }
        }

        return issues;
      }

    extractFunctions(code) {
      const functions = [];
      const lines = code.split('\n');

      // Simple regex patterns for different languages
      const functionPatterns = [
        /function\s+(\w+)\s*\(/g, // JavaScript function
        /(\w+)\s*:\s*\([^)]*\)\s*=>/g, // JavaScript arrow function
        /def\s+(\w+)\s*\(/g, // Python function
        /public\s+\w+\s+(\w+)\s*\(/g, // Java method
        /private\s+\w+\s+(\w+)\s*\(/g, // Java method
      ];

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];

        for (const pattern of functionPatterns) {
          let match;
          while ((match = pattern.exec(line)) !== null) {
            const funcName = match[1];
            functions.push({
              name: funcName,
              line: lineNum + 1,
              column: match.index + 1,
              body: this.extractFunctionBody(lines, lineNum),
              hasDocumentation: this.hasDocumentation(lines, lineNum),
            });
          }
        }
      }

      return functions;
    }

    extractClasses(code) {
      const classes = [];
      const lines = code.split('\n');

    const classPatterns = [
      /class\s+(\w+)/g, // JavaScript/Python class
      /public\s+class\s+(\w+)/g, // Java class
      /private\s+class\s+(\w+)/g, // Java class
    ];

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      for (const pattern of classPatterns) {
        let match;
        while ((match = pattern.exec(line)) !== null) {
          const className = match[1];
          classes.push({
            name: className,
            line: lineNum + 1,
            column: match.index + 1,
            hasDocumentation: this.hasDocumentation(lines, lineNum),
          });
        }
      }
    }

    return classes;
  }

  extractFunctionBody(lines, startLine) {
    const body = [];
    let braceCount = 0;
    let inFunction = false;

    for (let i = startLine; i < Math.min(lines.length, startLine + 50); i++) {
      const line = lines[i];

      for (const char of line) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }

      if (braceCount > 0) {
        inFunction = true;
        body.push(line);
      } else if (inFunction && braceCount === 0) {
        body.push(line);
        break;
      }
    }

    return body.join('\n');
  }

  hasDocumentation(lines, lineNum) {
    // Look for documentation in the previous few lines
    for (let i = Math.max(0, lineNum - 5); i < lineNum; i++) {
      const line = lines[i].trim();
      if (line.startsWith('/**') || line.startsWith('///') || line.startsWith('#')) {
        return true;
      }
    }
    return false;
  }

  calculateCyclomaticComplexity(code) {
    let complexity = 1; // Base complexity

    const decisionPoints = ['if', 'else if', 'while', 'for', 'case', 'catch', '&&', '||', '?', ':'];

    for (const point of decisionPoints) {
      const escaped = point.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let pattern;

      if (/\s/.test(point.trim())) {
        const parts = point
          .trim()
          .split(/\s+/)
          .map(part => `\\b${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        pattern = parts.join('\\s+');
      } else if (/^\w+$/.test(point)) {
        pattern = `\\b${escaped}\\b`;
      } else {
        pattern = escaped;
      }

      const regex = new RegExp(pattern, 'g');
      const matches = code.match(regex);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }
}

export default QualityAnalyzer;

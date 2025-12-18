import BaseAnalyzer from './baseAnalyzer.js';

export class PerformanceAnalyzer extends BaseAnalyzer {
  constructor(config) {
    super('PerformanceAnalyzer', config);
    this.performancePatterns = this.initializePerformancePatterns();
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

    // Run performance checks
    issues.push(...this.checkInefficientPatterns(content, filePath));
    issues.push(...this.checkMemoryIssues(content, filePath));
    issues.push(...this.checkAlgorithmicComplexity(content, filePath));
    issues.push(...this.checkResourceUsage(content, filePath));

    // Language-specific performance checks
    const extension = filePath.split('.').pop()?.toLowerCase();
    switch (extension) {
    case 'js':
    case 'ts':
      issues.push(...this.checkJavaScriptPerformance(content, filePath));
      break;
    case 'py':
      issues.push(...this.checkPythonPerformance(content, filePath));
      break;
    case 'java':
      issues.push(...this.checkJavaPerformance(content, filePath));
      break;
    }

    // Add issues to the analyzer
    for (const issue of issues) {
      this.addIssue(issue);
    }
  }

  initializePerformancePatterns() {
    return {
      inefficientLoops: {
        patterns: [
          /for\s*\(\s*var\s+i\s*=\s*0\s*;\s*i\s*<\s*.*\.length\s*;/gi,
          /while\s*\([^)]*\.length/gi,
          /\.forEach\s*\(\s*function/gi,
        ],
        severity: 'medium',
        type: 'performance',
      },

      stringConcatenation: {
        patterns: [/\w+\s*\+=\s*['"]/gi, /String\s*\(\s*\w+\s*\)/gi],
        severity: 'low',
        type: 'performance',
      },

      unnecessaryObjectCreation: {
        patterns: [/new\s+Object\s*\(\)/gi, /new\s+Array\s*\(\s*\)/gi],
        severity: 'low',
        type: 'performance',
      },
    };
  }

  checkInefficientPatterns(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    for (const [patternType, config] of Object.entries(this.performancePatterns)) {
      for (const pattern of config.patterns) {
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const line = lines[lineNum];

          if (pattern.test(line)) {
            issues.push({
              severity: config.severity,
              type: config.type,
              title: this.getPerformanceTitle(patternType),
              message: this.getPerformanceMessage(patternType),
              file: filePath,
              line: lineNum + 1,
              column: line.search(pattern) + 1,
              snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
              suggestion: this.getPerformanceSuggestion(patternType),
              tags: ['performance', 'optimization', patternType],
            });
          }

          // Always reset regex lastIndex
          if (pattern.global) {
            pattern.lastIndex = 0;
          }
        }
      }
    }

    return issues;
  }

  checkMemoryIssues(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Check for large object allocations in loops
      if (line.includes('for') && line.includes('new')) {
        issues.push({
          severity: 'medium',
          type: 'performance',
          title: 'Object Allocation in Loop',
          message: 'Creating objects inside loops can cause memory pressure',
          file: filePath,
          line: lineNum + 1,
          column: line.search(/new/),
          snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
          suggestion: 'Move object creation outside the loop or use object pooling',
          tags: ['performance', 'memory', 'allocation'],
        });
      }

      // Check for array.push in nested loops
      if (line.includes('.push(') && lineNum > 0) {
        const prevLines = lines.slice(Math.max(0, lineNum - 10), lineNum);
        const hasNestedLoop = prevLines.some(
          prevLine => prevLine.includes('for') || prevLine.includes('while')
        );

        if (hasNestedLoop) {
          issues.push({
            severity: 'low',
            type: 'performance',
            title: 'Array Modification in Nested Loop',
            message: 'Modifying arrays in nested loops can be inefficient',
            file: filePath,
            line: lineNum + 1,
            column: line.search(/\.push/),
            snippet: this.getCodeSnippet(code, lineNum + 1, 2).snippet,
            suggestion:
              'Consider pre-allocating array size or using more efficient data structures',
            tags: ['performance', 'array', 'optimization'],
          });
        }
      }
    }

    return issues;
  }

  checkAlgorithmicComplexity(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    // Check for nested loops (potential O(n^k) complexity)
    let loopDepth = 0;
    let maxLoopDepth = 0;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      if (line.includes('for') || line.includes('while')) {
        loopDepth++;
        maxLoopDepth = Math.max(maxLoopDepth, loopDepth);
      }

      if (line.includes('}') && loopDepth > 0) {
        loopDepth--;
      }

      if (maxLoopDepth >= 3) {
        issues.push({
          severity: 'medium',
          type: 'performance',
          title: 'High Cyclomatic Complexity',
          message: `Nested loops detected (depth: ${maxLoopDepth}) - potential O(n^${maxLoopDepth}) complexity`,
          file: filePath,
          line: lineNum + 1,
          column: 1,
          snippet: this.getCodeSnippet(code, lineNum + 1, 3).snippet,
          suggestion: 'Consider optimizing the algorithm or using more efficient data structures',
          tags: ['performance', 'complexity', 'algorithm'],
        });
        break; // Only report once per file
      }
    }

    return issues;
  }

  checkResourceUsage(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Check for blocking operations
      if (line.includes('Thread.sleep') || line.includes('time.sleep')) {
        issues.push({
          severity: 'medium',
          type: 'performance',
          title: 'Blocking Operation',
          message: 'Sleep/delay operations can block execution threads',
          file: filePath,
          line: lineNum + 1,
          column: line.search(/sleep/),
          snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
          suggestion: 'Use asynchronous operations or non-blocking alternatives',
          tags: ['performance', 'blocking', 'async'],
        });
      }

      // Check for synchronous file I/O
      if (line.includes('fs.readFileSync') || line.includes('FileInputStream')) {
        issues.push({
          severity: 'medium',
          type: 'performance',
          title: 'Synchronous I/O Operation',
          message: 'Synchronous file operations can block the event loop',
          file: filePath,
          line: lineNum + 1,
          column: line.search(/readFileSync|FileInputStream/),
          snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
          suggestion: 'Use asynchronous I/O operations for better performance',
          tags: ['performance', 'io', 'async'],
        });
      }
    }

    return issues;
  }

  checkJavaScriptPerformance(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Check for querySelector in loops
      if (line.includes('querySelector') && lineNum > 0) {
        const prevLines = lines.slice(Math.max(0, lineNum - 10), lineNum);
        const hasLoop = prevLines.some(
          prevLine => prevLine.includes('for') || prevLine.includes('while')
        );

        if (hasLoop) {
          issues.push({
            severity: 'medium',
            type: 'performance',
            title: 'DOM Query in Loop',
            message: 'Repeated DOM queries inside loops are inefficient',
            file: filePath,
            line: lineNum + 1,
            column: line.search(/querySelector/),
            snippet: this.getCodeSnippet(code, lineNum + 1, 2).snippet,
            suggestion: 'Cache DOM elements outside loops for better performance',
            tags: ['performance', 'dom', 'optimization'],
          });
        }
      }

      // Check for eval usage
      if (line.includes('eval(')) {
        issues.push({
          severity: 'high',
          type: 'performance',
          title: 'Eval Usage',
          message: 'eval() is slow and can be a security risk',
          file: filePath,
          line: lineNum + 1,
          column: line.search(/eval/),
          snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
          suggestion: 'Avoid eval() - use alternatives like JSON.parse() or Function constructor',
          tags: ['performance', 'security', 'eval'],
        });
      }
    }

    return issues;
  }

  checkPythonPerformance(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Check for string concatenation in loop
      if (line.includes('+= ') && line.includes('str')) {
        const prevLines = lines.slice(Math.max(0, lineNum - 5), lineNum);
        const hasLoop = prevLines.some(
          prevLine => prevLine.includes('for') || prevLine.includes('while')
        );

        if (hasLoop) {
          issues.push({
            severity: 'medium',
            type: 'performance',
            title: 'String Concatenation in Loop',
            message: 'String concatenation in loops creates many intermediate objects',
            file: filePath,
            line: lineNum + 1,
            column: line.search(/[+=]/),
            snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
            suggestion: 'Use list.append() and join() for better performance',
            tags: ['performance', 'string', 'optimization'],
          });
        }
      }
    }

    return issues;
  }

  checkJavaPerformance(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Check for string concatenation in loop
      if (line.includes('+=') && line.includes('String')) {
        const prevLines = lines.slice(Math.max(0, lineNum - 5), lineNum);
        const hasLoop = prevLines.some(
          prevLine => prevLine.includes('for') || prevLine.includes('while')
        );

        if (hasLoop) {
          issues.push({
            severity: 'medium',
            type: 'performance',
            title: 'String Concatenation in Loop',
            message: 'String concatenation in loops creates many String objects',
            file: filePath,
            line: lineNum + 1,
            column: line.search(/[+=]/),
            snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
            suggestion: 'Use StringBuilder for better performance',
            tags: ['performance', 'string', 'optimization'],
          });
        }
      }
    }

    return issues;
  }

  getPerformanceTitle(patternType) {
    const titles = {
      inefficientLoops: 'Inefficient Loop Pattern',
      stringConcatenation: 'Inefficient String Operation',
      unnecessaryObjectCreation: 'Unnecessary Object Creation',
    };
    return titles[patternType] || 'Performance Issue';
  }

  getPerformanceMessage(patternType) {
    const messages = {
      inefficientLoops: 'This loop pattern may be inefficient for large datasets',
      stringConcatenation: 'String concatenation can be optimized',
      unnecessaryObjectCreation: 'Creating unnecessary objects can impact performance',
    };
    return messages[patternType] || 'Potential performance issue detected';
  }

  getPerformanceSuggestion(patternType) {
    const suggestions = {
      inefficientLoops: 'Consider using more efficient iteration methods or data structures',
      stringConcatenation: 'Use StringBuilder, join(), or template literals for better performance',
      unnecessaryObjectCreation: 'Reuse objects or use object pooling when possible',
    };
    return suggestions[patternType] || 'Consider optimizing this code for better performance';
  }
}

export default PerformanceAnalyzer;

import BaseAnalyzer from './baseAnalyzer.js';

export class BugAnalyzer extends BaseAnalyzer {
  constructor(config) {
    super('BugAnalyzer', config);
    this.bugPatterns = this.initializeBugPatterns();
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

    // Run bug detection checks
    issues.push(...this.checkCommonBugs(content, filePath));
    issues.push(...this.checkLogicErrors(content, filePath));
    issues.push(...this.checkResourceLeaks(content, filePath));
    issues.push(...this.checkNullHandling(content, filePath));
    issues.push(...this.checkConcurrencyIssues(content, filePath));
    issues.push(...this.checkMemoryLeaks(content, filePath));

    // Language-specific bug checks
    const extension = filePath.split('.').pop()?.toLowerCase();
    switch (extension) {
    case 'js':
    case 'ts':
      issues.push(...this.checkJavaScriptBugs(content, filePath));
      break;
    case 'py':
      issues.push(...this.checkPythonBugs(content, filePath));
      break;
    case 'java':
      issues.push(...this.checkJavaBugs(content, filePath));
      break;
    case 'php':
      issues.push(...this.checkPHPBugs(content, filePath));
      break;
    }

    // Run security vulnerability checks (regex based)
    issues.push(...this.checkSecurityVulnerabilities(content, filePath));
    if (extension === 'py') {
      issues.push(...this.checkPythonSecurityVulnerabilities(content, filePath));
    }

    // Add issues to the analyzer
    for (const issue of issues) {
      this.addIssue(issue);
    }
  }

  initializeBugPatterns() {
    return {
      // Common programming bugs across languages
      nullPointer: {
        patterns: [/null\./gi, /\.get\(null\)/gi, /\[\s*null\s*\]/gi, /null\s*\./gi],
        severity: 'high',
        type: 'bug',
      },

      divisionByZero: {
        patterns: [/\/\s*0(\s|$|\))/gi, /%\s*0(\s|$|\))/gi],
        severity: 'high',
        type: 'bug',
      },

      infiniteLoop: {
        patterns: [/for\s*\(\s*;;\s*\)/gi, /while\s*\(\s*true\s*\)/gi, /while\s*\(\s*1\s*\)/gi],
        severity: 'medium',
        type: 'bug',
      },

      arrayIndexOutOfBounds: {
        patterns: [/\[.*\]\[.*\]/gi, /arr\[.*length.*\]/gi, /list\[.*\.size\(\).*\]/gi],
        severity: 'high',
        type: 'bug',
      },

      resourceLeak: {
        patterns: [
          /new\s+FileInputStream\s*\([^)]*\)/gi,
          /new\s+FileOutputStream\s*\([^)]*\)/gi,
          /open\s*\([^)]*\)(?!.*close)/gi,
          /fopen\s*\([^)]*\)(?!.*fclose)/gi,
        ],
        severity: 'medium',
        type: 'bug',
      },
    };
  }

  checkCommonBugs(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    // Check for common bug patterns
    for (const [bugType, config] of Object.entries(this.bugPatterns)) {
      for (const pattern of config.patterns) {
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const line = lines[lineNum];

          if (pattern.test(line)) {
            issues.push({
              severity: config.severity,
              type: config.type,
              title: this.getBugTitle(bugType),
              message: this.getBugMessage(bugType),
              file: filePath,
              line: lineNum + 1,
              column: line.search(pattern) + 1,
              snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
              suggestion: this.getBugSuggestion(bugType),
              tags: ['bug', 'common', bugType],
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

  checkLogicErrors(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Check for assignment in condition (common typo)
      if (/=\s*[^!<>]=/.test(line) && /if|while|for/.test(line)) {
        issues.push({
          severity: 'medium',
          type: 'bug',
          title: 'Assignment in Condition',
          message: 'Possible assignment instead of comparison in conditional statement',
          file: filePath,
          line: lineNum + 1,
          column: line.search(/[^=]=/),
          snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
          suggestion: 'Use == for comparison, = for assignment',
          tags: ['bug', 'logic', 'condition'],
        });
      }

      // Check for missing break statements in switch
      if (line.includes('case ') || line.includes('default:')) {
        const nextLines = lines.slice(lineNum + 1, lineNum + 10);
        const hasBreak = nextLines.some(nextLine => nextLine.includes('break'));
        const hasReturn = nextLines.some(nextLine => nextLine.includes('return'));
        const hasThrow = nextLines.some(nextLine => nextLine.includes('throw'));

        if (!hasBreak && !hasReturn && !hasThrow) {
          issues.push({
            severity: 'medium',
            type: 'bug',
            title: 'Missing Break Statement',
            message: 'Switch case may be missing break statement',
            file: filePath,
            line: lineNum + 1,
            column: line.indexOf('case'),
            snippet: this.getCodeSnippet(code, lineNum + 1, 5).snippet,
            suggestion: 'Add break statement to prevent fall-through',
            tags: ['bug', 'switch', 'fallthrough'],
          });
        }
      }

      // Check for off-by-one errors
      if (line.includes('<=') || line.includes('>=')) {
        if (/\[.*\]\s*[<>]=\s*[.\w]+/.test(line)) {
          issues.push({
            severity: 'low',
            type: 'bug',
            title: 'Potential Off-by-One Error',
            message: 'Check array bounds in conditional expression',
            file: filePath,
            line: lineNum + 1,
            column: line.search(/[<>]=/),
            snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
            suggestion: 'Verify array index boundaries',
            tags: ['bug', 'bounds', 'array'],
          });
        }
      }
    }

    return issues;
  }

  checkResourceLeaks(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Check for file handle openings without proper closing
      if (line.includes('fopen') || line.includes('open') || line.includes('FileInputStream')) {
        // Look for corresponding close in next 50 lines
        const followingLines = lines.slice(lineNum + 1, lineNum + 51);
        const hasClose = followingLines.some(
          followingLine =>
            followingLine.includes('fclose') ||
            followingLine.includes('close') ||
            followingLine.includes('close()')
        );

        if (!hasClose) {
          issues.push({
            severity: 'medium',
            type: 'bug',
            title: 'Potential Resource Leak',
            message: 'Resource opened but may not be properly closed',
            file: filePath,
            line: lineNum + 1,
            column: line.indexOf('open') + 1,
            snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
            suggestion: 'Ensure proper resource cleanup with try-finally or using statements',
            tags: ['bug', 'resource', 'leak'],
          });
        }
      }

      // Check for database connections
      if (line.includes('Connection') || line.includes('connect')) {
        const followingLines = lines.slice(lineNum + 1, lineNum + 101);
        const hasClose = followingLines.some(
          followingLine => followingLine.includes('close') || followingLine.includes('disconnect')
        );

        if (!hasClose) {
          issues.push({
            severity: 'high',
            type: 'bug',
            title: 'Potential Database Connection Leak',
            message: 'Database connection may not be properly closed',
            file: filePath,
            line: lineNum + 1,
            column: line.search(/connect|Connection/) + 1,
            snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
            suggestion: 'Close database connections in finally block or use connection pooling',
            tags: ['bug', 'database', 'resource'],
          });
        }
      }
    }

    return issues;
  }

  checkNullHandling(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Check for direct method calls on potentially null objects
      if (/\w+\.\w+\(/.test(line) && !line.includes('if') && !line.includes('&&')) {
        if (!/new\s+\w+/.test(line) && !line.includes('getElementById')) {
          issues.push({
            severity: 'medium',
            type: 'bug',
            title: 'Potential Null Pointer Dereference',
            message: 'Method called on object that might be null',
            file: filePath,
            line: lineNum + 1,
            column: line.search(/\w+\.\w+\(/),
            snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
            suggestion: 'Add null check before method call',
            tags: ['bug', 'null', 'dereference'],
          });
        }
      }

      // Check for array access without null check
      if (/\[\s*\w+\s*\]/.test(line) && !line.includes('if')) {
        if (!/new\s+\w+/.test(line)) {
          issues.push({
            severity: 'medium',
            type: 'bug',
            title: 'Potential Null Array Access',
            message: 'Array access without null check',
            file: filePath,
            line: lineNum + 1,
            column: line.search(/\[\s*\w+\s*\]/),
            snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
            suggestion: 'Add null check before array access',
            tags: ['bug', 'null', 'array'],
          });
        }
      }
    }

    return issues;
  }

  checkConcurrencyIssues(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Check for unsynchronized access to shared variables
      if (
        line.includes('++') ||
        line.includes('--') ||
        line.includes('+= ') ||
        line.includes('-= ')
      ) {
        const varName = line.match(/(\w+)\s*[+-]{2}/) || line.match(/(\w+)\s*[+-]=/);
        if (varName) {
          // Check if this variable is used elsewhere without synchronization
          const allLines = lines.join('\n');
          const unsynchronizedAccess =
            allLines.includes(varName[1]) &&
            !allLines.includes('synchronized') &&
            !allLines.includes('lock') &&
            !allLines.includes('mutex');

          if (unsynchronizedAccess) {
            issues.push({
              severity: 'medium',
              type: 'bug',
              title: 'Potential Race Condition',
              message: 'Unsynchronized access to shared variable',
              file: filePath,
              line: lineNum + 1,
              column: line.search(varName[1]),
              snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
              suggestion: 'Add synchronization for shared variable access',
              tags: ['bug', 'concurrency', 'race-condition'],
            });
          }
        }
      }
    }

    return issues;
  }

  checkMemoryLeaks(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Check for event listeners without removal
      if (line.includes('addEventListener') || line.includes('on(')) {
        const followingLines = lines.slice(lineNum + 1, lineNum + 51);
        const hasRemoval = followingLines.some(
          followingLine =>
            followingLine.includes('removeEventListener') || followingLine.includes('off(')
        );

        if (!hasRemoval) {
          issues.push({
            severity: 'medium',
            type: 'bug',
            title: 'Potential Memory Leak',
            message: 'Event listener added but may not be properly removed',
            file: filePath,
            line: lineNum + 1,
            column: line.search(/addEventListener|on\(/),
            snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
            suggestion: 'Remove event listeners when no longer needed',
            tags: ['bug', 'memory', 'leak'],
          });
        }
      }
    }

    return issues;
  }

  checkJavaScriptBugs(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Check for == vs === confusion
      if (line.includes('==') && !line.includes('===') && !line.includes('!==')) {
        issues.push({
          severity: 'medium',
          type: 'bug',
          title: 'Loose Equality Comparison',
          message: 'Use strict equality (===) to avoid type coercion bugs',
          file: filePath,
          line: lineNum + 1,
          column: line.search(/==/),
          snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
          suggestion: 'Replace == with === for strict equality',
          tags: ['bug', 'javascript', 'comparison'],
        });
      }

      // Check for array mutation in forEach
      if (line.includes('.forEach') && !line.includes('const ') && !line.includes('let ')) {
        const followingLine = lines[lineNum + 1];
        if (
          followingLine &&
          (followingLine.includes('push') ||
            followingLine.includes('pop') ||
            followingLine.includes('shift'))
        ) {
          issues.push({
            severity: 'medium',
            type: 'bug',
            title: 'Array Mutation in forEach',
            message: 'Modifying array during iteration can cause unexpected behavior',
            file: filePath,
            line: lineNum + 1,
            column: line.search(/\.forEach/),
            snippet: this.getCodeSnippet(code, lineNum + 1, 2).snippet,
            suggestion: 'Use for loop or filter method instead',
            tags: ['bug', 'javascript', 'iteration'],
          });
        }
      }

      // Check for accidental global variables
      if (
        line.match(/\w+\s*=/) &&
        !line.includes('var') &&
        !line.includes('let') &&
        !line.includes('const')
      ) {
        issues.push({
          severity: 'medium',
          type: 'bug',
          title: 'Accidental Global Variable',
          message: 'Variable declaration missing (creates global variable)',
          file: filePath,
          line: lineNum + 1,
          column: line.search(/=/),
          snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
          suggestion: 'Add var, let, or const declaration',
          tags: ['bug', 'javascript', 'scope'],
        });
      }
    }

    return issues;
  }

  checkPythonBugs(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Check for mutable default arguments
      if (
        line.includes('def ') &&
        (/\([^)]*=\s*\[\s*\]/.test(line) ||
          /\([^)]*=\s*\{\s*\}/.test(line) ||
          /\([^)]*=\s*\(\s*\)/.test(line))
      ) {
        issues.push({
          severity: 'high',
          type: 'bug',
          title: 'Mutable Default Argument',
          message: 'Using mutable objects as default arguments can lead to unexpected behavior',
          file: filePath,
          line: lineNum + 1,
          column: line.search(/=\s*[[{(]/),
          snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
          suggestion: 'Use None as default and initialize inside the function',
          tags: ['bug', 'python', 'function'],
        });
      }

      // Check for bare except clauses
      if (line.includes('except:')) {
        issues.push({
          severity: 'medium',
          type: 'bug',
          title: 'Bare Except Clause',
          message: 'Catching all exceptions can hide bugs and make debugging difficult',
          file: filePath,
          line: lineNum + 1,
          column: line.search(/except:/),
          snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
          suggestion: 'Catch specific exceptions instead',
          tags: ['bug', 'python', 'exception'],
        });
      }
    }

    return issues;
  }

  checkJavaBugs(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Check for missing @Override annotations
      if (line.includes('public') || line.includes('protected') || line.includes('private')) {
        const nextLine = lines[lineNum + 1];
        if (nextLine && nextLine.includes('void') && !line.includes('@Override')) {
          issues.push({
            severity: 'low',
            type: 'bug',
            title: 'Missing @Override Annotation',
            message: 'Consider adding @Override annotation for overridden methods',
            file: filePath,
            line: lineNum + 1,
            column: line.search(/public|protected|private/),
            snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
            suggestion: 'Add @Override annotation above method declaration',
            tags: ['bug', 'java', 'annotation'],
          });
        }
      }
    }

    return issues;
  }

  checkPHPBugs(code, filePath) {
    const securityPatterns = [
      {
        name: 'SQL Injection',
        pattern: /(\$.*=\s*["'].*(SELECT|INSERT|UPDATE|DELETE).*["'].*\.\s*\$.*;)/gi,
        severity: 'high',
        type: 'security',
      },
      {
        name: 'Cross-Site Scripting (XSS)',
        pattern: /echo\s*\$.*;\s*\/\/\s*unsanitized/gi,
        severity: 'high',
        type: 'security',
      },
      {
        name: 'File Inclusion Vulnerability',
        pattern: /(include|require)(_once)?\s*\(\s*\$.*\s*\);/gi,
        severity: 'high',
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
            tags: ['security', 'vulnerability', 'php'],
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

  getBugTitle(bugType) {
    const titles = {
      nullPointer: 'Null Pointer Dereference',
      divisionByZero: 'Division by Zero',
      infiniteLoop: 'Infinite Loop Detected',
      arrayIndexOutOfBounds: 'Array Index Out of Bounds',
      resourceLeak: 'Resource Leak Detected',
    };
    return titles[bugType] || 'Programming Bug Detected';
  }

  getBugMessage(bugType) {
    const messages = {
      nullPointer: 'Possible dereference of a null object leading to runtime errors',
      divisionByZero: 'Division or modulo operation with zero as the divisor',
      infiniteLoop: 'Loop construct that may lead to non-terminating execution',
      arrayIndexOutOfBounds: 'Accessing array or list with an index outside its valid range',
      resourceLeak: 'Opened resource that may not be properly closed, leading to leaks',
    };
    return messages[bugType] || 'A programming bug has been detected in the code';
  }

  getBugSuggestion(bugType) {
    const suggestions = {
      nullPointer: 'Add null checks before dereferencing objects',
      divisionByZero: 'Ensure divisor is not zero before performing division',
      infiniteLoop: 'Review loop conditions to ensure termination',
      arrayIndexOutOfBounds: 'Validate array indices before access',
      resourceLeak: 'Use try-finally or using statements to ensure resources are closed',
    };
    return suggestions[bugType] || 'Review the code for potential bugs and fix accordingly';
  }

  checkSecurityVulnerabilities(code, filePath) {
    const securityPatterns = [
      {
        name: 'Hardcoded API Key',
        pattern: /(['"])(sk_live_|sk_test_)[A-Za-z0-9]{24,}(['"])/gi,
        severity: 'critical',
        type: 'security',
      },
      {
        name: 'Insecure Randomness',
        pattern: /Math\.random\(\)/g,
        severity: 'medium',
        type: 'security',
      },
      {
        name: 'Weak Cryptography',
        pattern: /MD5\(|SHA1\(/gi,
        severity: 'high',
        type: 'security',
      },
      {
        name: 'Command Injection',
        pattern: /(exec|system|passthru|shell_exec)\s*\(.*\$_(GET|POST|REQUEST|COOKIE)\[.*\].*\)/gi,
        severity: 'critical',
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

  checkPythonSecurityVulnerabilities(code, filePath) {
    const securityPatterns = [
      {
        name: 'Hardcoded API Key',
        pattern: /(['"])(sk_live_|sk_test_)[A-Za-z0-9]{24,}(['"])/gi,
        severity: 'critical',
        type: 'security',
      },
      {
        name: 'Insecure Randomness',
        pattern: /random\.random\(\)/g,
        severity: 'medium',
        type: 'security',
      },
      {
        name: 'Weak Cryptography',
        pattern: /hashlib\.(md5|sha1)\(/gi,
        severity: 'high',
        type: 'security',
      },
      {
        name: 'Command Injection',
        pattern: /(os\.system|subprocess\.Popen|subprocess\.call)\s*\(.*input\(.*\).*\)/gi,
        severity: 'critical',
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
            tags: ['security', 'vulnerability', 'python'],
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
}

export default BugAnalyzer;

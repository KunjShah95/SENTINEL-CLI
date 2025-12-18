import BaseAnalyzer from './baseAnalyzer.js';

export class SecurityAnalyzer extends BaseAnalyzer {
  constructor(config) {
    super('SecurityAnalyzer', config);
    this.securityRules = this.initializeSecurityRules();
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

    // Run security pattern checks
    issues.push(...this.checkSecurityPatterns(content, filePath));

    // Run language-specific security checks
    const extension = filePath.split('.').pop()?.toLowerCase();
    switch (extension) {
    case 'js':
    case 'ts':
      issues.push(...this.checkJavaScriptSecurity(content, filePath));
      break;
    case 'py':
      issues.push(...this.checkPythonSecurity(content, filePath));
      break;
    case 'java':
      issues.push(...this.checkJavaSecurity(content, filePath));
      break;
    case 'php':
      issues.push(...this.checkPHPSecurity(content, filePath));
      break;
    }

    // Add issues to the analyzer
    for (const issue of issues) {
      this.addIssue(issue);
    }
  }

  initializeSecurityRules() {
    return {
      // JavaScript/TypeScript Security Rules
      javascript: [
        {
          name: 'eval() Usage',
          pattern: /\beval\s*\(/gi,
          severity: 'high',
          message: 'Avoid using eval() as it can execute arbitrary code',
          suggestion:
            'Use safer alternatives like JSON.parse() or Function constructor with proper validation',
        },
        {
          name: 'innerHTML Assignment',
          pattern: /\.innerHTML\s*=/gi,
          severity: 'medium',
          message: 'Direct innerHTML assignment can lead to XSS vulnerabilities',
          suggestion: 'Use textContent, createElement, or DOMPurify for sanitized HTML',
        },
        {
          name: 'document.write() Usage',
          pattern: /document\.write\s*\(/gi,
          severity: 'medium',
          message: 'document.write() can be used for XSS attacks',
          suggestion: 'Use DOM manipulation methods instead',
        },
        {
          name: 'Hardcoded API Keys',
          pattern: /(api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*['"][^'"]{20,}['"]/gi,
          severity: 'high',
          message: 'Hardcoded API keys should be stored in environment variables',
          suggestion: 'Use environment variables or secure configuration management',
        },
        {
          name: 'SQL Query Concatenation',
          pattern: /(SELECT|INSERT|UPDATE|DELETE).*\+/gi,
          severity: 'high',
          message: 'String concatenation in SQL queries can lead to SQL injection',
          suggestion: 'Use parameterized queries or prepared statements',
        },
      ],

      // Python Security Rules
      python: [
        {
          name: 'Pickle Deserialization',
          pattern: /pickle\.loads?\s*\(/gi,
          severity: 'high',
          message: 'Pickle deserialization can execute arbitrary code',
          suggestion: 'Use safer serialization formats like JSON',
        },
        {
          name: 'Shell Command Execution',
          pattern: /(os\.system|subprocess\.call|subprocess\.run)\s*\(/gi,
          severity: 'medium',
          message: 'Shell command execution can be dangerous if not properly sanitized',
          suggestion: 'Validate and sanitize all inputs before executing shell commands',
        },
        {
          name: 'Hardcoded Passwords',
          pattern: /(password|passwd)\s*=\s*['"][^'"]+['"]/gi,
          severity: 'high',
          message: 'Hardcoded passwords should be stored securely',
          suggestion: 'Use environment variables or secure configuration files',
        },
      ],

      // Java Security Rules
      java: [
        {
          name: 'SQL Injection Risk',
          pattern: /(Statement|PreparedStatement)\s*\+\s*.*\+/gi,
          severity: 'high',
          message: 'String concatenation in SQL can lead to injection attacks',
          suggestion: 'Use PreparedStatement with proper parameter binding',
        },
        {
          name: 'Weak Cryptography',
          pattern: /(MD5|SHA1|DES)\s*$/gi,
          severity: 'medium',
          message: 'Weak cryptographic algorithms should be avoided',
          suggestion: 'Use SHA-256, SHA-3, or other strong cryptographic algorithms',
        },
      ],

      // PHP Security Rules
      php: [
        {
          name: 'SQL Injection Risk',
          pattern: /mysql_query\s*\(\s*['"].*\+/gi,
          severity: 'high',
          message: 'String concatenation in SQL queries can lead to injection attacks',
          suggestion: 'Use prepared statements with PDO or MySQLi',
        },
        {
          name: 'File Inclusion Vulnerability',
          pattern: /(include|require)(_once)?\s*\(\s*\$_/gi,
          severity: 'high',
          message: 'Including files based on user input can lead to arbitrary file inclusion',
          suggestion: 'Validate and sanitize all user inputs before file operations',
        },
      ],
    };
  }

  checkJavaScriptSecurity(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      for (const rule of this.securityRules.javascript) {
        if (rule.pattern.test(line)) {
          issues.push({
            severity: rule.severity,
            type: 'security',
            title: rule.name,
            message: rule.message,
            file: filePath,
            line: lineNum + 1,
            column: line.search(rule.pattern) + 1,
            snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
            suggestion: rule.suggestion,
            tags: ['security', 'javascript', 'vulnerability'],
          });
        }

        // Always reset regex lastIndex
        if (rule.pattern.global) {
          rule.pattern.lastIndex = 0;
        }
      }
    }

    return issues;
  }

  checkPythonSecurity(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      for (const rule of this.securityRules.python) {
        if (rule.pattern.test(line)) {
          issues.push({
            severity: rule.severity,
            type: 'security',
            title: rule.name,
            message: rule.message,
            file: filePath,
            line: lineNum + 1,
            column: line.search(rule.pattern) + 1,
            snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
            suggestion: rule.suggestion,
            tags: ['security', 'python', 'vulnerability'],
          });
        }

        // Always reset regex lastIndex
        if (rule.pattern.global) {
          rule.pattern.lastIndex = 0;
        }
      }
    }

    return issues;
  }

  checkJavaSecurity(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      for (const rule of this.securityRules.java) {
        if (rule.pattern.test(line)) {
          issues.push({
            severity: rule.severity,
            type: 'security',
            title: rule.name,
            message: rule.message,
            file: filePath,
            line: lineNum + 1,
            column: line.search(rule.pattern) + 1,
            snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
            suggestion: rule.suggestion,
            tags: ['security', 'java', 'vulnerability'],
          });
        }

        // Always reset regex lastIndex
        if (rule.pattern.global) {
          rule.pattern.lastIndex = 0;
        }
      }
    }

    return issues;
  }

  checkPHPSecurity(code, filePath) {
    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      for (const rule of this.securityRules.php) {
        if (rule.pattern.test(line)) {
          issues.push({
            severity: rule.severity,
            type: 'security',
            title: rule.name,
            message: rule.message,
            file: filePath,
            line: lineNum + 1,
            column: line.search(rule.pattern) + 1,
            snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
            suggestion: rule.suggestion,
            tags: ['security', 'php', 'vulnerability'],
          });
        }

        // Always reset regex lastIndex
        if (rule.pattern.global) {
          rule.pattern.lastIndex = 0;
        }
      }
    }

    return issues;
  }

  /**
   * Check for potential secrets in code
   */
  checkForSecrets(code, filePath) {
    const secretPatterns = [
      {
        name: 'AWS Access Key',
        pattern: /AKIA[0-9A-Z]{16}/gi,
        severity: 'high',
      },
      {
        name: 'AWS Secret Key',
        pattern: /[0-9a-zA-Z/+]{40}/gi,
        severity: 'high',
      },
      {
        name: 'GitHub Token',
        pattern: /ghp_[0-9a-zA-Z]{36}/gi,
        severity: 'high',
      },
      {
        name: 'Private Key',
        pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/gi,
        severity: 'critical',
      },
      {
        name: 'Database URL',
        pattern: /(mysql|postgresql|mongodb):\/\/[^:\s]+:[^@\s]+@[^:\s]+/gi,
        severity: 'high',
      },
    ];

    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      for (const pattern of secretPatterns) {
        if (pattern.pattern.test(line)) {
          issues.push({
            severity: pattern.severity,
            type: 'security',
            title: pattern.name,
            message: `Potential ${pattern.name.toLowerCase()} detected in code`,
            file: filePath,
            line: lineNum + 1,
            column: line.search(pattern.pattern) + 1,
            snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
            suggestion: 'Remove or replace with environment variables',
            tags: ['security', 'secret', 'credentials'],
          });
        }

        // Always reset regex lastIndex
        if (pattern.pattern.global) {
          pattern.pattern.lastIndex = 0;
        }
      }
    }

    return issues;
  }

  /**
   * Check for input validation issues
   */
  checkInputValidation(code, filePath) {
    const validationPatterns = [
      {
        name: 'Missing Input Validation',
        pattern:
          /(request\.getParameter|request\.getQueryString|\$_GET|\$_POST)\s*\(\s*['"][^'"]+['"]\s*\)/gi,
        severity: 'medium',
        message: 'User input should be validated before use',
        suggestion: 'Implement proper input validation and sanitization',
      },
    ];

    const issues = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      for (const pattern of validationPatterns) {
        if (pattern.pattern.test(line)) {
          // Check if there's validation nearby (simple heuristic)
          const contextLines = lines.slice(Math.max(0, lineNum - 5), lineNum + 6);
          const hasValidation = contextLines.some(contextLine =>
            /(validate|sanitize|escape|check|filter)/i.test(contextLine)
          );

          if (!hasValidation) {
            issues.push({
              severity: pattern.severity,
              type: 'security',
              title: pattern.name,
              message: pattern.message,
              file: filePath,
              line: lineNum + 1,
              column: line.search(pattern.pattern) + 1,
              snippet: this.getCodeSnippet(code, lineNum + 1).snippet,
              suggestion: pattern.suggestion,
              tags: ['security', 'validation', 'input'],
            });
          }
        }

        // Always reset regex lastIndex
        if (pattern.pattern.global) {
          pattern.pattern.lastIndex = 0;
        }
      }
    }

    return issues;
  }
}

export default SecurityAnalyzer;

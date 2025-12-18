import { BaseAnalyzer } from './baseAnalyzer.js';

/**
 * Go Language Analyzer
 * Detects security issues and best practice violations in Go code
 */
export class GoAnalyzer extends BaseAnalyzer {
  constructor() {
    super();
    this.name = 'go';
    this.initializePatterns();
  }

  initializePatterns() {
    this.securityPatterns = [
      {
        id: 'go/unsafe-package',
        pattern: /import\s+["']unsafe["']/,
        severity: 'high',
        title: 'Unsafe package imported',
        message: 'The unsafe package bypasses Go\'s type safety. Use with extreme caution.',
        suggestion: 'Avoid unsafe unless absolutely necessary. Document why it\'s needed.',
      },
      {
        id: 'go/cgo-usage',
        pattern: /import\s+"C"/,
        severity: 'medium',
        title: 'CGO usage detected',
        message: 'CGO can introduce memory safety issues and complicates cross-compilation.',
        suggestion: 'Consider pure Go alternatives if possible.',
      },
      {
        id: 'go/sql-injection',
        pattern: /(?:db|tx)\.(?:Query|Exec|QueryRow)\s*\(\s*(?:fmt\.Sprintf|.*\+.*\+)/,
        severity: 'critical',
        title: 'Potential SQL injection',
        message: 'String concatenation in SQL queries can lead to SQL injection.',
        suggestion: 'Use parameterized queries: db.Query("SELECT * FROM users WHERE id = $1", id)',
      },
      {
        id: 'go/command-injection',
        pattern: /exec\.Command\s*\(\s*(?:fmt\.Sprintf|.*\+)/,
        severity: 'critical',
        title: 'Potential command injection',
        message: 'User input in exec.Command can lead to command injection.',
        suggestion: 'Validate and sanitize all inputs. Use exec.Command with separate arguments.',
      },
      {
        id: 'go/hardcoded-credentials',
        pattern: /(?:password|secret|apiKey|api_key|token)\s*(?::=|=)\s*["'][^"']{8,}["']/i,
        severity: 'critical',
        title: 'Hardcoded credentials detected',
        message: 'Credentials should not be hardcoded in source code.',
        suggestion: 'Use environment variables or a secrets manager.',
      },
      {
        id: 'go/tls-insecure',
        pattern: /InsecureSkipVerify\s*:\s*true/,
        severity: 'high',
        title: 'TLS verification disabled',
        message: 'Disabling TLS verification makes connections vulnerable to MITM attacks.',
        suggestion: 'Enable TLS verification in production. Use proper certificates.',
      },
      {
        id: 'go/weak-crypto',
        pattern: /(?:crypto\/md5|crypto\/sha1|crypto\/des)/,
        severity: 'high',
        title: 'Weak cryptographic algorithm',
        message: 'MD5, SHA1, and DES are considered weak for security purposes.',
        suggestion: 'Use SHA-256 or stronger: crypto/sha256, crypto/aes',
      },
      {
        id: 'go/http-no-timeout',
        pattern: /&http\.Client\s*{[^}]*}/,
        checkFunction: (content) => {
          const matches = content.match(/&http\.Client\s*\{[^}]*\}/g) || [];
          return matches.some(m => !m.includes('Timeout'));
        },
        severity: 'medium',
        title: 'HTTP client without timeout',
        message: 'HTTP clients without timeout can hang indefinitely.',
        suggestion: 'Set Timeout: &http.Client{Timeout: 30 * time.Second}',
      },
      {
        id: 'go/unhandled-error',
        pattern: /[a-zA-Z_][a-zA-Z0-9_]*\s*,\s*_\s*:?=\s*[a-zA-Z_][a-zA-Z0-9_]*\(/,
        severity: 'medium',
        title: 'Error possibly ignored',
        message: 'Ignoring errors can lead to silent failures and security issues.',
        suggestion: 'Handle all errors appropriately.',
      },
      {
        id: 'go/defer-in-loop',
        pattern: /for\s+.*\{[^}]*defer\s+/s,
        severity: 'medium',
        title: 'Defer inside loop',
        message: 'Defer in a loop can cause resource leaks as deferred calls stack up.',
        suggestion: 'Move deferred operation outside the loop or use immediate cleanup.',
      },
    ];

    this.concurrencyPatterns = [
      {
        id: 'go/goroutine-leak',
        pattern: /go\s+func\s*\([^)]*\)\s*\{[^}]*for\s*\{/s,
        severity: 'medium',
        title: 'Potential goroutine leak',
        message: 'Goroutine with infinite loop without exit condition may leak.',
        suggestion: 'Add context cancellation or done channel for cleanup.',
      },
      {
        id: 'go/race-condition',
        pattern: /go\s+func.*\{[^}]*[a-zA-Z_][a-zA-Z0-9_]*\s*(?:\+\+|--|\+=|-=|\*=|\/=)/s,
        severity: 'high',
        title: 'Potential race condition',
        message: 'Modifying shared variables in goroutines without synchronization.',
        suggestion: 'Use mutex, atomic operations, or channels for synchronization.',
      },
      {
        id: 'go/unbuffered-channel-goroutine',
        pattern: /make\(chan\s+[^,)]+\)\s*\n[^}]*go\s+func/s,
        severity: 'low',
        title: 'Unbuffered channel with goroutine',
        message: 'Unbuffered channels can cause goroutine blocks if not handled properly.',
        suggestion: 'Consider using buffered channels or ensure proper receive operations.',
      },
    ];

    this.bestPractices = [
      {
        id: 'go/empty-interface',
        pattern: /interface\s*\{\s*\}/,
        severity: 'low',
        title: 'Empty interface usage',
        message: 'Empty interface (interface{}) loses type safety. Use any in Go 1.18+.',
        suggestion: 'Use generics or specific interfaces when possible.',
      },
      {
        id: 'go/panic-usage',
        pattern: /\bpanic\s*\(/,
        severity: 'medium',
        title: 'Panic usage detected',
        message: 'Panic should be used sparingly, mainly for unrecoverable errors.',
        suggestion: 'Return errors instead of panicking in library code.',
      },
      {
        id: 'go/init-function',
        pattern: /func\s+init\s*\(\s*\)/,
        severity: 'low',
        title: 'Init function detected',
        message: 'Init functions can make code harder to test and understand.',
        suggestion: 'Consider explicit initialization in main() or factory functions.',
      },
      {
        id: 'go/global-variable',
        pattern: /^var\s+[a-zA-Z_][a-zA-Z0-9_]*\s+/m,
        severity: 'low',
        title: 'Global variable detected',
        message: 'Global variables can lead to tight coupling and testing difficulties.',
        suggestion: 'Use dependency injection or pass variables explicitly.',
      },
    ];
  }

  shouldAnalyzeFile(filePath) {
    return filePath.endsWith('.go');
  }

  async analyze(files, context) {
    this.issues = [];
    
    for (const file of files) {
      if (this.shouldAnalyzeFile(file.path)) {
        try {
          await this.analyzeFile(file.path, file.content, context);
        } catch (error) {
          // Skip files that can't be analyzed
        }
      }
    }

    return {
      analyzer: this.name,
      issues: this.issues,
      stats: this.getStats(),
    };
  }

  async analyzeFile(filePath, content, _context) {
    const lines = content.split('\n');
    const allPatterns = [
      ...this.securityPatterns,
      ...this.concurrencyPatterns,
      ...this.bestPractices,
    ];

    for (const rule of allPatterns) {
      if (rule.checkFunction) {
        if (rule.checkFunction(content)) {
          this.addIssue({
            id: rule.id,
            file: filePath,
            line: 1,
            severity: rule.severity,
            title: rule.title,
            message: rule.message,
            suggestion: rule.suggestion,
            analyzer: this.name,
          });
        }
      } else if (rule.pattern) {
        const regex = new RegExp(rule.pattern.source, rule.pattern.flags.replace('g', '') + 'g');
        let match;
        while ((match = regex.exec(content)) !== null) {
          const lineNum = this.getLineNumber(content, match.index);
          this.addIssue({
            id: rule.id,
            file: filePath,
            line: lineNum,
            severity: rule.severity,
            title: rule.title,
            message: rule.message,
            suggestion: rule.suggestion,
            code: lines[lineNum - 1]?.trim(),
            analyzer: this.name,
          });
        }
      }
    }
  }

  getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
  }
}

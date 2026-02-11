class SecretsScanner {
  constructor(options = {}) {
    this.secretsDb = this.loadSecretsDatabase();
    this.customPatterns = options.customPatterns || [];
    this.entropyThreshold = options.entropyThreshold || 4.5;
    this.falsePositiveRate = 0.01;
  }

  loadSecretsDatabase() {
    return {
      aws_access_key: {
        pattern: /AKIA[0-9A-Z]{16}/,
        severity: 'critical',
        vendor: 'AWS',
        remediation: 'Rotate immediately and use IAM roles instead',
      },
      aws_secret_key: {
        pattern: /[0-9a-zA-Z/+]{40}/,
        severity: 'critical',
        vendor: 'AWS',
        remediation: 'Rotate immediately',
      },
      github_token: {
        pattern: /ghp_[A-Za-z0-9_]{36,}/,
        severity: 'critical',
        vendor: 'GitHub',
        remediation: 'Revoke and create a new token',
      },
      github_oauth: {
        pattern: /gho_[A-Za-z0-9_]{36,}/,
        severity: 'critical',
        vendor: 'GitHub',
        remediation: 'Revoke and create a new OAuth app',
      },
      gitlab_token: {
        pattern: /glpat-[A-Za-z0-9\-_]{20,}/,
        severity: 'critical',
        vendor: 'GitLab',
        remediation: 'Revoke and create a new token',
      },
      google_api_key: {
        pattern: /AIza[0-9A-Za-z\-_]{35}/,
        severity: 'high',
        vendor: 'Google',
        remediation: 'Restrict API key and regenerate if compromised',
      },
      slack_token: {
        pattern: /xox[baprs]-([0-9a-zA-Z]{10,48})/,
        severity: 'high',
        vendor: 'Slack',
        remediation: 'Revoke and create a new token',
      },
      stripe_key: {
        pattern: /(sk|pk)_(test|live)_[0-9a-zA-Z]{24,}/,
        severity: 'critical',
        vendor: 'Stripe',
        remediation: 'Revoke and rotate the key',
      },
      private_key: {
        pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
        severity: 'critical',
        vendor: 'Generic',
        remediation: 'Remove from codebase immediately',
      },
      jwt_token: {
        pattern: /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/,
        severity: 'high',
        vendor: 'Generic',
        remediation: 'Invalidate the token and review access logs',
      },
      database_url: {
        pattern: /(mongodb(\+srv)?|postgres|postgresql|mysql|redis):\/\/[^\s"'<>]+/,
        severity: 'critical',
        vendor: 'Generic',
        remediation: 'Use environment variables or secrets manager',
      },
      api_key_generic: {
        pattern: /api[_-]?key\s*[:=]\s*['"][A-Za-z0-9_]{32,}['"]/i,
        severity: 'medium',
        vendor: 'Generic',
        remediation: 'Use secrets management solution',
      },
      password_in_code: {
        pattern: /(password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/i,
        severity: 'high',
        vendor: 'Generic',
        remediation: 'Use environment variables',
      },
    };
  }

  calculateEntropy(string) {
    const frequencies = {};
    for (const char of string) {
      frequencies[char] = (frequencies[char] || 0) + 1;
    }

    let entropy = 0;
    const length = string.length;

    for (const char in frequencies) {
      const frequency = frequencies[char] / length;
      entropy -= frequency * Math.log2(frequency);
    }

    return entropy;
  }

  isHighEntropy(string) {
    const cleanString = string.replace(/[^a-zA-Z0-9]/g, '');
    if (cleanString.length < 32) return false;
    return this.calculateEntropy(cleanString) > this.entropyThreshold;
  }

  async scan(content, filePath) {
    const issues = [];
    const lines = content.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      for (const [secretType, config] of Object.entries(this.secretsDb)) {
        const matches = line.matchAll(config.pattern);
        for (const match of matches) {
          const matchedText = match[0];

          if (this.isHighEntropy(matchedText)) {
            issues.push({
              type: secretType,
              severity: config.severity,
              message: `Potential ${config.vendor} ${secretType} detected`,
              file: filePath,
              line: lineNum + 1,
              column: match.index + 1,
              snippet: this.getSnippet(lines, lineNum),
              suggestion: config.remediation,
              confidence: 0.95,
              tags: ['secret', 'security', config.vendor.toLowerCase()],
              rawMatch: matchedText.substring(0, 8) + '...',
            });
          }
        }
      }

      for (const customPattern of this.customPatterns) {
        const matches = line.matchAll(customPattern.pattern);
        for (const match of matches) {
          issues.push({
            type: customPattern.name || 'custom-secret',
            severity: customPattern.severity || 'high',
            message: customPattern.message || 'Custom secret pattern detected',
            file: filePath,
            line: lineNum + 1,
            column: match.index + 1,
            snippet: this.getSnippet(lines, lineNum),
            suggestion: customPattern.remediation || 'Review and remove if necessary',
            confidence: 0.9,
            tags: ['secret', 'custom'],
          });
        }
      }
    }

    return issues;
  }

  getSnippet(lines, lineNum, context = 2) {
    const start = Math.max(0, lineNum - context);
    const end = Math.min(lines.length, lineNum + context + 1);

    return lines.slice(start, end).map((line, idx) => {
      const num = start + idx + 1;
      const prefix = num === lineNum + 1 ? '>>> ' : '    ';
      return `${prefix}${num.toString().padStart(4)}: ${line}`;
    }).join('\n');
  }

  addCustomPattern(config) {
    this.customPatterns.push(config);
  }

  removeCustomPattern(name) {
    this.customPatterns = this.customPatterns.filter(p => p.name !== name);
  }
}

export default SecretsScanner;

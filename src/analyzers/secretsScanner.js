class SecretsScanner {
  constructor(options = {}) {
    this.secretsDb = this.loadSecretsDatabase();
    this.customPatterns = options.customPatterns || [];
    this.entropyThreshold = options.entropyThreshold || 4.5;
    this.falsePositiveRate = 0.01;
    this.excludePaths = options.excludePaths || ['node_modules', '.git', 'dist', 'build'];
  }

  loadSecretsDatabase() {
    return {
      // AWS
      aws_access_key: {
        pattern: /AKIA[0-9A-Z]{16}/,
        severity: 'critical',
        vendor: 'AWS',
        remediation: 'Rotate immediately and use IAM roles instead',
      },
      aws_secret_key: {
        pattern: /(?:aws_secret_access_key|aws_secret_key)\s*[:=]\s*['"][A-Za-z0-9/+=]{40}['"]/i,
        severity: 'critical',
        vendor: 'AWS',
        remediation: 'Rotate immediately',
      },
      aws_session_token: {
        pattern: /aws_session_token\s*[:=]\s*['"][A-Za-z0-9/+=]{200,}['"]/i,
        severity: 'critical',
        vendor: 'AWS',
        remediation: 'Rotate immediately',
      },
      
      // GitHub
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
      github_refresh: {
        pattern: /ghr_[A-Za-z0-9_]{36,}/,
        severity: 'critical',
        vendor: 'GitHub',
        remediation: 'Revoke and create a new token',
      },
      github_app: {
        pattern: /(?:github_app_|GH_)?(client_)?(?:id|secret)\s*[:=]\s*['"][A-Za-z0-9_]{20,}['"]/i,
        severity: 'high',
        vendor: 'GitHub',
        remediation: 'Regenerate app credentials',
      },
      
      // GitLab
      gitlab_token: {
        pattern: /glpat-[A-Za-z0-9\-_]{20,}/,
        severity: 'critical',
        vendor: 'GitLab',
        remediation: 'Revoke and create a new token',
      },
      gitlab_oauth: {
        pattern: /gloauth-[A-Za-z0-9\-_]{20,}/,
        severity: 'critical',
        vendor: 'GitLab',
        remediation: 'Revoke OAuth token',
      },
      
      // Google
      google_api_key: {
        pattern: /AIza[0-9A-Za-z\-_]{35}/,
        severity: 'high',
        vendor: 'Google',
        remediation: 'Restrict API key and regenerate if compromised',
      },
      google_oauth: {
        pattern: /[0-9]+-[A-Za-z0-9_]{32}\.apps\.googleusercontent\.com/,
        severity: 'high',
        vendor: 'Google',
        remediation: 'Regenerate OAuth client secret',
      },
      firebase_api_key: {
        pattern: /AIza[0-9A-Za-z\-_]{35}/,
        severity: 'high',
        vendor: 'Firebase',
        remediation: 'Regenerate Firebase API key',
      },
      
      // Microsoft/Azure
      azure_client_secret: {
        pattern: /[a-zA-Z0-9+/]{86}==/,
        severity: 'critical',
        vendor: 'Azure',
        remediation: 'Regenerate client secret',
      },
      azure_connection_string: {
        pattern: /DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[^;]+/,
        severity: 'critical',
        vendor: 'Azure',
        remediation: 'Regenerate storage account key',
      },
      microsoft_api_key: {
        pattern: /(?:ms|microservice|azure)_(?:api_)?key\s*[:=]\s*['"][A-Za-z0-9_-]{20,}['"]/i,
        severity: 'high',
        vendor: 'Microsoft',
        remediation: 'Regenerate API key',
      },
      
      // Slack
      slack_token: {
        pattern: /xox[baprs]-([0-9a-zA-Z]{10,48})/,
        severity: 'high',
        vendor: 'Slack',
        remediation: 'Revoke and create a new token',
      },
      slack_webhook: {
        pattern: /https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9]+\/B[a-zA-Z0-9]+\/[a-zA-Z0-9]+/,
        severity: 'high',
        vendor: 'Slack',
        remediation: 'Regenerate webhook URL',
      },
      
      // Stripe
      stripe_key: {
        pattern: /(sk|pk)_(test|live)_[0-9a-zA-Z]{24,}/,
        severity: 'critical',
        vendor: 'Stripe',
        remediation: 'Revoke and rotate the key',
      },
      stripe_webhook_secret: {
        pattern: /whsec_[A-Za-z0-9]{32}/,
        severity: 'high',
        vendor: 'Stripe',
        remediation: 'Regenerate webhook secret',
      },
      
      // Twilio
      twilio_api_key: {
        pattern: /SK[a-f0-9]{32}/,
        severity: 'critical',
        vendor: 'Twilio',
        remediation: 'Regenerate API key',
      },
      twilio_auth_token: {
        pattern: /[A-Za-z0-9]{32}/,
        severity: 'high',
        vendor: 'Twilio',
        remediation: 'Regenerate auth token',
      },
      
      // SendGrid
      sendgrid_api_key: {
        pattern: /SG\.[A-Za-z0-9\-_]{22}\.[A-Za-z0-9\-_]{43}/,
        severity: 'critical',
        vendor: 'SendGrid',
        remediation: 'Regenerate API key',
      },
      
      // Mailgun
      mailgun_api_key: {
        pattern: /key-[0-9a-zA-Z]{32}/,
        severity: 'critical',
        vendor: 'Mailgun',
        remediation: 'Regenerate API key',
      },
      
      // SSH Keys
      private_key: {
        pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
        severity: 'critical',
        vendor: 'Generic',
        remediation: 'Remove from codebase immediately',
      },
      ssh_public_key: {
        pattern: /ssh-(?:rsa|dss|ecdsa|ed25519) [A-Za-z0-9+/]+/,
        severity: 'medium',
        vendor: 'SSH',
        remediation: 'Ensure this is intentionally public',
      },
      
      // JWT
      jwt_token: {
        pattern: /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/,
        severity: 'high',
        vendor: 'Generic',
        remediation: 'Invalidate the token and review access logs',
      },
      
      // Database
      database_url: {
        pattern: /(mongodb(\+srv)?|postgres|postgresql|mysql|redis|mssql):\/\/[^\s"'<>]+/i,
        severity: 'critical',
        vendor: 'Generic',
        remediation: 'Use environment variables or secrets manager',
      },
      database_connection: {
        pattern: /(?:host|server)\s*[:=]\s*['"][^'"]{5,}['"]/i,
        severity: 'high',
        vendor: 'Generic',
        remediation: 'Use environment variables',
      },
      
      // Generic API Keys
      api_key_generic: {
        pattern: /api[_-]?key\s*[:=]\s*['"][A-Za-z0-9_]{20,}['"]/i,
        severity: 'medium',
        vendor: 'Generic',
        remediation: 'Use secrets management solution',
      },
      secret_key_generic: {
        pattern: /secret[_-]?key\s*[:=]\s*['"][A-Za-z0-9_-]{20,}['"]/i,
        severity: 'high',
        vendor: 'Generic',
        remediation: 'Use secrets management solution',
      },
      access_token_generic: {
        pattern: /access[_-]?token\s*[:=]\s*['"][A-Za-z0-9_-]{20,}['"]/i,
        severity: 'high',
        vendor: 'Generic',
        remediation: 'Use secrets management solution',
      },
      
      // Passwords in code
      password_in_code: {
        pattern: /(?:password|passwd|pwd|pass)\s*[:=]\s*['"][^'"]{8,}['"]/i,
        severity: 'high',
        vendor: 'Generic',
        remediation: 'Use environment variables',
      },
      username_in_code: {
        pattern: /(?:username|user|login)\s*[:=]\s*['"][^'"]{3,}['"]/i,
        severity: 'medium',
        vendor: 'Generic',
        remediation: 'Use environment variables',
      },
      
      // Heroku
      heroku_api_key: {
        pattern: /[hH]eroku[aA][pP][iI][kK][eE][yY]\s*[:=]\s*['"][A-Za-z0-9-]{47}['"]/,
        severity: 'critical',
        vendor: 'Heroku',
        remediation: 'Regenerate API key',
      },
      
      // NPM
      npm_token: {
        pattern: /npm_[A-Za-z0-9]{36}/,
        severity: 'critical',
        vendor: 'NPM',
        remediation: 'Regenerate NPM token',
      },
      
      // PyPI
      pypi_token: {
        pattern: /pypi-AgEIcHlwaS5vcmc[A-Za-z0-9\-_]{50,}/,
        severity: 'critical',
        vendor: 'PyPI',
        remediation: 'Regenerate PyPI token',
      },
      
      // Docker
      dockerhub_token: {
        pattern: /dockerhub_[A-Za-z0-9]{20}/,
        severity: 'high',
        vendor: 'Docker',
        remediation: 'Regenerate Docker Hub token',
      },
      
      // Cloudflare
      cloudflare_api_key: {
        pattern: /(?:cloudflare[_-]?)?api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9]{37}['"]/i,
        severity: 'critical',
        vendor: 'Cloudflare',
        remediation: 'Regenerate API key',
      },
      
      // Shopify
      shopify_api_key: {
        pattern: /shpat_[a-f0-9]{32}/,
        severity: 'critical',
        vendor: 'Shopify',
        remediation: 'Regenerate API key',
      },
      
      // Square
      square_access_token: {
        pattern: /sq0atp-[0-9A-Za-z\-_]{22}/,
        severity: 'critical',
        vendor: 'Square',
        remediation: 'Regenerate access token',
      },
      
      // PayPal
      paypal_client_id: {
        pattern: /[A-Za-z0-9]{20,}-[A-Za-z0-9]{20,}/,
        severity: 'high',
        vendor: 'PayPal',
        remediation: 'Regenerate client credentials',
      },
      
      // Environment files
      env_file_exposed: {
        pattern: /^\s*(?:export\s+)?(?:AWS_|GOOGLE_|AZURE_|STRIPE_|GITHUB_|SENDGRID_|TWILIO_)[A-Z_]+\s*=/m,
        severity: 'high',
        vendor: 'Generic',
        remediation: 'Ensure .env is in .gitignore and use secrets manager',
      },
    };
  }

  addCustomPattern(config) {
    this.customPatterns.push(config);
  }

  removeCustomPattern(name) {
    this.customPatterns = this.customPatterns.filter(p => p.name !== name);
  }

  /**
   * Scan for high-entropy strings that might be secrets
   */
  scanHighEntropy(content, filePath) {
    const issues = [];
    const lines = content.split('\n');
    const secretlikePatterns = [
      /['"]([A-Za-z0-9+/]{32,})['"]/g,
      /(?:key|token|secret|password|cred)[_]?(?:val|value)?\s*[:=]\s*['"]([A-Za-z0-9+/]{32,})['"]/gi,
    ];

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      
      // Skip comments and known safe patterns
      if (line.trim().startsWith('//') || line.trim().startsWith('#') || line.trim().startsWith('*')) {
        continue;
      }

      for (const pattern of secretlikePatterns) {
        const matches = line.matchAll(pattern);
        for (const match of matches) {
          const potentialSecret = match[1] || match[0].replace(/['"]/g, '');
          if (this.isHighEntropy(potentialSecret) && !this.isKnownFalsePositive(potentialSecret, line)) {
            issues.push({
              type: 'high-entropy-string',
              severity: 'medium',
              message: 'High-entropy string detected - possible secret',
              file: filePath,
              line: lineNum + 1,
              column: match.index + 1,
              snippet: this.getSnippet(lines, lineNum),
              suggestion: 'Review if this is a secret and remove if confirmed',
              confidence: 0.6,
              tags: ['secret', 'entropy', 'potential-secret'],
              rawMatch: potentialSecret.substring(0, 8) + '...',
            });
          }
        }
      }
    }

    return issues;
  }

  /**
   * Check for known false positives
   */
  isKnownFalsePositive(secret, line) {
    const falsePositivePatterns = [
      /base64|encoding|hash|md5|sha\d?|crc/,
      /\b\d+\b/,
      /^[A-Za-z0-9+/]+==$/,
      /example|test|foo|bar|baz|placeholder/,
      /^[0-9a-f]{32,}$/i,
    ];
    
    const lowerLine = line.toLowerCase();
    const falsePositiveValues = [
      'changeme', 'password123', 'secret123', 'test123',
      'aaaaaaa', 'bbbbbbb', 'cccccc',
    ];

    return falsePositivePatterns.some(p => p.test(lowerLine)) ||
           falsePositiveValues.some(v => secret.toLowerCase().includes(v));
  }

  /**
   * Check if file should be scanned based on path
   */
  shouldScanFile(filePath) {
    return !this.excludePaths.some(exclude => filePath.includes(exclude));
  }
}

export default SecretsScanner;

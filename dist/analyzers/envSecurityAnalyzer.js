import BaseAnalyzer from './baseAnalyzer.js';

/**
 * EnvSecurityAnalyzer - Detects environment variable and secret leaks
 * Scans for exposed credentials, API keys, and sensitive configuration
 */
export class EnvSecurityAnalyzer extends BaseAnalyzer {
    constructor(config) {
        super('EnvSecurityAnalyzer', config);
        this.patterns = this.initializePatterns();
        this.entropyThreshold = config?.get?.('security.entropyThreshold') || 4.5;
    }

    initializePatterns() {
        return [
            // Generic secrets
            {
                pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/gi,
                severity: 'critical',
                title: 'Hardcoded password',
                message: 'Password is hardcoded in source code.',
                suggestion: 'Use environment variables or a secrets manager.',
            },
            {
                pattern: /(?:api_?key|apikey|api_?secret)\s*[:=]\s*['"][^'"]{10,}['"]/gi,
                severity: 'critical',
                title: 'Hardcoded API key',
                message: 'API key or secret is hardcoded in source code.',
                suggestion: 'Move to environment variables.',
            },
            {
                pattern: /(?:secret_?key|secretkey|private_?key)\s*[:=]\s*['"][^'"]{10,}['"]/gi,
                severity: 'critical',
                title: 'Hardcoded secret key',
                message: 'Secret key is exposed in source code.',
                suggestion: 'Store secrets in environment variables or a vault.',
            },
            // Database credentials
            {
                pattern: /(?:mongodb|mysql|postgres|redis):\/\/[^:]+:[^@]+@/gi,
                severity: 'critical',
                title: 'Database credentials in connection string',
                message: 'Database credentials are exposed in connection URL.',
                suggestion: 'Use environment variables for database URLs.',
            },
            {
                pattern: /(?:db_?password|database_?password)\s*[:=]\s*['"][^'"]+['"]/gi,
                severity: 'critical',
                title: 'Database password in code',
                message: 'Database password is hardcoded.',
                suggestion: 'Use process.env.DB_PASSWORD.',
            },
            // Cloud provider credentials
            {
                pattern: /AKIA[A-Z0-9]{16}/g,
                severity: 'critical',
                title: 'AWS Access Key ID',
                message: 'AWS Access Key ID found in source code.',
                suggestion: 'Use AWS IAM roles or environment variables.',
            },
            {
                pattern: /['"][a-zA-Z0-9/+=]{40}['"]/g,
                severity: 'medium',
                title: 'Potential AWS Secret Key',
                message: 'String resembles AWS Secret Access Key.',
                suggestion: 'Verify and remove if it is an AWS secret.',
            },
            // Private keys
            {
                pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
                severity: 'critical',
                title: 'Private key in code',
                message: 'Private key is embedded in source code.',
                suggestion: 'Store private keys in secure file storage, not in code.',
            },
            {
                pattern: /-----BEGIN CERTIFICATE-----/g,
                severity: 'medium',
                title: 'Certificate in code',
                message: 'Certificate is embedded in source code.',
                suggestion: 'Load certificates from files, not inline.',
            },
            // OAuth tokens
            {
                pattern: /(?:oauth|access|refresh)_?token\s*[:=]\s*['"][^'"]{20,}['"]/gi,
                severity: 'high',
                title: 'OAuth token in code',
                message: 'OAuth or access token is hardcoded.',
                suggestion: 'Tokens should be obtained at runtime, not hardcoded.',
            },
            // Common service tokens
            {
                pattern: /xox[baprs]-[a-zA-Z0-9-]+/g,
                severity: 'critical',
                title: 'Slack token in code',
                message: 'Slack bot or user token found in source code.',
                suggestion: 'Use SLACK_TOKEN environment variable.',
            },
            {
                pattern: /['"]\d{9,15}:[a-zA-Z0-9_-]{35}['"]/g,
                severity: 'critical',
                title: 'Telegram bot token',
                message: 'Telegram bot token found in source code.',
                suggestion: 'Use TELEGRAM_BOT_TOKEN environment variable.',
            },
            {
                pattern: /['"]sq0atp-[a-zA-Z0-9_-]{22}['"]/g,
                severity: 'critical',
                title: 'Square access token',
                message: 'Square payment access token found.',
                suggestion: 'Use environment variables for payment credentials.',
            },
            // Environment file issues
            {
                pattern: /(?:\.env|config)\s*(?:file|path)?\s*[:=]\s*['"][^'"]*\.env[^'"]*['"]/gi,
                severity: 'info',
                title: '.env file path reference',
                message: 'Reference to .env file found. Ensure .env is in .gitignore.',
                suggestion: 'Verify .env is listed in .gitignore.',
            },
            // Console.log with sensitive data
            {
                pattern: /console\.log\s*\(\s*.*(?:password|secret|token|key|credential).*\)/gi,
                severity: 'high',
                title: 'Logging sensitive data',
                message: 'Potentially logging sensitive information.',
                suggestion: 'Remove or mask sensitive data from logs.',
            },
        ];
    }

    /**
     * Calculate Shannon entropy of a string
     * High entropy strings are likely to be secrets
     */
    calculateEntropy(str) {
        const len = str.length;
        if (len === 0) return 0;

        const charCounts = {};
        for (const char of str) {
            charCounts[char] = (charCounts[char] || 0) + 1;
        }

        let entropy = 0;
        for (const count of Object.values(charCounts)) {
            const freq = count / len;
            entropy -= freq * Math.log2(freq);
        }

        return entropy;
    }

    /**
     * Check if a string is likely a secret based on entropy
     */
    isLikelySecret(str) {
        // Skip short strings
        if (str.length < 16) return false;

        // Skip if mostly alphanumeric pattern (likely variable name)
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(str)) return false;

        // Check entropy
        const entropy = this.calculateEntropy(str);
        return entropy > this.entropyThreshold;
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
        const lines = content.split('\n');

        // Pattern-based detection
        for (const pattern of this.patterns) {
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // Skip comments
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith('//') || trimmedLine.startsWith('#') || trimmedLine.startsWith('*')) {
                    continue;
                }

                const matches = line.match(pattern.pattern);
                if (matches) {
                    this.addIssue({
                        severity: pattern.severity,
                        type: 'security',
                        title: pattern.title,
                        message: pattern.message,
                        file: filePath,
                        line: i + 1,
                        column: line.indexOf(matches[0]) + 1,
                        snippet: this.maskSecret(line.trim()),
                        suggestion: pattern.suggestion,
                        tags: ['security', 'secrets', 'env'],
                        analyzer: this.name,
                    });
                }
            }
        }

        // Entropy-based detection for quoted strings
        const stringPattern = /['"]([^'"]{16,64})['"]/g;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let match;

            while ((match = stringPattern.exec(line)) !== null) {
                const str = match[1];
                if (this.isLikelySecret(str)) {
                    // Check if not already detected by pattern matching
                    const alreadyDetected = this.issues.some(
                        issue => issue.line === i + 1 && issue.file === filePath
                    );

                    if (!alreadyDetected) {
                        this.addIssue({
                            severity: 'medium',
                            type: 'security',
                            title: 'High-entropy string detected',
                            message: 'String has high entropy and may be a secret or credential.',
                            file: filePath,
                            line: i + 1,
                            column: line.indexOf(match[0]) + 1,
                            snippet: this.maskSecret(line.trim()),
                            suggestion: 'Verify this is not a secret. If it is, move to environment variables.',
                            tags: ['security', 'secrets', 'entropy'],
                            analyzer: this.name,
                        });
                    }
                }
            }
        }
    }

    /**
     * Mask potential secrets in snippets
     */
    maskSecret(str) {
        // Mask quoted strings that look like secrets
        return str.replace(/(['"])[^'"]{8,}(['"])/g, (match, q1, q2) => {
            const content = match.slice(1, -1);
            if (content.length > 8) {
                return `${q1}${content.slice(0, 4)}****${content.slice(-4)}${q2}`;
            }
            return match;
        });
    }
}

export default EnvSecurityAnalyzer;

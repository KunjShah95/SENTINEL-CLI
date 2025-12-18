import BaseAnalyzer from './baseAnalyzer.js';

/**
 * APISecurityAnalyzer - Analyze API endpoints and network requests for security issues
 * Focuses on common API vulnerabilities
 */
export class APISecurityAnalyzer extends BaseAnalyzer {
    constructor(config) {
        super('APISecurityAnalyzer', config);
        this.patterns = this.initializePatterns();
    }

    initializePatterns() {
        return [
            // Exposed secrets in API calls
            {
                pattern: /['"](sk_live_|pk_live_|rk_live_|whsec_)[a-zA-Z0-9]+['"]/g,
                severity: 'critical',
                type: 'security',
                title: 'Stripe API key in code',
                message: 'Live Stripe API key found in source code.',
                suggestion: 'Use environment variables: process.env.STRIPE_SECRET_KEY',
            },
            {
                pattern: /['"]AIza[a-zA-Z0-9_-]{35}['"]/g,
                severity: 'high',
                type: 'security',
                title: 'Google API key in code',
                message: 'Google API key found in source code.',
                suggestion: 'Use environment variables for API keys.',
            },
            {
                pattern: /['"](ghp_|gho_|ghu_|ghs_|ghr_)[a-zA-Z0-9]{36,}['"]/g,
                severity: 'critical',
                type: 'security',
                title: 'GitHub token in code',
                message: 'GitHub personal access token found in source code.',
                suggestion: 'Use GITHUB_TOKEN environment variable.',
            },
            {
                pattern: /['"][a-zA-Z0-9]{32}['"]\s*(?:,\s*['"][a-zA-Z0-9_-]+['"])?/g,
                severity: 'medium',
                type: 'security',
                title: 'Potential API key in code',
                message: 'String resembles an API key. Verify it is not sensitive.',
                suggestion: 'If this is an API key, move it to environment variables.',
            },
            // HTTP instead of HTTPS
            {
                pattern: /['"]http:\/\/[^'"\s]+(?:api|auth|login|oauth)[^'"\s]*['"]/gi,
                severity: 'high',
                type: 'security',
                title: 'Non-HTTPS API endpoint',
                message: 'API endpoint uses HTTP instead of HTTPS.',
                suggestion: 'Use HTTPS for all API communications.',
            },
            // Disabled SSL verification
            {
                pattern: /rejectUnauthorized\s*:\s*false/g,
                severity: 'high',
                type: 'security',
                title: 'SSL verification disabled',
                message: 'SSL certificate verification is disabled, enabling MITM attacks.',
                suggestion: 'Enable SSL verification in production.',
            },
            {
                pattern: /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/g,
                severity: 'critical',
                type: 'security',
                title: 'TLS verification disabled globally',
                message: 'Global TLS verification is disabled.',
                suggestion: 'Remove this setting and fix certificate issues properly.',
            },
            // CORS issues
            {
                pattern: /Access-Control-Allow-Origin['"]\s*:\s*['"]\*/g,
                severity: 'high',
                type: 'security',
                title: 'Wildcard CORS origin',
                message: 'CORS allows all origins, potentially exposing API to unauthorized access.',
                suggestion: 'Restrict CORS to specific trusted origins.',
            },
            {
                pattern: /cors\s*\(\s*\)/g,
                severity: 'medium',
                type: 'security',
                title: 'CORS enabled without configuration',
                message: 'CORS middleware is enabled with default (permissive) settings.',
                suggestion: 'Configure CORS with specific origins: cors({ origin: [...] })',
            },
            // JWT issues
            {
                pattern: /jwt\.sign\s*\([^)]*,\s*['"][^'"]+['"]/g,
                severity: 'high',
                type: 'security',
                title: 'Hardcoded JWT secret',
                message: 'JWT secret is hardcoded in source code.',
                suggestion: 'Use environment variable: process.env.JWT_SECRET',
            },
            {
                pattern: /algorithm['"]\s*:\s*['"]none['"]/gi,
                severity: 'critical',
                type: 'security',
                title: 'JWT none algorithm',
                message: 'JWT is configured to accept no algorithm, allowing forged tokens.',
                suggestion: 'Always specify a secure algorithm like HS256 or RS256.',
            },
            {
                pattern: /expiresIn['"]\s*:\s*['"]\d{2,}[dmy]['"]/gi,
                severity: 'medium',
                type: 'security',
                title: 'Long-lived JWT',
                message: 'JWT has a very long expiration time.',
                suggestion: 'Use shorter expiration with refresh tokens.',
            },
            // Rate limiting
            {
                pattern: /app\.(get|post|put|delete|patch)\s*\([^)]+\)\s*(?!.*rateLimit)/g,
                severity: 'low',
                type: 'security',
                title: 'API endpoint without rate limiting',
                message: 'API endpoints should have rate limiting to prevent abuse.',
                suggestion: 'Add rate limiting middleware to API endpoints.',
            },
            // Missing authentication check
            {
                pattern: /router\.(get|post|put|delete|patch)\s*\([^,]+,\s*(?:async\s*)?\([^)]*req[^)]*\)/g,
                severity: 'info',
                type: 'security',
                title: 'Check authentication middleware',
                message: 'Verify this endpoint has proper authentication middleware.',
                suggestion: 'Add authentication middleware before route handler if needed.',
            },
            // SQL in API
            {
                pattern: /\$\{[^}]*\}\s*(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)/gi,
                severity: 'critical',
                type: 'security',
                title: 'Potential SQL injection in API',
                message: 'Template literal used in SQL query, vulnerable to injection.',
                suggestion: 'Use parameterized queries or an ORM.',
            },
            // Logging sensitive data
            {
                pattern: /console\.log\s*\([^)]*(?:password|token|secret|key|auth)[^)]*\)/gi,
                severity: 'high',
                type: 'security',
                title: 'Sensitive data logged',
                message: 'Potentially logging sensitive information.',
                suggestion: 'Remove logging of sensitive data or mask values.',
            },
            // Error details exposed
            {
                pattern: /res\.(?:json|send)\s*\([^)]*(?:error|err)\.(?:message|stack)/g,
                severity: 'medium',
                type: 'security',
                title: 'Error details exposed to client',
                message: 'Detailed error messages may leak sensitive information.',
                suggestion: 'Return generic error messages to clients in production.',
            },
        ];
    }

    shouldAnalyzeFile(filePath) {
        // Analyze JS/TS files that might contain API code
        return /\.(js|ts|jsx|tsx)$/.test(filePath) && super.shouldAnalyzeFile(filePath);
    }

    async analyze(files, context) {
        this.reset();
        const startTime = Date.now();

        for (const file of files) {
            if (!this.shouldAnalyzeFile(file.path)) continue;

            // Prioritize files that look like API/server code
            const isApiFile = /(?:api|route|controller|endpoint|server|handler)/i.test(file.path);

            this.stats.filesAnalyzed++;
            this.stats.linesAnalyzed += file.content.split('\n').length;

            await this.analyzeFile(file.path, file.content, context, isApiFile);
        }

        this.stats.executionTime = Date.now() - startTime;
        return this.getIssues();
    }

    async analyzeFile(filePath, content, _context, isApiFile = false) {
        const lines = content.split('\n');

        for (const pattern of this.patterns) {
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const matches = line.match(pattern.pattern);

                if (matches) {
                    // Skip if in a comment
                    const trimmedLine = line.trim();
                    if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) {
                        continue;
                    }

                    // Adjust severity for non-API files (might be false positives)
                    let severity = pattern.severity;
                    if (!isApiFile && severity !== 'critical') {
                        // Downgrade non-critical issues in non-API files
                        if (severity === 'high') severity = 'medium';
                        else if (severity === 'medium') severity = 'low';
                    }

                    this.addIssue({
                        severity,
                        type: pattern.type,
                        title: pattern.title,
                        message: pattern.message,
                        file: filePath,
                        line: i + 1,
                        column: line.indexOf(matches[0]) + 1,
                        snippet: line.trim().substring(0, 100),
                        suggestion: pattern.suggestion,
                        tags: ['api', 'security', pattern.type],
                        analyzer: this.name,
                    });
                }
            }
        }
    }
}

export default APISecurityAnalyzer;

/**
 * Comprehensive test suite for Security Analyzer
 */
import { SecurityAnalyzer } from '../src/analyzers/securityAnalyzer.js';

describe('SecurityAnalyzer', () => {
    let analyzer;
    let mockConfig;

    beforeEach(() => {
        mockConfig = {
            getIgnoredFiles: () => ['node_modules/**', 'test/**'],
            getSupportedLanguages: () => ['javascript', 'typescript', 'python'],
            get: (_key) => null
        };
        analyzer = new SecurityAnalyzer(mockConfig);
    });

    describe('SQL Injection Detection', () => {
        it('should detect SQL injection in string concatenation', async () => {
            const code = `
        const query = "SELECT * FROM users WHERE id = " + userId;
        db.execute(query);
      `;
            const files = [{ path: 'test.js', content: code }];

            const issues = await analyzer.analyze(files, {});

            expect(issues.length).toBeGreaterThan(0);
            expect(issues.some(i => i.message.toLowerCase().includes('sql'))).toBe(true);
            expect(issues.some(i => i.severity === 'high')).toBe(true);
        });

        it('should not flag parameterized queries', async () => {
            const code = `
        const query = "SELECT * FROM users WHERE id = ?";
        db.execute(query, [userId]);
      `;
            const files = [{ path: 'test.js', content: code }];

            const issues = await analyzer.analyze(files, {});

            const sqlIssues = issues.filter(i => i.message.toLowerCase().includes('sql'));
            expect(sqlIssues.length).toBe(0);
        });
    });

    describe('XSS Detection', () => {
        it('should detect dangerous innerHTML usage', async () => {
            const code = `
        element.innerHTML = userInput;
      `;
            const files = [{ path: 'test.js', content: code }];

            const issues = await analyzer.analyze(files, {});

            expect(issues.some(i => i.message.toLowerCase().includes('innerhtml'))).toBe(true);
            expect(issues.some(i => i.severity === 'medium' || i.severity === 'high')).toBe(true);
        });

        it('should detect eval usage', async () => {
            const code = `
        eval(userCode);
      `;
            const files = [{ path: 'test.js', content: code }];

            const issues = await analyzer.analyze(files, {});

            expect(issues.some(i => i.message.toLowerCase().includes('eval'))).toBe(true);
            expect(issues.some(i => i.severity === 'high')).toBe(true);
        });
    });

    describe('Secret Detection', () => {
        it('should detect hardcoded API keys', async () => {
            const code = `
        const apiKey = "sk-1234567890abcdef1234567890abcdef";
      `;
            const files = [{ path: 'config.js', content: code }];

            const issues = await analyzer.analyze(files, {});

            expect(issues.some(i => i.message.toLowerCase().includes('key') || i.message.toLowerCase().includes('secret'))).toBe(true);
        });

        it('should detect AWS credentials', async () => {
            const code = `
        const AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE";
        const AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
      `;
            const files = [{ path: 'aws-config.js', content: code }];

            const issues = await analyzer.analyze(files, {});

            expect(issues.length).toBeGreaterThan(0);
            expect(issues.some(i => i.severity === 'critical' || i.severity === 'high')).toBe(true);
        });

        it('should detect AWS SDK v3 temporary access key (ASIA)', async () => {
            const code = `
        const credentials = {
            accessKeyId: "ASIAIOSFODNN7EXAMPLE"
        };
      `;
            const files = [{ path: 'aws-v3.js', content: code }];

            const issues = await analyzer.analyze(files, {});

            expect(issues.length).toBeGreaterThan(0);
            expect(issues.some(i => i.title.includes('AWS'))).toBe(true);
        });

        it('should detect AWS SDK v3 unique ID (AID)', async () => {
            const code = `
        const accessKeyId = "AIDAIOSFODNN7EXAMPLE";
      `;
            const files = [{ path: 'config.js', content: code }];

            const issues = await analyzer.analyze(files, {});

            expect(issues.some(i => i.title.includes('AWS'))).toBe(true);
        });

        it('should detect AWS SDK v3 role ARN (AROA)', async () => {
            const code = `
        const roleArn = "AROAIOSFODNN7EXAMPLE";
      `;
            const files = [{ path: 'config.js', content: code }];

            const issues = await analyzer.analyze(files, {});

            expect(issues.some(i => i.title.includes('AWS'))).toBe(true);
        });

        it('should detect AWS SDK v3 pattern (A3T)', async () => {
            const code = `
        const credentials = { accessKeyId: "A3TIOSFODNN7EXAMPLE" };
      `;
            const files = [{ path: 'config.js', content: code }];

            const issues = await analyzer.analyze(files, {});

            expect(issues.some(i => i.title.includes('AWS'))).toBe(true);
        });

        it('should detect AWS SDK v3 extended pattern (A3TX)', async () => {
            const code = `
        process.env.AWS_ACCESS_KEY_ID = "A3TXOSFODNN7EXAMP";
      `;
            const files = [{ path: 'config.js', content: code }];

            const issues = await analyzer.analyze(files, {});

            expect(issues.some(i => i.title.includes('AWS'))).toBe(true);
        });

        it('should detect AWS credentials via assignment pattern', async () => {
            const code = `
        const awsConfig = { accessKeyId: "ASIAIOSFODNN7EXAMPLE" };
      `;
            const files = [{ path: 'aws-sdk-v3.js', content: code }];

            const issues = await analyzer.analyze(files, {});

            expect(issues.some(i => i.title.includes('AWS'))).toBe(true);
        });

        it('should detect role-based AWS credentials (AROA assignment)', async () => {
            const code = `
        const config = { accessKey: "AROAIOSFODNN7EXAMPLE" };
      `;
            const files = [{ path: 'config.js', content: code }];

            const issues = await analyzer.analyze(files, {});

            expect(issues.some(i => i.title.includes('AWS'))).toBe(true);
        });

        it('should not flag environment variable references', async () => {
            const code = `
        const apiKey = process.env.API_KEY;
      `;
            const files = [{ path: 'config.js', content: code }];

            const issues = await analyzer.analyze(files, {});

            const secretIssues = issues.filter(i =>
                i.message.toLowerCase().includes('api key') ||
                i.message.toLowerCase().includes('secret')
            );
            expect(secretIssues.length).toBe(0);
        });
    });

    describe('File Filtering', () => {
        it('should skip ignored files', async () => {
            expect(analyzer.shouldAnalyzeFile('node_modules/package/index.js')).toBe(false);
            expect(analyzer.shouldAnalyzeFile('test/fixtures/test.js')).toBe(false);
        });

        it('should analyze non-ignored files', async () => {
            expect(analyzer.shouldAnalyzeFile('src/index.js')).toBe(true);
            expect(analyzer.shouldAnalyzeFile('lib/utils.ts')).toBe(true);
        });
    });

    describe('Statistics', () => {
        it('should track analysis stats', async () => {
            const files = [
                { path: 'file1.js', content: 'const x = 1;\nconst y = 2;\n' },
                { path: 'file2.js', content: 'eval(code);\n' }
            ];

            await analyzer.analyze(files, {});

            const stats = analyzer.getStats();
            expect(stats.filesAnalyzed).toBe(2);
            expect(stats.linesAnalyzed).toBeGreaterThan(0);
            expect(stats.issuesFound).toBeGreaterThan(0);
            expect(stats.executionTime).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Issue Formatting', () => {
        it('should include required fields in issues', async () => {
            const code = `eval(userInput);`;
            const files = [{ path: 'test.js', content: code }];

            const issues = await analyzer.analyze(files, {});

            expect(issues.length).toBeGreaterThan(0);
            const issue = issues[0];

            expect(issue).toHaveProperty('id');
            expect(issue).toHaveProperty('analyzer');
            expect(issue).toHaveProperty('severity');
            expect(issue).toHaveProperty('type');
            expect(issue).toHaveProperty('title');
            expect(issue).toHaveProperty('message');
            expect(issue).toHaveProperty('file');
            expect(issue).toHaveProperty('line');
        });
    });
});

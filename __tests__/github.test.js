/**
 * Test suite for GitHub Integration with security features
 */
import { GitHubIntegration } from '../src/integrations/github.js';
import { SecurityError } from '../src/utils/errorHandler.js';

// Mock fetch
global.fetch = async () => ({
  ok: true,
  json: async () => ({ data: [] })
});

describe('GitHubIntegration', () => {
    let github;

    beforeEach(() => {
        github = new GitHubIntegration({
            token: 'test-token-123',
            baseUrl: 'https://api.github.com'
        });
    });

    describe('Security Features', () => {
        it('should accept default GitHub API hostname', () => {
            expect(() => {
                new GitHubIntegration({
                    token: 'test',
                    baseUrl: 'https://api.github.com'
                });
            }).not.toThrow();
        });

        it('should allow custom GitHub Enterprise hostnames', () => {
            expect(() => {
                new GitHubIntegration({
                    token: 'test',
                    baseUrl: 'https://github.enterprise.com/api/v3',
                    allowedHostnames: ['github.enterprise.com', 'api.github.com']
                });
            }).not.toThrow();
        });

        it('should reject non-allowed hostnames', () => {
            expect(() => {
                new GitHubIntegration({
                    token: 'test',
                    baseUrl: 'https://malicious-site.com/api',
                    allowedHostnames: ['api.github.com']
                });
            }).toThrow(SecurityError);
        });

        it('should prevent SSRF attacks on internal networks', async () => {
            expect(() => {
                new GitHubIntegration({
                    token: 'test',
                    baseUrl: 'https://api.github.com',
                    allowedHostnames: ['localhost'] // Malicious config
                });
            }).toThrow(SecurityError);
        });

        it('should only allow HTTPS protocol', async () => {
            github.baseUrl = 'http://api.github.com';
            github.allowedHostnames = ['api.github.com'];

            await expect(
                github.request('GET', '/repos/test/test')
            ).rejects.toThrow(SecurityError);
        });

        it('should support wildcard subdomains', () => {
            github = new GitHubIntegration({
                token: 'test',
                baseUrl: 'https://api.github.enterprise.com',
                allowedHostnames: ['*.github.enterprise.com']
            });

            expect(github.isHostnameAllowed('api.github.enterprise.com')).toBe(true);
            expect(github.isHostnameAllowed('other.github.enterprise.com')).toBe(true);
            expect(github.isHostnameAllowed('github.enterprise.com')).toBe(false);
        });
    });

    describe('PR URL Parsing', () => {
        it('should parse standard GitHub PR URL', () => {
            const result = github.parsePrUrl('https://github.com/owner/repo/pull/123');
            expect(result).toEqual({
                owner: 'owner',
                repo: 'repo',
                prNumber: 123
            });
        });

        it('should parse GitHub Enterprise PR URL', () => {
            const result = github.parsePrUrl('https://github.enterprise.com/owner/repo/pull/456');
            expect(result).toEqual({
                owner: 'owner',
                repo: 'repo',
                prNumber: 456
            });
        });

        it('should throw on invalid PR URL', () => {
            expect(() => {
                github.parsePrUrl('https://invalid-url.com/test');
            }).toThrow('Invalid GitHub PR URL');
        });
    });

    describe('Issue Formatting', () => {
        it('should format issues with severity emojis', () => {
            const issues = [
                { severity: 'critical', title: 'SQL Injection', message: 'Test', file: 'test.js', line: 1 },
                { severity: 'high', title: 'XSS', message: 'Test', file: 'test.js', line: 2 },
                { severity: 'medium', title: 'Warning', message: 'Test', file: 'test.js', line: 3 },
                { severity: 'low', title: 'Info', message: 'Test', file: 'test.js', line: 4 }
            ];

            const formatted = github.formatIssuesForReview(issues);

            expect(formatted.length).toBe(4);
            expect(formatted[0].body).toContain('🛑');
            expect(formatted[1].body).toContain('🔶');
            expect(formatted[2].body).toContain('🔷');
            expect(formatted[3].body).toContain('🟢');
        });

        it('should normalize Windows paths', () => {
            const issues = [
                { severity: 'medium', title: 'Test', message: 'Test', file: 'src\\utils\\test.js', line: 1 }
            ];

            const formatted = github.formatIssuesForReview(issues);
            expect(formatted[0].file).toBe('src/utils/test.js');
        });
    });

    describe('Summary Generation', () => {
        it('should generate summary with issue counts', () => {
            const issues = [
                { severity: 'critical', title: 'Test 1', message: 'Test' },
                { severity: 'critical', title: 'Test 2', message: 'Test' },
                { severity: 'high', title: 'Test 3', message: 'Test' },
                { severity: 'medium', title: 'Test 4', message: 'Test' }
            ];

            const summary = github.generateSummaryComment(issues);

            expect(summary).toContain('Total Issues Found');
            expect(summary).toContain('4');
            expect(summary).toContain('🛑 Critical | 2');
            expect(summary).toContain('🔶 High | 1');
            expect(summary).toContain('🔷 Medium | 1');
            expect(summary).toContain('Action Required');
        });

        it('should show success message when no issues found', () => {
            const summary = github.generateSummaryComment([]);

            expect(summary).toContain('Great job');
            expect(summary).toContain('No issues detected');
        });
    });

    describe('API Requests', () => {
        it('should throw error when token is missing', async () => {
            github.token = null;

            await expect(
                github.request('GET', '/repos/test/test')
            ).rejects.toThrow('GitHub token not found');
        });

        it('should have proper request configuration', () => {
            expect(github.token).toBe('test-token-123');
            expect(github.baseUrl).toBe('https://api.github.com');
            expect(github.headers).toBeDefined();
            expect(github.headers['Authorization']).toBeDefined();
        });
    });
});

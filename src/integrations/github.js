
/**
 * GitHubIntegration - Posts Sentinel analysis results to GitHub PRs
 * Uses the GitHub REST API directly (no octokit dependency)
 */
export class GitHubIntegration {
    constructor(options = {}) {
        this.token = options.token || process.env.GITHUB_TOKEN;
        this.baseUrl = options.baseUrl || 'https://api.github.com';
    }

    /**
     * Parse a GitHub PR URL into owner, repo, and PR number
     * @param {string} prUrl - Full GitHub PR URL
     * @returns {{ owner: string, repo: string, prNumber: number }}
     */
    parsePrUrl(prUrl) {
        // Supports formats:
        // https://github.com/owner/repo/pull/123
        // github.com/owner/repo/pull/123
        const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i);
        if (!match) {
            throw new Error(`Invalid GitHub PR URL: ${prUrl}`);
        }
        return {
            owner: match[1],
            repo: match[2],
            prNumber: parseInt(match[3], 10),
        };
    }

    /**
     * Make an authenticated request to GitHub API
     */
    async request(method, endpoint, body = null) {
        if (!this.token) {
            throw new Error(
                'GitHub token not found. Set GITHUB_TOKEN environment variable or pass token in options.'
            );
        }

        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Sentinel-CLI',
        };

        const options = {
            method,
            headers,
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        // Validate URL to prevent SSRF
        const parsedUrl = new URL(url);
        if (parsedUrl.hostname !== 'api.github.com') {
            throw new Error('Invalid GitHub API URL');
        }
        
        const response = await fetch(url, options);

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`GitHub API error (${response.status}): ${errorBody}`);
        }

        return response.json();
    }

    /**
     * Get PR details including the head SHA
     */
    async getPrDetails(owner, repo, prNumber) {
        return this.request('GET', `/repos/${owner}/${repo}/pulls/${prNumber}`);
    }

    /**
     * Post a general comment on the PR
     */
    async postComment(owner, repo, prNumber, body) {
        return this.request('POST', `/repos/${owner}/${repo}/issues/${prNumber}/comments`, { body });
    }

    /**
     * Create a review with file-specific comments
     */
    async createReview(owner, repo, prNumber, commitSha, comments, body = '') {
        const reviewComments = comments.map(c => ({
            path: c.file,
            line: c.line,
            body: c.body,
        }));

        return this.request('POST', `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
            commit_id: commitSha,
            body: body || 'Sentinel Code Review',
            event: 'COMMENT',
            comments: reviewComments,
        });
    }

    /**
     * Format Sentinel issues into GitHub review comments
     */
    formatIssuesForReview(issues) {
        const severityEmoji = {
            critical: '🛑',
            high: '🔶',
            medium: '🔷',
            low: '🟢',
            info: 'ℹ️',
        };

        return issues.map(issue => ({
            file: issue.file.replace(/\\/g, '/'), // Normalize Windows paths
            line: issue.line || 1,
            body: `${severityEmoji[issue.severity] || '⚠️'} **${issue.severity.toUpperCase()}**: ${issue.title}\n\n${issue.message}${issue.suggestion ? `\n\n💡 **Suggestion:** ${issue.suggestion}` : ''}`,
        }));
    }

    /**
     * Generate a summary comment for the PR
     */
    generateSummaryComment(issues) {
        const counts = {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
        };

        for (const issue of issues) {
            counts[issue.severity] = (counts[issue.severity] || 0) + 1;
        }

        const total = issues.length;
        const lines = [
            '## 🛡️ Sentinel Code Review Summary',
            '',
            `**Total Issues Found:** ${total}`,
            '',
            '| Severity | Count |',
            '|----------|-------|',
        ];

        if (counts.critical > 0) lines.push(`| 🛑 Critical | ${counts.critical} |`);
        if (counts.high > 0) lines.push(`| 🔶 High | ${counts.high} |`);
        if (counts.medium > 0) lines.push(`| 🔷 Medium | ${counts.medium} |`);
        if (counts.low > 0) lines.push(`| 🟢 Low | ${counts.low} |`);
        if (counts.info > 0) lines.push(`| ℹ️ Info | ${counts.info} |`);

        lines.push('');
        if (total === 0) {
            lines.push('✨ **Great job!** No issues detected.');
        } else if (counts.critical > 0 || counts.high > 0) {
            lines.push('⚠️ **Action Required:** Critical or high severity issues detected.');
        } else {
            lines.push('✅ No critical issues. Review the suggestions above.');
        }

        lines.push('', '---', '_Powered by [Sentinel CLI](https://github.com/KunjShah95/Sentinel-CLI)_');

        return lines.join('\n');
    }

    /**
     * Post a full review to a GitHub PR
     * @param {string} prUrl - GitHub PR URL
     * @param {Array} issues - Sentinel analysis issues
     */
    async postReview(prUrl, issues) {
        const { owner, repo, prNumber } = this.parsePrUrl(prUrl);

        // Get PR details to find the head commit SHA
        const prDetails = await this.getPrDetails(owner, repo, prNumber);
        const commitSha = prDetails.head.sha;

        // Filter issues that have valid file paths (for inline comments)
        const inlineIssues = issues.filter(i => i.file && i.line);
        const reviewComments = this.formatIssuesForReview(inlineIssues);

        // Post inline review if we have file-specific issues
        if (reviewComments.length > 0) {
            try {
                await this.createReview(owner, repo, prNumber, commitSha, reviewComments);
            } catch (error) {
                // If inline comments fail (e.g., file not in diff), fall back to summary only
                console.warn(`Could not post inline comments: ${error.message}`);
            }
        }

        // Always post a summary comment
        const summary = this.generateSummaryComment(issues);
        await this.postComment(owner, repo, prNumber, summary);

        return {
            success: true,
            prUrl,
            issuesPosted: issues.length,
            inlineComments: reviewComments.length,
        };
    }
}

export default GitHubIntegration;

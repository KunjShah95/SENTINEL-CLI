/**
 * Public Badge Generator for Sentinel CLI
 * Generates SVG badges showing security scores and analysis status
 */

export class BadgeGenerator {
    constructor() {
        this.colors = {
            critical: '#e53e3e',  // red
            high: '#dd6b20',      // orange
            medium: '#d69e2e',    // yellow
            low: '#48bb78',       // green
            success: '#38a169',   // green
            passing: '#38a169',
            info: '#4299e1'       // blue
        };
    }

    /**
     * Calculate security score from issues
     */
    calculateSecurityScore(issues) {
        if (issues.length === 0) return 100;

        const weights = {
            critical: 20,
            high: 10,
            medium: 5,
            low: 2,
            info: 0
        };

        let totalWeight = 0;
        for (const issue of issues) {
            totalWeight += weights[issue.severity] || 0;
        }

        // Score calculation: Start at 100, subtract weighted issues
        const score = Math.max(0, 100 - totalWeight);
        return Math.round(score);
    }

    /**
     * Get color based on score
     */
    getScoreColor(score) {
        if (score >= 90) return this.colors.success;
        if (score >= 75) return this.colors.low;
        if (score >= 50) return this.colors.medium;
        if (score >= 25) return this.colors.high;
        return this.colors.critical;
    }

    /**
     * Generate security score badge SVG
     */
    generateScoreBadge(score) {
        const color = this.getScoreColor(score);
        const grade = this.getGrade(score);

        return this.createBadge('Sentinel', `${score} (${grade})`, color);
    }

    /**
     * Get letter grade from score
     */
    getGrade(score) {
        if (score >= 90) return 'A';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 60) return 'D';
        return 'F';
    }

    /**
     * Generate issue count badge
     */
    generateIssueBadge(issues) {
        const critical = issues.filter(i => i.severity === 'critical').length;
        const high = issues.filter(i => i.severity === 'high').length;
        const total = issues.length;

        let color;
        let label = 'issues';
        let value;

        if (critical > 0) {
            color = this.colors.critical;
            value = `${critical} critical`;
        } else if (high > 0) {
            color = this.colors.high;
            value = `${high} high`;
        } else if (total > 0) {
            color = this.colors.medium;
            value = `${total} found`;
        } else {
            color = this.colors.success;
            value = 'none';
        }

        return this.createBadge(label, value, color);
    }

    /**
     * Generate passing/failing badge
     */
    generateStatusBadge(issues) {
        const critical = issues.filter(i => i.severity === 'critical').length;
        const high = issues.filter(i => i.severity === 'high').length;

        if (critical > 0 || high > 0) {
            return this.createBadge('Sentinel', 'failing', this.colors.critical);
        } else {
            return this.createBadge('Sentinel', 'passing', this.colors.passing);
        }
    }

    /**
     * Generate analyzer-specific badge
     */
    generateAnalyzerBadge(analyzer, issues) {
        const analyzerIssues = issues.filter(i => i.analyzer === analyzer);
        const count = analyzerIssues.length;

        let color;
        if (count === 0) {
            color = this.colors.success;
        } else if (count <= 3) {
            color = this.colors.medium;
        } else {
            color = this.colors.high;
        }

        return this.createBadge(analyzer, count === 0 ? 'clean' : `${count} issues`, color);
    }

    /**
     * Create badge SVG with shields.io style
     */
    createBadge(label, value, color) {
        const labelWidth = this.calculateTextWidth(label) + 10;
        const valueWidth = this.calculateTextWidth(value) + 10;
        const totalWidth = labelWidth + valueWidth;

        const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="${labelWidth / 2 * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)">${this.escapeXml(label)}</text>
    <text x="${labelWidth / 2 * 10}" y="140" transform="scale(.1)" fill="#fff">${this.escapeXml(label)}</text>
    <text aria-hidden="true" x="${(labelWidth + valueWidth / 2) * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)">${this.escapeXml(value)}</text>
    <text x="${(labelWidth + valueWidth / 2) * 10}" y="140" transform="scale(.1)" fill="#fff">${this.escapeXml(value)}</text>
  </g>
</svg>`.trim();

        return svg;
    }

    /**
     * Calculate approximate text width
     */
    calculateTextWidth(text) {
        // Approximate character width at font-size 11px
        const charWidth = 6;
        return text.length * charWidth + 10;
    }

    /**
     * Escape XML special characters
     */
    escapeXml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&apos;'
        };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    }

    /**
     * Generate markdown badge link
     */
    generateMarkdownBadge(owner, repo, type = 'score') {
        const baseUrl = 'https://sentinel-cli.app';
        const badgeUrl = `${baseUrl}/badge/${owner}/${repo}/${type}.svg`;
        const reportUrl = `${baseUrl}/report/${owner}/${repo}`;

        return `[![Sentinel ${type}](${badgeUrl})](${reportUrl})`;
    }

    /**
     * Generate HTML badge link
     */
    generateHtmlBadge(owner, repo, type = 'score') {
        const baseUrl = 'https://sentinel-cli.app';
        const badgeUrl = `${baseUrl}/badge/${owner}/${repo}/${type}.svg`;
        const reportUrl = `${baseUrl}/report/${owner}/${repo}`;

        return `<a href="${reportUrl}"><img src="${badgeUrl}" alt="Sentinel ${type}"></a>`;
    }

    /**
     * Generate multiple badge options for README
     */
    generateReadmeBadges(owner, repo) {
        return {
            score: this.generateMarkdownBadge(owner, repo, 'score'),
            status: this.generateMarkdownBadge(owner, repo, 'status'),
            issues: this.generateMarkdownBadge(owner, repo, 'issues'),
            security: this.generateMarkdownBadge(owner, repo, 'security')
        };
    }
}

/**
 * Badge API Server - Serves badges as HTTP endpoints
 */
export class BadgeAPIServer {
    constructor(options = {}) {
        this.generator = new BadgeGenerator();
        this.cache = options.cache;
        this.storage = options.storage; // For storing analysis results
    }

    /**
     * Get analysis results for a repository
     */
    async getAnalysisResults(owner, repo) {
        // In production, fetch from database
        // For now, return mock data or from cache
        const cacheKey = `analysis_${owner}_${repo}`;

        if (this.cache) {
            const cached = await this.cache.get(cacheKey);
            if (cached) return cached;
        }

        // Mock data for demonstration
        return {
            issues: [],
            timestamp: new Date().toISOString(),
            stats: { filesAnalyzed: 0, issuesFound: 0 }
        };
    }

    /**
     * Handle badge request
     */
    async handleBadgeRequest(owner, repo, type = 'score') {
        try {
            const results = await this.getAnalysisResults(owner, repo);
            const issues = results.issues || [];

            let svg;
            switch (type) {
                case 'score': {
                    const score = this.generator.calculateSecurityScore(issues);
                    svg = this.generator.generateScoreBadge(score);
                    break;
                }

                case 'status':
                    svg = this.generator.generateStatusBadge(issues);
                    break;

                case 'issues':
                    svg = this.generator.generateIssueBadge(issues);
                    break;

                case 'security': {
                    const securityIssues = issues.filter(i => i.analyzer === 'SecurityAnalyzer');
                    svg = this.generator.generateAnalyzerBadge('security', securityIssues);
                    break;
                }
                default:
                    svg = this.generator.generateStatusBadge(issues);
            }

            return {
                svg,
                contentType: 'image/svg+xml',
                cacheControl: 'public, max-age=300' // 5 minutes
            };
        } catch (error) {
            // Return error badge
            const errorSvg = this.generator.createBadge('Sentinel', 'error', this.generator.colors.critical);
            return {
                svg: errorSvg,
                contentType: 'image/svg+xml',
                cacheControl: 'no-cache'
            };
        }
    }
}

export default BadgeGenerator;

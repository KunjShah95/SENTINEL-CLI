import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * GitBlameIntegration - Identify who introduced issues using git blame
 * Helps with issue attribution and accountability
 */
export class GitBlameIntegration {
    constructor(options = {}) {
        this.cwd = options.cwd || process.cwd();
        this.cache = new Map();
    }

    /**
     * Get blame information for a specific line
     * @param {string} filePath - Path to the file
     * @param {number} line - Line number (1-indexed)
     * @returns {Promise<Object>} Blame info
     */
    async blameLine(filePath, line) {
        const cacheKey = `${filePath}:${line}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            const { stdout } = await execAsync(
                `git blame -L ${line},${line} --porcelain "${filePath}"`,
                { cwd: this.cwd }
            );

            const blameInfo = this.parsePorcelainBlame(stdout);
            this.cache.set(cacheKey, blameInfo);
            return blameInfo;
        } catch (error) {
            return null;
        }
    }

    /**
     * Parse git blame porcelain output
     */
    parsePorcelainBlame(output) {
        const lines = output.split('\n');
        const result = {
            commit: null,
            author: null,
            email: null,
            date: null,
            summary: null,
        };

        for (const line of lines) {
            if (line.match(/^[0-9a-f]{40}/)) {
                result.commit = line.split(' ')[0];
            } else if (line.startsWith('author ')) {
                result.author = line.replace('author ', '');
            } else if (line.startsWith('author-mail ')) {
                result.email = line.replace('author-mail ', '').replace(/[<>]/g, '');
            } else if (line.startsWith('author-time ')) {
                const timestamp = parseInt(line.replace('author-time ', ''), 10);
                result.date = new Date(timestamp * 1000).toISOString();
            } else if (line.startsWith('summary ')) {
                result.summary = line.replace('summary ', '');
            }
        }

        return result;
    }

    /**
     * Enrich issues with blame information
     * @param {Array} issues - Sentinel analysis issues
     * @returns {Promise<Array>} Issues with blame info attached
     */
    async enrichIssuesWithBlame(issues) {
        const enrichedIssues = [];

        for (const issue of issues) {
            if (issue.file && issue.line) {
                const blameInfo = await this.blameLine(issue.file, issue.line);
                enrichedIssues.push({
                    ...issue,
                    blame: blameInfo,
                });
            } else {
                enrichedIssues.push(issue);
            }
        }

        return enrichedIssues;
    }

    /**
     * Generate blame report grouped by author
     */
    generateAuthorReport(enrichedIssues) {
        const byAuthor = {};

        for (const issue of enrichedIssues) {
            const author = issue.blame?.author || 'Unknown';
            if (!byAuthor[author]) {
                byAuthor[author] = {
                    author,
                    email: issue.blame?.email || 'unknown',
                    issues: [],
                    counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
                };
            }

            byAuthor[author].issues.push(issue);
            byAuthor[author].counts[issue.severity] = (byAuthor[author].counts[issue.severity] || 0) + 1;
        }

        // Sort by total issues (descending)
        return Object.values(byAuthor).sort((a, b) => b.issues.length - a.issues.length);
    }
}

/**
 * TrendTracker - Track historical analysis trends
 * Stores and retrieves analysis history for trend visualization
 */
export class TrendTracker {
    constructor(options = {}) {
        this.historyDir = options.historyDir || path.join(process.cwd(), '.sentinel', 'history');
        this.maxEntries = options.maxEntries || 100;
    }

    /**
     * Ensure history directory exists
     */
    async ensureDir() {
        try {
            await fs.mkdir(this.historyDir, { recursive: true });
        } catch (e) {
            // Directory exists
        }
    }

    /**
     * Save analysis result to history
     */
    async save(issues, metadata = {}) {
        await this.ensureDir();

        const entry = {
            timestamp: new Date().toISOString(),
            metadata: {
                ...metadata,
                branch: metadata.branch || await this.getCurrentBranch(),
                commit: metadata.commit || await this.getCurrentCommit(),
            },
            summary: this.generateSummary(issues),
            issueCount: issues.length,
        };

        const filename = `${Date.now()}.json`;
        const filepath = path.join(this.historyDir, filename);
        await fs.writeFile(filepath, JSON.stringify(entry, null, 2), 'utf8');

        // Cleanup old entries
        await this.cleanup();

        return entry;
    }

    /**
     * Generate summary counts
     */
    generateSummary(issues) {
        const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: issues.length };
        for (const issue of issues) {
            counts[issue.severity] = (counts[issue.severity] || 0) + 1;
        }
        return counts;
    }

    /**
     * Get current git branch
     */
    async getCurrentBranch() {
        try {
            const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD');
            return stdout.trim();
        } catch (e) {
            return 'unknown';
        }
    }

    /**
     * Get current git commit
     */
    async getCurrentCommit() {
        try {
            const { stdout } = await execAsync('git rev-parse --short HEAD');
            return stdout.trim();
        } catch (e) {
            return 'unknown';
        }
    }

    /**
     * Load analysis history
     * @param {number} limit - Maximum entries to load
     */
    async loadHistory(limit = 30) {
        await this.ensureDir();

        try {
            const files = await fs.readdir(this.historyDir);
            const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();
            const limitedFiles = jsonFiles.slice(0, limit);

            const history = [];
            for (const file of limitedFiles) {
                try {
                    const content = await fs.readFile(path.join(this.historyDir, file), 'utf8');
                    history.push(JSON.parse(content));
                } catch (e) {
                    // Skip invalid files
                }
            }

            return history;
        } catch (e) {
            return [];
        }
    }

    /**
     * Cleanup old entries
     */
    async cleanup() {
        try {
            const files = await fs.readdir(this.historyDir);
            const jsonFiles = files.filter(f => f.endsWith('.json')).sort();

            if (jsonFiles.length > this.maxEntries) {
                const toDelete = jsonFiles.slice(0, jsonFiles.length - this.maxEntries);
                for (const file of toDelete) {
                    await fs.unlink(path.join(this.historyDir, file));
                }
            }
        } catch (e) {
            // Cleanup failed, not critical
        }
    }

    /**
     * Generate trend analysis
     */
    async analyzeTrends() {
        const history = await this.loadHistory(30);

        if (history.length < 2) {
            return { trend: 'insufficient_data', history };
        }

        const latest = history[0];
        const previous = history[1];
        const oldest = history[history.length - 1];

        const shortTermChange = latest.issueCount - previous.issueCount;
        const longTermChange = latest.issueCount - oldest.issueCount;

        let trend = 'stable';
        if (shortTermChange > 5) trend = 'worsening';
        else if (shortTermChange < -5) trend = 'improving';

        return {
            trend,
            current: latest.issueCount,
            shortTermChange,
            longTermChange,
            dataPoints: history.length,
            oldestDate: oldest.timestamp,
            latestDate: latest.timestamp,
            history: history.map(h => ({
                date: h.timestamp,
                total: h.issueCount,
                critical: h.summary.critical,
                high: h.summary.high,
            })),
        };
    }
}

export default { GitBlameIntegration, TrendTracker };

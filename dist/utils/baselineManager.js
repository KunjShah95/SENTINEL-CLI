import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Manages baseline functionality for Sentinel CI/CD integration
 * Allows ignoring existing issues and flagging only new ones
 */
export class BaselineManager {
  constructor(baselineDir = '.sentinel') {
    this.baselineDir = baselineDir;
    this.baselineFile = path.join(baselineDir, 'baseline.json');
    this.configDir = baselineDir;
  }

  /**
   * Initialize baseline directory structure
   */
  async initialize() {
    try {
      await fs.mkdir(this.configDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  /**
   * Create a new baseline from current issues
   */
  async createBaseline(issues, options = {}) {
    await this.initialize();

    const baseline = {
      version: '1.0.0',
      created: new Date().toISOString(),
      hash: this.generateBaselineHash(issues),
      metadata: {
        totalIssues: issues.length,
        analyzerVersion: options.analyzerVersion || '1.5.0',
        sentinelVersion: options.sentinelVersion || '1.5.0',
        description: options.description || '',
        author: options.author || '',
      },
      issues: this.normalizeIssues(issues),
    };

    // Save current baseline as backup if it exists
    if (await this.baselineExists()) {
      const currentBaseline = await this.loadBaseline();
      const backupPath = path.join(this.configDir, `baseline.backup.${Date.now()}.json`);
      await fs.writeFile(backupPath, JSON.stringify(currentBaseline, null, 2));
    }

    await fs.writeFile(this.baselineFile, JSON.stringify(baseline, null, 2));

    return {
      success: true,
      baselineFile: this.baselineFile,
      issuesCount: issues.length,
      hash: baseline.hash,
    };
  }

  /**
   * Load existing baseline
   */
  async loadBaseline() {
    try {
      const content = await fs.readFile(this.baselineFile, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw new Error(`Failed to load baseline: ${error.message}`);
    }
  }

  /**
   * Check if baseline exists
   */
  async baselineExists() {
    try {
      await fs.access(this.baselineFile);
      return true;
    } catch (error) {
      console.warn('Baseline access check failed:', error?.message || String(error));
      return false;
    }
  }

  /**
   * Filter issues against baseline (only return new issues)
   */
  async filterNewIssues(issues) {
    const baseline = await this.loadBaseline();

    if (!baseline) {
      return {
        newIssues: issues,
        baselineIssues: [],
        totalIssues: issues.length,
        newIssuesCount: issues.length,
        baselineExists: false,
      };
    }

    const baselineIssues = new Map();

    // Index baseline issues for quick lookup
    for (const baselineIssue of baseline.issues) {
      const key = this.generateIssueKey(baselineIssue);
      baselineIssues.set(key, baselineIssue);
    }

    const newIssues = [];
    const matchedBaselineIssues = [];

    for (const issue of issues) {
      const key = this.generateIssueKey(issue);
      const baselineIssue = baselineIssues.get(key);

      if (baselineIssue) {
        matchedBaselineIssues.push(baselineIssue);
        baselineIssues.delete(key); // Remove matched issues
      } else {
        newIssues.push({
          ...issue,
          baselineStatus: 'new',
        });
      }
    }

    // Remaining baseline issues are resolved
    const resolvedIssues = Array.from(baselineIssues.values()).map(issue => ({
      ...issue,
      baselineStatus: 'resolved',
    }));

    return {
      newIssues,
      baselineIssues: matchedBaselineIssues,
      resolvedIssues,
      totalIssues: issues.length,
      newIssuesCount: newIssues.length,
      resolvedCount: resolvedIssues.length,
      baselineExists: true,
      baselineInfo: {
        created: baseline.created,
        totalBaselineIssues: baseline.issues.length,
        hash: baseline.hash,
      },
    };
  }

  /**
   * Update existing baseline with new issues
   */
  async updateBaseline(issues, options = {}) {
    const baseline = await this.loadBaseline();

    if (!baseline) {
      return await this.createBaseline(issues, options);
    }

    // Merge new issues with existing baseline
    const existingIssues = new Map();
    for (const issue of baseline.issues) {
      const key = this.generateIssueKey(issue);
      existingIssues.set(key, issue);
    }

    // Add or update issues
    for (const issue of issues) {
      const key = this.generateIssueKey(issue);
      existingIssues.set(key, {
        ...issue,
        lastSeen: new Date().toISOString(),
      });
    }

    // Remove resolved issues if requested
    if (options.removeResolved) {
      const currentIssueKeys = new Set(issues.map(i => this.generateIssueKey(i)));
      for (const [key] of existingIssues) {
        if (!currentIssueKeys.has(key)) {
          existingIssues.delete(key);
        }
      }
    }

    const updatedBaseline = {
      ...baseline,
      version: '1.0.0',
      updated: new Date().toISOString(),
      hash: this.generateBaselineHash(Array.from(existingIssues.values())),
      issues: Array.from(existingIssues.values()),
    };

    await fs.writeFile(this.baselineFile, JSON.stringify(updatedBaseline, null, 2));

    return {
      success: true,
      baselineFile: this.baselineFile,
      issuesCount: updatedBaseline.issues.length,
      hash: updatedBaseline.hash,
      updated: true,
    };
  }

  /**
   * Generate unique key for an issue
   */
  generateIssueKey(issue) {
    const keyData = {
      file: issue.file,
      line: issue.line,
      column: issue.column || 0,
      analyzer: issue.analyzer,
      type: issue.type,
      message: issue.message?.substring(0, 100), // First 100 chars
    };

    const keyString = JSON.stringify(keyData);
    return crypto.createHash('sha256').update(keyString).digest('hex').substring(0, 16);
  }

  /**
   * Generate hash for entire baseline
   */
  generateBaselineHash(issues) {
    const sortedIssues = issues
      .map(issue => this.generateIssueKey(issue))
      .sort();

    const baselineString = JSON.stringify(sortedIssues);
    return crypto.createHash('sha256').update(baselineString).digest('hex');
  }

  /**
   * Normalize issues for baseline storage
   */
  normalizeIssues(issues) {
    return issues.map(issue => ({
      id: issue.id,
      analyzer: issue.analyzer,
      type: issue.type,
      severity: issue.severity,
      title: issue.title,
      message: issue.message,
      file: issue.file,
      line: issue.line,
      column: issue.column,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      occurrences: 1,
    }));
  }

  /**
   * Get baseline statistics
   */
  async getBaselineStats() {
    const baseline = await this.loadBaseline();

    if (!baseline) {
      return {
        exists: false,
      };
    }

    const stats = {
      exists: true,
      created: baseline.created,
      updated: baseline.updated,
      totalIssues: baseline.issues.length,
      issuesBySeverity: {},
      issuesByAnalyzer: {},
      issuesByFile: {},
      oldestIssue: null,
      newestIssue: null,
    };

    for (const issue of baseline.issues) {
      // By severity
      stats.issuesBySeverity[issue.severity] = (stats.issuesBySeverity[issue.severity] || 0) + 1;

      // By analyzer
      stats.issuesByAnalyzer[issue.analyzer] = (stats.issuesByAnalyzer[issue.analyzer] || 0) + 1;

      // By file
      stats.issuesByFile[issue.file] = (stats.issuesByFile[issue.file] || 0) + 1;

      // Track oldest/newest
      const firstSeen = new Date(issue.firstSeen);
      if (!stats.oldestIssue || firstSeen < stats.oldestIssue) {
        stats.oldestIssue = issue.firstSeen;
      }
      if (!stats.newestIssue || firstSeen > stats.newestIssue) {
        stats.newestIssue = issue.firstSeen;
      }
    }

    return stats;
  }

  /**
   * List all baseline files
   */
  async listBaselineFiles() {
    try {
      const files = await fs.readdir(this.configDir);
      const baselineFiles = files
        .filter(file => file.startsWith('baseline') && file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(this.configDir, file),
          isBackup: file.includes('backup'),
        }));

      return baselineFiles;
    } catch (error) {
      console.warn('Failed to list baseline files:', error?.message || String(error));
      return [];
    }
  }

  /**
   * Delete baseline
   */
  async deleteBaseline() {
    try {
      await fs.unlink(this.baselineFile);
      return { success: true };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { success: true, message: 'Baseline does not exist' };
      }
      throw error;
    }
  }

  /**
   * Export baseline to different formats
   */
  async exportBaseline(format = 'json', outputPath) {
    const baseline = await this.loadBaseline();

    if (!baseline) {
      throw new Error('No baseline found to export');
    }

    let content;
    let extension;

    switch (format.toLowerCase()) {
      case 'json':
        content = JSON.stringify(baseline, null, 2);
        extension = '.json';
        break;

      case 'csv':
        content = this.exportToCSV(baseline.issues);
        extension = '.csv';
        break;

      case 'markdown':
        content = this.exportToMarkdown(baseline);
        extension = '.md';
        break;

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }

    const defaultPath = path.join(this.configDir, `baseline-export${extension}`);
    const finalPath = outputPath || defaultPath;

    await fs.writeFile(finalPath, content);

    return {
      success: true,
      outputPath: finalPath,
      format: format,
      issuesCount: baseline.issues.length,
    };
  }

  /**
   * Export issues to CSV format
   */
  exportToCSV(issues) {
    const headers = ['File', 'Line', 'Column', 'Severity', 'Analyzer', 'Type', 'Message', 'First Seen'];
    const rows = issues.map(issue => [
      issue.file,
      issue.line,
      issue.column || '',
      issue.severity,
      issue.analyzer,
      issue.type,
      `"${issue.message.replace(/"/g, '""')}"`,
      issue.firstSeen,
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  /**
   * Export baseline to Markdown format
   */
  exportToMarkdown(baseline) {
    let markdown = `# Sentinel Baseline Report\n\n`;
    markdown += `**Created:** ${new Date(baseline.created).toLocaleString()}\n`;
    markdown += `**Total Issues:** ${baseline.issues.length}\n\n`;

    // Group by severity
    const bySeverity = baseline.issues.reduce((acc, issue) => {
      acc[issue.severity] = (acc[issue.severity] || []);
      acc[issue.severity].push(issue);
      return acc;
    }, {});

    for (const [severity, issues] of Object.entries(bySeverity)) {
      markdown += `## ${severity.toUpperCase()} Issues (${issues.length})\n\n`;

      for (const issue of issues) {
        markdown += `### ${issue.title}\n\n`;
        markdown += `- **File:** \`${issue.file}:${issue.line}\`\n`;
        markdown += `- **Analyzer:** ${issue.analyzer}\n`;
        markdown += `- **Type:** ${issue.type}\n`;
        markdown += `- **First Seen:** ${new Date(issue.firstSeen).toLocaleString()}\n`;
        markdown += `- **Message:** ${issue.message}\n\n`;
      }
    }

    return markdown;
  }
}

export default BaselineManager;

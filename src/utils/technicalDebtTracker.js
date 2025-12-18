import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Technical Debt Tracker for Sentinel
 * Calculates and tracks technical debt metrics
 */
export class TechnicalDebtTracker {
  constructor(debtDir = '.sentinel') {
    this.debtDir = debtDir;
    this.debtFile = path.join(debtDir, 'technical-debt.json');
    this.historyFile = path.join(debtDir, 'debt-history.json');
    this.debtData = null;
    this.history = [];
  }

  /**
   * Initialize tracker
   */
  async initialize() {
    try {
      await fs.mkdir(this.debtDir, { recursive: true });
      await this.loadDebtData();
      await this.loadHistory();
    } catch (error) {
      console.warn(`Technical debt tracker initialization failed: ${error.message}`);
    }
  }

  /**
   * Load existing debt data
   */
  async loadDebtData() {
    try {
      const content = await fs.readFile(this.debtFile, 'utf8');
      this.debtData = JSON.parse(content);
    } catch (error) {
      // File doesn't exist or is corrupted
      this.debtData = {
        version: '1.0.0',
        lastUpdated: null,
        summary: {
          totalDebt: 0,
          highInterestDebt: 0,
          mediumInterestDebt: 0,
          lowInterestDebt: 0,
          debtRatio: 0,
        },
        files: {},
        trends: [],
      };
    }
  }

  /**
   * Load historical data
   */
  async loadHistory() {
    try {
      const content = await fs.readFile(this.historyFile, 'utf8');
      this.history = JSON.parse(content);
    } catch (error) {
      this.history = [];
    }
  }

  /**
   * Calculate technical debt from analysis results
   */
  async calculateDebt(analysisResults, options = {}) {
    const debtItems = [];
    const fileMetrics = new Map();
    
    // Process all issues and calculate debt
    for (const result of analysisResults) {
      if (!result.issues) continue;
      
      for (const issue of result.issues) {
        const debtItem = this.calculateIssueDebt(issue, options);
        if (debtItem) {
          debtItems.push(debtItem);
          
          // Aggregate by file
          const file = issue.file;
          if (!fileMetrics.has(file)) {
            fileMetrics.set(file, {
              debt: 0,
              issues: [],
              complexity: 0,
              maintainability: 100,
            });
          }
          
          const metrics = fileMetrics.get(file);
          metrics.debt += debtItem.debtScore;
          metrics.issues.push(issue);
          metrics.complexity += debtItem.complexityCost || 0;
          metrics.maintainability = Math.max(0, metrics.maintainability - debtItem.maintainabilityCost);
        }
      }
    }

    // Calculate summary statistics
    const summary = this.calculateDebtSummary(debtItems, fileMetrics);
    
    // Update debt data
    this.debtData.lastUpdated = new Date().toISOString();
    this.debtData.summary = summary;
    this.debtData.files = Object.fromEntries(
      Array.from(fileMetrics.entries()).map(([file, metrics]) => [
        file,
        {
          ...metrics,
          debtRatio: metrics.debt / (metrics.complexity || 1),
          maintainabilityScore: metrics.maintainability,
        }
      ])
    );

    return {
      debtItems,
      summary,
      fileMetrics: Object.fromEntries(fileMetrics),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Calculate debt score for individual issue
   */
  calculateIssueDebt(issue, options = {}) {
    const baseDebt = this.getBaseDebtBySeverity(issue.severity);
    const complexityMultiplier = this.getComplexityMultiplier(issue);
    const maintainabilityCost = this.getMaintainabilityCost(issue);
    const timeMultiplier = options.timeMultiplier || 1;
    
    const debtScore = Math.round(
      baseDebt * complexityMultiplier * maintainabilityCost * timeMultiplier
    );

    return {
      id: this.generateDebtId(),
      issueId: issue.id,
      file: issue.file,
      line: issue.line,
      type: issue.type,
      severity: issue.severity,
      analyzer: issue.analyzer,
      debtScore,
      baseDebt,
      complexityMultiplier,
      maintainabilityCost,
      timeMultiplier,
      estimatedHours: this.estimateFixTime(debtScore),
      priority: this.calculateDebtPriority(debtScore, issue.severity),
      tags: this.generateDebtTags(issue),
      description: this.generateDebtDescription(issue),
      recommendation: this.generateDebtRecommendation(issue, debtScore),
    };
  }

  /**
   * Get base debt score by severity
   */
  getBaseDebtBySeverity(severity) {
    const baseScores = {
      critical: 10,
      high: 5,
      medium: 2,
      low: 1,
      info: 0.5,
    };
    
    return baseScores[severity] || 1;
  }

  /**
   * Get complexity multiplier based on issue characteristics
   */
  getComplexityMultiplier(issue) {
    let multiplier = 1;
    
    // Increase multiplier for certain issue types
    const highComplexityTypes = [
      'security',
      'performance',
      'architecture',
      'concurrency',
    ];
    
    if (highComplexityTypes.includes(issue.type)) {
      multiplier *= 2;
    }
    
    // Consider analyzer complexity
    const complexAnalyzers = ['quality', 'performance', 'security'];
    if (complexAnalyzers.includes(issue.analyzer)) {
      multiplier *= 1.5;
    }
    
    return multiplier;
  }

  /**
   * Calculate maintainability cost
   */
  getMaintainabilityCost(issue) {
    let cost = 1;
    
    // Increase cost for code quality issues
    const maintainabilityIssues = [
      'complexity',
      'duplication',
      'naming',
      'formatting',
    ];
    
    if (maintainabilityIssues.includes(issue.type)) {
      cost *= 1.8;
    }
    
    // Consider file path complexity
    const filePath = issue.file;
    const pathSegments = filePath.split('/').length;
    if (pathSegments > 5) {
      cost *= 1.2; // Deep directory structure
    }
    
    return cost;
  }

  /**
   * Estimate fix time in hours
   */
  estimateFixTime(debtScore) {
    // Simple linear estimation: 1 hour per 5 debt points
    return Math.max(0.5, debtScore / 5);
  }

  /**
   * Calculate debt priority
   */
  calculateDebtPriority(debtScore, severity) {
    const severityWeight = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
      info: 0.5,
    };
    
    const weightedScore = debtScore * (severityWeight[severity] || 1);
    
    if (weightedScore >= 20) return 'critical';
    if (weightedScore >= 10) return 'high';
    if (weightedScore >= 5) return 'medium';
    if (weightedScore >= 2) return 'low';
    return 'info';
  }

  /**
   * Generate debt tags
   */
  generateDebtTags(issue) {
    const tags = [];
    
    // Add severity tag
    tags.push(issue.severity);
    
    // Add type-specific tags
    if (issue.analyzer === 'security') {
      tags.push('security');
    }
    if (issue.analyzer === 'performance') {
      tags.push('performance');
    }
    if (issue.analyzer === 'quality') {
      tags.push('maintainability');
    }
    
    // Add location-based tags
    if (issue.file.includes('test')) {
      tags.push('test');
    }
    if (issue.file.includes('config')) {
      tags.push('configuration');
    }
    
    return [...new Set(tags)];
  }

  /**
   * Generate debt description
   */
  generateDebtDescription(issue) {
    return `${issue.severity.toUpperCase()} ${issue.type} issue in ${issue.file}: ${issue.message}`;
  }

  /**
   * Generate debt recommendation
   */
  generateDebtRecommendation(issue, debtScore) {
    const recommendations = {
      critical: 'Address immediately - blocks releases or poses security risk',
      high: 'Address within 1-2 sprints - impacts team velocity',
      medium: 'Address within current quarter - affects maintainability',
      low: 'Address when convenient - code quality improvement',
      info: 'Consider during next refactor - minor improvement',
    };
    
    const priority = this.calculateDebtPriority(debtScore, issue.severity);
    return recommendations[priority] || recommendations.medium;
  }

  /**
   * Calculate overall debt summary
   */
  calculateDebtSummary(debtItems, fileMetrics) {
    const totalDebt = debtItems.reduce((sum, item) => sum + item.debtScore, 0);
    const totalIssues = debtItems.length;
    
    // Categorize by severity
    const bySeverity = debtItems.reduce((acc, item) => {
      acc[item.severity] = (acc[item.severity] || 0) + 1;
      return acc;
    }, {});
    
    // Categorize by priority
    const byPriority = debtItems.reduce((acc, item) => {
      acc[item.priority] = (acc[item.priority] || 0) + 1;
      return acc;
    }, {});
    
    // Calculate debt ratios
    const avgDebtPerFile = fileMetrics.size > 0 ? totalDebt / fileMetrics.size : 0;
    const highInterestDebt = debtItems
      .filter(item => item.priority === 'critical' || item.priority === 'high')
      .reduce((sum, item) => sum + item.debtScore, 0);
    
    return {
      totalDebt,
      totalIssues,
      avgDebtPerFile: Math.round(avgDebtPerFile),
      highInterestDebt,
      mediumInterestDebt: totalDebt - highInterestDebt,
      lowInterestDebt: 0, // Could be calculated based on file age
      debtRatio: fileMetrics.size > 0 ? totalDebt / (fileMetrics.size * 10) : 0,
      bySeverity,
      byPriority,
      estimatedHours: Math.round(totalDebt / 5),
      debtCeiling: 100, // Configurable threshold
      debtCeilingBreached: totalDebt > 100,
    };
  }

  /**
   * Generate unique debt ID
   */
  generateDebtId() {
    return `debt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Save current debt snapshot
   */
  async saveSnapshot() {
    if (!this.debtData) {
      throw new Error('No debt data to save');
    }
    
    try {
      // Add to history
      const snapshot = {
        timestamp: this.debtData.lastUpdated,
        summary: { ...this.debtData.summary },
      };
      
      this.history.push(snapshot);
      
      // Keep only last 90 days of history
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);
      
      this.history = this.history.filter(
        entry => new Date(entry.timestamp) > cutoffDate
      );
      
      // Save both files
      await Promise.all([
        fs.writeFile(
          this.debtFile,
          JSON.stringify(this.debtData, null, 2),
          'utf8'
        ),
        fs.writeFile(
          this.historyFile,
          JSON.stringify(this.history, null, 2),
          'utf8'
        ),
      ]);
      
      return {
        success: true,
        snapshotCount: this.history.length,
        lastUpdated: this.debtData.lastUpdated,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get debt trends
   */
  getDebtTrends() {
    if (this.history.length < 2) {
      return {
        trend: 'insufficient_data',
        change: 0,
        changePercent: 0,
      };
    }
    
    const recent = this.history.slice(-5); // Last 5 snapshots
    const older = this.history.slice(-10, -5); // Previous 5 snapshots
    
    if (older.length === 0) {
      return {
        trend: 'insufficient_data',
        change: 0,
        changePercent: 0,
      };
    }
    
    const recentAvg = recent.reduce((sum, s) => sum + s.summary.totalDebt, 0) / recent.length;
    const olderAvg = older.reduce((sum, s) => sum + s.summary.totalDebt, 0) / older.length;
    
    const change = recentAvg - olderAvg;
    const changePercent = olderAvg !== 0 ? (change / olderAvg) * 100 : 0;
    
    let trend;
    if (Math.abs(changePercent) < 5) {
      trend = 'stable';
    } else if (changePercent > 0) {
      trend = 'increasing';
    } else {
      trend = 'decreasing';
    }
    
    return {
      trend,
      change: Math.round(change),
      changePercent: Math.round(changePercent * 10) / 10,
      recentAverage: Math.round(recentAvg),
      olderAverage: Math.round(olderAvg),
    };
  }

  /**
   * Get debt payoff recommendations
   */
  getPayoffRecommendations() {
    if (!this.debtData || !this.debtData.files) {
      return [];
    }
    
    const recommendations = [];
    
    // Sort files by debt ratio
    const sortedFiles = Object.entries(this.debtData.files)
      .sort(([, a], [, b]) => b.debtRatio - a.debtRatio);
    
    // Recommend top 5 files to address
    for (const [file, metrics] of sortedFiles.slice(0, 5)) {
      const issues = metrics.issues
        .sort((a, b) => {
          const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
          return severityOrder[a.severity] - severityOrder[b.severity];
        });
      
      recommendations.push({
        file,
        priority: metrics.debtRatio > 5 ? 'high' : 'medium',
        totalDebt: metrics.debt,
        issueCount: issues.length,
        topIssues: issues.slice(0, 3),
        estimatedHours: Math.round(metrics.debt / 5),
        suggestion: this.generateFileRecommendation(file, metrics),
      });
    }
    
    return recommendations;
  }

  /**
   * Generate file-specific recommendation
   */
  generateFileRecommendation(file, metrics) {
    if (metrics.maintainabilityScore < 50) {
      return `Refactor ${file} - low maintainability score (${metrics.maintainabilityScore})`;
    }
    
    if (metrics.debt > 50) {
      return `Address high debt in ${file} - ${metrics.debt} debt points`;
    }
    
    if (metrics.issueCount > 10) {
      return `Focus on ${file} - ${metrics.issueCount} issues detected`;
    }
    
    return `Review ${file} for potential improvements`;
  }

  /**
   * Generate debt report
   */
  async generateDebtReport(format = 'markdown') {
    if (!this.debtData) {
      throw new Error('No debt data available');
    }
    
    const trends = this.getDebtTrends();
    const recommendations = this.getPayoffRecommendations();
    
    const report = {
      summary: this.debtData.summary,
      trends,
      recommendations,
      files: this.debtData.files,
      lastUpdated: this.debtData.lastUpdated,
      generatedAt: new Date().toISOString(),
    };
    
    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify(report, null, 2);
      
      case 'markdown':
        return this.generateMarkdownReport(report);
      
      case 'html':
        return this.generateHtmlReport(report);
      
      default:
        return JSON.stringify(report, null, 2);
    }
  }

  /**
   * Generate markdown report
   */
  generateMarkdownReport(report) {
    let markdown = `# Technical Debt Report\n\n`;
    markdown += `**Generated:** ${new Date(report.generatedAt).toLocaleString()}\n`;
    markdown += `**Last Updated:** ${new Date(report.lastUpdated).toLocaleString()}\n\n`;
    
    // Summary
    markdown += `## 📊 Summary\n\n`;
    markdown += `- **Total Debt:** ${report.summary.totalDebt} points\n`;
    markdown += `- **Total Issues:** ${report.summary.totalIssues}\n`;
    markdown += `- **Average Debt/File:** ${report.summary.avgDebtPerFile}\n`;
    markdown += `- **Estimated Hours:** ${report.summary.estimatedHours}\n`;
    markdown += `- **Trend:** ${report.trends.trend} (${report.trends.changePercent}%)\n\n`;
    
    // Severity breakdown
    markdown += `## 🚨 Severity Breakdown\n\n`;
    for (const [severity, count] of Object.entries(report.summary.bySeverity)) {
      markdown += `- **${severity.toUpperCase()}:** ${count}\n`;
    }
    markdown += `\n`;
    
    // Recommendations
    markdown += `## 💡 Recommendations\n\n`;
    for (const rec of report.recommendations.slice(0, 3)) {
      markdown += `### ${rec.file}\n`;
      markdown += `- **Priority:** ${rec.priority}\n`;
      markdown += `- **Debt:** ${rec.totalDebt} points\n`;
      markdown += `- **Issues:** ${rec.issueCount}\n`;
      markdown += `- **Suggestion:** ${rec.suggestion}\n\n`;
    }
    
    return markdown;
  }

  /**
   * Generate HTML report
   */
  generateHtmlReport(report) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Technical Debt Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .summary { background: #f5f5f5; padding: 20px; border-radius: 8px; }
        .metric { display: inline-block; margin: 10px; padding: 10px; background: #e3f2fd; border-radius: 4px; }
        .high-priority { background: #ffebee; }
        .medium-priority { background: #fff3e0; }
        .low-priority { background: #e8f5e8; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f2f2f2; }
    </style>
</head>
<body>
    <h1>🔍 Technical Debt Report</h1>
    <p><strong>Generated:</strong> ${new Date(report.generatedAt).toLocaleString()}</p>
    
    <div class="summary">
        <h2>📊 Summary</h2>
        <div class="metric"><strong>Total Debt:</strong> ${report.summary.totalDebt} points</div>
        <div class="metric"><strong>Total Issues:</strong> ${report.summary.totalIssues}</div>
        <div class="metric"><strong>Average Debt/File:</strong> ${report.summary.avgDebtPerFile}</div>
        <div class="metric"><strong>Trend:</strong> ${report.trends.trend} (${report.trends.changePercent}%)</div>
    </div>
    
    <h2>💡 Top Recommendations</h2>
    <table>
        <tr><th>File</th><th>Priority</th><th>Debt</th><th>Issues</th><th>Suggestion</th></tr>
        ${report.recommendations.slice(0, 5).map(rec => `
            <tr>
                <td>${rec.file}</td>
                <td><span class="${rec.priority}-priority">${rec.priority}</span></td>
                <td>${rec.totalDebt}</td>
                <td>${rec.issueCount}</td>
                <td>${rec.suggestion}</td>
            </tr>
        `).join('')}
    </table>
</body>
</html>
    `.trim();
  }

  /**
   * Export debt data
   */
  async exportDebtData(format = 'json', outputPath) {
    const report = await this.generateDebtReport(format);
    
    const defaultPath = path.join(
      this.debtDir,
      `technical-debt-export.${format}`
    );
    const finalPath = outputPath || defaultPath;
    
    await fs.writeFile(finalPath, report, 'utf8');
    
    return {
      success: true,
      outputPath: finalPath,
      format,
    };
  }

  /**
   * Clear all debt data
   */
  async clearDebtData() {
    this.debtData = {
      version: '1.0.0',
      lastUpdated: null,
      summary: {
        totalDebt: 0,
        highInterestDebt: 0,
        mediumInterestDebt: 0,
        lowInterestDebt: 0,
        debtRatio: 0,
      },
      files: {},
      trends: [],
    };
    
    this.history = [];
    
    try {
      await Promise.all([
        fs.unlink(this.debtFile).catch(() => {}),
        fs.unlink(this.historyFile).catch(() => {}),
      ]);
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

export default TechnicalDebtTracker;

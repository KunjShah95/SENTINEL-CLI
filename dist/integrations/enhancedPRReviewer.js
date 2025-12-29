import { promises as fs } from 'fs';
import path from 'path';
import { GitHubIntegration } from './github.js';
import { GitUtils } from '../git/gitUtils.js';

/**
 * Enhanced PR Review System for Sentinel
 * Provides line-by-line comments, suggestions, and automated approvals
 */
export class EnhancedPRReviewer {
  constructor(config) {
    this.config = config;
    this.github = new GitHubIntegration();
    this.git = new GitUtils();
    this.reviewTemplates = new Map();
    this.reviewHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * Initialize the PR reviewer
   */
  async initialize() {
    try {
      await this.loadReviewTemplates();
      await this.loadReviewHistory();
      console.log('✅ Enhanced PR Reviewer initialized');
    } catch (error) {
      console.warn('⚠️ PR Reviewer initialization failed:', error.message);
    }
  }

  /**
   * Load review templates
   */
  async loadReviewTemplates() {
    const templates = {
      security: {
        title: '🔒 Security Issues Found',
        body: 'Security vulnerabilities were detected that should be addressed before merging.',
        severity: 'high',
      },
      performance: {
        title: '⚡ Performance Concerns',
        body: 'Performance issues were identified that may impact user experience.',
        severity: 'medium',
      },
      quality: {
        title: '🔧 Code Quality Improvements',
        body: 'Code quality issues were found that could improve maintainability.',
        severity: 'medium',
      },
      bugs: {
        title: '🐛 Potential Bugs',
        body: 'Potential bugs were identified that should be investigated.',
        severity: 'high',
      },
      critical: {
        title: '🚨 Critical Issues',
        body: 'Critical issues were found that must be addressed immediately.',
        severity: 'critical',
      },
    };

    this.reviewTemplates = new Map(Object.entries(templates));
  }

  /**
   * Load review history
   */
  async loadReviewHistory() {
    try {
      const historyPath = path.join('.sentinel', 'review-history.json');
      const content = await fs.readFile(historyPath, 'utf8');
      this.reviewHistory = JSON.parse(content);

      // Keep only recent history
      if (this.reviewHistory.length > this.maxHistorySize) {
        this.reviewHistory = this.reviewHistory.slice(-this.maxHistorySize);
      }
    } catch (error) {
      this.reviewHistory = [];
    }
  }

  /**
   * Review a pull request
   */
  async reviewPullRequest(prUrl, options = {}) {
    try {
      console.log(`🔍 Analyzing PR: ${prUrl}`);

      // Extract PR information
      const prInfo = await this.extractPRInfo(prUrl);
      if (!prInfo) {
        throw new Error('Could not extract PR information');
      }

      // Analyze changes
      const analysis = await this.analyzePRChanges(prInfo, options);

      // Generate review comments
      const reviewComments = await this.generateReviewComments(analysis, prInfo);

      // Create comprehensive review
      const review = await this.createReview(prInfo, reviewComments, analysis);

      // Post review if not dry run
      if (!options.dryRun) {
        const result = await this.postReview(prInfo, review);

        // Save to history
        await this.saveReviewToHistory({
          prUrl,
          prInfo,
          analysis,
          review,
          result,
          timestamp: new Date().toISOString(),
        });

        return result;
      } else {
        console.log('🔸 Dry run - not posting review');
        return {
          success: true,
          dryRun: true,
          review,
          analysis,
        };
      }
    } catch (error) {
      console.error('❌ PR review failed:', error.message);
      throw error;
    }
  }

  /**
   * Extract PR information from URL
   */
  async extractPRInfo(prUrl) {
    try {
      // Parse GitHub URL robustly
      let owner, repo, prNumber;
      try {
        const parsed = new URL(prUrl);
        const segments = parsed.pathname.split('/').filter(Boolean);
        if (parsed.hostname !== 'github.com' || segments.length < 4 || segments[2] !== 'pull') {
          throw new Error('Invalid GitHub PR URL format');
        }
        owner = segments[0];
        repo = segments[1];
        prNumber = segments[3];
      } catch (err) {
        throw new Error('Invalid GitHub PR URL format');
      }

      // Get PR details via GitHub API
      const prDetails = await this.github.getPRDetails(owner, repo, prNumber);
      const files = await this.github.getPRFiles(owner, repo, prNumber);

      return {
        owner,
        repo,
        prNumber,
        title: prDetails.title,
        description: prDetails.body,
        author: prDetails.user.login,
        baseBranch: prDetails.base.ref,
        headBranch: prDetails.head.ref,
        changedFiles: files,
        additions: prDetails.additions,
        deletions: prDetails.deletions,
        url: prUrl,
        api: {
          owner,
          repo,
          prNumber,
        },
      };
    } catch (error) {
      console.warn('Could not extract PR info:', error.message);
      return null;
    }
  }

  /**
   * Analyze PR changes
   */
  async analyzePRChanges(prInfo, options = {}) {
    const analysis = {
      files: [],
      summary: {
        totalFiles: prInfo.changedFiles.length,
        criticalIssues: 0,
        highIssues: 0,
        mediumIssues: 0,
        lowIssues: 0,
        totalIssues: 0,
        securityIssues: 0,
        performanceIssues: 0,
        qualityIssues: 0,
        bugIssues: 0,
      },
      trends: {},
    };

    // Analyze each changed file
    for (const file of prInfo.changedFiles) {
      const fileAnalysis = await this.analyzeFileChanges(file, prInfo, options);
      analysis.files.push(fileAnalysis);

      // Update summary
      const fileSummary = fileAnalysis.summary;
      analysis.summary.criticalIssues += fileSummary.criticalIssues;
      analysis.summary.highIssues += fileSummary.highIssues;
      analysis.summary.mediumIssues += fileSummary.mediumIssues;
      analysis.summary.lowIssues += fileSummary.lowIssues;
      analysis.summary.totalIssues += fileSummary.totalIssues;
      analysis.summary.securityIssues += fileSummary.securityIssues;
      analysis.summary.performanceIssues += fileSummary.performanceIssues;
      analysis.summary.qualityIssues += fileSummary.qualityIssues;
      analysis.summary.bugIssues += fileSummary.bugIssues;
    }

    // Calculate trends
    analysis.trends = this.calculateTrends(analysis.files);

    // Generate recommendations
    analysis.recommendations = this.generatePRRecommendations(analysis);

    return analysis;
  }

  /**
   * Analyze individual file changes
   */
  async analyzeFileChanges(file, prInfo, options = {}) {
    const fileAnalysis = {
      filename: file.filename,
      status: file.status, // added, removed, modified
      additions: file.additions || 0,
      deletions: file.deletions || 0,
      changes: file.changes || 0,
      patch: file.patch || '',
      issues: [],
      summary: {
        criticalIssues: 0,
        highIssues: 0,
        mediumIssues: 0,
        lowIssues: 0,
        totalIssues: 0,
        securityIssues: 0,
        performanceIssues: 0,
        qualityIssues: 0,
        bugIssues: 0,
      },
      complexity: {
        before: 0,
        after: 0,
        delta: 0,
      },
    };

    // Get file content for analysis
    const content = await this.getFileContentForPR(file, prInfo);
    if (!content) {
      return fileAnalysis; // Skip if content unavailable
    }

    // Run Sentinel analysis on the file
    const sentinelAnalysis = await this.runSentinelAnalysis(file.filename, content, options);

    if (sentinelAnalysis && sentinelAnalysis.issues) {
      fileAnalysis.issues = sentinelAnalysis.issues;

      // Update summary
      for (const issue of sentinelAnalysis.issues) {
        const severity = issue.severity || 'info';
        fileAnalysis.summary[`${severity}Issues`] =
          (fileAnalysis.summary[`${severity}Issues`] || 0) + 1;
        fileAnalysis.summary.totalIssues++;

        // Categorize by analyzer
        if (issue.analyzer === 'security') fileAnalysis.summary.securityIssues++;
        if (issue.analyzer === 'performance') fileAnalysis.summary.performanceIssues++;
        if (issue.analyzer === 'quality') fileAnalysis.summary.qualityIssues++;
        if (issue.analyzer === 'bugs') fileAnalysis.summary.bugIssues++;
      }
    }

    // Calculate complexity metrics
    fileAnalysis.complexity = this.calculateComplexityMetrics(content, file.patch);

    return fileAnalysis;
  }

  /**
   * Get file content for PR analysis
   */
  async getFileContentForPR(file, prInfo) {
    try {
      // Try to get content from GitHub API
      const content = await this.github.getFileContent(
        prInfo.api.owner,
        prInfo.api.repo,
        file.filename,
        prInfo.api.prNumber
      );
      return content;
    } catch (error) {
      console.warn(`Could not get content for ${file.filename}:`, error.message);
      return null;
    }
  }

  /**
   * Run Sentinel analysis on file
   */
  async runSentinelAnalysis(filename, content, options = {}) {
    try {
      // Import and run Sentinel analyzers
      const { CodeReviewBot } = await import('../bot.js');

      const bot = new CodeReviewBot();
      await bot.initialize();

      // Analyze the file
      const files = [{
        path: filename,
        content,
        type: 'file',
      }];

      const result = await bot.runAnalysis({
        files,
        format: 'json',
        silent: true,
        ...options,
      });

      return result;
    } catch (error) {
      console.warn(`Sentinel analysis failed for ${filename}:`, error.message);
      return { issues: [] };
    }
  }

  /**
   * Calculate complexity metrics
   */
  calculateComplexityMetrics(content, patch = '') {
    const lines = content.split('\n');
    const beforePatchLines = this.extractContentBeforePatch(patch);

    return {
      before: this.calculateComplexity(beforePatchLines),
      after: this.calculateComplexity(lines),
      delta: this.calculateComplexity(lines) - this.calculateComplexity(beforePatchLines),
    };
  }

  /**
   * Calculate cyclomatic complexity
   */
  calculateComplexity(lines) {
    let complexity = 1; // Base complexity

    const complexityKeywords = [
      'if', 'else', 'elseif', 'for', 'while', 'do', 'switch',
      'case', 'catch', 'try', 'finally', '&&', '||', '?', ':',
    ];

    for (const line of lines) {
      const trimmedLine = line.trim();
      const lineLower = trimmedLine.toLowerCase();

      for (const keyword of complexityKeywords) {
        if (lineLower.includes(keyword)) {
          complexity++;
        }
      }
    }

    return complexity;
  }

  /**
   * Extract content before patch
   */
  extractContentBeforePatch(patch) {
    if (!patch) return '';

    // Simple extraction - get content before @@ lines
    const lines = patch.split('\n');
    const beforeLines = [];

    for (const line of lines) {
      if (line.startsWith('@@')) {
        break; // Stop at first hunk
      }
      if (line.startsWith('-') && !line.startsWith('--')) {
        beforeLines.push(line.substring(1));
      }
    }

    return beforeLines.join('\n');
  }

  /**
   * Calculate trends from file analysis
   */
  calculateTrends(fileAnalyses) {
    const trends = {
      mostProblematicFiles: [],
      commonIssueTypes: {},
      severityDistribution: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
      complexityImpact: {
        increased: 0,
        decreased: 0,
        unchanged: 0,
      },
    };

    // Most problematic files
    const filesByIssues = fileAnalyses
      .filter(fa => fa.summary.totalIssues > 0)
      .sort((a, b) => b.summary.totalIssues - a.summary.totalIssues);

    trends.mostProblematicFiles = filesByIssues.slice(0, 5);

    // Common issue types
    for (const fa of fileAnalyses) {
      for (const issue of fa.issues) {
        trends.commonIssueTypes[issue.type] =
          (trends.commonIssueTypes[issue.type] || 0) + 1;
      }
    }

    // Severity distribution
    for (const fa of fileAnalyses) {
      const summary = fa.summary;
      trends.severityDistribution.critical += summary.criticalIssues;
      trends.severityDistribution.high += summary.highIssues;
      trends.severityDistribution.medium += summary.mediumIssues;
      trends.severityDistribution.low += summary.lowIssues;
    }

    // Complexity impact
    for (const fa of fileAnalyses) {
      const complexity = fa.complexity;
      if (complexity.delta > 10) trends.complexityImpact.increased++;
      else if (complexity.delta < -10) trends.complexityImpact.decreased++;
      else trends.complexityImpact.unchanged++;
    }

    return trends;
  }

  /**
   * Generate PR recommendations
   */
  generatePRRecommendations(analysis) {
    const recommendations = [];

    // High-priority recommendations
    if (analysis.summary.criticalIssues > 0) {
      recommendations.push({
        priority: 'critical',
        title: 'Address Critical Security Issues',
        description: `${analysis.summary.criticalIssues} critical security issues found that must be fixed before merge.`,
        action: 'Fix immediately and re-run analysis',
      });
    }

    if (analysis.summary.highIssues > 5) {
      recommendations.push({
        priority: 'high',
        title: 'Reduce Issue Count',
        description: `High number of issues (${analysis.summary.highIssues}) detected. Consider breaking down changes.`,
        action: 'Split PR into smaller, focused changes',
      });
    }

    // Complexity recommendations
    const increasedComplexityFiles = analysis.files.filter(
      f => f.complexity.delta > 20
    );

    if (increasedComplexityFiles.length > 0) {
      recommendations.push({
        priority: 'medium',
        title: 'Review Complexity Changes',
        description: `${increasedComplexityFiles.length} files show significant complexity increase.`,
        action: 'Review and simplify complex changes',
        files: increasedComplexityFiles.map(f => f.filename),
      });
    }

    // Quality recommendations
    if (analysis.summary.qualityIssues > analysis.summary.bugIssues) {
      recommendations.push({
        priority: 'medium',
        title: 'Focus on Code Quality',
        description: 'More code quality issues than bugs detected.',
        action: 'Add unit tests and improve code structure',
      });
    }

    return recommendations;
  }

  /**
   * Generate review comments
   */
  async generateReviewComments(analysis, prInfo) {
    const comments = [];

    // Group issues by file and line
    const issuesByLocation = new Map();

    for (const fileAnalysis of analysis.files) {
      for (const issue of fileAnalysis.issues) {
        const location = `${fileAnalysis.filename}:${issue.line}`;
        if (!issuesByLocation.has(location)) {
          issuesByLocation.set(location, []);
        }
        issuesByLocation.get(location).push(issue);
      }
    }

    // Generate comments for each location
    for (const [location, issues] of issuesByLocation) {
      const comment = await this.createLocationComment(location, issues, prInfo);
      if (comment) {
        comments.push(comment);
      }
    }

    return comments;
  }

  /**
   * Create comment for specific location
   */
  async createLocationComment(location, issues, _prInfo) {
    if (issues.length === 0) return null;

    const [filename, lineStr] = location.split(':');
    const line = parseInt(lineStr, 10);

    // Group issues by severity
    const criticalIssues = issues.filter(i => i.severity === 'critical');
    const highIssues = issues.filter(i => i.severity === 'high');

    // Determine comment type and template
    let template, type;
    if (criticalIssues.length > 0) {
      template = this.reviewTemplates.get('critical');
      type = 'critical';
    } else if (highIssues.length > 0) {
      template = this.reviewTemplates.get('bugs');
      type = 'bugs';
    } else {
      template = this.reviewTemplates.get('quality');
      type = 'quality';
    }

    // Generate suggestions for critical/high issues
    const suggestions = [];
    for (const issue of [...criticalIssues, ...highIssues]) {
      if (issue.suggestion) {
        suggestions.push({
          filename,
          line,
          original: issue.snippet || '',
          suggestion: issue.suggestion,
          type: 'fix',
        });
      }
    }

    return {
      path: filename,
      line,
      side: 'RIGHT',
      body: this.generateCommentBody(issues, template, suggestions, type),
      type,
      severity: template ? template.severity : 'medium',
      issueCount: issues.length,
      suggestions,
    };
  }

  /**
   * Generate comment body
   */
  generateCommentBody(issues, template, suggestions, _type) {
    let body = template ? `${template.title}\n\n${template.body}\n\n` : '';

    // List issues
    body += '### Issues Found:\n\n';
    for (const issue of issues) {
      const emoji = this.getSeverityEmoji(issue.severity);
      body += `${emoji} **${issue.type}** - ${issue.message}\n`;

      if (issue.suggestion && !suggestions.find(s => s.suggestion === issue.suggestion)) {
        body += `💡 **Suggestion:** ${issue.suggestion}\n`;
      }
      body += '\n';
    }

    // Add suggestions if available
    if (suggestions.length > 0) {
      body += '\n### 🛠️ Suggested Fixes:\n\n';
      for (const suggestion of suggestions) {
        body += `<details>\n<summary>Click to view suggested fix</summary>\n\n`;

        if (suggestion.type === 'fix') {
          body += '```suggestion\n';
          body += suggestion.suggestion;
          body += '\n```\n\n';
        }

        body += `**File:** \`${suggestion.filename}:${suggestion.line}\`\n\n`;
        body += '</details>\n\n';
      }
    }

    // Add footer
    body += '\n---\n';
    body += `*Analyzed by Sentinel v1.5.0* | `;

    return body;
  }

  /**
   * Get severity emoji
   */
  getSeverityEmoji(severity) {
    const emojis = {
      critical: '🚨',
      high: '🔴',
      medium: '🟡',
      low: '🟡',
      info: 'ℹ️',
    };
    return emojis[severity] || 'ℹ️';
  }

  /**
   * Create comprehensive review
   */
  async createReview(prInfo, comments, analysis) {
    const review = {
      title: this.generateReviewTitle(analysis),
      body: this.generateReviewBody(analysis, comments),
      event: this.determineReviewEvent(analysis),
      comments,
      analysis,
      metadata: {
        reviewer: 'sentinel-bot',
        version: '1.4.1',
        timestamp: new Date().toISOString(),
        issueCount: comments.reduce((sum, c) => sum + c.issueCount, 0),
      },
    };

    return review;
  }

  /**
   * Generate review title
   */
  generateReviewTitle(analysis) {
    const { summary } = analysis;

    if (summary.criticalIssues > 0) {
      return '🚨 Critical Issues Found - Review Required';
    }

    if (summary.highIssues > 10) {
      return '🔴 Many Issues Found - Consider Refactoring';
    }

    if (summary.securityIssues > 0) {
      return '🔒 Security Issues Detected';
    }

    if (summary.performanceIssues > 0) {
      return '⚡ Performance Concerns Identified';
    }

    const totalIssues = summary.criticalIssues + summary.highIssues + summary.mediumIssues + summary.lowIssues;

    if (totalIssues > 0) {
      return `🔍 ${totalIssues} Issues Found`;
    }

    return '✅ No Issues Found';
  }

  /**
   * Generate review body
   */
  generateReviewBody(analysis, comments) {
    let body = '## 📊 Analysis Summary\n\n';

    const { summary } = analysis;

    // Summary statistics
    body += `| Metric | Count |\n`;
    body += '|--------|-------|\n';
    body += `| 🚨 Critical | ${summary.criticalIssues} |\n`;
    body += `| 🔴 High | ${summary.highIssues} |\n`;
    body += `| 🟡 Medium | ${summary.mediumIssues} |\n`;
    body += `| 🟢 Low | ${summary.lowIssues} |\n`;
    body += `| 📈 Total | ${summary.totalIssues} |\n\n`;

    // File breakdown
    if (analysis.files.length > 0) {
      body += '## 📁 Files Affected\n\n';
      body += '| File | Issues | Complexity Δ |\n';
      body += '|------|--------|--------------|\n';

      for (const file of analysis.files.slice(0, 10)) {
        body += `| ${file.filename} | ${file.summary.totalIssues} | ${file.complexity.delta > 0 ? '+' : ''}${file.complexity.delta} |\n`;
      }

      if (analysis.files.length > 10) {
        body += `| ... ${analysis.files.length - 10} more files | | |\n`;
      }
      body += '\n';
    }

    // Recommendations
    if (analysis.recommendations && analysis.recommendations.length > 0) {
      body += '## 💡 Recommendations\n\n';
      for (const rec of analysis.recommendations.slice(0, 5)) {
        body += `### ${rec.priority.toUpperCase()}: ${rec.title}\n\n`;
        body += `${rec.description}\n\n`;
        body += `**Action:** ${rec.action}\n\n`;

        if (rec.files) {
          body += `**Files:** ${rec.files.join(', ')}\n\n`;
        }
      }
      body += '\n';
    }

    // Comments section
    if (comments.length > 0) {
      body += '## 🔍 Detailed Issues\n\n';
      body += `${comments.length} line-by-line comments posted below.\n\n`;
    }

    return body;
  }

  /**
   * Determine review event (REQUEST_CHANGES, APPROVE, etc.)
   */
  determineReviewEvent(analysis) {
    const { summary } = analysis;

    if (summary.criticalIssues > 0) {
      return 'REQUEST_CHANGES';
    }

    if (summary.totalIssues > 20) {
      return 'REQUEST_CHANGES';
    }

    if (summary.securityIssues > 5) {
      return 'REQUEST_CHANGES';
    }

    return 'APPROVE';
  }

  /**
   * Post review to GitHub
   */
  async postReview(prInfo, review) {
    try {
      const result = await this.github.createPRReview(
        prInfo.api.owner,
        prInfo.api.repo,
        prInfo.api.prNumber,
        review
      );

      return {
        success: true,
        reviewId: result.id,
        url: `${prInfo.url}#pullrequestreview-${result.id}`,
        commentsPosted: review.comments.length,
        event: review.event,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Save review to history
   */
  async saveReviewToHistory(reviewData) {
    this.reviewHistory.push(reviewData);

    // Keep only recent history
    if (this.reviewHistory.length > this.maxHistorySize) {
      this.reviewHistory = this.reviewHistory.slice(-this.maxHistorySize);
    }

    try {
      const historyPath = path.join('.sentinel', 'review-history.json');
      await fs.mkdir('.sentinel', { recursive: true });
      await fs.writeFile(historyPath, JSON.stringify(this.reviewHistory, null, 2), 'utf8');
    } catch (error) {
      console.warn('Could not save review history:', error.message);
    }
  }

  /**
   * Get review statistics
   */
  getReviewStats() {
    if (this.reviewHistory.length === 0) {
      return {
        totalReviews: 0,
        averageIssuesPerPR: 0,
        mostActiveDay: null,
        issueDistribution: {},
      };
    }

    const stats = {
      totalReviews: this.reviewHistory.length,
      averageIssuesPerPR: 0,
      mostActiveDay: null,
      issueDistribution: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    };

    let totalIssues = 0;
    const dayCounts = {};

    for (const review of this.reviewHistory) {
      const issues = review.analysis?.summary?.totalIssues || 0;
      totalIssues += issues;

      // Count by day of week
      const date = new Date(review.timestamp);
      const day = date.toLocaleDateString('en-US', { weekday: 'long' });
      dayCounts[day] = (dayCounts[day] || 0) + 1;

      // Count by severity
      if (review.analysis?.summary) {
        const summary = review.analysis.summary;
        stats.issueDistribution.critical += summary.criticalIssues;
        stats.issueDistribution.high += summary.highIssues;
        stats.issueDistribution.medium += summary.mediumIssues;
        stats.issueDistribution.low += summary.lowIssues;
      }
    }

    stats.averageIssuesPerPR = Math.round(totalIssues / this.reviewHistory.length);

    // Find most active day
    if (Object.keys(dayCounts).length > 0) {
      const mostActiveDay = Object.entries(dayCounts)
        .sort(([, a], [, b]) => b - a)[0];
      stats.mostActiveDay = mostActiveDay[0];
    }

    return stats;
  }
}

export default EnhancedPRReviewer;

/**
 * GitLab Review Integration
 *
 * Posts inline MR discussion threads, approval/request changes,
 * and summary comments. Mirrors the GitHub integration's functionality
 * but uses GitLab's discussion thread API.
 */

import { GitLabConnector } from '../connectors/GitLabConnector.js';

export class GitLabReviewIntegration {
  constructor(options = {}) {
    this.connector = options.connector || null;
    this.token = options.token || process.env.GITLAB_TOKEN;
    this.baseUrl = options.baseUrl || 'https://gitlab.com';
  }

  /**
   * Get or create the GitLab connector.
   */
  getConnector() {
    if (!this.connector) {
      this.connector = new GitLabConnector({
        config: { token: this.token, baseUrl: this.baseUrl },
      });
    }
    return this.connector;
  }

  async ensureConnected() {
    const gl = this.getConnector();
    if (!gl.connected) {
      await gl.connect();
    }
    return gl;
  }

  /**
   * Post inline discussion threads for issues with file+line info.
   */
  async postInlineDiscussions(mrUrl, issues, headSha) {
    const gl = await this.ensureConnected();
    const inlineIssues = issues.filter(i => i.file && i.line);
    const posted = [];

    for (const issue of inlineIssues) {
      try {
        const severityEmoji = {
          critical: '🛑', high: '🔶', medium: '🔷', low: '🟢', info: 'ℹ️',
        };

        const body = `${severityEmoji[issue.severity] || '⚠️'} **${issue.severity?.toUpperCase()}**: ${issue.title}\n\n${issue.message}${issue.suggestion ? `\n\n💡 **Suggestion:** ${issue.suggestion}` : ''}`;

        const position = {
          position_type: 'text',
          new_path: issue.file.replace(/\\/g, '/'),
          new_line: issue.line || 1,
          head_sha: headSha,
        };

        const discussion = await gl.postDiscussion(mrUrl, body, position);
        posted.push({ issue: issue.title, discussionId: discussion.id });
      } catch (error) {
        console.warn(`[gitlab-review] Failed to post discussion for ${issue.file}:${issue.line}: ${error.message}`);
      }
    }

    return posted;
  }

  /**
   * Post a summary comment on the MR.
   */
  async postSummaryComment(mrUrl, issues, metrics = {}) {
    const gl = await this.ensureConnected();

    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const issue of issues) {
      counts[issue.severity || 'info'] = (counts[issue.severity || 'info'] || 0) + 1;
    }

    let body = '## 🛡️ Sentinel Code Review Summary\n\n';
    body += `**Total Issues Found:** ${issues.length}\n\n`;
    body += '| Severity | Count |\n|----------|-------|\n';
    if (counts.critical > 0) body += `| 🛑 Critical | ${counts.critical} |\n`;
    if (counts.high > 0) body += `| 🔶 High | ${counts.high} |\n`;
    if (counts.medium > 0) body += `| 🔷 Medium | ${counts.medium} |\n`;
    if (counts.low > 0) body += `| 🟢 Low | ${counts.low} |\n`;

    if (issues.length === 0) {
      body += '\n✨ **Great job!** No issues detected.\n';
    } else if (counts.critical > 0 || counts.high > 0) {
      body += '\n⚠️ **Action Required:** Critical or high severity issues detected.\n';
    } else {
      body += '\n✅ No critical issues. Review the suggestions above.\n';
    }

    if (metrics.mode) body += `\n**Review Mode:** ${metrics.mode}`;
    if (metrics.duration) body += `\n**Duration:** ${metrics.duration}ms`;

    body += '\n---\n_Powered by [Sentinel CLI](https://github.com/KunjShah95/SENTINEL-CLI)_';

    return gl.postComment(mrUrl, body);
  }

  /**
   * Approve or request changes on an MR.
   */
  async setApprovalStatus(mrUrl, status, message = '') {
    const gl = await this.ensureConnected();

    if (status === 'approve') {
      try {
        await gl.approveMR(mrUrl);
        return { approved: true };
      } catch (error) {
        // Approval might require premium
        if (message) {
          await gl.postComment(mrUrl, `✅ **Sentinel approves this MR.**\n\n${message}`);
        }
        return { approved: false, reason: error.message };
      }
    }

    if (status === 'request_changes') {
      await gl.postComment(mrUrl, `🔄 **Sentinel requests changes.**\n\n${message}`);
      return { changesRequested: true };
    }

    return { status: 'none' };
  }

  /**
   * Post a full review: inline discussions + summary + approval status.
   */
  async postFullReview(mrUrl, issues, options = {}) {
    const gl = await this.ensureConnected();
    const headSha = options.headSha || null;

    // Get MR info for head SHA if not provided
    let sha = headSha;
    if (!sha) {
      const mr = await gl.getMRInfo(mrUrl);
      sha = mr.sha;
    }

    // Post inline discussions
    const discussions = await this.postInlineDiscussions(mrUrl, issues, sha);

    // Post summary
    const summary = await this.postSummaryComment(mrUrl, issues, options.metrics);

    // Determine approval status
    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const highCount = issues.filter(i => i.severity === 'high').length;

    let approvalStatus;
    if (criticalCount === 0 && highCount === 0) {
      approvalStatus = await this.setApprovalStatus(mrUrl, 'approve', 'No critical or high issues found.');
    } else if (criticalCount > 0) {
      approvalStatus = await this.setApprovalStatus(mrUrl, 'request_changes', `${criticalCount} critical issue(s) found.`);
    }

    return {
      success: true,
      mrUrl,
      inlineDiscussions: discussions.length,
      summaryPosted: true,
      approvalStatus,
      issuesCount: issues.length,
    };
  }
}

export default GitLabReviewIntegration;

/**
 * GitHub App Webhook Handler
 * Handles GitHub App events and triggers Sentinel analysis
 */

import crypto from 'crypto';
import { CodeReviewBot } from '../bot.js';
import { errorHandler, SecurityError } from '../utils/errorHandler.js';
import Config from '../config/config.js';
import { AutoReviewEngine } from '../automation/autoReviewEngine.js';
import { ManualTriggerHandler } from '../automation/manualTriggerHandler.js';

export class GitHubAppWebhookHandler {
  constructor(options = {}) {
    this.webhookSecret = options.webhookSecret || process.env.GITHUB_WEBHOOK_SECRET;
    this.appId = options.appId || process.env.GITHUB_APP_ID;
    this.privateKey = options.privateKey || process.env.GITHUB_APP_PRIVATE_KEY;
    this.config = options.config || new Config();
    this.autoReviewEngine = options.autoReviewEngine || new AutoReviewEngine();
  }

  /**
     * Verify webhook signature
     */
  verifySignature(payload, signature) {
    if (!this.webhookSecret) {
      throw new SecurityError('Webhook secret not configured');
    }

    const hmac = crypto.createHmac('sha256', this.webhookSecret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');

    if (signature !== digest) {
      throw new SecurityError('Invalid webhook signature');
    }

    return true;
  }

  /**
     * Handle pull request events
     */
  async handlePullRequest(event) {
    const { action, pull_request, repository, installation } = event;

    // Use AutoReviewEngine to evaluate if we should review this PR
    const evaluation = await this.autoReviewEngine.evaluatePREvent({
      action,
      pr: pull_request,
      repository,
      sender: event.sender,
    });

    if (!evaluation.shouldReview) {
      return { message: evaluation.reason, reviewed: false };
    }

    // Only process opened, synchronize (new commits), or reopened PRs
    const validActions = ['opened', 'synchronize', 'reopened'];
    if (!validActions.includes(action)) {
      return { message: `Ignoring PR action: ${action}` };
    }

    try {
      // Get installation access token
      const token = await this.getInstallationToken(installation.id);

      // Initialize bot with installation token
      const bot = new CodeReviewBot({
        ...this.config,
        github: {
          token: token,
          owner: repository.owner.login,
          repo: repository.name,
          prNumber: pull_request.number
        }
      });

      // Get changed files from PR
      const files = await this.getChangedFiles(
        repository.owner.login,
        repository.name,
        pull_request.number,
        token
      );

      // Run analysis
      const results = await bot.analyze(files);

      // Post results to PR
      const prUrl = pull_request.html_url;
      await bot.postReview(prUrl, results.issues);

      // Create check run
      await this.createCheckRun(
        repository.owner.login,
        repository.name,
        pull_request.head.sha,
        results,
        token
      );

      return {
        success: true,
        analyzed: files.length,
        issues: results.issues.length,
        pr: pull_request.number
      };
    } catch (error) {
      await errorHandler.handle(error);
      throw error;
    }
  }

  /**
     * Handle check run re-requested events
     */
  async handleCheckRunReRequested(event) {
    const { check_run, repository, installation } = event;

    // Re-run the analysis
    const prNumber = this.extractPRNumber(check_run);
    if (!prNumber) {
      return { message: 'No PR associated with check run' };
    }

    return this.handlePullRequest({
      action: 'synchronize',
      pull_request: { number: prNumber, head: { sha: check_run.head_sha } },
      repository,
      installation
    });
  }

  /**
     * Handle issue comment events (for commands)
     */
  async handleIssueComment(event) {
    const { action, comment, issue, repository, installation } = event;

    if (action !== 'created') {
      return { message: 'Ignoring non-created comment' };
    }

    // Use ManualTriggerHandler for expanded command set
    const manualHandler = new ManualTriggerHandler();
    const command = manualHandler.parseComment(comment.body);
    if (!command) {
      return { message: 'No Sentinel command found' };
    }

    // Only handle PR comments
    if (!issue.pull_request) {
      return { message: 'Not a PR comment' };
    }

    const token = await this.getInstallationToken(installation.id);

    switch (command.action) {
    case 'review':
    case 'analyze':
      return this.handlePullRequest({
        action: 'synchronize',
        pull_request: issue,
        repository,
        installation
      });

    case 'full_review':
      return this.handlePullRequest({
        action: 'opened',
        pull_request: issue,
        repository,
        installation
      });

    case 'pause':
      this.autoReviewEngine.pausePR(
        repository.owner.login, repository.name, issue.number
      );
      return { message: 'Auto-review paused' };

    case 'resume':
      this.autoReviewEngine.resumePR(
        repository.owner.login, repository.name, issue.number
      );
      return { message: 'Auto-review resumed' };

    case 'resolve':
      this.autoReviewEngine.resumePR(
        repository.owner.login, repository.name, issue.number
      );
      return { message: 'Auto-review resolved and reset' };

    case 'autofix':
      return this.handleAutoFix(issue, repository, installation, token);

    case 'help':
      return this.postHelpComment(repository, issue.number, token);

    default:
      return { message: `Unknown command: ${command.action}` };
    }
  }

  /**
     * Parse Sentinel commands from comments
     */
  parseCommand(commentBody) {
    const commandPattern = /@sentinel\s+(analyze|autofix|help)/i;
    const match = commentBody.match(commandPattern);

    if (!match) return null;

    return {
      action: match[1].toLowerCase()
    };
  }

  /**
     * Get installation access token
     */
  async getInstallationToken(_installationId) {
    // In production, use JWT to authenticate and get installation token
    // For now, return the GitHub token from environment
    return process.env.GITHUB_TOKEN;
  }

  /**
     * Get changed files in PR
     */
  async getChangedFiles(owner, repo, prNumber, token) {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch PR files: ${response.status}`);
    }

    const files = await response.json();

    return files.map(file => ({
      path: file.filename,
      content: file.patch || '',
      status: file.status,
      additions: file.additions,
      deletions: file.deletions
    }));
  }

  /**
     * Create GitHub check run
     */
  async createCheckRun(owner, repo, headSha, results, token) {
    const { issues } = results;

    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const highCount = issues.filter(i => i.severity === 'high').length;

    const conclusion = criticalCount > 0 ? 'failure' :
      highCount > 0 ? 'neutral' : 'success';

    const summary = this.generateCheckSummary(issues);
    const annotations = this.generateAnnotations(issues);

    const url = `https://api.github.com/repos/${owner}/${repo}/check-runs`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Sentinel CLI Analysis',
        head_sha: headSha,
        status: 'completed',
        conclusion: conclusion,
        output: {
          title: '🛡️ Sentinel Code Review',
          summary: summary,
          annotations: annotations.slice(0, 50) // GitHub limit
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to create check run: ${response.status}`);
    }

    return response.json();
  }

  /**
     * Generate check run summary
     */
  generateCheckSummary(issues) {
    const counts = {
      critical: issues.filter(i => i.severity === 'critical').length,
      high: issues.filter(i => i.severity === 'high').length,
      medium: issues.filter(i => i.severity === 'medium').length,
      low: issues.filter(i => i.severity === 'low').length
    };

    const total = issues.length;

    let summary = '### Analysis Complete\n\n';
    summary += `**Total Issues:** ${total}\n\n`;

    if (total === 0) {
      summary += '✨ **Great job!** No issues detected.\n';
    } else {
      summary += '| Severity | Count |\n';
      summary += '|----------|-------|\n';
      if (counts.critical > 0) summary += `| 🛑 Critical | ${counts.critical} |\n`;
      if (counts.high > 0) summary += `| 🔶 High | ${counts.high} |\n`;
      if (counts.medium > 0) summary += `| 🔷 Medium | ${counts.medium} |\n`;
      if (counts.low > 0) summary += `| 🟢 Low | ${counts.low} |\n`;

      if (counts.critical > 0 || counts.high > 0) {
        summary += '\n⚠️ **Action Required:** Critical or high severity issues detected.\n';
      }
    }

    return summary;
  }

  /**
     * Generate check run annotations
     */
  generateAnnotations(issues) {
    return issues.map(issue => ({
      path: issue.file,
      start_line: issue.line || 1,
      end_line: issue.line || 1,
      annotation_level: this.getSeverityLevel(issue.severity),
      message: issue.message,
      title: issue.title
    }));
  }

  /**
     * Map severity to GitHub annotation level
     */
  getSeverityLevel(severity) {
    const mapping = {
      critical: 'failure',
      high: 'failure',
      medium: 'warning',
      low: 'notice',
      info: 'notice'
    };

    return mapping[severity] || 'notice';
  }

  /**
     * Extract PR number from check run
     */
  extractPRNumber(checkRun) {
    // This is a simplified version - in production, query the API
    const prMatch = checkRun.output?.title?.match(/#(\d+)/);
    return prMatch ? parseInt(prMatch[1]) : null;
  }

  /**
     * Post help comment
     */
  async postHelpComment(repository, issueNumber, token) {
    const helpText = `## 🛡️ Sentinel CLI Commands

You can interact with Sentinel using these commands:

- \`@sentinel analyze\` - Re-run code analysis on this PR
- \`@sentinel autofix\` - Automatically fix common issues
- \`@sentinel help\` - Show this help message

Sentinel automatically analyzes:
✓ Security vulnerabilities
✓ Code quality
✓ TypeScript/React best practices
✓ Accessibility issues
✓ Performance problems

[Learn more](https://github.com/KunjShah95/SENTINEL-CLI)`;

    const url = `https://api.github.com/repos/${repository.owner.login}/${repository.name}/issues/${issueNumber}/comments`;
    await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ body: helpText })
    });

    return { message: 'Help posted' };
  }

  /**
     * Main webhook handler
     */
  async handleWebhook(event, signature, body) {
    // Verify signature
    this.verifySignature(body, signature);

    const eventType = event['x-github-event'] || event.event;

    switch (eventType) {
    case 'pull_request':
      return this.handlePullRequest(JSON.parse(body));

    case 'check_run':
      return this.handleCheckRunReRequested(JSON.parse(body));

    case 'issue_comment':
      return this.handleIssueComment(JSON.parse(body));

    case 'ping':
      return { message: 'pong' };

    default:
      return { message: `Unhandled event: ${eventType}` };
    }
  }
}

export default GitHubAppWebhookHandler;

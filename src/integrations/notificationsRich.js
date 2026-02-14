import axios from 'axios';

export class SlackNotifier {
  constructor(webhookUrl, options = {}) {
    this.webhookUrl = webhookUrl || process.env.SLACK_WEBHOOK_URL;
    this.channel = options.channel;
    this.username = options.username || 'Sentinel CLI';
    this.iconEmoji = options.iconEmoji || ':shield:';
  }

  isConfigured() {
    return !!this.webhookUrl;
  }

  /**
   * Send a rich message to Slack
   */
  async send(blocks, text = 'Sentinel Security Alert') {
    if (!this.isConfigured()) {
      console.warn('Slack webhook not configured');
      return { success: false, error: 'Not configured' };
    }

    try {
      await axios.post(this.webhookUrl, {
        text,
        blocks,
        channel: this.channel,
        username: this.username,
        icon_emoji: this.iconEmoji,
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Send analysis complete notification
   */
  async sendAnalysisSummary(results) {
    const { summary, issues, repo } = results;
    
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🛡️ Sentinel Analysis Complete',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Repository:*\n${repo || 'Unknown'}`,
          },
          {
            type: 'mrkdwn',
            text: `*Branch:*\n${results.branch || 'main'}`,
          },
        ],
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Critical:* ${this.formatCount(summary.critical, '🔴')}`,
          },
          {
            type: 'mrkdwn',
            text: `*High:* ${this.formatCount(summary.high, '🟠')}`,
          },
          {
            type: 'mrkdwn',
            text: `*Medium:* ${this.formatCount(summary.medium, '🟡')}`,
          },
          {
            type: 'mrkdwn',
            text: `*Low:* ${this.formatCount(summary.low, '🔵')}`,
          },
        ],
      },
    ];

    if (issues && issues.length > 0) {
      const criticalIssues = issues
        .filter(i => i.severity === 'critical')
        .slice(0, 5);

      if (criticalIssues.length > 0) {
        blocks.push({ type: 'divider' });
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*🔴 Critical Issues Found:*',
          },
        });

        for (const issue of criticalIssues) {
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `• *${issue.title}*\n  \`${issue.file}:${issue.line}\`\n  ${issue.message?.substring(0, 100)}`,
            },
          });
        }
      }
    }

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Scanned ${summary.filesScanned || 0} files in ${summary.duration || 'N/A'}`,
        },
      ],
    });

    return this.send(blocks, `Sentinel: ${summary.critical || 0} critical issues found`);
  }

  /**
   * Send security alert
   */
  async sendSecurityAlert(issue, context = {}) {
    const severityEmoji = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵',
      info: 'ℹ️',
    };

    const emoji = severityEmoji[issue.severity] || '⚠️';

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} Security Alert - ${issue.severity?.toUpperCase()}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Type:*\n${issue.type || 'Unknown'}`,
          },
          {
            type: 'mrkdwn',
            text: `*File:*\n\`${issue.file}:${issue.line}\``,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${issue.title}*\n${issue.message}`,
        },
      },
    ];

    if (issue.suggestion) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Suggestion:*\n${issue.suggestion}`,
        },
      });
    }

    if (context.repoUrl) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View File',
            },
            url: `${context.repoUrl}/blob/${context.branch}/${issue.file}#L${issue.line}`,
            style: 'primary',
          },
        ],
      });
    }

    return this.send(blocks, `${emoji} Sentinel Security Alert: ${issue.title}`);
  }

  /**
   * Send PR review notification
   */
  async sendPRReview(results) {
    const { pr, summary, issues } = results;

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🔍 PR Review Complete',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*PR:*\n#${pr.number} ${pr.title}`,
          },
          {
            type: 'mrkdwn',
            text: `*Author:*\n${pr.author}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: this.formatSummaryText(summary),
        },
      },
    ];

    if (issues && issues.length > 0) {
      const topIssues = issues.slice(0, 3);
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Top Issues:*',
        },
      });

      for (const issue of topIssues) {
        const emoji = issue.severity === 'critical' ? '🔴' : issue.severity === 'high' ? '🟠' : '🟡';
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *${issue.title}* - \`${issue.file}:${issue.line}\``,
          },
        });
      }
    }

    return this.send(blocks, `PR #${pr.number}: ${summary.total || 0} issues found`);
  }

  formatCount(count, emoji) {
    return count > 0 ? `${emoji} ${count}` : '0';
  }

  formatSummaryText(summary) {
    return [
      `🔴 Critical: ${summary.critical || 0}`,
      `🟠 High: ${summary.high || 0}`,
      `🟡 Medium: ${summary.medium || 0}`,
      `🔵 Low: ${summary.low || 0}`,
    ].join('  |  ');
  }
}

export class TeamsNotifier {
  constructor(webhookUrl, _options = {}) {
    this.webhookUrl = webhookUrl || process.env.TEAMS_WEBHOOK_URL;
  }

  isConfigured() {
    return !!this.webhookUrl;
  }

  async send(message) {
    if (!this.isConfigured()) {
      console.warn('Teams webhook not configured');
      return { success: false, error: 'Not configured' };
    }

    try {
      await axios.post(this.webhookUrl, message);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async sendAnalysisSummary(results) {
    const { summary, issues, repo } = results;

    const message = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: this.getThemeColor(summary),
      summary: 'Sentinel Security Analysis',
      sections: [
        {
          activityTitle: '🛡️ Sentinel Analysis Complete',
          activitySubtitle: repo || 'Unknown repository',
          facts: [
            { name: 'Critical', value: summary.critical || 0 },
            { name: 'High', value: summary.high || 0 },
            { name: 'Medium', value: summary.medium || 0 },
            { name: 'Low', value: summary.low || 0 },
            { name: 'Files Scanned', value: summary.filesScanned || 0 },
          ],
        },
      ],
      potentialAction: [
        {
          '@type': 'OpenUri',
          name: 'View Results',
          targets: [
            { os: 'default', uri: results.dashboardUrl || '#' },
          ],
        },
      ],
    };

    if (issues && issues.length > 0) {
      const criticalIssues = issues
        .filter(i => i.severity === 'critical')
        .slice(0, 5);

      if (criticalIssues.length > 0) {
        message.sections.push({
          title: '🔴 Critical Issues',
          facts: criticalIssues.map(issue => ({
            name: `${issue.file}:${issue.line}`,
            value: issue.title,
          })),
        });
      }
    }

    return this.send(message);
  }

  getThemeColor(summary) {
    if (summary.critical > 0) return 'FF0000';
    if (summary.high > 0) return 'FFA500';
    if (summary.medium > 0) return 'FFFF00';
    return '00FF00';
  }
}

export default { SlackNotifier, TeamsNotifier };

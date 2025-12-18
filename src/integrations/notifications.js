/**
 * SlackNotifier - Send Sentinel analysis results to Slack
 * Uses Slack Webhook URLs for easy integration
 */
export class SlackNotifier {
    constructor(options = {}) {
        this.webhookUrl = options.webhookUrl || process.env.SLACK_WEBHOOK_URL;
        this.channel = options.channel || null;
        this.username = options.username || 'Sentinel CLI';
        this.iconEmoji = options.iconEmoji || ':shield:';
    }

    /**
     * Get color based on severity
     */
    getSeverityColor(severity) {
        const colors = {
            critical: '#dc3545', // Red
            high: '#fd7e14', // Orange
            medium: '#ffc107', // Yellow
            low: '#28a745', // Green
            info: '#6c757d', // Gray
        };
        return colors[severity] || '#007bff';
    }

    /**
     * Build Slack message blocks from issues
     */
    buildBlocks(issues, options = {}) {
        const { projectName = 'Project', branch = 'main', commitSha = '' } = options;

        // Count by severity
        const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
        for (const issue of issues) {
            counts[issue.severity] = (counts[issue.severity] || 0) + 1;
        }

        const blocks = [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: '🛡️ Sentinel Code Review Report',
                    emoji: true,
                },
            },
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: `*Project:*\n${projectName}`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Branch:*\n${branch}`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Total Issues:*\n${issues.length}`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Commit:*\n${commitSha ? commitSha.substring(0, 7) : 'N/A'}`,
                    },
                ],
            },
            {
                type: 'divider',
            },
        ];

        // Severity summary
        const summaryParts = [];
        if (counts.critical > 0) summaryParts.push(`🛑 *${counts.critical}* Critical`);
        if (counts.high > 0) summaryParts.push(`🔶 *${counts.high}* High`);
        if (counts.medium > 0) summaryParts.push(`🔷 *${counts.medium}* Medium`);
        if (counts.low > 0) summaryParts.push(`🟢 *${counts.low}* Low`);
        if (counts.info > 0) summaryParts.push(`ℹ️ *${counts.info}* Info`);

        if (summaryParts.length > 0) {
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Summary:* ${summaryParts.join(' | ')}`,
                },
            });
        }

        // Top issues (limit to 5)
        const topIssues = issues
            .filter(i => i.severity === 'critical' || i.severity === 'high')
            .slice(0, 5);

        if (topIssues.length > 0) {
            blocks.push({
                type: 'divider',
            });
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '*🔴 Critical/High Priority Issues:*',
                },
            });

            for (const issue of topIssues) {
                const emoji = issue.severity === 'critical' ? '🛑' : '🔶';
                blocks.push({
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `${emoji} *${issue.title}*\n\`${issue.file}:${issue.line}\`\n${issue.message}`,
                    },
                });
            }
        }

        // Footer
        blocks.push({
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: `_Analyzed at ${new Date().toISOString()} by Sentinel CLI_`,
                },
            ],
        });

        return blocks;
    }

    /**
     * Build simple attachment format (fallback)
     */
    buildAttachments(issues, options = {}) {
        const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
        for (const issue of issues) {
            counts[issue.severity] = (counts[issue.severity] || 0) + 1;
        }

        // Determine overall color
        let color = '#28a745'; // Green
        if (counts.critical > 0) color = '#dc3545';
        else if (counts.high > 0) color = '#fd7e14';
        else if (counts.medium > 0) color = '#ffc107';

        const fields = [];
        if (counts.critical > 0) fields.push({ title: 'Critical', value: String(counts.critical), short: true });
        if (counts.high > 0) fields.push({ title: 'High', value: String(counts.high), short: true });
        if (counts.medium > 0) fields.push({ title: 'Medium', value: String(counts.medium), short: true });
        if (counts.low > 0) fields.push({ title: 'Low', value: String(counts.low), short: true });

        return [
            {
                color,
                title: '🛡️ Sentinel Code Review',
                text: `Found ${issues.length} issues in ${options.projectName || 'the project'}`,
                fields,
                footer: 'Sentinel CLI',
                ts: Math.floor(Date.now() / 1000),
            },
        ];
    }

    /**
     * Send notification to Slack
     */
    async notify(issues, options = {}) {
        if (!this.webhookUrl) {
            throw new Error('Slack webhook URL not configured. Set SLACK_WEBHOOK_URL environment variable.');
        }

        const payload = {
            username: this.username,
            icon_emoji: this.iconEmoji,
            blocks: this.buildBlocks(issues, options),
            attachments: this.buildAttachments(issues, options),
        };

        if (this.channel) {
            payload.channel = this.channel;
        }

        const response = await fetch(this.webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Slack notification failed: ${errorText}`);
        }

        return { success: true, issuesReported: issues.length };
    }
}

/**
 * DiscordNotifier - Send Sentinel analysis results to Discord
 * Uses Discord Webhook URLs
 */
export class DiscordNotifier {
    constructor(options = {}) {
        this.webhookUrl = options.webhookUrl || process.env.DISCORD_WEBHOOK_URL;
        this.username = options.username || 'Sentinel CLI';
        this.avatarUrl = options.avatarUrl || null;
    }

    /**
     * Get color based on severity (Discord uses decimal colors)
     */
    getSeverityColor(severity) {
        const colors = {
            critical: 0xdc3545, // Red
            high: 0xfd7e14, // Orange
            medium: 0xffc107, // Yellow
            low: 0x28a745, // Green
            info: 0x6c757d, // Gray
        };
        return colors[severity] || 0x007bff;
    }

    /**
     * Build Discord embeds from issues
     */
    buildEmbeds(issues, options = {}) {
        const { projectName = 'Project', branch = 'main' } = options;

        // Count by severity
        const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
        for (const issue of issues) {
            counts[issue.severity] = (counts[issue.severity] || 0) + 1;
        }

        // Determine overall color
        let color = 0x28a745;
        if (counts.critical > 0) color = 0xdc3545;
        else if (counts.high > 0) color = 0xfd7e14;
        else if (counts.medium > 0) color = 0xffc107;

        const summaryParts = [];
        if (counts.critical > 0) summaryParts.push(`🛑 **${counts.critical}** Critical`);
        if (counts.high > 0) summaryParts.push(`🔶 **${counts.high}** High`);
        if (counts.medium > 0) summaryParts.push(`🔷 **${counts.medium}** Medium`);
        if (counts.low > 0) summaryParts.push(`🟢 **${counts.low}** Low`);

        const embeds = [
            {
                title: '🛡️ Sentinel Code Review Report',
                color,
                fields: [
                    {
                        name: 'Project',
                        value: projectName,
                        inline: true,
                    },
                    {
                        name: 'Branch',
                        value: branch,
                        inline: true,
                    },
                    {
                        name: 'Total Issues',
                        value: String(issues.length),
                        inline: true,
                    },
                    {
                        name: 'Summary',
                        value: summaryParts.length > 0 ? summaryParts.join('\n') : '✅ No issues found!',
                        inline: false,
                    },
                ],
                timestamp: new Date().toISOString(),
                footer: {
                    text: 'Sentinel CLI',
                },
            },
        ];

        // Add top issues embed if there are critical/high issues
        const topIssues = issues
            .filter(i => i.severity === 'critical' || i.severity === 'high')
            .slice(0, 5);

        if (topIssues.length > 0) {
            const issueLines = topIssues.map(issue => {
                const emoji = issue.severity === 'critical' ? '🛑' : '🔶';
                return `${emoji} **${issue.title}**\n\`${issue.file}:${issue.line}\``;
            });

            embeds.push({
                title: '🔴 Top Priority Issues',
                description: issueLines.join('\n\n'),
                color: 0xdc3545,
            });
        }

        return embeds;
    }

    /**
     * Send notification to Discord
     */
    async notify(issues, options = {}) {
        if (!this.webhookUrl) {
            throw new Error('Discord webhook URL not configured. Set DISCORD_WEBHOOK_URL environment variable.');
        }

        const payload = {
            username: this.username,
            embeds: this.buildEmbeds(issues, options),
        };

        if (this.avatarUrl) {
            payload.avatar_url = this.avatarUrl;
        }

        const response = await fetch(this.webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Discord notification failed: ${errorText}`);
        }

        return { success: true, issuesReported: issues.length };
    }
}

export default { SlackNotifier, DiscordNotifier };

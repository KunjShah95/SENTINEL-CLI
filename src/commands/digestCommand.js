import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

export class DigestCommand {
    constructor(options = {}) {
        this.projectPath = options.projectPath || process.cwd();
        this.historyPath = path.join(this.projectPath, '.sentinel', 'digest-history.json');
    }

    async run(args) {
        const action = args[0] || 'send';
        
        switch (action) {
            case 'send':
                return this.sendDigest(args);
            case 'schedule':
                return this.scheduleDigest();
            case 'preview':
                return this.previewDigest();
            default:
                this.showHelp();
        }
    }

    showHelp() {
        console.log(chalk.cyan('\n  Sentinel Digest Commands\n'));
        console.log(chalk.gray('    send      - Send weekly digest'));
        console.log(chalk.gray('    preview   - Preview digest content'));
        console.log(chalk.gray('    schedule  - Setup cron schedule\n'));
    }

    async sendDigest(args) {
        const webhook = process.env.SLACK_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
        
        if (!webhook) {
            console.log(chalk.red('  Error: SLACK_WEBHOOK_URL or DISCORD_WEBHOOK_URL not set'));
            return;
        }

        console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════'));
        console.log(chalk.cyan('  ') + chalk.white('Sentinel Weekly Digest'));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════════════\n'));

        const digest = await this.buildDigest();

        if (args.includes('--preview')) {
            console.log(digest);
            return;
        }

        await this.sendToWebhook(webhook, digest);
    }

    async buildDigest() {
        const current = await this.runAnalysis();
        const previous = await this.loadPreviousDigest();

        const newCritical = current.summary.critical - (previous?.summary?.critical || 0);
        const newHigh = current.summary.high - (previous?.summary?.high || 0);

        let digest = {
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: '🛡️ Sentinel Weekly Security Digest'
                    }
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*This Week's Scan Results*`
                    }
                }
            ]
        };

        const stats = [
            { emoji: '🔴', label: 'Critical', value: current.summary.critical, change: newCritical },
            { emoji: '🟠', label: 'High', value: current.summary.high, change: newHigh },
            { emoji: '🟡', label: 'Medium', value: current.summary.medium },
            { emoji: '🔵', label: 'Low', value: current.summary.low }
        ];

        for (const stat of stats) {
            digest.blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `${stat.emoji} *${stat.label}:* ${stat.value}${stat.change !== undefined && stat.change !== 0 ? ` (${stat.change > 0 ? '+' : ''}${stat.change})` : ''}`
                }
            });
        }

        if (current.issues.length > 0) {
            digest.blocks.push({ type: 'divider' });
            
            digest.blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '*Top Issues This Week:*'
                }
            });

            const topIssues = current.issues.slice(0, 5).map(issue => 
                `• \`${issue.file}:${issue.line}\` - ${issue.message.slice(0, 60)}`
            ).join('\n');

            digest.blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: topIssues
                }
            });
        }

        digest.blocks.push({ type: 'divider' });
        digest.blocks.push({
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: 'View Full Report'
                    },
                    url: 'https://sentinel-cli.dev/dashboard'
                }
            ]
        });

        await this.saveCurrentDigest(current);

        return digest;
    }

    async runAnalysis() {
        try {
            const { CodeReviewBot } = await import('../core/bot.js');
            const bot = new CodeReviewBot();
            await bot.initialize();

            const result = await bot.runAnalysis({
                analyzers: ['security', 'bugs', 'quality', 'dependency'],
                format: 'json',
                silent: true
            });

            const issues = result?.issues || [];
            
            return {
                timestamp: new Date().toISOString(),
                summary: {
                    total: issues.length,
                    critical: issues.filter(i => i.severity === 'critical').length,
                    high: issues.filter(i => i.severity === 'high').length,
                    medium: issues.filter(i => i.severity === 'medium').length,
                    low: issues.filter(i => i.severity === 'low').length
                },
                issues: issues.slice(0, 10)
            };
        } catch (e) {
            return { timestamp: new Date().toISOString(), summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 }, issues: [] };
        }
    }

    async loadPreviousDigest() {
        try {
            const content = await fs.readFile(this.historyPath, 'utf8');
            return JSON.parse(content);
        } catch (e) {
            return null;
        }
    }

    async saveCurrentDigest(current) {
        try {
            await fs.mkdir(path.dirname(this.historyPath), { recursive: true });
            await fs.writeFile(this.historyPath, JSON.stringify(current, null, 2));
        } catch (e) {}
    }

    async sendToWebhook(webhook, digest) {
        const body = JSON.stringify(digest);

        return new Promise((resolve, reject) => {
            const client = webhook.startsWith('https') ? https : http;
            const url = new URL(webhook);
            
            const req = client.request(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            }, (res) => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(chalk.green('  ✓ Digest sent successfully'));
                    resolve();
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });

            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }

    async previewDigest() {
        console.log(chalk.cyan('\n  Digest Preview:\n'));
        
        console.log(chalk.white('  🛡️ Sentinel Weekly Security Digest\n'));
        
        const stats = [
            { emoji: '🔴', label: 'Critical', value: '0' },
            { emoji: '🟠', label: 'High', value: '0' },
            { emoji: '🟡', label: 'Medium', value: '0' },
            { emoji: '🔵', label: 'Low', value: '0' }
        ];

        for (const stat of stats) {
            console.log(chalk.gray(`  ${stat.emoji} ${stat.label}: ${stat.value}`));
        }

        console.log(chalk.gray('\n  Use sentinel digest send --preview to see full content\n'));
    }

    async scheduleDigest() {
        console.log(chalk.cyan('\n  Setup Weekly Digest Schedule\n'));
        
        console.log(chalk.gray('  Add to your crontab:\n'));
        console.log(chalk.cyan('    0 9 * * 1 sentinel digest send'));
        console.log(chalk.gray('\n  This sends a digest every Monday at 9 AM\n'));
        
        console.log(chalk.gray('  Or use GitHub Actions (see .github/workflows/digest.yml)\n'));
    }
}

export async function runDigestCommand(args, options = {}) {
    const command = new DigestCommand(options);
    return command.run(args);
}

export default { DigestCommand, runDigestCommand };

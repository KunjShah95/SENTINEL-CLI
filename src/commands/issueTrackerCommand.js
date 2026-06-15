import chalk from 'chalk';
import inquirer from 'inquirer';
import { promises as fs } from 'fs';
import path from 'path';
import https from 'https';

export class IssueTrackerCommand {
    constructor(options = {}) {
        this.projectPath = options.projectPath || process.cwd();
        this.config = this.loadConfig();
    }

    loadConfig() {
        try {
            const configPath = path.join(this.projectPath, '.sentinel.json');
            const content = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(content);
        } catch (e) {
            return {};
        }
    }

    async run(args) {
        const action = args[0] || 'link';
        
        console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════'));
        console.log(chalk.cyan('  ') + chalk.white('Sentinel Issue Tracker'));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════════════\n'));

        switch (action) {
            case 'link':
                return this.linkTracker();
            case 'create':
                return this.createIssue(args.slice(1));
            case 'list':
                return this.listIssues();
            case 'status':
                return this.showStatus();
            case 'sync':
                return this.syncIssues();
            default:
                this.showHelp();
        }
    }

    showHelp() {
        console.log(chalk.gray('  Commands:'));
        console.log(chalk.gray('    link     - Connect to Jira/Linear'));
        console.log(chalk.gray('    create   - Create issue from analysis'));
        console.log(chalk.gray('    list     - List linked issues'));
        console.log(chalk.gray('    status   - Show tracker status'));
        console.log(chalk.gray('    sync     - Sync issues\n'));
    }

    async linkTracker() {
        const { provider } = await inquirer.default.prompt([
            {
                type: 'list',
                name: 'provider',
                message: 'Select issue tracker:',
                choices: [
                    'Jira',
                    'Linear',
                    'GitHub Issues',
                    'Notion'
                ]
            }
        ]);

        console.log(chalk.gray(`\n  Configuring ${provider}...\n`));

        const questions = this.getTrackerQuestions(provider);
        const answers = await inquirer.default.prompt(questions);

        const trackerConfig = {
            provider: provider.toLowerCase(),
            ...answers
        };

        this.config.issueTracker = trackerConfig;
        await this.saveConfig();

        console.log(chalk.green(`  ✓ Linked to ${provider}`));
        console.log(chalk.gray('\n  Next: Run "sentinel issue create" to create issues from analysis\n'));
    }

    getTrackerQuestions(provider) {
        switch (provider) {
            case 'Jira':
                return [
                    { type: 'input', name: 'host', message: 'Jira host (e.g., company.atlassian.net):' },
                    { type: 'input', name: 'email', message: 'Jira email:' },
                    { type: 'password', name: 'apiToken', message: 'API token:' },
                    { type: 'input', name: 'projectKey', message: 'Project key (e.g., PROJ):' }
                ];
            case 'Linear':
                return [
                    { type: 'password', name: 'apiKey', message: 'Linear API key:' },
                    { type: 'input', name: 'teamId', message: 'Team ID:' }
                ];
            case 'GitHub Issues':
                return [
                    { type: 'input', name: 'owner', message: 'Repository owner:' },
                    { type: 'input', name: 'repo', message: 'Repository name:' }
                ];
            default:
                return [];
        }
    }

    async saveConfig() {
        const configPath = path.join(this.projectPath, '.sentinel.json');
        await fs.writeFile(configPath, JSON.stringify(this.config, null, 2), 'utf8');
    }

    async createIssue(args) {
        if (!this.config.issueTracker) {
            console.log(chalk.yellow('  No issue tracker linked.'));
            console.log(chalk.gray('  Run "sentinel issue link" to connect.\n'));
            return;
        }

        const { summary, description, priority, labels } = await this.promptIssueDetails(args);

        const tracker = this.config.issueTracker;

        console.log(chalk.gray('\n  Creating issue...\n'));

        try {
            let result;
            
            switch (tracker.provider) {
                case 'jira':
                    result = await this.createJiraIssue(tracker, { summary, description, priority, labels });
                    break;
                case 'linear':
                    result = await this.createLinearIssue(tracker, { summary, description, priority, labels });
                    break;
                case 'github':
                    result = await this.createGitHubIssue(tracker, { summary, description, labels });
                    break;
                default:
                    console.log(chalk.red('  Unknown provider: ' + tracker.provider));
                    return;
            }

            console.log(chalk.green('  ✓ Issue created:'));
            console.log(chalk.cyan(`    ${result.url}\n`));

        } catch (e) {
            console.log(chalk.red(`  Failed to create issue: ${e.message}`));
        }
    }

    async promptIssueDetails(args) {
        const analysis = await this.getAnalysisData();

        const questions = [
            {
                type: 'input',
                name: 'summary',
                message: 'Issue summary:',
                default: args.join(' ') || `Security issues found - ${analysis.issueCount} issues`
            },
            {
                type: 'editor',
                name: 'description',
                message: 'Description:',
                default: this.generateIssueDescription(analysis)
            },
            {
                type: 'list',
                name: 'priority',
                message: 'Priority:',
                choices: ['Highest', 'High', 'Medium', 'Low'],
                default: analysis.criticalCount > 0 ? 'Highest' : 'High'
            },
            {
                type: 'checkbox',
                name: 'labels',
                message: 'Labels:',
                choices: ['security', 'bug', 'technical-debt', 'sentinel', 'code-review']
            }
        ];

        return inquirer.default.prompt(questions);
    }

    async getAnalysisData() {
        try {
            const { CodeReviewBot } = await import('../core/bot.js');
            const bot = new CodeReviewBot();
            await bot.initialize();

            const result = await bot.runAnalysis({
                analyzers: ['security', 'bugs', 'quality'],
                format: 'json',
                silent: true
            });

            const issues = result?.issues || [];
            
            return {
                issueCount: issues.length,
                criticalCount: issues.filter(i => i.severity === 'critical').length,
                highCount: issues.filter(i => i.severity === 'high').length,
                issues: issues.slice(0, 10)
            };
        } catch (e) {
            return { issueCount: 0, criticalCount: 0, highCount: 0, issues: [] };
        }
    }

    generateIssueDescription(analysis) {
        let desc = `## Security Analysis Results\n\n`;
        desc += `Found **${analysis.issueCount}** issues including ${analysis.criticalCount} critical and ${analysis.highCount} high severity.\n\n`;
        
        if (analysis.issues.length > 0) {
            desc += `### Top Issues\n\n`;
            for (const issue of analysis.issues) {
                desc += `- **${issue.severity?.toUpperCase() || 'LOW'}** ${issue.file}:${issue.line} - ${issue.message}\n`;
            }
        }

        desc += `\n---\n`;
        desc += `_Created with Sentinel CLI_`;

        return desc;
    }

    async createJiraIssue(tracker, { summary, description, priority, labels }) {
        const { host, email, apiToken, projectKey } = tracker;

        const priorityMap = {
            'Highest': '1',
            'High': '2',
            'Medium': '3',
            'Low': '4'
        };

        const issue = {
            fields: {
                project: { key: projectKey },
                summary,
                description: {
                    type: 'doc',
                    version: 1,
                    content: [{
                        type: 'paragraph',
                        content: [{ type: 'text', text: description }]
                    }]
                },
                issuetype: { name: 'Task' },
                priority: { id: priorityMap[priority] || '3' },
                labels: labels || []
            }
        };

        const body = JSON.stringify(issue);

        return new Promise((resolve, reject) => {
            const req = https.request(`https://${host}/rest/api/3/issue`, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.key) {
                            resolve({
                                key: json.key,
                                url: `https://${host}/browse/${json.key}`
                            });
                        } else {
                            reject(new Error(data));
                        }
                    } catch (e) {
                        reject(new Error(data));
                    }
                });
            });

            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }

    async createLinearIssue(tracker, { summary, description, priority, labels }) {
        const { apiKey, teamId } = tracker;

        const priorityMap = {
            'Highest': 1,
            'High': 2,
            'Medium': 3,
            'Low': 4
        };

        const issue = {
            title: summary,
            description,
            teamId,
            priority: priorityMap[priority] || 3,
            labels: labels?.map(l => ({ name: l })) || []
        };

        const body = JSON.stringify({ issue });

        return new Promise((resolve, reject) => {
            const req = https.request('https://api.linear.app/graphql', {
                method: 'POST',
                headers: {
                    'Authorization': apiKey,
                    'Content-Type': 'application/json'
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.data?.issueCreate?.success) {
                            const issue = json.data.issueCreate.issue;
                            resolve({
                                key: issue.identifier,
                                url: issue.permalink
                            });
                        } else {
                            reject(new Error(data));
                        }
                    } catch (e) {
                        reject(new Error(data));
                    }
                });
            });

            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }

    async createGitHubIssue(tracker, { summary, description, labels }) {
        const { owner, repo } = tracker;
        const token = process.env.GITHUB_TOKEN;

        const issue = {
            title: summary,
            body: description,
            labels: labels || []
        };

        const body = JSON.stringify(issue);

        return new Promise((resolve, reject) => {
            const req = https.request(`https://api.github.com/repos/${owner}/${repo}/issues`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'Content-Type': 'application/json'
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.number) {
                            resolve({
                                key: json.number.toString(),
                                url: json.html_url
                            });
                        } else {
                            reject(new Error(data));
                        }
                    } catch (e) {
                        reject(new Error(data));
                    }
                });
            });

            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }

    async listIssues() {
        console.log(chalk.gray('  Linked Issues:\n'));

        if (!this.config.issueTracker) {
            console.log(chalk.yellow('  No tracker linked\n'));
            return;
        }

        console.log(chalk.green('  ✓ ') + this.config.issueTracker.provider);
        console.log(chalk.gray('  Use "sentinel issue create" to create new issues\n'));
    }

    async showStatus() {
        console.log(chalk.gray('  Issue Tracker Status:\n'));

        if (!this.config.issueTracker) {
            console.log(chalk.yellow('  Not configured'));
            console.log(chalk.gray('  Run "sentinel issue link" to connect\n'));
            return;
        }

        const tracker = this.config.issueTracker;
        
        console.log(chalk.white('  Provider:  ') + tracker.provider);
        
        if (tracker.host) {
            console.log(chalk.white('  Host:      ') + tracker.host);
        }
        if (tracker.projectKey) {
            console.log(chalk.white('  Project:   ') + tracker.projectKey);
        }
        
        console.log(chalk.green('\n  ✓ Connected\n'));
    }

    async syncIssues() {
        console.log(chalk.gray('  Syncing issues...\n'));
        console.log(chalk.yellow('  Feature coming soon\n'));
    }
}

export async function runIssueTrackerCommand(args, options = {}) {
    const command = new IssueTrackerCommand(options);
    return command.run(args);
}

export default { IssueTrackerCommand, runIssueTrackerCommand };

import chalk from 'chalk';
import inquirer from 'inquirer';
import { promises as fs } from 'fs';
import path from 'path';
import { CodeReviewBot } from '../core/bot.js';
import Config from '../config/config.js';

export class InteractiveFixCommand {
    constructor(options = {}) {
        this.projectPath = options.projectPath || process.cwd();
        this.issues = [];
        this.currentIndex = 0;
        this.applied = [];
        this.skipped = [];
        this.edited = [];
    }

    async run(args) {
        const options = this.parseArgs(args);
        
        console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════'));
        console.log(chalk.cyan('  ') + chalk.white('Sentinel Interactive Fix'));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════════════\n'));

        console.log(chalk.gray('  Scanning for fixable issues...\n'));

        await this.scanIssues(options);

        if (this.issues.length === 0) {
            console.log(chalk.green('  ✓ No fixable issues found!\n'));
            return { success: true, applied: 0, skipped: 0 };
        }

        console.log(chalk.gray(`  Found ${this.issues.length} fixable issue(s)\n`));

        return this.runInteractiveMode(options);
    }

    parseArgs(args) {
        const options = {
            interactive: true,
            applyAll: false,
            dryRun: false
        };

        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--dry-run' || args[i] === '-n') {
                options.dryRun = true;
            } else if (args[i] === '--all') {
                options.applyAll = true;
            }
        }

        return options;
    }

    async scanIssues(_options) {
        const config = new Config();
        await config.load();

        const bot = new CodeReviewBot();
        await bot.initialize();

        const files = await this.getFiles();

        try {
            const result = await bot.runAnalysis({
                files,
                analyzers: ['security', 'quality', 'bugs'],
                format: 'json',
                silent: true
            });

            if (result && result.issues) {
                this.issues = result.issues
                    .filter(issue => issue.fixable || issue.suggestion)
                    .slice(0, 50);
            }
        } catch (e) {
            console.log(chalk.yellow(`  Warning: ${e.message}`));
        }
    }

    async getFiles() {
        const { glob } = await import('glob');
        return glob('**/*.{js,ts,jsx,tsx}', {
            cwd: this.projectPath,
            ignore: ['node_modules/**', 'dist/**', 'build/**']
        });
    }

    async runInteractiveMode(options) {
        if (options.applyAll) {
            return this.applyAll(options);
        }

        while (this.currentIndex < this.issues.length) {
            const issue = this.issues[this.currentIndex];
            const progress = `[${this.currentIndex + 1}/${this.issues.length}]`;
            
            console.log(chalk.cyan(`\n  ${progress} ${chalk.white('SEC-').concat(String(this.currentIndex + 1).padStart(3, '0'))}`));
            
            const severityColors = {
                critical: chalk.red,
                high: chalk.yellow,
                medium: chalk.blue,
                low: chalk.gray
            };
            const severityColor = severityColors[issue.severity] || chalk.gray;
            console.log(severityColor(`  ${(issue.severity || 'low').toUpperCase()}`) + chalk.gray(' · ') + chalk.white(`${issue.file}:${issue.line || '?'}`));

            console.log(chalk.gray('  '.concat('─'.repeat(50))));
            console.log(chalk.white(`  ${issue.message}`));

            if (issue.suggestion) {
                console.log(chalk.green('\n  Proposed fix:'));
                console.log(chalk.gray('  ') + issue.suggestion);
            }

            const { choice } = await inquirer.default.prompt([
                {
                    type: 'list',
                    name: 'choice',
                    message: 'Apply?',
                    choices: [
                        { name: 'Yes - apply this fix', value: 'yes' },
                        { name: 'No - skip this fix', value: 'no' },
                        { name: 'Edit - modify the fix', value: 'edit' },
                        { name: 'All - apply all remaining', value: 'all' },
                        { name: 'Quit - stop fixing', value: 'quit' }
                    ],
                    default: 0
                }
            ]);

            switch (choice) {
                case 'yes':
                    await this.applyFix(issue, options);
                    this.applied.push(issue);
                    break;
                case 'no':
                    this.skipped.push(issue);
                    break;
                case 'edit':
                    await this.editFix(issue, options);
                    this.edited.push(issue);
                    break;
                case 'all':
                    options.applyAll = true;
                    await this.applyFix(issue, options);
                    this.applied.push(issue);
                    break;
                case 'quit':
                    console.log(chalk.yellow('\n  Stopping interactive mode...\n'));
                    break;
            }

            this.currentIndex++;

            if (choice === 'quit') break;
        }

        this.showSummary();

        return {
            success: true,
            applied: this.applied.length,
            skipped: this.skipped.length,
            edited: this.edited.length
        };
    }

    async applyFix(issue, options) {
        if (options.dryRun) {
            console.log(chalk.gray('  [DRY RUN] Would apply fix'));
            return;
        }

        try {
            const filePath = path.join(this.projectPath, issue.file);
            let content = await fs.readFile(filePath, 'utf8');

            if (issue.fix) {
                content = this.applyFixToContent(content, issue);
            }

            await fs.writeFile(filePath, content, 'utf8');
            console.log(chalk.green('  ✓ Applied fix'));
        } catch (e) {
            console.log(chalk.red(`  ✗ Failed to apply: ${e.message}`));
        }
    }

    applyFixToContent(content, issue) {
        if (issue.fix && issue.fix.type === 'replace') {
            return content.replace(issue.fix.pattern, issue.fix.replacement);
        }
        
        if (issue.fix && issue.fix.type === 'remove') {
            return content.replace(issue.fix.pattern, '');
        }

        return content;
    }

    async editFix(issue, options) {
        const { newFix } = await inquirer.default.prompt([
            {
                type: 'editor',
                name: 'newFix',
                message: 'Edit the suggested fix:',
                default: issue.suggestion || ''
            }
        ]);

        if (newFix && newFix !== issue.suggestion) {
            issue.suggestion = newFix;
            await this.applyFix(issue, options);
        }
    }

    async applyAll(options) {
        console.log(chalk.cyan('\n  Applying all fixes...\n'));

        for (const issue of this.issues.slice(this.currentIndex)) {
            await this.applyFix(issue, options);
            this.applied.push(issue);
            this.currentIndex++;
        }

        this.showSummary();
    }

    showSummary() {
        console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════'));
        console.log(chalk.cyan('  ') + chalk.white('Fix Summary'));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════════════\n'));

        console.log(chalk.green(`  Applied:  ${this.applied.length}`));
        console.log(chalk.yellow(`  Skipped:  ${this.skipped.length}`));
        console.log(chalk.blue(`  Edited:   ${this.edited.length}`));
        console.log(chalk.gray(`  ─────────────────────────────────`));
        console.log(chalk.white(`  Total:    ${this.issues.length}\n`));

        if (this.applied.length > 0) {
            console.log(chalk.green('  ✓ Fixes applied successfully!'));
        }
    }
}

export async function runInteractiveFixCommand(args, options = {}) {
    const command = new InteractiveFixCommand(options);
    return command.run(args);
}

export default { InteractiveFixCommand, runInteractiveFixCommand };

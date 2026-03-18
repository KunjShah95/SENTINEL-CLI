import chalk from 'chalk';
import { watch } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { glob } from 'glob';
import { CodeReviewBot } from '../core/bot.js';
import Config from '../config/config.js';

const execAsync = promisify(exec);

export class WatchCommand {
    constructor(options = {}) {
        this.projectPath = options.projectPath || process.cwd();
        this.watching = false;
        this.debounceTimer = null;
        this.debounceDelay = options.debounceDelay || 1000;
        this.lastAnalysis = null;
        this.ignorePatterns = [
            'node_modules/**',
            'dist/**',
            'build/**',
            '.git/**',
            'coverage/**',
            '*.log',
            '.sentinel/**'
        ];
    }

    async run(args) {
        const options = this.parseArgs(args);
        
        console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════'));
        console.log(chalk.cyan('  ') + chalk.white('Sentinel Watch'));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════════════\n'));

        console.log(chalk.gray('  Watching for file changes...\n'));
        console.log(chalk.gray('  Press ') + chalk.white('Ctrl+C') + chalk.gray(' to stop\n'));
        
        await this.initialAnalysis(options);
        
        this.setupWatcher(options);
        
        return new Promise(() => {});
    }

    parseArgs(args) {
        const options = {
            analyzers: ['security', 'quality', 'bugs'],
            debounce: this.debounceDelay,
            silent: false
        };
        
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--analyzers' && args[i + 1]) {
                options.analyzers = args[i + 1].split(',');
                i++;
            } else if (args[i] === '--debounce' && args[i + 1]) {
                options.debounce = parseInt(args[i + 1]);
                i++;
            } else if (args[i] === '--silent') {
                options.silent = true;
            }
        }
        
        return options;
    }

    async initialAnalysis(options) {
        console.log(chalk.gray('  Running initial analysis...\n'));
        
        const config = new Config();
        await config.load();
        
        const bot = new CodeReviewBot();
        await bot.initialize();
        
        const files = await glob('**/*.{js,ts,jsx,tsx,py,java,go,rs,kt,swift}', {
            cwd: this.projectPath,
            ignore: this.ignorePatterns
        });
        
        try {
            const result = await bot.runAnalysis({
                files: files.slice(0, 100),
                analyzers: options.analyzers,
                format: 'json',
                silent: options.silent
            });
            
            this.lastAnalysis = result;
            this.displayResults(result, true);
        } catch (e) {
            console.log(chalk.red(`  Initial analysis failed: ${e.message}`));
        }
    }

    setupWatcher(options) {
        const watchedDirs = ['src', 'lib', 'app', 'tests', 'test'];
        
        this.watching = true;
        
        const watchers = [];
        
        for (const dir of watchedDirs) {
            const dirPath = path.join(this.projectPath, dir);
            
            try {
                const watcher = watch(dirPath, { recursive: true }, (eventType, filename) => {
                    if (filename && this.shouldAnalyze(filename)) {
                        this.onFileChange(eventType, filename, options);
                    }
                });
                watchers.push(watcher);
            } catch (e) {
                // Directory might not exist
            }
        }
        
        const rootWatcher = watch(this.projectPath, { recursive: true }, (eventType, filename) => {
            if (filename && this.shouldAnalyze(filename)) {
                this.onFileChange(eventType, filename, options);
            }
        });
        watchers.push(rootWatcher);
        
        process.on('SIGINT', () => {
            console.log(chalk.yellow('\n\n  Stopping watcher...'));
            for (const w of watchers) {
                w.close();
            }
            process.exit(0);
        });
        
        process.on('SIGTERM', () => {
            console.log(chalk.yellow('\n\n  Stopping watcher...'));
            for (const w of watchers) {
                w.close();
            }
            process.exit(0);
        });
    }

    shouldAnalyze(filename) {
        for (const pattern of this.ignorePatterns) {
            if (pattern.includes('**')) {
                const prefix = pattern.replace('/**', '').replace('**', '');
                if (filename.includes(prefix)) return false;
            } else if (filename === pattern || filename.endsWith(pattern)) {
                return false;
            }
        }
        
        const validExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rs', '.kt', '.swift', '.c', '.cpp', '.h'];
        return validExtensions.some(ext => filename.endsWith(ext));
    }

    onFileChange(eventType, filename, options) {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        this.debounceTimer = setTimeout(async () => {
            console.log(chalk.gray(`\n  ${eventType}: ${filename}\n`));
            await this.analyzeChangedFile(filename, options);
        }, options.debounce);
    }

    async analyzeChangedFile(filename, options) {
        const spinner = { start: () => {}, succeed: (msg) => console.log(chalk.green(`  ✓ ${msg}`)), fail: (msg) => console.log(chalk.red(`  ✗ ${msg}`)) };
        
        try {
            const config = new Config();
            await config.load();
            
            const bot = new CodeReviewBot();
            await bot.initialize();
            
            const fullPath = path.join(this.projectPath, filename);
            
            let result;
            try {
                await fs.access(fullPath);
                result = await bot.runAnalysis({
                    files: [filename],
                    analyzers: options.analyzers,
                    format: 'json',
                    silent: options.silent
                });
            } catch (e) {
                console.log(chalk.yellow(`  File deleted or inaccessible: ${filename}`));
                return;
            }
            
            this.lastAnalysis = result;
            this.displayResults(result, false, spinner);
            
        } catch (e) {
            spinner.fail(`Analysis failed: ${e.message}`);
        }
    }

    displayResults(result, isInitial, spinner) {
        if (!result || !result.issues) {
            if (spinner) spinner.succeed('No issues found');
            return;
        }
        
        const issues = result.issues;
        const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
        
        for (const issue of issues) {
            const severity = issue.severity || 'low';
            bySeverity[severity] = (bySeverity[severity] || 0) + 1;
        }
        
        const total = issues.length;
        
        if (total === 0) {
            if (spinner) spinner.succeed('No issues found');
            return;
        }
        
        console.log(chalk.gray('  ───────────────────────────────────────────────────────'));
        
        if (bySeverity.critical > 0) {
            console.log(chalk.red(`  🔴 ${bySeverity.critical} critical issue(s)`));
        }
        if (bySeverity.high > 0) {
            console.log(chalk.yellow(`  🟡 ${bySeverity.high} high severity issue(s)`));
        }
        if (bySeverity.medium > 0) {
            console.log(chalk.blue(`  🔵 ${bySeverity.medium} medium severity issue(s)`));
        }
        if (bySeverity.low > 0) {
            console.log(chalk.gray(`  🟢 ${bySeverity.low} low severity issue(s)`));
        }
        
        console.log(chalk.gray('  ───────────────────────────────────────────────────────\n'));
        
        const criticalIssues = issues.filter(i => i.severity === 'critical' || i.severity === 'high').slice(0, 5);
        
        for (const issue of criticalIssues) {
            const severityIcon = issue.severity === 'critical' ? '🔴' : '🟡';
            console.log(chalk.white(`  ${severityIcon} ${issue.file}:${issue.line} - ${issue.message}`));
        }
        
        console.log('');
    }

    stop() {
        this.watching = false;
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
    }
}

export async function runWatchCommand(args, options = {}) {
    const command = new WatchCommand(options);
    return command.run(args);
}

export default { WatchCommand, runWatchCommand };

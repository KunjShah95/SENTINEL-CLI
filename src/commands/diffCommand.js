import chalk from 'chalk';
import { EnhancedGit } from '../utils/enhancedGit.js';
import { CodeReviewBot } from '../core/bot.js';
import Config from '../config/config.js';
import { diffLines } from 'diff';
import { promises as fs } from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

export class DiffCommand {
    constructor(options = {}) {
        this.git = new EnhancedGit(options.projectPath || process.cwd());
        this.options = options;
    }

    async run(diffSpec = 'main..HEAD') {
        console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════'));
        console.log(chalk.cyan('  ') + chalk.white('Sentinel PR Review'));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════════════\n'));

        const [from, to] = this.parseDiffSpec(diffSpec);
        console.log(chalk.gray(`  Comparing ${chalk.yellow(from)} → ${chalk.green(to)}\n`));

        const spinner = { start: () => console.log(chalk.gray('  Analyzing changes...')), succeed: () => {}, fail: () => {} };
        
        try {
            const changes = await this.getChangedFiles(from, to);
            
            if (changes.length === 0) {
                console.log(chalk.yellow('  No changes found between ') + from + ' and ' + to);
                return { success: true, issues: [], summary: 'No changes' };
            }

            console.log(chalk.gray(`  Found ${changes.length} changed files\n`));

            const analysis = await this.analyzeChanges(changes, from, to);
            const review = this.generateReviewComment(analysis, changes);
            
            console.log(review);

            if (this.options.ai && (analysis.security.length > 0 || analysis.bugs.length > 0)) {
                console.log(chalk.gray('  Generating AI-powered insights...\n'));
                const aiReview = await this.generateAIReview(changes, analysis);
                console.log(aiReview);
            }
            
            return { success: true, ...analysis };
        } catch (error) {
            console.log(chalk.red('  Error: ') + error.message);
            return { success: false, error: error.message };
        }
    }

    parseDiffSpec(spec) {
        const parts = spec.split('..');
        if (parts.length !== 2) {
            return ['main', 'HEAD'];
        }
        return parts;
    }

    async getChangedFiles(from, to) {
        try {
            const result = await this.git.git.diff([`${from}...${to}`, '--name-only']);
            const files = result.split('\n').filter(f => f.trim());
            
            const changes = [];
            for (const file of files) {
                const diffResult = await this.git.git.diff([`${from}...${to}`, '--', file]);
                const statsResult = await this.git.git.diff([`${from}...${to}`, '--', file, '--stat']);
                
                const stats = this.parseStatOutput(statsResult);
                
                changes.push({
                    file,
                    diff: diffResult,
                    additions: stats.additions,
                    deletions: stats.deletions
                });
            }
            
            return changes;
        } catch (error) {
            if (error.message.includes('ambiguous')) {
                return this.getStagedChanges();
            }
            throw error;
        }
    }

    async getStagedChanges() {
        const status = await this.git.status();
        const files = [...status.staged, ...status.modified];
        
        const changes = [];
        for (const file of files.slice(0, 50)) {
            try {
                const diffResult = await this.git.git.diff(['--staged', '--', file]);
                changes.push({
                    file,
                    diff: diffResult,
                    additions: (diffResult.match(/^\+/gm) || []).length,
                    deletions: (diffResult.match(/^-/gm) || []).length
                });
            } catch (e) {
                // Skip files that can't be diffed
            }
        }
        
        return changes;
    }

    parseStatOutput(stats) {
        const lines = stats.split('\n').filter(l => l.trim());
        const lastLine = lines[lines.length - 1] || '';
        
        const addMatch = lastLine.match(/(\d+)\s+addition/);
        const delMatch = lastLine.match(/(\d+)\s+deletion/);
        
        return {
            additions: addMatch ? parseInt(addMatch[1]) : 0,
            deletions: delMatch ? parseInt(delMatch[1]) : 0
        };
    }

    async analyzeChanges(changes, from, to) {
        const config = new Config();
        await config.load();

        const bot = new CodeReviewBot();
        await bot.initialize();

        const filesToAnalyze = changes.map(c => c.file).filter(f => 
            !f.includes('node_modules') && 
            !f.includes('.git') &&
            !f.match(/\.(lock|md|json)$/)
        );

        const analysisResults = {
            security: [],
            quality: [],
            bugs: [],
            performance: [],
            filesAnalyzed: 0
        };

        for (const change of changes.slice(0, 20)) {
            const result = await this.analyzeFile(change, bot);
            if (result) {
                if (result.security) analysisResults.security.push(...result.security);
                if (result.quality) analysisResults.quality.push(...result.quality);
                if (result.bugs) analysisResults.bugs.push(...result.bugs);
                if (result.performance) analysisResults.performance.push(...result.performance);
                analysisResults.filesAnalyzed++;
            }
        }

        return analysisResults;
    }

    async analyzeFile(change, bot) {
        const results = {
            security: [],
            quality: [],
            bugs: [],
            performance: []
        };

        const diff = change.diff;
        
        if (diff.includes('process.env') || diff.includes('process.argv')) {
            results.security.push({
                file: change.file,
                issue: 'Potential environment variable exposure',
                severity: 'medium'
            });
        }

        if (diff.includes('eval(') || diff.includes('Function(')) {
            results.security.push({
                file: change.file,
                issue: 'Dangerous use of eval or Function constructor',
                severity: 'high'
            });
        }

        if (diff.includes('TODO') || diff.includes('FIXME')) {
            results.quality.push({
                file: change.file,
                issue: 'TODO/FIXME comment found',
                severity: 'low'
            });
        }

        if (diff.match(/console\.(log|debug|info)/) && !change.file.includes('test')) {
            results.quality.push({
                file: change.file,
                issue: 'Console statement in production code',
                severity: 'low'
            });
        }

        if (diff.includes('== ') || diff.includes('!= ')) {
            results.bugs.push({
                file: change.file,
                issue: 'Use === instead of == for comparisons',
                severity: 'medium'
            });
        }

        if (diff.includes('await ') && diff.includes('.then(')) {
            results.performance.push({
                file: change.file,
                issue: 'Mixed async patterns - consider using only await',
                severity: 'low'
            });
        }

        const lines = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));
        if (lines.length > 100) {
            results.quality.push({
                file: change.file,
                issue: `Large change (${lines.length} lines added) - consider breaking up`,
                severity: 'medium'
            });
        }

        return results;
    }

    generateReviewComment(analysis, changes) {
        const totalIssues = analysis.security.length + analysis.quality.length + 
                          analysis.bugs.length + analysis.performance.length;
        
        const totalAdditions = changes.reduce((sum, c) => sum + c.additions, 0);
        const totalDeletions = changes.reduce((sum, c) => sum + c.deletions, 0);

        let review = '';

        review += chalk.gray('  ───────────────────────────────────────────────────────\n');
        review += chalk.white('  ') + chalk.bold('Summary') + '\n';
        review += chalk.gray('  ───────────────────────────────────────────────────────\n');
        review += chalk.white(`  Files changed:  `) + chalk.green(changes.length) + '\n';
        review += chalk.white(`  Lines added:    `) + chalk.green(`+${totalAdditions}`) + '\n';
        review += chalk.white(`  Lines removed:  `) + chalk.red(`-${totalDeletions}`) + '\n';
        review += chalk.white(`  Issues found:   `) + (totalIssues > 0 ? chalk.yellow(totalIssues) : chalk.green('0')) + '\n';
        review += '\n';

        if (analysis.security.length > 0) {
            review += chalk.red('  🔒 Security Issues') + '\n';
            review += chalk.gray('  ' + '─'.repeat(50)) + '\n';
            for (const issue of analysis.security.slice(0, 5)) {
                const severityIcon = issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '🟡' : '🟢';
                review += chalk.white(`    ${severityIcon} ${issue.file}: ${issue.issue}`) + '\n';
            }
            review += '\n';
        }

        if (analysis.bugs.length > 0) {
            review += chalk.yellow('  🐛 Potential Bugs') + '\n';
            review += chalk.gray('  ' + '─'.repeat(50)) + '\n';
            for (const issue of analysis.bugs.slice(0, 5)) {
                const severityIcon = issue.severity === 'high' ? '🔴' : '🟡';
                review += chalk.white(`    ${severityIcon} ${issue.file}: ${issue.issue}`) + '\n';
            }
            review += '\n';
        }

        if (analysis.quality.length > 0) {
            review += chalk.blue('  📝 Code Quality') + '\n';
            review += chalk.gray('  ' + '─'.repeat(50)) + '\n';
            for (const issue of analysis.quality.slice(0, 5)) {
                review += chalk.white(`    🟢 ${issue.file}: ${issue.issue}`) + '\n';
            }
            review += '\n';
        }

        if (analysis.performance.length > 0) {
            review += chalk.cyan('  ⚡ Performance') + '\n';
            review += chalk.gray('  ' + '─'.repeat(50)) + '\n';
            for (const issue of analysis.performance.slice(0, 3)) {
                review += chalk.white(`    🟢 ${issue.file}: ${issue.issue}`) + '\n';
            }
            review += '\n';
        }

        review += chalk.gray('  ───────────────────────────────────────────────────────\n');
        
        if (totalIssues === 0) {
            review += chalk.green('  ✅ Great work! No issues found in this PR.\n');
        } else if (totalIssues <= 3) {
            review += chalk.green('  ✅ Looks good! Minor issues found - easy to fix.\n');
        } else if (totalIssues <= 10) {
            review += chalk.yellow('  ⚠️  Several issues found. Please address before merging.\n');
        } else {
            review += chalk.red('  ❌ Multiple issues found. Please address before merging.\n');
        }

        review += chalk.gray('  ───────────────────────────────────────────────────────\n');

        return review;
    }

    async generateAIReview(changes, analysis) {
        const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
        
        if (!apiKey) {
            return chalk.yellow('  ⚠️  AI review requires API key. Run "sentinel auth" to configure.\n');
        }

        try {
            const prompt = this.buildAIReviewPrompt(changes, analysis);
            const response = await this.callAI(prompt, apiKey);
            
            let review = '';
            review += chalk.cyan('  🤖 AI-Powered Insights') + '\n';
            review += chalk.gray('  ' + '─'.repeat(50)) + '\n';
            review += chalk.white('  ' + response.slice(0, 1000)) + '\n';
            review += chalk.gray('  ───────────────────────────────────────────────────────\n');
            
            return review;
        } catch (e) {
            return chalk.yellow(`  ⚠️  AI review unavailable: ${e.message}\n`);
        }
    }

    buildAIReviewPrompt(changes, analysis) {
        const summary = {
            filesChanged: changes.length,
            totalAdditions: changes.reduce((sum, c) => sum + c.additions, 0),
            totalDeletions: changes.reduce((sum, c) => sum + c.deletions, 0),
            securityIssues: analysis.security.length,
            bugRisks: analysis.bugs.length,
            qualityNotes: analysis.quality.length
        };

        const fileList = changes.slice(0, 5).map(c => `${c.file} (+${c.additions} -${c.deletions})`).join(', ');

        return `You are a senior software engineer reviewing a pull request. Provide a concise, helpful code review summary.

PR Summary:
- Files changed: ${summary.filesChanged}
- Lines added: ${summary.totalAdditions}
- Lines removed: ${summary.totalDeletions}
- Security issues: ${summary.securityIssues}
- Potential bugs: ${summary.bugRisks}
- Code quality notes: ${summary.qualityNotes}

Key files: ${fileList}

Provide a brief review (2-3 sentences) focusing on:
1. Overall quality impression
2. Most important concerns
3. Positive observations
4. Actionable recommendations

Keep it constructive and concise.`;
    }

    async callAI(prompt, apiKey) {
        const useGroq = !!process.env.GROQ_API_KEY;
        const url = useGroq 
            ? 'https://api.groq.com/openai/v1/chat/completions'
            : 'https://api.openai.com/v1/chat/completions';
        
        const model = useGroq ? 'mixtral-8x7b-32768' : 'gpt-3.5-turbo';
        
        const body = JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 500
        });

        return new Promise((resolve, reject) => {
            const client = url.includes('https') ? https : http;
            const req = client.request(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.error) reject(new Error(json.error.message));
                        else resolve(json.choices[0].message.content);
                    } catch (e) {
                        reject(new Error('Failed to parse response'));
                    }
                });
            });
            
            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }
}

export async function runDiffCommand(args, options = {}) {
    const diffSpec = args[0] || 'main..HEAD';
    const command = new DiffCommand(options);
    return command.run(diffSpec);
}

export default { DiffCommand, runDiffCommand };

import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';
import { CodeReviewBot } from '../core/bot.js';
import Config from '../config/config.js';
import { glob } from 'glob';

export class ScoreCommand {
    constructor(options = {}) {
        this.projectPath = options.projectPath || process.cwd();
        this.historyPath = path.join(this.projectPath, '.sentinel', 'score-history.json');
        this.previousScore = null;
    }

    async run() {
        console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════'));
        console.log(chalk.cyan('  ') + chalk.white('Sentinel Score'));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════════════\n'));

        await this.loadHistory();
        
        const analysis = await this.analyzeProject();
        const scores = this.calculateScores(analysis);
        const overall = this.calculateOverall(scores);
        
        this.displayScores(scores, overall);
        
        await this.saveScore(overall);
        
        return { success: true, overall, scores };
    }

    async loadHistory() {
        try {
            const content = await fs.readFile(this.historyPath, 'utf8');
            const history = JSON.parse(content);
            this.previousScore = history.current?.overall || null;
        } catch (e) {
            this.previousScore = null;
        }
    }

    async saveScore(overall) {
        try {
            await fs.mkdir(path.dirname(this.historyPath), { recursive: true });
        } catch (e) {}
        
        const history = {
            current: {
                overall,
                timestamp: new Date().toISOString()
            },
            previous: this.previousScore
        };
        
        try {
            await fs.writeFile(this.historyPath, JSON.stringify(history, null, 2), 'utf8');
        } catch (e) {
            console.log(chalk.yellow('  ⚠ Could not save score history'));
        }
    }

    async analyzeProject() {
        const config = new Config();
        await config.load();
        
        const bot = new CodeReviewBot();
        await bot.initialize();
        
        const files = await glob('**/*.{js,ts,jsx,tsx,py,java,go,rs}', {
            cwd: this.projectPath,
            ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**']
        });
        
        const analysis = {
            files: files.length,
            security: { issues: 0, critical: 0, high: 0, medium: 0, low: 0 },
            quality: { issues: 0 },
            dependencies: { vulnerabilities: 0, outdated: 0 },
            bugs: { issues: 0 },
            coverage: 0,
            techDebt: 0
        };
        
        try {
            const result = await bot.runAnalysis({
                files: files.slice(0, 50),
                analyzers: ['security', 'quality', 'bugs', 'dependency'],
                format: 'json',
                silent: true
            });
            
            if (result && result.issues) {
                for (const issue of result.issues) {
                    const severity = issue.severity || 'low';
                    if (issue.analyzer === 'security') {
                        analysis.security.issues++;
                        if (severity === 'critical') analysis.security.critical++;
                        else if (severity === 'high') analysis.security.high++;
                        else if (severity === 'medium') analysis.security.medium++;
                        else analysis.security.low++;
                    } else if (issue.analyzer === 'bugs') {
                        analysis.bugs.issues++;
                    } else if (issue.analyzer === 'quality') {
                        analysis.quality.issues++;
                    }
                }
            }
        } catch (e) {
            // Analysis may fail, continue with basic scoring
        }
        
        const packageJsonPath = path.join(this.projectPath, 'package.json');
        try {
            const pkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
            
            const depCount = Object.keys(pkg.dependencies || {}).length;
            analysis.dependencies.total = depCount;
            
            const devDepCount = Object.keys(pkg.devDependencies || {}).length;
            analysis.devDependencies = devDepCount;
            
            analysis.hasTests = pkg.scripts?.test ? true : false;
            analysis.hasLint = pkg.scripts?.lint ? true : false;
            analysis.hasBuild = pkg.scripts?.build ? true : false;
        } catch (e) {
            // No package.json
        }
        
        return analysis;
    }

    calculateScores(analysis) {
        const securityScore = this.calculateSecurityScore(analysis.security);
        const qualityScore = this.calculateQualityScore(analysis);
        const dependencyScore = this.calculateDependencyScore(analysis);
        
        return {
            security: { score: securityScore, weight: 0.35 },
            quality: { score: qualityScore, weight: 0.30 },
            dependencies: { score: dependencyScore, weight: 0.20 },
            codeHealth: { score: this.calculateCodeHealthScore(analysis), weight: 0.15 }
        };
    }

    calculateSecurityScore(security) {
        if (security.issues === 0) return 100;
        
        let score = 100;
        score -= security.critical * 15;
        score -= security.high * 10;
        score -= security.medium * 5;
        score -= security.low * 2;
        
        return Math.max(0, Math.round(score));
    }

    calculateQualityScore(analysis) {
        let score = 100;
        
        if (!analysis.hasTests) score -= 15;
        if (!analysis.hasLint) score -= 10;
        if (!analysis.hasBuild) score -= 5;
        
        score -= analysis.bugs.issues * 5;
        score -= analysis.quality.issues * 2;
        
        if (analysis.files > 0 && analysis.hasTests) {
            const testBonus = Math.min(10, analysis.files / 10);
            score += testBonus;
        }
        
        return Math.max(0, Math.min(100, Math.round(score)));
    }

    calculateDependencyScore(analysis) {
        let score = 100;
        
        score -= analysis.dependencies.vulnerabilities * 20;
        score -= analysis.dependencies.outdated * 5;
        
        const totalDeps = analysis.dependencies.total || 0;
        if (totalDeps > 100) score -= 10;
        else if (totalDeps > 50) score -= 5;
        
        return Math.max(0, Math.round(score));
    }

    calculateCodeHealthScore(analysis) {
        let score = 80;
        
        const avgFileSize = 200;
        const complexity = Math.min(20, analysis.files / 50);
        score -= complexity;
        
        if (analysis.techDebt > 50) score -= 10;
        
        return Math.max(0, Math.round(score));
    }

    calculateOverall(scores) {
        let weightedSum = 0;
        let totalWeight = 0;
        
        for (const [category, data] of Object.entries(scores)) {
            weightedSum += data.score * data.weight;
            totalWeight += data.weight;
        }
        
        return Math.round(weightedSum / totalWeight);
    }

    displayScores(scores, overall) {
        const categories = [
            { name: 'Security', key: 'security', color: 'red' },
            { name: 'Code Quality', key: 'quality', color: 'blue' },
            { name: 'Dependencies', key: 'dependencies', color: 'yellow' },
            { name: 'Code Health', key: 'codeHealth', color: 'cyan' }
        ];
        
        console.log(chalk.gray('  Category          Score'));
        console.log(chalk.gray('  ──────────────────────────────────'));
        
        for (const cat of categories) {
            const data = scores[cat.key];
            const bar = this.renderProgressBar(data.score);
            const colorFn = chalk[cat.color] || chalk.white;
            console.log(chalk.white(`  ${cat.name.padEnd(17)} ${colorFn(bar)} ${chalk.white(data.score + '/100')}`));
        }
        
        console.log(chalk.gray('  ──────────────────────────────────'));
        
        const overallBar = this.renderProgressBar(overall);
        const change = this.previousScore !== null ? overall - this.previousScore : null;
        
        console.log(chalk.white(`  ${'Overall Score'.padEnd(17)} ${chalk.cyan(overallBar)} ${chalk.white(overall + '/100')}`));
        
        if (change !== null) {
            const changeStr = change >= 0 ? `+${change}` : `${change}`;
            const changeColor = change >= 0 ? chalk.green : chalk.red;
            console.log(chalk.gray(`                              (${changeColor(changeStr)} from last run)`));
        }
        
        console.log('\n');
        
        if (overall >= 80) {
            console.log(chalk.green('  ✅ Excellent! Your project is in great shape.\n'));
        } else if (overall >= 60) {
            console.log(chalk.yellow('  ⚠️  Good, but there\'s room for improvement.\n'));
        } else {
            console.log(chalk.red('  ❌ Needs attention. Run "sentinel analyze" for details.\n'));
        }
    }

    renderProgressBar(score, width = 20) {
        const filled = Math.round((score / 100) * width);
        const empty = width - filled;
        
        let bar = chalk.green('█'.repeat(Math.max(0, filled)));
        bar += chalk.gray('░'.repeat(Math.max(0, empty)));
        
        return bar;
    }
}

export async function runScoreCommand(args, options = {}) {
    const command = new ScoreCommand(options);
    return command.run();
}

export default { ScoreCommand, runScoreCommand };

import chalk from 'chalk';
import { glob } from 'glob';
import { promises as fs } from 'fs';
import path from 'path';

export class FastScanCommand {
    constructor(options = {}) {
        this.projectPath = options.projectPath || process.cwd();
        this.maxTime = options.maxTime || 5000;
    }

    async run(args) {
        const options = this.parseArgs(args);
        
        console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════'));
        console.log(chalk.cyan('  ') + chalk.white('Sentinel Fast Scan'));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════════════\n'));

        console.log(chalk.gray('  Running quick static analysis...\n'));

        const startTime = Date.now();
        
        const results = await this.performFastScan(options);
        
        const duration = Date.now() - startTime;
        
        this.displayResults(results, duration);

        return results;
    }

    parseArgs(args) {
        const options = {
            analyzers: ['security', 'bugs', 'secrets'],
            verbose: false,
            failOn: null
        };

        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--analyzers' && args[i + 1]) {
                options.analyzers = args[i + 1].split(',');
                i++;
            } else if (args[i] === '--verbose') {
                options.verbose = true;
            } else if (args[i] === '--fail-on') {
                options.failOn = args[i + 1];
                i++;
            }
        }

        return options;
    }

    async performFastScan(options) {
        const files = await this.getFiles();
        
        const results = {
            filesScanned: files.length,
            issues: [],
            secrets: [],
            vulnerabilities: [],
            bugs: [],
            duration: 0
        };

        for (const file of files.slice(0, 100)) {
            if (Date.now() - results.startTime > this.maxTime) {
                console.log(chalk.yellow('  ⚠️  Time limit reached, stopping scan...\n'));
                break;
            }

            try {
                const content = await fs.readFile(path.join(this.projectPath, file), 'utf8');
                const fileIssues = this.scanContent(content, file, options);
                results.issues.push(...fileIssues);
            } catch (e) {
                // Skip unreadable files
            }
        }

        results.duration = Date.now() - results.startTime;

        return results;
    }

    async getFiles() {
        return glob('**/*.{js,ts,jsx,tsx,py,java,go,rs,kt,swift}', {
            cwd: this.projectPath,
            ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**', 'coverage/**']
        });
    }

    scanContent(content, file, options) {
        const issues = [];
        
        if (options.analyzers.includes('secrets')) {
            const secrets = this.detectSecrets(content, file);
            issues.push(...secrets);
        }
        
        if (options.analyzers.includes('security')) {
            const security = this.detectSecurityIssues(content, file);
            issues.push(...security);
        }
        
        if (options.analyzers.includes('bugs')) {
            const bugs = this.detectBugs(content, file);
            issues.push(...bugs);
        }

        return issues;
    }

    detectSecrets(content, file) {
        const issues = [];
        const lines = content.split('\n');
        
        const secretPatterns = [
            { pattern: /ghp_[a-zA-Z0-9]{36}/, type: 'GitHub Token', severity: 'critical' },
            { pattern: /sk-[a-zA-Z0-9]{32,}/, type: 'OpenAI Key', severity: 'critical' },
            { pattern: /sk-[a-zA-Z0-9]{32,}/, type: 'API Key', severity: 'critical' },
            { pattern: /gsk_[a-zA-Z0-9]{32,}/, type: 'Groq Key', severity: 'critical' },
            { pattern: /AIza[0-9A-Za-z\-_]{35}/, type: 'Google API Key', severity: 'critical' },
            { pattern: /AKIA[0-9A-Z]{16}/, type: 'AWS Access Key', severity: 'critical' },
            { pattern: /password\s*[:=]\s*['"][^'"]{8,}['"]/i, type: 'Hardcoded Password', severity: 'high' },
            { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]{16,}['"]/i, type: 'API Key', severity: 'high' },
            { pattern: /secret\s*[:=]\s*['"][^'"]{16,}['"]/i, type: 'Secret', severity: 'high' }
        ];

        for (let i = 0; i < lines.length; i++) {
            for (const { pattern, type, severity } of secretPatterns) {
                if (pattern.test(lines[i])) {
                    issues.push({
                        file,
                        line: i + 1,
                        type,
                        message: `Hardcoded ${type}`,
                        severity,
                        analyzer: 'secrets'
                    });
                }
            }
        }

        return issues;
    }

    detectSecurityIssues(content, file) {
        const issues = [];
        const lines = content.split('\n');
        
        const patterns = [
            { pattern: /eval\s*\(/, type: 'Dangerous eval()', severity: 'critical', cwe: 'CWE-95' },
            { pattern: /new Function\s*\(/, type: 'Dynamic code execution', severity: 'high', cwe: 'CWE-95' },
            { pattern: /innerHTML\s*=/, type: 'XSS risk', severity: 'high', cwe: 'CWE-79' },
            { pattern: /dangerouslySetInnerHTML/, type: 'React XSS risk', severity: 'high', cwe: 'CWE-79' },
            { pattern: /exec\s*\(/, type: 'Command injection', severity: 'critical', cwe: 'CWE-78' },
            { pattern: /execSync\s*\(/, type: 'Command injection', severity: 'critical', cwe: 'CWE-78' },
            { pattern: /process\.argv/, type: 'Process argv access', severity: 'medium' },
            { pattern: /child_process.*exec/, type: 'Shell command', severity: 'high', cwe: 'CWE-78' }
        ];

        for (let i = 0; i < lines.length; i++) {
            for (const { pattern, type, severity } of patterns) {
                if (pattern.test(lines[i])) {
                    issues.push({
                        file,
                        line: i + 1,
                        type,
                        message: type,
                        severity,
                        analyzer: 'security'
                    });
                }
            }
        }

        return issues;
    }

    detectBugs(content, file) {
        const issues = [];
        const lines = content.split('\n');
        
        const patterns = [
            { pattern: /==\s*['"]|!=\s*['"]/, type: 'Loose equality', severity: 'low', suggestion: 'Use === or !==' },
            { pattern: /console\.(log|debug)\s*\([^)]*\)(?!\s*;?\s*$)/, type: 'Debug statement', severity: 'low', suggestion: 'Remove or use proper logging' },
            { pattern: /catch\s*\(\s*\)\s*{}/, type: 'Empty catch block', severity: 'medium', suggestion: 'Handle the error properly' },
            { pattern: /TODO|FIXME|HACK|XXX/, type: 'Incomplete code', severity: 'low', suggestion: 'Address this TODO' },
            { pattern: /var\s+\w+\s*=/, type: 'var usage', severity: 'low', suggestion: 'Use const or let' },
            { pattern: /==\s*null|!=\s*null/, type: 'Null check', severity: 'low', suggestion: 'Use === or !==' }
        ];

        for (let i = 0; i < lines.length; i++) {
            for (const { pattern, type, severity, suggestion } of patterns) {
                if (pattern.test(lines[i])) {
                    issues.push({
                        file,
                        line: i + 1,
                        type,
                        message: `${type}${suggestion ? ` - ${suggestion}` : ''}`,
                        severity,
                        analyzer: 'bugs'
                    });
                }
            }
        }

        return issues;
    }

    displayResults(results, duration) {
        const critical = results.issues.filter(i => i.severity === 'critical').length;
        const high = results.issues.filter(i => i.severity === 'high').length;
        const medium = results.issues.filter(i => i.severity === 'medium').length;
        const low = results.issues.filter(i => i.severity === 'low').length;

        console.log(chalk.gray(`  Scanned ${results.filesScanned} files in ${duration}ms\n`));

        console.log(chalk.gray('  Issues Found:'));
        console.log(chalk.gray('  ──────────────────────────────────────────────────────'));

        if (critical > 0) console.log(chalk.red(`    🔴 Critical:  ${critical}`));
        if (high > 0) console.log(chalk.yellow(`    🟠 High:      ${high}`));
        if (medium > 0) console.log(chalk.blue(`    🟡 Medium:    ${medium}`));
        if (low > 0) console.log(chalk.gray(`    🔵 Low:       ${low}`));

        console.log(chalk.gray('  ──────────────────────────────────────────────────────\n'));

        if (results.issues.length === 0) {
            console.log(chalk.green('  ✅ No issues found!\n'));
        } else {
            console.log(chalk.yellow(`  ⚠️  Found ${results.issues.length} issue(s)\n`));
            
            const criticalIssues = results.issues
                .filter(i => i.severity === 'critical' || i.severity === 'high')
                .slice(0, 5);

            if (criticalIssues.length > 0) {
                console.log(chalk.red('  Top Issues:'));
                for (const issue of criticalIssues) {
                    const icon = issue.severity === 'critical' ? '🔴' : '🟠';
                    console.log(chalk.white(`    ${icon} ${issue.file}:${issue.line} - ${issue.message}`));
                }
                console.log('');
            }
        }
    }
}

export async function runFastScanCommand(args, options = {}) {
    const command = new FastScanCommand(options);
    return command.run(args);
}

export default { FastScanCommand, runFastScanCommand };

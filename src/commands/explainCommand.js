import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';

export class ExplainCommand {
    constructor(options = {}) {
        this.projectPath = options.projectPath || process.cwd();
    }

    async run(args) {
        const target = args[0];
        
        if (!target) {
            return this.showHelp();
        }

        const parsed = this.parseTarget(target);
        
        console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════'));
        console.log(chalk.cyan('  ') + chalk.white('Sentinel Explain'));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════════════\n'));

        await this.explainIssue(parsed);
    }

    parseTarget(target) {
        const match = target.match(/^(.+?):(\d+)(?::(\d+))?$/);
        
        if (match) {
            return {
                file: match[1],
                line: parseInt(match[2]),
                column: match[3] ? parseInt(match[3]) : null
            };
        }

        const lineMatch = target.match(/^:(\d+)$/);
        if (lineMatch) {
            return {
                file: null,
                line: parseInt(lineMatch[1])
            };
        }

        return {
            file: target,
            line: null
        };
    }

    async explainIssue(parsed) {
        try {
            const filePath = path.join(this.projectPath, parsed.file);
            const content = await fs.readFile(filePath, 'utf8');
            const lines = content.split('\n');

            const startLine = Math.max(0, parsed.line - 3);
            const endLine = Math.min(lines.length, parsed.line + 2);

            console.log(chalk.gray(`  File: ${parsed.file}:${parsed.line}\n`));
            console.log(chalk.gray('  Code:'));
            console.log(chalk.gray('  ┌─────────────────────────────────────────────────────'));

            for (let i = startLine; i < endLine; i++) {
                const lineNum = String(i + 1).padStart(3, ' ');
                const prefix = i + 1 === parsed.line ? '→' : ' ';
                const line = lines[i] || '';
                
                if (i + 1 === parsed.line) {
                    console.log(chalk.cyan(`  ${lineNum} │ ${prefix} ${chalk.white(line)}`));
                } else {
                    console.log(chalk.gray(`  ${lineNum} │ ${prefix} ${line}`));
                }
            }
            console.log(chalk.gray('  └─────────────────────────────────────────────────────\n'));

            const analysis = this.analyzeLine(lines[parsed.line - 1], parsed.file);
            
            this.displayAnalysis(analysis);

            if (analysis.aiExplanation) {
                console.log(chalk.cyan('  🤖 AI Explanation:\n'));
                console.log(chalk.white(`  ${analysis.aiExplanation}\n`));
            }

            if (analysis.fix) {
                console.log(chalk.green('  ✅ Recommended Fix:\n'));
                console.log(chalk.white(`  ${analysis.fix}\n`));
            }

            if (analysis.learnMore) {
                console.log(chalk.gray('  📚 Learn More:'));
                console.log(chalk.cyan(`  ${analysis.learnMore}\n`));
            }

        } catch (e) {
            console.log(chalk.red(`  Error: ${e.message}`));
        }
    }

    analyzeLine(line, _filename) {
        const analysis = {
            issue: null,
            severity: 'medium',
            explanation: '',
            fix: null,
            learnMore: null,
            aiExplanation: null
        };

        const patterns = [
            {
                pattern: /process\.env\.\w+/,
                issue: 'Hardcoded Environment Access',
                severity: 'low',
                explanation: 'Directly accessing environment variables can be a security risk if not properly validated.',
                fix: 'Use a config module that validates and transforms environment variables.',
                cwe: 'CWE-1055'
            },
            {
                pattern: /eval\(|new Function\(/,
                issue: 'Dangerous Code Execution',
                severity: 'critical',
                explanation: 'eval() and similar functions can execute arbitrary code, creating severe security vulnerabilities.',
                fix: 'Use safer alternatives like JSON.parse() or a sandboxed interpreter.',
                cwe: 'CWE-95',
                learnMore: 'https://owasp.org/www-community/attacks/Code_Injection'
            },
            {
                pattern: /SELECT.*\+.*FROM|INSERT.*\+.*INTO|UPDATE.*\+.*SET|DELETE.*\+.*FROM/i,
                issue: 'SQL Injection Risk',
                severity: 'critical',
                explanation: 'String concatenation in SQL queries allows attackers to inject malicious SQL code.',
                fix: "Use parameterized queries: db.query('SELECT * FROM users WHERE id = $1', [userId])",
                cwe: 'CWE-89',
                learnMore: 'https://owasp.org/www-community/attacks/SQL_Injection'
            },
            {
                pattern: /innerHTML\s*=/,
                issue: 'Potential XSS Vulnerability',
                severity: 'high',
                explanation: 'Setting innerHTML with user input can lead to Cross-Site Scripting (XSS) attacks.',
                fix: 'Use textContent or a sanitization library like DOMPurify.',
                cwe: 'CWE-79',
                learnMore: 'https://owasp.org/www-community/attacks/xss/'
            },
            {
                pattern: /console\.(log|debug|info)\(/,
                issue: 'Debug Statement Left in Code',
                severity: 'low',
                explanation: 'Console statements can leak sensitive information in production and affect performance.',
                fix: 'Remove console statements or use a proper logging library with level controls.',
                cwe: null
            },
            {
                pattern: /require\s*\(\s*['"]\s*['"]\)|import\s+['"][^'"]+['"]/,
                issue: 'Dynamic Import',
                severity: 'low',
                explanation: 'Dynamic imports with unsanitized input can lead to path traversal attacks.',
                fix: 'Validate and whitelist allowed modules before importing.',
                cwe: 'CWE-378'
            },
            {
                pattern: /fs\.(readFile|writeFile|readFileSync|writeFileSync)\s*\(\s*.*\+/,
                issue: 'Path Traversal Risk',
                severity: 'high',
                explanation: 'Concatenating user input into file paths can allow attackers to access sensitive files.',
                fix: 'Use path.resolve() and validate the final path stays within allowed directories.',
                cwe: 'CWE-22',
                learnMore: 'https://owasp.org/www-community/attacks/Path_Traversal'
            },
            {
                pattern: /child_process\.(exec|execSync|spawn)\s*\(/,
                issue: 'Command Injection Risk',
                severity: 'critical',
                explanation: 'Executing system commands with unsanitized input allows arbitrary command execution.',
                fix: 'Use execFile with arguments array, or validate input strictly.',
                cwe: 'CWE-78',
                learnMore: 'https://owasp.org/www-community/attacks/Command_Injection'
            },
            {
                pattern: /password\s*[:=]\s*['"][^'"]+['"]/i,
                issue: 'Hardcoded Password',
                severity: 'high',
                explanation: 'Hardcoded credentials are easily discovered and pose serious security risks.',
                fix: 'Use environment variables or a secrets manager (AWS Secrets Manager, HashiCorp Vault).',
                cwe: 'CWE-259'
            },
            {
                pattern: /===?\s*['"]\s*|===?\s*['"][^'"]+['"]/,
                issue: 'Loose Equality',
                severity: 'low',
                explanation: 'Loose equality (==/!=) can cause unexpected type coercion bugs.',
                fix: 'Use strict equality (===/!==) for predictable comparisons.',
                cwe: 'CWE-398'
            },
            {
                pattern: /async\s+\w+\s*\(\s*\)\s*{[^}]*}\s*\.catch\(/,
                issue: 'Uncaught Promise',
                severity: 'medium',
                explanation: 'Unhandled promise rejections can cause silent failures that are hard to debug.',
                fix: 'Add .catch() handlers or use try/catch in async functions.',
                cwe: 'CWE-755'
            },
            {
                pattern: /let\s+\w+\s*=\s*\w+;/,
                issue: 'Shadowed Variable',
                severity: 'low',
                explanation: 'Variable shadowing can cause confusing bugs and maintenance issues.',
                fix: 'Use unique variable names or remove unnecessary declarations.',
                cwe: null
            }
        ];

        for (const p of patterns) {
            if (p.pattern.test(line)) {
                analysis.issue = p.issue;
                analysis.severity = p.severity;
                analysis.explanation = p.explanation;
                analysis.fix = p.fix;
                analysis.learnMore = p.learnMore;
                break;
            }
        }

        if (!analysis.issue) {
            analysis.issue = 'Unknown Code Pattern';
            analysis.explanation = 'This code pattern was not identified as a known issue.';
        }

        return analysis;
    }

    displayAnalysis(analysis) {
        const severityColors = {
            critical: chalk.red,
            high: chalk.yellow,
            medium: chalk.blue,
            low: chalk.gray
        };

        const severityColor = severityColors[analysis.severity] || chalk.gray;
        
        console.log(chalk.white('  Issue: ') + severityColor(analysis.issue.toUpperCase()));
        console.log(chalk.white('  Severity: ') + severityColor(analysis.severity.toUpperCase()));
        console.log(chalk.gray('  ──────────────────────────────────────────────────────\n'));

        console.log(chalk.white("  What's happening:"));
        console.log(chalk.gray(`  ${analysis.explanation}\n`));
    }

    showHelp() {
        console.log(chalk.cyan('\n  Sentinel Explain\n'));
        console.log(chalk.gray('  Usage:'));
        console.log(chalk.cyan('    sentinel explain <file:line>'));
        console.log(chalk.cyan('    sentinel explain src/auth.js:47'));
        console.log(chalk.cyan('    sentinel explain :123'));
        console.log(chalk.gray('\n  Examples:'));
        console.log(chalk.gray('    sentinel explain src/database.js:42'));
        console.log(chalk.gray('    sentinel explain src/utils.js:15\n'));
    }
}

export async function runExplainCommand(args, options = {}) {
    const command = new ExplainCommand(options);
    return command.run(args);
}

export default { ExplainCommand, runExplainCommand };

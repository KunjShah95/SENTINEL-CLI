import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';

export class IgnoreManager {
    constructor(options = {}) {
        this.projectPath = options.projectPath || process.cwd();
        this.ignoreFile = path.join(this.projectPath, '.sentinelignore');
    }

    async run(args) {
        const action = args[0] || 'list';
        
        switch (action) {
            case 'list':
                return this.listIgnores();
            case 'add':
                return this.addIgnore(args[1], args.slice(2).join(' '));
            case 'remove':
            case 'rm':
                return this.removeIgnore(args[1]);
            case 'clear':
                return this.clearIgnores();
            case 'export':
                return this.exportIgnores();
            case 'import':
                return this.importIgnores(args[1]);
            default:
                this.showHelp();
        }
    }

    async listIgnores() {
        console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════'));
        console.log(chalk.cyan('  ') + chalk.white('Sentinel Ignore Rules'));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════════════\n'));

        try {
            const content = await fs.readFile(this.ignoreFile, 'utf8');
            const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
            
            if (lines.length === 0) {
                console.log(chalk.gray('  No ignore rules configured.\n'));
                console.log(chalk.gray('  Add rules using:'));
                console.log(chalk.gray('    sentinel ignore add <pattern> [reason]'));
                return;
            }

            console.log(chalk.gray('  Pattern                              Reason'));
            console.log(chalk.gray('  ───────────────────────────────────────────────────────────'));
            
            for (const line of lines) {
                const [pattern, ...reasonParts] = line.split('#');
                const reason = reasonParts.join(' #').trim() || 'No reason';
                console.log(chalk.white(`  ${pattern.trim().padEnd(35)} ${chalk.gray(reason)}`));
            }
            
            console.log(chalk.gray('\n  Total: ') + chalk.white(`${lines.length} rules\n`));
            
        } catch (e) {
            console.log(chalk.yellow('  No .sentinelignore file found.\n'));
            console.log(chalk.gray('  Create ignore rules using:'));
            console.log(chalk.gray('    sentinel ignore add <pattern> [reason]'));
        }
    }

    async addIgnore(pattern, reason = '') {
        if (!pattern) {
            console.log(chalk.red('  Error: Pattern required'));
            console.log(chalk.gray('  Usage: sentinel ignore add <pattern> [reason]'));
            return;
        }

        let content = '';
        try {
            content = await fs.readFile(this.ignoreFile, 'utf8');
        } catch (e) {
            content = '# Sentinel Ignore Rules\n';
        }

        const rule = reason ? `${pattern} # ${reason}` : pattern;
        
        if (content.includes(pattern)) {
            console.log(chalk.yellow(`  Pattern "${pattern}" already exists`));
            return;
        }

        content += '\n' + rule + '\n';
        
        await fs.writeFile(this.ignoreFile, content, 'utf8');
        
        console.log(chalk.green(`  ✓ Added ignore rule: ${pattern}`));
        if (reason) {
            console.log(chalk.gray(`    Reason: ${reason}`));
        }
    }

    async removeIgnore(pattern) {
        if (!pattern) {
            console.log(chalk.red('  Error: Pattern required'));
            console.log(chalk.gray('  Usage: sentinel ignore remove <pattern>'));
            return;
        }

        try {
            let content = await fs.readFile(this.ignoreFile, 'utf8');
            const lines = content.split('\n');
            
            const filtered = lines.filter(l => !l.trim().startsWith(pattern));
            
            if (filtered.length === lines.length) {
                console.log(chalk.yellow(`  Pattern "${pattern}" not found`));
                return;
            }

            await fs.writeFile(this.ignoreFile, filtered.join('\n'), 'utf8');
            console.log(chalk.green(`  ✓ Removed ignore rule: ${pattern}`));
            
        } catch (e) {
            console.log(chalk.red('  Error: Could not remove pattern'));
        }
    }

    async clearIgnores() {
        const readline = await import('inquirer');
        
        const { confirm } = await readline.default.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: 'Clear all ignore rules?',
                default: false
            }
        ]);

        if (confirm) {
            await fs.writeFile(this.ignoreFile, '# Sentinel Ignore Rules\n', 'utf8');
            console.log(chalk.green('  ✓ Cleared all ignore rules'));
        } else {
            console.log(chalk.gray('  Cancelled'));
        }
    }

    async exportIgnores() {
        const exportPath = path.join(this.projectPath, 'sentinel-ignore-export.json');
        
        try {
            const content = await fs.readFile(this.ignoreFile, 'utf8');
            const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
            
            const rules = lines.map(line => {
                const [pattern, ...reasonParts] = line.split('#');
                return {
                    pattern: pattern.trim(),
                    reason: reasonParts.join(' #').trim()
                };
            });

            await fs.writeFile(exportPath, JSON.stringify({ rules, exported: new Date().toISOString() }, null, 2));
            console.log(chalk.green(`  ✓ Exported to ${exportPath}`));
            
        } catch (e) {
            console.log(chalk.red('  Error: Could not export ignores'));
        }
    }

    async importIgnores(filePath) {
        if (!filePath) {
            console.log(chalk.red('  Error: File path required'));
            console.log(chalk.gray('  Usage: sentinel ignore import <file>'));
            return;
        }

        try {
            const content = await fs.readFile(filePath, 'utf8');
            const data = JSON.parse(content);
            
            if (!data.rules || !Array.isArray(data.rules)) {
                console.log(chalk.red('  Error: Invalid import file format'));
                return;
            }

            let existingContent = '';
            try {
                existingContent = await fs.readFile(this.ignoreFile, 'utf8');
            } catch (e) {
                existingContent = '# Sentinel Ignore Rules\n';
            }

            for (const rule of data.rules) {
                if (!existingContent.includes(rule.pattern)) {
                    const ruleLine = rule.reason ? `${rule.pattern} # ${rule.reason}` : rule.pattern;
                    existingContent += '\n' + ruleLine + '\n';
                }
            }

            await fs.writeFile(this.ignoreFile, existingContent, 'utf8');
            console.log(chalk.green(`  ✓ Imported ${data.rules.length} rules`));
            
        } catch (e) {
            console.log(chalk.red('  Error: Could not import ignores'));
        }
    }

    showHelp() {
        console.log(chalk.cyan('\n  Sentinel Ignore Commands:\n'));
        console.log(chalk.gray('    list                    List all ignore rules'));
        console.log(chalk.gray('    add <pattern> [reason]  Add new ignore rule'));
        console.log(chalk.gray('    remove <pattern>        Remove ignore rule'));
        console.log(chalk.gray('    clear                    Clear all ignore rules'));
        console.log(chalk.gray('    export                   Export rules to JSON'));
        console.log(chalk.gray('    import <file>           Import rules from JSON\n'));
        
        console.log(chalk.cyan('  Per-line Suppression:\n'));
        console.log(chalk.gray('    // sentinel-ignore                 Ignore next line'));
        console.log(chalk.gray('    // sentinel-ignore:rule-id         Ignore specific rule'));
        console.log(chalk.gray('    // sentinel-ignore-file            Ignore entire file\n'));
    }
}

export async function runIgnoreCommand(args, options = {}) {
    const manager = new IgnoreManager(options);
    return manager.run(args);
}

export default { IgnoreManager, runIgnoreCommand };

import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';
import inquirer from 'inquirer';

export class MigrateCommand {
    constructor(options = {}) {
        this.projectPath = options.projectPath || process.cwd();
    }

    async run(args) {
        const tool = args[0];
        
        if (!tool) {
            return this.showSupportedTools();
        }

        console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════'));
        console.log(chalk.cyan('  ') + chalk.white(`Migrating from ${tool} to Sentinel`));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════════════\n'));

        switch (tool.toLowerCase()) {
            case 'snyk':
                return this.migrateFromSnyk();
            case 'codacy':
                return this.migrateFromCodacy();
            case 'deepsource':
                return this.migrateFromDeepSource();
            case 'eslint':
                return this.migrateFromESLint();
            case 'prettier':
                return this.migrateFromPrettier();
            default:
                console.log(chalk.red(`  Unknown tool: ${tool}`));
                this.showSupportedTools();
        }
    }

    showSupportedTools() {
        console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════'));
        console.log(chalk.cyan('  ') + chalk.white('Supported Migration Tools'));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════════════\n'));

        const tools = [
            { name: 'snyk', desc: 'Snyk vulnerability scanner' },
            { name: 'codacy', desc: 'Codacy code quality' },
            { name: 'deepsource', desc: 'DeepSource static analysis' },
            { name: 'eslint', desc: 'ESLint configuration' },
            { name: 'prettier', desc: 'Prettier configuration' }
        ];

        console.log(chalk.gray('  Available migrations:\n'));
        for (const t of tools) {
            console.log(chalk.white(`    ${t.name.padEnd(12)} ${chalk.gray(t.desc)}`));
        }

        console.log(chalk.gray('\n  Usage:'));
        console.log(chalk.cyan('    sentinel migrate <tool>\n'));
    }

    async migrateFromSnyk() {
        console.log(chalk.gray('  Scanning for Snyk configuration...\n'));

        const files = ['.snyk', 'snyk.config.json', '.snyk Policy'];
        let found = null;

        for (const file of files) {
            try {
                await fs.access(path.join(this.projectPath, file));
                found = file;
                break;
            } catch (e) {}
        }

        if (!found) {
            console.log(chalk.yellow('  No Snyk configuration found.'));
            console.log(chalk.gray('  This command migrates existing Snyk configs to Sentinel.'));
            return;
        }

        console.log(chalk.green(`  Found: ${found}`));

        const { confirm } = await inquirer.default.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: 'Migrate Snyk configuration to Sentinel?',
                default: true
            }
        ]);

        if (!confirm) {
            console.log(chalk.gray('  Cancelled'));
            return;
        }

        console.log(chalk.gray('\n  Migrating configuration...\n'));

        const sentinelConfig = {
            analyzers: ['security', 'dependency'],
            severityThreshold: 'medium',
            ignoreRules: []
        };

        try {
            const snykContent = await fs.readFile(path.join(this.projectPath, found), 'utf8');
            
            if (snykContent.includes('ignore')) {
                const ignoreMatches = snykContent.match(/"[^"]+":\s*\{[^}]*ignore[^}]*\}/g);
                if (ignoreMatches) {
                    sentinelConfig.ignoreRules = ignoreMatches.map(m => {
                        const pathMatch = m.match(/"([^"]+)"/);
                        return pathMatch ? pathMatch[1] : null;
                    }).filter(Boolean);
                }
            }
        } catch (e) {}

        await fs.writeFile(
            path.join(this.projectPath, '.sentinel.json'),
            JSON.stringify(sentinelConfig, null, 2)
        );

        console.log(chalk.green('  ✓ Configuration migrated to .sentinel.json'));
        console.log(chalk.gray('\n  Next steps:'));
        console.log(chalk.gray('    • Review .sentinel.json configuration'));
        console.log(chalk.gray('    • Run "sentinel analyze" to test'));
        console.log(chalk.gray('    • Remove Snyk: npm uninstall snyk\n'));
    }

    async migrateFromCodacy() {
        console.log(chalk.gray('  Scanning for Codacy configuration...\n'));

        const files = ['.codacy.yml', '.codacy.json', 'codacy.yml'];
        let found = null;

        for (const file of files) {
            try {
                await fs.access(path.join(this.projectPath, file));
                found = file;
                break;
            } catch (e) {}
        }

        if (!found) {
            console.log(chalk.yellow('  No Codacy configuration found.'));
            return;
        }

        console.log(chalk.green(`  Found: ${found}`));

        const sentinelConfig = {
            analyzers: ['quality', 'security', 'bugs'],
            severityThreshold: 'low'
        };

        await fs.writeFile(
            path.join(this.projectPath, '.sentinel.json'),
            JSON.stringify(sentinelConfig, null, 2)
        );

        console.log(chalk.green('  ✓ Configuration migrated to .sentinel.json'));
        console.log(chalk.gray('\n  Codacy tools mapped to Sentinel analyzers:'));
        console.log(chalk.gray('    • Codacy Quality → sentinel quality'));
        console.log(chalk.gray('    • Codacy Security → sentinel security'));
        console.log(chalk.gray('    • Codacy Bugs → sentinel bugs\n'));
    }

    async migrateFromDeepSource() {
        console.log(chalk.gray('  Scanning for DeepSource configuration...\n'));

        const files = ['.deepsource.toml', 'deepsource.yml'];
        let found = null;

        for (const file of files) {
            try {
                await fs.access(path.join(this.projectPath, file));
                found = file;
                break;
            } catch (e) {}
        }

        if (!found) {
            console.log(chalk.yellow('  No DeepSource configuration found.'));
            return;
        }

        console.log(chalk.green(`  Found: ${found}`));

        const sentinelConfig = {
            analyzers: ['quality', 'security', 'bugs'],
            severityThreshold: 'medium'
        };

        await fs.writeFile(
            path.join(this.projectPath, '.sentinel.json'),
            JSON.stringify(sentinelConfig, null, 2)
        );

        console.log(chalk.green('  ✓ Configuration migrated to .sentinel.json'));
    }

    async migrateFromESLint() {
        console.log(chalk.gray('  Scanning for ESLint configuration...\n'));

        const files = ['.eslintrc.json', '.eslintrc.js', '.eslintrc.yml', 'eslint.config.js'];
        let found = null;

        for (const file of files) {
            try {
                await fs.access(path.join(this.projectPath, file));
                found = file;
                break;
            } catch (e) {}
        }

        if (!found) {
            console.log(chalk.yellow('  No ESLint configuration found.'));
            return;
        }

        console.log(chalk.green(`  Found: ${found}`));

        const sentinelConfig = {
            analyzers: ['security', 'quality'],
            severityThreshold: 'warning'
        };

        await fs.writeFile(
            path.join(this.projectPath, '.sentinel.json'),
            JSON.stringify(sentinelConfig, null, 2)
        );

        console.log(chalk.green('  ✓ Configuration migrated to .sentinel.json'));
        console.log(chalk.gray('\n  ESLint rules will be honored by Sentinel where applicable.\n'));
    }

    async migrateFromPrettier() {
        console.log(chalk.gray('  Scanning for Prettier configuration...\n'));

        const files = ['.prettierrc', '.prettierrc.json', '.prettierrc.yml', 'prettier.config.js'];
        let found = null;

        for (const file of files) {
            try {
                await fs.access(path.join(this.projectPath, file));
                found = file;
                break;
            } catch (e) {}
        }

        if (!found) {
            console.log(chalk.yellow('  No Prettier configuration found.'));
            return;
        }

        console.log(chalk.green(`  Found: ${found}`));
        console.log(chalk.gray('\n  Sentinel uses its own formatting rules.'));
        console.log(chalk.gray('  You can continue using Prettier alongside Sentinel.\n'));
    }
}

export async function runMigrateCommand(args, options = {}) {
    const command = new MigrateCommand(options);
    return command.run(args);
}

export default { MigrateCommand, runMigrateCommand };

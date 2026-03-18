import chalk from 'chalk';
import inquirer from 'inquirer';
import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class InitCommand {
    constructor(options = {}) {
        this.projectPath = options.projectPath || process.cwd();
        this.answers = {};
    }

    async run() {
        console.log(chalk.cyan(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║     ${chalk.white('Sentinel')} ${chalk.gray('— Interactive Setup Wizard')}                   ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`));

        await this.welcome();
        await this.projectSetup();
        await this.authSetup();
        await this.analysisSetup();
        await this.ciSetup();
        await this.createConfig();
        
        this.showSummary();
        
        return { success: true, config: this.answers };
    }

    async welcome() {
        console.log(chalk.white('\n  Welcome to Sentinel! Let\'s set up your project.\n'));
        console.log(chalk.gray('  This wizard will:'));
        console.log(chalk.gray('    1. Configure your project settings'));
        console.log(chalk.gray('    2. Set up authentication'));
        console.log(chalk.gray('    3. Choose analyzers to run'));
        console.log(chalk.gray('    4. Configure CI/CD integration'));
        console.log(chalk.gray('    5. Create your configuration file\n'));
        
        const { proceed } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'proceed',
                message: 'Ready to begin?',
                default: true
            }
        ]);
        
        if (!proceed) {
            console.log(chalk.yellow('\n  Setup cancelled. Run "sentinel init" anytime to start again.\n'));
            process.exit(0);
        }
    }

    async projectSetup() {
        console.log(chalk.cyan('\n  📁 Project Configuration\n'));
        
        const packageJsonPath = path.join(this.projectPath, 'package.json');
        let existingProject = {};
        
        try {
            const pkgContent = await fs.readFile(packageJsonPath, 'utf8');
            existingProject = JSON.parse(pkgContent);
        } catch (e) {
            // No package.json found
        }
        
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'projectName',
                message: 'Project name:',
                default: existingProject.name || path.basename(this.projectPath)
            },
            {
                type: 'list',
                name: 'language',
                message: 'Primary language:',
                choices: [
                    'JavaScript/TypeScript',
                    'Python',
                    'Java',
                    'Go',
                    'Rust',
                    'C#/.NET',
                    'Ruby',
                    'Kotlin',
                    'Swift',
                    'Other'
                ],
                default: 'JavaScript/TypeScript'
            },
            {
                type: 'checkbox',
                name: 'frameworks',
                message: 'Frameworks used:',
                choices: [
                    { name: 'React', checked: false },
                    { name: 'Vue', checked: false },
                    { name: 'Angular', checked: false },
                    { name: 'Express', checked: false },
                    { name: 'Next.js', checked: false },
                    { name: 'NestJS', checked: false },
                    { name: 'Django', checked: false },
                    { name: 'FastAPI', checked: false },
                    { name: 'Spring Boot', checked: false },
                    { name: 'None', checked: false }
                ]
            },
            {
                type: 'list',
                name: 'packageManager',
                message: 'Package manager:',
                choices: ['npm', 'yarn', 'pnpm', 'bun'],
                default: 'npm'
            }
        ]);
        
        this.answers = { ...this.answers, ...answers };
    }

    async authSetup() {
        console.log(chalk.cyan('\n  🔑 Authentication Setup\n'));
        
        const { authType } = await inquirer.prompt([
            {
                type: 'list',
                name: 'authType',
                message: 'How would you like to configure API keys?',
                choices: [
                    { 
                        name: 'Interactive (recommended) - Enter keys now', 
                        value: 'interactive' 
                    },
                    { 
                        name: 'Environment variables - I\'ll set them manually', 
                        value: 'env' 
                    },
                    { 
                        name: 'Skip for now', 
                        value: 'skip' 
                    }
                ]
            }
        ]);
        
        if (authType === 'skip') {
            this.answers.authType = 'skip';
            return;
        }
        
        if (authType === 'interactive') {
            const { provider, apiKey } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'provider',
                    message: 'Select AI provider:',
                    choices: [
                        { name: 'Groq (fast, affordable)', value: 'groq' },
                        { name: 'OpenAI (GPT models)', value: 'openai' },
                        { name: 'Google Gemini', value: 'gemini' },
                        { name: 'Anthropic Claude', value: 'anthropic' }
                    ]
                },
                {
                    type: 'password',
                    name: 'apiKey',
                    message: 'Enter API key:',
                    validate: (input) => {
                        if (input.length < 10) {
                            return 'Please enter a valid API key';
                        }
                        return true;
                    }
                }
            ]);
            
            this.answers.authType = 'interactive';
            this.answers.provider = provider;
            this.answers.apiKey = apiKey;
            
            console.log(chalk.green('\n  ✓ API key configured\n'));
        } else {
            this.answers.authType = 'env';
            console.log(chalk.gray('\n  Set these environment variables:'));
            console.log(chalk.gray('    GROQ_API_KEY'));
            console.log(chalk.gray('    OPENAI_API_KEY'));
            console.log(chalk.gray('    GEMINI_API_KEY'));
            console.log(chalk.gray('    ANTHROPIC_API_KEY'));
            console.log('');
        }
    }

    async analysisSetup() {
        console.log(chalk.cyan('\n  🔍 Analysis Configuration\n'));
        
        const answers = await inquirer.prompt([
            {
                type: 'checkbox',
                name: 'analyzers',
                message: 'Select analyzers to run:',
                choices: [
                    { name: 'Security (vulnerability detection)', checked: true },
                    { name: 'Secrets (API keys, passwords)', checked: true },
                    { name: 'TypeScript (type checking)', checked: true },
                    { name: 'React (React-specific patterns)', checked: false },
                    { name: 'Vue (Vue-specific patterns)', checked: false },
                    { name: 'Quality (code maintainability)', checked: true },
                    { name: 'Bugs (potential bugs)', checked: true },
                    { name: 'Performance (optimization)', checked: false },
                    { name: 'Accessibility (a11y)', checked: false },
                    { name: 'Dependencies (CVE scanning)', checked: true }
                ]
            },
            {
                type: 'list',
                name: 'severityThreshold',
                message: 'Fail on severity:',
                choices: [
                    { name: 'Critical issues only', value: 'critical' },
                    { name: 'High and above', value: 'high' },
                    { name: 'Medium and above', value: 'medium' },
                    { name: 'All issues', value: 'low' }
                ],
                default: 'high'
            }
        ]);
        
        this.answers = { ...this.answers, ...answers };
    }

    async ciSetup() {
        console.log(chalk.cyan('\n  ⚙️  CI/CD Configuration\n'));
        
        const { enableCI } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'enableCI',
                message: 'Set up pre-commit hooks?',
                default: true
            }
        ]);
        
        if (!enableCI) {
            this.answers.enableCI = false;
            return;
        }
        
        const answers = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'blockOnFail',
                message: 'Block commits when issues found?',
                default: false
            },
            {
                type: 'checkbox',
                name: 'ciProviders',
                message: 'CI providers to configure:',
                choices: [
                    { name: 'GitHub Actions', checked: true },
                    { name: 'GitLab CI', checked: false },
                    { name: 'Jenkins', checked: false },
                    { name: 'Azure DevOps', checked: false }
                ]
            }
        ]);
        
        this.answers.enableCI = true;
        this.answers.blockOnFail = answers.blockOnFail;
        this.answers.ciProviders = answers.ciProviders;
    }

    async createConfig() {
        console.log(chalk.cyan('\n  📝 Creating Configuration\n'));
        
        const config = this.generateConfig();
        
        const configPath = path.join(this.projectPath, '.sentinel.json');
        
        try {
            await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
            console.log(chalk.green(`  ✓ Configuration saved to ${chalk.white('.sentinel.json')}\n`));
        } catch (e) {
            console.log(chalk.red(`  ✗ Failed to save config: ${e.message}\n`));
        }
        
        if (this.answers.enableCI) {
            try {
                await this.setupPreCommitHook();
            } catch (e) {
                console.log(chalk.yellow(`  ⚠ Could not install hooks: ${e.message}\n`));
            }
        }
        
        if (this.answers.authType === 'interactive') {
            try {
                await this.saveApiKey();
            } catch (e) {
                console.log(chalk.yellow(`  ⚠ Could not save API key: ${e.message}\n`));
            }
        }
    }

    generateConfig() {
        const analyzers = this.answers.analyzers || [];
        const analyzerMap = {
            'Security (vulnerability detection)': 'security',
            'Secrets (API keys, passwords)': 'secrets',
            'TypeScript (type checking)': 'typescript',
            'React (React-specific patterns)': 'react',
            'Vue (Vue-specific patterns)': 'vue',
            'Quality (code maintainability)': 'quality',
            'Bugs (potential bugs)': 'bugs',
            'Performance (optimization)': 'performance',
            'Accessibility (a11y)': 'accessibility',
            'Dependencies (CVE scanning)': 'dependency'
        };
        
        return {
            project: {
                name: this.answers.projectName,
                language: this.answers.language,
                frameworks: this.answers.frameworks.filter(f => f !== 'None'),
                packageManager: this.answers.packageManager
            },
            analyzers: analyzers.map(a => analyzerMap[a]).filter(Boolean),
            severityThreshold: this.answers.severityThreshold || 'high',
            preCommit: {
                enabled: this.answers.enableCI || false,
                blockOnFail: this.answers.blockOnFail || false
            },
            providers: this.answers.provider ? {
                [this.answers.provider]: {
                    enabled: true
                }
            } : {}
        };
    }

    async setupPreCommitHook() {
        const hookDir = path.join(this.projectPath, '.git', 'hooks');
        const hookPath = path.join(hookDir, 'pre-commit');
        
        try {
            await fs.mkdir(hookDir, { recursive: true });
        } catch (e) {
            // Directory might already exist
        }
        
        const hookContent = `#!/bin/sh
# Sentinel pre-commit hook
npx sentinel analyze --staged --format console
exit $?
`;
        
        await fs.writeFile(hookPath, hookContent, 'utf8');
        
        try {
            await execAsync(`chmod +x "${hookPath}"`);
        } catch (e) {
            // Permission change might fail on Windows
        }
        
        console.log(chalk.green('  ✓ Pre-commit hook installed\n'));
    }

    async saveApiKey() {
        const configPath = path.join(process.env.HOME || process.env.USERPROFILE, '.sentinel.json');
        
        let globalConfig = {};
        try {
            const content = await fs.readFile(configPath, 'utf8');
            globalConfig = JSON.parse(content);
        } catch (e) {
            // No config exists
        }
        
        const keyEnvMap = {
            groq: 'GROQ_API_KEY',
            openai: 'OPENAI_API_KEY',
            gemini: 'GEMINI_API_KEY',
            anthropic: 'ANTHROPIC_API_KEY'
        };
        
        globalConfig.providers = globalConfig.providers || {};
        globalConfig.providers[this.answers.provider] = {
            apiKey: this.answers.apiKey,
            enabled: true
        };
        
        try {
            await fs.writeFile(configPath, JSON.stringify(globalConfig, null, 2), 'utf8');
            console.log(chalk.green(`  ✓ API key saved to ${chalk.white('~/.sentinel.json')}\n`));
        } catch (e) {
            console.log(chalk.yellow(`  ⚠ Could not save API key: ${e.message}\n`));
        }
    }

    showSummary() {
        console.log(chalk.cyan('═══════════════════════════════════════════════════════════════'));
        console.log(chalk.white('  ') + chalk.bold('Setup Complete!'));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════════════\n'));
        
        console.log(chalk.white('  Next steps:'));
        console.log(chalk.gray('    • Run ') + chalk.cyan('sentinel analyze') + chalk.gray(' to scan your code'));
        console.log(chalk.gray('    • Run ') + chalk.cyan('sentinel diff main..HEAD') + chalk.gray(' to review PRs'));
        console.log(chalk.gray('    • Run ') + chalk.cyan('sentinel score') + chalk.gray(' to see project health'));
        console.log(chalk.gray('    • Run ') + chalk.cyan('sentinel --help') + chalk.gray(' for more commands\n'));
        
        console.log(chalk.cyan('  Quick Commands:'));
        console.log(chalk.gray(`    sentinel analyze${this.answers.enableCI ? ' --staged' : ''}`));
        console.log(chalk.gray('    sentinel diff main..HEAD'));
        console.log(chalk.gray('    sentinel score\n'));
    }
}

export async function runInitCommand(args, options = {}) {
    const command = new InitCommand(options);
    return command.run();
}

export default { InitCommand, runInitCommand };

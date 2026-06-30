import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';
import inquirer from 'inquirer';

export class EnvManager {
  constructor(options = {}) {
    this.projectPath = options.projectPath || process.cwd();
    this.envFile = path.join(this.projectPath, '.env.sentinel');
    this.configPath = path.join(this.projectPath, '.sentinel.json');
  }

  async run(args) {
    const action = args[0] || 'list';

    switch (action) {
    case 'list':
    case 'ls':
      return this.listEnvVars();
    case 'set':
      return this.setEnvVar(args[1], args[2]);
    case 'get':
      return this.getEnvVar(args[1]);
    case 'remove':
    case 'rm':
      return this.removeEnvVar(args[1]);
    case 'init':
      return this.initEnvFile();
    case 'template':
      return this.generateTemplate();
    case 'validate':
      return this.validateEnvVars();
    default:
      this.showHelp();
    }
  }

  async listEnvVars() {
    console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════'));
    console.log(chalk.cyan('  ') + chalk.white('Sentinel Environment Variables'));
    console.log(chalk.cyan('═══════════════════════════════════════════════════════════════\n'));

    const sentinelVars = this.getSentinelVars();
    const projectVars = await this.getProjectEnvVars();

    console.log(chalk.gray('  Sentinel Configuration:'));
    console.log(chalk.gray('  ───────────────────────────────────────────────────────────\n'));

    const varGroups = {
      'AI Providers': [
        'OPENAI_API_KEY',
        'ANTHROPIC_API_KEY',
        'GEMINI_API_KEY',
        'GROQ_API_KEY',
        'OPENROUTER_API_KEY',
      ],
      GitHub: ['GITHUB_TOKEN', 'GITHUB_REPOSITORY', 'GITHUB_SHA'],
      Notifications: ['SLACK_WEBHOOK_URL', 'DISCORD_WEBHOOK_URL'],
      Analysis: ['SENTINEL_ANALYZERS', 'SENTINEL_THRESHOLD', 'SENTINEL_CACHE'],
    };

    for (const [group, vars] of Object.entries(varGroups)) {
      console.log(chalk.white(`  ${group}:`));
      for (const v of vars) {
        const value = sentinelVars[v] || process.env[v] || '';
        if (value) {
          const masked = value.length > 8 ? `${value.slice(0, 4)}...${value.slice(-4)}` : '******';
          console.log(chalk.gray(`    ${v.padEnd(25)} ${chalk.green(masked)}`));
        } else {
          console.log(chalk.gray(`    ${v.padEnd(25)} ${chalk.red('not set')}`));
        }
      }
      console.log('');
    }

    console.log(chalk.gray('  Project Environment:'));
    console.log(chalk.gray('  ───────────────────────────────────────────────────────────\n'));

    if (Object.keys(projectVars).length > 0) {
      for (const [key, value] of Object.entries(projectVars)) {
        const masked = value.length > 8 ? `${value.slice(0, 4)}...${value.slice(-4)}` : '******';
        console.log(chalk.white(`    ${key.padEnd(25)} ${chalk.cyan(masked)}`));
      }
    } else {
      console.log(chalk.gray('    No .env.sentinel file found\n'));
    }

    console.log(chalk.gray('  ───────────────────────────────────────────────────────────\n'));
    console.log(chalk.gray('  Quick commands:'));
    console.log(chalk.gray('    sentinel env set <KEY> <VALUE>'));
    console.log(chalk.gray('    sentinel env get <KEY>'));
    console.log(chalk.gray('    sentinel env init\n'));
  }

  getSentinelVars() {
    const vars = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key.includes('API_KEY') || key.includes('TOKEN') || key.includes('SECRET')) {
        vars[key] = value;
      }
    }
    return vars;
  }

  async getProjectEnvVars() {
    try {
      const content = await fs.readFile(this.envFile, 'utf8');
      const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
      const vars = {};

      for (const line of lines) {
        const [key, ...valueParts] = line.split('=');
        if (key) {
          vars[key.trim()] = valueParts.join('=').trim();
        }
      }

      return vars;
    } catch (e) {
      return {};
    }
  }

  async setEnvVar(key, value) {
    if (!key) {
      console.log(chalk.red('  Error: Variable name required'));
      console.log(chalk.gray('  Usage: sentinel env set <KEY> <VALUE>'));
      return;
    }

    if (!value) {
      const { value: inputValue } = await inquirer.prompt([
        {
          type: 'password',
          name: 'value',
          message: `Enter value for ${key}:`,
        },
      ]);
      value = inputValue;
    }

    let content = '';
    try {
      content = await fs.readFile(this.envFile, 'utf8');
    } catch (e) {
      content = '# Sentinel Environment Variables\n';
    }

    const lines = content.split('\n');
    const existingIdx = lines.findIndex(l => l.startsWith(`${key}=`));

    if (existingIdx >= 0) {
      lines[existingIdx] = `${key}=${value}`;
    } else {
      lines.push(`${key}=${value}`);
    }

    await fs.writeFile(this.envFile, lines.join('\n'), 'utf8');
    console.log(chalk.green(`  ✓ Set ${key}`));
  }

  async getEnvVar(key) {
    if (!key) {
      console.log(chalk.red('  Error: Variable name required'));
      console.log(chalk.gray('  Usage: sentinel env get <KEY>'));
      return;
    }

    const value = process.env[key];

    if (value) {
      console.log(chalk.white(`  ${key}=${chalk.cyan(value)}`));
    } else {
      console.log(chalk.yellow(`  ${key} is not set`));
    }
  }

  async removeEnvVar(key) {
    if (!key) {
      console.log(chalk.red('  Error: Variable name required'));
      console.log(chalk.gray('  Usage: sentinel env remove <KEY>'));
      return;
    }

    try {
      const content = await fs.readFile(this.envFile, 'utf8');
      const lines = content.split('\n').filter(l => !l.startsWith(`${key}=`));

      await fs.writeFile(this.envFile, lines.join('\n'), 'utf8');
      console.log(chalk.green(`  ✓ Removed ${key}`));
    } catch (e) {
      console.log(chalk.yellow(`  ${key} not found in .env.sentinel`));
    }
  }

  async initEnvFile() {
    const template = `# Sentinel Environment Variables
# Add your API keys and configuration here

# AI Providers (choose at least one)
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
# GEMINI_API_KEY=AI...
# GROQ_API_KEY=gsk_...

# GitHub Integration (optional)
# GITHUB_TOKEN=ghp_...

# Notifications (optional)
# SLACK_WEBHOOK_URL=https://hooks.slack.com/...
# DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# Analysis Options
# SENTINEL_ANALYZERS=security,quality,bugs,dependency
# SENTINEL_THRESHOLD=high
# SENTINEL_CACHE=true
`;

    await fs.writeFile(this.envFile, template, 'utf8');
    console.log(chalk.green('  ✓ Created .env.sentinel'));
    console.log(chalk.gray('  Edit the file and add your API keys'));
  }

  async generateTemplate() {
    const templates = {
      openai: 'OPENAI_API_KEY=sk-...\nSENTINEL_PROVIDER=openai\nSENTINEL_MODEL=gpt-4',
      groq: 'GROQ_API_KEY=gsk_...\nSENTINEL_PROVIDER=groq\nSENTINEL_MODEL=mixtral-8x7b-32768',
      github: 'GITHUB_TOKEN=ghp_...\nGITHUB_REPOSITORY=owner/repo',
      slack:
        'SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...\nSENTINEL_SLACK_CHANNEL=#security',
      ci: 'GITHUB_TOKEN=ghp_...\nSENTINEL_FAIL_ON=high\nSENTINEL_FORMAT=json',
    };

    console.log(chalk.cyan('\n  Available Templates:\n'));

    for (const [name, template] of Object.entries(templates)) {
      console.log(chalk.white(`    ${name.padEnd(12)} ${chalk.gray(template.split('\n')[0])}`));
    }

    console.log(chalk.gray('\n  Usage: sentinel env template <name> > .env.sentinel\n'));
  }

  async validateEnvVars() {
    console.log(chalk.cyan('\n  Validating Environment Variables...\n'));

    const required = {
      'AI Analysis': ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY'],
    };

    let hasProvider = false;

    for (const [group, vars] of Object.entries(required)) {
      console.log(chalk.white(`  ${group}:`));

      for (const v of vars) {
        if (process.env[v]) {
          console.log(chalk.green(`    ✓ ${v}`));
          hasProvider = true;
        } else {
          console.log(chalk.red(`    ✗ ${v}`));
        }
      }
      console.log('');
    }

    if (!hasProvider) {
      console.log(chalk.yellow('  ⚠ No AI provider configured. Run:'));
      console.log(chalk.gray('    sentinel env init'));
      console.log(chalk.gray('    Use /auth in the Sentinel TUI to set API keys'));
    } else {
      console.log(chalk.green('  ✓ Environment is ready!\n'));
    }
  }

  showHelp() {
    console.log(chalk.cyan('\n  Sentinel Environment Commands:\n'));
    console.log(chalk.gray('    list                  List all environment variables'));
    console.log(chalk.gray('    set <KEY> <VALUE>    Set environment variable'));
    console.log(chalk.gray('    get <KEY>            Get environment variable value'));
    console.log(chalk.gray('    remove <KEY>         Remove environment variable'));
    console.log(chalk.gray('    init                  Create .env.sentinel file'));
    console.log(chalk.gray('    template <name>      Show template'));
    console.log(chalk.gray('    validate             Validate environment\n'));
  }
}

export async function runEnvCommand(args, options = {}) {
  const manager = new EnvManager(options);
  return manager.run(args);
}

export default { EnvManager, runEnvCommand };

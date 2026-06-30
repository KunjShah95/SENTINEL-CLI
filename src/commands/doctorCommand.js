import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class DoctorCommand {
  constructor(options = {}) {
    this.projectPath = options.projectPath || process.cwd();
    this.checks = [];
  }

  async run(args) {
    const verbose = args.includes('--verbose') || args.includes('-v');

    console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════'));
    console.log(chalk.cyan('  ') + chalk.white('Sentinel Doctor'));
    console.log(chalk.cyan('═══════════════════════════════════════════════════════════════\n'));

    console.log(chalk.gray('  Running health checks...\n'));

    await this.runChecks(verbose);

    this.displayResults();

    return this.getSummary();
  }

  async runChecks(verbose) {
    this.checks = [
      await this.checkNodeVersion(),
      await this.checkNpmVersion(),
      await this.checkSentinelInstallation(),
      await this.checkGitRepository(),
      await this.checkConfiguration(),
      await this.checkApiKeys(),
      await this.checkDependencies(),
      await this.checkPreCommitHooks(),
      await this.checkDiskSpace(),
    ];

    if (verbose) {
      console.log(chalk.gray('\n  Detailed Output:\n'));
      for (const check of this.checks) {
        if (check.details) {
          console.log(chalk.white(`  ${check.name}:`));
          console.log(chalk.gray(`    ${check.details}`));
        }
      }
    }
  }

  async checkNodeVersion() {
    const version = process.version;
    const major = parseInt(version.slice(1).split('.')[0]);

    return {
      name: 'Node.js',
      status: major >= 18 ? 'pass' : 'warn',
      message: `v${version}`,
      details: major >= 18 ? 'OK - Node 18+ required' : 'Warning - Node 18+ recommended',
    };
  }

  async checkNpmVersion() {
    try {
      const { stdout } = await execAsync('npm --version');
      const version = stdout.trim();

      return {
        name: 'npm',
        status: 'pass',
        message: `v${version}`,
        details: 'Package manager ready',
      };
    } catch (e) {
      return {
        name: 'npm',
        status: 'fail',
        message: 'Not found',
        details: 'npm is required for package management',
      };
    }
  }

  async checkSentinelInstallation() {
    try {
      const packageJsonPath = path.join(this.projectPath, 'package.json');
      const pkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

      if (pkg.dependencies?.['sentinel-cli'] || pkg.devDependencies?.['sentinel-cli']) {
        return {
          name: 'Sentinel CLI',
          status: 'pass',
          message: 'Installed',
          details: 'Sentinel CLI is in dependencies',
        };
      }

      return {
        name: 'Sentinel CLI',
        status: 'warn',
        message: 'Not in deps',
        details: 'Run "npm install sentinel-cli" for local usage',
      };
    } catch (e) {
      return {
        name: 'Sentinel CLI',
        status: 'warn',
        message: 'No package.json',
        details: 'Initialize with "npm init" first',
      };
    }
  }

  async checkGitRepository() {
    try {
      const gitDir = path.join(this.projectPath, '.git');
      await fs.access(gitDir);

      const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: this.projectPath,
      });
      const branch = stdout.trim();

      return {
        name: 'Git Repository',
        status: 'pass',
        message: branch,
        details: 'Git is initialized',
      };
    } catch (e) {
      return {
        name: 'Git Repository',
        status: 'fail',
        message: 'Not initialized',
        details: 'Run "git init" to enable version control features',
      };
    }
  }

  async checkConfiguration() {
    const configFiles = ['.sentinel.json', '.sentinelrc.json', 'sentinel.config.js'];
    let found = null;

    for (const file of configFiles) {
      try {
        const configPath = path.join(this.projectPath, file);
        await fs.access(configPath);
        found = file;
        break;
      } catch (e) {}
    }

    if (found) {
      return {
        name: 'Configuration',
        status: 'pass',
        message: found,
        details: 'Configuration file found',
      };
    }

    return {
      name: 'Configuration',
      status: 'warn',
      message: 'Not found',
      details: 'Run "sentinel init" to create configuration',
    };
  }

  async checkApiKeys() {
    const keys = ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY'];
    const configured = keys.filter(k => process.env[k]);

    if (configured.length > 0) {
      return {
        name: 'API Keys',
        status: 'pass',
        message: `${configured.length} configured`,
        details: `Configured: ${configured.join(', ')}`,
      };
    }

    return {
      name: 'API Keys',
      status: 'fail',
      message: 'None configured',
      details: 'Use /auth in the Sentinel TUI to configure API keys',
    };
  }

  async checkDependencies() {
    try {
      const nodeModules = path.join(this.projectPath, 'node_modules');
      await fs.access(nodeModules);

      await execAsync('npm ls --depth=0 2>/dev/null | head -20', {
        cwd: this.projectPath,
      });
      return {
        name: 'Dependencies',
        status: 'pass',
        message: 'Installed',
        details: 'node_modules ready',
      };
    } catch (e) {
      return {
        name: 'Dependencies',
        status: 'fail',
        message: 'Not installed',
        details: 'Run "npm install" to install dependencies',
      };
    }
  }

  async checkPreCommitHooks() {
    try {
      const hookPath = path.join(this.projectPath, '.git', 'hooks', 'pre-commit');
      const content = await fs.readFile(hookPath, 'utf8');

      if (content.includes('sentinel')) {
        return {
          name: 'Pre-commit Hook',
          status: 'pass',
          message: 'Installed',
          details: 'Sentinel will run before commits',
        };
      }

      return {
        name: 'Pre-commit Hook',
        status: 'warn',
        message: 'Not configured',
        details: 'Run "sentinel install-hooks" to enable',
      };
    } catch (e) {
      return {
        name: 'Pre-commit Hook',
        status: 'warn',
        message: 'No git hooks',
        details: 'Initialize git first with "git init"',
      };
    }
  }

  async checkDiskSpace() {
    try {
      const { stdout } = await execAsync('df -h . | tail -1');
      const parts = stdout.trim().split(/\s+/);
      const available = parts[3];

      const isLow = available.endsWith('G') && parseFloat(available) < 1;

      return {
        name: 'Disk Space',
        status: isLow ? 'fail' : 'pass',
        message: `${available} available`,
        details: isLow ? 'Low disk space - may affect performance' : 'Sufficient space',
      };
    } catch (e) {
      return {
        name: 'Disk Space',
        status: 'warn',
        message: 'Unknown',
        details: 'Could not check disk space',
      };
    }
  }

  displayResults() {
    console.log(chalk.gray('  Check                          Status'));
    console.log(chalk.gray('  ──────────────────────────────────────────────────────'));

    for (const check of this.checks) {
      const statusIcon =
        check.status === 'pass'
          ? chalk.green('✓')
          : check.status === 'warn'
            ? chalk.yellow('⚠')
            : chalk.red('✗');

      console.log(
        chalk.white(`  ${check.name.padEnd(30)}`) + statusIcon + ' ' + chalk.gray(check.message)
      );
    }

    console.log(chalk.gray('  ──────────────────────────────────────────────────────\n'));
  }

  getSummary() {
    const passCount = this.checks.filter(c => c.status === 'pass').length;
    const warnCount = this.checks.filter(c => c.status === 'warn').length;
    const failCount = this.checks.filter(c => c.status === 'fail').length;

    if (failCount === 0 && warnCount === 0) {
      console.log(chalk.green('  ✅ All checks passed! Sentinel is ready to use.\n'));
    } else if (failCount === 0) {
      console.log(
        chalk.yellow(`  ⚠️  ${warnCount} warning(s) - Sentinel may have limited functionality.\n`)
      );
    } else {
      console.log(chalk.red(`  ❌ ${failCount} check(s) failed - Please fix the issues above.\n`));
    }

    return { passCount, warnCount, failCount };
  }
}

export async function runDoctorCommand(args, options = {}) {
  const command = new DoctorCommand(options);
  return command.run(args);
}

export default { DoctorCommand, runDoctorCommand };

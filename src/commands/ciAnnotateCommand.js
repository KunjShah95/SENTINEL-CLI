import chalk from 'chalk';
import { CodeReviewBot } from '../core/bot.js';
import Config from '../config/config.js';
import { glob } from 'glob';

export class CIAnnotateCommand {
  constructor(options = {}) {
    this.projectPath = options.projectPath || process.cwd();
    this.token = process.env.GITHUB_TOKEN;
  }

  async run(args) {
    const options = this.parseArgs(args);

    console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════'));
    console.log(chalk.cyan('  ') + chalk.white('Sentinel CI Annotations'));
    console.log(chalk.cyan('═══════════════════════════════════════════════════════════════\n'));

    if (!this.token && !options.dryRun) {
      console.log(chalk.yellow('  ⚠️  GITHUB_TOKEN not set'));
      console.log(chalk.gray('  Running in dry-run mode...\n'));
      options.dryRun = true;
    }

    console.log(chalk.gray('  Analyzing code...\n'));

    const issues = await this.analyzeCode(options);

    if (options.dryRun) {
      return this.displayAnnotations(issues, options);
    }

    return this.postAnnotations(issues, options);
  }

  parseArgs(args) {
    const options = {
      format: 'annotation',
      failOn: 'critical',
      dryRun: false,
      sha: process.env.GITHUB_SHA,
      owner: '',
      repo: ''
    };

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--dry-run') {
        options.dryRun = true;
      } else if (args[i] === '--fail-on') {
        options.failOn = args[i + 1];
        i++;
      } else if (args[i] === '--sha') {
        options.sha = args[i + 1];
        i++;
      }
    }

    if (process.env.GITHUB_REPOSITORY) {
      const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
      options.owner = owner;
      options.repo = repo;
    }

    return options;
  }

  async analyzeCode(_options) {
    const config = new Config();
    await config.load();

    const bot = new CodeReviewBot();
    await bot.initialize();

    const files = await glob('**/*.{js,ts,jsx,tsx,py,java,go,rs}', {
      cwd: this.projectPath,
      ignore: ['node_modules/**', 'dist/**', 'build/**']
    });

    const result = await bot.runAnalysis({
      files: files.slice(0, 100),
      analyzers: ['security', 'bugs', 'quality'],
      format: 'json',
      silent: true
    });

    return (result?.issues || []).slice(0, 50);
  }

  displayAnnotations(issues, options) {
    console.log(chalk.gray('  Annotations:\n'));

    for (const issue of issues) {
      const severity = issue.severity || 'warning';
      const icon = severity === 'critical' ? '🔴' : severity === 'high' ? '🟠' : severity === 'medium' ? '🟡' : '🔵';

      console.log(chalk.white(`  ${icon} ${severity.toUpperCase()} in ${issue.file}:${issue.line}`));
      console.log(chalk.gray(`    ${issue.message}\n`));
    }

    console.log(chalk.gray(`  Total: ${issues.length} annotation(s)\n`));

    if (options.dryRun) {
      console.log(chalk.yellow('  Run with GITHUB_TOKEN to post annotations to PR\n'));
    }
  }

  async postAnnotations(issues, options) {
    const severityMap = {
      critical: 'failure',
      high: 'failure',
      medium: 'warning',
      low: 'warning'
    };

    const failOnSeverity = options.failOn || 'critical';
    const failSeverities = ['critical', 'high', 'medium'];
    const failIndex = failSeverities.indexOf(failOnSeverity);

    let hasFailure = false;

    console.log(chalk.gray('  Posting annotations...\n'));

    for (const issue of issues) {
      const severity = issue.severity || 'low';
      const conclusion = severityMap[severity] || 'warning';

      const annotation = {
        path: issue.file,
        start_line: issue.line,
        end_line: issue.line,
        annotation_level: conclusion,
        message: `[${severity.toUpperCase()}] ${issue.message}`,
        title: issue.analyzer || 'Sentinel'
      };

      if (failSeverities.indexOf(severity) <= failIndex) {
        hasFailure = true;
      }

      if (!options.dryRun) {
        try {
          await this.createCheckRun(annotation, options, conclusion);
        } catch (e) {
          console.log(chalk.yellow(`  ⚠️  Failed to annotate: ${e.message}`));
        }
      }
    }

    if (!options.dryRun) {
      console.log(chalk.green(`  ✓ Posted ${issues.length} annotation(s)\n`));
    }

    if (hasFailure) {
      console.log(chalk.red('  ❌ Found issues above fail-on threshold\n'));
      process.exit(1);
    }

    console.log(chalk.green('  ✅ All checks passed\n'));
  }

  async createCheckRun(annotation, options, conclusion) {
    const { owner, repo, sha } = options;

    if (!owner || !repo || !sha) {
      console.log(chalk.yellow('  ⚠️  Missing GITHUB_REPOSITORY or GITHUB_SHA'));
      return;
    }

    const endpoint = `https://api.github.com/repos/${owner}/${repo}/check-runs`;

    const body = JSON.stringify({
      name: 'Sentinel',
      status: 'completed',
      conclusion: conclusion,
      output: {
        title: 'Sentinel Analysis',
        summary: 'Security and quality analysis results'
      },
      annotations: [annotation]
    });

    return new Promise((resolve, reject) => {
      const req = require('https').request(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}

export async function runCIAnnotateCommand(args, options = {}) {
  const command = new CIAnnotateCommand(options);
  return command.run(args);
}

export default { CIAnnotateCommand, runCIAnnotateCommand };

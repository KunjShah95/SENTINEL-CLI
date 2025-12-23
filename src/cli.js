#!/usr/bin/env node

/* eslint-disable no-console */

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { promises as fs } from 'fs';
import http from 'http';
import sirv from 'sirv';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Removed static imports for robustness
import { CodeReviewBot } from './bot.js';
import runSentinelConsole from './cli/sentinelConsole.js';
import Config from './config/config.js';

const program = new Command();

const pickGradient = (gradientLib, name = 'aqua') => {
  const lib = gradientLib || null;
  if (!lib) return null;
  const key = (name || '').toLowerCase();
  switch (key) {
    case 'fire':
      return lib(['#ff7b00', '#ff0058']);
    case 'rainbow':
      return lib(['red', 'yellow', 'green', 'cyan', 'blue', 'magenta']);
    case 'mono':
      return lib(['#7d8ca3', '#c7d2e5']);
    case 'aurora':
      return lib(['#4285F4', '#9B72CB', '#D96570']);
    case 'aqua':
    default:
      return lib(['#00d4ff', '#0066ff']);
  }
};

const padCenter = (lines, width) => {
  if (!width) return lines;
  return lines.map(line => {
    const pad = Math.max(0, Math.floor((width - line.length) / 2));
    return ' '.repeat(pad) + line;
  });
};

const buildBannerArt = (text, font, figletLib) => {
  if (!figletLib) return text;
  try {
    return figletLib.textSync(text, { horizontalLayout: 'full', font });
  } catch (_err) {
    return text;
  }
};

const displayBanner = async (options = {}) => {
  console.log('');
  const {
    bannerMessage = 'SENTINEL',
    bannerFont = 'Standard',
    bannerGradient = 'aqua',
    bannerWidth,
    bannerColor = true,
  } = options;

  let figletLib = null;
  let gradientLib = null;
  try {
    const figletMod = await import('figlet');
    figletLib = figletMod.default || figletMod;
  } catch (_err) {
    figletLib = null;
  }
  try {
    const gradientMod = await import('gradient-string');
    gradientLib = gradientMod.default || gradientMod;
  } catch (_err) {
    gradientLib = null;
  }

  const art = buildBannerArt(bannerMessage, bannerFont, figletLib);
  const lines = padCenter(String(art).split('\n'), bannerWidth || process.stdout.columns || 80);
  const gradient = bannerColor ? pickGradient(gradientLib, bannerGradient) : null;

  for (const line of lines) {
    if (gradient) console.log(gradient(line));
    else console.log(line);
  }

  const subtitle = `${bannerMessage} — AI-Powered Code Guardian · ${new Date().getFullYear()}`;
  const paddedSubtitle = padCenter([subtitle], bannerWidth || process.stdout.columns || 80)[0];
  if (bannerColor && chalk) console.log(chalk.gray.bold(paddedSubtitle));
  else console.log(paddedSubtitle);
  console.log('');
};

program
  .name('sentinel')
  .description(`Sentinel CLI – AI-Powered Code Guardian

  A comprehensive code review tool with:
  • Security scanning (XSS, SQL injection, secrets)
  • Code quality analysis
  • Dependency vulnerability checking
  • TypeScript & React-specific analysis
  • API security scanning
  • GitHub PR integration
  • Slack/Discord notifications
  • SARIF output for GitHub Security`)
  .version('1.3.0')
  .option('--banner-message <text>', 'Banner text', 'SENTINEL')
  .option('--banner-font <name>', 'Figlet font name', 'Standard')
  .option('--banner-gradient <name>', 'Banner gradient: aqua|fire|rainbow|aurora|mono', 'aqua')
  .option('--banner-width <number>', 'Banner width for centering', v => parseInt(v, 10))
  .option('--no-banner-color', 'Disable banner gradients');

let bannerShown = false;
const showBannerOnce = async (command) => {
  if (bannerShown) return;
  bannerShown = true; // Set immediately to prevent race conditions from bubbling hooks

  // Get options, handling both the root program and subcommands
  const programOpts = program.opts();
  const commandOpts = command ? command.opts() : {};
  const opts = { ...programOpts, ...commandOpts };

  // Only show banner for console output (default)
  if (!opts.format || opts.format === 'console') {
    await displayBanner({
      bannerMessage: opts.bannerMessage,
      bannerFont: opts.bannerFont,
      bannerGradient: opts.bannerGradient,
      bannerWidth: opts.bannerWidth,
      bannerColor: opts.bannerColor !== false,
    });
  }
};

program.hook('preAction', async (thisCommand) => {
  await showBannerOnce(thisCommand);
});

program
  .command('analyze [files...]')
  .description('Analyze code for issues')
  .option('-c, --commit <hash>', 'Analyze specific commit')
  .option('-b, --branch <name>', 'Analyze branch changes')
  .option('-s, --staged', 'Analyze staged changes only')
  .option('-f, --format <format>', 'Output format (console|json|html|markdown|sarif|junit)')
  .option('-o, --output <file>', 'Output file path')
  .option('--no-snippets', 'Disable code snippets in output')
  .option(
    '-a, --analyzers <list>',
    'Comma-separated list of analyzers to run (security,quality,bugs,performance,dependency,accessibility,typescript,react,api,secrets,docker,kubernetes,custom)',
    'security,quality,bugs,performance'
  )
  .option('--all-analyzers', 'Enable all available analyzers')
  .option('--save-history', 'Save analysis to trend history')
  .option('--silent', 'Suppress output (useful for scripting)')
  .action(async (files, options) => {
    try {
      // Handle analyzer selection
      if (options.allAnalyzers) {
        process.env.SENTINEL_ANALYZERS = 'security,quality,bugs,performance,dependency,accessibility,typescript,react,api,secrets,docker,kubernetes,custom';
      } else if (options.analyzers) {
        process.env.SENTINEL_ANALYZERS = options.analyzers;
      }

      const bot = new CodeReviewBot();
      await bot.initialize();
      const result = await bot.runAnalysis({ ...options, files });

      // Save to history if requested
      if (options.saveHistory && result.issues) {
        try {
          const { TrendTracker } = await import('./utils/analytics.js');
          const tracker = new TrendTracker();
          await tracker.save(result.issues);
          if (!options.silent) {
            console.log(chalk.gray('📊 Analysis saved to trend history'));
          }
        } catch (e) {
          // History save failed, not critical
        }
      }

      // Handle SARIF format
      if (options.format === 'sarif' && result.issues) {
        const { SarifGenerator } = await import('./output/sarifGenerator.js');
        const sarif = new SarifGenerator();
        const outputPath = options.output || 'sentinel-results.sarif';
        await sarif.saveToFile(result.issues, outputPath);
        if (!options.silent) {
          console.log(chalk.green('✓') + ` SARIF report saved to ${outputPath}`);
        }
      }
    } catch (error) {
      console.error(chalk.red('Analysis failed:'), error.message);
      process.exit(1);
    }
  });

program
  .command('agents ci [input]')
  .description('Run multi-agent analysis with CI defaults (SARIF/JUnit, gating)')
  .option('-f, --format <format>', 'Output format (console|json|markdown|html|sarif|junit)', 'console')
  .option('--sarif-out <file>', 'Write SARIF output to file', '.sentinel_sarif.json')
  .option('--junit-out <file>', 'Write JUnit XML to file', '.sentinel_junit.xml')
  .option('--fail-on <severity>', 'Fail when severity at or above threshold', 'high')
  .option('--metrics', 'Include metrics in output', true)
  .option('--run-tests', 'Run tests and extract coverage', true)
  .option('--typecheck', 'Run TypeScript typecheck if tsconfig.json exists', false)
  .option('--openapi <path>', 'Path to OpenAPI schema file')
  .option('--graphql <path>', 'Path to GraphQL schema file')
  .action(async (input, options) => {
    try {
      const orchestratorPath = path.resolve(process.cwd(), 'SENTINEL-CLI', 'agents', 'multi_agent_orchestrator.js');
      const baseArgs = [];
      if (input) baseArgs.push(input);
      // Produce SARIF
      const sarifArgs = [...baseArgs, '--sarif'];
      if (options.failOn) sarifArgs.push('--fail-on', options.failOn);
      if (options.metrics) sarifArgs.push('--metrics');
      if (options.runTests) sarifArgs.push('--run-tests');
      if (options.typecheck) sarifArgs.push('--typecheck');
      if (options.openapi) sarifArgs.push('--openapi', options.openapi);
      if (options.graphql) sarifArgs.push('--graphql', options.graphql);
      sarifArgs.push('--json');
      await showBannerOnce(program);
      const sarifRes = await new Promise((resolve) => {
        execFile('node', [orchestratorPath, ...sarifArgs], { cwd: process.cwd() }, (err, stdout, stderr) => {
          resolve({ code: err && err.code ? err.code : 0, stdout, stderr });
        });
      });
      if (sarifRes.stdout && options.sarifOut) {
        await fs.writeFile(path.resolve(process.cwd(), options.sarifOut), sarifRes.stdout, 'utf8');
        console.log(chalk.green(`Saved SARIF to ${options.sarifOut}`));
      }
      // Produce JUnit
      const junitArgs = [...baseArgs, '--format', 'junit'];
      if (options.failOn) junitArgs.push('--fail-on', options.failOn);
      if (options.metrics) junitArgs.push('--metrics');
      const junitRes = await new Promise((resolve) => {
        execFile('node', [orchestratorPath, ...junitArgs], { cwd: process.cwd() }, (err, stdout, stderr) => {
          resolve({ code: err && err.code ? err.code : 0, stdout, stderr });
        });
      });
      if (junitRes.stdout && options.junitOut) {
        await fs.writeFile(path.resolve(process.cwd(), options.junitOut), junitRes.stdout, 'utf8');
        console.log(chalk.green(`Saved JUnit to ${options.junitOut}`));
      }
      // Exit code: prefer SARIF run code
      if (sarifRes.code !== 0) {
        process.exit(sarifRes.code);
      }
    } catch (error) {
      console.error(chalk.red('Agents CI run failed:'), error.message);
      process.exit(1);
    }
  });

program
  .command('agents pr <pr-url> [input]')
  .description('Run multi-agent analysis and post markdown summary to a GitHub PR')
  .option('--fail-on <severity>', 'Fail when severity at or above threshold', 'high')
  .option('--openapi <path>', 'Path to OpenAPI schema file')
  .option('--graphql <path>', 'Path to GraphQL schema file')
  .action(async (prUrl, input, options) => {
    try {
      const orchestratorPath = path.resolve(process.cwd(), 'SENTINEL-CLI', 'agents', 'multi_agent_orchestrator.js');
      const args = [];
      if (input) args.push(input);
      args.push('--format', 'markdown');
      if (options.failOn) args.push('--fail-on', options.failOn);
      if (options.openapi) args.push('--openapi', options.openapi);
      if (options.graphql) args.push('--graphql', options.graphql);
      await showBannerOnce(program);
      const runRes = await new Promise((resolve) => {
        execFile('node', [orchestratorPath, ...args], { cwd: process.cwd() }, (err, stdout, stderr) => {
          resolve({ code: err && err.code ? err.code : 0, stdout, stderr });
        });
      });
      const markdown = runRes.stdout || '';
      if (!markdown.trim()) {
        console.log(chalk.yellow('No markdown output generated by agents.'));
        if (runRes.code !== 0) process.exit(runRes.code);
        return;
      }
      const { GitHubIntegration } = await import('./integrations/github.js');
      const gh = new GitHubIntegration();
      const { owner, repo, prNumber } = gh.parsePrUrl(prUrl);
      await gh.postComment(owner, repo, prNumber, markdown);
      console.log(chalk.green(`Posted agents markdown summary to ${prUrl}`));
      if (runRes.code !== 0) {
        process.exit(runRes.code);
      }
    } catch (error) {
      console.error(chalk.red('Agents PR run failed:'), error.message);
      process.exit(1);
    }
  });

program
  .command('agents [input]')
  .description('Run multi-agent analysis (Scanner → Fixer → Validator)')
  .option('-f, --format <format>', 'Output format (console|json|markdown|html|sarif|junit)', 'console')
  .option('--fail-on <severity>', 'Fail when severity at or above threshold')
  .option('--openapi <path>', 'Path to OpenAPI schema file')
  .option('--graphql <path>', 'Path to GraphQL schema file')
  .option('--metrics', 'Include metrics in output')
  .option('--run-tests', 'Run tests and extract coverage')
  .option('--typecheck', 'Run TypeScript typecheck if tsconfig.json exists')
  .option('--role <role>', 'Role-based verbosity (developer|reviewer|manager)', 'developer')
  .option('--audit-out <path>', 'Append audit summary to a JSONL file')
  .option('-o, --output <file>', 'Write output to file')
  .action(async (input, options) => {
    try {
      const orchestratorPath = path.resolve(process.cwd(), 'SENTINEL-CLI', 'agents', 'multi_agent_orchestrator.js');
      const args = [];
      if (input) args.push(input);
      if (options.format && options.format !== 'console') {
        args.push('--format', options.format);
      }
      if (options.failOn || options.failOn === '') {
        const val = options.failOn || '';
        args.push('--fail-on', val);
      }
      if (options.openapi) {
        args.push('--openapi', options.openapi);
      }
      if (options.graphql) {
        args.push('--graphql', options.graphql);
      }
      if (options.metrics) args.push('--metrics');
      if (options.runTests) args.push('--run-tests');
      if (options.typecheck) args.push('--typecheck');
      if (options.role) {
        args.push('--role', options.role);
      }
      if (options.auditOut) {
        args.push('--audit-out', options.auditOut);
      }
      const needsJson = options.format === 'json' || options.format === 'sarif';
      if (needsJson) args.push('--json');
      await showBannerOnce(program);
      const res = await new Promise((resolve) => {
        execFile('node', [orchestratorPath, ...args], { cwd: process.cwd() }, (err, stdout, stderr) => {
          resolve({ code: err && err.code ? err.code : 0, stdout, stderr });
        });
      });
      const outText = res.stdout || '';
      if (options.output) {
        const outPath = path.resolve(process.cwd(), options.output);
        await fs.writeFile(outPath, outText, 'utf8');
        console.log(chalk.green(`Saved output to ${outPath}`));
      } else {
        if (outText.trim().length) {
          console.log(outText);
        }
      }
      if (res.code !== 0) {
        process.exit(res.code);
      }
    } catch (error) {
      console.error(chalk.red('Agents run failed:'), error.message);
      process.exit(1);
    }
  });

// PRESET: Quick security audit
program
  .command('security-audit')
  .description('Run comprehensive security scan (security + api + secrets + dependency)')
  .option('-o, --output <file>', 'Output file path')
  .option('-f, --format <format>', 'Output format', 'console')
  .action(async options => {
    try {
      process.env.SENTINEL_ANALYZERS = 'security,api,secrets,dependency';
      const bot = new CodeReviewBot();
      await bot.initialize();

      console.log(chalk.bold.red('🔒 Running Security Audit...'));
      console.log(chalk.gray('Analyzers: security, api, secrets, dependency\n'));

      await bot.runAnalysis(options);
    } catch (error) {
      console.error(chalk.red('Security audit failed:'), error.message);
      process.exit(1);
    }
  });

// PRESET: Full scan
program
  .command('full-scan')
  .description('Run all available analyzers')
  .option('-o, --output <file>', 'Output file path')
  .option('-f, --format <format>', 'Output format', 'console')
  .option('--save-history', 'Save to trend history')
  .action(async options => {
    try {
      process.env.SENTINEL_ANALYZERS = 'security,quality,bugs,performance,dependency,accessibility,typescript,react,api,secrets,custom';
      const bot = new CodeReviewBot();
      await bot.initialize();

      console.log(chalk.bold.magenta('🚀 Running Full Scan...'));
      console.log(chalk.gray('All analyzers enabled\n'));

      const result = await bot.runAnalysis(options);

      if (options.saveHistory && result.issues) {
        const { TrendTracker } = await import('./utils/analytics.js');
        const tracker = new TrendTracker();
        await tracker.save(result.issues);
        console.log(chalk.gray('📊 Saved to trend history'));
      }
    } catch (error) {
      console.error(chalk.red('Full scan failed:'), error.message);
      process.exit(1);
    }
  });

// PRESET: Pre-commit check (fast, focused)
program
  .command('pre-commit')
  .description('Quick pre-commit check on staged files')
  .option('--block', 'Exit with error if critical issues found')
  .action(async options => {
    try {
      process.env.SENTINEL_ANALYZERS = 'security,bugs,secrets';
      const bot = new CodeReviewBot();
      await bot.initialize();

      console.log(chalk.bold.yellow('⚡ Pre-commit Check...'));

      const result = await bot.runAnalysis({ staged: true, silent: false });

      if (options.block && result.issues) {
        const criticalCount = result.issues.filter(
          i => i.severity === 'critical' || i.severity === 'high'
        ).length;

        if (criticalCount > 0) {
          console.log(chalk.red(`\n❌ Commit blocked: ${criticalCount} critical/high issues found`));
          process.exit(1);
        }
      }

      console.log(chalk.green('✅ Pre-commit check passed'));
    } catch (error) {
      console.error(chalk.red('Pre-commit check failed:'), error.message);
      process.exit(1);
    }
  });

// PRESET: Frontend analysis (React + TypeScript + Accessibility)
program
  .command('frontend')
  .description('Frontend-focused analysis (React + TypeScript + Accessibility)')
  .option('-o, --output <file>', 'Output file path')
  .option('-f, --format <format>', 'Output format', 'console')
  .action(async options => {
    try {
      process.env.SENTINEL_ANALYZERS = 'quality,bugs,typescript,react,accessibility';
      const bot = new CodeReviewBot();
      await bot.initialize();

      console.log(chalk.bold.blue('🎨 Frontend Analysis...'));
      console.log(chalk.gray('Analyzers: quality, bugs, typescript, react, accessibility\n'));

      await bot.runAnalysis(options);
    } catch (error) {
      console.error(chalk.red('Frontend analysis failed:'), error.message);
      process.exit(1);
    }
  });

// PRESET: Backend/API analysis
program
  .command('backend')
  .description('Backend-focused analysis (Security + API + Performance)')
  .option('-o, --output <file>', 'Output file path')
  .option('-f, --format <format>', 'Output format', 'console')
  .action(async options => {
    try {
      process.env.SENTINEL_ANALYZERS = 'security,bugs,performance,api,secrets,dependency';
      const bot = new CodeReviewBot();
      await bot.initialize();

      console.log(chalk.bold.green('🔧 Backend Analysis...'));
      console.log(chalk.gray('Analyzers: security, bugs, performance, api, secrets, dependency\n'));

      await bot.runAnalysis(options);
    } catch (error) {
      console.error(chalk.red('Backend analysis failed:'), error.message);
      process.exit(1);
    }
  });

// PRESET: Container security (Docker + Kubernetes)
program
  .command('container')
  .description('Container security analysis (Docker + Kubernetes)')
  .option('-o, --output <file>', 'Output file path')
  .option('-f, --format <format>', 'Output format', 'console')
  .action(async options => {
    try {
      process.env.SENTINEL_ANALYZERS = 'docker,kubernetes,security';
      const bot = new CodeReviewBot();
      await bot.initialize();

      console.log(chalk.bold.cyan('🐳 Container Security Analysis...'));
      console.log(chalk.gray('Analyzers: docker, kubernetes, security\n'));

      await bot.runAnalysis(options);
    } catch (error) {
      console.error(chalk.red('Container analysis failed:'), error.message);
      process.exit(1);
    }
  });

// NEW: Diff (staged) review
program
  .command('diff')
  .description('Review staged changes only (pre-commit friendly)')
  .option('-f, --format <format>', 'Output format (console|json|html|markdown|sarif|junit)', 'console')
  .option('-o, --output <file>', 'Output file path')
  .option('--no-snippets', 'Disable code snippets in output')
  .action(async options => {
    try {
      const bot = new CodeReviewBot();
      await bot.initialize();

      console.log(chalk.cyan('📄 Reviewing staged changes...'));

      const result = await bot.runAnalysis({ ...options, staged: true });

      // Optional SARIF handling when requested
      if (options.format === 'sarif' && result?.issues) {
        const { SarifGenerator } = await import('./output/sarifGenerator.js');
        const sarif = new SarifGenerator();
        const outputPath = options.output || 'sentinel-results.sarif';
        await sarif.saveToFile(result.issues, outputPath);
        console.log(chalk.green('✓') + ` SARIF report saved to ${outputPath}`);
      }
    } catch (error) {
      console.error(chalk.red('Diff review failed:'), error.message);
      process.exit(1);
    }
  });

// NEW: Full project review (alias of full-scan)
program
  .command('full')
  .description('Run all analyzers across the project')
  .option('-o, --output <file>', 'Output file path')
  .option('-f, --format <format>', 'Output format', 'console')
  .option('--save-history', 'Save to trend history')
  .action(async options => {
    try {
      process.env.SENTINEL_ANALYZERS = 'security,quality,bugs,performance,dependency,accessibility,typescript,react,api,secrets,custom';
      const bot = new CodeReviewBot();
      await bot.initialize();

      console.log(chalk.bold.magenta('🚀 Running Full Scan...'));
      console.log(chalk.gray('All analyzers enabled\n'));

      const result = await bot.runAnalysis(options);

      if (options.saveHistory && result.issues) {
        const { TrendTracker } = await import('./utils/analytics.js');
        const tracker = new TrendTracker();
        await tracker.save(result.issues);
        console.log(chalk.gray('📊 Saved to trend history'));
      }
    } catch (error) {
      console.error(chalk.red('Full scan failed:'), error.message);
      process.exit(1);
    }
  });

// NEW: CI-friendly runner
program
  .command('ci')
  .description('CI-friendly analysis (JSON output, fail on severity)')
  .option('-f, --format <format>', 'Output format (console|json|sarif|junit)', 'json')
  .option('-o, --output <file>', 'Output file path')
  .option('--fail-on <level>', 'Fail on severity level or above (critical|high|medium|low|info|none)', 'high')
  .option('--staged', 'Analyze staged changes only')
  .action(async options => {
    try {
      const severityRank = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
        info: 4,
        none: 5,
      };

      const failLevel = (options.failOn || 'high').toLowerCase();
      const failRank = severityRank[failLevel] ?? severityRank.high;

      const bot = new CodeReviewBot();
      await bot.initialize();

      console.log(chalk.cyan('🤖 Running CI analysis...'));

      const result = await bot.runAnalysis({ ...options, format: options.format, silent: true });
      const issues = result?.issues || [];

      // Build formatted output for CI consumers
      let reportOutput = result?.report;

      if (options.format === 'json') {
        reportOutput = JSON.stringify(issues, null, 2);
      } else if (options.format === 'sarif') {
        const { SarifGenerator } = await import('./output/sarifGenerator.js');
        const sarif = new SarifGenerator();
        reportOutput = JSON.stringify(sarif.generate(issues), null, 2);
      }

      // Write output if requested
      if (options.output && reportOutput) {
        await fs.writeFile(options.output, reportOutput, 'utf8');
        console.log(chalk.green('✓') + ` Report saved to ${options.output}`);
      } else if (reportOutput && options.format !== 'console') {
        console.log(reportOutput);
      }

      // Evaluate severity threshold
      let highestRank = severityRank.none;
      for (const issue of issues) {
        const rank = severityRank[issue.severity] ?? severityRank.none;
        highestRank = Math.min(highestRank, rank);
      }

      if (highestRank <= failRank) {
        const highest = Object.keys(severityRank).find(key => severityRank[key] === highestRank);
        console.log(chalk.red(`❌ CI check failed (highest severity: ${highest || 'unknown'})`));
        process.exit(1);
      }

      console.log(chalk.green('✓ CI check passed'));
    } catch (error) {
      console.error(chalk.red('CI analysis failed:'), error.message);
      process.exit(1);
    }
  });

// NEW: List available analyzers
program
  .command('list-analyzers')
  .alias('analyzers')
  .description('List all available analyzers and their descriptions')
  .action(() => {
    console.log('\n' + chalk.bold.cyan('🔍 Available Sentinel Analyzers'));
    console.log(chalk.gray('─'.repeat(60)) + '\n');

    const analyzers = [
      {
        name: 'security',
        description: 'Core security scanning (XSS, SQL injection, etc.)',
        default: true,
      },
      {
        name: 'quality',
        description: 'Code quality analysis (complexity, maintainability)',
        default: true,
      },
      {
        name: 'bugs',
        description: 'Common bug detection (null checks, logic errors)',
        default: true,
      },
      {
        name: 'performance',
        description: 'Performance issues (memory leaks, N+1 queries)',
        default: true,
      },
      {
        name: 'dependency',
        description: 'Vulnerable npm/pip/gem packages + npm audit',
        alias: 'deps',
        default: false,
      },
      {
        name: 'accessibility',
        description: 'WCAG compliance (alt text, ARIA, labels)',
        alias: 'a11y',
        default: false,
      },
      {
        name: 'typescript',
        description: 'TypeScript anti-patterns (any, @ts-ignore)',
        alias: 'ts',
        default: false,
      },
      {
        name: 'react',
        description: 'React/JSX issues (hooks rules, missing keys)',
        alias: 'jsx',
        default: false,
      },
      {
        name: 'api',
        description: 'API security (CORS, JWT, rate limiting)',
        alias: 'api-security',
        default: false,
      },
      {
        name: 'secrets',
        description: 'Exposed credentials and API keys',
        alias: 'env',
        default: false,
      },
      {
        name: 'custom',
        description: 'User-defined rules from .sentinelrules.yaml',
        default: false,
      },
    ];

    for (const analyzer of analyzers) {
      const badge = analyzer.default ? chalk.green('[DEFAULT]') : chalk.gray('[OPTIONAL]');
      const alias = analyzer.alias ? chalk.gray(` (alias: ${analyzer.alias})`) : '';
      console.log(`  ${chalk.bold.white(analyzer.name)}${alias}`);
      console.log(`    ${badge} ${analyzer.description}`);
      console.log('');
    }

    console.log(chalk.gray('─'.repeat(60)));
    console.log('\n' + chalk.bold('Usage Examples:'));
    console.log(chalk.gray('  sentinel analyze --analyzers security,typescript,react'));
    console.log(chalk.gray('  sentinel analyze --all-analyzers'));
    console.log(chalk.gray('  sentinel analyze -a security,api,secrets'));
    console.log('');
  });

program
  .command('setup')
  .description('Setup configuration wizard')
  .action(async () => {
    try {
      const bot = new CodeReviewBot();
      await bot.initialize();
      await bot.setupConfiguration();
    } catch (error) {
      console.error(chalk.red('Setup failed:'), error.message);
    }
  });

program
  .command('stats')
  .description('Show repository statistics')
  .action(async () => {
    try {
      const bot = new CodeReviewBot();
      await bot.initialize();
      const result = await bot.showStats();

      console.log('\n' + chalk.bold('📈 Repository Statistics'));
      console.log('─'.repeat(50));
      console.log(`${chalk.cyan('Current Branch:')} ${result.stats.currentBranch}`);
      console.log(`${chalk.cyan('Total Commits:')} ${result.stats.totalCommits}`);
      console.log(`${chalk.cyan('Files Modified:')} ${result.stats.modified}`);
      console.log(`${chalk.cyan('Files Staged:')} ${result.stats.staged}`);
      console.log(`${chalk.cyan('Untracked Files:')} ${result.stats.untracked}`);
      console.log(`${chalk.cyan('Issues Found:')} ${result.totalIssues}`);
      console.log(`${chalk.cyan('Analysis Time:')} Last run: ${new Date().toLocaleString()}`);
    } catch (error) {
      console.error(chalk.red('Stats failed:'), error.message);
    }
  });

program
  .command('install-hooks')
  .description('Install pre-commit hooks')
  .action(async () => {
    console.log(chalk.yellow('Installing pre-commit hooks...'));
    try {
      const hooksDir = path.resolve(process.cwd(), '.git', 'hooks');
      const hookPath = path.join(hooksDir, 'pre-commit');

      try {
        await fs.mkdir(hooksDir, { recursive: true });
      } catch (e) {
        // Ignore if exists
      }

      const hookScript = `#!/bin/sh
# Sentinel Pre-commit Hook
echo "🤖 Running Sentinel on staged files..."
# Ensure we map to the bin execution or npm run
# Assuming npm run review maps to "node src/cli.js analyze"
if npm run review -- --staged --format console; then
    echo "✅ Sentinel passed!"
    exit 0
else
    echo "❌ Sentinel found blocking issues! Please fix them before committing."
    exit 1
fi
`;

      await fs.writeFile(hookPath, hookScript, { mode: 0o700 });
      console.log(chalk.green('✓') + ' Pre-commit hook installed at ' + hookPath);
    } catch (error) {
      console.error(chalk.red('✗') + ' Failed to install hooks: ' + error.message);
    }
  });

const collectAssignments = (value, previous) => {
  previous.push(value);
  return previous;
};

const parseAssignment = (assignment, type = 'model') => {
  if (!assignment || !assignment.includes('=')) {
    throw new Error(`Invalid ${type} assignment "${assignment}". Use id=value.`);
  }
  const [id, rawValue] = assignment.split('=').map(part => part.trim());
  if (!id || !rawValue) {
    throw new Error(`Invalid ${type} assignment "${assignment}". Use id=value.`);
  }
  return { id, value: rawValue };
};

const parseIdList = value => {
  if (!value) return [];
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
};

program
  .command('models')
  .description('List and configure Sentinel AI providers')
  .option('--enable <ids>', 'Enable provider IDs (comma-separated)')
  .option('--disable <ids>', 'Disable provider IDs (comma-separated)')
  .option('--model <id=model>', 'Set provider model (repeatable)', collectAssignments, [])
  .option(
    '--weight <id=weight>',
    'Set provider inference weight (repeatable)',
    collectAssignments,
    []
  )
  .option('--env <id=ENV>', 'Set API key environment variable (repeatable)', collectAssignments, [])
  .option('--strip-secrets <ids>', 'Remove inline API keys for provider IDs (comma-separated)')
  .action(async options => {
    const config = new Config();
    await config.load();
    const aiConfig = config.get('ai') || {};
    const providers = Array.isArray(aiConfig.providers) ? [...aiConfig.providers] : [];

    if (providers.length === 0) {
      console.log(
        chalk.yellow('No AI providers configured yet. Run `node src/cli.js setup` first.')
      );
      return;
    }

    const getProvider = id => providers.find(provider => provider.id === id);
    let mutated = false;

    for (const id of parseIdList(options.enable)) {
      const provider = getProvider(id);
      if (provider) {
        if (!provider.enabled) {
          provider.enabled = true;
          mutated = true;
          console.log(chalk.green(`Enabled ${id}`));
        }
      } else {
        console.log(chalk.yellow(`Unknown provider id "${id}"`));
      }
    }

    for (const id of parseIdList(options.disable)) {
      const provider = getProvider(id);
      if (provider) {
        if (provider.enabled !== false) {
          provider.enabled = false;
          mutated = true;
          console.log(chalk.yellow(`Disabled ${id}`));
        }
      } else {
        console.log(chalk.yellow(`Unknown provider id "${id}"`));
      }
    }

    for (const assignment of options.model || []) {
      try {
        const { id, value } = parseAssignment(assignment, 'model');
        const provider = getProvider(id);
        if (!provider) {
          console.log(chalk.yellow(`Unknown provider id "${id}"`));
          continue;
        }
        if (provider.model !== value) {
          provider.model = value;
          mutated = true;
          console.log(chalk.green(`Set model for ${id} -> ${value}`));
        }
      } catch (error) {
        console.log(chalk.red(error.message));
      }
    }

    for (const assignment of options.weight || []) {
      try {
        const { id, value } = parseAssignment(assignment, 'weight');
        const provider = getProvider(id);
        if (!provider) {
          console.log(chalk.yellow(`Unknown provider id "${id}"`));
          continue;
        }
        const weight = Number(value);
        if (Number.isNaN(weight) || weight <= 0 || weight > 1) {
          console.log(
            chalk.red(`Invalid weight "${value}" for ${id}. Use a number between 0 and 1.`)
          );
          continue;
        }
        if (provider.weight !== weight) {
          provider.weight = weight;
          mutated = true;
          console.log(chalk.green(`Set weight for ${id} -> ${weight}`));
        }
      } catch (error) {
        console.log(chalk.red(error.message));
      }
    }

    for (const assignment of options.env || []) {
      try {
        const { id, value } = parseAssignment(assignment, 'environment variable');
        const provider = getProvider(id);
        if (!provider) {
          console.log(chalk.yellow(`Unknown provider id "${id}"`));
          continue;
        }
        if (provider.apiKeyEnv !== value) {
          provider.apiKeyEnv = value;
          if (provider.apiKey) {
            delete provider.apiKey;
            console.log(
              chalk.yellow(
                `Removed inline API key for ${id}. Environment variable will be used instead.`
              )
            );
          }
          mutated = true;
          console.log(chalk.green(`Set API key env for ${id} -> ${value}`));
        }
      } catch (error) {
        console.log(chalk.red(error.message));
      }
    }

    for (const id of parseIdList(options.stripSecrets)) {
      const provider = getProvider(id);
      if (!provider) {
        console.log(chalk.yellow(`Unknown provider id "${id}"`));
        continue;
      }
      if (provider.apiKey) {
        delete provider.apiKey;
        mutated = true;
        console.log(
          chalk.green(
            `Removed inline API key for ${id}. Ensure ${provider.apiKeyEnv || 'an appropriate env var'} is set at runtime.`
          )
        );
      }
    }

    if (mutated) {
      config.set('ai.providers', providers);
      await config.save();
      console.log(chalk.green('\nSaved Sentinel AI provider configuration.\n'));
    }

    const inlineKeyProviders = providers.filter(provider => provider.apiKey);
    if (inlineKeyProviders.length > 0) {
      console.log(
        chalk.red(
          '⚠️  Sentinel Tip: Some providers still have API keys stored in .codereviewrc.json.\n' +
          '    Consider running `sentinel models --env id=ENV_VAR --strip-secrets id` to rely on environment variables.'
        )
      );
    }

    console.log(chalk.bold('AI Providers'));
    console.log(chalk.gray('──────────────────────────────────────────'));
    providers.forEach(provider => {
      console.log(
        `${chalk.cyan(provider.id)} ${provider.enabled === false ? chalk.red('[disabled]') : chalk.green('[enabled]')}`
      );
      console.log(`  Provider  : ${provider.provider}`);
      console.log(`  Model     : ${provider.model || 'default'}`);
      console.log(`  Weight    : ${provider.weight ?? '0.33'}`);
      let keyStatus = 'not set';
      if (provider.apiKey) {
        keyStatus = chalk.bgRed.white(' inline key stored (discouraged) ');
      } else if (provider.apiKeyEnv) {
        keyStatus = `env ${provider.apiKeyEnv}`;
      }
      console.log(`  API Key   : ${keyStatus}`);
      console.log('');
    });
  });

program
  .command('chat [prompt...]')
  .description('Launch a Sentinel interactive assistant console')
  .option('-p, --prompt <text>', 'Run a single prompt then exit')
  .option('--persona <text>', 'Override the Sentinel persona instructions')
  .action(async (promptArgs, options) => {
    const inlinePrompt =
      options.prompt ||
      (Array.isArray(promptArgs) && promptArgs.length ? promptArgs.join(' ') : null);
    await runSentinelConsole({ ...options, prompt: inlinePrompt });
  });

// NEW: GitHub PR Review Command
program
  .command('review-pr <pr-url>')
  .description('Analyze code and post review to a GitHub PR')
  .option('-f, --format <format>', 'Output format (console|json)', 'console')
  .option('--dry-run', 'Analyze but do not post to GitHub')
  .action(async (prUrl, options) => {
    try {
      const { GitHubIntegration } = await import('./integrations/github.js');
      const bot = new CodeReviewBot();
      await bot.initialize();

      console.log(chalk.cyan('🔍 Analyzing code for PR review...'));

      // Run analysis on staged or latest commit
      const { issues } = await bot.runAnalysis({ format: 'json', silent: true });

      if (options.dryRun) {
        console.log(chalk.yellow('🔸 Dry run mode - not posting to GitHub'));
        console.log(chalk.white(`Found ${issues.length} issues`));
        if (options.format === 'json') {
          console.log(JSON.stringify(issues, null, 2));
        }
        return;
      }

      const github = new GitHubIntegration();
      const result = await github.postReview(prUrl, issues);

      console.log(chalk.green('✓') + ` Posted review to ${prUrl}`);
      console.log(chalk.gray(`  Issues: ${result.issuesPosted}, Inline comments: ${result.inlineComments}`));
    } catch (error) {
      console.error(chalk.red('PR Review failed:'), error.message);
      process.exit(1);
    }
  });

// NEW: Auto-Fix Command
program
  .command('fix [files...]')
  .description('Automatically fix common issues in code')
  .option('--type <types>', 'Comma-separated fix types (or "all")', 'all')
  .option('--dry-run', 'Show what would be fixed without making changes')
  .option('-s, --staged', 'Fix only staged files')
  .action(async (files, options) => {
    try {
      const { AutoFixer } = await import('./utils/autoFixer.js');
      const bot = new CodeReviewBot();
      await bot.initialize();

      console.log(chalk.cyan('🔧 Running auto-fix...'));

      // Get files to fix
      const filesToFix = await bot.getFilesToAnalyze({
        files: files.length > 0 ? files : undefined,
        staged: options.staged,
      });

      if (filesToFix.length === 0) {
        console.log(chalk.yellow('No files to fix'));
        return;
      }

      const fixer = new AutoFixer();
      const fixTypes = options.type.split(',').map(t => t.trim());

      // Apply fixes
      const results = await fixer.applyFixesToFiles(filesToFix, fixTypes);

      if (results.length === 0) {
        console.log(chalk.green('✨ No issues to auto-fix!'));
        return;
      }

      // Write or show dry-run results
      await fixer.writeFixedFiles(results, options.dryRun);
      const summary = fixer.generateSummary(results);

      if (options.dryRun) {
        console.log(chalk.yellow('🔸 Dry run - no files modified'));
      } else {
        console.log(chalk.green('✓ Fixes applied'));
      }

      console.log(chalk.white(`  Files: ${summary.totalFiles}`));
      console.log(chalk.white(`  Total fixes: ${summary.totalFixes}`));

      for (const [type, count] of Object.entries(summary.byType)) {
        console.log(chalk.gray(`    • ${type}: ${count}`));
      }
    } catch (error) {
      console.error(chalk.red('Auto-fix failed:'), error.message);
      process.exit(1);
    }
  });

// NEW: Workspace/Monorepo Analysis Command
program
  .command('analyze-workspace')
  .description('Analyze all packages in a monorepo workspace')
  .option('-f, --format <format>', 'Output format (console|json|html|markdown)', 'console')
  .option('-o, --output <file>', 'Output file path')
  .action(async options => {
    try {
      console.log(chalk.cyan('📦 Detecting workspace packages...'));

      // Try to find workspace configuration
      let workspaces = [];

      // Check package.json workspaces
      try {
        const pkgContent = await fs.readFile(path.resolve('package.json'), 'utf8');
        const pkg = JSON.parse(pkgContent);
        if (pkg.workspaces) {
          workspaces = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages || [];
        }
      } catch (e) {
        // No package.json or no workspaces
      }

      // Check pnpm-workspace.yaml
      if (workspaces.length === 0) {
        try {
          const pnpmContent = await fs.readFile(path.resolve('pnpm-workspace.yaml'), 'utf8');
          const match = pnpmContent.match(/packages:\s*\n((?:\s+-\s+.+\n?)+)/);
          if (match) {
            workspaces = match[1]
              .split('\n')
              .map(line => line.replace(/^\s*-\s*/, '').trim())
              .filter(Boolean);
          }
        } catch (e) {
          // No pnpm-workspace.yaml
        }
      }

      if (workspaces.length === 0) {
        console.log(chalk.yellow('No workspaces found. Running standard analysis...'));
        const bot = new CodeReviewBot();
        await bot.initialize();
        await bot.runAnalysis(options);
        return;
      }

      console.log(chalk.green(`Found ${workspaces.length} workspace patterns`));

      // Expand glob patterns and analyze each
      const allIssues = [];

      for (const workspace of workspaces) {
        const workspacePath = path.resolve(workspace.replace(/\/\*$/, ''));
        console.log(chalk.gray(`  Analyzing: ${workspacePath}`));

        try {
          const bot = new CodeReviewBot();
          await bot.initialize();
          const { issues } = await bot.runAnalysis({
            ...options,
            silent: true,
          });
          allIssues.push(...issues.map(i => ({ ...i, workspace })));
        } catch (e) {
          console.warn(chalk.yellow(`    Skipped: ${e.message}`));
        }
      }

      console.log(chalk.bold(`\n📊 Total issues across workspaces: ${allIssues.length}`));

      // Group by workspace for summary
      const byWorkspace = {};
      for (const issue of allIssues) {
        byWorkspace[issue.workspace] = (byWorkspace[issue.workspace] || 0) + 1;
      }

      for (const [ws, count] of Object.entries(byWorkspace)) {
        console.log(chalk.gray(`  ${ws}: ${count} issues`));
      }
    } catch (error) {
      console.error(chalk.red('Workspace analysis failed:'), error.message);
      process.exit(1);
    }
  });

// NEW: Send notifications
program
  .command('notify')
  .description('Send analysis results to Slack or Discord')
  .option('--slack', 'Send to Slack (requires SLACK_WEBHOOK_URL)')
  .option('--discord', 'Send to Discord (requires DISCORD_WEBHOOK_URL)')
  .option('--project <name>', 'Project name for notification', 'Project')
  .option('--branch <name>', 'Branch name', 'main')
  .action(async options => {
    try {
      const { SlackNotifier, DiscordNotifier } = await import('./integrations/notifications.js');
      const bot = new CodeReviewBot();
      await bot.initialize();

      console.log(chalk.cyan('🔍 Running analysis...'));
      const { issues } = await bot.runAnalysis({ format: 'json', silent: true });

      const notifyOptions = {
        projectName: options.project,
        branch: options.branch,
      };

      if (options.slack) {
        console.log(chalk.cyan('📤 Sending to Slack...'));
        const slack = new SlackNotifier();
        await slack.notify(issues, notifyOptions);
        console.log(chalk.green('✓') + ' Sent to Slack');
      }

      if (options.discord) {
        console.log(chalk.cyan('📤 Sending to Discord...'));
        const discord = new DiscordNotifier();
        await discord.notify(issues, notifyOptions);
        console.log(chalk.green('✓') + ' Sent to Discord');
      }

      if (!options.slack && !options.discord) {
        console.log(chalk.yellow('No notification target specified. Use --slack or --discord'));
      }
    } catch (error) {
      console.error(chalk.red('Notification failed:'), error.message);
      process.exit(1);
    }
  });

// NEW: SARIF output for GitHub Security
program
  .command('sarif')
  .description('Generate SARIF report for GitHub Security tab')
  .option('-o, --output <file>', 'Output file path', 'sentinel-results.sarif')
  .action(async options => {
    try {
      const { SarifGenerator } = await import('./output/sarifGenerator.js');
      const bot = new CodeReviewBot();
      await bot.initialize();

      console.log(chalk.cyan('🔍 Running analysis...'));
      const { issues } = await bot.runAnalysis({ format: 'json', silent: true });

      const sarif = new SarifGenerator();
      await sarif.saveToFile(issues, options.output);

      console.log(chalk.green('✓') + ` SARIF report saved to ${options.output}`);
      console.log(chalk.gray('  Upload to GitHub: gh code-scanning upload-sarif --sarif ' + options.output));
    } catch (error) {
      console.error(chalk.red('SARIF generation failed:'), error.message);
      process.exit(1);
    }
  });

// NEW: Trend analysis
program
  .command('trends')
  .description('View historical analysis trends')
  .option('--save', 'Save current analysis to history')
  .option('--limit <number>', 'Number of history entries to show', '10')
  .action(async options => {
    try {
      const { TrendTracker } = await import('./utils/analytics.js');
      const tracker = new TrendTracker();

      if (options.save) {
        const bot = new CodeReviewBot();
        await bot.initialize();
        console.log(chalk.cyan('🔍 Running analysis...'));
        const { issues } = await bot.runAnalysis({ format: 'json', silent: true });

        await tracker.save(issues);
        console.log(chalk.green('✓') + ' Analysis saved to history');
      }

      const trends = await tracker.analyzeTrends();

      console.log('\n' + chalk.bold('📈 Sentinel Trend Analysis'));
      console.log(chalk.gray('─'.repeat(50)));

      if (trends.trend === 'insufficient_data') {
        console.log(chalk.yellow('Not enough data points. Run `sentinel trends --save` after each analysis.'));
      } else {
        const trendEmoji = trends.trend === 'improving' ? '📉' : trends.trend === 'worsening' ? '📈' : '➡️';
        const trendColor = trends.trend === 'improving' ? chalk.green : trends.trend === 'worsening' ? chalk.red : chalk.gray;

        console.log(`${trendEmoji} Trend: ${trendColor(trends.trend.toUpperCase())}`);
        console.log(`📊 Current Issues: ${chalk.bold(trends.current)}`);
        console.log(`📅 Data Points: ${trends.dataPoints}`);
        console.log(`🔄 Short-term Change: ${trends.shortTermChange >= 0 ? '+' : ''}${trends.shortTermChange}`);
        console.log(`🔄 Long-term Change: ${trends.longTermChange >= 0 ? '+' : ''}${trends.longTermChange}`);
        console.log('');
        console.log(chalk.gray('Recent History:'));

        const limit = parseInt(options.limit, 10) || 10;
        for (const entry of trends.history.slice(0, limit)) {
          const date = new Date(entry.date).toLocaleDateString();
          const critical = entry.critical > 0 ? chalk.red(`${entry.critical}C `) : '';
          const high = entry.high > 0 ? chalk.yellow(`${entry.high}H `) : '';
          console.log(`  ${date}: ${critical}${high}${entry.total} total`);
        }
      }
      console.log('');
    } catch (error) {
      console.error(chalk.red('Trend analysis failed:'), error.message);
      process.exit(1);
    }
  });

// NEW: Git blame integration
program
  .command('blame')
  .description('Analyze issues with git blame attribution')
  .option('-f, --format <format>', 'Output format (console|json)', 'console')
  .option('-o, --output <file>', 'Output file path')
  .action(async options => {
    try {
      const { GitBlameIntegration } = await import('./utils/analytics.js');
      const bot = new CodeReviewBot();
      await bot.initialize();

      console.log(chalk.cyan('🔍 Running analysis...'));
      const { issues } = await bot.runAnalysis({ format: 'json', silent: true });

      console.log(chalk.cyan('🔎 Enriching with git blame...'));
      const blameIntegration = new GitBlameIntegration();
      const enrichedIssues = await blameIntegration.enrichIssuesWithBlame(issues);
      const authorReport = blameIntegration.generateAuthorReport(enrichedIssues);

      if (options.format === 'json') {
        const output = JSON.stringify({ issues: enrichedIssues, byAuthor: authorReport }, null, 2);
        if (options.output) {
          await fs.writeFile(options.output, output, 'utf8');
          console.log(chalk.green('✓') + ` Report saved to ${options.output}`);
        } else {
          console.log(output);
        }
      } else {
        console.log('\n' + chalk.bold('👥 Issues by Author'));
        console.log(chalk.gray('─'.repeat(50)));

        for (const author of authorReport) {
          const critical = author.counts.critical > 0 ? chalk.red(`${author.counts.critical}C `) : '';
          const high = author.counts.high > 0 ? chalk.yellow(`${author.counts.high}H `) : '';
          console.log(`\n${chalk.bold(author.author)} (${author.email})`);
          console.log(`  Issues: ${critical}${high}${author.issues.length} total`);

          // Show top 3 issues
          for (const issue of author.issues.slice(0, 3)) {
            const emoji = issue.severity === 'critical' ? '🛑' : issue.severity === 'high' ? '🔶' : '🔷';
            console.log(`  ${emoji} ${issue.title} (${issue.file}:${issue.line})`);
          }
          if (author.issues.length > 3) {
            console.log(chalk.gray(`  ... and ${author.issues.length - 3} more`));
          }
        }
        console.log('');
      }
    } catch (error) {
      console.error(chalk.red('Blame analysis failed:'), error.message);
      process.exit(1);
    }
  });

// NEW: Dashboard Command
program
  .command('dashboard')
  .description('Launch the Sentinel web dashboard')
  .option('-p, --port <number>', 'Port to run the dashboard on', '3000')
  .action(async options => {
    try {
      const port = parseInt(options.port, 10);
      const distPath = path.resolve(__dirname, '..', 'frontend', 'build');

      // Check if dist exists
      try {
        await fs.access(distPath);
      } catch (e) {
        console.log(chalk.yellow('⚠️  Dashboard build not found. Building now...'));
        const { execSync } = await import('child_process');
        const frontendPath = path.resolve(__dirname, '..', 'frontend');
        execSync('npm run build', { cwd: frontendPath, stdio: 'inherit' });
      }

      const assets = sirv(distPath, {
        single: true,
        dev: false,
      });

      const server = http.createServer((req, res) => {
        assets(req, res);
      });

      server.listen(port, () => {
        console.log(chalk.bold.green('🚀 Sentinel Dashboard is live!'));
        console.log(chalk.cyan(`🔗 http://localhost:${port}`));
        console.log(chalk.gray('Press Ctrl+C to stop'));
      });
    } catch (error) {
      console.error(chalk.red('Failed to launch dashboard:'), error.message);
      process.exit(1);
    }
  });

// Show help if no command was provided
if (!process.argv.slice(2).length) {
  await showBannerOnce(program);
  program.outputHelp();
  process.exit(0);
}

program.parse();

#!/usr/bin/env node

/* eslint-disable no-console */

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { promises as fs } from 'fs';
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
  .description('Sentinel – an intelligent automated code review bot')
  .version('1.0.0')
  .option('--banner-message <text>', 'Banner text', 'SENTINEL')
  .option('--banner-font <name>', 'Figlet font name', 'Standard')
  .option('--banner-gradient <name>', 'Banner gradient: aqua|fire|rainbow|aurora|mono', 'aqua')
  .option('--banner-width <number>', 'Banner width for centering', v => parseInt(v, 10))
  .option('--no-banner-color', 'Disable banner gradients')
  .hook('preAction', async thisCommand => {
    const isRootNoSubcommand =
      thisCommand?.name?.() === 'sentinel' && (!thisCommand.args || thisCommand.args.length === 0);
    if (isRootNoSubcommand) return; // default action handles banner when no subcommand
    // Show banner only for main commands, avoid cluttering precise outputs like JSON
    const opts = thisCommand.optsWithGlobals
      ? thisCommand.optsWithGlobals()
      : { ...program.opts(), ...thisCommand.opts() };
    if (!opts.format || opts.format === 'console') {
      await displayBanner({
        bannerMessage: opts.bannerMessage,
        bannerFont: opts.bannerFont,
        bannerGradient: opts.bannerGradient,
        bannerWidth: opts.bannerWidth,
        bannerColor: opts.bannerColor !== false,
      });
    }
  });

// Show banner when no subcommand is provided (default help path)
program.action(async (_args, command) => {
  const opts = command?.optsWithGlobals ? command.optsWithGlobals() : program.opts();
  await displayBanner({
    bannerMessage: opts.bannerMessage,
    bannerFont: opts.bannerFont,
    bannerGradient: opts.bannerGradient,
    bannerWidth: opts.bannerWidth,
    bannerColor: opts.bannerColor !== false,
  });
  command.outputHelp();
});

program
  .command('analyze [files...]')
  .description('Analyze code for issues')
  .option('-c, --commit <hash>', 'Analyze specific commit')
  .option('-b, --branch <name>', 'Analyze branch changes')
  .option('-s, --staged', 'Analyze staged changes only')
  .option('-f, --format <format>', 'Output format (console|json|html|markdown)')
  .option('-o, --output <file>', 'Output file path')
  .option('--no-snippets', 'Disable code snippets in output')
  .action(async (files, options) => {
    try {
      const bot = new CodeReviewBot();
      await bot.initialize();
      await bot.runAnalysis({ ...options, files });
    } catch (error) {
      // console.error(chalk.red('Fatal Error:'), error.message);
      process.exit(1);
    }
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

      await fs.writeFile(hookPath, hookScript, { mode: 0o755 });
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

program.parse();

#!/usr/bin/env node

/**
 * Sentinel Auth CLI (deprecated)
 *
 * Auth is now managed through the TUI. Run `sentinel` and use:
 *   /auth   - Configure API keys
 *   /models - List and manage AI providers
 */

import chalk from 'chalk';
import { configManager } from '../config/configManager.js';



function redirectToTui() {
  console.log('');
  console.log(chalk.cyan('⚡ Auth is now managed inside the Sentinel TUI.'));
  console.log('');
  console.log(chalk.bold('  Run:') + chalk.green(' sentinel'));
  console.log('');
  console.log(chalk.gray('  Then use TUI commands:'));
  console.log(chalk.gray('    /auth     Configure API keys'));
  console.log(chalk.gray('    /models   List and manage AI providers'));
  console.log(chalk.gray('    /setup    Run setup wizard'));
  console.log('');
}

export async function runAuthCommand(args = []) {
  const subcommand = args[0]?.toLowerCase();

  if (subcommand === 'set' && args[1] && args[2]) {
    await configManager.load();
    await configManager.setApiKey(args[1], args[2]);
    console.log(chalk.green(`✓ ${args[1]} API key saved.`));
    return;
  }

  if (subcommand === 'status') {
    await configManager.load();
    const configured = configManager.getConfiguredProviders();
    if (configured.length > 0) {
      console.log(
        chalk.green(`✓ ${configured.length} provider(s) configured: ${configured.join(', ')}`)
      );
    } else {
      console.log(chalk.yellow('No providers configured. Use the TUI to set up.'));
    }
    return;
  }

  redirectToTui();
}

export default runAuthCommand;

#!/usr/bin/env node

/**
 * Sentinel Auth CLI
 * 
 * A simple, user-friendly command to configure API keys for Sentinel.
 * Similar to `opencode auth` - makes it easy to get started.
 * 
 * Usage:
 *   sentinel auth              # Interactive setup
 *   sentinel auth login        # Same as above
 *   sentinel auth status       # Show configured providers
 *   sentinel auth logout       # Clear all API keys
 *   sentinel auth set <key>    # Set a specific provider's key
 */

import chalk from 'chalk';
import { configManager } from '../config/configManager.js';

const PROVIDERS = [
    {
        id: 'openai',
        name: 'OpenAI',
        description: 'GPT-4, GPT-4o, GPT-3.5-turbo',
        envVar: 'OPENAI_API_KEY',
        placeholder: 'sk-...'
    },
    {
        id: 'anthropic',
        name: 'Anthropic',
        description: 'Claude 3.5, Claude 3 Opus/Sonnet',
        envVar: 'ANTHROPIC_API_KEY',
        placeholder: 'sk-ant-...'
    },
    {
        id: 'gemini',
        name: 'Google Gemini',
        description: 'Gemini Pro, Gemini 1.5 Flash',
        envVar: 'GEMINI_API_KEY',
        placeholder: 'AI...'
    },
    {
        id: 'groq',
        name: 'Groq',
        description: 'Llama 3, Mixtral (fast inference)',
        envVar: 'GROQ_API_KEY',
        placeholder: 'gsk_...'
    },
    {
        id: 'openrouter',
        name: 'OpenRouter',
        description: 'Access 100+ models via one API',
        envVar: 'OPENROUTER_API_KEY',
        placeholder: 'sk-or-...'
    }
];

/**
 * Display auth header
 */
function displayHeader() {
    console.log('');
    console.log(chalk.bold.cyan('┌─────────────────────────────────────────────────────┐'));
    console.log(chalk.bold.cyan('│') + chalk.bold.white('           ⚡ Sentinel Authentication ⚡              ') + chalk.bold.cyan('│'));
    console.log(chalk.bold.cyan('└─────────────────────────────────────────────────────┘'));
    console.log('');
}

/**
 * Display current auth status
 */
async function showStatus() {
    displayHeader();

    await configManager.load();
    const configPath = configManager.configPath;

    console.log(chalk.gray(`Config file: ${configPath || 'Not created yet'}`));
    console.log('');
    console.log(chalk.bold('Provider Status:'));
    console.log(chalk.gray('─'.repeat(50)));

    for (const provider of PROVIDERS) {
        const isConfigured = configManager.isProviderEnabled(provider.id);
        const apiKey = configManager.getApiKey(provider.id);

        const status = isConfigured
            ? chalk.green('✓ Configured')
            : chalk.gray('○ Not set');

        const keyPreview = apiKey
            ? chalk.gray(` (${apiKey.slice(0, 4)}...${apiKey.slice(-4)})`)
            : '';

        console.log(`  ${status} ${chalk.bold(provider.name)}${keyPreview}`);
        console.log(`       ${chalk.dim(provider.description)}`);
    }

    console.log(chalk.gray('─'.repeat(50)));

    const configured = configManager.getConfiguredProviders();
    if (configured.length === 0) {
        console.log('');
        console.log(chalk.yellow('ℹ No providers configured.'));
        console.log(chalk.gray('  Run `sentinel auth` to set up your API keys.'));
    } else {
        console.log('');
        console.log(chalk.green(`✓ ${configured.length} provider(s) ready to use.`));
    }
    console.log('');
}

/**
 * Interactive login flow
 */
async function interactiveLogin() {
    displayHeader();

    console.log(chalk.gray('Configure your AI provider API keys.'));
    console.log(chalk.gray('Press Enter to skip a provider, or paste your API key.'));
    console.log('');

    await configManager.load();

    const inquirer = (await import('inquirer')).default;

    // Build questions for each provider
    const questions = PROVIDERS.map(provider => ({
        type: 'password',
        name: provider.id,
        message: `${chalk.bold(provider.name)} API Key:`,
        mask: '*',
        default: configManager.getApiKey(provider.id) || '',
        prefix: chalk.cyan('?'),
        suffix: chalk.gray(` (${provider.placeholder})`)
    }));

    console.log(chalk.bold('Enter your API keys:'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log('');

    const answers = await inquirer.prompt(questions);

    // Save each key
    let savedCount = 0;
    for (const provider of PROVIDERS) {
        const key = answers[provider.id];
        if (key && key.trim()) {
            await configManager.setApiKey(provider.id, key.trim());
            savedCount++;
        }
    }

    console.log('');
    console.log(chalk.gray('─'.repeat(50)));

    if (savedCount > 0) {
        console.log(chalk.green(`✓ Saved ${savedCount} API key(s) to ${configManager.configPath}`));
        console.log('');
        console.log(chalk.gray('Your keys are stored locally and never sent anywhere except to the providers.'));
        console.log(chalk.gray('The config file has restricted permissions (readable only by you).'));
    } else {
        console.log(chalk.yellow('ℹ No API keys were configured.'));
    }

    console.log('');
    console.log(chalk.bold('Quick tips:'));
    console.log(chalk.gray('  • Run `sentinel auth status` to see your configured providers'));
    console.log(chalk.gray('  • Run `sentinel analyze` to start scanning your code'));
    console.log(chalk.gray('  • Run `sentinel console` to chat with AI'));
    console.log('');
}

/**
 * Set a specific provider key directly
 */
async function setProviderKey(providerId, apiKey) {
    const provider = PROVIDERS.find(p => p.id === providerId);

    if (!provider) {
        console.log(chalk.red(`Unknown provider: ${providerId}`));
        console.log(chalk.gray(`Available providers: ${PROVIDERS.map(p => p.id).join(', ')}`));
        process.exit(1);
    }

    await configManager.load();
    const savedPath = await configManager.setApiKey(providerId, apiKey);

    console.log(chalk.green(`✓ ${provider.name} API key saved to ${savedPath}`));
}

/**
 * Clear all API keys
 */
async function logout() {
    displayHeader();

    await configManager.load();

    const inquirer = (await import('inquirer')).default;

    const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: chalk.yellow('This will remove all configured API keys. Continue?'),
        default: false
    }]);

    if (!confirm) {
        console.log(chalk.gray('Cancelled.'));
        return;
    }

    // Clear all provider keys
    for (const provider of PROVIDERS) {
        if (configManager.config?.providers?.[provider.id]) {
            configManager.config.providers[provider.id].apiKey = '';
        }
    }

    await configManager.save();

    console.log(chalk.green('✓ All API keys have been cleared.'));
    console.log('');
}

/**
 * Show help
 */
function showHelp() {
    displayHeader();

    console.log(chalk.bold('Usage:'));
    console.log('');
    console.log('  sentinel auth                 Interactive API key setup');
    console.log('  sentinel auth login           Same as above');
    console.log('  sentinel auth status          Show configured providers');
    console.log('  sentinel auth logout          Clear all API keys');
    console.log('  sentinel auth set <provider>  Set a specific provider key');
    console.log('');
    console.log(chalk.bold('Providers:'));
    console.log('');
    for (const provider of PROVIDERS) {
        console.log(`  ${chalk.cyan(provider.id.padEnd(12))} ${provider.name} - ${provider.description}`);
    }
    console.log('');
    console.log(chalk.bold('Examples:'));
    console.log('');
    console.log('  sentinel auth                 # Start interactive setup');
    console.log('  sentinel auth status          # Check which providers are configured');
    console.log('  sentinel auth set openai      # Set OpenAI API key');
    console.log('');
    console.log(chalk.bold('Configuration:'));
    console.log('');
    console.log(chalk.gray('  Sentinel looks for .sentinel.json in:'));
    console.log(chalk.gray('  1. Current directory (highest priority)'));
    console.log(chalk.gray('  2. $XDG_CONFIG_HOME/sentinel/'));
    console.log(chalk.gray('  3. $HOME/ (global config)'));
    console.log('');
}

/**
 * Main auth command handler
 */
export async function runAuthCommand(args = []) {
    const subcommand = args[0]?.toLowerCase();

    switch (subcommand) {
        case 'status':
            await showStatus();
            break;

        case 'logout':
        case 'clear':
            await logout();
            break;

        case 'set':
            if (args[1]) {
                const inquirer = (await import('inquirer')).default;
                const provider = PROVIDERS.find(p => p.id === args[1]);

                if (!provider) {
                    console.log(chalk.red(`Unknown provider: ${args[1]}`));
                    console.log(chalk.gray(`Available: ${PROVIDERS.map(p => p.id).join(', ')}`));
                    process.exit(1);
                }

                const { apiKey } = await inquirer.prompt([{
                    type: 'password',
                    name: 'apiKey',
                    message: `Enter ${provider.name} API Key:`,
                    mask: '*'
                }]);

                if (apiKey) {
                    await setProviderKey(args[1], apiKey);
                } else {
                    console.log(chalk.yellow('No key provided.'));
                }
            } else {
                console.log(chalk.red('Please specify a provider: sentinel auth set <provider>'));
            }
            break;

        case 'help':
        case '--help':
        case '-h':
            showHelp();
            break;

        case 'login':
        case undefined:
        default:
            await interactiveLogin();
            break;
    }
}

export default runAuthCommand;

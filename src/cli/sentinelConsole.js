/* eslint-disable no-console, no-constant-condition */

import chalk from 'chalk';
import ora from 'ora';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import Config from '../config/config.js';
import LLMOrchestrator from '../llm/llmOrchestrator.js';

const divider = () => chalk.gray('―'.repeat(60));

function formatResponse(text) {
  if (!text) return chalk.dim('No response from providers.');
  const width = 78;
  const chunks = [];
  let remaining = text.trim();
  while (remaining.length > width) {
    let slice = remaining.slice(0, width);
    const lastSpace = slice.lastIndexOf(' ');
    if (lastSpace > 32) {
      slice = slice.slice(0, lastSpace);
    }
    chunks.push(slice);
    remaining = remaining.slice(slice.length).trimStart();
  }
  if (remaining.length) chunks.push(remaining);
  return chunks.map(line => `  ${line}`).join('\n');
}

async function ensureGradient() {
  try {
    const gradientModule = await import('gradient-string');
    return gradientModule.default || gradientModule;
  } catch (_error) {
    return null;
  }
}

export async function runSentinelConsole(options = {}) {
  const config = new Config();
  await config.load();
  const aiConfig = config.get('ai') || {};
  const orchestrator = new LLMOrchestrator(aiConfig);

  const gradient = await ensureGradient();
  const header = gradient
    ? gradient(['#4285F4', '#9B72CB', '#F2994A']).multiline('Sentinel Console')
    : chalk.cyan.bold('Sentinel Console');

  console.log('\n' + header);
  console.log(chalk.hex('#9B72CB')('Pulse ideas straight into the mesh. Type :exit to leave.\n'));

  if (orchestrator.providers.length === 0) {
    console.log(
      chalk.yellow('No AI providers enabled. Configure API keys to chat with live models.')
    );
    return;
  }

  const personaPrompt =
    options.persona ||
    'You are Sentinel CLI, a concise and upbeat developer assistant. Provide high-signal answers, include bullet tips when useful, and keep responses under 6 sentences.';

  const runSinglePrompt = async prompt => {
    const spinner = ora({
      text: chalk.cyan('Dialing Sentinel constellation...'),
      color: 'cyan',
    }).start();
    try {
      const { text, responses } = await orchestrator.chat(prompt, {
        systemPrompt: personaPrompt,
      });
      spinner.succeed('Sentinel reply ready');
      console.log('\n' + divider());
      console.log(chalk.hex('#34A853')('Sentinel ✨'));
      console.log(formatResponse(text) + '\n');
      const telemetry = responses
        .map(res => {
          const status = res.error ? chalk.red('✖') : chalk.green('✓');
          return `${status} ${res.provider?.provider || 'unknown'}${res.latency ? ` ${res.latency}ms` : ''}`;
        })
        .join(chalk.gray(' · '));
      if (telemetry) {
        console.log(chalk.gray('Providers: ') + telemetry);
      }
      console.log(divider() + '\n');
      return text;
    } catch (error) {
      spinner.fail('Sentinel hiccup');
      console.log(chalk.red(`Error: ${error.message}`));
      return null;
    }
  };

  if (options.prompt) {
    await runSinglePrompt(options.prompt);
    return;
  }

  const rl = createInterface({ input, output, terminal: true });
  console.log(chalk.gray('Use :history to view provider status, :exit to quit.\n'));

  const history = [];

  while (true) {
    const prompt = await rl.question(chalk.hex('#4285F4')('sentinel> '));
    if (!prompt.trim()) continue;
    if (prompt.trim() === ':exit') {
      console.log(chalk.gray('\nDisconnecting from Sentinel grid. Bye!\n'));
      break;
    }
    if (prompt.trim() === ':history') {
      if (history.length === 0) {
        console.log(chalk.dim('No history yet.'));
        continue;
      }
      console.log(divider());
      const recent = history.slice(-5);
      recent.forEach((entry, index) => {
        const id = history.length - recent.length + index + 1;
        console.log(chalk.hex('#9B72CB')(`#${id}`));
        console.log(chalk.cyan('You: ') + entry.prompt);
        const preview = entry.response ? entry.response.slice(0, 160) : '[no response captured]';
        console.log(
          chalk.green('Sentinel: ') +
            preview +
            (entry.response && entry.response.length > 160 ? '...' : '')
        );
        console.log(divider());
      });
      continue;
    }

    const responseText = await runSinglePrompt(prompt);
    history.push({ prompt, response: responseText });
  }

  rl.close();
}

export default runSentinelConsole;

#!/usr/bin/env node
/**
 * sentinel — headless CLI surface.
 *
 *   sentinel                 TUI (interactive chat)
 *   sentinel ask "..."       one-shot question, streamed answer
 *   sentinel --version       version
 *   sentinel help            this help
 *
 * That's the whole command surface. The TUI hosts everything else
 * (sessions, model picker, /commands) — see src/tui.
 */
import { Command } from 'commander';
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..', '..');

const CLI_VERSION = (() => {
  try {
    return JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

const program = new Command();

program
  .name('sentinel')
  .description('Sentinel — a minimalist AI coding assistant in your terminal')
  .version(CLI_VERSION, '-V, --version', 'output the version number');

// ── TUI ──────────────────────────────────────────────────────────────────────
program
  .command('tui', { isDefault: true, hidden: true })
  .action(async () => {
    const { launchTui } = await import(
      pathToFileURL(path.resolve(root, 'bin', 'sentinel.js')).href
    );
    await launchTui();
  });

// ── ask: one-shot agent turn with the local tool set ─────────────────────────
program
  .command('ask [question...]')
  .description('Ask the assistant a question and stream the answer (read-only by default)')
  .option('-m, --model <id>', 'Model id (defaults to the cheap default model)')
  .option('-b, --build', 'Allow file edits and shell commands (BUILD mode)')
  .option('-q, --quiet-cost', 'Do not print the token/cost summary')
  .action(async (questionParts, options) => {
    const question = (questionParts || []).join(' ').trim();
    if (!question) {
      console.error('Usage: sentinel ask "your question"');
      process.exit(1);
    }
    const { runAgentTurn } = await import('../agent/loop.js');
    const { DEFAULT_CHAT_MODEL_ID } = await import('../shared/models/index.js');
    const { formatUsd } = await import('../agent/cost.js');

    const mode = options.build ? 'BUILD' : 'PLAN';
    const model = options.model || DEFAULT_CHAT_MODEL_ID;

    let sawError = false;
    let wrote = false;

    try {
      for await (const ev of runAgentTurn({
        history: [
          {
            id: `ask_${Date.now()}`,
            role: 'user',
            parts: [{ type: 'text', text: question }],
          },
        ],
        mode,
        model,
      })) {
        if (ev.event === 'text') {
          process.stdout.write(ev.data.delta);
          wrote = true;
        } else if (ev.event === 'reasoning' && process.env.SENTINEL_VERBOSE) {
          process.stderr.write(`\x1b[2m${ev.data.text}\x1b[0m`);
        } else if (ev.event === 'tool_call') {
          process.stderr.write(`\x1b[2m→ ${ev.data.toolName}\x1b[0m\n`);
        } else if (ev.event === 'finish') {
          if (!options.quietCost && ev.data.usage) {
            const { inputTokens = 0, outputTokens = 0 } = ev.data.usage;
            process.stderr.write(
              `\x1b[2m${inputTokens} in / ${outputTokens} out · ${formatUsd(ev.data.costUsd || 0)} · ${model}\x1b[0m\n`
            );
          }
        } else if (ev.event === 'error') {
          sawError = true;
          process.stderr.write(`\n\x1b[31m${ev.data.message}\x1b[0m\n`);
        }
      }
    } catch (e) {
      console.error(`\x1b[31m${e.message}\x1b[0m`);
      process.exit(1);
    }

    if (wrote) process.stdout.write('\n');
    process.exit(sawError && !wrote ? 1 : 0);
  });

program.parseAsync(process.argv).catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});

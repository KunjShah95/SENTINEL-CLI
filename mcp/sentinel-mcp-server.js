#!/usr/bin/env node
/**
 * Sentinel MCP server (stdio transport).
 *
 * Exposes the minimal assistant to MCP clients (Claude Desktop, Cursor, VS Code):
 *   sentinel_health        provider/version status
 *   sentinel_ask           one-shot question with the local tool set
 *   sentinel_review_diff   AI review of a diff (read-only REVIEW mode)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = (() => {
  try {
    const pkg = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    return JSON.parse(readFileSync(pkg, 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

const server = new McpServer({ name: 'sentinel-cli', version: VERSION });

/** Collect the final text of an agent turn (REVIEW/PLAN modes are read-only). */
async function collectAgentText(history, mode, model) {
  const { runAgentTurn } = await import('../src/agent/loop.js');
  let text = '';
  let error = null;
  for await (const ev of runAgentTurn({ history, mode, model })) {
    if (ev.event === 'text') text += ev.data.delta;
    else if (ev.event === 'error') error = ev.data.message;
  }
  return { text, error };
}

server.tool(
  'sentinel_health',
  'Provider and version status for the local Sentinel CLI.',
  {},
  async () => {
    const envKeys = {
      groq: 'GROQ_API_KEY',
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      gemini: 'GEMINI_API_KEY',
      deepseek: 'DEEPSEEK_API_KEY',
      mistral: 'MISTRAL_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      github: 'GITHUB_TOKEN',
    };
    const providers = Object.fromEntries(
      Object.entries(envKeys).map(([k, env]) => [k, !!process.env[env]])
    );
    providers.ollama = true; // local, requires no key
    const available = Object.entries(providers)
      .filter(([, v]) => v)
      .map(([k]) => k);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ status: 'ok', version: VERSION, providers, available }, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'sentinel_ask',
  'Ask the Sentinel assistant a question. Uses local tools (read files, grep, glob). Read-only unless allowBuild is true.',
  {
    question: z.string().describe('The question to ask.'),
    allowBuild: z.boolean().optional().describe('Allow file edits and shell commands (BUILD mode). Default false.'),
    model: z.string().optional().describe('Model id (defaults to the cheap default model).'),
  },
  async ({ question, allowBuild, model }) => {
    try {
      const { text, error } = await collectAgentText(
        [{ id: `ask_${Date.now()}`, role: 'user', parts: [{ type: 'text', text: question }] }],
        allowBuild ? 'BUILD' : 'PLAN',
        model
      );
      return { content: [{ type: 'text', text: error ? JSON.stringify({ error }) : text }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }] };
    }
  }
);

server.tool(
  'sentinel_review_diff',
  'AI code review of a diff string (read-only REVIEW mode). Returns a formatted review.',
  {
    diff: z.string().describe('Unified diff (git diff output) to review.'),
    focus: z.string().optional().describe('Optional focus, e.g. "security" or "performance".'),
  },
  async ({ diff, focus }) => {
    try {
      const prompt =
        `Review this diff${focus ? ` with a focus on ${focus}` : ''}:\n\n` +
        '```diff\n' +
        String(diff).slice(0, 60000) +
        '\n```';
      const { text, error } = await collectAgentText(
        [{ id: 'diff', role: 'user', parts: [{ type: 'text', text: prompt }] }],
        'REVIEW'
      );
      return { content: [{ type: 'text', text: error ? JSON.stringify({ error }) : text }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }] };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

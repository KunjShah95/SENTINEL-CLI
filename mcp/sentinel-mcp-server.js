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
import { readFileSync, existsSync } from 'node:fs';
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

/**
 * The project directory the agent should operate on.
 *
 * MCP clients spawn this process with cwd set to the *client's* cwd, which is
 * usually the user's project — but `bin/sentinel.js` spawns it with cwd set to
 * the SENTINEL install directory, which would point every agent turn at the
 * package folder. SENTINEL_CWD is set by the CLI entry and wins; otherwise the
 * inherited cwd is used as-is.
 */
function resolveWorkdir() {
  const explicit = process.env.SENTINEL_CWD;
  if (explicit && existsSync(explicit)) return explicit;
  return process.cwd();
}

/** Collect the final text of an agent turn (REVIEW/PLAN modes are read-only). */
async function collectAgentText(history, mode, model) {
  const { runAgentTurn } = await import('../src/agent/loop.js');
  let text = '';
  let error = null;
  for await (const ev of runAgentTurn({ history, mode, model, workdir: resolveWorkdir() })) {
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
      const { DEFAULT_CHAT_MODEL_ID } = await import('../src/shared/models/index.js');
      const { text, error } = await collectAgentText(
        [{ id: `ask_${Date.now()}`, role: 'user', parts: [{ type: 'text', text: question }] }],
        allowBuild ? 'BUILD' : 'PLAN',
        model ?? DEFAULT_CHAT_MODEL_ID
      );
      return { content: [{ type: 'text', text: error ? JSON.stringify({ error }) : text }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }] };
    }
  }
);

server.tool(
  'sentinel_search',
  'Search the web and/or fetch a page for grounding. Uses the configured provider chain (Exa → Tavily → Brave → DuckDuckGo).',
  {
    query: z.string().optional().describe('Search query. Omit when only url is given.'),
    url: z.string().optional().describe('Fetch this URL and return its readable text.'),
    count: z.number().int().min(1).max(20).optional().describe('Number of search results (default 5).'),
    maxChars: z.number().int().min(500).max(40000).optional().describe('Cap on fetched page text (default 8000).'),
  },
  async ({ query, url, count, maxChars }) => {
    try {
      const payload = {};
      if (typeof query === 'string' && query.trim()) {
        const { search } = await import('../src/shared/web-search.js');
        const outcome = await search({ query, count });
        payload.search = { provider: outcome.provider, results: outcome.results, errors: outcome.errors };
      }
      if (typeof url === 'string' && url.trim()) {
        const { fetchUrl } = await import('../src/shared/fetch-url.js');
        payload.page = await fetchUrl({ url, maxChars });
      }
      if (!Object.keys(payload).length) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'query or url is required' }) }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }], isError: true };
    }
  }
);

server.tool(
  'sentinel_skills',
  'List installable/available skills that Sentinel can load, including skills installed by other assistants. Optionally returns one skill\'s body and bundled scripts. Pass includeHidden to also list skills marked for explicit invocation only.',
  {
    query: z.string().optional().describe('Optional skill-name filter (substring match).'),
    name: z.string().optional().describe('Expand this skill: returns its instructions body and any bundled scripts.'),
    args: z.array(z.string()).optional().describe('Values for $1 / $ARGUMENTS placeholders when expanding.'),
    includeHidden: z.boolean().optional().describe('Include skills marked disable-model-invocation in the listing. Expansion by exact name always works.'),
  },
  async ({ query, name, args, includeHidden }) => {
    try {
      const { listSkills, resolveSkill, applySkillArgs, listSkillScripts } = await import('../src/agent/skills.js');
      const cwd = resolveWorkdir();
      // Expand before filtering: a caller who names a skill wants that skill,
      // and a substring match on the listing would not reliably find it.
      if (typeof name === 'string' && name.trim()) {
        const skill = resolveSkill(name, cwd);
        if (!skill) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: `Unknown skill: ${name}` }) }],
            isError: true,
          };
        }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              workdir: cwd,
              name: skill.name,
              description: skill.description,
              args: args ?? [],
              instructions: applySkillArgs(skill.body, args),
              scripts: listSkillScripts(skill),
              // Named on the way out so the calling agent knows this was a
              // deliberate request for a skill its own listing would not have
              // shown it — otherwise `disable-model-invocation` is a flag that
              // silently does nothing for anyone but Sentinel.
              explicitOnly: Boolean(skill.disableModelInvocation),
            }, null, 2),
          }],
        };
      }
      let skills = listSkills(cwd);
      // A hidden skill is withheld from the *listing*, which is what another
      // agent reads to decide what to reach for. An exact-name expand above
      // still works — that is the explicit-invocation path the flag permits.
      if (!includeHidden) skills = skills.filter((s) => !s.disableModelInvocation);
      if (typeof query === 'string' && query.trim()) {
        const q = query.toLowerCase();
        skills = skills.filter((s) => s.name.toLowerCase().includes(q));
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ workdir: cwd, count: skills.length, skills }, null, 2) }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }], isError: true };
    }
  }
);

server.tool(
  'sentinel_mcp_servers',
  'List configured external MCP servers, their connection state, and the tools they expose to Sentinel.',
  {},
  async () => {
    try {
      const { configManager } = await import('../src/config/configManager.js');
      await configManager.load();
      const mcpServers = configManager.get('mcpServers', {}) || {};
      const { buildToolRegistry, closeAll } = await import('../src/agent/mcp-client.js');
      if (!Object.keys(mcpServers).length) {
        return { content: [{ type: 'text', text: JSON.stringify({ configured: 0, servers: [], tools: [] }) }] };
      }
      const registry = await buildToolRegistry(mcpServers, { refresh: true });
      await closeAll();
      return { content: [{ type: 'text', text: JSON.stringify(registry, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }], isError: true };
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
      const { DEFAULT_CHAT_MODEL_ID } = await import('../src/shared/models/index.js');
      const { text, error } = await collectAgentText(
        [{ id: 'diff', role: 'user', parts: [{ type: 'text', text: prompt }] }],
        'REVIEW',
        DEFAULT_CHAT_MODEL_ID
      );
      return { content: [{ type: 'text', text: error ? JSON.stringify({ error }) : text }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }] };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

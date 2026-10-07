import type { CommandContext } from './types.js';

export async function handleHealth(ctx: CommandContext) {
  const { toast, appendMessage, mode, model } = ctx;
  try {
    const mem = process.memoryUsage();
    const uptime = process.uptime();
    const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
    const rssMB = (mem.rss / 1024 / 1024).toFixed(1);
    // Local daemons need no env var: they count when discovery found models.
    const { SUPPORTED_CHAT_MODELS } = await import('../../shared/models/index.js');
    const discovered = (p: string) => SUPPORTED_CHAT_MODELS.some((m: { provider: string }) => m.provider === p);
    const providerChecks: Array<[string, boolean]> = [
      ['Anthropic', !!process.env.ANTHROPIC_API_KEY],
      ['OpenAI', !!process.env.OPENAI_API_KEY],
      ['Gemini', !!(process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY)],
      ['Groq', !!process.env.GROQ_API_KEY],
      ['Mistral', !!process.env.MISTRAL_API_KEY],
      ['DeepSeek', !!process.env.DEEPSEEK_API_KEY],
      ['xAI/Grok', !!process.env.XAI_API_KEY],
      ['Together', !!process.env.TOGETHER_API_KEY],
      ['Fireworks', !!process.env.FIREWORKS_API_KEY],
      ['Perplexity', !!process.env.PERPLEXITY_API_KEY],
      ['OpenRouter', !!process.env.OPENROUTER_API_KEY],
      ['Ollama', !!process.env.OLLAMA_HOST || discovered('ollama')],
      ['LM Studio', !!process.env.LMSTUDIO_HOST || discovered('lmstudio')],
    ];
    const activeProviders = providerChecks.filter(([, ok]) => ok).map(([n]) => `${n} ✓`).join(' · ') || 'None configured';
    const healthText = [
      '## System Health', '',
      `**Uptime:** ${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s  **Memory:** ${heapMB}MB heap / ${rssMB}MB RSS`,
      `**Mode:** ${mode}  **Model:** ${model}`,
      `**AI Providers:** ${activeProviders}`,
      '',
      '> Tip: run `/setup` to configure providers, `/models` to list models.',
    ].join('\n');
    appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: healthText }] });
  } catch (e) { toast.error('Health check failed: ' + String(e)); }
}

export async function handleMcp(ctx: CommandContext) {
  const { appendMessage, mode, model } = ctx;
  appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: '## MCP Server\n\nThe Sentinel MCP server exposes these tools to MCP-compatible AI assistants (Claude Code, Cursor, Zed):\n- 🩺 `sentinel_health` — Provider and version status\n- 💬 `sentinel_ask` — One-shot question, streamed answer\n- 📝 `sentinel_review_diff` — AI review of a diff\n\n**How to start:**\n\n```bash\nsentinel mcp\n```\n\nThen configure your AI tool to connect to it over stdio.' }] });
}

/**
 * /contextdev — Context.dev web-context status.
 *
 * Reads the same state the CLI `sentinel contextdev` reports, so the answer is
 * available without leaving the session. No live call: a probe costs credits,
 * and a slash command must be free. Run `sentinel contextdev --check` for that.
 */
export async function handleContextDev(ctx: CommandContext) {
  const { appendMessage, mode, model, toast } = ctx;
  try {
    const { hasContextDevKey, contextDevKey, CONTEXT_DEV_MCP_URL } = await import('../../shared/context-dev.js');
    const { providerOrder, availableProviders } = await import('../../shared/web-search.js');
    const { authSummary } = await import('../../agent/mcp-oauth.js');

    const keySet = hasContextDevKey();
    const mcp = authSummary('context');
    const mark = (b: boolean) => (b ? '✓' : '·');

    const lines = [
      '## Context.dev',
      '',
      `**API key**  ${mark(keySet)} ${keySet ? `set (${contextDevKey()?.length ?? 0} chars)` : 'not set — optional'}`,
      `**searchWeb** ${availableProviders().join(', ') || 'none'}`,
      `  chain: ${providerOrder().join(' → ')}`,
      `**MCP server** ${mark(mcp.authenticated)} ${CONTEXT_DEV_MCP_URL}`,
      '',
      keySet
        ? '> `searchWeb` and `fetchUrl` are using Context.dev. Pass `prefer="direct"` to `fetchUrl` to spend no credits.'
        : '> With no key, search falls back to DuckDuckGo (no account needed) and fetchUrl fetches directly. Create a key at https://www.context.dev/dashboard/api-keys',
      '',
      '```bash',
      'sentinel contextdev --check      # one live call (~1 credit)',
      'sentinel connect --mcp context   # OAuth server for your other assistants',
      '```',
    ];
    appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: lines.join('\n') }] });
  } catch (e) {
    toast.error('Context.dev status failed: ' + String(e));
  }
}

export async function handleHelp(ctx: CommandContext) {
  const { appendMessage, mode, model } = ctx;
  const lines = [
    '## Commands',
    '',
    '| Command | Description |',
    '|---------|-------------|',
    '| `/model [id]` | List models or switch (`/model` opens the picker) |',
    '| `/models` | List available models by provider |',
    '| `/session [list|switch <id>|delete <id>]` | Manage sessions |',
    '| `/commit` | Generate a commit message from staged changes |',
    '| `/diff [spec]` | Preview a git diff (staged, branch, or file) |',
    '| `/undo` / `/redo` | Undo/redo the last file change |',
    '| `/export` | Export the session to Markdown |',
    '| `/health` | Show providers, memory, uptime |',
    '| `/mcp` | How to connect the MCP server |',
    '| `/contextdev` | Context.dev web-context status (key, providers, MCP sign-in) |',
    '| `/compact` | Summarize the session to free context |',
    '| `/goal <condition>` | Work until an independent evaluator confirms the condition |',
    '| `/fork` | Branch this session (the original stays intact) |',
    '| `/steer <msg>` | Redirect a running turn (or just type while it runs) |',
    '| `/<template> args` | Run a prompt template from .sentinel/prompts |',
    '| `/setup` | Configure AI providers |',
    '| `/editor` | Compose the next message in $EDITOR |',
    '| `/thinking` / `/details` | Toggle reasoning / tool details |',
    '| `/clear` / `/new` | Clear messages / start a new session |',
    '',
    '`! <cmd>` runs a shell command. `@agent <msg>` routes to an agent persona.',
  ];
  appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: lines.join('\n') }] });
}

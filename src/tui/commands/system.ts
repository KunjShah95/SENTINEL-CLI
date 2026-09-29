import type { CommandContext } from './types.js';

export async function handleHealth(ctx: CommandContext) {
  const { toast, appendMessage, mode, model } = ctx;
  try {
    const mem = process.memoryUsage();
    const uptime = process.uptime();
    const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
    const rssMB = (mem.rss / 1024 / 1024).toFixed(1);
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
      ['Ollama', !!process.env.OLLAMA_HOST],
      ['LM Studio', !!process.env.LMSTUDIO_HOST],
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

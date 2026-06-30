import type { CommandContext } from './types.js';

export async function handleHealth(ctx: CommandContext) {
  const { toast, appendMessage, mode, model } = ctx;
  try {
    const { checkServerHealth } = await import('../lib/api-client.js');
    const serverOk = await checkServerHealth();
    const mem = process.memoryUsage();
    const uptime = process.uptime();
    const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
    const rssMB = (mem.rss / 1024 / 1024).toFixed(1);
    const tokenUsage = { estimated: 0, limit: 40000 }; // simplified — caller should pass real values
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
      `**Server:** ${serverOk ? '🟢 Connected (localhost:3000)' : '🔴 Offline — running in local mode'}`,
      `**Uptime:** ${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s  **Memory:** ${heapMB}MB heap / ${rssMB}MB RSS`,
      `**Mode:** ${mode}  **Model:** ${model}`,
      `**AI Providers:** ${activeProviders}`,
      '', ...(serverOk ? [] : ['> Tip: `npm run sentinel:server` starts the API server for session persistence.']),
    ].filter(l => l !== undefined).join('\n');
    appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: healthText }] });
  } catch (e) { toast.error('Health check failed: ' + String(e)); }
}

export async function handleInit(ctx: CommandContext) {
  const { toast, appendMessage, mode, model } = ctx;
  try {
    const { analyzeProject, generateAgentsMd } = await import('../lib/init.js');
    const path = await import('node:path');
    const fs = await import('node:fs/promises');
    toast.info('Analyzing project structure...');
    const info = await analyzeProject();
    const md = generateAgentsMd(process.cwd(), info);
    await fs.writeFile(path.join(process.cwd(), 'AGENTS.md'), md, 'utf-8');
    toast.success('AGENTS.md created');
    appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `✅ Project initialized!\n\n**Detected:** ${info.language}, ${info.frameworks.join(', ') || 'no frameworks'}, ${info.packageManager}\n**Test:** ${info.testFramework}\n**Entry:** ${info.entryPoints.join(', ') || 'none'}\n\nCreated \`AGENTS.md\` with project context. Commit it to share conventions with other agents.` }] });
  } catch (e) { toast.error('Init failed: ' + String(e)); }
}

export async function handleHooks(ctx: CommandContext) {
  const { toast, appendMessage, mode, model } = ctx;
  try {
    const { runInitHooks } = await import('../cli/commands/init-hooks.js');
    toast.info('Installing git hooks...');
    await runInitHooks({ hooks: ['pre-push'] });
    toast.success('Git hooks installed');
    appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: '✅ Pre-push hook installed. Sentinel will now block pushes with critical security issues.\n\nTo bypass: `git push --no-verify`\nTo uninstall: `rm .git/hooks/pre-push`' }] });
  } catch (e) { toast.error('Hooks install failed: ' + String(e)); }
}

export async function handleMcp(ctx: CommandContext) {
  const { appendMessage, mode, model } = ctx;
  appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: '## MCP Server\n\nThe Sentinel MCP server exposes these tools to MCP-compatible AI assistants (Claude Code, Cursor, Zed):\n- 📄 \`sentinel_analyze\` — Scan files/directories\n- 🔒 \`sentinel_security_audit\` — Security audit\n- 📝 \`sentinel_review_code\` — Review code snippets\n- 🔄 \`sentinel_review_pr\` — Review PR changes\n- 💡 \`sentinel_explain_issue\` — Explain findings\n- 🔧 \`sentinel_fix\` — Auto-fix issues\n- 📊 \`sentinel_score\` — Project health score\n- 📦 \`sentinel_check_dependencies\` — CVE scan\n\n**How to start:**\n\n```bash\nsentinel mcp\n```\n\nThen configure your AI tool to connect to it. See \`mcp/README.md\` for setup instructions per tool.' }] });
}

export async function handleHelp(ctx: CommandContext) {
  const { appendMessage, mode, model } = ctx;
  const builtin = '/clear /new /wizard /mode /setup /connect /review /review-file /review-branch /scan /sast /sarif /dismiss /test /export /loop /pipeline /ci /commit /context /parallel /models /health /model /trust /feedback /undo /redo /background /agents /thinking /details /init /session /diff /fix';
  appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: builtin }] });
}

export async function handleContext(ctx: CommandContext) {
  const { toast, appendMessage, mode, model } = ctx;
  try {
    const { loadContextFiles, createDefaultContextFile } = await import('../lib/context-file.js');
    const files = loadContextFiles();
    if (files.length === 0) {
      createDefaultContextFile();
      toast.success('Created SENTINEL.md — edit it to add project context.');
      appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: '## Context File Created\n\nA `SENTINEL.md` file was created in your project root. Edit it to add:\n- Project overview\n- Security-sensitive areas\n- Architecture notes\n- Areas to exclude from review\n\nSentinel will auto-inject this context into every review.' }] });
    } else {
      const content = files.map(f => `**${f.source}** (${f.content.length} chars)\n\`\`\`\n${f.content.slice(0, 500)}${f.content.length > 500 ? '\n...' : ''}\n\`\`\``).join('\n\n');
      appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `## Active Context Files\n\n${content}` }] });
    }
  } catch (e) { toast.error('Context command failed: ' + String(e)); }
}

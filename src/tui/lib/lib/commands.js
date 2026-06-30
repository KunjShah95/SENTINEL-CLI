import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { TOOLS } from './tools';
import { THEMES, DEFAULT_THEME } from '../theme';
import { chat, getProviderInfo, getOllamaModels } from './chat';
import { applyTheme } from '../providers/theme';
const sentinelCmds = {
  analyze: ['analyze'],
  'full-scan': ['full-scan'],
  security: ['security-audit'],
  secrets: ['scan-secrets'],
  container: ['container'],
  frontend: ['frontend'],
  backend: ['backend'],
  diff: ['diff'],
  'pre-commit': ['pre-commit'],
  blame: ['blame'],
  fix: ['fix'],
  agents: ['agents'],
  chat: ['chat'],
  report: ['report'],
  status: ['status'],
  stats: ['stats'],
  complexity: ['complexity'],
  'best-practices': ['best-practices'],
  'multi-file': ['multi-file'],
  config: ['config'],
  connect: ['connect'],
  cache: ['cache'],
  validate: ['validate'],
  parallel: ['parallel'],
  webhook: ['webhook'],
  server: ['server'],
  policy: ['policy'],
  'install-hooks': ['install-hooks'],
  'test-suggestions': ['test-suggestions'],
  'pr-description': ['pr-description'],
  'pr-summary': ['pr-summary'],
  explain: ['explain'],
  setup: ['setup'],
  secret_patterns: ['secret-patterns'],
  lint: ['lint'],
  ollama: ['ollama'],
  sessions: ['sessions'],
  wizard: ['wizard'],
  test: ['test'],
  export: ['export'],
  dismiss: ['dismiss'],
  undismiss: ['undismiss'],
  dismissed: ['dismissed'],
};
function formatResult(result) {
  if (result.error) {
    return `\u2716 Error: ${result.error}`;
  }
  return result.output || '(done)';
}
function buildCommandHandler(toolName, argMap) {
  return async (args) => {
    const tool = TOOLS[toolName];
    if (!tool)
      return `Unknown command: ${toolName}`;
    const params = argMap ? argMap(args) : {};
    const result = await tool.execute(Object.keys(params).length > 0 ? params : {});
    return formatResult(result);
  };
}
export const COMMAND_HANDLERS = {
  help: {
    description: 'Show available commands',
    handler: async () => {
      const categories = {};
      for (const [name, cmd] of Object.entries(COMMAND_HANDLERS)) {
        const cat = name === 'help' || name === 'new' || name === 'clear' || name === 'exit'
          ? 'general'
          : [
            'config',
            'auth',
            'rules',
            'cache',
            'validate',
            'policy',
            'setup',
            'features',
            'team',
          ].includes(name)
            ? 'settings'
            : ['theme'].includes(name)
              ? 'appearance'
              : ['models'].includes(name)
                ? 'ai'
                : [
                  'analyze',
                  'full-scan',
                  'security',
                  'secrets',
                  'container',
                  'frontend',
                  'backend',
                  'lint',
                  'complexity',
                  'best-practices',
                  'multi-file',
                  'parallel',
                ].includes(name)
                  ? 'scan'
                  : [
                    'diff',
                    'blame',
                    'pre-commit',
                    'pr',
                    'commit',
                    'log',
                    'pr-description',
                    'pr-summary',
                    'install-hooks',
                  ].includes(name)
                    ? 'git'
                    : [
                      'fix',
                      'agents',
                      'agent',
                      'chat',
                      'exec',
                      'search',
                      'explain',
                      'test-suggestions',
                      'wizard',
                      'ollama',
                    ].includes(name)
                      ? 'actions'
                      : 'views';
        if (!categories[cat])
          categories[cat] = [];
        categories[cat].push(name);
      }
      let output = '';
      for (const [cat, cmds] of Object.entries(categories)) {
        output += `\n[${cat.toUpperCase()}]\n`;
        for (const c of cmds.sort()) {
          output += `  /${c} - ${COMMAND_HANDLERS[c]?.description || ''}\n`;
        }
      }
      return output;
    },
  },
  new: {
    description: 'Start a new conversation',
    handler: async () => '(switch to new session)',
  },
  clear: {
    description: 'Clear the current session',
    handler: async () => '(clear session)',
  },
  exit: {
    description: 'Quit Sentinel',
    handler: async () => {
      process.exit(0);
      return '';
    },
  },
  analyze: {
    description: 'Analyze code for issues',
    handler: buildCommandHandler('analyze', a => ({ files: a || '.' })),
  },
  'full-scan': {
    description: 'Run all available analyzers',
    handler: buildCommandHandler('fullScan'),
  },
  security: {
    description: 'Comprehensive security audit',
    handler: buildCommandHandler('securityAudit'),
  },
  secrets: {
    description: 'Scan for secrets and sensitive data',
    handler: buildCommandHandler('scanSecrets', a => ({ target: a || '.' })),
  },
  diff: { description: 'Review staged changes', handler: buildCommandHandler('diff') },
  status: { description: 'Show system status', handler: buildCommandHandler('status') },
  stats: { description: 'Show repository statistics', handler: buildCommandHandler('stats') },
  fix: {
    description: 'Auto-fix detected issues',
    handler: buildCommandHandler('fix', a => ({ files: a || '.' })),
  },
  agents: { description: 'Run multi-agent pipeline', handler: buildCommandHandler('agents') },
  chat: {
    description: 'Quick AI chat',
    handler: buildCommandHandler('chat', a => ({ message: a || '' })),
  },
  'pre-commit': {
    description: 'Quick pre-commit check',
    handler: buildCommandHandler('preCommit'),
  },
  report: { description: 'Generate analysis reports', handler: buildCommandHandler('report') },
  complexity: {
    description: 'Analyze code complexity',
    handler: buildCommandHandler('complexity'),
  },
  'best-practices': {
    description: 'Analyze code against best practices',
    handler: buildCommandHandler('bestPractices'),
  },
  explain: {
    description: 'Explain a vulnerability',
    handler: buildCommandHandler('explain', a => ({ issueId: a || '' })),
  },
  read: {
    description: 'Read a file from the filesystem',
    handler: async (args) => {
      if (!args)
        return 'Usage: /read <filepath>';
      const tool = TOOLS.readFile;
      const result = await tool.execute({ path: args });
      return formatResult(result);
    },
  },
  write: {
    description: 'Write content to a file',
    handler: async (args) => {
      const match = args.match(/^(\S+)\s+(.+)$/);
      if (!match)
        return 'Usage: /write <filepath> <content>';
      const tool = TOOLS.writeFile;
      const result = await tool.execute({ path: match[1], content: match[2] });
      return formatResult(result);
    },
  },
  ls: {
    description: 'List files in a directory',
    handler: async (args) => {
      const tool = TOOLS.listDirectory;
      const result = await tool.execute({ path: args || '.' });
      return formatResult(result);
    },
  },
  dir: {
    description: 'List files in a directory (alias for /ls)',
    handler: async (args) => {
      const tool = TOOLS.listDirectory;
      const result = await tool.execute({ path: args || '.' });
      return formatResult(result);
    },
  },
  theme: {
    description: 'List, switch, or create themes',
    handler: async (args) => {
      const trimmed = args.trim();
      const parts = trimmed.split(/\s+/);
      const sub = parts[0]?.toLowerCase();
      if (sub === 'create') {
        const name = parts.slice(1).join(' ') || `Custom ${Date.now() % 10000}`;
        const newTheme = {
          name,
          colors: {
            primary: '#00D4AA',
            planMode: '#7C3AED',
            selection: '#00D4AA',
            thinking: '#FBBF24',
            success: '#34D399',
            error: '#EF4444',
            info: '#60A5FA',
            background: '#0A0E17',
            surface: '#131827',
            dialogSurface: '#1A2235',
            thinkingBorder: '#FBBF24',
            dimSeparator: '#334155',
            warning: '#F59E0B',
            critical: '#DC2626',
            secure: '#10B981',
          },
        };
        THEMES.push(newTheme);
        applyTheme(name);
        return `Created and applied theme "${name}".\nEdit ~/.sentinel/preferences.json to customize colors.`;
      }
      if (sub === 'save') {
        const home = process.env.HOME || process.env.USERPROFILE || '~';
        const prefsPath = `${home}/.sentinel/preferences.json`;
        try {
          const prefs = existsSync(prefsPath) ? JSON.parse(readFileSync(prefsPath, 'utf-8')) : {};
          prefs.theme = prefs.theme || DEFAULT_THEME.name;
          const out = `Theme "${prefs.theme}" saved to preferences.\nRun /theme to list all themes.`;
          return out;
        }
        catch {
          return 'Could not save theme preference.';
        }
      }
      if (trimmed && sub !== 'list') {
        const found = THEMES.find(t => t.name.toLowerCase() === trimmed.toLowerCase());
        if (found) {
          applyTheme(found.name);
          return `Switched to "${found.name}"`;
        }
        return `Theme "${trimmed}" not found. Available: ${THEMES.map(t => t.name).join(', ')}`;
      }
      let output = `Available themes (${THEMES.length}):\n`;
      for (const t of THEMES) {
        const marker = t.name === DEFAULT_THEME.name ? ' \u2022' : '  ';
        output += `${marker} ${t.name}\n`;
        output += `    Primary: ${t.colors.primary} | Background: ${t.colors.background}\n`;
      }
      output += '\nUsage: /theme [name] | /theme create <name> | /theme save';
      return output;
    },
  },
  setup: {
    description: 'Interactive API key setup wizard',
    handler: async () => {
      const { startAuthWizard, initializeProviders } = await import('../lib/auth-flow');
      startAuthWizard();
      return await initializeProviders();
    },
  },
  config: {
    description: 'View and manage configuration',
    handler: async (args) => {
      const trimmed = args.trim().toLowerCase();
      try {
        const { Config } = await import('../../config/config.js');
        const config = new Config();
        await config.load();
        if (!trimmed || trimmed === 'list') {
          const all = config.getAll();
          let out = 'Configuration:\n';
          for (const [key, val] of Object.entries(all)) {
            out += `  ${key}: ${JSON.stringify(val)}\n`;
          }
          return out;
        }
        const val = config.get(trimmed);
        return `${trimmed}: ${JSON.stringify(val)}`;
      }
      catch (e) {
        return `Error reading config: ${e}`;
      }
    },
  },
  rules: {
    description: 'Manage custom linting rules',
    handler: async () => {
      return 'Custom rules management not yet implemented in TUI.\nSee .codereviewrc.json for lint rule configuration.';
    },
  },
  agent: {
    description: 'Chat with autonomous agent',
    handler: async (args) => {
      if (!args)
        return 'Usage: /agent <prompt> or use /agents for the multi-agent pipeline.';
      try {
        const result = await chat(`You are an autonomous coding agent. Task: ${args}`);
        return result || '(no response)';
      }
      catch (e) {
        return `Agent error: ${e}`;
      }
    },
  },
  auth: {
    description: 'Show and manage AI provider API keys',
    handler: async (args) => {
      const trimmed = args.trim();
      const parts = trimmed.split(/\s+/);
      const subcmd = parts[0]?.toLowerCase();
      const { Config } = await import('../../config/config.js');
      const config = new Config();
      await config.load();
      const { configManager } = await import('../../config/configManager.js');
      await configManager.load();
      if (subcmd === 'set' && parts[1]) {
        const provider = parts[1].toLowerCase();
        const key = parts.slice(2).join(' ');
        if (!key) {
          return `Usage: /auth set ${provider} <api-key>\nOr run /setup for the interactive wizard.`;
        }
        try {
          await configManager.setApiKey(provider, key);
          configManager.injectEnvVars();
          return `✓ API key saved for ${provider}.`;
        }
        catch (e) {
          return `Error saving key for ${provider}: ${e}`;
        }
      }
      if (subcmd === 'remove') {
        if (!parts[1])
          return 'Usage: /auth remove <provider>';
        const provider = parts[1].toLowerCase();
        try {
          await configManager.setApiKey(provider, '');
          configManager.injectEnvVars();
          return `✓ API key removed for ${provider}.`;
        }
        catch (e) {
          return `Error removing key for ${provider}: ${e}`;
        }
      }
      const info = await getProviderInfo();
      const masked = configManager.getMaskedConfig();
      let out = 'AI Provider Status:\n';
      for (const p of info) {
        const maskedKey = masked?.providers?.[p.provider]?.apiKey;
        const status = p.enabled
          ? p.hasKey
            ? `\u2705 ${maskedKey || 'configured'}`
            : '\u26A0\uFE0F no key'
          : '\u274C disabled';
        out += `  ${status.padEnd(22)} ${p.provider.padEnd(12)} ${p.model}\n`;
      }
      out += '\nCommands:\n';
      out += '  /auth set <provider> <key>   Save API key\n';
      out += '  /auth remove <provider>       Remove API key\n';
      out += '  /setup                        Interactive wizard\n';
      return out;
    },
  },
  connect: {
    description: 'Connect your existing AI subscriptions (Copilot, ChatGPT, Claude)',
    handler: async () => {
      const lines = [
        'Connect your existing subscriptions to use them in Sentinel:',
        '',
        '── GitHub Copilot ──────────────────────────────────────────',
        '  Set env: GITHUB_TOKEN=<your-github-token>',
        '  Or set:  GITHUB_COPILOT_TOKEN=<your-copilot-token>',
        '  Models:  /model copilot/gpt-4o, /model copilot/claude-sonnet',
        '  Get token: https://github.com/settings/tokens',
        '',
        '── ChatGPT (OpenAI) ────────────────────────────────────────',
        '  ChatGPT Plus/Pro users get API credits included.',
        '  Set env: OPENAI_API_KEY=sk-...',
        '  Or use:  /auth set openai <your-key>',
        '  Get key: https://platform.openai.com/api-keys',
        '',
        '── Claude (Anthropic) ──────────────────────────────────────',
        '  Claude Pro/Max/Team users get API credits included.',
        '  Set env: ANTHROPIC_API_KEY=sk-ant-...',
        '  Or use:  /auth set anthropic <your-key>',
        '  Get key: https://console.anthropic.com/settings/keys',
        '',
        '── Free open-source (default) ─────────────────────────────',
        '  Groq:   Free Llama 3 / Gemma / Qwen models (set GROQ_API_KEY)',
        '  Ollama: Fully local, no key needed (install Ollama first)',
        '  LM Studio: Local OpenAI-compatible server',
        '',
        'Default model is llama-3.1-8b-instant (Groq free tier).',
        'Run /models to see all available providers.',
        'Run /auth to check your current API key status.',
      ];
      return lines.join('\n');
    },
  },
  models: {
    description: 'Show configured AI providers and installed Ollama models',
    handler: async () => {
      try {
        const providers = await getProviderInfo();
        let output = 'AI Providers:\n';
        if (providers.length === 0) {
          output += '  (none configured - run /setup or /auth in the TUI)\n';
        }
        else {
          for (const p of providers) {
            const status = p.enabled
              ? p.hasKey
                ? '\u2705'
                : '\u26A0\uFE0F no key'
              : '\u274C disabled';
            output += `  ${status} ${p.provider} (${p.model})\n`;
          }
        }
        const ollamaModels = await getOllamaModels();
        if (ollamaModels.length > 0) {
          output += '\nInstalled Ollama Models:\n';
          for (const m of ollamaModels) {
            const size = m.size > 1e9 ? `${(m.size / 1e9).toFixed(1)}GB` : `${(m.size / 1e6).toFixed(0)}MB`;
            output += `  \u25C9 ${m.name} (${size})\n`;
          }
        }
        else {
          output += '\nOllama: no models found (is Ollama running?)';
        }
        return output;
      }
      catch (err) {
        return `Error loading provider info: ${err}`;
      }
    },
  },
  ollama: {
    description: 'Chat with an Ollama model',
    handler: async (args) => {
      const trimmed = args.trim();
      if (!trimmed) {
        const models = await getOllamaModels();
        if (models.length === 0)
          return 'No Ollama models found. Is Ollama running?';
        let out = 'Available Ollama models:\n';
        for (const m of models) {
          const size = m.size > 1e9 ? `${(m.size / 1e9).toFixed(1)}GB` : `${(m.size / 1e6).toFixed(0)}MB`;
          out += `  \u25C9 ${m.name} (${size})\n`;
        }
        out += '\nUsage: /ollama <model> <prompt>\nExample: /ollama llama3.2 What is SOLID?';
        return out;
      }
      const match = trimmed.match(/^(\S+)\s+(.+)$/);
      if (!match)
        return 'Usage: /ollama <model> <prompt>';
      const model = match[1];
      const prompt = match[2];
      try {
        const host = 'http://localhost:11434';
        const res = await fetch(`${host}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            stream: false,
          }),
        });
        if (!res.ok)
          return `Ollama error (${res.status}): ${res.statusText}`;
        const data = await res.json();
        return data.message?.content || '(empty response)';
      }
      catch (e) {
        return `Ollama error: ${e}`;
      }
    },
  },
  log: {
    description: 'View git log',
    handler: async (args) => {
      const count = parseInt(args.trim()) || 20;
      try {
        const out = execSync(`git log --oneline -${Math.min(count, 100)}`, {
          encoding: 'utf-8',
          maxBuffer: 1024 * 1024,
        });
        return out || '(no commits)';
      }
      catch (e) {
        return `Error: ${e}`;
      }
    },
  },
  pr: {
    description: 'Review a GitHub PR',
    handler: async (args) => {
      const t = TOOLS.prReview;
      return t ? formatResult(await t.execute({ pr: args || 'current' })) : '(not implemented)';
    },
  },
  commit: {
    description: 'Generate commit message',
    handler: async () => {
      try {
        const diff = execSync('git diff --staged', {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
        });
        if (!diff.trim())
          return 'No staged changes. Stage files with `git add` first.';
        const msg = await chat(`Generate a concise conventional commit message (subject ≤72 chars + body if needed) for this diff:\n\n${diff.slice(0, 4000)}`);
        return msg || '(no response)';
      }
      catch (e) {
        return `Error: ${e}`;
      }
    },
  },
  wizard: {
    description: 'Multi-step analysis wizard (interactive dialog)',
    handler: async () => 'Open the wizard from the session screen: type /wizard in chat.',
  },
  exec: {
    description: 'Execute a shell command',
    handler: async (args) => {
      if (!args)
        return 'Usage: /exec <command>';
      try {
        const r = await TOOLS.bash.execute({ command: args });
        const output = r.output || '';
        if (output.split('\n').length > 50) {
          const lines = output.split('\n');
          const truncated = lines.slice(0, 48).join('\n');
          return `${truncated}\n\n\u2193 Output truncated (${lines.length} lines total). Use /exec commands individually for specific results.`;
        }
        return output || r.error || '(empty)';
      }
      catch (e) {
        return `Error: ${e}`;
      }
    },
  },
  search: {
    description: 'Search the web (LLM-powered)',
    handler: async (args) => {
      if (!args)
        return 'Usage: /search <query>';
      try {
        const result = await chat(`Answer this question using your knowledge. If you're unsure, say so. Query: ${args}`, { systemPrompt: 'You are a helpful search assistant. Be concise and cite facts.' });
        return result || '(no response)';
      }
      catch (e) {
        return `Error: ${e}`;
      }
    },
  },
  sarif: {
    description: 'Generate SARIF report and write to sentinel-results.sarif',
    handler: async (args) => {
      try {
        const { CodeReviewBot } = await import('../../core/bot.js');
        const bot = new CodeReviewBot();
        await bot.initialize();
        const issues = await bot.analyzeFiles([args || '.'], { format: 'sarif' });
        await bot.shutdown();
        const sarifOutput = JSON.stringify(issues, null, 2);
        const outPath = 'sentinel-results.sarif';
        writeFileSync(outPath, sarifOutput, 'utf-8');
        return `SARIF report written to ${outPath} (${sarifOutput.length} bytes)\n\n${sarifOutput.slice(0, 1000)}${sarifOutput.length > 1000 ? '\n... (truncated)' : ''}`;
      }
      catch (err) {
        return `SARIF export error: ${err}`;
      }
    },
  },
  badge: {
    description: 'Generate security score badges',
    handler: buildCommandHandler('badge'),
  },
  metrics: {
    description: 'Show performance metrics',
    handler: async () => {
      const mem = process.memoryUsage();
      const uptime = process.uptime();
      let out = 'Performance Metrics:\n';
      out += `  Uptime: ${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s\n`;
      out += `  Heap: ${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB / ${(mem.heapTotal / 1024 / 1024).toFixed(1)}MB\n`;
      out += `  RSS: ${(mem.rss / 1024 / 1024).toFixed(1)}MB\n`;
      out += `  CPU: ${(process.cpuUsage().user / 1000000).toFixed(2)}s user`;
      return out;
    },
  },
  trends: {
    description: 'View analysis trends',
    handler: async () => {
      const home = process.env.HOME || process.env.USERPROFILE || '~';
      const sessDir = `${home}/.sentinel/sessions`;
      if (!existsSync(sessDir))
        return 'No session data for trend analysis.';
      try {
        const files = readdirSync(sessDir)
          .filter(f => f.endsWith('.json'))
          .sort()
          .reverse()
          .slice(0, 14);
        if (files.length === 0)
          return 'No session data for trend analysis.';
        let out = `Analysis Trends (last ${files.length} sessions):\n`;
        for (const f of files) {
          const raw = readFileSync(`${sessDir}/${f}`, 'utf-8');
          const data = JSON.parse(raw);
          const msgCount = Array.isArray(data) ? data.length : 0;
          const date = f.replace('.json', '').replace(/_/g, ' ').slice(0, 19);
          out += `  ${date}: ${msgCount} messages\n`;
        }
        return out;
      }
      catch (e) {
        return `Trend analysis error: ${e}`;
      }
    },
  },
  ci: {
    description: 'CI-friendly analysis mode',
    handler: async (args) => {
      const target = args.trim() || '.';
      return await formatResult(await TOOLS.analyze.execute({ files: target }));
    },
  },
  notify: {
    description: 'Send results to Slack/Discord',
    handler: async () => {
      return 'Notification not configured. Set up webhook URLs in .codereviewrc.json under integrations.';
    },
  },
  team: {
    description: 'Manage team workspace',
    handler: async () => {
      return 'Team workspace not configured. Set up in .codereviewrc.json under integrations.';
    },
  },
  features: {
    description: 'Manage feature flags',
    handler: async () => {
      const cfg = existsSync('.codereviewrc.json')
        ? JSON.parse(readFileSync('.codereviewrc.json', 'utf-8'))
        : {};
      const ml = cfg.ml?.enabled !== false;
      const ai = cfg.ai?.enabled !== false;
      const cache = cfg.ai?.cache?.enabled !== false;
      let out = 'Feature Flags:\n';
      out += `  AI Analysis: ${ai ? '\u2705' : '\u274C'}\n`;
      out += `  ML Detection: ${ml ? '\u2705' : '\u274C'}\n`;
      out += `  Cache: ${cache ? '\u2705' : '\u274C'}\n`;
      return out;
    },
  },
  'secret-patterns': {
    description: 'List secret detection patterns',
    handler: async () => {
      try {
        const { SecretsScanner } = await import('../../analyzers/secretsScanner.js');
        const scanner = new SecretsScanner();
        const patterns = Object.keys(scanner.secretsDb || {});
        if (patterns.length === 0)
          return 'Secret patterns: (none loaded)';
        let out = `Secret Detection Patterns (${patterns.length}):\n`;
        for (const p of patterns) {
          out += `  \u25CF ${p}\n`;
        }
        return out;
      }
      catch (e) {
        return `Error loading patterns: ${e}`;
      }
    },
  },
  sessions: {
    description: 'Browse saved sessions',
    handler: async (args) => {
      const trimmed = args.trim().toLowerCase();
      const home = process.env.HOME || process.env.USERPROFILE || '~';
      const sessDir = `${home}/.sentinel/sessions`;
      if (!existsSync(sessDir))
        return 'No saved sessions found.';
      try {
        const files = readdirSync(sessDir)
          .filter(f => f.endsWith('.json'))
          .sort()
          .reverse();
        if (files.length === 0)
          return 'No saved sessions found.';
        if (trimmed) {
          const found = files.find(f => f.toLowerCase().includes(trimmed));
          if (!found)
            return `No session matching "${trimmed}".`;
          const data = JSON.parse(readFileSync(`${sessDir}/${found}`, 'utf-8'));
          if (Array.isArray(data)) {
            let out = `Session: ${found}\n${data.length} messages:\n`;
            for (const msg of data.slice(-10)) {
              const preview = (msg.content || '').slice(0, 80);
              out += `  [${msg.role}] ${preview}\n`;
            }
            return out;
          }
          return `Session: ${found}\n${JSON.stringify(data, null, 2).slice(0, 2000)}`;
        }
        let out = `Saved sessions (${files.length}):\n`;
        for (const f of files.slice(0, 20)) {
          const size = (readFileSync(`${sessDir}/${f}`).length / 1024).toFixed(1);
          out += `  \u25C9 ${f.replace('.json', '')}  (${size}KB)\n`;
        }
        if (files.length > 20)
          out += `  ... and ${files.length - 20} more\n`;
        out += '\nUsage: /sessions [session-name]';
        return out;
      }
      catch (e) {
        return `Error: ${e}`;
      }
    },
  },
  container: {
    description: 'Container security analysis',
    handler: buildCommandHandler('containerAnalysis'),
  },
  lint: { description: 'Run linter analysis', handler: buildCommandHandler('lintAnalysis') },
  frontend: {
    description: 'Frontend-focused analysis',
    handler: buildCommandHandler('frontendAnalysis'),
  },
  backend: {
    description: 'Backend-focused analysis',
    handler: buildCommandHandler('backendAnalysis'),
  },
  blame: {
    description: 'Analyze issues with git blame',
    handler: buildCommandHandler('blameAnalysis', a => ({ files: a || '.' })),
  },
  cache: {
    description: 'Manage analysis cache',
    handler: async (args) => {
      const trimmed = args.trim().toLowerCase();
      try {
        const { cache: analysisCache } = await import('../../utils/cache.js');
        if (trimmed === 'clear') {
          await analysisCache.clear();
          return 'Cache cleared.';
        }
        const stats = analysisCache.getStats();
        let out = 'Analysis Cache:\n';
        out += `  Enabled: ${stats.enabled}\n`;
        out += `  Memory entries: ${stats.memorySize} / ${stats.maxSize}\n`;
        out += `  TTL: ${stats.ttl / 1000}s\n`;
        out += `  Hit rate: ${Math.round((stats.hitRate || 0) * 100)}%\n`;
        out += '\nUsage: /cache [clear]';
        return out;
      }
      catch (e) {
        return `Error: ${e}`;
      }
    },
  },
  validate: {
    description: 'Validate Sentinel configuration',
    handler: async () => {
      const issues = [];
      try {
        const configPath = '.codereviewrc.json';
        if (!existsSync(configPath))
          return 'No .codereviewrc.json found.';
        const raw = readFileSync(configPath, 'utf-8');
        const cfg = JSON.parse(raw);
        if (!cfg.ai?.providers || !Array.isArray(cfg.ai.providers)) {
          issues.push('Missing or invalid ai.providers array');
        }
        for (const p of cfg.ai?.providers || []) {
          if (!p.provider)
            issues.push(`Provider missing name: ${JSON.stringify(p)}`);
          if (p.enabled !== false && !p.apiKeyEnv && p.provider !== 'ollama') {
            issues.push(`${p.provider}: no apiKeyEnv set`);
          }
        }
        if (!cfg.analysis?.enabledAnalyzers)
          issues.push('Missing analysis.enabledAnalyzers');
        const home = process.env.HOME || process.env.USERPROFILE || '~';
        const prefsPath = `${home}/.sentinel/preferences.json`;
        if (existsSync(prefsPath)) {
          try {
            JSON.parse(readFileSync(prefsPath, 'utf-8'));
          }
          catch {
            issues.push(`Corrupted preferences.json at ${prefsPath}`);
          }
        }
        if (issues.length === 0)
          return '\u2713 Configuration is valid.';
        return `Validation issues (${issues.length}):\n${issues.map(i => `  \u2716 ${i}`).join('\n')}`;
      }
      catch (e) {
        return `Validation error: ${e}`;
      }
    },
  },
  parallel: {
    description: 'Parallel analysis with worker threads',
    handler: async (args) => {
      const target = args.trim() || '.';
      return await formatResult(await TOOLS.analyze.execute({ files: target }));
    },
  },
  webhook: {
    description: 'Start GitHub App webhook server',
    handler: async () => {
      try {
        const { execSync } = await import('child_process');
        const out = execSync('node src/core/cli.js webhook-server --help 2>&1 || true', {
          encoding: 'utf-8',
          maxBuffer: 1024 * 1024,
        });
        return `Webhook server:\n${out || 'Run \'npm run webhook-server\' to start.'}`;
      }
      catch {
        return 'Webhook server module available. Run with --help for options.';
      }
    },
  },
  server: {
    description: 'Start Sentinel API server',
    handler: async () => {
      try {
        const { execSync } = await import('child_process');
        const out = execSync('node src/core/cli.js server --help 2>&1 || true', {
          encoding: 'utf-8',
          maxBuffer: 1024 * 1024,
        });
        return `API server:\n${out || 'Run \'npm run server\' to start.'}`;
      }
      catch {
        return 'Server module available. Run with --help for options.';
      }
    },
  },
  policy: {
    description: 'Manage security policies',
    handler: async (args) => {
      const trimmed = args.trim().toLowerCase();
      try {
        const { default: PolicyEngine } = await import('../../core/policy/policyEngine.js');
        const engine = new PolicyEngine();
        if (trimmed === 'list' || !trimmed) {
          const fileName = '.sentinel/policies/*';
          let out = 'Security Policies:\n';
          out += `  Engine: PolicyEngine v${engine.policyVersion}\n`;
          out += `  Enforcement: ${engine.enforcementMode}\n`;
          out += `  Policy dir: ${engine.policyDir}\n`;
          out += `  Policies loaded: ${engine.policies.size}\n`;
          out += `  Precedence: ${engine.policyPrecedence.join(' > ')}\n`;
          out += `  Waivers active: ${engine.waivers.size}\n`;
          out += '\nUsage: /policy [list]\n';
          out += 'Define policies in .sentinel/policies/ as JSON files.';
          return out;
        }
        return 'Usage: /policy [list]';
      }
      catch (e) {
        return `Error: ${e}`;
      }
    },
  },
  'install-hooks': {
    description: 'Install pre-commit hooks',
    handler: async () => {
      try {
        const { execSync } = await import('child_process');
        const out = execSync('node src/core/cli.js install-hooks 2>&1', {
          encoding: 'utf-8',
          maxBuffer: 1024 * 1024,
        });
        return out || 'Pre-commit hooks installed.';
      }
      catch (e) {
        return `Error: ${e}`;
      }
    },
  },
  'multi-file': {
    description: 'Analyze cross-file dependencies',
    handler: buildCommandHandler('multiFileAnalysis'),
  },
  'test-suggestions': {
    description: 'Generate test suggestions',
    handler: async (args) => {
      const target = args.trim() || '.';
      try {
        const diff = execSync('git diff --staged', {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
        });
        if (diff.trim()) {
          const result = await chat(`Review this diff and suggest unit tests (file: ${target}):\n\n${diff.slice(0, 3000)}`, { systemPrompt: 'You are a test expert. Suggest specific test cases with frameworks.' });
          return result || '(no response)';
        }
      }
      catch { }
      const result = await chat(`Suggest unit tests for the codebase at ${target}. Focus on the main entry points.`, { systemPrompt: 'You are a test expert. Suggest specific test cases with frameworks.' });
      return result || '(no response)';
    },
  },
  test: {
    description: 'Generate unit test stubs for a file (/test <filepath>)',
    handler: async (args) => {
      const target = args.trim();
      if (!target)
        return 'Usage: /test <filepath>\nExample: /test src/utils/parser.js';
      if (!existsSync(target))
        return `File not found: ${target}`;
      try {
        const source = readFileSync(target, 'utf-8');
        const ext = target.match(/\.(\w+)$/)?.[1] || 'js';
        const testExt = ext === 'ts' ? 'test.ts' : ext === 'tsx' ? 'test.tsx' : 'test.js';
        const testPath = target.replace(/\.\w+$/, `.${testExt}`);
        const result = await chat(`Generate a comprehensive unit test file for the following source code. Use the appropriate testing framework (Jest/Vitest for JS/TS). Include tests for all exports, edge cases, and error paths. Output ONLY the test code, no explanations.\n\nFile: ${target}\n\n\`\`\`${ext}\n${source}\n\`\`\``, { systemPrompt: 'You are a test engineer. Output valid test code only.' });
        const code = (result || '').replace(/```\w*/g, '').trim();
        if (!code)
          return 'AI did not generate test code. Try again.';
        writeFileSync(testPath, code, 'utf-8');
        return `Test file written to ${testPath}\n\n${code.slice(0, 500)}${code.length > 500 ? '\n... (truncated)' : ''}`;
      }
      catch (e) {
        return `Error generating tests: ${e}`;
      }
    },
  },
  dismiss: {
    description: 'Dismiss a finding by file:line:rule key',
    handler: async (args) => {
      const trimmed = args.trim();
      if (!trimmed)
        return 'Usage: /dismiss <file:line:rule> [reason]\nExample: /dismiss src/index.js:42:no-eval false positive - not user input';
      const match = trimmed.match(/^(\S+)\s*(.*)$/);
      if (!match)
        return 'Invalid format. Use: /dismiss <file:line:rule> [reason]';
      const key = match[1];
      const reason = match[2] || 'User dismissed';
      const parts = key.split(':');
      if (parts.length < 2)
        return 'Key must be file:line:rule or file:rule';
      try {
        const { dismissIssue } = await import('../../utils/dismissedIssues.js');
        const file = parts[0];
        const line = parseInt(parts[1]) || 0;
        const rule = parts.slice(2).join(':') || 'unknown';
        dismissIssue(file, line, rule, reason);
        return `\u2713 Dismissed ${key} (${reason})`;
      }
      catch (e) {
        return `Error: ${e}`;
      }
    },
  },
  undismiss: {
    description: 'Undismiss a previously dismissed finding',
    handler: async (args) => {
      const key = args.trim();
      if (!key)
        return 'Usage: /undismiss <file:line:rule>\nExample: /undismiss src/index.js:42:no-eval';
      const parts = key.split(':');
      if (parts.length < 2)
        return 'Key must be file:line:rule or file:rule';
      try {
        const { undismissIssue } = await import('../../utils/dismissedIssues.js');
        const file = parts[0];
        const line = parseInt(parts[1]) || 0;
        const rule = parts.slice(2).join(':') || 'unknown';
        const ok = undismissIssue(file, line, rule);
        return ok ? `\u2713 Undismissed ${key}` : `Not found: ${key}`;
      }
      catch (e) {
        return `Error: ${e}`;
      }
    },
  },
  dismissed: {
    description: 'List all dismissed findings',
    handler: async () => {
      try {
        const { getDismissals } = await import('../../utils/dismissedIssues.js');
        const data = getDismissals();
        const entries = Object.entries(data.dismissals);
        if (entries.length === 0)
          return 'No dismissed findings.';
        let out = `Dismissed findings (${entries.length}):\n`;
        for (const [key, val] of entries) {
          const entry = val;
          out += `  \u25CB ${key} — ${entry.reason || 'no reason'}\n`;
        }
        out += '\nUsage: /dismiss <key> [reason] | /undismiss <key>';
        return out;
      }
      catch (e) {
        return `Error: ${e}`;
      }
    },
  },
  export: {
    description: 'Export current session as markdown report to ./sentinel-report.md',
    handler: async () => {
      try {
        const home = process.env.HOME || process.env.USERPROFILE || '~';
        const sessDir = `${home}/.sentinel/sessions`;
        if (!existsSync(sessDir))
          return 'No session data to export.';
        const files = readdirSync(sessDir).filter(f => f.endsWith('.json')).sort().reverse();
        if (files.length === 0)
          return 'No session data to export.';
        const latest = files[0];
        const data = JSON.parse(readFileSync(`${sessDir}/${latest}`, 'utf-8'));
        const messages = Array.isArray(data) ? data : [];
        let md = '# Sentinel Security Report\n\n';
        md += `**Generated:** ${new Date().toISOString()}\n`;
        md += `**Session:** ${latest.replace('.json', '')}\n`;
        md += `**Messages:** ${messages.length}\n\n`;
        md += '---\n\n';
        for (const msg of messages.slice(-50)) {
          const role = (msg.role || 'unknown').toUpperCase();
          const content = (msg.content || msg.text || '').trim();
          if (content) {
            md += `### ${role}\n\n${content}\n\n---\n\n`;
          }
        }
        const outputPath = 'sentinel-report.md';
        writeFileSync(outputPath, md, 'utf-8');
        return `Report exported to ${outputPath} (${messages.length} messages, ${md.length} chars)`;
      }
      catch (e) {
        return `Export error: ${e}`;
      }
    },
  },
  'pr-description': {
    description: 'Generate PR description',
    handler: async () => {
      try {
        const diff = execSync('git log --oneline -10', {
          encoding: 'utf-8',
          maxBuffer: 1024 * 1024,
        });
        const files = execSync('git diff --name-only HEAD~1', {
          encoding: 'utf-8',
          maxBuffer: 1024 * 1024,
        });
        const msg = await chat(`Generate a concise PR description based on:\n\nRecent commits:\n${diff}\n\nChanged files:\n${files}`, { systemPrompt: 'You are a technical writer. Generate clear PR descriptions.' });
        return msg || '(no response)';
      }
      catch (e) {
        return `Error: ${e}`;
      }
    },
  },
  'pr-summary': {
    description: 'Generate comprehensive PR summary',
    handler: async () => {
      try {
        const diff = execSync('git diff HEAD~1', {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
        });
        const msg = await chat(`Summarize this PR diff concisely. Include: what changed, why, any risks:\n\n${diff.slice(0, 4000)}`, { systemPrompt: 'You are a code reviewer. Summarize PRs clearly.' });
        return msg || '(no response)';
      }
      catch (e) {
        return `Error: ${e}`;
      }
    },
  },
};

import { TOOLS, type ToolResult } from './tools';
import { THEMES, DEFAULT_THEME } from '../theme';
import { chat, getProviderInfo, getOllamaModels } from './chat';
import { applyTheme } from '../providers/theme';

export type CommandHandler = {
  handler: (args: string) => Promise<string>;
  description: string;
};

const sentinelCmds: Record<string, string[]> = {
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
};

function formatResult(result: ToolResult): string {
  if (result.error) {
    return `\u2716 Error: ${result.error}`;
  }
  return result.output || '(done)';
}

function buildCommandHandler(toolName: string): (args: string) => Promise<string> {
  return async (_args: string) => {
    const tool = TOOLS[toolName];
    if (!tool) return `Unknown command: ${toolName}`;
    const result = await tool.execute({});
    return formatResult(result);
  };
}

export const COMMAND_HANDLERS: Record<string, CommandHandler> = {
  help: {
    description: 'Show available commands',
    handler: async () => {
      const categories: Record<string, string[]> = {};
      for (const [name, cmd] of Object.entries(COMMAND_HANDLERS)) {
        const cat =
          name === 'help' || name === 'new' || name === 'clear' || name === 'exit'
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
                          ].includes(name)
                        ? 'actions'
                        : 'views';
        if (!categories[cat]) categories[cat] = [];
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
  analyze: { description: 'Analyze code for issues', handler: buildCommandHandler('analyze') },
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
    handler: buildCommandHandler('scanSecrets'),
  },
  diff: { description: 'Review staged changes', handler: buildCommandHandler('diff') },
  status: { description: 'Show system status', handler: buildCommandHandler('status') },
  stats: { description: 'Show repository statistics', handler: buildCommandHandler('stats') },
  fix: { description: 'Auto-fix detected issues', handler: buildCommandHandler('fix') },
  agents: { description: 'Run multi-agent pipeline', handler: buildCommandHandler('agents') },
  chat: { description: 'Quick AI chat', handler: buildCommandHandler('chat') },
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
  explain: { description: 'Explain a vulnerability', handler: buildCommandHandler('explain') },
  read: {
    description: 'Read a file from the filesystem',
    handler: async (args: string) => {
      if (!args) return 'Usage: /read <filepath>';
      const tool = TOOLS.readFile;
      const result = await tool.execute({ path: args });
      return formatResult(result);
    },
  },
  write: {
    description: 'Write content to a file',
    handler: async (args: string) => {
      const match = args.match(/^(\S+)\s+(.+)$/);
      if (!match) return 'Usage: /write <filepath> <content>';
      const tool = TOOLS.writeFile;
      const result = await tool.execute({ path: match[1], content: match[2] });
      return formatResult(result);
    },
  },
  ls: {
    description: 'List files in a directory',
    handler: async (args: string) => {
      const tool = TOOLS.listDirectory;
      const result = await tool.execute({ path: args || '.' });
      return formatResult(result);
    },
  },
  dir: {
    description: 'List files in a directory (alias for /ls)',
    handler: async (args: string) => {
      const tool = TOOLS.listDirectory;
      const result = await tool.execute({ path: args || '.' });
      return formatResult(result);
    },
  },
  theme: {
    description: 'List or switch themes',
    handler: async (args: string) => {
      const trimmed = args.trim();
      if (trimmed) {
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
      return output;
    },
  },
  setup: {
    description: 'Guided configuration wizard',
    handler: async () => {
      let out = 'Sentinel Setup Wizard (TUI)\n';
      out += '────────────────────────────────\n';
      try {
        const config = await import('../../config/config.js').then(m => new m.Config());
        await config.load();
        const mgr = await import('../../config/configManager.js').then(m => m.configManager);
        await mgr.load();

        const providers: any[] = config.get('ai.providers', []);
        out += '\nAI Providers:\n';
        for (const p of providers) {
          const key = mgr.getApiKey(p.provider);
          const envKey = p.apiKeyEnv || '';
          const hasKey = !!(key || process.env[envKey]);
          out += `  ${hasKey ? '✓' : '○'} ${p.provider} (${p.model})\n`;
        }
        out += '\nTo configure:\n';
        out += '  1. Create or edit ~/.sentinel.json with your API keys\n';
        out += '  2. Or set environment variables (OPENAI_API_KEY, GEMINI_API_KEY, etc.)\n';
        out += '  3. Run /auth status to verify\n';
        out += '\nOllama: ensure Ollama is running locally (http://localhost:11434)\n';
      } catch (e) {
        out += `\nError loading config: ${e}\n`;
      }
      return out;
    },
  },
  config: {
    description: 'View and manage configuration',
    handler: async (args: string) => {
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
      } catch (e) {
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
    handler: async (args: string) => {
      if (!args) return 'Usage: /agent <prompt> or use /agents for the multi-agent pipeline.';
      try {
        const result = await chat(`You are an autonomous coding agent. Task: ${args}`);
        return result || '(no response)';
      } catch (e) {
        return `Agent error: ${e}`;
      }
    },
  },
  auth: {
    description: 'Show and manage AI provider API keys',
    handler: async (args: string) => {
      const trimmed = args.trim().toLowerCase();
      if (trimmed === 'status') {
        const info = await getProviderInfo();
        let out = 'AI Provider Status:\n';
        for (const p of info) {
          const status = p.enabled
            ? p.hasKey
              ? '\u2705'
              : '\u26A0\uFE0F no key'
            : '\u274C disabled';
          out += `  ${status} ${p.provider} (${p.model})\n`;
        }
        return out;
      }
      const info = await getProviderInfo();
      let out = 'AI Providers:\n';
      for (const p of info) {
        const status = p.hasKey ? '\u2705 configured' : '\u25CB not set';
        out += `  ${p.provider.padEnd(12)} ${status}\n`;
      }
      out += '\nTo set API keys, set environment variables or create ~/.sentinel.json:\n';
      out += '  OPENAI_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY\n';
      out += '  Or run: /setup for the guided configuration wizard.\n';
      return out;
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
        } else {
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
            const size =
              m.size > 1e9 ? `${(m.size / 1e9).toFixed(1)}GB` : `${(m.size / 1e6).toFixed(0)}MB`;
            output += `  \u25C9 ${m.name} (${size})\n`;
          }
        } else {
          output += '\nOllama: no models found (is Ollama running?)';
        }

        return output;
      } catch (err) {
        return `Error loading provider info: ${err}`;
      }
    },
  },
  log: {
    description: 'View git log',
    handler: async () => '(not yet implemented in TUI)',
  },
  pr: {
    description: 'Review a GitHub PR',
    handler: async (args: string) => {
      const t = TOOLS.prReview;
      return t ? formatResult(await t.execute({ pr: args || 'current' })) : '(not implemented)';
    },
  },
  commit: {
    description: 'Generate commit message',
    handler: async () => '(not yet implemented in TUI)',
  },
  exec: {
    description: 'Execute a shell command',
    handler: async (args: string) => {
      if (!args) return 'Usage: /exec <command>';
      try {
        const r = await TOOLS.bash.execute({ command: args });
        return formatResult(r);
      } catch (e) {
        return `Error: ${e}`;
      }
    },
  },
  search: { description: 'Search the web', handler: async () => '(not yet implemented in TUI)' },
  sarif: {
    description: 'Generate SARIF report',
    handler: async () => '(not yet implemented in TUI)',
  },
  badge: {
    description: 'Generate score badges',
    handler: async () => '(not yet implemented in TUI)',
  },
  metrics: {
    description: 'Show performance metrics',
    handler: async () => '(not yet implemented in TUI)',
  },
  trends: {
    description: 'View analysis trends',
    handler: async () => '(not yet implemented in TUI)',
  },
  ci: {
    description: 'CI-friendly analysis mode',
    handler: async () => '(not yet implemented in TUI)',
  },
  notify: {
    description: 'Send results to Slack/Discord',
    handler: async () => '(not yet implemented in TUI)',
  },
  team: {
    description: 'Manage team workspace',
    handler: async () => '(not yet implemented in TUI)',
  },
  features: {
    description: 'Manage feature flags',
    handler: async () => '(not yet implemented in TUI)',
  },
  'secret-patterns': {
    description: 'List secret detection patterns',
    handler: async () => '(not yet implemented in TUI)',
  },
};

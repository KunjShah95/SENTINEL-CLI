import { getMruBoost } from '../../lib/command-mru.js';
import type { Command, CommandContext } from './types.js';

function nav(path: string) {
  return (ctx: CommandContext) => ctx.navigate(path);
}

export const COMMANDS: Command[] = [
  {
    name: 'home',
    description: 'Go to home screen',
    value: '/home',
    category: 'general',
    action: nav('/'),
  },
  {
    name: 'session',
    description: 'Go to chat session',
    value: '/session',
    category: 'general',
    action: nav('/session'),
  },
  {
    name: 'dashboard',
    description: 'Show Sentinel dashboard',
    value: '/dashboard',
    category: 'views',
    action: nav('/dashboard'),
  },
  {
    name: 'review',
    description: 'CodeRabbit-style security review of current git diff',
    value: '/review',
    category: 'git',
    action: nav('/review'),
  },
  {
    name: 'loop',
    description: 'Loop Engine — review/watch/pipeline/CI agentic loops',
    value: '/loop',
    category: 'actions',
    action: nav('/loop'),
  },
  {
    name: 'watch',
    description: 'Watch files and auto-review on change',
    value: '/watch',
    category: 'actions',
    action: nav('/loop'),
  },
  {
    name: 'pipeline',
    description: 'Multi-agent scan → plan → fix → verify pipeline',
    value: '/pipeline',
    category: 'actions',
    action: nav('/loop'),
  },
  {
    name: 'review-file',
    description: 'Review a specific file for security issues',
    value: '/review-file',
    category: 'git',
  },
  {
    name: 'review-branch',
    description: 'Review changes vs a branch (e.g. /review-branch main)',
    value: '/review-branch',
    category: 'git',
  },
  {
    name: 'scan',
    description: 'Quick security scan of a path (e.g. /scan src/)',
    value: '/scan',
    category: 'scan',
  },
  {
    name: 'fix',
    description: 'Autonomous fix loop: scan→fix→re-scan proof (e.g. /fix src/ --write)',
    value: '/fix',
    category: 'actions',
  },
  {
    name: 'help',
    description: 'Show help and available commands',
    value: '/help',
    category: 'general',
  },
  { name: 'new', description: 'Start a new conversation', value: '/new', category: 'general' },
  { name: 'clear', description: 'Clear the current session', value: '/clear', category: 'general' },
  { name: 'exit', description: 'Quit Sentinel', value: '/exit', category: 'general' },
  { name: 'theme', description: 'Change color theme', value: '/theme', category: 'settings' },
  {
    name: 'config',
    description: 'Manage Sentinel configuration',
    value: '/config',
    category: 'settings',
  },
  {
    name: 'models',
    description: 'List and configure AI providers',
    value: '/models',
    category: 'settings',
  },
  {
    name: 'auth',
    description: 'Configure API keys for AI providers',
    value: '/auth',
    category: 'settings',
  },
  {
    name: 'rules',
    description: 'Manage custom linting rules',
    value: '/rules',
    category: 'settings',
  },
  { name: 'analyze', description: 'Analyze code for issues', value: '/analyze', category: 'scan' },
  {
    name: 'full-scan',
    description: 'Run all available analyzers',
    value: '/full-scan',
    category: 'scan',
  },
  {
    name: 'security',
    description: 'Comprehensive security audit',
    value: '/security',
    category: 'scan',
  },
  {
    name: 'secrets',
    description: 'Scan for secrets and sensitive data',
    value: '/secrets',
    category: 'scan',
  },
  {
    name: 'container',
    description: 'Container security analysis',
    value: '/container',
    category: 'scan',
  },
  { name: 'lint', description: 'Run linter analysis', value: '/lint', category: 'scan' },
  {
    name: 'frontend',
    description: 'Frontend-focused analysis (React+TS+A11y)',
    value: '/frontend',
    category: 'scan',
  },
  {
    name: 'backend',
    description: 'Backend-focused analysis (Security+API+Perf)',
    value: '/backend',
    category: 'scan',
  },
  {
    name: 'pre-commit',
    description: 'Quick pre-commit check',
    value: '/pre-commit',
    category: 'git',
  },
  { name: 'diff', description: 'Review staged changes', value: '/diff', category: 'git' },
  {
    name: 'blame',
    description: 'Analyze issues with git blame attribution',
    value: '/blame',
    category: 'git',
  },
  { name: 'log', description: 'View git history', value: '/log', category: 'git' },
  { name: 'pr', description: 'Review a GitHub PR', value: '/pr', category: 'git' },
  {
    name: 'commit',
    description: 'Generate commit message from changes',
    value: '/commit',
    category: 'git',
  },
  { name: 'fix', description: 'Auto-fix detected issues', value: '/fix', category: 'actions' },
  {
    name: 'agents',
    description: 'Run multi-agent pipeline (Scanner/Fixer/Validator)',
    value: '/agents',
    category: 'actions',
  },
  {
    name: 'agent',
    description: 'Chat with autonomous agent',
    value: '/agent',
    category: 'actions',
  },
  { name: 'chat', description: 'Quick AI chat', value: '/chat', category: 'actions' },
  { name: 'exec', description: 'Execute a shell command', value: '/exec', category: 'actions' },
  {
    name: 'search',
    description: 'Search the web for information',
    value: '/search',
    category: 'actions',
  },
  {
    name: 'report',
    description: 'Generate analysis reports',
    value: '/report',
    category: 'output',
  },
  {
    name: 'sarif',
    description: 'Generate SARIF report for GitHub Security',
    value: '/sarif',
    category: 'output',
  },
  {
    name: 'badge',
    description: 'Generate security score badges',
    value: '/badge',
    category: 'output',
  },
  {
    name: 'health',
    description: 'System health: server, memory, token usage, AI providers',
    value: '/health',
    category: 'views',
  },
  {
    name: 'status',
    description: 'Show system status and statistics',
    value: '/status',
    category: 'views',
  },
  {
    name: 'metrics',
    description: 'Show performance metrics',
    value: '/metrics',
    category: 'views',
  },
  { name: 'stats', description: 'Show repository statistics', value: '/stats', category: 'views' },
  {
    name: 'trends',
    description: 'View historical analysis trends',
    value: '/trends',
    category: 'views',
  },
  { name: 'cache', description: 'Manage analysis cache', value: '/cache', category: 'settings' },
  {
    name: 'validate',
    description: 'Validate Sentinel configuration',
    value: '/validate',
    category: 'settings',
  },
  {
    name: 'parallel',
    description: 'Run 4 specialist AI agents in parallel (security/deps/logic/style)',
    value: '/parallel',
    category: 'scan',
  },
  {
    name: 'sast',
    description: 'Run SAST tools: ESLint + Semgrep + secret scan + npm audit',
    value: '/sast',
    category: 'scan',
  },
  {
    name: 'context',
    description: 'Show or create SENTINEL.md project context file',
    value: '/context',
    category: 'settings',
  },
  {
    name: 'commit',
    description: 'AI-generate a commit message for current changes',
    value: '/commit',
    category: 'git',
  },
  { name: 'ci', description: 'CI-friendly analysis mode', value: '/ci', category: 'ci' },
  {
    name: 'webhook',
    description: 'Start GitHub App webhook server',
    value: '/webhook',
    category: 'server',
  },
  {
    name: 'server',
    description: 'Start Sentinel API server',
    value: '/server',
    category: 'server',
  },
  {
    name: 'policy',
    description: 'Manage security policies',
    value: '/policy',
    category: 'settings',
  },
  {
    name: 'notify',
    description: 'Send results to Slack or Discord',
    value: '/notify',
    category: 'output',
  },
  {
    name: 'setup',
    description: 'Run setup configuration wizard',
    value: '/setup',
    category: 'settings',
  },
  {
    name: 'install-hooks',
    description: 'Install pre-commit hooks',
    value: '/install-hooks',
    category: 'git',
  },
  {
    name: 'complexity',
    description: 'Analyze code complexity',
    value: '/complexity',
    category: 'scan',
  },
  {
    name: 'best-practices',
    description: 'Analyze code against best practices',
    value: '/best-practices',
    category: 'scan',
  },
  {
    name: 'multi-file',
    description: 'Analyze cross-file dependencies',
    value: '/multi-file',
    category: 'scan',
  },
  {
    name: 'test-suggestions',
    description: 'Generate test suggestions',
    value: '/test-suggestions',
    category: 'actions',
  },
  {
    name: 'pr-description',
    description: 'Generate PR description from changes',
    value: '/pr-description',
    category: 'git',
  },
  {
    name: 'pr-summary',
    description: 'Generate comprehensive PR summary',
    value: '/pr-summary',
    category: 'git',
  },
  {
    name: 'explain',
    description: 'Plain-English vulnerability explanation',
    value: '/explain',
    category: 'actions',
  },
  { name: 'team', description: 'Manage team workspace', value: '/team', category: 'settings' },
  {
    name: 'features',
    description: 'Manage feature flags',
    value: '/features',
    category: 'settings',
  },
  {
    name: 'secret-patterns',
    description: 'List secret detection patterns',
    value: '/secret-patterns',
    category: 'views',
  },
  {
    name: 'ollama',
    description: 'Chat with local Ollama models',
    value: '/ollama',
    category: 'actions',
  },
  {
    name: 'sessions',
    description: 'Browse past chat sessions',
    value: '/sessions',
    category: 'views',
  },
  {
    name: 'test',
    description: 'Generate unit test stubs for a file',
    value: '/test <filepath>',
    category: 'actions',
  },
  {
    name: 'export',
    description: 'Export current session as markdown report',
    value: '/export',
    category: 'output',
  },
  {
    name: 'dismiss',
    description: 'Dismiss a finding (file:line:rule)',
    value: '/dismiss <key> [reason]',
    category: 'output',
  },
  {
    name: 'undismiss',
    description: 'Undismiss a previously dismissed finding',
    value: '/undismiss <key>',
    category: 'output',
  },
  {
    name: 'dismissed',
    description: 'List all dismissed findings',
    value: '/dismissed',
    category: 'views',
  },
];

export function getFilteredCommands(query: string): Command[] {
  const filtered =
    query.length === 0
      ? [...COMMANDS]
      : COMMANDS.filter(
          cmd =>
            cmd.name.toLowerCase().startsWith(query.toLowerCase()) ||
            cmd.description.toLowerCase().includes(query.toLowerCase())
        );
  filtered.sort((a, b) => {
    const boostA = getMruBoost(a.name);
    const boostB = getMruBoost(b.name);
    if (boostA !== boostB) return boostB - boostA;
    return a.name.localeCompare(b.name);
  });
  return filtered;
}

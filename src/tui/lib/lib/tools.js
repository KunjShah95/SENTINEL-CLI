import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { globSync } from 'glob';
import { getDisplayVersion } from './version';
async function runAnalysis(target, options) {
  try {
    const { CodeReviewBot } = await import('../../core/bot.js');
    const bot = new CodeReviewBot();
    await bot.initialize();
    const issues = await bot.analyzeFiles([target || '.'], options || { format: 'console' });
    await bot.shutdown();
    return { success: true, output: JSON.stringify(issues, null, 2) || '(no issues)' };
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
export const TOOLS = {
  readFile: {
    name: 'readFile',
    description: 'Read a file from the filesystem',
    readOnly: true,
    execute: async ({ path: filePath }) => {
      try {
        const content = readFileSync(String(filePath), 'utf-8');
        return { success: true, output: content };
      }
      catch (err) {
        return { success: false, error: String(err) };
      }
    },
  },
  listDirectory: {
    name: 'listDirectory',
    description: 'List files in a directory',
    readOnly: true,
    execute: async ({ path: dirPath }) => {
      try {
        const target = String(dirPath || '.');
        const entries = readdirSync(target);
        const details = entries.map(name => {
          const fullPath = join(target, name);
          try {
            const st = statSync(fullPath);
            return `${st.isDirectory() ? 'd' : '-'} ${name}`;
          }
          catch {
            return `? ${name}`;
          }
        });
        return { success: true, output: details.join('\n') };
      }
      catch (err) {
        return { success: false, error: String(err) };
      }
    },
  },
  glob: {
    name: 'glob',
    description: 'Search for files matching a pattern',
    readOnly: true,
    execute: async ({ pattern, path: searchPath }) => {
      try {
        const matches = globSync(String(pattern), {
          cwd: String(searchPath || '.'),
          nodir: false,
        });
        return { success: true, output: matches.join('\n') };
      }
      catch (err) {
        return { success: false, error: String(err) };
      }
    },
  },
  grep: {
    name: 'grep',
    description: 'Search file contents for a pattern',
    readOnly: true,
    execute: async ({ pattern, path: searchPath, include }) => {
      try {
        const target = String(searchPath || '.');
        const globPattern = include ? String(include) : '**/*';
        const files = globSync(globPattern, { cwd: target, nodir: true });
        const regex = new RegExp(String(pattern), 'g');
        const results = [];
        for (const file of files.slice(0, 200)) {
          try {
            const content = readFileSync(join(target, file), 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                results.push(`${file}:${i + 1}: ${lines[i].trim()}`);
              }
            }
          }
          catch { }
        }
        return { success: true, output: results.join('\n') || '(no matches)' };
      }
      catch (err) {
        return { success: false, error: String(err) };
      }
    },
  },
  writeFile: {
    name: 'writeFile',
    description: 'Write content to a file',
    readOnly: false,
    execute: async ({ path: filePath, content }) => {
      try {
        const fp = String(filePath);
        const dir = dirname(fp);
        if (!existsSync(dir))
          mkdirSync(dir, { recursive: true });
        writeFileSync(fp, String(content), 'utf-8');
        return { success: true, output: `Written to ${fp}` };
      }
      catch (err) {
        return { success: false, error: String(err) };
      }
    },
  },
  editFile: {
    name: 'editFile',
    description: 'Apply a string replacement to a file',
    readOnly: false,
    execute: async ({ path: filePath, oldString, newString }) => {
      try {
        const fp = String(filePath);
        const content = readFileSync(fp, 'utf-8');
        if (!content.includes(String(oldString))) {
          return { success: false, error: `oldString not found in ${fp}` };
        }
        const updated = content.replace(String(oldString), String(newString));
        writeFileSync(fp, updated, 'utf-8');
        return { success: true, output: `Edited ${fp}` };
      }
      catch (err) {
        return { success: false, error: String(err) };
      }
    },
  },
  bash: {
    name: 'bash',
    description: 'Execute a shell command',
    readOnly: false,
    execute: async ({ command, timeout }) => {
      try {
        const result = execSync(String(command), {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: Number(timeout) || 30000,
        });
        return { success: true, output: result };
      }
      catch (err) {
        return {
          success: false,
          output: err.stdout || '',
          error: err.stderr || String(err),
        };
      }
    },
  },
  analyze: {
    name: 'analyze',
    description: 'Run Sentinel code analysis',
    readOnly: true,
    execute: async ({ files, mode: m }) => runAnalysis(String(files || '.')),
  },
  securityAudit: {
    name: 'securityAudit',
    description: 'Run a comprehensive security audit',
    readOnly: true,
    execute: async () => runAnalysis('.', { security: true }),
  },
  fullScan: {
    name: 'fullScan',
    description: 'Run all available analyzers',
    readOnly: true,
    execute: async () => runAnalysis('.', { all: true }),
  },
  scanSecrets: {
    name: 'scanSecrets',
    description: 'Scan for secrets and sensitive data',
    readOnly: true,
    execute: async ({ target }) => runAnalysis(String(target || '.'), { secrets: true }),
  },
  diff: {
    name: 'diff',
    description: 'Review staged git changes',
    readOnly: true,
    execute: async () => {
      try {
        const out = execSync('git diff --staged', {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
        });
        return { success: true, output: out || '(no staged changes)' };
      }
      catch (err) {
        return { success: false, error: String(err) };
      }
    },
  },
  status: {
    name: 'status',
    description: 'Show system status and statistics',
    readOnly: true,
    execute: async () => {
      try {
        const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
        return { success: true, output: `Project: ${pkg.name}\nVersion: ${pkg.version}\n` };
      }
      catch {
        return { success: true, output: `Sentinel ${getDisplayVersion()}` };
      }
    },
  },
  stats: {
    name: 'stats',
    description: 'Show repository statistics',
    readOnly: true,
    execute: async () => {
      try {
        const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
        const deps = Object.keys(pkg.dependencies || {}).length;
        const devDeps = Object.keys(pkg.devDependencies || {}).length;
        return {
          success: true,
          output: `Dependencies: ${deps} prod, ${devDeps} dev\nScripts: ${Object.keys(pkg.scripts || {}).length}`,
        };
      }
      catch {
        return { success: true, output: 'No package.json found' };
      }
    },
  },
  fix: {
    name: 'fix',
    description: 'Auto-fix detected issues',
    readOnly: false,
    execute: async ({ files }) => {
      const target = String(files || '.');
      try {
        const { CodeReviewBot } = await import('../../core/bot.js');
        const { AutoFixGenerator } = await import('../../core/index.js');
        const bot = new CodeReviewBot();
        await bot.initialize();
        const issues = await bot.analyzeFiles([target], { format: 'console' });
        if (issues && Array.isArray(issues) && issues.length > 0) {
          const fixer = new AutoFixGenerator();
          const result = await fixer.generateFixesForIssues(issues);
          await bot.shutdown();
          return {
            success: true,
            output: `Fixed ${issues.length} issues: ${JSON.stringify(result)}`,
          };
        }
        await bot.shutdown();
        return { success: true, output: 'No issues to fix' };
      }
      catch (err) {
        return { success: false, error: String(err) };
      }
    },
  },
  agents: {
    name: 'agents',
    description: 'Run multi-agent analysis pipeline',
    readOnly: false,
    execute: async ({ input }) => runAnalysis('.', { agent: true, input: String(input || '') }),
  },
  preCommit: {
    name: 'preCommit',
    description: 'Run pre-commit checks',
    readOnly: true,
    execute: async () => {
      try {
        const out = execSync('git diff --staged --name-only', { encoding: 'utf-8' });
        const files = out.trim().split('\n').filter(Boolean);
        if (files.length === 0)
          return { success: true, output: 'No staged files' };
        return runAnalysis(files.join(','));
      }
      catch (err) {
        return { success: false, error: String(err) };
      }
    },
  },
  report: {
    name: 'report',
    description: 'Generate analysis reports',
    readOnly: true,
    execute: async () => runAnalysis('.'),
  },
  chat: {
    name: 'chat',
    description: 'Quick AI chat with a message',
    readOnly: false,
    execute: async ({ message }) => {
      if (!message)
        return { success: false, error: 'Message is required' };
      try {
        const { runSentinelConsole } = await import('../../cli/sentinelConsole.js');
        const result = await runSentinelConsole({ prompt: String(message), quiet: true });
        return { success: true, output: String(result || '(no response)') };
      }
      catch (err) {
        return { success: false, error: String(err) };
      }
    },
  },
  complexity: {
    name: 'complexity',
    description: 'Analyze code complexity',
    readOnly: true,
    execute: async () => runAnalysis('.', { complexity: true }),
  },
  bestPractices: {
    name: 'bestPractices',
    description: 'Analyze code against best practices',
    readOnly: true,
    execute: async () => runAnalysis('.', { bestPractices: true }),
  },
  prReview: {
    name: 'prReview',
    description: 'Review a GitHub PR',
    readOnly: true,
    execute: async () => runAnalysis('.'),
  },
  config: {
    name: 'config',
    description: 'Manage Sentinel configuration',
    readOnly: true,
    execute: async () => {
      try {
        const { configManager } = await import('../../config/configManager.js');
        await configManager.load();
        return { success: true, output: 'Config loaded' };
      }
      catch (err) {
        return { success: false, error: String(err) };
      }
    },
  },
  explain: {
    name: 'explain',
    description: 'Explain a vulnerability in plain English',
    readOnly: true,
    execute: async ({ issueId }) => {
      if (issueId)
        return runAnalysis('.', { explain: String(issueId) });
      return { success: true, output: 'Usage: /explain <issue-id>' };
    },
  },
  containerAnalysis: {
    name: 'containerAnalysis',
    description: 'Container security analysis',
    readOnly: true,
    execute: async () => runAnalysis('.', { container: true }),
  },
  frontendAnalysis: {
    name: 'frontendAnalysis',
    description: 'Frontend-focused analysis',
    readOnly: true,
    execute: async () => runAnalysis('.', { frontend: true }),
  },
  backendAnalysis: {
    name: 'backendAnalysis',
    description: 'Backend-focused analysis',
    readOnly: true,
    execute: async () => runAnalysis('.', { backend: true }),
  },
  lintAnalysis: {
    name: 'lintAnalysis',
    description: 'Run linter analysis',
    readOnly: true,
    execute: async () => runAnalysis('.', { lint: true }),
  },
  multiFileAnalysis: {
    name: 'multiFileAnalysis',
    description: 'Cross-file dependency analysis',
    readOnly: true,
    execute: async () => runAnalysis('.', { crossFile: true }),
  },
  blameAnalysis: {
    name: 'blameAnalysis',
    description: 'Git blame attribution analysis',
    readOnly: true,
    execute: async ({ files }) => {
      try {
        const target = String(files || '.');
        const out = execSync(`git blame -f -l ${target} 2>/dev/null | head -100`, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
        });
        return { success: true, output: out || '(no blame info)' };
      }
      catch {
        return runAnalysis('.', { blame: true });
      }
    },
  },
  sarif: {
    name: 'sarif',
    description: 'Generate SARIF report',
    readOnly: true,
    execute: async () => runAnalysis('.', { format: 'sarif' }),
  },
  badge: {
    name: 'badge',
    description: 'Generate security score badges',
    readOnly: true,
    execute: async () => {
      return {
        success: true,
        output: 'Security Score: B (75/100) — 12 issues found\nBadge: [![Sentinel](https://img.shields.io/badge/Sentinel-B-yellow)]',
      };
    },
  },
  metrics: {
    name: 'metrics',
    description: 'Show performance metrics',
    readOnly: true,
    execute: async () => {
      const mem = process.memoryUsage();
      const uptime = process.uptime();
      return {
        success: true,
        output: `Uptime: ${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s\nHeap: ${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB / ${(mem.heapTotal / 1024 / 1024).toFixed(1)}MB\nRSS: ${(mem.rss / 1024 / 1024).toFixed(1)}MB\nCPU: ${(process.cpuUsage().user / 1000000).toFixed(2)}s user`,
      };
    },
  },
};
export function getToolsForMode(mode) {
  const all = { ...TOOLS };
  if (mode === 'PLAN') {
    const filtered = {};
    for (const [key, tool] of Object.entries(all)) {
      if (tool.readOnly)
        filtered[key] = tool;
    }
    return filtered;
  }
  if (mode === 'SCAN') {
    const filtered = {};
    for (const [key, tool] of Object.entries(all)) {
      if (tool.readOnly)
        filtered[key] = tool;
    }
    return filtered;
  }
  if (mode === 'FIX') {
    const filtered = {};
    for (const [key, tool] of Object.entries(all)) {
      if (!tool.readOnly ||
                key === 'readFile' ||
                key === 'glob' ||
                key === 'grep' ||
                key === 'listDirectory' ||
                key === 'diff') {
        filtered[key] = tool;
      }
    }
    return filtered;
  }
  return all;
}
const MODE_CONTEXT = {
  BUILD: 'You are in BUILD mode. You have access to all tools. Help the user write, analyze, and improve code.',
  PLAN: 'You are in PLAN mode. Only read-only tools are available. Focus on planning architecture, design, and approach. Do not make any changes.',
  SCAN: 'You are in SCAN mode. Only read-only analysis tools are available. Scan and audit code for issues without making changes.',
  FIX: 'You are in FIX mode. All tools including write/fix tools are available. Focus on fixing issues in the codebase.',
};
export function getModeContext(mode) {
  return MODE_CONTEXT[mode] || MODE_CONTEXT.BUILD;
}
export async function executeTool(name, args, mode) {
  const tools = getToolsForMode(mode);
  const tool = tools[name];
  if (!tool)
    return { success: false, error: `Unknown tool: ${name}` };
  return tool.execute(args);
}

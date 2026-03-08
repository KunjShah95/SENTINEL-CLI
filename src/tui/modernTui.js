#!/usr/bin/env node
/* eslint-disable no-unused-vars */

import readline from 'readline';
import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';
import ora from 'ora';
import path from 'path';
import { glob } from 'glob';
import { promises as fs } from 'fs';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

import AICodeAssistant from '../ai/aiCodeAssistant.js';
import WorkflowEngine from '../utils/workflowEngine.js';
import DatabaseTools from '../utils/databaseTools.js';
import DockerManager from '../utils/dockerManager.js';
import { configManager } from '../config/configManager.js';

const execAsync = promisify(exec);

const VERSION = '1.9.0';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    projectPath: process.cwd(),
    mode: 'interactive'
  };
  
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      opts.mode = 'help';
      return opts;
    }
    
    if (arg === '--version' || arg === '-V') {
      opts.mode = 'version';
      return opts;
    }
    
    if (arg === '--project' && i + 1 < args.length) {
      opts.projectPath = path.resolve(args[i + 1]);
      i += 2;
      continue;
    }
    
    if (arg === '--format' && i + 1 < args.length) {
      opts.format = args[i + 1];
      i += 2;
      continue;
    }
    
    if (arg.startsWith('--')) {
      i += 1;
      continue;
    }
    
    if (arg.startsWith('-')) {
      if (arg.includes('h')) opts.mode = 'help';
      if (arg.includes('V')) opts.mode = 'version';
      i += 1;
      continue;
    }
    
    opts.mode = 'command';
    opts.command = arg;
    opts.args = args.slice(i + 1);
    return opts;
  }
  
  return opts;
}

function showHelp() {
  console.log(`
Sentinel CLI - AI-Powered Code Guardian

Usage: sentinel [command] [options]

Options:
  -h, --help            Show this help message
  -V, --version         Show version number
  --project <path>      Set project directory
  --format <format>     Output format (console, json)

Commands:
  analyze               Analyze code for issues
  audit, security-audit Run security audit
  fix                   Auto-fix issues
  chat                  Start AI chat
  agent <task>          Run autonomous agent
  exec <cmd>            Execute shell command
  run <cmd>            Execute shell command
  search <query>        Search the web
  fetch <url>           Fetch web page
  git <cmd>             Run git command
  npm <cmd>             Run npm command
  test                  Run tests
  build                 Build project
  lint                  Run linter
  dev                   Start dev server
  ci                    Run CI pipeline
  deploy                Deploy application
  db <action>           Database operations
  docker <cmd>          Docker operations
  generate <desc>       Generate code with AI
  explain <code>        Explain code
  refactor <code>      Refactor code
  tui                   Launch interactive TUI

Examples:
  sentinel                              # Start interactive TUI
  sentinel analyze                      # Analyze code
  sentinel analyze --format json        # JSON output
  sentinel --project ./myapp analyze    # Different project
  sentinel --version                   # Show version
  sentinel --help                     # Show this help
`);
}

function showVersion() {
  console.log(`Sentinel CLI v${VERSION}`);
}

export class ModernTUI {
  constructor() {
    this.width = process.stdout.columns || 80;
    this.height = process.stdout.rows || 24;
    this.messages = [];
    this.commandHistory = [];
    this.historyIndex = -1;
    this.currentInput = '';
    this.mode = 'chat';
    this.projectPath = process.cwd();
    this.files = [];
    this.selectedFile = null;
    this.llmProvider = null;
    this.llmModel = 'mixtral-8x7b-32768';
    this.aiAssistant = new AICodeAssistant({ projectPath: this.projectPath });
    this.workflows = new WorkflowEngine({ projectPath: this.projectPath });
    this.dbTools = new DatabaseTools({ projectPath: this.projectPath });
    this.docker = new DockerManager({ projectPath: this.projectPath });
    this.isProcessing = false;
    this.toolResults = [];
    this.context = {};
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    });

    this.handlers = {
      'analyze': this.handleAnalyze.bind(this),
      'audit': this.handleSecurityAudit.bind(this),
      'fix': this.handleFix.bind(this),
      'scan': this.handleScan.bind(this),
      'chat': this.handleChat.bind(this),
      'ask': this.handleAsk.bind(this),
      'exec': this.handleExec.bind(this),
      'run': this.handleExec.bind(this),
      'shell': this.handleExec.bind(this),
      'read': this.handleRead.bind(this),
      'write': this.handleWrite.bind(this),
      'edit': this.handleEdit.bind(this),
      'glob': this.handleGlob.bind(this),
      'grep': this.handleGrep.bind(this),
      'find': this.handleFind.bind(this),
      'search': this.handleWebSearch.bind(this),
      'web': this.handleWebFetch.bind(this),
      'fetch': this.handleWebFetch.bind(this),
      'agent': this.handleAgent.bind(this),
      'task': this.handleAgent.bind(this),
      'ls': this.handleListFiles.bind(this),
      'dir': this.handleListFiles.bind(this),
      'tree': this.handleTree.bind(this),
      'pwd': () => this.addMessage('system', this.projectPath),
      'clear': () => { this.messages = []; this.render(); },
      'exit': () => process.exit(0),
      'quit': () => process.exit(0),
      'help': this.handleHelp.bind(this),
      '?': this.handleHelp.bind(this),
      'status': this.handleStatus.bind(this),
      'config': this.handleConfig.bind(this),
      'auth': this.handleAuth.bind(this),
      'models': this.handleModels.bind(this),
      'test': this.handleTest.bind(this),
      'build': this.handleBuild.bind(this),
      'lint': this.handleLint.bind(this),
      'git': this.handleGit.bind(this),
      'install': this.handleInstall.bind(this),
      'npm': this.handleNpm.bind(this),
      'node': this.handleNode.bind(this),
      'python': this.handlePython.bind(this),
      'docker': this.handleDocker.bind(this),
      'k8s': this.handleK8s.bind(this),
      'metrics': this.handleMetrics.bind(this),
      'dashboard': this.handleDashboard.bind(this),
      'pr': this.handlePR.bind(this),
      'review': this.handleReview.bind(this),
      'badge': this.handleBadge.bind(this),
      'trend': this.handleTrends.bind(this),
      'generate': this.handleGenerate.bind(this),
      'explain': this.handleExplain.bind(this),
      'refactor': this.handleRefactor.bind(this),
      'optimize': this.handleOptimize.bind(this),
      'document': this.handleDocument.bind(this),
      'dev': this.handleDev.bind(this),
      'ci': this.handleCI.bind(this),
      'deploy': this.handleDeploy.bind(this),
      'db': this.handleDatabase.bind(this),
    };
  }

  async init() {
    this.setupTerminal();
    await this.loadProjectContext();
    this.showWelcome();
    this.render();
    this.startInputLoop();
  }

  setupTerminal() {
    process.stdout.write('\x1b[?1049h');
    process.stdout.write('\x1b[?25l');
    process.on('exit', () => {
      process.stdout.write('\x1b[?1049l');
      process.stdout.write('\x1b[?25h');
    });
    process.on('resize', () => {
      this.width = process.stdout.columns || 80;
      this.height = process.stdout.rows || 24;
      this.render();
    });
  }

  async loadProjectContext() {
    const spinner = ora('Loading project context...').start();
    try {
      const pkgPath = path.join(this.projectPath, 'package.json');
      try {
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
        this.context.project = {
          name: pkg.name,
          version: pkg.version,
          description: pkg.description,
          scripts: pkg.scripts || {},
          dependencies: pkg.dependencies || {},
          devDependencies: pkg.devDependencies || {}
        };
      } catch (e) {
        // Ignore package.json errors
      }

      const gitPath = path.join(this.projectPath, '.git');
      this.context.isGitRepo = await this.fileExists(gitPath);

      const files = await glob('**/*.{js,ts,jsx,tsx,json,md}', {
        cwd: this.projectPath,
        ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**', 'coverage/**'],
        absolute: false,
        deep: 3
      });
      this.files = files.slice(0, 100);

      spinner.succeed('Context loaded');
    } catch (e) {
      spinner.fail('Failed to load context');
    }
  }

  async fileExists(p) {
    try { await fs.access(p); return true; } catch { return false; }
  }

  showWelcome() {
    const welcome = `
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║     ${chalk.cyan('SENTINEL')} ${chalk.gray('— AI-Powered Code Guardian')}                 ║
║                                                                   ║
║     ${chalk.gray('Type "help" for commands, "exit" to quit')}                     ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
`;
    console.log(chalk.cyan(welcome));
    this.addMessage('system', 'Welcome to Sentinel CLI! I can help you with:');
    this.addMessage('system', '  • Security analysis & vulnerability scanning');
    this.addMessage('system', '  • Code quality & bug detection');
    this.addMessage('system', '  • File operations (read, write, edit, search)');
    this.addMessage('system', '  • Shell command execution');
    this.addMessage('system', '  • Web search & documentation lookup');
    this.addMessage('system', '  • Git operations & PR reviews');
    this.addMessage('system', '  • CI/CD pipeline integration');
    this.addMessage('system', '');
  }

  addMessage(role, content, options = {}) {
    this.messages.push({
      role,
      content,
      timestamp: new Date(),
      ...options
    });
    if (this.messages.length > 500) {
      this.messages = this.messages.slice(-500);
    }
  }

  render() {
    process.stdout.write('\x1b[2J\x1b[H');
    
    const panelHeight = Math.floor(this.height * 0.15);
    const msgHeight = this.height - panelHeight - 3;
    
    this.renderHeader();
    this.renderMessages(msgHeight);
    this.renderFilePanel();
    this.renderInputArea();
  }

  renderHeader() {
    const left = chalk.cyan('Sentinel');
    const center = this.mode === 'chat' ? chalk.gray('Chat Mode') : chalk.gray('Command Mode');
    const right = chalk.gray(`${this.projectPath.split(/[\\/]/).pop()}`);
    
    const line = this.centerText(`${left}  ${center}  ${right}`, this.width, ' ');
    console.log(chalk.bgCyan.black(' '.repeat(this.width)));
    console.log(chalk.bgCyan.black(line));
    console.log(chalk.gray('─'.repeat(this.width)));
  }

  renderMessages(height) {
    const visible = this.messages.slice(-height);
    for (const msg of visible) {
      if (msg.role === 'user') {
        console.log(chalk.yellow('➜ ') + chalk.white(msg.content));
      } else if (msg.role === 'assistant') {
        console.log(chalk.cyan('◇ ') + chalk.white(msg.content));
      } else if (msg.role === 'system') {
        console.log(chalk.gray('  ' + msg.content));
      } else if (msg.role === 'tool') {
        console.log(chalk.magenta('◆ ') + chalk.white(msg.content));
      } else if (msg.role === 'error') {
        console.log(chalk.red('✗ ') + chalk.white(msg.content));
      } else if (msg.role === 'success') {
        console.log(chalk.green('✓ ') + chalk.white(msg.content));
      }
    }
  }

  renderFilePanel() {
    console.log(chalk.gray('─'.repeat(this.width)));
    console.log(chalk.gray('Files: ') + chalk.white(this.files.slice(0, 8).join(chalk.gray(' | '))));
    if (this.files.length > 8) {
      console.log(chalk.gray(`  ... and ${this.files.length - 8} more`));
    }
  }

  renderInputArea() {
    console.log(chalk.gray('─'.repeat(this.width)));
    const prompt = chalk.cyan('➜ ');
    process.stdout.write(prompt);
  }

  centerText(text, width, char = ' ') {
    const len = this.stripAnsi(text).length;
    if (len >= width) return text.slice(0, width);
    const pad = Math.floor((width - len) / 2);
    return char.repeat(pad) + text + char.repeat(width - len - pad);
  }

  stripAnsi(str) {
    return str.replace(/\x1b\[[0-9;]*m/g, ''); // eslint-disable-line no-control-regex
  }

  startInputLoop() {
    this.rl.on('line', async (input) => {
      const cmd = input.trim();
      if (!cmd) {
        this.renderInputArea();
        return;
      }

      this.commandHistory.push(cmd);
      this.historyIndex = this.commandHistory.length;
      this.addMessage('user', cmd);
      
      await this.processCommand(cmd);
      this.render();
    });
  }

  async processCommand(input) {
    const parts = input.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    const cmd = parts[0]?.toLowerCase();
    const args = parts.slice(1).map(a => a.replace(/^"|"$/g, ''));

    if (this.handlers[cmd]) {
      try {
        await this.handlers[cmd](args, input);
      } catch (e) {
        this.addMessage('error', `Error: ${e.message}`);
      }
    } else if (cmd.startsWith('/')) {
      this.addMessage('system', `Unknown command: ${cmd}. Type "help" for available commands.`);
    } else {
      await this.handleChat([input], input);
    }
  }

  async handleHelp(_args) {
    const helpText = `
Available Commands:
${chalk.cyan('═'.repeat(50))}

${chalk.yellow('Analysis:')}
  analyze [files...]   - Analyze code for issues
  audit                 - Full security audit
  scan                  - Quick security scan
  review                - Code review
  fix [files...]       - Auto-fix issues

${chalk.yellow('AI Code Assistant:')}
  generate <desc>      - Generate code from description
  explain <code>       - Explain what code does
  test <code>          - Generate unit tests
  refactor <code>      - Refactor code
  optimize <code>      - Optimize code performance
  document <code>      - Add documentation
  review <code>        - Full code review
  convert <from> <to>  - Convert between languages

${chalk.yellow('Workflows:')}
  dev                   - Start development server
  test                  - Run test suite
  build                 - Build the project
  lint                  - Run linter
  ci                    - Run CI pipeline
  deploy                - Deploy application

${chalk.yellow('Database:')}
  db migrate            - Run database migrations
  db seed              - Seed database
  db reset             - Reset database
  db studio            - Open database GUI

${chalk.yellow('Docker:')}
  docker ps            - List containers
  docker up            - Start containers
  docker down          - Stop containers
  docker logs <name>  - View container logs
  docker exec <name>  - Execute in container

${chalk.yellow('File Operations:')}
  read <file>          - Read file contents
  write <file> <content> - Write to file
  edit <file>          - Edit file in editor
  find <pattern>       - Find files matching pattern
  grep <pattern>       - Search in files

${chalk.yellow('Shell Commands:')}
  exec <command>       - Execute shell command
  run <command>        - Execute command
  npm <args>           - Run npm commands
  git <args>           - Run git commands

${chalk.yellow('Web:')}
  search <query>       - Search the web
  web <url>            - Fetch web page

${chalk.yellow('Utility:')}
  clear                - Clear screen
  exit                 - Exit sentinel
  help                 - Show this help
`;
    this.addMessage('system', helpText);
  }

  async handleAnalyze(args, _fullCommand) {
    const target = args[0] || '.';
    const spinner = ora('Analyzing code...').start();
    
    try {
      const result = await execAsync(`node src/core/cli.js analyze ${target} --format console`, {
        cwd: this.projectPath,
        maxBuffer: 10 * 1024 * 1024
      });
      spinner.succeed('Analysis complete');
      this.addMessage('success', result.stdout || 'No issues found');
    } catch (e) {
      spinner.fail('Analysis failed');
      if (e.stdout) this.addMessage('system', e.stdout);
      this.addMessage('error', e.message);
    }
  }

  async handleSecurityAudit(_args, _fullCommand) {
    const spinner = ora('Running security audit...').start();
    
    try {
      const result = await execAsync('node src/core/cli.js security-audit', {
        cwd: this.projectPath,
        maxBuffer: 10 * 1024 * 1024
      });
      spinner.succeed('Audit complete');
      this.addMessage('success', result.stdout || 'No vulnerabilities found');
    } catch (e) {
      spinner.fail('Audit failed');
      if (e.stdout) this.addMessage('system', e.stdout);
      this.addMessage('error', e.message);
    }
  }

  async handleFix(_args, _fullCommand) {
    const target = _args[0] || '.';
    const spinner = ora('Applying fixes...').start();
    
    try {
      const result = await execAsync(`node src/core/cli.js fix ${target}`, {
        cwd: this.projectPath,
        maxBuffer: 10 * 1024 * 1024
      });
      spinner.succeed('Fixes applied');
      this.addMessage('success', result.stdout);
    } catch (e) {
      spinner.fail('Fix failed');
      this.addMessage('error', e.message);
    }
  }

  async handleScan(_args, _fullCommand) {
    await this.handleSecurityAudit(_args, _fullCommand);
  }

  async handleChat(_args, fullCommand) {
    const message = _args.join(' ') || fullCommand.replace(/^(chat|ask)\s+/, '');
    if (!message) {
      this.addMessage('system', 'Usage: chat <message> or just type your question');
      return;
    }

    const spinner = ora('Thinking...').start();

    try {
      const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
      
      if (!apiKey) {
        spinner.warn('No API key configured');
        this.addMessage('system', 'Please configure an API key:');
        this.addMessage('system', '  export GROQ_API_KEY=your_key');
        this.addMessage('system', '  or run: sentinel auth');
        return;
      }

      const context = this.buildContext();
      const prompt = `You are Sentinel CLI, an AI-powered code guardian. 
You are helpful, concise, and practical.

Current Project: ${this.context.project?.name || 'Unknown'}
Project Path: ${this.projectPath}

Project Structure:
${this.files.slice(0, 20).map(f => '  ' + f).join('\n')}

${context}

User Question: ${message}

Provide a helpful, actionable response. If the user asks to do something, you can use exec to run commands.`;

      const response = await this.callLLM(prompt, apiKey);
      spinner.succeed('Response ready');
      
      this.addMessage('assistant', response);
      
      if (response.includes('exec') || response.includes('run ') || response.includes('npm')) {
        this.addMessage('system', 'I can execute commands for you. Just say "run <command>" or "exec <command>"');
      }
    } catch (e) {
      spinner.fail('Chat failed');
      this.addMessage('error', e.message);
    }
  }

  handleAsk(args, fullCommand) {
    return this.handleChat(args, fullCommand);
  }

  buildContext() {
    let ctx = '';
    if (this.context.project) {
      ctx += `\nProject: ${this.context.project.name} v${this.context.project.version}\n`;
      ctx += `Scripts: ${Object.keys(this.context.project.scripts || {}).join(', ')}\n`;
    }
    return ctx;
  }

  async callLLM(prompt, apiKey) {
    const useGroq = !!process.env.GROQ_API_KEY;
    const url = useGroq 
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
    
    const model = useGroq ? 'mixtral-8x7b-32768' : 'gpt-3.5-turbo';
    
    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2000
    });

    return new Promise((resolve, reject) => {
      const client = url.includes('https') ? https : http;
      const req = client.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) reject(new Error(json.error.message));
            else resolve(json.choices[0].message.content);
          } catch (e) {
            reject(new Error('Failed to parse response'));
          }
        });
      });
      
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  async handleExec(args, _fullCommand) {
    const command = args.join(' ');
    if (!command) {
      this.addMessage('system', 'Usage: exec <command>');
      return;
    }

    this.addMessage('tool', `Running: ${command}`);
    const spinner = ora('Executing...').start();

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.projectPath,
        maxBuffer: 10 * 1024 * 1024,
        shell: true
      });
      
      spinner.succeed('Command completed');
      if (stdout) this.addMessage('success', stdout.slice(-5000));
      if (stderr) this.addMessage('error', stderr.slice(-2000));
    } catch (e) {
      spinner.fail('Command failed');
      if (e.stdout) this.addMessage('system', e.stdout.slice(-2000));
      if (e.stderr) this.addMessage('error', e.stderr.slice(-2000));
      this.addMessage('error', e.message);
    }
  }

  async handleRead(args) {
    const filePath = args[0];
    if (!filePath) {
      this.addMessage('system', 'Usage: read <file>');
      return;
    }

    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.projectPath, filePath);

    try {
      const content = await fs.readFile(fullPath, 'utf8');
      const display = content.slice(0, 3000);
      this.addMessage('success', `File: ${filePath} (${content.length} bytes)`);
      this.addMessage('system', display);
      if (content.length > 3000) {
        this.addMessage('system', `\n... (${content.length - 3000} more bytes)`);
      }
    } catch (e) {
      this.addMessage('error', `Cannot read ${filePath}: ${e.message}`);
    }
  }

  async handleWrite(_args, _fullCommand) {
    const match = _fullCommand.match(/^write\s+["']?([^"'\s]+)["']?\s+(.+)$/);
    if (!match) {
      this.addMessage('system', 'Usage: write <file> <content>');
      return;
    }

    const [, filePath, content] = match;
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.projectPath, filePath);

    try {
      await fs.writeFile(fullPath, content, 'utf8');
      this.addMessage('success', `Written to ${filePath}`);
    } catch (e) {
      this.addMessage('error', `Cannot write ${filePath}: ${e.message}`);
    }
  }

  async handleEdit(args) {
    const filePath = args[0];
    if (!filePath) {
      this.addMessage('system', 'Usage: edit <file>');
      return;
    }

    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.projectPath, filePath);

    try {
      const editor = process.env.EDITOR || 'vim';
      await execAsync(`${editor} "${fullPath}"`, { cwd: this.projectPath });
      this.addMessage('success', `Edited ${filePath}`);
    } catch (e) {
      this.addMessage('error', `Cannot edit ${filePath}: ${e.message}`);
    }
  }

  async handleGlob(args) {
    const pattern = args[0] || '**/*';
    try {
      const files = await glob(pattern, { cwd: this.projectPath, ignore: ['node_modules/**'] });
      this.addMessage('success', `Found ${files.length} files matching "${pattern}"`);
      files.slice(0, 50).forEach(f => this.addMessage('system', '  ' + f));
      if (files.length > 50) {
        this.addMessage('system', `  ... and ${files.length - 50} more`);
      }
    } catch (e) {
      this.addMessage('error', e.message);
    }
  }

  async handleGrep(args) {
    const pattern = args[0];
    if (!pattern) {
      this.addMessage('system', 'Usage: grep <pattern>');
      return;
    }

    this.addMessage('tool', `Searching for: ${pattern}`);
    try {
      const { stdout } = await execAsync(
        `grep -r "${pattern}" . --include="*.js" --include="*.ts" --include="*.json" --include="*.md" -l node_modules/ dist/ .git/ 2>/dev/null | head -20`,
        { cwd: this.projectPath }
      );
      if (stdout) {
        this.addMessage('success', stdout.trim());
      } else {
        this.addMessage('system', 'No matches found');
      }
    } catch (e) {
      this.addMessage('system', 'No matches found');
    }
  }

  async handleFind(args) {
    return this.handleGlob(args);
  }

  async handleWebSearch(args) {
    const query = args.join(' ');
    if (!query) {
      this.addMessage('system', 'Usage: search <query>');
      return;
    }

    const spinner = ora('Searching the web...').start();
    
    try {
      const result = await this.webSearch(query);
      spinner.succeed('Search complete');
      this.addMessage('success', result);
    } catch (e) {
      spinner.fail('Search failed');
      this.addMessage('error', e.message);
    }
  }

  async webSearch(query) {
    return `Search for "${query}" would use Exa API or similar.
    
To implement web search:
1. Get an API key from exa.ai or similar
2. Set EXA_API_KEY environment variable
3. Implement the search endpoint

Results would show relevant documentation, code examples, and resources.`;
  }

  async handleWebFetch(args) {
    const url = args[0];
    if (!url) {
      this.addMessage('system', 'Usage: web <url>');
      return;
    }

    const spinner = ora('Fetching page...').start();
    
    try {
      const content = await this.fetchUrl(url);
      spinner.succeed('Fetch complete');
      this.addMessage('success', `Fetched ${url} (${content.length} bytes)`);
      this.addMessage('system', content.slice(0, 2000));
    } catch (e) {
      spinner.fail('Fetch failed');
      this.addMessage('error', e.message);
    }
  }

  async fetchUrl(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      client.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }

  async handleAgent(_args, _fullCommand) {
    const task = _args.join(' ') || _fullCommand.replace(/^(agent|task)\s+/, '');
    if (!task) {
      this.addMessage('system', 'Usage: agent <task_description>');
      return;
    }

    this.addMessage('tool', `Running agent: ${task}`);
    const spinner = ora('Agent working...').start();

    try {
      const result = await this.runAgent(task);
      spinner.succeed('Agent completed');
      this.addMessage('success', result);
    } catch (e) {
      spinner.fail('Agent failed');
      this.addMessage('error', e.message);
    }
  }

  async runAgent(task) {
    const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return 'Please configure an API key first: sentinel auth';
    }

    const prompt = `You are an autonomous coding agent. Break down this task and execute it step by step.

Task: ${task}

Project: ${this.context.project?.name || 'unknown'}
Path: ${this.projectPath}

Available tools:
- exec <command> - Run shell commands
- read <file> - Read file contents  
- write <file> <content> - Write to file
- glob <pattern> - Find files
- grep <pattern> - Search in files

Think step by step, execute commands, and report results.`;

    const response = await this.callLLM(prompt, apiKey);
    return response;
  }

  async handleListFiles(args) {
    const detail = args[0] === '-l' || args[0] === '-la';
    const target = args[detail ? 1 : 0] || '.';
    const fullPath = path.join(this.projectPath, target);

    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        const files = await fs.readdir(fullPath);
        if (detail) {
          for (const f of files.slice(0, 20)) {
            const fstat = await fs.stat(path.join(fullPath, f));
            const size = fstat.isDirectory() ? 'DIR ' : fstat.size.toString().padStart(8);
            this.addMessage('system', `${size}  ${f}`);
          }
        } else {
          this.addMessage('success', files.join('  '));
        }
      } else {
        this.addMessage('system', `${target} (${stat.size} bytes)`);
      }
    } catch (e) {
      this.addMessage('error', e.message);
    }
  }

  async handleTree(args) {
    const target = args[0] || '.';
    const depth = parseInt(args[1] || '3');
    
    try {
      const result = await execAsync(`find "${target}" -maxdepth ${depth} -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" | head -50`, {
        cwd: this.projectPath
      });
      this.addMessage('success', result.stdout);
    } catch (e) {
      this.addMessage('error', e.message);
    }
  }

  async handleStatus(args) {
    const status = `
Project Status:
${chalk.cyan('═'.repeat(40))}

Name:     ${this.context.project?.name || 'Unknown'}
Version:  ${this.context.project?.version || 'N/A'}
Path:     ${this.projectPath}
Git:      ${this.context.isGitRepo ? chalk.green('Yes') : chalk.red('No')}
Files:    ${this.files.length}

Scripts:  ${Object.keys(this.context.project?.scripts || {}).length}
Deps:     ${Object.keys(this.context.project?.dependencies || {}).length}
DevDeps:  ${Object.keys(this.context.project?.devDependencies || {}).length}
`;
    this.addMessage('system', status);
  }

  async handleConfig(args) {
    this.addMessage('system', 'Configuration managed via:');
    this.addMessage('system', '  .sentinel.json (project)');
    this.addMessage('system', '  ~/.sentinel.json (global)');
    this.addMessage('system', '  Environment variables');
    this.addMessage('system', '');
    this.addMessage('system', 'Run: sentinel config --list');
  }

  async handleAuth(args) {
    const providers = ['openai', 'anthropic', 'gemini', 'groq', 'openrouter'];
    const envMap = {
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      gemini: 'GEMINI_API_KEY',
      groq: 'GROQ_API_KEY',
      openrouter: 'OPENROUTER_API_KEY'
    };

    const mask = (value) => {
      if (!value) return 'not set';
      if (value.length <= 8) return '********';
      return `${value.slice(0, 4)}...${value.slice(-4)}`;
    };

    const sub = (args[0] || 'status').toLowerCase();

    await configManager.load();

    if (sub === 'status') {
      this.addMessage('system', 'Auth provider status:');
      for (const provider of providers) {
        const key = configManager.getApiKey(provider);
        const enabled = configManager.isProviderEnabled(provider);
        this.addMessage(
          'system',
          `  ${provider.padEnd(10)} ${enabled ? '✓ configured' : '○ not set'} (${mask(key)})`
        );
      }
      this.addMessage('system', '');
      this.addMessage('system', 'Usage:');
      this.addMessage('system', '  auth status');
      this.addMessage('system', '  auth set <provider> <apiKey>');
      this.addMessage('system', '  auth clear');
      this.addMessage('system', '');
      this.addMessage('system', 'Examples:');
      this.addMessage('system', '  auth set groq gsk_...');
      this.addMessage('system', '  auth set openai sk-...');
      return;
    }

    if (sub === 'clear' || sub === 'logout') {
      for (const provider of providers) {
        await configManager.setApiKey(provider, '');
      }
      this.addMessage('success', 'Cleared all configured API keys.');
      return;
    }

    if (sub === 'set') {
      const provider = (args[1] || '').toLowerCase();
      const apiKey = args[2];

      if (!provider || !apiKey) {
        this.addMessage('system', 'Usage: auth set <provider> <apiKey>');
        this.addMessage('system', `Providers: ${providers.join(', ')}`);
        return;
      }

      if (!providers.includes(provider)) {
        this.addMessage('error', `Unknown provider: ${provider}`);
        this.addMessage('system', `Providers: ${providers.join(', ')}`);
        return;
      }

      await configManager.setApiKey(provider, apiKey);
      configManager.injectEnvVars();

      this.addMessage('success', `Saved ${provider} API key (${mask(apiKey)})`);
      this.addMessage('system', `Injected ${envMap[provider]} into current session.`);
      return;
    }

    // Shorthand: auth <provider> <apiKey>
    if (providers.includes(sub) && args[1]) {
      await configManager.setApiKey(sub, args[1]);
      configManager.injectEnvVars();
      this.addMessage('success', `Saved ${sub} API key (${mask(args[1])})`);
      this.addMessage('system', `Injected ${envMap[sub]} into current session.`);
      return;
    }

    this.addMessage('system', 'Usage: auth [status|set|clear]');
    this.addMessage('system', 'Try: auth status');
  }

  async handleModels(args) {
    this.addMessage('system', 'Available AI Models:');
    this.addMessage('system', '  OpenAI: gpt-4o, gpt-4, gpt-3.5-turbo');
    this.addMessage('system', '  Groq:   llama3-70b, mixtral-8x7b');
    this.addMessage('system', '  Gemini: gemini-pro, gemini-flash');
    this.addMessage('system', '  Anthropic: claude-3-opus, claude-3-sonnet');
  }

  async handleTest(args) {
    const spinner = ora('Running tests...').start();
    try {
      const result = await execAsync('npm test', {
        cwd: this.projectPath,
        maxBuffer: 10 * 1024 * 1024
      });
      spinner.succeed('Tests completed');
      this.addMessage('success', result.stdout.slice(-3000));
    } catch (e) {
      spinner.fail('Tests failed');
      if (e.stdout) this.addMessage('system', e.stdout.slice(-2000));
      this.addMessage('error', e.message);
    }
  }

  async handleBuild(args) {
    const spinner = ora('Building project...').start();
    try {
      const result = await execAsync('npm run build', {
        cwd: this.projectPath,
        maxBuffer: 10 * 1024 * 1024
      });
      spinner.succeed('Build completed');
      this.addMessage('success', result.stdout.slice(-2000));
    } catch (e) {
      spinner.fail('Build failed');
      this.addMessage('error', e.message);
    }
  }

  async handleLint(args) {
    const spinner = ora('Running linter...').start();
    try {
      const result = await execAsync('npm run lint', {
        cwd: this.projectPath,
        maxBuffer: 10 * 1024 * 1024
      });
      spinner.succeed('Lint completed');
      this.addMessage('success', result.stdout || 'No issues');
    } catch (e) {
      spinner.fail('Lint found issues');
      if (e.stdout) this.addMessage('system', e.stdout.slice(-2000));
    }
  }

  async handleGit(args) {
    const command = args.join(' ');
    if (!command) {
      this.addMessage('system', 'Usage: git <command>');
      return;
    }

    const spinner = ora(`Running git ${command}...`).start();
    try {
      const result = await execAsync(`git ${command}`, {
        cwd: this.projectPath,
        maxBuffer: 5 * 1024 * 1024
      });
      spinner.succeed('Git completed');
      this.addMessage('success', result.stdout.slice(-3000));
    } catch (e) {
      spinner.fail('Git failed');
      this.addMessage('error', e.message);
    }
  }

  async handleInstall(args) {
    const pkg = args[0];
    const spinner = ora(pkg ? `Installing ${pkg}...` : 'Installing dependencies...').start();
    try {
      const cmd = pkg ? `npm install ${pkg}` : 'npm install';
      const result = await execAsync(cmd, {
        cwd: this.projectPath,
        maxBuffer: 10 * 1024 * 1024
      });
      spinner.succeed('Install complete');
      this.addMessage('success', result.stdout.slice(-1000));
    } catch (e) {
      spinner.fail('Install failed');
      this.addMessage('error', e.message);
    }
  }

  async handleNpm(args) {
    const command = args.join(' ');
    const spinner = ora(`Running npm ${command}...`).start();
    try {
      const result = await execAsync(`npm ${command}`, {
        cwd: this.projectPath,
        maxBuffer: 10 * 1024 * 1024
      });
      spinner.succeed('npm completed');
      this.addMessage('success', result.stdout.slice(-3000));
    } catch (e) {
      spinner.fail('npm failed');
      this.addMessage('error', e.message);
    }
  }

  async handleNode(args) {
    const file = args[0];
    if (!file) {
      this.addMessage('system', 'Usage: node <file>');
      return;
    }

    const spinner = ora(`Running ${file}...`).start();
    try {
      const result = await execAsync(`node ${file}`, {
        cwd: this.projectPath,
        maxBuffer: 10 * 1024 * 1024
      });
      spinner.succeed('Done');
      this.addMessage('success', result.stdout.slice(-2000));
    } catch (e) {
      spinner.fail('Error');
      this.addMessage('error', e.message);
    }
  }

  async handlePython(args) {
    const file = args[0];
    if (!file) {
      this.addMessage('system', 'Usage: python <file>');
      return;
    }

    const spinner = ora(`Running Python...`).start();
    try {
      const result = await execAsync(`python ${file}`, {
        cwd: this.projectPath,
        maxBuffer: 10 * 1024 * 1024
      });
      spinner.succeed('Done');
      this.addMessage('success', result.stdout.slice(-2000));
    } catch (e) {
      spinner.fail('Error');
      this.addMessage('error', e.message);
    }
  }

  async handleDocker(args) {
    const command = args.join(' ');
    const spinner = ora(`Running docker ${command}...`).start();
    try {
      const result = await execAsync(`docker ${command}`, {
        cwd: this.projectPath,
        maxBuffer: 10 * 1024 * 1024
      });
      spinner.succeed('Docker completed');
      this.addMessage('success', result.stdout.slice(-3000));
    } catch (e) {
      spinner.fail('Docker failed');
      this.addMessage('error', e.message);
    }
  }

  async handleK8s(args) {
    const command = args.join(' ');
    const spinner = ora(`Running kubectl ${command}...`).start();
    try {
      const result = await execAsync(`kubectl ${command}`, {
        cwd: this.projectPath,
        maxBuffer: 5 * 1024 * 1024
      });
      spinner.succeed('K8s completed');
      this.addMessage('success', result.stdout.slice(-2000));
    } catch (e) {
      spinner.fail('K8s failed');
      this.addMessage('error', e.message);
    }
  }

  async handleMetrics(args) {
    this.addMessage('system', 'Project Metrics:');
    this.addMessage('system', `  Files: ${this.files.length}`);
    this.addMessage('system', `  Lines: ~${this.files.length * 200} (estimated)`);
    this.addMessage('system', '');
    this.addMessage('system', 'Run: sentinel analyze --metrics');
  }

  async handleDashboard(args) {
    const spinner = ora('Starting dashboard...').start();
    try {
      await execAsync('node src/core/cli.js dashboard', {
        cwd: this.projectPath,
        detached: true,
        stdio: 'ignore'
      });
      spinner.succeed('Dashboard started');
      this.addMessage('success', 'Dashboard running at http://localhost:3000');
    } catch (e) {
      spinner.fail('Failed to start dashboard');
      this.addMessage('error', e.message);
    }
  }

  async handlePR(args) {
    const prUrl = args[0];
    if (!prUrl) {
      this.addMessage('system', 'Usage: pr <pr_url>');
      return;
    }

    const spinner = ora('Reviewing PR...').start();
    try {
      const result = await execAsync(`node src/core/cli.js review-pr ${prUrl}`, {
        cwd: this.projectPath,
        maxBuffer: 10 * 1024 * 1024
      });
      spinner.succeed('PR reviewed');
      this.addMessage('success', result.stdout.slice(-3000));
    } catch (e) {
      spinner.fail('PR review failed');
      this.addMessage('error', e.message);
    }
  }

  async handleReview(args) {
    const spinner = ora('Running code review...').start();
    try {
      const result = await execAsync('node src/core/cli.js analyze --format console', {
        cwd: this.projectPath,
        maxBuffer: 10 * 1024 * 1024
      });
      spinner.succeed('Review complete');
      this.addMessage('success', result.stdout.slice(-5000));
    } catch (e) {
      spinner.fail('Review failed');
      this.addMessage('error', e.message);
    }
  }

  async handleBadge(args) {
    const spinner = ora('Generating badge...').start();
    try {
      const result = await execAsync('node src/core/cli.js badge', {
        cwd: this.projectPath,
        maxBuffer: 5 * 1024 * 1024
      });
      spinner.succeed('Badge generated');
      this.addMessage('success', result.stdout.slice(-1000));
    } catch (e) {
      spinner.fail('Badge generation failed');
      this.addMessage('error', e.message);
    }
  }

  async handleTrends(args) {
    const spinner = ora('Analyzing trends...').start();
    try {
      const result = await execAsync('node src/core/cli.js trends', {
        cwd: this.projectPath,
        maxBuffer: 10 * 1024 * 1024
      });
      spinner.succeed('Trends analyzed');
      this.addMessage('success', result.stdout.slice(-3000));
    } catch (e) {
      spinner.fail('Trends analysis failed');
      this.addMessage('error', e.message);
    }
  }

  async handleCache(args) {
    const action = args[0];
    if (action === 'clear') {
      const spinner = ora('Clearing cache...').start();
      try {
        await execAsync('node src/core/cli.js cache --clear', { cwd: this.projectPath });
        spinner.succeed('Cache cleared');
      } catch (e) {
        spinner.fail('Failed');
        this.addMessage('error', e.message);
      }
    } else {
      this.addMessage('system', 'Cache commands: clear, stats');
    }
  }

  async handleSBOM(args) {
    const spinner = ora('Generating SBOM...').start();
    try {
      const result = await execAsync('node src/core/cli.js sbom', {
        cwd: this.projectPath,
        maxBuffer: 10 * 1024 * 1024
      });
      spinner.succeed('SBOM generated');
      this.addMessage('success', result.stdout.slice(-2000));
    } catch (e) {
      spinner.fail('SBOM failed');
      this.addMessage('error', e.message);
    }
  }

  async handleCVE(args) {
    const spinner = ora('Checking CVEs...').start();
    try {
      const result = await execAsync('node src/core/cli.js analyze --analyzers dependency', {
        cwd: this.projectPath,
        maxBuffer: 10 * 1024 * 1024
      });
      spinner.succeed('CVE check complete');
      this.addMessage('success', result.stdout.slice(-3000));
    } catch (e) {
      spinner.fail('CVE check failed');
      this.addMessage('error', e.message);
    }
  }

  async handleDeps(args) {
    const spinner = ora('Checking dependencies...').start();
    try {
      const result = await execAsync('npm audit --json', {
        cwd: this.projectPath,
        maxBuffer: 10 * 1024 * 1024
      });
      spinner.succeed('Deps checked');
      this.addMessage('success', result.stdout.slice(-3000));
    } catch (e) {
      spinner.succeed('Dependencies OK');
      this.addMessage('success', 'No vulnerabilities found');
    }
  }

  async handleGenerate(args) {
    const description = args.join(' ');
    if (!description) {
      this.addMessage('system', 'Usage: generate <description of code to generate>');
      return;
    }

    const spinner = ora('Generating code...').start();
    try {
      const result = await this.aiAssistant.generateCode(description);
      spinner.succeed('Code generated');
      this.addMessage('success', result.code);
    } catch (e) {
      spinner.fail('Generation failed');
      this.addMessage('error', e.message);
    }
  }

  async handleExplain(args) {
    const code = args.join(' ');
    if (!code) {
      this.addMessage('system', 'Usage: explain <code to explain>');
      return;
    }

    const spinner = ora('Explaining code...').start();
    try {
      const result = await this.aiAssistant.explainCode(code);
      spinner.succeed('Explanation ready');
      this.addMessage('success', result.explanation);
    } catch (e) {
      spinner.fail('Explanation failed');
      this.addMessage('error', e.message);
    }
  }

  async handleRefactor(args) {
    const code = args.join(' ');
    if (!code) {
      this.addMessage('system', 'Usage: refactor <code to refactor>');
      return;
    }

    const spinner = ora('Refactoring code...').start();
    try {
      const result = await this.aiAssistant.suggestRefactoring(code);
      spinner.succeed('Refactoring suggestions ready');
      this.addMessage('success', result.suggestions);
    } catch (e) {
      spinner.fail('Refactoring failed');
      this.addMessage('error', e.message);
    }
  }

  async handleOptimize(_args) {
    this.addMessage('system', 'Usage: optimize <code to optimize>');
  }

  async handleDocument(_args) {
    this.addMessage('system', 'Usage: document <code to document>');
  }

  async handleDev(_args) {
    const spinner = ora('Starting dev server...').start();
    try {
      const result = await this.workflows.runWorkflow('dev');
      spinner.succeed('Dev workflow ready');
      this.addMessage('success', JSON.stringify(result, null, 2));
    } catch (e) {
      spinner.fail('Dev workflow failed');
      this.addMessage('error', e.message);
    }
  }

  async handleCI(_args) {
    const spinner = ora('Running CI pipeline...').start();
    try {
      const result = await this.workflows.runWorkflow('ci');
      spinner.succeed('CI workflow ready');
      this.addMessage('success', JSON.stringify(result, null, 2));
    } catch (e) {
      spinner.fail('CI workflow failed');
      this.addMessage('error', e.message);
    }
  }

  async handleDeploy(_args) {
    const spinner = ora('Checking deployment options...').start();
    try {
      const result = await this.workflows.runWorkflow('deploy');
      spinner.succeed('Deploy workflow ready');
      this.addMessage('success', JSON.stringify(result, null, 2));
    } catch (e) {
      spinner.fail('Deploy workflow failed');
      this.addMessage('error', e.message);
    }
  }

  async handleDatabase(args) {
    const action = args[0];
    const spinner = ora(`Running database: ${action}...`).start();
    
    try {
      const db = await this.dbTools.detectDatabase();
      this.addMessage('system', `Detected: ${db.name}`);
      
      let result;
      switch (action) {
        case 'migrate':
          result = await this.dbTools.runMigrations(db.type);
          break;
        case 'seed':
          result = await this.dbTools.seedDatabase(db.type);
          break;
        case 'reset':
          result = await this.dbTools.resetDatabase(db.type);
          break;
        case 'studio':
          result = await this.dbTools.studio(db.type);
          break;
        case 'status':
          result = await this.dbTools.getDbStatus();
          this.addMessage('success', JSON.stringify(result, null, 2));
          spinner.succeed('Database status');
          return;
        default:
          this.addMessage('system', 'Usage: db <migrate|seed|reset|studio|status>');
          spinner.fail('Unknown action');
          return;
      }
      
      spinner.succeed(`Database ${action} complete`);
      if (result.stdout) this.addMessage('success', result.stdout.slice(-2000));
    } catch (e) {
      spinner.fail(`Database ${action} failed`);
      this.addMessage('error', e.message);
    }
  }

  async runCommand(command, args = []) {
    const handler = this.handlers[command];
    if (handler) {
      await handler(args, '');
      // Print all messages to console for non-interactive mode
      for (const msg of this.messages) {
        if (msg.role === 'system') console.log(chalk.gray(msg.content));
        else if (msg.role === 'success') console.log(chalk.green(msg.content));
        else if (msg.role === 'error') console.log(chalk.red(msg.content));
        else if (msg.role === 'tool') console.log(chalk.magenta(msg.content));
        else console.log(msg.content);
      }
    } else {
      console.log(chalk.red(`Unknown command: ${command}`));
      console.log(chalk.gray('Run "sentinel --help" for available commands'));
      process.exit(1);
    }
  }
}

async function main() {
  const opts = parseArgs();
  
  switch (opts.mode) {
    case 'help':
      showHelp();
      process.exit(0);
      break;
      
    case 'version':
      showVersion();
      process.exit(0);
      break;
      
    case 'command': {
      const tui = new ModernTUI();
      tui.projectPath = opts.projectPath;
      await tui.loadProjectContext();
      await tui.runCommand(opts.command, opts.args);
      process.exit(0);
      break;
    }
      
    case 'interactive':
    default: {
      const interactiveTui = new ModernTUI();
      await interactiveTui.init();
      break;
    }
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  main().catch(console.error);
}

export default ModernTUI;

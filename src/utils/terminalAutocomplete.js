import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';

/**
 * Terminal Autocomplete
 * Provides tab completion for commands and file paths
 */
export class TerminalAutocomplete {
  constructor(options = {}) {
    this.projectPath = options.projectPath || process.cwd();
    this.commands = this.getDefaultCommands();
    this.cache = new Map();
    this.cacheTimeout = options.cacheTimeout || 60000;
  }

  /**
   * Get default Sentinel commands
   */
  getDefaultCommands() {
    return [
      // Main commands
      { name: 'analyze', description: 'Analyze code for issues', category: 'main' },
      { name: 'scan', description: 'Scan for security vulnerabilities', category: 'main' },
      { name: 'fix', description: 'Auto-fix detected issues', category: 'main' },
      { name: 'review', description: 'Review code changes', category: 'main' },
      { name: 'auth', description: 'Configure API keys', category: 'main' },
      { name: 'config', description: 'Manage configuration', category: 'main' },
      { name: 'init', description: 'Initialize Sentinel in project', category: 'main' },
      
      // Analysis commands
      { name: 'analyze:security', description: 'Security analysis', category: 'analysis' },
      { name: 'analyze:quality', description: 'Code quality analysis', category: 'analysis' },
      { name: 'analyze:deps', description: 'Dependency analysis', category: 'analysis' },
      { name: 'analyze:secrets', description: 'Secret detection', category: 'analysis' },
      
      // Git commands
      { name: 'git:hooks', description: 'Manage git hooks', category: 'git' },
      { name: 'git:pre-commit', description: 'Run pre-commit checks', category: 'git' },
      { name: 'git:post-commit', description: 'Run post-commit checks', category: 'git' },
      
      // Tool commands
      { name: 'exec', description: 'Execute shell command', category: 'tool' },
      { name: 'run', description: 'Run npm script', category: 'tool' },
      { name: 'test', description: 'Run tests', category: 'tool' },
      { name: 'lint', description: 'Run linter', category: 'tool' },
      { name: 'build', description: 'Build project', category: 'tool' },
      
      // File commands
      { name: 'file:read', description: 'Read file contents', category: 'file' },
      { name: 'file:write', description: 'Write to file', category: 'file' },
      { name: 'file:edit', description: 'Edit file', category: 'file' },
      { name: 'file:glob', description: 'Find files by pattern', category: 'file' },
      { name: 'file:grep', description: 'Search in files', category: 'file' },
      
      // AI commands
      { name: 'ai:ask', description: 'Ask AI a question', category: 'ai' },
      { name: 'ai:explain', description: 'Explain code', category: 'ai' },
      { name: 'ai:generate', description: 'Generate code', category: 'ai' },
      { name: 'ai:refactor', description: 'Refactor code', category: 'ai' },
      
      // Utility commands
      { name: 'help', description: 'Show help', category: 'utility' },
      { name: 'version', description: 'Show version', category: 'utility' },
      { name: 'status', description: 'Show status', category: 'utility' },
      { name: 'dashboard', description: 'Open dashboard', category: 'utility' }
    ];
  }

  /**
   * Get completions for current input
   */
  async getCompletions(input, cursorPosition = input.length) {
    const tokens = input.slice(0, cursorPosition).split(/\s+/);
    const currentToken = tokens[tokens.length - 1] || '';
    const previousToken = tokens[tokens.length - 2] || '';

    // Command completion (first token)
    if (tokens.length === 1) {
      return this.getCommandCompletions(currentToken);
    }

    // Option completion (starts with -)
    if (currentToken.startsWith('-')) {
      return this.getOptionCompletions(previousToken, currentToken);
    }

    // File/directory completion
    if (this.shouldCompleteFiles(previousToken)) {
      return this.getFileCompletions(currentToken);
    }

    // Argument completion based on command
    return this.getArgumentCompletions(previousToken, currentToken);
  }

  /**
   * Get command completions
   */
  getCommandCompletions(prefix) {
    if (!prefix) {
      return this.commands.map(c => ({
        name: c.name,
        description: c.description,
        category: c.category
      }));
    }

    const lower = prefix.toLowerCase();
    return this.commands
      .filter(c => c.name.toLowerCase().startsWith(lower))
      .map(c => ({
        name: c.name,
        description: c.description,
        category: c.category
      }));
  }

  /**
   * Get option completions
   */
  getOptionCompletions(command, prefix) {
    const options = {
      'analyze': ['--security', '--quality', '--deps', '--all', '--json', '--verbose', '--fix'],
      'scan': ['--security', '--secrets', '--vulnerabilities', '--json', '--fix'],
      'fix': ['--dry-run', '--force', '--backup', '--verbose'],
      'git:hooks': ['--install', '--uninstall', '--list'],
      'file:glob': ['--ignore', '--include', '--depth'],
      'file:grep': ['--ignore-case', '--recursive', '--line-number'],
      'ai:ask': ['--model', '--temperature', '--stream']
    };

    const commandOptions = options[command] || ['--help', '--verbose', '--json'];
    
    return commandOptions
      .filter(o => o.startsWith(prefix))
      .map(o => ({
        name: o,
        description: this.getOptionDescription(o)
      }));
  }

  /**
   * Get option description
   */
  getOptionDescription(option) {
    const descriptions = {
      '--security': 'Run security analysis',
      '--quality': 'Run code quality analysis',
      '--deps': 'Analyze dependencies',
      '--all': 'Run all analyses',
      '--json': 'Output as JSON',
      '--verbose': 'Verbose output',
      '--fix': 'Auto-fix issues',
      '--dry-run': 'Preview without applying changes',
      '--force': 'Force execution',
      '--backup': 'Create backup before changes',
      '--ignore': 'Ignore patterns',
      '--include': 'Include patterns',
      '--depth': 'Search depth',
      '--ignore-case': 'Case insensitive search',
      '--recursive': 'Search recursively',
      '--line-number': 'Show line numbers',
      '--model': 'AI model to use',
      '--temperature': 'AI creativity level',
      '--stream': 'Stream responses',
      '--help': 'Show help'
    };

    return descriptions[option] || '';
  }

  /**
   * Check if should complete files
   */
  shouldCompleteFiles(previousToken) {
    const fileCommands = ['file:read', 'file:edit', 'file:grep', 'cat', 'grep', 'edit'];
    return fileCommands.includes(previousToken);
  }

  /**
   * Get file completions
   */
  async getFileCompletions(prefix) {
    const cacheKey = `files:${prefix}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.results;
    }

    try {
      const isDir = prefix.endsWith('/') || prefix === '';
      const searchPattern = isDir 
        ? `${prefix}*`
        : `${prefix}*`;

      const files = await glob(searchPattern, {
        cwd: this.projectPath,
        onlyFiles: true,
        dot: false
      });

      const dirs = await glob(`${prefix}*`, {
        cwd: this.projectPath,
        onlyDirectories: true,
        dot: false
      });

      const results = [
        ...dirs.map(d => ({ name: `${d}/`, isDirectory: true })),
        ...files.map(f => ({ name: f, isDirectory: false }))
      ].slice(0, 20);

      this.cache.set(cacheKey, { results, timestamp: Date.now() });
      return results;
    } catch {
      return [];
    }
  }

  /**
   * Get argument completions
   */
  async getArgumentCompletions(command, _prefix) {
    // Language completions
    if (command === '--model' || command === '-m') {
      return [
        { name: 'gpt-4', description: 'OpenAI GPT-4' },
        { name: 'gpt-4o', description: 'OpenAI GPT-4o' },
        { name: 'gpt-3.5-turbo', description: 'OpenAI GPT-3.5' },
        { name: 'claude-3-opus', description: 'Claude 3 Opus' },
        { name: 'claude-3-sonnet', description: 'Claude 3 Sonnet' },
        { name: 'llama3-70b', description: 'Llama 3 70B' },
        { name: 'gemini-pro', description: 'Google Gemini Pro' }
      ];
    }

    // Framework completions
    if (command === 'analyze' || command === 'scan') {
      return [
        { name: 'react', description: 'React project' },
        { name: 'vue', description: 'Vue project' },
        { name: 'next', description: 'Next.js project' },
        { name: 'express', description: 'Express.js project' },
        { name: 'django', description: 'Django project' },
        { name: 'fastapi', description: 'FastAPI project' },
        { name: 'go', description: 'Go project' },
        { name: 'rust', description: 'Rust project' }
      ];
    }

    return [];
  }

  /**
   * Generate shell completion script
   */
  generateCompletionScript(shell = 'bash') {
    if (shell === 'bash') {
      const script = [
        '#!/bin/bash',
        '',
        '_sentinel_completions() {',
        '  local cur prev opts',
        '  COMPREPLY=()',
        "  cur=\"${COMP_WORDS[COMP_CWORD]}\"",
        "  prev=\"${COMP_WORDS[COMP_CWORD-1]}\"",
        '',
        '  opts="analyze scan fix review auth config init exec run test lint build file:read file:write file:edit file:glob file:grep ai:ask ai:explain ai:generate ai:refactor help version status dashboard"',
        '',
        '  case "${prev}" in',
        '    analyze|scan)',
        '      COMPREPLY=($(compgen -W "--security --quality --deps --all --json --verbose --fix" -- ${cur}))',
        '      return 0',
        '      ;;',
        '    fix)',
        '      COMPREPLY=($(compgen -W "--dry-run --force --backup --verbose" -- ${cur}))',
        '      return 0',
        '      ;;',
        '    -m|--model)',
        '      COMPREPLY=($(compgen -W "gpt-4 gpt-4o gpt-3.5-turbo claude-3-opus llama3-70b gemini-pro" -- ${cur}))',
        '      return 0',
        '      ;;',
        '    *)',
        '      COMPREPLY=($(compgen -W "${opts}" -- ${cur}))',
        '      return 0',
        '      ;;',
        '  esac',
        '}',
        '',
        'complete -F _sentinel_completions sentinel'
      ].join('\n');
      return script;
    }

    if (shell === 'zsh') {
      return `# Sentinel autocompletion for Zsh

autoload -U compinit
compinit

_sentinel() {
  local -a commands
  commands=(
    'analyze:Analyze code for issues'
    'scan:Scan for security vulnerabilities'
    'fix:Auto-fix detected issues'
    'review:Review code changes'
    'exec:Execute shell command'
    'run:Run npm script'
    'test:Run tests'
    'lint:Run linter'
    'build:Build project'
  )
  
  _describe 'command' commands
}

compdef _sentinel sentinel
`;
    }

    return '# Shell completion not supported';
  }

  /**
   * Install completion script
   */
  async installCompletion(shell = 'bash') {
    const script = this.generateCompletionScript(shell);
    let installPath;

    if (shell === 'bash') {
      const home = process.env.HOME || process.env.USERPROFILE;
      installPath = path.join(home, '.sentinel-completion.bash');
    } else if (shell === 'zsh') {
      const home = process.env.HOME || process.env.USERPROFILE;
      installPath = path.join(home, '.zsh_functions', '_sentinel');
    } else {
      return { success: false, error: 'Unsupported shell' };
    }

    try {
      await fs.writeFile(installPath, script);
      return { 
        success: true, 
        installPath,
        instructions: shell === 'bash' 
          ? `Add to ~/.bashrc: source ${installPath}`
          : `Add to ~/.zshrc: fpath+=${path.dirname(installPath)}`
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    return { success: true };
  }
}

export default TerminalAutocomplete;

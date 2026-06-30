const PHASES = {
  PLAN: 'plan',
  MAIN: 'main',
  FILTER: 'filter',
};

class Tool {
  constructor(name, implementation, options = {}) {
    this.name = name;
    this.implementation = implementation;
    this.description = options.description || '';
    this.inputSchema = options.inputSchema || {};
    this.availableIn = options.availableIn || [PHASES.MAIN];
    this.maxCalls = options.maxCalls || Infinity;
    this.callCount = 0;
  }

  canExecute(phase) {
    return this.availableIn.includes(phase) && this.callCount < this.maxCalls;
  }

  async execute(args, context = {}) {
    if (!this.canExecute(context.phase)) {
      throw new Error(`Tool '${this.name}' not available in phase '${context.phase}'`);
    }
    this.callCount++;
    return await this.implementation(args, context);
  }

  resetCount() {
    this.callCount = 0;
  }
}

export class ToolRegistry {
  constructor(options = {}) {
    this.tools = new Map();
    this.frozen = false;
    this.defaultPhase = options.defaultPhase || PHASES.MAIN;
  }

  register(name, implementation, options = {}) {
    if (this.frozen) {
      throw new Error('Cannot register tools after registry is frozen');
    }
    if (this.tools.has(name)) {
      throw new Error(`Tool '${name}' is already registered`);
    }
    const tool = new Tool(name, implementation, options);
    this.tools.set(name, tool);
    return this;
  }

  get(name) {
    return this.tools.get(name);
  }

  getToolsForPhase(phase) {
    const available = [];
    for (const tool of this.tools.values()) {
      if (tool.canExecute(phase)) {
        available.push({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
      }
    }
    return available;
  }

  async execute(name, args, context = {}) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return await tool.execute(args, { ...context, phase: context.phase || this.defaultPhase });
  }

  freeze() {
    this.frozen = true;
    return this;
  }

  isFrozen() {
    return this.frozen;
  }

  reset() {
    for (const tool of this.tools.values()) {
      tool.resetCount();
    }
  }

  getRegisteredNames() {
    return Array.from(this.tools.keys());
  }

  getStats() {
    const stats = {};
    for (const [name, tool] of this.tools.entries()) {
      stats[name] = {
        callCount: tool.callCount,
        availableIn: tool.availableIn,
        maxCalls: tool.maxCalls === Infinity ? 'unlimited' : tool.maxCalls,
      };
    }
    return stats;
  }
}

export function createDefaultRegistry() {
  const registry = new ToolRegistry();

  registry.register('read_file', async (args, ctx) => {
    const { fileReader } = await import('../git/file-reader.js');
    const content = await fileReader.read(args.path, ctx.ref);
    const lines = content.split('\n');
    if (args.startLine || args.endLine) {
      const start = Math.max(0, (args.startLine || 1) - 1);
      const end = Math.min(lines.length, args.endLine || start + 500);
      return { content: lines.slice(start, end).join('\n'), totalLines: lines.length, truncated: lines.length > 500 };
    }
    return { content, totalLines: lines.length, truncated: lines.length > 500 };
  }, {
    description: 'Read file content with optional line range',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to repo root' },
        startLine: { type: 'number', description: 'Optional start line (1-indexed)' },
        endLine: { type: 'number', description: 'Optional end line (1-indexed)' },
      },
      required: ['path'],
    },
    availableIn: [PHASES.PLAN, PHASES.MAIN],
  });

  registry.register('search_code', async (args, ctx) => {
    const { execSync } = await import('child_process');
    const result = execSync(`git grep -n -i --no-color ${JSON.stringify(args.pattern)} -- ${args.filePattern || ''}`, {
      cwd: ctx.cwd || process.cwd(),
      encoding: 'utf-8',
      timeout: 10_000,
      maxBuffer: 5 * 1024 * 1024,
    });
    const lines = result.trim().split('\n').filter(Boolean);
    return { matches: lines.slice(0, args.maxResults || 100), totalMatches: lines.length, truncated: lines.length > (args.maxResults || 100) };
  }, {
    description: 'Search codebase using git grep',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Search pattern (regex supported)' },
        filePattern: { type: 'string', description: 'Optional file glob pattern to restrict search' },
        maxResults: { type: 'number', description: 'Max results to return (default 100)' },
      },
      required: ['pattern'],
    },
    availableIn: [PHASES.PLAN, PHASES.MAIN],
  });

  registry.register('find_files', async (args) => {
    const { execSync } = await import('child_process');
    const mode = args.mode || 'cached';
    const cmd = mode === 'cached' ? 'git ls-files --cached --others --exclude-standard' : `git ls-files -- ${args.pattern || ''}`;
    const result = execSync(cmd, {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 10_000,
    });
    const files = result.trim().split('\n').filter(Boolean);
    if (args.pattern) {
      const { minimatch } = await import('minimatch');
      const filtered = files.filter(f => minimatch(f, args.pattern, { dot: true }));
      return { files: filtered.slice(0, args.maxResults || 50), total: filtered.length };
    }
    return { files: files.slice(0, args.maxResults || 100), total: files.length };
  }, {
    description: 'Find files by name pattern',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern to match filenames' },
        mode: { type: 'string', enum: ['cached', 'working'], description: 'Search mode' },
        maxResults: { type: 'number', description: 'Max results (default 50)' },
      },
    },
    availableIn: [PHASES.PLAN, PHASES.MAIN],
  });

  registry.register('read_diff', async (args, ctx) => {
    if (!ctx.diffMap) return { error: 'No diff context available' };
    if (args.path) {
      return { diff: ctx.diffMap[args.path] || null };
    }
    return { files: Object.keys(ctx.diffMap) };
  }, {
    description: 'Read diff text for any changed file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to get diff for (omit to list changed files)' },
      },
    },
    availableIn: [PHASES.MAIN],
  });

  registry.register('submit_comment', async (args, ctx) => {
    if (!ctx.commentCollector) return { error: 'No comment collector available' };
    ctx.commentCollector.push({
      path: args.path,
      content: args.content,
      suggestionCode: args.suggestionCode || '',
      existingCode: args.existingCode || '',
      thinking: args.thinking || '',
      severity: args.severity || 'medium',
      startLine: args.startLine,
      endLine: args.endLine,
    });
    return { accepted: true };
  }, {
    description: 'Submit a review comment for a specific file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        content: { type: 'string', description: 'Review comment text' },
        suggestionCode: { type: 'string', description: 'Suggested replacement code' },
        existingCode: { type: 'string', description: 'The code snippet being commented on (for line matching)' },
        severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
        thinking: { type: 'string', description: 'Internal reasoning' },
      },
      required: ['path', 'content'],
    },
    availableIn: [PHASES.MAIN],
  });

  registry.register('task_done', async () => {
    return { done: true };
  }, {
    description: 'Signal that the review task is complete for this file',
    inputSchema: { type: 'object', properties: {} },
    availableIn: [PHASES.MAIN],
  });

  registry.freeze();
  return registry;
}

export { PHASES };

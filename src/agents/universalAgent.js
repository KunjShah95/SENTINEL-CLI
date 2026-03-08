import { getLLMOrchestrator } from '../llm/llmOrchestrator.js';
import ShellExecutor from '../utils/shellExecutor.js';
import FileOperations from '../utils/fileOperations.js';
import https from 'https';
import http from 'http';

export class UniversalAgent {
  constructor(options = {}) {
    this.projectPath = options.projectPath || process.cwd();
    this.llm = options.llm || getLLMOrchestrator();
    this.shell = new ShellExecutor({ cwd: this.projectPath });
    this.files = new FileOperations(this.projectPath);
    this.maxIterations = options.maxIterations || 10;
    this.tools = this.getTools();
    this.context = {};
    this.conversationHistory = [];
    this.useFunctionCalling = options.useFunctionCalling !== false;
  }

  getTools() {
    return {
      exec: {
        name: 'exec',
        description: 'Execute a shell command in the terminal',
        parameters: {
          command: { type: 'string', description: 'The shell command to execute' }
        },
        handler: async (params) => {
          return await this.shell.exec(params.command, { timeout: 60000 });
        }
      },

      read: {
        name: 'read',
        description: 'Read the contents of a file',
        parameters: {
          path: { type: 'string', description: 'Path to the file to read' }
        },
        handler: async (params) => {
          return await this.files.read(params.path);
        }
      },

      write: {
        name: 'write',
        description: 'Write content to a file (creates or overwrites)',
        parameters: {
          path: { type: 'string', description: 'Path to the file' },
          content: { type: 'string', description: 'Content to write' }
        },
        handler: async (params) => {
          return await this.files.write(params.path, params.content);
        }
      },

      edit: {
        name: 'edit',
        description: 'Edit a file by finding and replacing text',
        parameters: {
          path: { type: 'string', description: 'Path to the file' },
          find: { type: 'string', description: 'Text to find' },
          replace: { type: 'string', description: 'Text to replace it with' }
        },
        handler: async (params) => {
          return await this.files.edit(params.path, [{ find: params.find, replace: params.replace }]);
        }
      },

      glob: {
        name: 'glob',
        description: 'Find files matching a pattern',
        parameters: {
          pattern: { type: 'string', description: 'Glob pattern (e.g., "**/*.js")' }
        },
        handler: async (params) => {
          return await this.files.glob(params.pattern);
        }
      },

      grep: {
        name: 'grep',
        description: 'Search for text in files',
        parameters: {
          pattern: { type: 'string', description: 'Pattern to search for' },
          path: { type: 'string', description: 'Path to search in (default: .)' }
        },
        handler: async (params) => {
          const result = await this.shell.exec(
            `grep -r "${params.pattern}" ${params.path || '.'} --include="*.js" --include="*.ts" --include="*.json" --include="*.md" -l node_modules/ dist/ .git/ 2>/dev/null | head -30`,
            { timeout: 30000 }
          );
          return result;
        }
      },

      list: {
        name: 'list',
        description: 'List files in a directory',
        parameters: {
          path: { type: 'string', description: 'Directory path (default: .)' }
        },
        handler: async (params) => {
          return await this.files.list(params.path || '.');
        }
      },

      tree: {
        name: 'tree',
        description: 'Show directory tree structure',
        parameters: {
          path: { type: 'string', description: 'Directory path (default: .)' },
          depth: { type: 'number', description: 'Maximum depth (default: 3)' }
        },
        handler: async (params) => {
          return await this.files.tree(params.path || '.', { depth: params.depth || 3 });
        }
      },

      stat: {
        name: 'stat',
        description: 'Get file or directory information',
        parameters: {
          path: { type: 'string', description: 'Path to check' }
        },
        handler: async (params) => {
          return await this.files.stat(params.path);
        }
      },

      search: {
        name: 'search',
        description: 'Search the web for information',
        parameters: {
          query: { type: 'string', description: 'Search query' }
        },
        handler: async (params) => {
          return await this.webSearch(params.query);
        }
      },

      fetch: {
        name: 'fetch',
        description: 'Fetch content from a URL',
        parameters: {
          url: { type: 'string', description: 'URL to fetch' }
        },
        handler: async (params) => {
          return await this.fetchUrl(params.url);
        }
      },

      npm: {
        name: 'npm',
        description: 'Run npm commands',
        parameters: {
          command: { type: 'string', description: 'npm command to run' }
        },
        handler: async (params) => {
          return await this.shell.exec(`npm ${params.command}`, { timeout: 120000 });
        }
      },

      git: {
        name: 'git',
        description: 'Run git commands',
        parameters: {
          command: { type: 'string', description: 'git command to run' }
        },
        handler: async (params) => {
          return await this.shell.exec(`git ${params.command}`, { timeout: 30000 });
        }
      }
    };
  }

  async webSearch(query) {
    // Try Exa first
    const apiKey = process.env.EXA_API_KEY;

    if (apiKey) {
      try {
        return await this.exaSearch(query);
      } catch (e) {
        // Fall through to fallback
      }
    }

    // Fallback to DuckDuckGo or other free search
    return await this.duckDuckGoSearch(query);
  }

  async exaSearch(query) {
    return new Promise((resolve) => {
      const data = JSON.stringify({ query, numResults: 10 });

      const req = https.request('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.EXA_API_KEY
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            resolve({
              success: true,
              query,
              results: json.results || [],
              count: json.results?.length || 0
            });
          } catch (e) {
            resolve({ success: false, error: 'Failed to parse response' });
          }
        });
      });

      req.on('error', (e) => resolve({ success: false, error: e.message }));
      req.write(data);
      req.end();
    });
  }

  async duckDuckGoSearch(query) {
    // Use HTML parsing approach via DuckDuckGo instant answer API
    return new Promise((resolve) => {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;

      const req = http.get(url, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            const results = json.RelatedTopics?.map(t => ({
              title: t.Text,
              url: t.FirstURL,
              snippet: t.Text
            })) || [];
            resolve({
              success: true,
              query,
              results,
              count: results.length,
              source: 'duckduckgo'
            });
          } catch (e) {
            resolve({ success: false, error: 'Failed to parse response' });
          }
        });
      });

      req.on('error', (e) => resolve({ success: false, error: e.message }));
      req.setTimeout(10000, () => {
        req.destroy();
        resolve({ success: false, error: 'Request timed out' });
      });
    });
  }

  async fetchUrl(url) {
    return new Promise((resolve) => {
      const client = url.startsWith('https') ? https : http;

      const req = client.get(url, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          resolve({
            success: true,
            url,
            content: body.slice(0, 10000),
            length: body.length,
            statusCode: res.statusCode
          });
        });
      });

      req.on('error', (e) => resolve({ success: false, error: e.message, url }));
      req.setTimeout(10000, () => {
        req.destroy();
        resolve({ success: false, error: 'Request timed out', url });
      });
    });
  }

  async buildContext() {
    const pkgPath = `${this.projectPath}/package.json`;
    let projectInfo = {};

    try {
      const pkg = await this.files.read(pkgPath);
      if (pkg.success) {
        projectInfo = JSON.parse(pkg.content);
      }
    } catch (e) {
      // Ignore package.json parse errors
    }

    const files = await this.files.glob('**/*.{js,ts,jsx,tsx,json,md}', {
      ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**'],
      deep: 3
    });

    return {
      project: {
        name: projectInfo.name || 'unknown',
        version: projectInfo.version || 'unknown',
        description: projectInfo.description || '',
        path: this.projectPath
      },
      files: files.files?.slice(0, 50) || [],
      fileCount: files.count || 0,
      tools: Object.keys(this.tools)
    };
  }

  // ===== NEW: Function Calling based execution =====
  async runWithFunctionCalling(task, _options = {}) {
    this.conversationHistory = [];

    const context = await this.buildContext();
    const toolsDescription = Object.entries(this.tools)
      .map(([name, tool]) => `  ${name}: ${tool.description}`)
      .join('\n');

    const systemPrompt = `You are Sentinel Agent, an autonomous coding assistant. Your role is to accomplish tasks by breaking them down into steps and using available tools.

## Available Tools
${toolsDescription}

## Current Project
- Name: ${context.project.name}
- Version: ${context.project.version}
- Path: ${context.project.path}
- Files: ${context.fileCount}

## Guidelines
1. Analyze the task and break it into steps
2. Use tools to gather information and perform actions
3. Explain what you're doing before each tool use
4. If a command fails, try an alternative approach
5. When the task is complete, summarize what was done

You must respond with a function call to execute actions.`;

    const userMessage = `Task: ${task}

Begin by understanding the task, then execute the necessary steps using the available tools.`;

    let iterations = 0;
    let finalResult = '';
    let messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];

    while (iterations < this.maxIterations) {
      iterations++;

      // Use function calling API
      const result = await this.llm.callWithFunctions(
        messages,
        this.tools,
        { temperature: 0.3, maxTokens: 2000 }
      );

      if (!result.success) {
        // Fallback to regular chat if function calling fails
        return this.runLegacy(task);
      }

      if (result.hasFunctionCall) {
        const { name, arguments: args } = result.functionCall;
        const tool = this.tools[name];

        if (tool) {
          // Execute the tool
          const toolResult = await tool.handler(args);

          // Add assistant message with function call
          messages.push({
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: `call_${iterations}`,
              type: 'function',
              function: {
                name,
                arguments: JSON.stringify(args)
              }
            }]
          });

          // Add tool result
          messages.push({
            role: 'tool',
            tool_call_id: `call_${iterations}`,
            content: JSON.stringify(toolResult)
          });

          // Check if task is complete (tool result indicates completion)
          if (toolResult?.done || toolResult?.complete) {
            finalResult = toolResult.message || 'Task completed successfully';
            break;
          }
        } else {
          messages.push({
            role: 'assistant',
            content: `Unknown tool: ${name}`
          });
        }
      } else {
        // No function call, check for completion
        if (result.message) {
          const lowerMsg = result.message.toLowerCase();
          if (lowerMsg.includes('done') || lowerMsg.includes('complete') || lowerMsg.includes('finished')) {
            finalResult = result.message;
            break;
          }
        }
        messages.push({ role: 'assistant', content: result.message });
      }

      // Add final message to continue conversation
      if (iterations < this.maxIterations) {
        messages.push({
          role: 'user',
          content: 'Continue with the next step or indicate if complete.'
        });
      }
    }

    return {
      success: iterations < this.maxIterations,
      task,
      iterations,
      result: finalResult || 'Task may be incomplete',
      history: messages
    };
  }

  // Legacy regex-based execution (fallback)
  async runLegacy(task, _options = {}) {
    this.conversationHistory = [];

    const context = await this.buildContext();
    const toolsDescription = Object.entries(this.tools)
      .map(([name, tool]) => `  ${name}: ${tool.description}`)
      .join('\n');

    const systemPrompt = `You are Sentinel Agent, an autonomous coding assistant. Your role is to accomplish tasks by breaking them down into steps and using available tools.

## Available Tools
${toolsDescription}

## Current Project
- Name: ${context.project.name}
- Version: ${context.project.version}
- Path: ${context.project.path}
- Files: ${context.fileCount}

## Guidelines
1. Analyze the task and break it into steps
2. Use tools to gather information and perform actions
3. After each tool use, explain what you're doing
4. If a command fails, try an alternative approach
5. When the task is complete, summarize what was done

## Output Format
For each step, use this format:
ACTION: tool_name
PARAMETERS: { "param": "value" }
THEN: Brief explanation of what happens next

When done, output:
DONE: Summary of what was accomplished`;

    const userMessage = `Task: ${task}

Begin by understanding the task, then execute the necessary steps.`;

    this.conversationHistory.push({ role: 'user', content: userMessage });

    let iterations = 0;
    let finalResult = '';
    let lastToolResult = null;

    while (iterations < this.maxIterations) {
      iterations++;

      const response = await this.llm.chat([
        { role: 'system', content: systemPrompt },
        ...this.conversationHistory,
        ...(lastToolResult ? [{ role: 'assistant', content: `Last tool result: ${JSON.stringify(lastToolResult)}` }] : [])
      ], {
        temperature: 0.3,
        maxTokens: 2000
      });

      this.conversationHistory.push({ role: 'assistant', content: response.text || response });

      const actionMatch = response.text?.match(/ACTION:\s*(\w+)/i);
      const paramsMatch = response.text?.match(/PARAMETERS:\s*(\{[\s\S]*?\})/i);
      const doneMatch = response.text?.match(/DONE:\s*(.+)/i);

      if (doneMatch) {
        finalResult = doneMatch[1];
        break;
      }

      if (actionMatch && paramsMatch) {
        const toolName = actionMatch[1].toLowerCase();
        let params = {};

        try {
          params = JSON.parse(paramsMatch[1]);
        } catch (e) {
          lastToolResult = { error: 'Failed to parse parameters' };
          continue;
        }

        const tool = this.tools[toolName];
        if (tool) {
          lastToolResult = await tool.handler(params);
        } else {
          lastToolResult = { error: `Unknown tool: ${toolName}` };
        }
      } else {
        if (response.text?.toLowerCase().includes('complete') || response.text?.toLowerCase().includes('finished')) {
          finalResult = response.text;
          break;
        }
        lastToolResult = { response: response.text };
      }
    }

    return {
      success: iterations < this.maxIterations,
      task,
      iterations,
      result: finalResult || 'Task may be incomplete',
      history: this.conversationHistory
    };
  }

  // Main run method - uses function calling if available
  async run(task, options = {}) {
    if (this.useFunctionCalling) {
      try {
        return await this.runWithFunctionCalling(task, options);
      } catch (e) {
        console.warn('Function calling failed, falling back to legacy mode');
        return this.runLegacy(task, options);
      }
    }
    return this.runLegacy(task, options);
  }

  async chat(message, options = {}) {
    const context = await this.buildContext();

    const prompt = `You are Sentinel CLI, an AI-powered code guardian. Be helpful, concise, and practical.

Current Project: ${context.project.name} (${context.project.version})
Path: ${context.project.path}
Files: ${context.fileCount}

${context.files.slice(0, 30).map(f => '  ' + f).join('\n')}

User: ${message}

Provide a helpful response. If you need to execute commands or access files, you can use the available tools.`;

    return await this.llm.chat([{ role: 'user', content: prompt }], options);
  }

  // ===== NEW: Streaming chat support =====
  async *streamChat(message, options = {}) {
    const context = await this.buildContext();

    const prompt = `You are Sentinel CLI, an AI-powered code guardian. Be helpful, concise, and practical.

Current Project: ${context.project.name} (${context.project.version})
Path: ${context.project.path}
Files: ${context.fileCount}

User: ${message}`;

    yield* this.llm.streamChat([{ role: 'user', content: prompt }], options);
  }

  setProjectPath(path) {
    this.projectPath = path;
    this.shell.setCwd(path);
    this.files.setBasePath(path);
  }
}

export default UniversalAgent;

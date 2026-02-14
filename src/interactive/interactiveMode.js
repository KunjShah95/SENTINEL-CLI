import readline from 'readline';
import chalk from 'chalk';
import { getSessionStore } from './sessionStore.js';
import { createContextAgent } from './enhancedContextAgent.js';
import { createLearningSystem } from './learningSystem.js';
import { getLLMOrchestrator } from '../llm/llmOrchestrator.js';
import { glob } from 'glob';
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Interactive Mode - Conversational CLI interface
 */
export class InteractiveMode {
  constructor(projectPath = process.cwd(), options = {}) {
    this.projectPath = projectPath;
    this.sessionStore = getSessionStore();
    this.contextAgent = createContextAgent(projectPath);
    this.learningSystem = createLearningSystem(projectPath);
    this.session = null;
    this.conversationHistory = [];
    this.context = null;
    this.rl = null;
    this.isRunning = false;

    this.options = {
      provider: options.provider || 'groq',
      model: options.model || 'mixtral',
      verbose: options.verbose || false,
      ...options
    };

    // Command handlers
    this.commandHandlers = {
      analyze: this.handleAnalyze.bind(this),
      fix: this.handleFix.bind(this),
      explain: this.handleExplain.bind(this),
      find: this.handleFind.bind(this),
      trace: this.handleTrace.bind(this),
      suggest: this.handleSuggest.bind(this),
      history: this.handleHistory.bind(this),
      context: this.handleContext.bind(this),
      clear: this.handleClear.bind(this),
      exit: this.handleExit.bind(this),
      help: this.handleHelp.bind(this)
    };
  }

  /**
   * Start interactive session
   */
  async start() {
    console.log(chalk.cyan.bold('\n🤖 Sentinel Interactive Mode\n'));
    console.log(chalk.gray('Type "help" for available commands, "exit" to quit\n'));

    // Create session
    this.session = this.sessionStore.createSession(this.projectPath, {
      mode: 'interactive',
      startedAt: new Date().toISOString()
    });

    // Build initial context
    console.log(chalk.gray('Building project context...'));
    this.context = await this.contextAgent.analyzeProject({
      deep: false,
      buildGraph: true
    });
    console.log(chalk.green('✓ Context ready\n'));

    // Setup readline
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan('sentinel> ')
    });

    this.isRunning = true;

    // Start conversation loop
    this.rl.prompt();

    this.rl.on('line', async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        this.rl.prompt();
        return;
      }

      // Store in conversation history
      this.conversationHistory.push({
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString()
      });

      this.sessionStore.addConversation(this.session.id, 'user', trimmed);

      // Process input
      try {
        await this.processInput(trimmed);
      } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
        if (this.options.verbose) {
          console.error(chalk.gray(error.stack));
        }
      }

      if (this.isRunning) {
        this.rl.prompt();
      }
    });

    this.rl.on('close', () => {
      this.stop();
    });
  }

  /**
   * Process user input
   */
  async processInput(input) {
    // Check for direct commands
    const words = input.toLowerCase().split(' ');
    const command = words[0];

    if (this.commandHandlers[command]) {
      const args = words.slice(1);
      await this.commandHandlers[command](args, input);
      return;
    }

    // Otherwise, use LLM to interpret and respond
    await this.handleNaturalLanguageQuery(input);
  }

  /**
   * Handle natural language queries using LLM
   */
  async handleNaturalLanguageQuery(_query) {
    const orchestrator = getLLMOrchestrator();

    // Build context for LLM
    const systemPrompt = this.buildSystemPrompt();

    // Build conversation history for context
    const messages = [
      { role: 'system', content: systemPrompt },
      ...this.conversationHistory.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    ];

    try {
      // Get response from LLM
      const response = await orchestrator.chat(messages, {
        provider: this.options.provider,
        model: this.options.model,
        temperature: 0.7,
        maxTokens: 1000
      });

      // Parse response for actions
      const parsed = this.parseResponse(response);

      // Execute actions if any
      if (parsed.actions && parsed.actions.length > 0) {
        for (const action of parsed.actions) {
          await this.executeAction(action);
        }
      }

      // Display response
      console.log(chalk.white(`\n${parsed.message}\n`));

      // Store assistant response
      this.conversationHistory.push({
        role: 'assistant',
        content: parsed.message,
        timestamp: new Date().toISOString()
      });

      this.sessionStore.addConversation(this.session.id, 'assistant', parsed.message);

    } catch (error) {
      console.error(chalk.red(`LLM Error: ${error.message}`));
    }
  }

  /**
   * Build system prompt with context
   */
  buildSystemPrompt() {
    return `You are Sentinel, an AI security assistant helping with code security analysis.

Project Context:
- Path: ${this.projectPath}
- Framework: ${JSON.stringify(this.context.framework)}
- Languages: ${this.context.technology?.languages?.join(', ') || 'Unknown'}
- Architecture: ${this.context.architecture?.pattern || 'Unknown'}

Available Commands:
- analyze [path] - Analyze files for security issues
- fix [file] - Auto-fix issues in a file
- explain [finding] - Explain a security finding
- find [query] - Search codebase
- trace [function] - Trace function calls
- suggest - Get proactive recommendations
- history - Show command history
- context - Display project context

Your role:
1. Answer security questions about the codebase
2. Suggest appropriate commands for user requests
3. Explain security concepts clearly
4. Provide actionable recommendations

Be concise and helpful. When suggesting commands, use the format:
ACTION: command_name args

Example:
"I'll analyze your authentication code.
ACTION: analyze src/auth.js"`;
  }

  /**
   * Parse LLM response for actions
   */
  parseResponse(response) {
    const actions = [];
    let message = response;

    // Extract ACTION: commands
    const actionRegex = /ACTION:\s*(\w+)\s+([^\n]+)/gi;
    let match;

    while ((match = actionRegex.exec(response)) !== null) {
      actions.push({
        command: match[1],
        args: match[2].trim().split(/\s+/)
      });

      // Remove action from message
      message = message.replace(match[0], '').trim();
    }

    return { message, actions };
  }

  /**
   * Execute parsed action
   */
  async executeAction(action) {
    if (this.commandHandlers[action.command]) {
      await this.commandHandlers[action.command](action.args);
    }
  }

  /**
   * Command Handlers
   */

  async handleAnalyze(args, _fullInput) {
    const path = args[0] || '.';

    console.log(chalk.gray(`Analyzing ${path}...`));

    // Use existing analyze functionality
    const files = await glob(path, {
      cwd: this.projectPath,
      ignore: ['**/node_modules/**', '**/dist/**']
    });

    console.log(chalk.green(`✓ Found ${files.length} files to analyze`));
    console.log(chalk.gray('Running security analysis...\n'));

    // This would integrate with existing analyzers
    console.log(chalk.yellow('Analysis would run here with existing analyzers'));
  }

  async handleFix(args) {
    const file = args[0];

    if (!file) {
      console.log(chalk.red('Please specify a file to fix'));
      return;
    }

    console.log(chalk.gray(`Attempting to fix issues in ${file}...`));
    console.log(chalk.yellow('Fix functionality would run here'));
  }

  async handleExplain(args) {
    const query = args.join(' ');

    if (!query) {
      console.log(chalk.red('Please specify what to explain'));
      return;
    }

    // Use LLM to explain
    const explanation = await this.getLLMExplanation(query);
    console.log(chalk.white(`\n${explanation}\n`));
  }

  async handleFind(args) {
    const query = args.join(' ');

    if (!query) {
      console.log(chalk.red('Please specify what to find'));
      return;
    }

    console.log(chalk.gray(`Searching for: ${query}`));

    // Search codebase
    const results = await this.searchCodebase(query);

    if (results.length === 0) {
      console.log(chalk.yellow('No results found'));
    } else {
      console.log(chalk.green(`\nFound ${results.length} results:\n`));
      results.slice(0, 10).forEach(result => {
        console.log(chalk.white(`  ${result.file}:${result.line}`));
        console.log(chalk.gray(`    ${result.snippet}\n`));
      });
    }
  }

  async handleTrace(args) {
    const functionName = args[0];

    if (!functionName) {
      console.log(chalk.red('Please specify a function to trace'));
      return;
    }

    console.log(chalk.gray(`Tracing ${functionName}...`));

    // Use code graph to trace
    if (this.context.codeGraph) {
      const traces = this.traceFunction(functionName);
      console.log(chalk.white(`\nCall chain for ${functionName}:\n`));
      traces.forEach((trace, i) => {
        console.log(chalk.white(`  ${i + 1}. ${trace.file} → ${trace.function}`));
      });
    }
  }

  async handleSuggest(_args) {
    console.log(chalk.gray('Analyzing codebase for recommendations...\n'));

    const suggestions = await this.getProactiveSuggestions();

    if (suggestions.length === 0) {
      console.log(chalk.green('✓ No issues found. Your codebase looks good!'));
    } else {
      console.log(chalk.yellow(`Found ${suggestions.length} recommendations:\n`));
      suggestions.forEach((suggestion, i) => {
        console.log(chalk.white(`${i + 1}. ${suggestion.title}`));
        console.log(chalk.gray(`   ${suggestion.description}\n`));
      });
    }
  }

  async handleHistory(args) {
    const limit = parseInt(args[0]) || 10;

    console.log(chalk.white(`\nLast ${limit} commands:\n`));

    const history = this.conversationHistory.slice(-limit);
    history.forEach((entry, _i) => {
      const color = entry.role === 'user' ? chalk.cyan : chalk.white;
      console.log(color(`${entry.role}: ${entry.content}`));
    });

    console.log('');
  }

  async handleContext(_args) {
    console.log(chalk.white('\nProject Context:\n'));

    console.log(chalk.cyan('Framework:'));
    console.log(chalk.white(JSON.stringify(this.context.framework, null, 2)));

    console.log(chalk.cyan('\nTechnology Stack:'));
    console.log(chalk.white(JSON.stringify(this.context.technology, null, 2)));

    console.log(chalk.cyan('\nArchitecture:'));
    console.log(chalk.white(JSON.stringify(this.context.architecture, null, 2)));

    console.log(chalk.cyan('\nSecurity Controls:'));
    console.log(chalk.white(JSON.stringify(this.context.securityControls, null, 2)));

    console.log('');
  }

  async handleClear(_args) {
    console.clear();
    console.log(chalk.cyan.bold('🤖 Sentinel Interactive Mode\n'));
  }

  async handleHelp(_args) {
    console.log(chalk.white('\nAvailable Commands:\n'));
    console.log(chalk.cyan('  analyze [path]') + chalk.gray('    - Analyze files for security issues'));
    console.log(chalk.cyan('  fix [file]') + chalk.gray('        - Auto-fix issues in a file'));
    console.log(chalk.cyan('  explain [topic]') + chalk.gray('   - Explain security concepts or findings'));
    console.log(chalk.cyan('  find [query]') + chalk.gray('      - Search codebase'));
    console.log(chalk.cyan('  trace [function]') + chalk.gray('  - Trace function call chain'));
    console.log(chalk.cyan('  suggest') + chalk.gray('          - Get proactive recommendations'));
    console.log(chalk.cyan('  history [n]') + chalk.gray('      - Show last n commands'));
    console.log(chalk.cyan('  context') + chalk.gray('          - Display project context'));
    console.log(chalk.cyan('  clear') + chalk.gray('            - Clear screen'));
    console.log(chalk.cyan('  help') + chalk.gray('             - Show this help'));
    console.log(chalk.cyan('  exit') + chalk.gray('             - Exit interactive mode\n'));

    console.log(chalk.white('You can also ask questions in natural language!\n'));
    console.log(chalk.gray('Examples:'));
    console.log(chalk.gray('  "Where do we validate user input?"'));
    console.log(chalk.gray('  "Show me SQL injection vulnerabilities"'));
    console.log(chalk.gray('  "Explain the auth flow"\n'));
  }

  async handleExit(_args) {
    console.log(chalk.green('\n👋 Goodbye!\n'));
    this.stop();
  }

  /**
   * Helper methods
   */

  async searchCodebase(query) {
    const files = await glob('**/*.{js,jsx,ts,tsx}', {
      cwd: this.projectPath,
      ignore: ['**/node_modules/**', '**/dist/**']
    });

    const results = [];

    for (const file of files) {
      const filePath = join(this.projectPath, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        if (line.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            file,
            line: index + 1,
            snippet: line.trim()
          });
        }
      });
    }

    return results;
  }

  traceFunction(functionName) {
    // Simplified tracing using code graph
    const traces = [];

    if (this.context.codeGraph && this.context.codeGraph.nodes) {
      for (const [file, node] of this.context.codeGraph.nodes) {
        if (node.functions.some(f => f.name === functionName)) {
          traces.push({
            file,
            function: functionName,
            type: 'definition'
          });
        }
      }
    }

    return traces;
  }

  async getProactiveSuggestions() {
    const suggestions = [];

    // Check security controls
    const controls = this.context.securityControls || {};

    if (!controls.rateLimiting || controls.rateLimiting.length === 0) {
      suggestions.push({
        title: 'Add Rate Limiting',
        description: 'Consider adding rate limiting to prevent abuse'
      });
    }

    if (!controls.csrf || controls.csrf.length === 0) {
      suggestions.push({
        title: 'Add CSRF Protection',
        description: 'CSRF protection is missing from your application'
      });
    }

    if (!controls.validation || controls.validation.length === 0) {
      suggestions.push({
        title: 'Add Input Validation',
        description: 'No input validation library detected'
      });
    }

    // Check for high-risk files without tests
    if (this.context.riskAreas && this.context.riskAreas.length > 0) {
      const highRisk = this.context.riskAreas.filter(r => r.severity === 'high');
      if (highRisk.length > 0) {
        suggestions.push({
          title: 'Test High-Risk Code',
          description: `${highRisk.length} high-risk files may need additional testing`
        });
      }
    }

    return suggestions;
  }

  async getLLMExplanation(query) {
    const orchestrator = getLLMOrchestrator();

    const messages = [
      {
        role: 'system',
        content: 'You are a security expert. Explain security concepts clearly and concisely.'
      },
      {
        role: 'user',
        content: `Explain: ${query}`
      }
    ];

    try {
      const response = await orchestrator.chat(messages, {
        provider: this.options.provider,
        model: this.options.model,
        temperature: 0.7,
        maxTokens: 500
      });

      return response;
    } catch (error) {
      return `Error getting explanation: ${error.message}`;
    }
  }

  /**
   * Stop interactive session
   */
  stop() {
    this.isRunning = false;

    if (this.rl) {
      this.rl.close();
    }

    if (this.session) {
      this.sessionStore.endSession(this.session.id);
    }

    process.exit(0);
  }
}

// Factory function
export function createInteractiveMode(projectPath, options) {
  return new InteractiveMode(projectPath, options);
}

export default InteractiveMode;

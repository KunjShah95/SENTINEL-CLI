import { BaseProvider } from './base-provider.js';
import { ModelRouter, ComplexityTiers } from './router.js';
import { ProjectScanner } from './project-scanner.js';
import { SessionStoreManager } from '../session/store.js';

export class Orchestrator {
  /**
   * @param {object} [config={}] - Configurations
   */
  constructor(config = {}) {
    this.sessionStore = new SessionStoreManager(config);
    this.activeSession = null;
    this.projectMetadata = null;
  }

  /**
   * Initialize orchestrator context with a session ID.
   * @param {string} sessionId 
   */
  async initialize(sessionId) {
    this.activeSession = await this.sessionStore.getSession(sessionId);
    if (!this.activeSession) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    const projectPath = this.activeSession.projectPath || process.cwd();
    this.projectMetadata = await ProjectScanner.scan(projectPath);
  }

  /**
   * Standard chat/prompt interface. Streams reasoning & response text.
   * @param {string} prompt 
   * @param {object} [options={}] - Options overrides
   * @returns {AsyncGenerator<string>} Chunks of assistant response
   */
  async *chat(prompt, options = {}) {
    if (!this.activeSession) {
      throw new Error('Orchestrator not initialized with an active session.');
    }

    const mode = options.mode || this.activeSession.mode;
    
    // Resolve model based on mode complexity
    const tier = (mode === 'PLAN' || mode === 'REVIEW') ? ComplexityTiers.PLANNING : ComplexityTiers.GEN_CODE;
    const resolved = ModelRouter.resolveModelForTier(tier);
    
    const provider = new BaseProvider({ modelId: resolved.modelId });

    // Append user message to database
    const messages = this.activeSession.messages || [];
    const userMessage = {
      id: Math.random().toString(36).substring(2, 9),
      role: 'user',
      content: prompt,
      createdAt: new Date().toISOString(),
    };
    messages.push(userMessage);
    await this.sessionStore.updateSession(this.activeSession.id, { messages });

    let assistantReply = '';
    const stream = provider.stream(prompt, {
      systemPrompt: options.systemPrompt,
      tools: options.tools,
    });

    for await (const chunk of stream) {
      assistantReply += chunk;
      yield chunk;
    }

    // Save assistant message to database
    const assistantMessage = {
      id: Math.random().toString(36).substring(2, 9),
      role: 'assistant',
      content: assistantReply,
      createdAt: new Date().toISOString(),
    };
    messages.push(assistantMessage);
    await this.sessionStore.updateSession(this.activeSession.id, { messages });
  }
}

export default Orchestrator;

import LLMOrchestrator from '../llm/llmOrchestrator.js';
import { buildSystemPrompt } from '../server/api/lib/system-prompt.js';
import { getToolContracts } from './index.js';

/**
 * Sentinel SDK (Programmatic Agent)
 *
 * Allows developers to build programmatic agents wrapping Sentinel's
 * LLM orchestration and tools.
 */
export class Agent {
  constructor(config = {}) {
    this.mode = config.mode || 'BUILD';
    this.model = config.model || 'claude-sonnet-4-6';

    this.orchestrator = new LLMOrchestrator({
      providers: config.providers || [
        {
          provider: config.provider || 'anthropic',
          model: this.model,
          apiKey: config.apiKey,
        },
      ],
      temperature: config.temperature ?? 0.2,
    });
  }

  /**
   * Streams the agent's reasoning, tool calls, and text response.
   */
  async *stream(prompt) {
    const systemPrompt = buildSystemPrompt({ mode: this.mode });
    const tools = getToolContracts(this.mode);

    const stream = await this.orchestrator.streamChat(prompt, { systemPrompt, tools });

    for await (const chunk of stream) {
      if (chunk.type === 'content') {
        yield chunk.content;
      }
    }
  }

  /**
   * Sends a prompt and waits for the full text response.
   */
  async send(prompt) {
    let fullResponse = '';
    for await (const chunk of this.stream(prompt)) {
      fullResponse += chunk;
    }
    return fullResponse;
  }
}

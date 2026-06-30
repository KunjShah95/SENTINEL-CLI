import LLMOrchestrator from '../../llm/llmOrchestrator.js';
import { resolveChatModel, getProviderOptions } from '../models/index.js';

/**
 * Base abstract wrapper for LLM provider communication.
 * Standardizes streaming outputs, model configurations, and tool calls.
 */
export class BaseProvider {
  /**
   * @param {object} config - Configuration options
   * @param {string} config.modelId - The active model identifier (e.g., 'llama-3.1-8b-instant')
   * @param {number} [config.temperature=0.2] - Sampling temperature
   * @param {number} [config.maxTokens=4096] - Hard token limit
   */
  constructor(config = {}) {
    this.modelId = config.modelId;
    this.temperature = config.temperature ?? 0.2;
    this.maxTokens = config.maxTokens ?? 4096;

    const resolved = resolveChatModel(this.modelId);
    this.provider = resolved.provider;
    this.model = resolved.modelId;

    this.orchestrator = new LLMOrchestrator({
      providers: [
        {
          provider: this.provider,
          model: this.model,
          apiKey: process.env[this.getEnvKey(this.provider)],
        }
      ],
      temperature: this.temperature,
      maxTokens: this.maxTokens,
    });
  }

  /**
   * Resolve corresponding environment variable key for the provider.
   * @param {string} provider 
   * @returns {string} env key name
   */
  getEnvKey(provider) {
    const map = {
      groq: 'GROQ_API_KEY',
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      google: 'GEMINI_API_KEY',
      mistral: 'MISTRAL_API_KEY',
      deepseek: 'DEEPSEEK_API_KEY',
      xai: 'XAI_API_KEY',
      together: 'TOGETHER_API_KEY',
      fireworks: 'FIREWORKS_API_KEY',
      perplexity: 'PERPLEXITY_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      'github-copilot': 'GITHUB_TOKEN',
    };
    return map[provider] || '';
  }

  /**
   * Send a prompt and wait for the entire text response.
   * @param {string} prompt 
   * @param {object} [options={}] - systemPrompt, tools overrides
   * @returns {Promise<string>} Full response text
   */
  async send(prompt, options = {}) {
    const systemPrompt = options.systemPrompt || 'You are a helpful coding assistant.';
    const providerOpts = getProviderOptions(this.modelId);

    const chatResponse = await this.orchestrator.chat(prompt, {
      systemPrompt,
      tools: options.tools,
      ...providerOpts,
      ...options,
    });

    return chatResponse.text || '';
  }

  /**
   * Stream the response text chunk-by-chunk.
   * @param {string} prompt 
   * @param {object} [options={}] - systemPrompt, tools overrides
   * @returns {AsyncGenerator<string>} Streamed text tokens
   */
  async *stream(prompt, options = {}) {
    const systemPrompt = options.systemPrompt || 'You are a helpful coding assistant.';
    const providerOpts = getProviderOptions(this.modelId);

    const streamGenerator = await this.orchestrator.streamChat(prompt, {
      systemPrompt,
      tools: options.tools,
      ...providerOpts,
      ...options,
    });

    for await (const chunk of streamGenerator) {
      if (chunk.type === 'content') {
        yield chunk.content;
      }
    }
  }
}

export default BaseProvider;

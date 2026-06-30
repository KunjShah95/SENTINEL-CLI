/**
 * AnthropicConnector — Claude API connector with standard ConnectorBase interface.
 *
 * Env vars: ANTHROPIC_API_KEY
 * Models: claude-sonnet-4-20250514, claude-3-5-sonnet-20241022, claude-3-opus-20240229, claude-3-haiku-20240307
 */

import { ConnectorBase } from './ConnectorBase.js';

export class AnthropicConnector extends ConnectorBase {
  id = 'anthropic';
  name = 'Anthropic Claude';
  description = 'Connect to Anthropic Claude models for code review, chat, and function calling';
  docsUrl = 'https://docs.anthropic.com/en/docs';

  static configSchema = {
    envVars: ['ANTHROPIC_API_KEY'],
    fields: [
      { key: 'apiKey', label: 'Anthropic API Key', type: 'password', env: 'ANTHROPIC_API_KEY' },
      { key: 'model', label: 'Model', type: 'select', default: 'claude-sonnet-4-20250514',
        options: [
          'claude-sonnet-4-20250514',
          'claude-3-5-sonnet-20241022',
          'claude-3-opus-20240229',
          'claude-3-haiku-20240307',
        ] },
    ],
  };

  constructor(options = {}) {
    super(options);
    this.apiKey = null;
    this.model = options.config?.model || 'claude-sonnet-4-20250514';
  }

  async connect() {
    this.apiKey = this.config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!this.apiKey) {
      return { success: false, message: 'ANTHROPIC_API_KEY not set. Provide via config or ANTHROPIC_API_KEY env var.' };
    }

    try {
      // Verify with a lightweight request to the messages API
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        return { success: false, message: `Anthropic API error (${response.status}): ${errBody}` };
      }

      this.connected = true;
      return { success: true, message: `Connected to Anthropic (${this.model})` };
    } catch (err) {
      this.connected = false;
      return { success: false, message: `Anthropic connection failed: ${err.message}` };
    }
  }

  async disconnect() {
    this.apiKey = null;
    this.connected = false;
    return { success: true, message: 'Anthropic disconnected' };
  }

  async healthCheck() {
    if (!this.apiKey) {
      return { alive: false, error: 'Not connected' };
    }
    try {
      const start = Date.now();
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Respond with just the word "ok".' }],
        }),
      });
      const latencyMs = Date.now() - start;

      if (!response.ok) {
        return { alive: false, error: `API error (${response.status})`, latencyMs };
      }

      const data = await response.json();
      return { alive: true, latencyMs, details: `Model: ${this.model}, Response: "${(data.content?.[0]?.text || '').trim()}"` };
    } catch (err) {
      return { alive: false, error: err.message };
    }
  }

  /**
   * Send a prompt to Claude and get the text response.
   */
  async chat(prompt, options = {}) {
    if (!this.apiKey) throw new Error('Not connected. Call connect() first.');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || this.model,
        max_tokens: options.maxTokens || 2000,
        temperature: options.temperature ?? 0.3,
        system: options.systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errBody}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || '';
  }
}

export default AnthropicConnector;

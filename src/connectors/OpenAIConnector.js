/**
 * OpenAIConnector — ChatGPT / OpenAI API connector with standard ConnectorBase interface.
 *
 * Env vars: OPENAI_API_KEY
 * Models: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo, o3-mini, o1
 */

import { ConnectorBase } from './ConnectorBase.js';

export class OpenAIConnector extends ConnectorBase {
  id = 'openai';
  name = 'OpenAI ChatGPT';
  description = 'Connect to OpenAI GPT models for code review, chat, function calling, and embeddings';
  docsUrl = 'https://platform.openai.com/docs';

  static configSchema = {
    envVars: ['OPENAI_API_KEY'],
    fields: [
      { key: 'apiKey', label: 'OpenAI API Key', type: 'password', env: 'OPENAI_API_KEY' },
      { key: 'model', label: 'Model', type: 'select', default: 'gpt-4o-mini',
        options: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o3-mini', 'o1'] },
      { key: 'organization', label: 'Organization ID', type: 'text', optional: true },
    ],
  };

  constructor(options = {}) {
    super(options);
    this.apiKey = null;
    this.organization = options.config?.organization || null;
    this.model = options.config?.model || 'gpt-4o-mini';
  }

  async connect() {
    this.apiKey = this.config.apiKey || process.env.OPENAI_API_KEY;
    if (!this.apiKey) {
      return { success: false, message: 'OPENAI_API_KEY not set. Provide via config or OPENAI_API_KEY env var.' };
    }

    try {
      const headers = {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      };
      if (this.organization) headers['OpenAI-Organization'] = this.organization;

      const response = await fetch('https://api.openai.com/v1/models', { headers });

      if (!response.ok) {
        const errBody = await response.text();
        return { success: false, message: `OpenAI API error (${response.status}): ${errBody}` };
      }

      const data = await response.json();
      this.connected = true;
      return { success: true, message: `Connected to OpenAI — ${data.data?.length || '?'} models available` };
    } catch (err) {
      this.connected = false;
      return { success: false, message: `OpenAI connection failed: ${err.message}` };
    }
  }

  async disconnect() {
    this.apiKey = null;
    this.connected = false;
    return { success: true, message: 'OpenAI disconnected' };
  }

  async healthCheck() {
    if (!this.apiKey) {
      return { alive: false, error: 'Not connected' };
    }
    try {
      const start = Date.now();
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
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
      return {
        alive: true,
        latencyMs,
        details: `Model: ${this.model}, Response: "${(data.choices?.[0]?.message?.content || '').trim()}"`,
      };
    } catch (err) {
      return { alive: false, error: err.message };
    }
  }

  /**
   * Send a chat prompt to OpenAI and get the text response.
   */
  async chat(prompt, options = {}) {
    if (!this.apiKey) throw new Error('Not connected. Call connect() first.');

    const messages = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || this.model,
        max_tokens: options.maxTokens || 2000,
        temperature: options.temperature ?? 0.3,
        messages,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errBody}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
}

export default OpenAIConnector;

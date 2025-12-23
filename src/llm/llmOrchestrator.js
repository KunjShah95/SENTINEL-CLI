import axios from 'axios';
import rateLimiter from '../utils/rateLimiter.js';

let GoogleGenerativeAIClient = null;
let GroqClient = null;

const ENV_FALLBACKS = {
  openai: 'OPENAI_API_KEY',
  groq: 'GROQ_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

const SEVERITY_ORDER = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export default class LLMOrchestrator {
  constructor(aiConfig = {}) {
    this.temperature = aiConfig.temperature ?? 0.3;
    this.maxTokens = aiConfig.maxTokens ?? 2000;
    this.providers = this.normalizeProviders(aiConfig);
  }

  normalizeProviders(aiConfig) {
    const configuredProviders =
      Array.isArray(aiConfig.providers) && aiConfig.providers.length > 0
        ? aiConfig.providers
        : [
          {
            id: aiConfig.provider || 'local',
            provider: aiConfig.provider || 'local',
            model: aiConfig.model || 'gpt-3.5-turbo',
            enabled: true,
          },
        ];

    return configuredProviders
      .map((providerConfig, index) => {
        const envKey = providerConfig.apiKeyEnv || ENV_FALLBACKS[providerConfig.provider];
        const apiKey = envKey ? process.env[envKey] : undefined;

        if (providerConfig.enabled !== false && providerConfig.provider !== 'local' && !apiKey) {
          console.warn(
            `Provider "${providerConfig.id || providerConfig.provider}" is enabled but ${envKey || 'an API key env var'} is not set. It will be skipped.`
          );
        }

        return {
          id: providerConfig.id || `${providerConfig.provider || 'provider'}-${index}`,
          provider: providerConfig.provider || 'local',
          model: providerConfig.model,
          apiKey,
          enabled: providerConfig.enabled !== false,
          weight: providerConfig.weight ?? 0.33,
          metadata: providerConfig.metadata || {},
        };
      })
      .filter(provider => provider.enabled && (provider.provider === 'local' || provider.apiKey));
  }

  async review(prompt, { filePath } = {}) {
    if (this.providers.length === 0) {
      return { mergedIssues: [], providerFindings: [] };
    }

    const calls = this.providers.map(provider =>
      this.callProviderForFormat(provider, prompt, {
        systemPrompt: 'You are a code review assistant. Respond in JSON.',
        responseFormat: 'json_object',
      })
        .then(result => ({
          provider,
          ...result,
        }))
        .catch(error => ({
          provider,
          issues: [],
          error: error.message,
        }))
    );

    const settled = await Promise.allSettled(calls);
    const providerFindings = [];

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        providerFindings.push(result.value);
      } else {
        providerFindings.push({
          provider: result.reason?.provider,
          issues: [],
          error: result.reason?.message || 'Unknown provider failure',
        });
      }
    }

    const mergedIssues = this.mergeIssues(providerFindings, filePath);
    return { mergedIssues, providerFindings };
  }

  async chat(prompt, options = {}) {
    const systemPrompt =
      options.systemPrompt ||
      'You are Sentinel CLI, a concise and upbeat assistant for developers. Respond conversationally.';

    if (this.providers.length === 0) {
      const localText = this.generateLocalResponse(prompt);
      return {
        text: localText,
        responses: [{ provider: { id: 'local', provider: 'local', weight: 1 }, text: localText }],
      };
    }

    const calls = this.providers.map(provider =>
      this.callProviderForFormat(provider, prompt, {
        systemPrompt,
        responseFormat: 'text',
      })
        .then(result => ({
          provider,
          text: (result.response || '').trim(),
          latency: result.latency,
        }))
        .catch(error => ({
          provider,
          text: '',
          error: error.message,
        }))
    );

    const settled = await Promise.allSettled(calls);
    const responses = settled.map(item => (item.status === 'fulfilled' ? item.value : item.reason));

    const best =
      responses
        .filter(res => res && res.text)
        .sort((a, b) => (b.provider?.weight ?? 0) - (a.provider?.weight ?? 0))[0] || null;

    if (best) {
      return { text: best.text, responses };
    }

    const fallback = this.generateLocalResponse(prompt);
    return {
      text: fallback,
      responses: [
        ...responses,
        { provider: { id: 'local', provider: 'local', weight: 0 }, text: fallback },
      ],
    };
  }

  async callProviderForFormat(provider, prompt, options = {}) {
    const started = Date.now();
    let response = '';

    switch (provider.provider) {
      case 'openai':
        response = await this.callOpenAI(provider, prompt, options);
        break;
      case 'anthropic':
        response = await this.callAnthropic(provider, prompt, options);
        break;
      case 'groq':
        response = await this.callGroq(provider, prompt, options);
        break;
      case 'gemini':
        response = await this.callGemini(provider, prompt, options);
        break;
      case 'openrouter':
        response = await this.callOpenRouter(provider, prompt, options);
        break;
      case 'local':
      default:
        response =
          options.responseFormat === 'json_object'
            ? JSON.stringify({ issues: [] })
            : this.generateLocalResponse(prompt);
        break;
    }

    const issues =
      options.responseFormat === 'json_object' ? this.parseResponse(response) : undefined;
    return {
      issues,
      response,
      latency: Date.now() - started,
    };
  }

  buildMessages(systemPrompt, prompt) {
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });
    return messages;
  }

  async callOpenAI(provider, prompt, options = {}) {
    const messages = this.buildMessages(options.systemPrompt, prompt);
    const payload = {
      model: provider.model || 'gpt-4o-mini',
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      messages,
    };

    if (options.responseFormat === 'json_object') {
      payload.response_format = { type: 'json_object' };
    }

    const response = await rateLimiter.schedule(() =>
      axios.post('https://api.openai.com/v1/chat/completions', payload, {
        headers: { Authorization: `Bearer ${provider.apiKey}` },
      })
    );

    return response.data.choices[0]?.message?.content || '';
  }

  async callGroq(provider, prompt, options = {}) {
    if (!GroqClient) {
      const module = await import('groq-sdk');
      GroqClient = module.default || module.Groq || module;
    }
    const groq = new GroqClient({ apiKey: provider.apiKey });
    const messages = this.buildMessages(options.systemPrompt, prompt);
    const response = await groq.chat.completions.create({
      model: provider.model || 'llama3-70b-8192',
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      messages,
      ...(options.responseFormat === 'json_object'
        ? { response_format: { type: 'json_object' } }
        : {}),
    });
    return response.choices[0]?.message?.content || '';
  }

  async callGemini(provider, prompt, options = {}) {
    if (!GoogleGenerativeAIClient) {
      const module = await import('@google/generative-ai');
      GoogleGenerativeAIClient = module.GoogleGenerativeAI || module.default;
    }
    const genAI = new GoogleGenerativeAIClient(provider.apiKey);
    const model = genAI.getGenerativeModel({ model: provider.model || 'gemini-1.5-flash' });
    const finalPrompt = options.systemPrompt
      ? `${options.systemPrompt}\n\nUser:\n${prompt}`
      : prompt;
    const result = await model.generateContent(finalPrompt);
    const response = await result.response;
    return response.text();
  }

  async callOpenRouter(provider, prompt, options = {}) {
    const messages = this.buildMessages(options.systemPrompt, prompt);
    const response = await rateLimiter.schedule(() =>
      axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: provider.model || 'google/gemini-pro-1.5',
          temperature: this.temperature,
          max_tokens: this.maxTokens,
          messages,
        },
        {
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            'HTTP-Referer':
              provider.metadata?.referer || 'https://github.com/KunjShah95/Sentinel-CLI',
          },
        }
      )
    );
    return response.data.choices[0]?.message?.content || '';
  }

  async callAnthropic(provider, prompt, options = {}) {
    const response = await rateLimiter.schedule(() =>
      axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: provider.model || 'claude-3-opus-20240229',
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          messages: [{ role: 'user', content: prompt }],
          ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
        },
        {
          headers: {
            'x-api-key': provider.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
        }
      )
    );
    return response.data?.content?.[0]?.text || '';
  }

  generateLocalResponse(prompt) {
    return `Sentinel-local: "${prompt.slice(0, 80)}"${prompt.length > 80 ? '...' : ''
      } (add API keys to get real answers).`;
  }

  parseResponse(rawResponse) {
    if (!rawResponse || typeof rawResponse !== 'string') {
      return [];
    }

    let cleaned = rawResponse.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/, '');
    }

    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed?.issues)) {
        return parsed.issues;
      }
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (_error) {
      return [];
    }

    return [];
  }

  mergeIssues(providerFindings, filePath) {
    const merged = new Map();

    for (const result of providerFindings) {
      if (!result || !Array.isArray(result.issues)) continue;

      for (const issue of result.issues) {
        const normalized = this.normalizeIssue(issue, filePath, result.provider);
        const key = this.getIssueKey(normalized);

        if (!merged.has(key)) {
          merged.set(key, normalized);
        } else {
          const existing = merged.get(key);
          existing.sourceProviders = Array.from(
            new Set([...(existing.sourceProviders || []), ...(normalized.sourceProviders || [])])
          );
          existing.confidence = Math.min(
            0.99,
            (existing.confidence || 0.5) + (normalized.confidence || 0.1)
          );
          if (this.compareSeverity(normalized.severity, existing.severity) < 0) {
            existing.severity = normalized.severity;
          }
          if (!existing.suggestion && normalized.suggestion) {
            existing.suggestion = normalized.suggestion;
          }
          existing.tags = Array.from(
            new Set([...(existing.tags || []), ...(normalized.tags || [])])
          );
        }
      }
    }

    return Array.from(merged.values());
  }

  getIssueKey(issue) {
    return [
      issue.file || 'unknown',
      issue.line || 0,
      issue.title || 'issue',
      issue.message || '',
    ].join('|');
  }

  normalizeIssue(issue, filePath, provider = {}) {
    const severity = this.normalizeSeverity(issue.severity);
    const type = (issue.type || 'ai').toLowerCase();
    const normalized = {
      severity,
      type,
      title: issue.title || 'AI flagged issue',
      message: issue.message || issue.detail || '',
      file: issue.file || filePath || issue.path || 'unknown',
      line: issue.line || issue.lineNumber || issue.startLine || null,
      column: issue.column || issue.col || 1,
      snippet: issue.snippet,
      suggestion: issue.suggestion || issue.fix || issue.remediation,
      tags: Array.from(new Set([...(issue.tags || []), 'ai', provider.provider].filter(Boolean))),
      confidence: issue.confidence ?? provider.weight ?? 0.5,
      sourceProviders: [provider.id || provider.provider || 'ai'],
    };

    return normalized;
  }

  normalizeSeverity(severity) {
    if (!severity) return 'medium';
    const lower = severity.toString().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(SEVERITY_ORDER, lower)) {
      return lower;
    }
    return 'medium';
  }

  compareSeverity(a = 'medium', b = 'medium') {
    const rankA = SEVERITY_ORDER[a] ?? SEVERITY_ORDER.medium;
    const rankB = SEVERITY_ORDER[b] ?? SEVERITY_ORDER.medium;
    return rankA - rankB;
  }
}

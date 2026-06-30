/**
 * Comprehensive test suite for LLMOrchestrator (822 lines, zero coverage).
 *
 * Patterns for mocking provider APIs:
 *   - axios (OpenAI, Anthropic, OpenRouter, Ollama)
 *   - groq-sdk SDK (Groq) — via constructor sdkOverrides
 *   - @google/generative-ai SDK (Gemini) — via constructor sdkOverrides
 *   - enhancedRateLimiter wrapper — via mock.method
 *
 * Run with:
 *   node --test __tests__/llmOrchestrator.test.js
 *   node --test __tests__/llmOrchestrator.test.js --test-name-pattern="mergeIssues"
 */
import { test, describe, before, after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

let LLMOrchestrator, getLLMOrchestrator, setLLMOrchestrator;
let axios;

before(async () => {
  // ─── Pattern: Mock axios BEFORE importing the module ───
  // LLMOrchestrator imports axios at module scope. The mock must be
  // in place before the first import() call.
  const mod = await import('axios');
  axios = mod.default;
  mock.method(axios, 'post', async () => {
    throw new Error('You must override axios.post in each test');
  });

  // ─── Pattern: Mock enhancedRateLimiter to pass through ───
  const rateLimiter = await import('../src/utils/enhancedRateLimiter.js');
  mock.method(rateLimiter.default, 'schedule', async (_key, fn) => fn());

  // Now import the module under test.
  // SDK modules (groq-sdk, @google/generative-ai) are injected via
  // constructor sdkOverrides option in the Groq/Gemini tests below.
  const llmMod = await import('../src/llm/llmOrchestrator.js');
  LLMOrchestrator = llmMod.default;
  getLLMOrchestrator = llmMod.getLLMOrchestrator;
  setLLMOrchestrator = llmMod.setLLMOrchestrator;
});

after(() => {
  mock.restoreAll();
});

afterEach(() => {
  setLLMOrchestrator(null);
  process.env.OPENAI_API_KEY = '';
  process.env.ANTHROPIC_API_KEY = '';
  process.env.GROQ_API_KEY = '';
  process.env.GEMINI_API_KEY = '';
  process.env.OPENROUTER_API_KEY = '';
  process.env.OLLAMA_HOST = '';
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern: TEST PROVIDER NORMALIZATION
// ════════════════════════════════════════════════════════════════════════════

describe('normalizeProviders()', () => {
  test('falls back to single local provider when aiConfig has no providers', () => {
    const o = new LLMOrchestrator({});
    assert.equal(o.providers.length, 1);
    assert.equal(o.providers[0].provider, 'local');
  });

  test('reads API key from env var for each provider', () => {
    process.env.OPENAI_API_KEY = 'sk-test-123';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-456';

    const o = new LLMOrchestrator({
      providers: [
        { id: 'openai', provider: 'openai', model: 'gpt-4', enabled: true },
        { id: 'anthropic', provider: 'anthropic', model: 'claude-3', enabled: true },
      ],
    });

    const openai = o.providers.find(p => p.provider === 'openai');
    const anthropic = o.providers.find(p => p.provider === 'anthropic');
    assert.equal(openai.apiKey, 'sk-test-123');
    assert.equal(anthropic.apiKey, 'sk-ant-test-456');
  });

  test('filters out disabled providers', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const o = new LLMOrchestrator({
      providers: [
        { id: 'openai', provider: 'openai', enabled: true },
        { id: 'disabled-provider', provider: 'openai', enabled: false },
      ],
    });
    assert.equal(o.providers.length, 1);
    assert.equal(o.providers[0].id, 'openai');
  });

  test('filters out non-local providers with no API key', () => {
    const o = new LLMOrchestrator({
      providers: [
        { id: 'openai', provider: 'openai', enabled: true },
        { id: 'ollama', provider: 'ollama', enabled: true },
      ],
    });
    assert.equal(o.providers.length, 1);
    assert.equal(o.providers[0].provider, 'ollama');
  });

  test('assigns default weight of 0.33', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const o = new LLMOrchestrator({
      providers: [{ id: 'openai', provider: 'openai', enabled: true }],
    });
    assert.equal(o.providers[0].weight, 0.33);
  });

  test('inherits metadata from config', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const o = new LLMOrchestrator({
      providers: [{
        id: 'openai', provider: 'openai', enabled: true,
        metadata: { referer: 'https://my-app.com' },
      }],
    });
    assert.equal(o.providers[0].metadata.referer, 'https://my-app.com');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern: MOCK AXIOS POST FOR A SPECIFIC PROVIDER
// ════════════════════════════════════════════════════════════════════════════

describe('callProviderForFormat() — OpenAI', () => {
  test('sends correct OpenAI payload and returns parsed response', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-openai';

    let calledUrl, calledPayload, calledHeaders;
    mock.method(axios, 'post', async (url, payload, config) => {
      calledUrl = url;
      calledPayload = payload;
      calledHeaders = config.headers;
      return {
        data: {
          choices: [{ message: { content: '{"issues": [{"title": "SQL injection", "severity": "high"}]}' } }],
        },
      };
    });

    const o = new LLMOrchestrator({
      providers: [{ id: 'openai', provider: 'openai', model: 'gpt-4o', enabled: true }],
    });

    const result = await o.callProviderForFormat(
      o.providers[0],
      'Review this code',
      { systemPrompt: 'Review as JSON', responseFormat: 'json_object' }
    );

    assert.equal(calledUrl, 'https://api.openai.com/v1/chat/completions');
    assert.equal(calledPayload.model, 'gpt-4o');
    assert.equal(calledPayload.temperature, 0.3);
    assert.ok(calledPayload.messages.some(m => m.content === 'Review this code'));
    assert.equal(calledPayload.response_format.type, 'json_object');
    assert.equal(calledHeaders.Authorization, 'Bearer sk-test-openai');
    assert.ok(Array.isArray(result.issues));
    assert.equal(result.issues[0].title, 'SQL injection');
    assert.ok(result.latency >= 0);
  });
});

describe('callProviderForFormat() — Anthropic', () => {
  test('uses correct Anthropic API format and headers', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

    mock.method(axios, 'post', async (url, _payload, config) => {
      assert.equal(url, 'https://api.anthropic.com/v1/messages');
      assert.equal(config.headers['x-api-key'], 'sk-ant-test');
      assert.equal(config.headers['anthropic-version'], '2023-06-01');
      return {
        data: { content: [{ text: 'No issues found in review.' }] },
      };
    });

    const o = new LLMOrchestrator({
      providers: [{
        id: 'anthropic', provider: 'anthropic', model: 'claude-3-opus-20240229', enabled: true,
      }],
    });

    const result = await o.callProviderForFormat(
      o.providers[0],
      'Review this',
      { responseFormat: 'text' }
    );

    assert.ok(result.response.includes('No issues found'));
  });
});

describe('callProviderForFormat() — Groq', () => {
  // Pattern: SDK mocked via sdkOverrides with a regular function (new-compatible)
  test('calls Groq SDK and returns content', async () => {
    process.env.GROQ_API_KEY = 'gsk-test';

    const mockGroqClient = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: '{"issues": []}' } }],
          }),
        },
      },
    };

    const o = new LLMOrchestrator({
      providers: [{
        id: 'groq', provider: 'groq', model: 'llama3-70b-8192', enabled: true,
      }],
      sdkOverrides: {
        'groq-sdk': function() { return mockGroqClient; },
      },
    });

    const result = await o.callProviderForFormat(
      o.providers[0],
      'Review',
      { responseFormat: 'json_object' }
    );

    assert.ok(Array.isArray(result.issues));
    assert.ok(result.latency >= 0);
  });
});

describe('callProviderForFormat() — Gemini', () => {
  // Pattern: SDK mocked via sdkOverrides with a regular function (new-compatible)
  test('calls Gemini SDK and returns text', async () => {
    process.env.GEMINI_API_KEY = 'gemini-test';

    const mockResponse = { response: { text: () => 'Gemini analysis complete' } };
    const mockModel = { generateContent: async () => mockResponse };
    const mockGenAI = { getGenerativeModel: () => mockModel };

    const o = new LLMOrchestrator({
      providers: [{ id: 'gemini', provider: 'gemini', enabled: true }],
      sdkOverrides: {
        '@google/generative-ai': function() { return mockGenAI; },
      },
    });

    const result = await o.callProviderForFormat(
      o.providers[0],
      'Review this',
      { responseFormat: 'text' }
    );

    assert.equal(result.response, 'Gemini analysis complete');
  });
});

describe('callProviderForFormat() — OpenRouter', () => {
  test('includes HTTP-Referer header from provider metadata', async () => {
    process.env.OPENROUTER_API_KEY = 'or-test';

    mock.method(axios, 'post', async (url, _payload, config) => {
      assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
      assert.equal(config.headers['HTTP-Referer'], 'https://my-custom-app.com');
      assert.equal(config.headers['Authorization'], 'Bearer or-test');
      return { data: { choices: [{ message: { content: 'OpenRouter result' } }] } };
    });

    const o = new LLMOrchestrator({
      providers: [{
        id: 'openrouter', provider: 'openrouter', enabled: true,
        metadata: { referer: 'https://my-custom-app.com' },
      }],
    });

    const result = await o.callProviderForFormat(o.providers[0], 'Analyze', {});
    assert.equal(result.response, 'OpenRouter result');
  });
});

describe('callProviderForFormat() — Ollama', () => {
  test('uses OLLAMA_HOST env var as host URL', async () => {
    process.env.OLLAMA_HOST = 'http://custom-host:1234';

    mock.method(axios, 'post', async (url) => {
      assert.ok(url.startsWith('http://custom-host:1234'));
      return { data: { choices: [{ message: { content: 'Ollama response' } }] } };
    });

    const o = new LLMOrchestrator({
      providers: [{ id: 'ollama', provider: 'ollama', enabled: true }],
    });

    const result = await o.callProviderForFormat(o.providers[0], 'Review', {});
    assert.equal(result.response, 'Ollama response');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern: TEST LOCAL FALLBACK
// ════════════════════════════════════════════════════════════════════════════

describe('generateLocalResponse()', () => {
  test('returns formatted local message for string prompt', () => {
    const o = new LLMOrchestrator({});
    const r = o.generateLocalResponse('What is the weather?');
    assert.ok(r.startsWith('Sentinel-local:'));
    assert.ok(r.includes('What is the weather?'));
    assert.ok(r.includes('add API keys'));
  });

  test('handles array of messages by joining content', () => {
    const o = new LLMOrchestrator({});
    const messages = [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello' },
    ];
    const r = o.generateLocalResponse(messages);
    assert.ok(r.includes('You are helpful'));
    assert.ok(r.includes('Hello'));
  });

  test('truncates long prompts with ellipsis', () => {
    const o = new LLMOrchestrator({});
    const longPrompt = 'A'.repeat(200);
    const r = o.generateLocalResponse(longPrompt);
    assert.ok(r.includes('...'));
    assert.ok(r.length < 200);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern: TEST CHAT() WITH MULTIPLE PROVIDERS
// ════════════════════════════════════════════════════════════════════════════

describe('chat()', () => {
  test('returns local response when no providers configured', async () => {
    const o = new LLMOrchestrator({});
    const r = await o.chat('Hello');
    assert.ok(r.text.startsWith('Sentinel-local:'));
    assert.equal(r.responses[0].provider.id, 'local');
  });

  test('picks best response by provider weight', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

    mock.method(axios, 'post', async (url) => {
      if (url.includes('openai.com')) {
        return { data: { choices: [{ message: { content: 'OpenAI response' } }] } };
      }
      if (url.includes('anthropic.com')) {
        return { data: { content: [{ text: 'Anthropic response' }] } };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const o = new LLMOrchestrator({
      providers: [
        { id: 'openai', provider: 'openai', enabled: true, weight: 0.3 },
        { id: 'anthropic', provider: 'anthropic', enabled: true, weight: 0.7 },
      ],
    });

    const r = await o.chat('Analyze this');
    assert.equal(r.text, 'Anthropic response');
    assert.equal(r.responses.length, 2);
  });

  test('handles partial provider failures gracefully', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

    // Use URL-based differentiation instead of shared callCount
    // because Promise.allSettled runs providers concurrently.
    mock.method(axios, 'post', async (url) => {
      if (url.includes('openai.com')) throw new Error('OpenAI rate limited');
      if (url.includes('anthropic.com')) {
        return { data: { content: [{ text: 'Anthropic fallback' }] } };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const o = new LLMOrchestrator({
      providers: [
        { id: 'openai', provider: 'openai', enabled: true, weight: 0.5 },
        { id: 'anthropic', provider: 'anthropic', enabled: true, weight: 0.5 },
      ],
    });

    const r = await o.chat('Test');
    assert.equal(r.text, 'Anthropic fallback');
  });

  test('falls back to local when all providers fail', async () => {
    mock.method(axios, 'post', async () => {
      throw new Error('All providers down');
    });

    process.env.OPENAI_API_KEY = 'sk-test';
    const o = new LLMOrchestrator({
      providers: [{ id: 'openai', provider: 'openai', enabled: true }],
    });

    const r = await o.chat('Hello');
    assert.ok(r.text.startsWith('Sentinel-local:'));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern: TEST REVIEW() — Multi-Provider Merge
// ════════════════════════════════════════════════════════════════════════════

describe('review() — multi-provider merge', () => {
  test('returns empty merged issues with only local fallback', async () => {
    const o = new LLMOrchestrator({});
    const r = await o.review('Review');
    assert.deepEqual(r.mergedIssues, []);
    assert.equal(r.providerFindings.length, 1);
    assert.equal(r.providerFindings[0].provider.provider, 'local');
  });

  test('merges duplicate issues from multiple providers', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

    const sharedIssue = { title: 'SQL Injection', severity: 'high', file: 'app.js', line: 42 };
    const sharedJson = JSON.stringify({ issues: [sharedIssue] });

    mock.method(axios, 'post', async (url) => {
      if (url.includes('openai.com')) {
        return { data: { choices: [{ message: { content: sharedJson } }] } };
      }
      if (url.includes('anthropic.com')) {
        return { data: { content: [{ text: sharedJson }] } };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const o = new LLMOrchestrator({
      providers: [
        { id: 'openai', provider: 'openai', enabled: true, weight: 0.3 },
        { id: 'anthropic', provider: 'anthropic', enabled: true, weight: 0.7 },
      ],
    });

    const r = await o.review('Review code', { filePath: 'app.js' });

    assert.equal(r.mergedIssues.length, 1);
    assert.equal(r.mergedIssues[0].title, 'SQL Injection');
    assert.ok(r.mergedIssues[0].confidence >= 0.4);
    assert.ok(r.mergedIssues[0].sourceProviders.includes('openai'));
    assert.ok(r.mergedIssues[0].sourceProviders.includes('anthropic'));
  });

  test('keeps highest severity when providers disagree', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';

    mock.method(axios, 'post', async () => ({
      data: {
        choices: [{
          message: {
            content: '{"issues": [{"title": "XSS", "severity": "critical", "file": "app.js"}, {"title": "Typo", "severity": "low", "file": "app.js"}]}',
          },
        }],
      },
    }));

    const o = new LLMOrchestrator({
      providers: [{ id: 'openai', provider: 'openai', enabled: true }],
    });

    const r = await o.review('Review');
    assert.equal(r.mergedIssues.length, 2);
    const xss = r.mergedIssues.find(i => i.title === 'XSS');
    assert.equal(xss.severity, 'critical');
  });

  test('handles unparseable response gracefully', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';

    mock.method(axios, 'post', async () => ({
      data: { choices: [{ message: { content: 'Not JSON at all' } }] },
    }));

    const o = new LLMOrchestrator({
      providers: [{ id: 'openai', provider: 'openai', enabled: true }],
    });

    const r = await o.review('Review');
    assert.deepEqual(r.mergedIssues, []);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern: TEST parseResponse() EDGE CASES
// ════════════════════════════════════════════════════════════════════════════

describe('parseResponse()', () => {
  let o;
  before(() => { o = new LLMOrchestrator({}); });

  test('parses clean JSON with issues array', () => {
    const raw = JSON.stringify({ issues: [{ title: 'Test', severity: 'high' }] });
    const r = o.parseResponse(raw);
    assert.equal(r.length, 1);
    assert.equal(r[0].title, 'Test');
  });

  test('parses json code block (```json ... ```)', () => {
    const raw = '```json\n{"issues": [{"title": "XSS"}]}\n```';
    const r = o.parseResponse(raw);
    assert.equal(r.length, 1);
    assert.equal(r[0].title, 'XSS');
  });

  test('parses plain code block (```...)', () => {
    const raw = '```\n{"issues": [{"title": "CSRF"}]}\n```';
    const r = o.parseResponse(raw);
    assert.equal(r.length, 1);
  });

  test('returns empty array for non-JSON string', () => {
    assert.deepEqual(o.parseResponse('Just some text from the AI'), []);
  });

  test('returns empty array for null/undefined/empty', () => {
    assert.deepEqual(o.parseResponse(null), []);
    assert.deepEqual(o.parseResponse(undefined), []);
    assert.deepEqual(o.parseResponse(''), []);
  });

  test('handles JSON array at top level', () => {
    const raw = JSON.stringify([{ title: 'Issue1' }, { title: 'Issue2' }]);
    const r = o.parseResponse(raw);
    assert.equal(r.length, 2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern: TEST normalizeIssue() AND mergeIssues()
// ════════════════════════════════════════════════════════════════════════════

describe('normalizeIssue()', () => {
  let o;
  before(() => { o = new LLMOrchestrator({}); });

  test('normalizes field name variants (line, lineNumber, startLine)', () => {
    const r = o.normalizeIssue({ title: 'Bug', lineNumber: 15 }, 'app.js', { id: 'openai', provider: 'openai' });
    assert.equal(r.line, 15);
  });

  test('defaults severity to medium when missing', () => {
    const r = o.normalizeIssue({ title: 'Issue' }, 'app.js', { id: 'test' });
    assert.equal(r.severity, 'medium');
  });

  test('tags include AI and provider name', () => {
    const r = o.normalizeIssue({ title: 'Issue', tags: ['security'] }, 'app.js', { id: 'openai', provider: 'openai' });
    assert.ok(r.tags.includes('ai'));
    assert.ok(r.tags.includes('openai'));
    assert.ok(r.tags.includes('security'));
  });

  test('maps suggestion/fix/remediation to suggestion field', () => {
    const r = o.normalizeIssue({ title: 'Issue', fix: 'Use parameterized queries' }, 'app.js', { id: 'test' });
    assert.equal(r.suggestion, 'Use parameterized queries');
  });
});

describe('mergeIssues()', () => {
  let o;
  before(() => { o = new LLMOrchestrator({}); });

  test('deduplicates by file|line|title|message key', () => {
    const findings = [
      { provider: { id: 'openai' }, issues: [{ title: 'XSS', severity: 'high', line: 10 }] },
      { provider: { id: 'anthropic' }, issues: [{ title: 'XSS', severity: 'medium', line: 10 }] },
    ];
    const merged = o.mergeIssues(findings, 'app.js');
    assert.equal(merged.length, 1);
    assert.equal(merged[0].severity, 'high');
  });

  test('merges tags from duplicate issues', () => {
    const findings = [
      { provider: { id: 'openai' }, issues: [{ title: 'Bug', tags: ['security'] }] },
      { provider: { id: 'anthropic' }, issues: [{ title: 'Bug', tags: ['performance'] }] },
    ];
    const merged = o.mergeIssues(findings, 'app.js');
    assert.ok(merged[0].tags.includes('security'));
    assert.ok(merged[0].tags.includes('performance'));
  });

  test('skips findings with null/undefined issues array', () => {
    const findings = [
      { provider: { id: 'openai' }, issues: null },
      { provider: { id: 'anthropic' }, issues: [{ title: 'Valid' }] },
    ];
    const merged = o.mergeIssues(findings, 'app.js');
    assert.equal(merged.length, 1);
  });

  test('accumulates confidence on merge', () => {
    const findings = [
      { provider: { id: 'p1', weight: 0.3 }, issues: [{ title: 'Issue' }] },
      { provider: { id: 'p2', weight: 0.3 }, issues: [{ title: 'Issue' }] },
    ];
    const merged = o.mergeIssues(findings, 'app.js');
    assert.ok(merged[0].confidence >= 0.4);
    assert.ok(merged[0].confidence <= 0.99);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern: TEST STREAMING
// ════════════════════════════════════════════════════════════════════════════

describe('streamChat() — OpenAI streaming', () => {
  test('yields content chunks from OpenAI SSE stream', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';

    const { Readable } = await import('stream');
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"!"}}]}\n\n',
      'data: [DONE]\n\n',
    ];
    const mockStream = Readable.from(sseChunks.map(c => Buffer.from(c)));

    mock.method(axios, 'post', async () => ({ data: mockStream }));

    const o = new LLMOrchestrator({
      providers: [{ id: 'openai', provider: 'openai', enabled: true }],
    });

    const chunks = [];
    for await (const chunk of o.streamChat('Hi')) {
      chunks.push(chunk);
    }

    assert.equal(chunks.length, 4);
    assert.equal(chunks[0].type, 'content');
    assert.equal(chunks[0].content, 'Hello');
    assert.equal(chunks[3].type, 'done');
  });

  test('falls back to non-streaming when no streaming provider available', async () => {
    const o = new LLMOrchestrator({});

    const chunks = [];
    for await (const chunk of o.streamChat('Hi')) {
      chunks.push(chunk);
    }

    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].type, 'content');
    assert.ok(chunks[0].content.startsWith('Sentinel-local:'));
    assert.equal(chunks[1].type, 'done');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern: TEST FUNCTION CALLING
// ════════════════════════════════════════════════════════════════════════════

describe('callWithFunctions()', () => {
  test('routes to OpenAI with formatted tools', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';

    mock.method(axios, 'post', async (_url, payload) => {
      assert.equal(payload.model, 'gpt-4o-mini');
      assert.ok(Array.isArray(payload.tools));
      assert.equal(payload.tools[0].function.name, 'searchCode');
      assert.equal(payload.tools[0].function.parameters.required[0], 'query');

      return {
        data: {
          choices: [{
            message: {
              content: null,
              tool_calls: [{ function: { name: 'searchCode', arguments: '{"query": "auth"}' } }],
            },
          }],
        },
      };
    });

    const o = new LLMOrchestrator({
      providers: [{ id: 'openai', provider: 'openai', enabled: true }],
    });

    const r = await o.callWithFunctions(
      'Search the codebase',
      { searchCode: { description: 'Search code', parameters: { query: { type: 'string', description: 'Search query' } } } }
    );

    assert.equal(r.success, true);
    assert.equal(r.hasFunctionCall, true);
    assert.equal(r.functionCall.name, 'searchCode');
    assert.equal(r.functionCall.arguments.query, 'auth');
  });

  test('returns error when no function-calling provider configured', async () => {
    const o = new LLMOrchestrator({});
    const r = await o.callWithFunctions('Search', { searchCode: { description: 'Search' } });
    assert.equal(r.success, false);
    assert.ok(r.error.includes('Function calling requires'));
  });
});

describe('callAnthropicWithTools()', () => {
  test('formats tools for Anthropic tool use API', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

    mock.method(axios, 'post', async (_url, payload) => {
      assert.ok(payload.tools[0].name);
      assert.ok(payload.tools[0].input_schema);
      assert.equal(payload.tools[0].name, 'searchCode');
      return {
        data: {
          content: [{ type: 'tool_use', name: 'searchCode', input: { query: 'auth' } }],
        },
      };
    });

    const o = new LLMOrchestrator({
      providers: [{ id: 'anthropic', provider: 'anthropic', enabled: true }],
    });

    const r = await o.callAnthropicWithTools(
      'Search the codebase',
      { searchCode: { description: 'Search code', parameters: { query: { type: 'string', description: 'Search query' } } } }
    );

    assert.equal(r.success, true);
    assert.equal(r.hasFunctionCall, true);
    assert.equal(r.functionCall.name, 'searchCode');
  });

  test('returns error when no anthropic provider configured', async () => {
    const o = new LLMOrchestrator({});
    const r = await o.callAnthropicWithTools('Search', { searchCode: { description: 'Search' } });
    assert.equal(r.success, false);
    assert.ok(r.error.includes('not configured'));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern: TEST SINGLETON GETTER/SETTER
// ════════════════════════════════════════════════════════════════════════════

describe('getLLMOrchestrator() / setLLMOrchestrator()', () => {
  test('getLLMOrchestrator creates singleton on first call', () => {
    setLLMOrchestrator(null);
    const instance = getLLMOrchestrator({ temperature: 0.5 });
    assert.ok(instance instanceof LLMOrchestrator);
    assert.equal(instance.temperature, 0.5);
  });

  test('getLLMOrchestrator returns same instance on second call', () => {
    setLLMOrchestrator(null);
    const a = getLLMOrchestrator({});
    const b = getLLMOrchestrator({ temperature: 0.9 });
    assert.equal(a, b);
    assert.equal(a.temperature, 0.3);
  });

  test('setLLMOrchestrator allows overriding the singleton', () => {
    const custom = new LLMOrchestrator({ temperature: 0.9 });
    setLLMOrchestrator(custom);
    const retrieved = getLLMOrchestrator({});
    assert.equal(retrieved, custom);
    assert.equal(retrieved.temperature, 0.9);
  });

  test('forceNew=true creates fresh instance', () => {
    setLLMOrchestrator(null);
    const a = getLLMOrchestrator({ temperature: 0.1 });
    const b = getLLMOrchestrator({ temperature: 0.9, forceNew: true });
    assert.notEqual(a, b);
    assert.equal(b.temperature, 0.9);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern: TEST normalizeSeverity / compareSeverity
// ════════════════════════════════════════════════════════════════════════════

describe('normalizeSeverity / compareSeverity', () => {
  let o;
  before(() => { o = new LLMOrchestrator({}); });

  test('normalizeSeverity returns medium for unknown values', () => {
    assert.equal(o.normalizeSeverity('unknown'), 'medium');
    assert.equal(o.normalizeSeverity(undefined), 'medium');
    assert.equal(o.normalizeSeverity(null), 'medium');
  });

  test('normalizeSeverity is case-insensitive', () => {
    assert.equal(o.normalizeSeverity('CRITICAL'), 'critical');
    assert.equal(o.normalizeSeverity('High'), 'high');
  });

  test('compareSeverity returns negative when a is more severe', () => {
    assert.ok(o.compareSeverity('critical', 'low') < 0);
  });

  test('compareSeverity returns positive when b is more severe', () => {
    assert.ok(o.compareSeverity('low', 'critical') > 0);
  });

  test('compareSeverity returns 0 when equal', () => {
    assert.equal(o.compareSeverity('high', 'high'), 0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern: TEST CONSTRUCTOR DEFAULTS
// ════════════════════════════════════════════════════════════════════════════

describe('constructor defaults', () => {
  test('uses default temperature and maxTokens', () => {
    const o = new LLMOrchestrator({});
    assert.equal(o.temperature, 0.3);
    assert.equal(o.maxTokens, 2000);
  });

  test('allows overriding temperature and maxTokens', () => {
    const o = new LLMOrchestrator({ temperature: 0.7, maxTokens: 4000 });
    assert.equal(o.temperature, 0.7);
    assert.equal(o.maxTokens, 4000);
  });
});

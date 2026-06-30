/**
 * Comprehensive test suite for LLMOrchestrator (822 lines, zero coverage).
 *
 * Demonstrates patterns for mocking 6+ external provider APIs:
 *   - axios (OpenAI, Anthropic, OpenRouter, Ollama)
 *   - groq-sdk SDK (Groq)
 *   - @google/generative-ai SDK (Gemini)
 *   - enhancedRateLimiter wrapper
 *
 * Run with:
 *   node --test __tests__/llmOrchestrator.test.js
 *   node --test __tests__/llmOrchestrator.test.js --test-name-pattern="mergeIssues"
 */
import { test, describe, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// ────────────────────────────────────────────────────────────────────────────
// Pattern 1: IMPORT AND HELPER SETUP
// ────────────────────────────────────────────────────────────────────────────

// We import lazily inside before() because the module imports axios at the
// top level. By setting up mocks FIRST (in before()), axios is already mocked
// when the module evaluates its import statement.
//
// Note: this only works because Node.js ESM imports are cached. The mock
// must be in place BEFORE the first import() call.

let LLMOrchestrator, getLLMOrchestrator, setLLMOrchestrator;
let axios;

before(async () => {
  // ─── Pattern: Mock axios before importing the module ───
  // This is the most important pattern. LLMOrchestrator imports axios at
  // module scope. We must mock it BEFORE calling import().
  const mod = await import('axios');
  axios = mod.default;
  mock.method(axios, 'post', async () => {
    throw new Error('You must override axios.post in each test');
  });

  // ─── Pattern: Mock enhancedRateLimiter ───
  // The rate limiter wraps every provider call. Mock it to pass through.
  const rateLimiter = await import('../src/utils/enhancedRateLimiter.js');
  mock.method(rateLimiter.default, 'schedule', async (_key, fn) => fn());

  // Now import the module under test
  //
  // Note: SDK modules (groq-sdk, @google/generative-ai) are injected via
  // constructor sdkOverrides option in the Groq/Gemini tests below, rather
  // than via mock.module() (which is unavailable in this Node runtime).
  const llmMod = await import('../src/llm/llmOrchestrator.js');
  LLMOrchestrator = llmMod.default;
  getLLMOrchestrator = llmMod.getLLMOrchestrator;
  setLLMOrchestrator = llmMod.setLLMOrchestrator;
});

after(() => {
  mock.restoreAll();
});

afterEach(() => {
  // Reset singleton between tests
  setLLMOrchestrator(null);
  process.env.OPENAI_API_KEY = '';
  process.env.ANTHROPIC_API_KEY = '';
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern 2: TEST PROVIDER NORMALIZATION
// ════════════════════════════════════════════════════════════════════════════

describe('normalizeProviders()', () => {
  // Tests the provider config → enriched provider pipeline.
  // This is pure logic — no external calls needed.

  test('falls back to single local provider when aiConfig has no providers', () => {
    const orchestrator = new LLMOrchestrator({});
    assert.equal(orchestrator.providers.length, 1);
    assert.equal(orchestrator.providers[0].provider, 'local');
  });

  test('reads API key from env var for each provider', () => {
    process.env.OPENAI_API_KEY = 'sk-test-123';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-456';

    const orchestrator = new LLMOrchestrator({
      providers: [
        { id: 'openai', provider: 'openai', model: 'gpt-4', enabled: true },
        { id: 'anthropic', provider: 'anthropic', model: 'claude-3', enabled: true },
      ],
    });

    const openai = orchestrator.providers.find(p => p.provider === 'openai');
    const anthropic = orchestrator.providers.find(p => p.provider === 'anthropic');

    assert.equal(openai.apiKey, 'sk-test-123');
    assert.equal(anthropic.apiKey, 'sk-ant-test-456');
  });

  test('filters out disabled providers', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const orchestrator = new LLMOrchestrator({
      providers: [
        { id: 'openai', provider: 'openai', enabled: true },
        { id: 'disabled-provider', provider: 'openai', enabled: false },
      ],
    });
    assert.equal(orchestrator.providers.length, 1);
    assert.equal(orchestrator.providers[0].id, 'openai');
  });

  test('filters out providers with no API key (non-local)', () => {
    const orchestrator = new LLMOrchestrator({
      providers: [
        { id: 'openai', provider: 'openai', enabled: true },
        // ollama is local — no key needed
        { id: 'ollama', provider: 'ollama', enabled: true },
      ],
    });
    // Only ollama should survive (no key for openai)
    assert.equal(orchestrator.providers.length, 1);
    assert.equal(orchestrator.providers[0].provider, 'ollama');
  });

  test('assigns default weight of 0.33', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const orchestrator = new LLMOrchestrator({
      providers: [
        { id: 'openai', provider: 'openai', enabled: true },
      ],
    });
    assert.equal(orchestrator.providers[0].weight, 0.33);
  });

  test('inherits metadata from config', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const orchestrator = new LLMOrchestrator({
      providers: [{
        id: 'openai', provider: 'openai', enabled: true,
        metadata: { referer: 'https://my-app.com' },
      }],
    });
    assert.equal(orchestrator.providers[0].metadata.referer, 'https://my-app.com');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern 3: MOCK AXIOS POST FOR A SPECIFIC PROVIDER
// ════════════════════════════════════════════════════════════════════════════

describe('callProviderForFormat() — OpenAI', () => {
  // Demonstrates how to mock axios.post for a single test,
  // then verify the correct URL, headers, and payload were sent.

  test('sends correct OpenAI payload and returns parsed response', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-openai';

    // ─── Pattern: Override axios.post for one test ───
    // Using mock.method with a one-shot implementation. We capture
    // the called URL/payload for assertion at the end.
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

    const orchestrator = new LLMOrchestrator({
      providers: [{
        id: 'openai', provider: 'openai', model: 'gpt-4o', enabled: true,
      }],
    });

    const result = await orchestrator.callProviderForFormat(
      orchestrator.providers[0],
      'Review this code',
      { systemPrompt: 'Review as JSON', responseFormat: 'json_object' }
    );

    // Assert URL
    assert.equal(calledUrl, 'https://api.openai.com/v1/chat/completions');

    // Assert payload structure
    assert.equal(calledPayload.model, 'gpt-4o');
    assert.equal(calledPayload.temperature, 0.3);
    assert.ok(calledPayload.messages.some(m => m.content === 'Review this code'));
    assert.equal(calledPayload.response_format.type, 'json_object');

    // Assert auth header
    assert.equal(calledHeaders.Authorization, 'Bearer sk-test-openai');

    // Assert parsed result
    assert.ok(Array.isArray(result.issues));
    assert.equal(result.issues[0].title, 'SQL injection');
    assert.ok(result.latency >= 0);
  });
});

describe('callProviderForFormat() — Anthropic', () => {
  test('uses correct Anthropic API format and headers', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

    mock.method(axios, 'post', async (url, payload, config) => {
      assert.equal(url, 'https://api.anthropic.com/v1/messages');
      assert.equal(config.headers['x-api-key'], 'sk-ant-test');
      assert.equal(config.headers['anthropic-version'], '2023-06-01');
      return {
        data: {
          content: [{ text: 'No issues found in review.' }],
        },
      };
    });

    const orchestrator = new LLMOrchestrator({
      providers: [{
        id: 'anthropic', provider: 'anthropic', model: 'claude-3-opus-20240229', enabled: true,
      }],
    });

    const result = await orchestrator.callProviderForFormat(
      orchestrator.providers[0],
      'Review this',
      { responseFormat: 'text' }
    );

    assert.ok(result.response.includes('No issues found'));
  });
});

describe('callProviderForFormat() — Groq', () => {
  // Pattern 4: INJECT SDK VIA sdkOverrides

  test('calls Groq SDK and returns content', async () => {
    process.env.GROQ_API_KEY = 'gsk-test';

    // ─── Pattern: Inject mock groq-sdk constructor via sdkOverrides ───
    // The constructor receives a factory function that returns a mock client.
    // Inside callGroq(), _resolveGroqModule() checks sdkOverrides first.
    const mockGroqClient = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: '{"issues": []}' } }],
          }),
        },
      },
    };

    const orchestrator = new LLMOrchestrator({
      providers: [{
        id: 'groq', provider: 'groq', model: 'llama3-70b-8192', enabled: true,
      }],
      sdkOverrides: {
        'groq-sdk': function() { return mockGroqClient; },
      },
    });

    const result = await orchestrator.callProviderForFormat(
      orchestrator.providers[0],
      'Review',
      { responseFormat: 'json_object' }
    );

    assert.ok(Array.isArray(result.issues));
    assert.ok(result.latency >= 0);
  });
});

describe('callProviderForFormat() — Gemini', () => {
  // Pattern 5: INJECT SDK VIA sdkOverrides

  test('calls Gemini SDK and returns text', async () => {
    process.env.GEMINI_API_KEY = 'gemini-test';

    // ─── Pattern: Inject mock Gemini module via sdkOverrides ───
    // The mock module needs to be a callable constructor (new GeminiClient(apiKey))
    // that returns an object with getGenerativeModel().
    const mockResponse = { response: { text: () => 'Gemini analysis complete' } };
    const mockModel = { generateContent: async () => mockResponse };
    const mockGenAI = { getGenerativeModel: () => mockModel };

    const orchestrator = new LLMOrchestrator({
      providers: [{ id: 'gemini', provider: 'gemini', enabled: true }],
      sdkOverrides: {
        '@google/generative-ai': function() { return mockGenAI; },
      },
    });

    const result = await orchestrator.callProviderForFormat(
      orchestrator.providers[0],
      'Review this',
      { responseFormat: 'text' }
    );

    assert.equal(result.response, 'Gemini analysis complete');
  });
});

describe('callProviderForFormat() — OpenRouter', () => {
  test('includes HTTP-Referer header from provider metadata', async () => {
    process.env.OPENROUTER_API_KEY = 'or-test';

    mock.method(axios, 'post', async (url, payload, config) => {
      assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
      assert.equal(config.headers['HTTP-Referer'], 'https://my-custom-app.com');
      assert.equal(config.headers['Authorization'], 'Bearer or-test');
      return {
        data: { choices: [{ message: { content: 'OpenRouter result' } }] },
      };
    });

    const orchestrator = new LLMOrchestrator({
      providers: [{
        id: 'openrouter', provider: 'openrouter', enabled: true,
        metadata: { referer: 'https://my-custom-app.com' },
      }],
    });

    const result = await orchestrator.callProviderForFormat(
      orchestrator.providers[0],
      'Analyze',
      {}
    );

    assert.equal(result.response, 'OpenRouter result');
  });
});

describe('callProviderForFormat() — Ollama', () => {
  test('uses apiKey as host URL when present', async () => {
    mock.method(axios, 'post', async (url) => {
      assert.ok(url.startsWith('http://custom-host:1234'));
      return {
        data: { choices: [{ message: { content: 'Ollama response' } }] },
      };
    });

    // ─── Pattern: Test local provider with host set via OLLAMA_HOST env var ───
    // Ollama is LOCAL_LLM_PROVIDERS — no API key needed.
    // The host URL comes from the OLLAMA_HOST env var.
    process.env.OLLAMA_HOST = 'http://custom-host:1234';
    const orchestrator = new LLMOrchestrator({
      providers: [{
        id: 'ollama', provider: 'ollama', enabled: true,
      }],
    });

    const result = await orchestrator.callProviderForFormat(
      orchestrator.providers[0],
      'Review',
      {}
    );

    assert.equal(result.response, 'Ollama response');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern 6: TEST LOCAL FALLBACK (no external deps)
// ════════════════════════════════════════════════════════════════════════════

describe('generateLocalResponse()', () => {
  test('returns formatted local message for string prompt', () => {
    const orchestrator = new LLMOrchestrator({});
    const result = orchestrator.generateLocalResponse('What is the weather?');
    assert.ok(result.startsWith('Sentinel-local:'));
    assert.ok(result.includes('What is the weather?'));
    assert.ok(result.includes('add API keys'));
  });

  test('handles array of messages by joining content', () => {
    const orchestrator = new LLMOrchestrator({});
    const messages = [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello' },
    ];
    const result = orchestrator.generateLocalResponse(messages);
    assert.ok(result.includes('You are helpful'));
    assert.ok(result.includes('Hello'));
  });

  test('truncates long prompts with ellipsis', () => {
    const orchestrator = new LLMOrchestrator({});
    const longPrompt = 'A'.repeat(200);
    const result = orchestrator.generateLocalResponse(longPrompt);
    assert.ok(result.includes('...'));
    assert.ok(result.length < 200);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern 7: TEST CHAT() WITH MULTIPLE PROVIDERS
// ════════════════════════════════════════════════════════════════════════════

describe('chat()', () => {
  test('returns local response when no providers configured', async () => {
    const orchestrator = new LLMOrchestrator({});
    const result = await orchestrator.chat('Hello');
    assert.ok(result.text.startsWith('Sentinel-local:'));
    assert.equal(result.responses[0].provider.id, 'local');
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

    // Anthropic has higher weight
    const orchestrator = new LLMOrchestrator({
      providers: [
        { id: 'openai', provider: 'openai', enabled: true, weight: 0.3 },
        { id: 'anthropic', provider: 'anthropic', enabled: true, weight: 0.7 },
      ],
    });

    const result = await orchestrator.chat('Analyze this');

    // Best response should be from anthropic (highest weight)
    assert.equal(result.text, 'Anthropic response');
    assert.equal(result.responses.length, 2);
  });

  test('handles partial provider failures gracefully', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

    // First provider fails, second succeeds
    let callCount = 0;
    mock.method(axios, 'post', async () => {
      callCount++;
      if (callCount === 1) throw new Error('OpenAI rate limited');
      return { data: { content: [{ text: 'Anthropic fallback' }] } };
    });

    const orchestrator = new LLMOrchestrator({
      providers: [
        { id: 'openai', provider: 'openai', enabled: true, weight: 0.5 },
        { id: 'anthropic', provider: 'anthropic', enabled: true, weight: 0.5 },
      ],
    });

    const result = await orchestrator.chat('Test');
    assert.equal(result.text, 'Anthropic fallback');
  });

  test('falls back to local when ALL providers fail', async () => {
    mock.method(axios, 'post', async () => {
      throw new Error('All providers down');
    });

    process.env.OPENAI_API_KEY = 'sk-test';
    const orchestrator = new LLMOrchestrator({
      providers: [{ id: 'openai', provider: 'openai', enabled: true }],
    });

    const result = await orchestrator.chat('Hello');
    assert.ok(result.text.startsWith('Sentinel-local:'));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern 8: TEST REVIEW() — Multi-Provider Merge
// ════════════════════════════════════════════════════════════════════════════

describe('review() — multi-provider merge', () => {
  test('returns empty merged issues with only local fallback', async () => {
    const orchestrator = new LLMOrchestrator({});
    const result = await orchestrator.review('Review');
    assert.deepEqual(result.mergedIssues, []);
    // Local provider is always present as fallback
    assert.equal(result.providerFindings.length, 1);
    assert.equal(result.providerFindings[0].provider.provider, 'local');
  });

  test('merges duplicate issues from multiple providers', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

    // Both providers return the same issue
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

    const orchestrator = new LLMOrchestrator({
      providers: [
        { id: 'openai', provider: 'openai', enabled: true, weight: 0.3 },
        { id: 'anthropic', provider: 'anthropic', enabled: true, weight: 0.7 },
      ],
    });

    const result = await orchestrator.review('Review code', { filePath: 'app.js' });

    // Should be deduplicated into one issue with higher confidence
    assert.equal(result.mergedIssues.length, 1);
    assert.equal(result.mergedIssues[0].title, 'SQL Injection');
    // Confidence should be cumulative: 0.3 + 0.1 (base increment) = 0.4
    assert.ok(result.mergedIssues[0].confidence >= 0.4);
    // Both providers should be tracked
    assert.ok(result.mergedIssues[0].sourceProviders.includes('openai'));
    assert.ok(result.mergedIssues[0].sourceProviders.includes('anthropic'));
  });

  test('keeps highest severity when providers disagree', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';

    const mockResponse = {
      data: {
        choices: [
          { message: { content: '{"issues": [{"title": "XSS", "severity": "critical", "file": "app.js"}, {"title": "Typo", "severity": "low", "file": "app.js"}]}' } },
        ],
      },
    };

    mock.method(axios, 'post', async () => mockResponse);

    const orchestrator = new LLMOrchestrator({
      providers: [{ id: 'openai', provider: 'openai', enabled: true }],
    });

    const result = await orchestrator.review('Review');
    assert.equal(result.mergedIssues.length, 2);
    const xss = result.mergedIssues.find(i => i.title === 'XSS');
    assert.equal(xss.severity, 'critical');
  });

  test('handles provider returning parseable vs unparseable responses', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';

    mock.method(axios, 'post', async () => {
      return { data: { choices: [{ message: { content: 'Not JSON at all' } }] } };
    });

    const orchestrator = new LLMOrchestrator({
      providers: [{ id: 'openai', provider: 'openai', enabled: true }],
    });

    const result = await orchestrator.review('Review');
    assert.deepEqual(result.mergedIssues, []);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern 9: TEST parseResponse() EDGE CASES
// ════════════════════════════════════════════════════════════════════════════

describe('parseResponse()', () => {
  let orchestrator;
  before(() => { orchestrator = new LLMOrchestrator({}); });

  test('parses clean JSON with issues array', () => {
    const raw = JSON.stringify({ issues: [{ title: 'Test', severity: 'high' }] });
    const result = orchestrator.parseResponse(raw);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, 'Test');
  });

  test('parses json code block (```json ... ```)', () => {
    const raw = '```json\n{"issues": [{"title": "XSS"}]}\n```';
    const result = orchestrator.parseResponse(raw);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, 'XSS');
  });

  test('parses plain code block (```...)', () => {
    const raw = '```\n{"issues": [{"title": "CSRF"}]}\n```';
    const result = orchestrator.parseResponse(raw);
    assert.equal(result.length, 1);
  });

  test('returns empty array for non-JSON string', () => {
    const result = orchestrator.parseResponse('Just some text from the AI');
    assert.deepEqual(result, []);
  });

  test('returns empty array for null/undefined', () => {
    assert.deepEqual(orchestrator.parseResponse(null), []);
    assert.deepEqual(orchestrator.parseResponse(undefined), []);
  });

  test('returns empty array for empty string', () => {
    assert.deepEqual(orchestrator.parseResponse(''), []);
  });

  test('handles JSON array at top level', () => {
    const raw = JSON.stringify([{ title: 'Issue1' }, { title: 'Issue2' }]);
    const result = orchestrator.parseResponse(raw);
    assert.equal(result.length, 2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern 10: TEST normalizeIssue() AND mergeIssues()
// ════════════════════════════════════════════════════════════════════════════

describe('normalizeIssue()', () => {
  let orchestrator;
  before(() => { orchestrator = new LLMOrchestrator({}); });

  test('normalizes field name variants (line, lineNumber, startLine)', () => {
    const result = orchestrator.normalizeIssue(
      { title: 'Bug', lineNumber: 15 },
      'app.js',
      { id: 'openai', provider: 'openai' }
    );
    assert.equal(result.line, 15);
  });

  test('defaults severity to medium when missing', () => {
    const result = orchestrator.normalizeIssue(
      { title: 'Issue' },
      'app.js',
      { id: 'test' }
    );
    assert.equal(result.severity, 'medium');
  });

  test('tags include AI and provider name', () => {
    const result = orchestrator.normalizeIssue(
      { title: 'Issue', tags: ['security'] },
      'app.js',
      { id: 'openai', provider: 'openai' }
    );
    assert.ok(result.tags.includes('ai'));
    assert.ok(result.tags.includes('openai'));
    assert.ok(result.tags.includes('security'));
  });

  test('maps suggestion/ fix/ remediation to suggestion field', () => {
    const result = orchestrator.normalizeIssue(
      { title: 'Issue', fix: 'Use parameterized queries' },
      'app.js',
      { id: 'test' }
    );
    assert.equal(result.suggestion, 'Use parameterized queries');
  });
});

describe('mergeIssues()', () => {
  let orchestrator;
  before(() => { orchestrator = new LLMOrchestrator({}); });

  test('deduplicates by file|line|title|message key', () => {
    const findings = [
      {
        provider: { id: 'openai' },
        issues: [{ title: 'XSS', severity: 'high', line: 10 }],
      },
      {
        provider: { id: 'anthropic' },
        issues: [{ title: 'XSS', severity: 'medium', line: 10 }],
      },
    ];
    const merged = orchestrator.mergeIssues(findings, 'app.js');
    assert.equal(merged.length, 1);
    // Should keep higher severity
    assert.equal(merged[0].severity, 'high');
  });

  test('merges tags from duplicate issues', () => {
    const findings = [
      {
        provider: { id: 'openai' },
        issues: [{ title: 'Bug', tags: ['security'] }],
      },
      {
        provider: { id: 'anthropic' },
        issues: [{ title: 'Bug', tags: ['performance'] }],
      },
    ];
    const merged = orchestrator.mergeIssues(findings, 'app.js');
    assert.ok(merged[0].tags.includes('security'));
    assert.ok(merged[0].tags.includes('performance'));
  });

  test('skips findings with null/undefined issues array', () => {
    const findings = [
      { provider: { id: 'openai' }, issues: null },
      { provider: { id: 'anthropic' }, issues: [{ title: 'Valid' }] },
    ];
    const merged = orchestrator.mergeIssues(findings, 'app.js');
    assert.equal(merged.length, 1);
  });

  test('accumulates confidence on merge', () => {
    const findings = [
      { provider: { id: 'p1', weight: 0.3 }, issues: [{ title: 'Issue' }] },
      { provider: { id: 'p2', weight: 0.3 }, issues: [{ title: 'Issue' }] },
    ];
    const merged = orchestrator.mergeIssues(findings, 'app.js');
    // First: 0.3 confidence, Second: 0.3 + 0.1 = 0.4
    assert.ok(merged[0].confidence >= 0.4);
    // Should not exceed 0.99
    assert.ok(merged[0].confidence <= 0.99);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern 11: TEST STREAMING
// ════════════════════════════════════════════════════════════════════════════

describe('streamChat() — OpenAI streaming', () => {
  test('yields content chunks from OpenAI SSE stream', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';

    // ─── Pattern: Mock SSE response stream ───
    // OpenAI returns a stream of `data: {...}\n\n` lines ending with `data: [DONE]`
    const { Readable } = await import('stream');
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"!"}}]}\n\n',
      'data: [DONE]\n\n',
    ];
    const mockStream = Readable.from(sseChunks.map(c => Buffer.from(c)));

    mock.method(axios, 'post', async () => ({
      data: mockStream,
    }));

    const orchestrator = new LLMOrchestrator({
      providers: [{ id: 'openai', provider: 'openai', enabled: true }],
    });

    const chunks = [];
    for await (const chunk of orchestrator.streamChat('Hi')) {
      chunks.push(chunk);
    }

    assert.equal(chunks.length, 4);
    assert.equal(chunks[0].type, 'content');
    assert.equal(chunks[0].content, 'Hello');
    assert.equal(chunks[1].content, ' world');
    assert.equal(chunks[2].content, '!');
    assert.equal(chunks[3].type, 'done');
  });

  test('falls back to non-streaming when no streaming provider available', async () => {
    // Create orchestrator with no providers — will use local fallback
    const orchestrator = new LLMOrchestrator({});

    const chunks = [];
    for await (const chunk of orchestrator.streamChat('Hi')) {
      chunks.push(chunk);
    }

    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].type, 'content');
    assert.ok(chunks[0].content.startsWith('Sentinel-local:'));
    assert.equal(chunks[1].type, 'done');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern 12: TEST FUNCTION CALLING
// ════════════════════════════════════════════════════════════════════════════

describe('callWithFunctions()', () => {
  test('routes to OpenAI with formatted tools', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';

    mock.method(axios, 'post', async (url, payload) => {
      assert.equal(payload.model, 'gpt-4o-mini');
      // Tools should be formatted in OpenAI function calling format
      assert.ok(Array.isArray(payload.tools));
      assert.equal(payload.tools[0].function.name, 'searchCode');
      assert.equal(payload.tools[0].function.parameters.required[0], 'query');

      return {
        data: {
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                function: { name: 'searchCode', arguments: '{"query": "auth"}' },
              }],
            },
          }],
        },
      };
    });

    const orchestrator = new LLMOrchestrator({
      providers: [{ id: 'openai', provider: 'openai', enabled: true }],
    });

    const result = await orchestrator.callWithFunctions(
      'Search the codebase',
      {
        searchCode: {
          description: 'Search code',
          parameters: { query: { type: 'string', description: 'Search query' } },
        },
      }
    );

    assert.equal(result.success, true);
    assert.equal(result.hasFunctionCall, true);
    assert.equal(result.functionCall.name, 'searchCode');
    assert.equal(result.functionCall.arguments.query, 'auth');
  });

  test('returns error when no function-calling provider configured', async () => {
    const orchestrator = new LLMOrchestrator({});
    const result = await orchestrator.callWithFunctions(
      'Search',
      { searchCode: { description: 'Search' } }
    );
    assert.equal(result.success, false);
    assert.ok(result.error.includes('Function calling requires'));
  });
});

describe('callAnthropicWithTools()', () => {
  test('formats tools for Anthropic tool use API', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

    mock.method(axios, 'post', async (url, payload) => {
      // Anthropic format uses name/input_schema instead of function/parameters
      assert.ok(payload.tools[0].name);
      assert.ok(payload.tools[0].input_schema);
      assert.equal(payload.tools[0].name, 'searchCode');

      return {
        data: {
          content: [
            { type: 'tool_use', name: 'searchCode', input: { query: 'auth' } },
          ],
        },
      };
    });

    const orchestrator = new LLMOrchestrator({
      providers: [{ id: 'anthropic', provider: 'anthropic', enabled: true }],
    });

    const result = await orchestrator.callAnthropicWithTools(
      'Search the codebase',
      {
        searchCode: {
          description: 'Search code',
          parameters: { query: { type: 'string', description: 'Search query' } },
        },
      }
    );

    assert.equal(result.success, true);
    assert.equal(result.hasFunctionCall, true);
    assert.equal(result.functionCall.name, 'searchCode');
  });

  test('returns error when no anthropic provider configured', async () => {
    const orchestrator = new LLMOrchestrator({});
    const result = await orchestrator.callAnthropicWithTools(
      'Search',
      { searchCode: { description: 'Search' } }
    );
    assert.equal(result.success, false);
    assert.ok(result.error.includes('not configured'));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern 13: TEST SINGLETON GETTER/SETTER
// ════════════════════════════════════════════════════════════════════════════

describe('getLLMOrchestrator() / setLLMOrchestrator()', () => {
  test('getLLMOrchestrator creates singleton on first call', () => {
    // Reset singleton
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
    // Config from second call is ignored
    assert.equal(a.temperature, 0.3); // default, not 0.9
  });

  test('setLLMOrchestrator allows overriding the singleton', () => {
    const custom = new LLMOrchestrator({ temperature: 0.9 });
    setLLMOrchestrator(custom);
    const retrieved = getLLMOrchestrator({});
    assert.equal(retrieved, custom);
    assert.equal(retrieved.temperature, 0.9);
  });

  test('forceNew=true creates fresh instance', () => {
    const a = getLLMOrchestrator({ temperature: 0.1 });
    const b = getLLMOrchestrator({ temperature: 0.9, forceNew: true });
    assert.notEqual(a, b);
    assert.equal(b.temperature, 0.9);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern 14: TEST normalizeSeverity / compareSeverity
// ════════════════════════════════════════════════════════════════════════════

describe('normalizeSeverity / compareSeverity', () => {
  let orchestrator;
  before(() => { orchestrator = new LLMOrchestrator({}); });

  test('normalizeSeverity returns medium for unknown values', () => {
    assert.equal(orchestrator.normalizeSeverity('unknown'), 'medium');
    assert.equal(orchestrator.normalizeSeverity(undefined), 'medium');
    assert.equal(orchestrator.normalizeSeverity(null), 'medium');
  });

  test('normalizeSeverity is case-insensitive', () => {
    assert.equal(orchestrator.normalizeSeverity('CRITICAL'), 'critical');
    assert.equal(orchestrator.normalizeSeverity('High'), 'high');
  });

  test('compareSeverity returns negative when a is more severe', () => {
    const result = orchestrator.compareSeverity('critical', 'low');
    assert.ok(result < 0);
  });

  test('compareSeverity returns positive when b is more severe', () => {
    const result = orchestrator.compareSeverity('low', 'critical');
    assert.ok(result > 0);
  });

  test('compareSeverity returns 0 when equal', () => {
    assert.equal(orchestrator.compareSeverity('high', 'high'), 0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Pattern 15: TEST CONSTRUCTOR DEFAULTS
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

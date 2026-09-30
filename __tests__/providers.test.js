import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  streamCompletion,
  adaptMessagesForGoogle,
  adaptMessagesForAnthropic,
} from '../src/agent/providers.js';

// fetch is mocked below; streamCompletion still requires a key to exist
// (CI has none, a dev machine usually does — that hid this failure locally).
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-not-real';

function mockFetch(handler) {
  const prev = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = prev; };
}

function sseBody(chunks) {
  const enc = new TextEncoder();
  let i = 0;
  return {
    getReader() {
      return {
        async read() {
          if (i >= chunks.length) return { value: undefined, done: true };
          return { value: enc.encode(chunks[i++]), done: false };
        },
      };
    },
  };
}

test('SSE trailing frame without blank-line terminator is parsed', async () => {
  const restore = mockFetch(async () => ({
    ok: true,
    body: sseBody([
      'data: {"choices":[{"delta":{"content":"hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}',
    ]),
  }));
  try {
    const texts = [];
    for await (const ev of streamCompletion({
      modelId: 'openai/gpt-x', provider: 'openai', system: '',
      messages: [{ role: 'user', content: 'hi' }], tools: [],
    })) {
      if (ev.type === 'text') texts.push(ev.text);
    }
    assert.equal(texts.join(''), 'hello');
  } finally {
    restore();
  }
});

test('Gemini request replays tool calls and results (no context loss)', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key';
  let body;
  const restore = mockFetch(async (_url, opts) => {
    body = JSON.parse(opts.body);
    return { ok: true, body: sseBody(['data: {"candidates":[{"content":{"parts":[{"text":"done"}]}}]}\n\n']) };
  });
  try {
    const messages = [
      { role: 'user', content: 'fix it' },
      {
        role: 'assistant', content: '',
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'readFile', arguments: '{"path":"a.js"}' } }],
      },
      { role: 'tool', tool_call_id: 'c1', content: '{"content":"FILE_BODY_XYZ"}' },
    ];
    for await (const _ev of streamCompletion({
      modelId: 'google/gemini-x', provider: 'google', system: 'sys', messages, tools: [],
    })) { void _ev; }
    const sent = JSON.stringify(body.contents);
    assert.match(sent, /FILE_BODY_XYZ/);
    assert.match(sent, /functionResponse/);
    assert.match(sent, /functionCall/);
  } finally {
    restore();
    if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevKey;
  }
});

test('Anthropic request uses an 8192 max_tokens budget', async () => {
  const prevKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  let body;
  const restore = mockFetch(async (_url, opts) => {
    body = JSON.parse(opts.body);
    return { ok: true, body: sseBody([]) };
  });
  try {
    for await (const _ev of streamCompletion({
      modelId: 'anthropic/claude-x', provider: 'anthropic', system: 'sys',
      messages: [{ role: 'user', content: 'hi' }], tools: [],
    })) { void _ev; }
    assert.equal(body.max_tokens, 8192);
  } finally {
    restore();
    if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prevKey;
  }
});

test('Google adapter keeps tool results; Anthropic adapter keeps tool_use blocks', () => {
  const messages = [
    { role: 'user', content: 'fix it' },
    {
      role: 'assistant', content: '',
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'readFile', arguments: '{"path":"a.js"}' } }],
    },
    { role: 'tool', tool_call_id: 'c1', content: '{"content":"ABC"}' },
  ];
  const g = JSON.stringify(adaptMessagesForGoogle(messages));
  assert.match(g, /ABC/);
  assert.match(g, /functionResponse/);
  const a = JSON.stringify(adaptMessagesForAnthropic(messages));
  assert.match(a, /ABC/);
  assert.match(a, /tool_use/);
});

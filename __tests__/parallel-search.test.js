/** The real MCP SDK and agent dispatcher, with deterministic HTTP/model fixtures. */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configManager } from '../src/config/configManager.js';
import { executeLocalTool } from '../src/shared/tools/index.js';
import { search, providerOrder, availableProviders } from '../src/shared/web-search.js';
import { searchParallel } from '../src/shared/parallel-search.js';
import { runAgentTurnInner } from '../src/agent/loop.js';
import { getVersion } from '../src/version.js';

const realFetch = globalThis.fetch;
const savedEnv = { ...process.env };
const originalCwd = process.cwd();
let dir;
let calls;

function saveConfig(config) {
  writeFileSync(join(dir, '.sentinel.json'), JSON.stringify(config));
  configManager.config = null;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sentinel-parallel-'));
  process.chdir(dir);
  for (const key of Object.keys(process.env)) {
    if (/API_KEY|TOKEN|SECRET/.test(key)) delete process.env[key];
  }
  process.env.SENTINEL_DISABLE_MEMORY_BRIDGE = '1';
  process.env.SENTINEL_NO_TRAJECTORY = '1';
  process.env.SENTINEL_HOME = join(dir, 'home');
  process.env.SENTINEL_AUDIT_DIR = join(dir, 'audit');
  saveConfig({});
  calls = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
  process.chdir(originalCwd);
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
  configManager.config = null;
  rmSync(dir, { recursive: true, force: true });
});

const record = { url: 'https://nodejs.org/api/test.html', title: 'Node test runner', excerpts: ['Run tests with node --test.'], publish_date: '2026-10-01' };
const json = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

function mcp(respond = () => ({ content: [], structuredContent: { results: [record] } })) {
  globalThis.fetch = async (url, init) => {
    const request = init?.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), init, request });
    assert.equal(String(url), 'https://search.parallel.ai/mcp');
    assert.equal(new Headers(init.headers).get('user-agent'), `sentinel-cli/${getVersion()}`);
    assert.equal(new Headers(init.headers).has('authorization'), false);
    if (init.method === 'GET') return new Response(null, { status: 405 });
    if (request.method === 'initialize') {
      assert.deepEqual(request.params.clientInfo, { name: 'sentinel-cli', version: getVersion() });
      return json({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } } });
    }
    if (request.id === undefined) return new Response(null, { status: 202 });
    assert.equal(request.method, 'tools/call');
    assert.equal(request.params.name, 'web_search');
    return json({ jsonrpc: '2.0', id: request.id, result: await respond(request.params.arguments, init) });
  };
}

async function tool() {
  await configManager.load();
  return executeLocalTool('searchWeb', { query: 'Node test runner documentation', count: 1 }, 'PLAN');
}

test('saved Parallel choice reaches the agent and the next model request with URLs and excerpts', async () => {
  saveConfig({ search: { providers: ['parallel'] } });
  mcp((args) => {
    assert.deepEqual(args, { objective: 'Node test runner documentation', search_queries: ['Node test runner documentation'] });
    return { content: [], structuredContent: { results: [record, { url: 'javascript:alert(1)', excerpts: [] }] } };
  });
  let turn = 0;
  let consumed = false;
  const createStream = async function* ({ messages }) {
    if (turn++ === 0) yield { type: 'tool_call', id: 'search1', name: 'searchWeb', input: { query: 'Node test runner documentation', count: 1 } };
    else {
      const result = JSON.parse(messages.find((m) => m.role === 'tool').content);
      assert.equal(result.provider, 'parallel');
      assert.equal(result.results.length, 1);
      assert.equal(result.results[0].url, record.url);
      assert.equal(result.results[0].snippet, record.excerpts[0]);
      assert.equal(result.results[0].publishedDate, record.publish_date);
      consumed = true;
      yield { type: 'text', text: 'Use node --test, per the Node documentation.' };
    }
  };
  const events = [];
  for await (const event of runAgentTurnInner({ history: [{ role: 'user', parts: [{ type: 'text', text: 'Find Node test runner documentation' }] }], model: 'openai/gpt-oss-20b', mode: 'PLAN', createStream })) events.push(event);
  assert.ok(consumed);
  assert.equal(events.find((e) => e.event === 'tool_result').data.output.provider, 'parallel');
  assert.ok(calls.some((c) => c.request?.method === 'initialize'));
  assert.ok(calls.some((c) => c.request?.method === 'tools/call'));
});

test('fresh no-key config keeps DuckDuckGo and its endpoint override without contacting Parallel', async () => {
  assert.deepEqual(providerOrder(), ['contextdev', 'exa', 'tavily', 'brave', 'duckduckgo']);
  assert.deepEqual(availableProviders(), ['duckduckgo']);
  assert.deepEqual(availableProviders(['parallel']), ['parallel']);
  process.env.SEARCH_WEB_ENDPOINT = 'https://internal.example/search';
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    assert.match(String(url), /^https:\/\/internal.example\/search\/\?q=/);
    return new Response('<a class="result__a" href="https://example.com/docs">Internal docs</a>');
  };
  assert.equal((await tool()).provider, 'duckduckgo');
  assert.equal(calls.length, 1);
});

test('configured credentials keep the existing provider preference', async () => {
  process.env.EXA_API_KEY = 'fixture-exa';
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    assert.equal(String(url), 'https://api.exa.ai/search');
    assert.equal(init.headers['x-api-key'], 'fixture-exa');
    return json({ results: [{ url: record.url, title: record.title, text: record.excerpts[0] }] });
  };
  assert.equal((await tool()).provider, 'exa');
  assert.equal(calls.length, 1);
});

test('invalid or empty saved selections never silently restore the default chain', async () => {
  for (const providers of ['parallel', [], [null], [' ']]) {
    saveConfig({ search: { providers } });
    mcp();
    assert.match((await tool()).error, /search.providers must be a non-empty array/);
    assert.equal(calls.length, 0);
  }
});

test('fallback to DuckDuckGo requires an explicit entry in the saved list', async () => {
  saveConfig({ search: { providers: ['parallel', 'duckduckgo'] } });
  mcp(() => ({ isError: true, content: [{ type: 'text', text: 'Provider unavailable' }] }));
  const parallelFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://html.duckduckgo.com/html/')) {
      return new Response('<a class="result__a" href="https://example.com/docs">Fallback docs</a>');
    }
    return parallelFetch(url, init);
  };
  assert.equal((await tool()).provider, 'duckduckgo');
});

test('explicit saved provider lists stay exact and errors do not append a fallback', async () => {
  saveConfig({ search: { providers: ['parallel'] } });
  mcp(() => ({ isError: true, content: [{ type: 'text', text: 'Search quota exceeded' }] }));
  assert.match((await tool()).error, /parallel: Search quota exceeded/);
  assert.equal(calls.filter((c) => c.request?.method === 'tools/call').length, 1);
  const result = await search({ query: 'test', providers: ['unknown'] });
  assert.deepEqual(result.attempted, []);
  assert.match(result.errors[0].error, /unknown provider/);
});

test('tool and network deny permissions prevent all HTTP requests', async () => {
  for (const permissions of [{ tools: { searchWeb: 'deny' } }, { defaults: { network: 'deny' } }]) {
    saveConfig({ search: { providers: ['parallel'] }, permissions });
    mcp();
    await assert.rejects(tool(), /denied/);
    assert.equal(calls.length, 0);
  }
});

test('MCP text JSON responses are mapped and unsafe result URLs are omitted', async () => {
  saveConfig({ search: { providers: ['parallel'] } });
  mcp(() => ({ content: [{ type: 'text', text: JSON.stringify({ results: [{ url: 'file:///etc/passwd', excerpts: [] }, { ...record, title: null }] }) }] }));
  const output = await tool();
  assert.equal(output.results.length, 1);
  assert.equal(output.results[0].title, record.url);
});

test('malformed MCP output and transport errors become tool errors', async () => {
  saveConfig({ search: { providers: ['parallel'] } });
  mcp(() => ({ content: [], structuredContent: { wrong: [] } }));
  assert.match((await tool()).error, /Invalid Parallel search response/);
  globalThis.fetch = async () => new Response('Provider unavailable', { status: 503 });
  assert.match((await tool()).error, /Provider unavailable/);
});

function untilAborted(signal) {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

test('cancellation closes the real MCP transport without trying another provider', async () => {
  const controller = new AbortController();
  mcp(async (_args, init) => {
    setImmediate(() => controller.abort());
    return untilAborted(init.signal);
  });
  const result = await search({ query: 'cancel this', providers: ['parallel', 'duckduckgo'], signal: controller.signal });
  assert.equal(result.cancelled, true);
  assert.deepEqual(result.attempted, ['parallel']);
  assert.match(result.errors[0].error, /cancelled/);
});

test('the deadline covers both connection setup and the search response', async () => {
  globalThis.fetch = async (_url, init) => untilAborted(init.signal);
  await assert.rejects(searchParallel('test', 1, undefined, 15), /timed out after 15ms/);
  mcp(async (_args, init) => untilAborted(init.signal));
  await assert.rejects(searchParallel('test', 1, undefined, 15), /timed out after 15ms/);
});

test('already-cancelled calls do not start HTTP requests', async () => {
  mcp();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(executeLocalTool('searchWeb', { query: 'test' }, 'PLAN', { signal: controller.signal }), /Cancelled before/);
  assert.equal(calls.length, 0);
});

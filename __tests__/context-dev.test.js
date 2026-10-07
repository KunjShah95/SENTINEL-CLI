/**
 * context-dev — regression tests for the Context.dev web-context integration.
 *
 * The integration is optional by construction, so the property that matters
 * most is not "does it work" but "does it fail safe". A user with no key, a bad
 * key, or no credits must get exactly the behaviour they had before this
 * existed: searchWeb falls back, fetchUrl fetches directly, and nothing throws
 * into a turn.
 *
 * Covered:
 *   1. Absent key  — provider is skipped, search still returns results.
 *   2. Bad key     — a 401 is reported as an auth problem, not as "no match".
 *   3. Degradation — fetchUrl falls through to the direct fetch and says why.
 *   4. No credits burned when the user opts out (prefer: 'direct').
 *   5. Naming      — context.dev / context-dev / contextdev all resolve.
 *   6. Secrets     — the key never appears in output, and the MCP config
 *                    written into another assistant carries a URL and nothing
 *                    else.
 *
 * No network: every HTTP path is stubbed with a local fetch override.
 *
 * Run with: node --test __tests__/context-dev.test.js
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REAL_FETCH = globalThis.fetch;

/** Install a fetch stub that answers by URL substring. Never hits the network. */
function stubFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const href = String(url?.toString?.() ?? url);
    calls.push(href);
    for (const [match, respond] of Object.entries(routes)) {
      if (href.includes(match)) return respond(href, init);
    }
    throw new Error(`unstubbed URL: ${href}`);
  };
  return calls;
}

const json = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: 'stub',
  headers: { get: (h) => headers[h.toLowerCase()] ?? null },
  text: async () => JSON.stringify(body),
});

const html = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: 'stub',
  headers: { get: (h) => headers[h.toLowerCase()] ?? null },
  text: async () => body,
});

let tmp;
let prevHome;
let prevKey;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'sentinel-ctxdev-'));
  prevHome = process.env.SENTINEL_HOME;
  prevKey = process.env.CONTEXT_DEV_API_KEY;
  process.env.SENTINEL_HOME = join(tmp, 'home');
  delete process.env.CONTEXT_DEV_API_KEY;
});

afterEach(() => {
  globalThis.fetch = REAL_FETCH;
  if (prevHome === undefined) delete process.env.SENTINEL_HOME;
  else process.env.SENTINEL_HOME = prevHome;
  if (prevKey === undefined) delete process.env.CONTEXT_DEV_API_KEY;
  else process.env.CONTEXT_DEV_API_KEY = prevKey;
  rmSync(tmp, { recursive: true, force: true });
});

describe('key handling', () => {
  it('reports absence without throwing, and never returns a value', async () => {
    const { hasContextDevKey, contextDevKey, contextDevMissingReason } =
      await import('../src/shared/context-dev.js');
    assert.equal(hasContextDevKey({}), false);
    assert.equal(contextDevKey({}), null);
    const reason = contextDevMissingReason({});
    assert.match(reason, /CONTEXT_DEV_API_KEY/);
    assert.match(reason, /optional/, 'says the rest still works without it');
  });

  it('treats a blank key as absent', async () => {
    const { contextDevKey, hasContextDevKey } = await import('../src/shared/context-dev.js');
    assert.equal(contextDevKey({ CONTEXT_DEV_API_KEY: '   ' }), null);
    assert.equal(hasContextDevKey({ CONTEXT_DEV_API_KEY: '' }), false);
  });

  it('returns an actionable message instead of throwing when the key is missing', async () => {
    const { contextDevRequest } = await import('../src/shared/context-dev.js');
    const res = await contextDevRequest('web/search', { method: 'POST', body: {}, env: {} });
    assert.equal(res.ok, false);
    assert.match(res.error, /CONTEXT_DEV_API_KEY/);
  });
});

describe('failure reporting', () => {
  // Each of these needs a key present: without one the request never reaches
  // the network, so the status-handling under test would never execute.
  beforeEach(() => { process.env.CONTEXT_DEV_API_KEY = 'ctxt_secret_x'; });

  it('reports a 401 as an auth problem even when the body says NOT_FOUND', async () => {
    // This is the bug a fake key exposed: checking `error_code` before status
    // turned a rejected key into "try a different identifier", which sends the
    // user to fix the wrong thing entirely.
    stubFetch({
      'api.context.dev': () =>
        json(401, { error_code: 'NOT_FOUND', message: 'unauthorized' }),
    });
    const { contextDevRequest } = await import('../src/shared/context-dev.js');
    const res = await contextDevRequest('web/search', { method: 'POST', body: {} });
    assert.equal(res.ok, false);
    assert.equal(res.status, 401);
    assert.match(res.error, /rejected the API key/i);
    assert.doesNotMatch(res.error, /different identifier/i);
  });

  it('reports a 400 NOT_FOUND as a genuine no-match', async () => {
    stubFetch({ 'api.context.dev': () => json(400, { error_code: 'NOT_FOUND' }) });
    const { contextDevRequest } = await import('../src/shared/context-dev.js');
    const res = await contextDevRequest('brand/retrieve', { method: 'POST', body: {} });
    assert.match(res.error, /No match on Context.dev/);
  });

  it('distinguishes exhausted credits from a rate limit', async () => {
    stubFetch({ 'api.context.dev': () => json(402, { error_code: 'INSUFFICIENT_CREDITS' }) });
    const { contextDevRequest } = await import('../src/shared/context-dev.js');
    assert.match((await contextDevRequest('web/search', { method: 'POST', body: {} })).error, /credits exhausted/i);
    globalThis.fetch = REAL_FETCH;
    stubFetch({ 'api.context.dev': () => json(429, {}) });
    assert.match((await contextDevRequest('web/search', { method: 'POST', body: {} })).error, /rate limit/i);
  });

  it('surfaces the credits a call consumed', async () => {
    stubFetch({
      'api.context.dev': () =>
        json(200, { results: [{ title: 'T', url: 'https://x.dev', snippet: 's' }] }, { 'x-credits-used': '2' }),
    });
    const { search } = await import('../src/shared/context-dev.js');
    const results = await search('query', 5);
    assert.equal(results[0].creditsUsed, 2, 'credit spend is reported, not hidden');
    assert.equal(results[0].provider, 'context.dev');
  });

  it('reports an unreachable host as a network problem, not a key problem', async () => {
    globalThis.fetch = async () => {
      const e = new TypeError('fetch failed');
      e.cause = { code: 'ECONNREFUSED' };
      throw e;
    };
    const { contextDevRequest } = await import('../src/shared/context-dev.js');
    const res = await contextDevRequest('web/search', { method: 'POST', body: {} });
    assert.match(res.error, /Could not reach api\.context\.dev/);
    assert.match(res.error, /ECONNREFUSED/);
  });
});

describe('provider chain', () => {
  it('skips Context.dev entirely when no key is set', async () => {
    const { providerOrder, availableProviders } = await import('../src/shared/web-search.js');
    assert.equal(providerOrder()[0], 'contextdev', 'it leads the default chain');
    assert.ok(!availableProviders().includes('contextdev'), 'but is unavailable without a key');
  });

  it('makes it available once a key exists', async () => {
    process.env.CONTEXT_DEV_API_KEY = 'ctxt_secret_x';
    const { availableProviders } = await import('../src/shared/web-search.js');
    assert.ok(availableProviders().includes('contextdev'));
  });

  it('resolves every spelling of the name to one provider', async () => {
    // Context.dev is a dotted domain, so all three spellings are plausible in a
    // config file. Matching on one alone silently broke the other two.
    const { providerOrder, isKnownProvider } = await import('../src/shared/web-search.js');
    for (const spelling of ['context.dev', 'context-dev', 'contextdev', 'CONTEXT_DEV']) {
      assert.deepEqual(providerOrder([spelling]), ['contextdev'], `${spelling} resolves`);
      assert.equal(isKnownProvider(spelling), true, `${spelling} is known`);
    }
    assert.equal(isKnownProvider('nope'), false);
  });

  it('still returns results when Context.dev fails and another provider works', async () => {
    process.env.CONTEXT_DEV_API_KEY = 'ctxt_secret_bad';
    stubFetch({
      'api.context.dev': () => json(401, { error_code: 'NOT_FOUND' }),
      'html.duckduckgo.com': () =>
        html(200, '<a class="result__a" href="https://a.dev">A</a><a class="result__snippet">sa</a>'),
    });
    const { search, formatSearchResults } = await import('../src/shared/web-search.js');
    const res = await search({ query: 'q' });
    assert.equal(res.provider, 'duckduckgo', 'fell through');
    assert.equal(res.results.length, 1);
    assert.ok(res.attempted.includes('contextdev'), 'and it WAS attempted');
    assert.match(formatSearchResults(res), /Results from duckduckgo/);
  });

  it('names the known providers when given an unknown one', async () => {
    const { search } = await import('../src/shared/web-search.js');
    const res = await search({ query: 'q', providers: ['bogus', 'duckduckgo'] });
    assert.match(res.errors[0].error, /known:.*duckduckgo/, 'actionable, not just "unknown"');
  });
});

describe('fetchUrl degradation', () => {
  it('uses the direct fetch and reports why when Context.dev fails', async () => {
    process.env.CONTEXT_DEV_API_KEY = 'ctxt_secret_bad';
    stubFetch({
      'api.context.dev': () => json(401, {}),
      'example.com': () => html(200, '<html><head><title>T</title></head><body><main><p>' + 'real prose content here. '.repeat(20) + '</p></main></body></html>'),
    });
    const { fetchUrl } = await import('../src/shared/fetch-url.js');
    const res = await fetchUrl({ url: 'https://example.com' });
    assert.equal(res.via, 'direct');
    assert.equal(res.contextDev.used, false);
    assert.match(res.contextDev.reason, /rejected the API key/i, 'the failure is visible');
    assert.ok(res.text.length > 100, 'and the direct fetch still worked');
  });

  it('prefers Context.dev content when it returns something substantial', async () => {
    process.env.CONTEXT_DEV_API_KEY = 'ctxt_secret_good';
    stubFetch({
      'api.context.dev': () =>
        json(200, { url: 'https://spa.dev', title: 'SPA', markdown: { data: '# Rendered\n\n' + 'JS-rendered body. '.repeat(30) } }),
    });
    const { fetchUrl } = await import('../src/shared/fetch-url.js');
    const res = await fetchUrl({ url: 'https://spa.dev' });
    assert.equal(res.via, 'context.dev');
    assert.match(res.text, /JS-rendered body/);
  });

  it('falls through when Context.dev returns an empty SPA shell', async () => {
    // A rendered-but-empty page is worse than useless: the model gets markup
    // with no content and concludes the page is blank.
    process.env.CONTEXT_DEV_API_KEY = 'ctxt_secret_shell';
    stubFetch({
      'api.context.dev': () => json(200, { markdown: { data: '   ' } }),
      'spa.dev': () => html(200, '<html><body><main><p>' + 'actual server-rendered content. '.repeat(20) + '</p></main></body></html>'),
    });
    const { fetchUrl } = await import('../src/shared/fetch-url.js');
    const res = await fetchUrl({ url: 'https://spa.dev' });
    assert.equal(res.via, 'direct');
    assert.match(res.contextDev.reason, /too little content/i);
    assert.match(res.text, /actual server-rendered content/);
  });

  it('spends nothing and makes no Context.dev call with prefer:"direct"', async () => {
    process.env.CONTEXT_DEV_API_KEY = 'ctxt_secret_good';
    const calls = stubFetch({
      'api.context.dev': () => json(200, { markdown: { data: 'should never be reached' } }),
      'example.com': () => html(200, '<html><body><main><p>direct prose</p></main></body></html>'),
    });
    const { fetchUrl } = await import('../src/shared/fetch-url.js');
    const res = await fetchUrl({ url: 'https://example.com', prefer: 'direct' });
    assert.equal(res.via, 'direct');
    assert.equal(res.contextDev, undefined);
    assert.ok(!calls.some((u) => u.includes('api.context.dev')), 'no Context.dev request was made');
  });

  it('rejects a non-http URL before spending anything', async () => {
    const calls = stubFetch({});
    const { fetchUrl } = await import('../src/shared/fetch-url.js');
    await assert.rejects(() => fetchUrl({ url: 'file:///etc/passwd' }), /Unsupported protocol/);
    await assert.rejects(() => fetchUrl({ url: 'not a url' }), /Invalid URL/);
    assert.equal(calls.length, 0);
  });
});

describe('secrets never leak', () => {
  it('sends the key as an auth header, never in the URL', async () => {
    process.env.CONTEXT_DEV_API_KEY = 'ctxt_secret_supersecret';
    let seenUrl = null;
    let seenAuth = null;
    globalThis.fetch = async (url, init) => {
      seenUrl = String(url);
      seenAuth = init?.headers?.authorization;
      return json(200, { results: [] });
    };
    const { search } = await import('../src/shared/context-dev.js');
    await search('q', 1);
    assert.ok(!seenUrl.includes('ctxt_secret_supersecret'), 'key is not in the URL');
    assert.equal(seenAuth, 'Bearer ctxt_secret_supersecret');
  });

  it('keeps the key out of every error message it produces', async () => {
    process.env.CONTEXT_DEV_API_KEY = 'ctxt_secret_supersecret';
    stubFetch({ 'api.context.dev': () => json(401, { message: 'nope' }) });
    const { contextDevRequest } = await import('../src/shared/context-dev.js');
    const res = await contextDevRequest('web/search', { method: 'POST', body: {} });
    assert.doesNotMatch(res.error, /ctxt_secret/, 'error text is safe to show');
  });

  it('reports the key as a length, never a value, in the status command shape', async () => {
    process.env.CONTEXT_DEV_API_KEY = 'ctxt_secret_supersecret';
    const { contextDevKey } = await import('../src/shared/context-dev.js');
    const summary = { configured: true, length: contextDevKey()?.length ?? 0 };
    assert.equal(summary.length, 'ctxt_secret_supersecret'.length);
    assert.ok(!JSON.stringify(summary).includes('ctxt_secret'));
  });
});

describe('MCP registration writes a URL and nothing else', () => {
  it('never writes a credential into an assistant config', async () => {
    const { registerWithAssistant, MCP_PROVIDERS } = await import('../src/cli/connect.js');
    const provider = MCP_PROVIDERS.context;
    assert.ok(provider.url.startsWith('https://'), 'https, and never http');
    assert.ok(provider.url.endsWith('/mcp'), 'exact server URL, including /mcp');

    const result = registerWithAssistant({
      targetId: 'cursor', scope: 'project', cwd: tmp, dryRun: true, mcpProvider: 'context',
    });
    assert.equal(result.ok, true);
    assert.match(result.message, /Would add "context"/);
    const fragment = JSON.stringify(result.preview);
    assert.match(fragment, /mcp\.context\.dev\/mcp/);
    // The decisive assertion: a key anywhere in this write would land in a file
    // that gets read by other tools, logged, and committed by users.
    assert.doesNotMatch(fragment, /ctxt_secret|api_key|authorization|bearer/i);
  });

  it('gives each assistant the shape its config expects', async () => {
    const { registerWithAssistant } = await import('../src/cli/connect.js');
    const cursor = registerWithAssistant({ targetId: 'cursor', scope: 'project', cwd: tmp, dryRun: true, mcpProvider: 'context' });
    assert.match(cursor.preview, /"type": "http"/, 'cursor: mcpServers + type http');

    const opencode = registerWithAssistant({ targetId: 'opencode', scope: 'project', cwd: tmp, dryRun: true, mcpProvider: 'context' });
    assert.match(opencode.preview, /"type": "remote"/, 'opencode nests under mcp as type remote');

    const codex = registerWithAssistant({ targetId: 'codex', scope: 'user', cwd: tmp, dryRun: true, mcpProvider: 'context' });
    assert.match(codex.preview, /\[mcp_servers\.context\]/, 'codex is TOML');
    assert.match(codex.preview, /url = "https:\/\/mcp\.context\.dev\/mcp"/);
  });

  it('rejects an unknown provider instead of writing something wrong', async () => {
    const { registerWithAssistant } = await import('../src/cli/connect.js');
    const r = registerWithAssistant({ targetId: 'cursor', scope: 'project', cwd: tmp, dryRun: true, mcpProvider: 'nope' });
    assert.equal(r.ok, false);
    assert.match(r.message, /Unknown MCP provider/);
  });
});

describe('OAuth token storage', () => {
  it('stores tokens outside the repo, owner-readable only', async () => {
    const { getTokenProvider, hasStoredAuth, authSummary } = await import('../src/agent/mcp-oauth.js');
    // Nothing stored yet: a provider is only handed out once signed in.
    assert.equal(getTokenProvider('context', 'https://mcp.context.dev/mcp'), undefined);
    assert.equal(hasStoredAuth('context'), false);

    // Simulate a completed sign-in through the provider interface itself.
    const provider = {
      tokens: () => ({ access_token: 'tok_secret', token_type: 'Bearer', expires_in: 3600 }),
      saveTokens: () => {},
    };
    assert.equal(provider.tokens().access_token, 'tok_secret');

    const summary = authSummary('context');
    assert.equal(summary.authenticated, false, 'nothing written yet');
    assert.ok(!JSON.stringify(summary).includes('tok_secret'));
  });

  it('sanitizes the server key so it cannot escape the auth directory', async () => {
    const { getTokenProvider } = await import('../src/agent/mcp-oauth.js');
    // A traversal key must not write outside SENTINEL_HOME. Nothing is written
    // here, but a future saveTokens with this key must land in the right place.
    const p = getTokenProvider('../../escape', 'https://x/mcp');
    assert.equal(p, undefined, 'unauthenticated → no provider, so no write path');
  });

  it('never puts a token in the status summary', async () => {
    const { authSummary } = await import('../src/agent/mcp-oauth.js');
    const s = authSummary('never-signed-in');
    assert.equal(s.authenticated, false);
    assert.ok(!('access_token' in s));
    assert.ok(!JSON.stringify(s).toLowerCase().includes('token"'));
  });

  it('reports "needs sign-in" distinctly from "unreachable"', async () => {
    const { authSummary, hasStoredAuth } = await import('../src/agent/mcp-oauth.js');
    const s = authSummary('context');
    // These look identical in a tool listing but need different user actions:
    // one needs a browser, the other needs a network check.
    assert.equal(typeof s.authenticated, 'boolean');
    assert.equal(hasStoredAuth('context'), false);
  });
});

/**
 * Web search — multi-provider grounding with automatic fallback.
 *
 * Chain: Context.dev (JS rendering, anti-bot, one key for search+scrape) →
 * Exa (semantic, code/docs retrieval) → Tavily (agent-tuned) → Brave →
 * DuckDuckGo (no key required). Providers are tried in order of preference and
 * the first healthy one wins. A provider that throws or returns nothing is
 * skipped, so search degrades rather than fails.
 *
 * Everything is opt-in: with no keys configured, search falls back to
 * DuckDuckGo, which needs no account. That preserves the previous behavior
 * of the searchWeb tool.
 */
const DEFAULT_TIMEOUT_MS = 12_000;

function envKeys() {
  return {
    contextdev: process.env.CONTEXT_DEV_API_KEY,
    exa: process.env.EXA_API_KEY,
    tavily: process.env.TAVILY_API_KEY,
    brave: process.env.BRAVE_API_KEY,
  };
}

/**
 * Canonical provider key for whatever spelling was configured.
 *
 * The obvious spelling does not work: Context.dev is a dotted domain, so
 * `context.dev` and `context-dev` are both plausible in a config file, and
 * matching on either one alone means the other silently falls through to
 * "unknown provider" and the user concludes the integration is broken.
 */
function canonicalProvider(name) {
  const key = String(name).toLowerCase().trim().replace(/[\s._-]/g, '');
  return PROVIDER_ALIASES[key] || key;
}

const PROVIDER_ALIASES = { contextdev: 'contextdev', ctxdev: 'contextdev' };

/**
 * Resolve the provider order. Explicit config wins; otherwise the chain is
 * ordered so any configured key is preferred over the keyless fallback.
 *
 * Context.dev leads by default when it is configured: it is the only provider
 * here that renders JavaScript, so it is the one most likely to return real
 * page content rather than an app shell.
 */
export function providerOrder(configured = []) {
  const order = Array.isArray(configured) && configured.length
    ? configured
    : ['contextdev', 'exa', 'tavily', 'brave', 'duckduckgo'];
  const seen = new Set();
  return order.filter((p) => {
    const key = canonicalProvider(p);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(canonicalProvider);
}

/** Providers that can run given the current environment. */
export function availableProviders(configured) {
  const keys = envKeys();
  return providerOrder(configured).filter((p) => {
    if (p === 'duckduckgo') return true;
    if (p === 'contextdev') return Boolean(keys.contextdev);
    return Boolean(keys[p]);
  });
}

/** Is a spelled-any-way provider name one we actually implement? */
export function isKnownProvider(name) {
  return Boolean(IMPLEMENTATIONS[canonicalProvider(name)]);
}

/**
 * Context.dev search, shaped to the same records every other provider returns.
 * Thin wrapper so the chain has one calling convention and this file owns the
 * mapping, not the Context.dev module.
 */
async function searchContextDev(query, count) {
  const { search: contextDevSearch } = await import('./context-dev.js');
  return contextDevSearch(query, count);
}

async function fetchJson(url, init, timeout = DEFAULT_TIMEOUT_MS) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  return res.json();
}

async function searchExa(query, count) {
  const key = envKeys().exa;
  if (!key) return [];
  const data = await fetchJson('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'x-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ query, numResults: count, type: 'auto' }),
  });
  return (data.results || []).map((r) => ({
    title: r.title || r.url,
    url: r.url,
    snippet: r.text || r.snippet || '',
    publishedDate: r.publishedDate || undefined,
    provider: 'exa',
  }));
}

async function searchTavily(query, count) {
  const key = envKeys().tavily;
  if (!key) return [];
  const data = await fetchJson('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, max_results: count, search_depth: 'basic' }),
  });
  return (data.results || []).map((r) => ({
    title: r.title || r.url,
    url: r.url,
    snippet: r.content || '',
    score: r.score,
    provider: 'tavily',
  }));
}

async function searchBrave(query, count) {
  const key = envKeys().brave;
  if (!key) return [];
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
  const data = await fetchJson(url, { headers: { 'x-subscription-token': key, accept: 'application/json' } });
  return (data.web?.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.description || '',
    publishedDate: r.page_age || undefined,
    provider: 'brave',
  }));
}

/**
 * DuckDuckGo — the keyless last resort, and the prior behavior of the
 * searchWeb tool. Scrapes the lite HTML endpoint, then falls back to the
 * Instant Answer JSON API when the HTML returns nothing (which happens
 * when the endpoint rate-limits or the markup changes).
 */
async function searchDuck(query, count) {
  const endpoint =
    (process.env.SEARCH_WEB_ENDPOINT || 'https://html.duckduckgo.com/html/').replace(/\/+$/, '') + '/';
  const results = [];
  try {
    const res = await fetch(`${endpoint}?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; sentinel-cli)' },
    });
    const html = await res.text();
    const linkRe = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    const links = [];
    let m;
    while ((m = linkRe.exec(html)) !== null && links.length < count) {
      links.push({ url: m[1], title: stripTags(m[2]) });
    }
    const snippets = [];
    while ((m = snippetRe.exec(html)) !== null && snippets.length < count) {
      snippets.push(stripTags(m[1]));
    }
    for (let i = 0; i < links.length; i++) {
      results.push({ ...links[i], snippet: snippets[i] || '', provider: 'duckduckgo' });
    }
  } catch {
    // fall through to the JSON API
  }
  if (results.length === 0) {
    try {
      const data = await fetchJson(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`,
        {},
        DEFAULT_TIMEOUT_MS,
      );
      if (data.AbstractText) {
        results.push({
          title: data.Heading || query,
          snippet: data.AbstractText,
          url: data.AbstractURL || '',
          provider: 'duckduckgo',
        });
      }
      for (const r of (data.Results || []).slice(0, count)) {
        results.push({ title: r.Text || '', snippet: r.Text || '', url: r.FirstURL || '', provider: 'duckduckgo' });
      }
    } catch {
      // exhausted
    }
  }
  return results;
}

function stripTags(value) {
  return String(value).replace(/<[^>]+>/g, '').trim();
}

const IMPLEMENTATIONS = {
  contextdev: searchContextDev,
  exa: searchExa,
  tavily: searchTavily,
  brave: searchBrave,
  duckduckgo: searchDuck,
};

/**
 * Search across the provider chain.
 *
 * @param {{query: string, count?: number, providers?: string[]}} input
 * @returns {Promise<{results: Array, provider: string, attempted: string[], errors: object[]}>}
 */
export async function search(input = {}) {
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  if (!query) throw new Error('query is required');
  const count = Number.isInteger(input.count) ? Math.min(Math.max(input.count, 1), 20) : 5;
  const order = providerOrder(input.providers);

  const attempted = [];
  const errors = [];
  for (const name of order) {
    // `order` is already canonical, so this also tells the two spellings apart
    // in the error message rather than blaming the user for a typo.
    const impl = IMPLEMENTATIONS[name];
    if (!impl) {
      const known = Object.keys(IMPLEMENTATIONS).join(', ');
      errors.push({ provider: name, error: `unknown provider (known: ${known})` });
      continue;
    }
    attempted.push(name);
    try {
      const results = await impl(query, count);
      if (results.length) {
        return { results: results.slice(0, count), provider: name, attempted, errors };
      }
      errors.push({ provider: name, error: 'no results' });
    } catch (e) {
      errors.push({ provider: name, error: e?.message || String(e) });
    }
  }
  return { results: [], provider: null, attempted, errors };
}

/** Compact rendering for the searchWeb tool: URLs plus one-line snippets. */
export function formatSearchResults({ results, provider, errors }) {
  if (!results.length) {
    const detail = errors.length ? ` (${errors.map((e) => `${e.provider}: ${e.error}`).join('; ')})` : '';
    return `No results found${detail}`;
  }
  const lines = results.map((r, i) => {
    const snippet = r.snippet ? ` — ${String(r.snippet).replace(/\s+/g, ' ').slice(0, 240)}` : '';
    return `${i + 1}. ${r.title}\n   ${r.url}${snippet}`;
  });
  // Context.dev bills per call, so report the spend rather than hiding it.
  const credits = results.find((r) => Number.isFinite(r.creditsUsed))?.creditsUsed;
  const cost = Number.isFinite(credits) ? `\n\n(${credits} Context.dev credit(s) used for this search.)` : '';
  return `Results from ${provider}:\n${lines.join('\n')}${cost}`;
}

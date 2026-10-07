/**
 * context.dev — web context provider for the searchWeb / fetchUrl tool chain.
 *
 * Context.dev is a hosted web-data API (scrape, crawl, search, brand, people,
 * answers). Where it earns its place in this repo is *capability* rather than
 * another search index: the existing chain returns titles and snippets, and
 * `fetchUrl` returns whatever a plain HTTP GET yields — no JavaScript
 * rendering, no anti-bot handling, and a page that is mostly navigation.
 * Context.dev renders JS, escalates proxies, and returns clean Markdown, so
 * `fetchUrl` gets real page content on sites where the naive fetch returns
 * nothing useful.
 *
 * Why it slots into the existing chain instead of replacing it:
 *   - the chain already degrades. No key configured → this provider is simply
 *     not in the order, and DuckDuckGo still answers. Nothing regresses for a
 *     user who has never heard of Context.dev.
 *   - the user's key is read from the environment and never prompted for. A
 *     missing key must not block a turn, so every failure path here returns a
 *     message the model can act on rather than throwing.
 *
 * Credit awareness: every call costs credits. `X-Credits-Used` is surfaced so
 * the caller can see what a request cost instead of being surprised by a bill.
 *
 * @see https://docs.context.dev/
 */

const BASE_URL = 'https://api.context.dev/v1';
const DEFAULT_TIMEOUT_MS = 45_000;
/** Context.dev caps a scrape response; keep the tool's own cap the outer bound. */
const SCRAPE_TIMEOUT_MS = 60_000;

export const CONTEXT_DEV_ENV_KEY = 'CONTEXT_DEV_API_KEY';
export const CONTEXT_DEV_MCP_URL = 'https://mcp.context.dev/mcp';

/** Is Context.dev usable right now? Never prompts, never throws. */
export function hasContextDevKey(env = process.env) {
  return Boolean(env?.[CONTEXT_DEV_ENV_KEY]);
}

/**
 * The API key, or null.
 *
 * Kept separate from `hasContextDevKey` so the read is a single obvious place,
 * and so a future secret store has exactly one function to change.
 */
export function contextDevKey(env = process.env) {
  const key = env?.[CONTEXT_DEV_ENV_KEY];
  return typeof key === 'string' && key.trim() ? key.trim() : null;
}

/**
 * Why Context.dev is unavailable, in one line a user can act on.
 * Returns null when it IS available.
 */
export function contextDevMissingReason(env = process.env) {
  if (contextDevKey(env)) return null;
  return `${CONTEXT_DEV_ENV_KEY} is not set. Create a key at https://www.context.dev/dashboard/api-keys — it is optional, and the other web providers still work without it.`;
}

/**
 * One Context.dev request. Never throws: an unreachable or failing API is a
 * message, because a provider in a fallback chain must not take the turn down.
 *
 * @returns {Promise<{ok: boolean, status?: number, data?: any, error?: string, credits?: number, requestId?: string}>}
 */
export async function contextDevRequest(path, { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, env = process.env } = {}) {
  const key = contextDevKey(env);
  if (!key) return { ok: false, error: contextDevMissingReason(env) };

  let url;
  try {
    url = new URL(path.startsWith('http') ? path : `${BASE_URL}/${path.replace(/^\/+/, '')}`);
  } catch {
    return { ok: false, error: `Invalid Context.dev path: ${path}` };
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${key}`,
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    // undici reports an unreachable host as `TypeError: fetch failed`.
    const code = e?.cause?.code ? ` (${e.cause.code})` : '';
    return { ok: false, error: `Could not reach api.context.dev${code}: ${e?.message || String(e)}` };
  }

  // Credit accounting is on the response, so read it even on failure.
  const creditsHeader = res.headers.get('x-credits-used');
  const credits = creditsHeader === null ? undefined : Number(creditsHeader);
  const requestId = res.headers.get('x-request-id') || undefined;

  const text = await res.text().catch(() => '');
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      data,
      credits: Number.isFinite(credits) ? credits : undefined,
      requestId,
      error: describeStatus(res.status, data, text),
    };
  }
  return {
    ok: true,
    status: res.status,
    data: data ?? null,
    credits: Number.isFinite(credits) ? credits : undefined,
    requestId,
  };
}

/**
 * Turn a Context.dev failure into something a person can act on.
 *
 * The docs are explicit that this API does not follow normal HTTP conventions —
 * Brand retrieve reports "no match" as 400 with an `error_code`, not 404 — so
 * the status alone is not enough to explain what went wrong. The `error_code`
 * is what distinguishes "your input matched nothing" from "your request was
 * malformed", and they need different fixes.
 */
function describeStatus(status, data, rawText) {
  const code = data?.error_code || data?.code || null;
  const message = data?.error?.message || data?.message || null;

  // Auth first, and NOT gated on `error_code`. This API documents "no match"
  // as a 400 with NOT_FOUND, but it is also free to answer an unauthenticated
  // request with 401 and an error_code that happens to be NOT_FOUND — checking
  // the code first reported a rejected key as "try a different identifier",
  // which sends the user to fix the wrong thing. Status wins for 401/403/402.
  if (status === 401 || status === 403) {
    return `Context.dev rejected the API key (${status}). Check that ${CONTEXT_DEV_ENV_KEY} is set and current at https://www.context.dev/dashboard/api-keys.`;
  }
  if (status === 402 || code === 'INSUFFICIENT_CREDITS') {
    return `Context.dev credits exhausted (${status}). Top up at https://www.context.dev/dashboard, or rely on the other web providers.`;
  }
  if (status === 429) {
    return `Context.dev rate limit or credit limit reached (${status}). Wait, or use another web provider.`;
  }
  if (status >= 500) {
    return `Context.dev is unavailable (${status}). This is upstream; use another web provider.`;
  }
  if (code === 'NOT_FOUND' || code === 'WEBSITE_NOT_FOUND') {
    return `No match on Context.dev for that input (${code}). The domain or company may not be indexed — try a different identifier.`;
  }
  const detail = message || (rawText ? rawText.slice(0, 200) : '');
  return `Context.dev request failed (${status})${code ? ` ${code}` : ''}${detail ? `: ${detail}` : ''}`;
}

/**
 * Search — `POST /web/search`.
 *
 * Shaped to the same `{ title, url, snippet, provider }` records the other
 * providers in web-search.js return, so it is a drop-in chain member and
 * nothing downstream can tell which provider answered.
 */
export async function search(query, count = 5, options = {}) {
  const res = await contextDevRequest('web/search', {
    method: 'POST',
    body: { query, limit: count },
    ...options,
  });
  if (!res.ok) throw new Error(res.error);

  const rows = res.data?.results || res.data?.data || [];
  const results = (Array.isArray(rows) ? rows : []).map((r) => ({
    title: r.title || r.url || query,
    url: r.url || '',
    snippet: r.snippet || r.content || r.description || '',
    publishedDate: r.published_date || r.publishedDate || undefined,
    provider: 'context.dev',
  }));
  if (results.length && Number.isFinite(res.credits)) {
    // Attached to the first record so the caller can report it without the
    // shape of the result array changing.
    results[0].creditsUsed = res.credits;
  }
  return results;
}

/**
 * Scrape one URL to Markdown — `POST /web/scrape`.
 *
 * The reason this provider exists: Context.dev renders JavaScript and escalates
 * proxies, so `fetchUrl` returns real page content where a plain GET returns a
 * JS shell or an anti-bot wall.
 */
export async function scrape(url, options = {}) {
  const { formats = ['markdown'], maxChars } = options;
  const res = await contextDevRequest('web/scrape', {
    method: 'POST',
    body: { url, formats },
    timeoutMs: SCRAPE_TIMEOUT_MS,
    ...options,
  });
  if (!res.ok) throw new Error(res.error);

  const d = res.data || {};
  const markdown =
    d.markdown?.data ?? d.markdown ?? d.content ?? d.text ?? d.html?.data ?? d.html ?? '';
  const text = typeof markdown === 'string' ? markdown : JSON.stringify(markdown);

  const limit = Number.isInteger(maxChars) ? Math.max(500, Math.min(maxChars, 40_000)) : 8000;
  const truncated = text.length > limit;
  return {
    url: d.url || url,
    title: d.title || '',
    text: truncated ? `${text.slice(0, limit)}\n…[truncated ${text.length - limit} chars]` : text,
    truncated,
    ...(Number.isFinite(res.credits) ? { creditsUsed: res.credits } : {}),
    ...(res.requestId ? { requestId: res.requestId } : {}),
  };
}

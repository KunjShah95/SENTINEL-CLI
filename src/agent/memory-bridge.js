/**
 * agentmemory bridge — cross-agent persistent memory.
 *
 * SENTINEL has its own `.sentinel/memory/` (Markdown records, index injected
 * into the prompt). agentmemory is a separate, richer store: BM25 + vector +
 * graph retrieval behind an HTTP server on :3111, shared by every agent on the
 * machine. The point of this bridge is that a decision made in Cursor is
 * recallable from SENTINEL, and vice versa.
 *
 * Design constraints:
 * - The server is optional and usually NOT running. Every entry point degrades
 *   to the built-in memory rather than erroring, so nothing in the agent loop
 *   ever depends on agentmemory being up.
 * - Health is cached with a TTL. Probing on every turn would add latency to
 *   every single request for a server that is usually absent.
 * - No LLM calls. Saving and recalling are plain REST, so the bridge never
 *   spends tokens and never blocks on a provider.
 */

const DEFAULT_URL = process.env.AGENTMEMORY_URL || 'http://localhost:3111';
const TIMEOUT_MS = 3000;
const HEALTH_TTL_MS = 30_000;

let healthCache = { at: 0, state: 'unknown' };

/** Reset the cached health probe. Called by `sentinel memory --refresh`. */
export function resetHealthCache() {
  healthCache = { at: 0, state: 'unknown' };
}

/**
 * Is agentmemory reachable? Cached for HEALTH_TTL_MS.
 * @returns {Promise<{reachable: boolean, state: string, detail?: string}>}
 */
export async function checkHealth(options = {}) {
  const now = Date.now();
  if (!options.force && healthCache.state !== 'unknown' && now - healthCache.at < HEALTH_TTL_MS) {
    return healthCache;
  }
  const base = (options.url || DEFAULT_URL).replace(/\/+$/, '');
  try {
    // /livez is documented as always public (no auth), unlike /health which
    // may sit behind AGENTMEMORY_SECRET.
    const res = await fetch(`${base}/agentmemory/livez`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    healthCache = res.ok
      ? { reachable: true, state: 'online', url: base }
      : { reachable: false, state: 'degraded', url: base, detail: `livez ${res.status}` };
  } catch (e) {
    healthCache = { reachable: false, state: 'offline', url: base, detail: e?.message || String(e) };
  }
  healthCache.at = now;
  return healthCache;
}

async function post(path, body, options = {}) {
  const base = (options.url || DEFAULT_URL).replace(/\/+$/, '');
  const headers = { 'content-type': 'application/json' };
  if (options.secret) headers.authorization = `Bearer ${options.secret}`;
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs || TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`agentmemory ${path} -> ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
  return res.json().catch(() => ({}));
}

/**
 * Store a memory. Returns `{stored:false, skipped}` rather than throwing when
 * the server is down — a failed save must never fail the turn that caused it.
 */
export async function remember({ content, concepts = [], files = [], project, agentId = 'sentinel', type }, options = {}) {
  const text = String(content || '').trim();
  if (!text) throw new Error('content is required');
  const health = await checkHealth(options);
  if (!health.reachable) return { stored: false, skipped: 'offline', detail: health.detail };

  const payload = { content: text, concepts, project };
  if (files?.length) payload.files = files;
  if (type) payload.type = type;
  if (agentId) payload.agentId = agentId;
  try {
    const out = await post('/agentmemory/remember', payload, options);
    // The server hints at near-duplicates instead of storing a second copy.
    return { stored: true, similarTo: out?.similarTo || null, id: out?.id || null, result: out };
  } catch (e) {
    return { stored: false, skipped: 'error', detail: e?.message || String(e) };
  }
}

/**
 * Retrieve relevant past context. Hybrid recall when embeddings are
 * configured, BM25 otherwise — either way the server picks.
 */
export async function recall({ query, limit = 5, project, agentId, tokenBudget, expandIds }, options = {}) {
  const text = String(query || '').trim();
  if (!text) throw new Error('query is required');
  const health = await checkHealth(options);
  if (!health.reachable) return { ok: false, skipped: 'offline', detail: health.detail, results: [] };

  const payload = { query: text, limit: Math.min(Math.max(Number(limit) || 5, 1), 25) };
  if (project) payload.project = project;
  if (agentId) payload.agentId = agentId;
  if (tokenBudget) payload.token_budget = tokenBudget;
  if (expandIds?.length) payload.expandIds = expandIds;

  try {
    // smart-search is the hybrid path; recall is the BM25 path. smart-search
    // degrades to lexical when no vector index exists, so it is the default.
    const out = await post('/agentmemory/smart-search', payload, options);
    const results = Array.isArray(out?.results)
      ? out.results
      : Array.isArray(out?.data)
        ? out.data
        : [];
    return { ok: true, results, count: results.length, raw: out };
  } catch (e) {
    return { ok: false, skipped: 'error', detail: e?.message || String(e), results: [] };
  }
}

/** Sessions recorded by any agent on this machine. */
export async function sessions(options = {}) {
  const health = await checkHealth(options);
  if (!health.reachable) return { ok: false, detail: health.detail, sessions: [] };
  const base = (options.url || DEFAULT_URL).replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/agentmemory/sessions`, {
      headers: options.secret ? { authorization: `Bearer ${options.secret}` } : {},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`sessions -> ${res.status}`);
    const data = await res.json().catch(() => ({}));
    const list = Array.isArray(data) ? data : data.sessions || data.data || [];
    return { ok: true, sessions: list, count: list.length };
  } catch (e) {
    return { ok: false, detail: e?.message || String(e), sessions: [] };
  }
}

/**
 * Flatten recall output into the compact form the system prompt can carry.
 *
 * This is the token discipline point: agentmemory can return rich objects, but
 * only a capped, relevance-ordered summary ever reaches the prompt. Each line
 * is one memory, description-capped, with a total character budget.
 */
export function formatRecall(result, { charCap = 1200, perItemCap = 220 } = {}) {
  if (!result?.results?.length) return '';
  const lines = [];
  let used = 0;
  for (const item of result.results) {
    const content = item.content || item.text || item.summary || '';
    if (!content) continue;
    const line = `- ${String(content).replace(/\s+/g, ' ').trim().slice(0, perItemCap)}`;
    if (used + line.length + 1 > charCap) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join('\n');
}

/**
 * Prompt section for cross-agent memory. Returns '' when agentmemory is down or
 * has nothing relevant, so the system prompt is unchanged in the common case.
 */
export async function buildMemoryBridgeSection(request, options = {}) {
  const query = String(request || '').trim();
  if (!query) return '';
  // `options` carries transport config (url/secret) and belongs in recall's
  // SECOND parameter. Spreading it into the query argument silently dropped the
  // url, so the section always probed the default port and came back empty.
  const result = await recall({ query, limit: options.limit || 4, project: options.project }, options);
  if (!result.ok) return '';
  const body = formatRecall(result, options);
  if (!body) return '';
  return [
    '# Cross-agent memory',
    'Relevant observations recorded by other agents on this machine (agentmemory).',
    'Treat them as leads, not facts — verify against the code before relying on them.',
    body,
  ].join('\n');
}

/**
 * Record what happened in a turn. Called from the postToolUse/stop path.
 * Fire-and-forget by design: the caller does not await correctness, only that
 * it was attempted.
 */
export function captureObservation(event, options = {}) {
  const text = summarizeObservation(event);
  if (!text) return Promise.resolve({ stored: false, skipped: 'empty' });
  return remember({ content: text, ...options }, options);
}

/** Keep observations small: enough to be findable, cheap to store. */
export function summarizeObservation(event) {
  if (!event || typeof event !== 'object') return '';
  if (event.toolName) {
    const status = event.ok === false ? 'failed' : 'ok';
    const detail = summarizeValue(event.input, 120);
    // Even with no usable detail, a failed call is worth recording: "bash
    // failed" is exactly the signal that saves the next session from retrying
    // the same command. Dropping it silently loses the most useful failures.
    return detail ? `Used ${event.toolName} (${status}) ${detail}` : `Used ${event.toolName} (${status})`;
  }
  if (event.prompt) return String(event.prompt).slice(0, 400);
  return '';
}

function summarizeValue(value, cap) {
  if (!value || typeof value !== 'object') return '';
  const parts = [];
  for (const key of ['path', 'filePath', 'query', 'command', 'url', 'name']) {
    if (typeof value[key] === 'string') parts.push(`${key}=${value[key].slice(0, cap)}`);
    if (parts.length >= 2) break;
  }
  return parts.join(' ');
}

/** Diagnostic payload for `sentinel memory status`. */
export async function status(options = {}) {
  const health = await checkHealth({ ...options, force: true });
  if (!health.reachable) {
    return {
      ...health,
      hint: 'Start it with: npx -y @agentmemory/agentmemory@latest (then re-run this command)',
    };
  }
  const sess = await sessions(options);
  return { ...health, sessions: sess.sessions?.length ?? 0, sessionError: sess.ok ? null : sess.detail };
}

/**
 * Dynamic model discovery — registry-driven, no per-provider code.
 *
 * This used to hold thirteen near-identical `discoverOpenAI`, `discoverGroq`,
 * `discoverMistral`, … functions, each re-deriving the base URL, the auth
 * header, and the response shape that the provider table already knew. The
 * duplication was not neutral: `getBareModelId` grew a second prefix list,
 * which is how `accounts/fireworks/` ended up recognised as a provider but
 * never stripped from the id sent on the wire.
 *
 * Now a connector's row in `registry.js` carries the listing endpoint and the
 * response shape, so discovery is one generic fetch plus one of three mappers.
 * Adding a provider is a registry row, not a function.
 *
 * Three sources feed the registry, in increasing reach:
 *   1. the connector's own listing API  — exact, per-account, needs a credential
 *   2. the models.dev catalog           — broad, free, fills pricing and the
 *                                        vendors with no listing API (Anthropic)
 *   3. the pinned fallback list         — always present, works offline
 */
import {
  CONNECTOR_IDS,
  CONNECTORS,
  MODEL_MAPPERS,
  canDiscoverModels,
  getConnectorKeyPrefix,
  getDiscoveryBaseUrl,
  isLocalConnector,
} from '../connectors/registry.js';
import { resolveCredential } from '../connectors/credentials.js';
import {
  fetchCatalogModels,
  fetchAvailableCatalogModels,
  mergeWithCatalog,
  invalidateCatalog,
} from '../connectors/catalog.js';

/** Two slots: connected-only, and the widened `includeUnconnected` view. */
let cache = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchJson(url, options = {}) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      ...options,
      headers: {
        'Accept': 'application/json',
        ...options.headers,
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Authorization header for a connector, or null when it needs none. */
async function authHeadersFor(connectorId) {
  const conn = CONNECTORS[connectorId];
  if (!conn || conn.local) return {};
  const { key } = await resolveCredential(connectorId);
  if (!key) return {};
  if (connectorId === 'google') return { 'x-goog-api-key': key };
  return { Authorization: `Bearer ${key}` };
}

/**
 * Response mappers. Three shapes cover every connector.
 *
 * Each returns registry-shaped models or `[]`. Returning `[]` rather than
 * throwing keeps one broken endpoint from sinking the whole catalog — the
 * caller uses `Promise.allSettled` and falls through to models.dev.
 */
const MAPPERS = {
  /** OpenAI-compatible: `{ data: [{ id, ... }] }`. */
  [MODEL_MAPPERS.OPENAI](connectorId, payload) {
    const prefix = getConnectorKeyPrefix(connectorId);
    const list = Array.isArray(payload) ? payload : payload?.data;
    if (!Array.isArray(list)) return [];
    return list
      .filter((m) => m?.id)
      .map((m) => ({
        id: prefix ? `${prefix}${m.id}` : m.id,
        provider: connectorId,
        label: m.name || m.display_name || m.id,
        // A listing endpoint returns ids, not prices. Zero here is corrected by
        // the models.dev merge below for every provider it knows.
        inputUsdPerMillionTokens: 0,
        outputUsdPerMillionTokens: 0,
        contextLength: m.context_length || m.context_window || undefined,
        ownedBy: m.owned_by,
        source: 'live',
      }));
  },

  /** Google: `{ models: [{ name: "models/gemini-…" }] }`. */
  [MODEL_MAPPERS.GOOGLE](connectorId, payload) {
    const list = payload?.models;
    if (!Array.isArray(list)) return [];
    return list
      .filter((m) => m?.name && !isEmbeddingOnlyModel({ name: m.name }))
      .map((m) => ({
        id: m.name.replace(/^models\//, ''),
        provider: connectorId,
        label: m.displayName || m.name,
        inputUsdPerMillionTokens: 0,
        outputUsdPerMillionTokens: 0,
        contextLength: m.inputTokenLimit,
        description: m.description,
        source: 'live',
      }));
  },

  /** Ollama native `/api/tags`: carries size and context that /v1/models omits. */
  [MODEL_MAPPERS.OLLAMA](connectorId, payload) {
    const list = payload?.models;
    if (!Array.isArray(list)) return [];
    const prefix = getConnectorKeyPrefix(connectorId) || '';
    return list
      .filter((m) => m?.name && !isEmbeddingOnlyModel(m))
      .map((m) => ({
        id: `${prefix}${m.name}`,
        provider: connectorId,
        label: `Ollama ${m.name}`,
        inputUsdPerMillionTokens: 0,
        outputUsdPerMillionTokens: 0,
        size: m.size,
        contextLength: m.details?.context_length,
        ownedBy: 'ollama',
        source: 'live',
      }));
  },
};

/**
 * Ask one connector what it serves.
 * @returns {Promise<Array>} empty when unconfigured, unreachable, or unshaped.
 */
async function discoverConnector(connectorId) {
  const conn = CONNECTORS[connectorId];
  if (!conn || !canDiscoverModels(connectorId)) return [];

  const url = `${getDiscoveryBaseUrl(connectorId)}${conn.modelsPath}`;
  const headers = await authHeadersFor(connectorId);

  // An OpenAI-compatible connector with a keyPrefix already namespaces its own
  // ids, so do not re-add the prefix on a second pass.
  const payload = await fetchJson(url, { headers });
  if (!payload) return [];

  const map = MAPPERS[conn.mapModels] || MAPPERS[MODEL_MAPPERS.OPENAI];
  const models = map(connectorId, payload);

  // OpenAI's listing returns non-chat models too (whisper, tts, embeddings).
  if (connectorId === 'openai') {
    return models.filter((m) => /^gpt-|^o[1-9]|^chatgpt-/.test(m.id));
  }
  return models;
}

/**
 * Live discovery across every connector the user can reach.
 *
 * Replaces the hand-maintained array of thirteen promises. A connector added
 * to the registry is discovered with no change here.
 *
 * @param {{includeUnconnected?: boolean}} [options]
 *   `includeUnconnected` widens the result to every catalog connector, not just
 *   ones with a credential. `sentinel models --all` uses it to show what *would*
 *   become available. It is deliberately opt-in: without it the default answer
 *   is "what can I actually call right now", which is the question the command
 *   usually exists to answer.
 */
export async function discoverAllModels({ includeUnconnected = false } = {}) {
  const slot = includeUnconnected ? 'all' : 'connected';
  const cached = cache?.[slot];
  if (cached && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cached;
  }

  const connected = [];
  for (const id of CONNECTOR_IDS) {
    if (isLocalConnector(id)) { connected.push(id); continue; }
    if (includeUnconnected) { connected.push(id); continue; }
    const { key } = await resolveCredential(id);
    if (key) connected.push(id);
  }

  const results = await Promise.allSettled(connected.map(discoverConnector));
  const live = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      live.push(...result.value);
    }
  }

  // Live endpoints do not report prices, so the catalog fills pricing, capability
  // flags and breadth. A live id still wins over its catalog twin — the user's
  // key proves the model is really reachable for them — but inherits the money.
  const catalog = includeUnconnected
    ? await fetchCatalogModels()
    : await fetchAvailableCatalogModels();
  const liveIds = new Set(live.map((m) => m.id));
  const withPrices = live.map((m) => {
    const priced = catalog.find((c) => c.id === m.id);
    if (!priced) return m;
    return {
      ...priced,
      ...m,
      inputUsdPerMillionTokens: m.inputUsdPerMillionTokens || priced.inputUsdPerMillionTokens,
      outputUsdPerMillionTokens: m.outputUsdPerMillionTokens || priced.outputUsdPerMillionTokens,
    };
  });

  const allModels = [...withPrices, ...catalog.filter((m) => !liveIds.has(m.id))];

  if (allModels.length === 0) {
    return getFallbackModels();
  }

  if (!cache) cache = {};
  cache[slot] = allModels;
  cacheTimestamp = Date.now();
  return allModels;
}

export function getFallbackModels() {
  return [
    { id: 'openai/gpt-oss-20b', provider: 'groq', label: 'GPT-OSS 20B (Groq, free tier)', inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0 },
    { id: 'openai/gpt-oss-120b', provider: 'groq', label: 'GPT-OSS 120B (Groq, free tier)', inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0 },
    { id: 'qwen/qwen3.8-27b', provider: 'groq', label: 'Qwen 3.8 27B (Groq, free tier)', inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0 },
    { id: 'claude-opus-5-5', provider: 'anthropic', label: 'Claude Opus 5.5', inputUsdPerMillionTokens: 4, outputUsdPerMillionTokens: 20, thinking: true, tier: 'flagship' },
    { id: 'claude-sonnet-4-6', provider: 'anthropic', label: 'Claude Sonnet 4.6', inputUsdPerMillionTokens: 3, outputUsdPerMillionTokens: 15, tier: 'mid' },
    { id: 'claude-haiku-4-5', provider: 'anthropic', label: 'Claude Haiku 4.5', inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 5, tier: 'budget' },
    { id: 'gpt-6-astra', provider: 'openai', label: 'GPT-6 Astra', inputUsdPerMillionTokens: 10, outputUsdPerMillionTokens: 50, thinking: true, tier: 'flagship' },
    { id: 'gpt-6-sol', provider: 'openai', label: 'GPT-6 Sol', inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 10, thinking: true, tier: 'mid' },
    { id: 'gpt-6-luna', provider: 'openai', label: 'GPT-6 Luna', inputUsdPerMillionTokens: 0.1, outputUsdPerMillionTokens: 0.5, tier: 'budget' },
    { id: 'gpt-4o-mini', provider: 'openai', label: 'GPT-4o mini', inputUsdPerMillionTokens: 0.15, outputUsdPerMillionTokens: 0.6, tier: 'budget' },
    { id: 'mistral-small-latest', provider: 'mistral', label: 'Mistral Small', inputUsdPerMillionTokens: 0.1, outputUsdPerMillionTokens: 0.3, tier: 'budget' },
  ];
}

/**
 * Classify any registry model (pinned, live, or from the catalog) into a
 * pricing tier. Pinned entries carry their own tier; everything else is
 * classified by id.
 */
export function getModelTier(model) {
  if (model?.tier) return model.tier;
  const id = String(model?.id || '').toLowerCase();
  const label = String(model?.label || '').toLowerCase();
  const hay = `${id} ${label}`;
  if (/opus|astra|fable|gpt-5($|[.-])|o1|o3|pro|ultra|236b|405b/.test(hay)) return 'flagship';
  if (/mini|haiku|flash|sol|sonnet|27b|20b|13b|8b|7b|small|lite|luna/.test(hay)) return 'budget';
  return 'mid';
}

/**
 * Embedding models are installed alongside chat models but cannot hold a
 * conversation; picking one fails the turn. The family alone is not enough:
 * qwen3-embedding reports family "qwen3".
 */
export function isEmbeddingOnlyModel(m) {
  const family = String(m?.details?.family || '');
  if (/bert$/i.test(family)) return true;
  return /embed|(^|[/:-])bge-|minilm/i.test(String(m?.name || ''));
}

export function invalidateCache() {
  cache = null;
  cacheTimestamp = 0;
  invalidateCatalog();
}

export async function resolveModel(modelId) {
  const models = await discoverAllModels();
  const found = models.find((m) => m.id === modelId);
  if (found) return found;

  const staticFound = getFallbackModels().find((m) => m.id === modelId);
  if (staticFound) return staticFound;

  // Catalog entries not surfaced by discoverAllModels (connector unconfigured)
  // still resolve — the user may be about to configure it.
  const catalog = await fetchCatalogModels();
  const catalogFound = catalog.find((m) => m.id === modelId);
  if (catalogFound) return catalogFound;

  const provider = inferProvider(modelId);
  if (provider) {
    return { id: modelId, provider, label: modelId, inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0 };
  }

  return null;
}

/**
 * Which connector serves a namespaced model id.
 *
 * Registry-driven: every connector that namespaces its ids contributes its
 * prefix, so a new connector's prefix cannot be forgotten here. The explicit
 * `accounts/fireworks/` case stays because it is a *vendor* namespace that
 * arrives inside the id from the wire, not a connector prefix.
 */
export function inferProvider(modelId) {
  if (typeof modelId !== 'string') return null;
  for (const id of CONNECTOR_IDS) {
    const prefix = getConnectorKeyPrefix(id);
    if (prefix && modelId.startsWith(prefix)) return id;
  }
  if (modelId.startsWith('accounts/fireworks/')) return 'fireworks';
  return null;
}

export { mergeWithCatalog };

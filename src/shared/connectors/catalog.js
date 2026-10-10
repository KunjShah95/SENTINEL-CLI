/**
 * Model catalog — models.dev as the breadth source, the local pinned list as
 * the authority.
 *
 * ## Why models.dev
 *
 * The previous arrangement had each connector hand-write a `discover*()`
 * function that hit its own listing endpoint. That produced three bad
 * properties:
 *
 *   1. A new provider cost ~20 lines of copy-paste, so nobody added any.
 *   2. Anthropic has no listing API, so it got a hand-maintained array of
 *      September 2026 releases with prices pinned from blog posts. Correct
 *      until the next release, then silently stale, and nothing noticed.
 *   3. Every provider except OpenRouter reported prices as 0, because a
 *      `/models` endpoint returns ids and not money. Cost accounting was
 *      therefore wrong for all but one connector.
 *
 * models.dev is a single static JSON document of 226 providers with prices,
 * context windows, capability flags and reasoning support. Fetching it turns
 * "add a provider" into "add a registry row" — the catalog arrives free.
 *
 * ## Why the local list still wins on collision
 *
 * models.dev lags the frontier by days. The pinned list is the newer source
 * for the models it names. So the merge is deliberately asymmetric: local
 * entries override catalog entries with the same id, never the reverse.
 *
 * Concretely, `claude-opus-5-5` resolves offline with pinned pricing whether
 * or not the network is available, and models.dev adds breadth around it.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  CONNECTOR_IDS,
  CONNECTORS,
  getConnectorKeyPrefix,
  isLocalConnector,
} from './registry.js';

const CATALOG_URL = 'https://models.dev/api.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // a day — this is a slow-moving file
// Matches the per-provider discovery timeout. This runs concurrently with live
// discovery, so the two share one timeout window rather than adding up.
const FETCH_TIMEOUT_MS = 5000;

/** Global cache path, beside preferences.json. */
const CACHE_DIR = join(homedir(), '.sentinel');
const CACHE_PATH = join(CACHE_DIR, 'models-catalog.json');

let cache = null;
let cacheTimestamp = 0;

/**
 * models.dev provider ids do not always match SENTINEL connector ids. Only
 * aliases are listed here — an id present in both does not need an entry.
 */
const PROVIDER_ALIASES = Object.freeze({
  google: 'google',
  'google-generative-ai': 'google',
  'github-copilot': 'github-copilot',
  copilot: 'github-copilot',
  'x-ai': 'xai',
  xai: 'xai',
  'openai-compatible': null,
  ollama: 'ollama',
  lmstudio: 'lmstudio',
});

/** Map a models.dev provider id onto a SENTINEL connector id, or null. */
function toConnectorId(catalogId) {
  const alias = PROVIDER_ALIASES[catalogId];
  if (alias === null) return null;
  if (alias) return CONNECTORS[alias] ? alias : null;
  return CONNECTORS[catalogId] ? catalogId : null;
}

/**
 * Namespace a model id the way the connector expects.
 *
 * Connectors with a `keyPrefix` (ollama, lmstudio, openrouter, copilot) get it
 * prepended so the registry key is unambiguous. The rest stay bare, which
 * matches how SENTINEL has always named them — `gpt-4o-mini`, not
 * `openai/gpt-4o-mini`. `DEFAULT_CHAT_MODEL_ID` and every stored preference
 * depend on that shape.
 */
function qualifyModelId(connectorId, rawId) {
  const prefix = getConnectorKeyPrefix(connectorId);
  return prefix ? `${prefix}${rawId}` : rawId;
}

/** Convert one models.dev model entry into SENTINEL registry shape. */
export function toRegistryModel(connectorId, raw) {
  const conn = CONNECTORS[connectorId];
  if (!conn || !raw?.id) return null;
  // Embedding and speech models cannot hold a tool-calling conversation.
  // Offering them means a turn that fails after the user picked.
  const modalitiesOut = raw.modalities?.output;
  const onlyNonText = Array.isArray(modalitiesOut) && modalitiesOut.length > 0
    && !modalitiesOut.includes('text');
  if (onlyNonText) return null;
  if (/embed|(^|[/:-])bge-|minilm/i.test(raw.id)) return null;

  return {
    id: qualifyModelId(connectorId, raw.id),
    provider: connectorId,
    label: raw.name || raw.id,
    inputUsdPerMillionTokens: raw.cost?.input ?? 0,
    outputUsdPerMillionTokens: raw.cost?.output ?? 0,
    thinking: raw.reasoning === true,
    toolCall: raw.tool_call === true,
    attachment: raw.attachment === true,
    contextLength: raw.limit?.context || undefined,
    outputTokenLimit: raw.limit?.output || undefined,
    // The API rejects a thinking budget below this with a 400 that reads like a
    // malformed request. Carrying it here lets the variant layer clamp before
    // the wire instead of after.
    reasoningMinTokens: raw.reasoning_options?.find((o) => o.type === 'budget_tokens')?.min || undefined,
    releaseDate: raw.release_date || undefined,
    source: 'models.dev',
  };
}

/**
 * Fetch the models.dev document, with a day-old on-disk cache as the offline
 * path. Returns `{}` rather than throwing: a missing catalog degrades
 * `/models` to the pinned list instead of breaking the TUI at startup.
 */
async function loadCatalogDocument() {
  const now = Date.now();
  if (cache && now - cacheTimestamp < CACHE_TTL_MS) return cache;

  try {
    const res = await fetch(CATALOG_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const doc = await res.json();
      cache = doc;
      cacheTimestamp = now;
      try {
        mkdirSync(CACHE_DIR, { recursive: true });
        writeFileSync(CACHE_PATH, JSON.stringify(doc), { mode: 0o600 });
      } catch {
        // Cache write is best-effort; a read-only home must not break /models.
      }
      return doc;
    }
  } catch {
    // fall through to the disk cache
  }

  if (cache) return cache;
  try {
    if (existsSync(CACHE_PATH)) {
      const parsed = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
      cache = parsed;
      cacheTimestamp = 0; // expired, but better than nothing
      return parsed;
    }
  } catch {
    // corrupt cache is not worth reporting
  }
  return {};
}

/**
 * The whole catalog, flattened into SENTINEL registry shape.
 *
 * Only connectors SENTINEL actually has a row for are converted. models.dev
 * knows 226 providers; surfacing all of them would mean adding 212 registry
 * rows plus transport implementations, which is a different (and larger)
 * feature. What this buys is that every connector the registry *does* know
 * gets a real catalog without a hand-written mapper.
 */
export async function fetchCatalogModels() {
  const doc = await loadCatalogDocument();
  if (!doc || typeof doc !== 'object') return [];

  const byConnector = new Map();
  for (const [catalogId, entry] of Object.entries(doc)) {
    const connectorId = toConnectorId(catalogId);
    if (!connectorId || !entry?.models) continue;
    if (!byConnector.has(connectorId)) byConnector.set(connectorId, []);
    const bucket = byConnector.get(connectorId);
    for (const raw of Object.values(entry.models)) {
      const model = toRegistryModel(connectorId, raw);
      if (model) bucket.push(model);
    }
  }

  const all = [];
  for (const bucket of byConnector.values()) all.push(...bucket);
  return all;
}

/**
 * Catalog models restricted to connectors the user can actually reach.
 *
 * This is what keeps `/models` readable. models.dev lists every model every
 * vendor has ever made; a user with one Groq key should see Groq, plus any
 * local daemon running — not 900 models they would be billed for and cannot
 * call.
 */
export async function fetchAvailableCatalogModels({ isConnected } = {}) {
  const all = await fetchCatalogModels();
  const connected = typeof isConnected === 'function'
    ? isConnected
    : (id) => isLocalConnector(id) || hasAnyCredential(id);
  return all.filter((m) => connected(m.provider));
}

/** True when the environment (or stored credential) can reach this connector. */
export function hasAnyCredential(connectorId) {
  const conn = CONNECTORS[connectorId];
  if (!conn) return false;
  if (conn.local) return true;
  return conn.env.some((k) => !!process.env[k]);
}

/**
 * Merge a pinned/local list with catalog entries.
 *
 * Asymmetric on purpose: local entries win on id collision, because they are
 * the newer authority for the models they name. Catalog entries contribute
 * breadth only. Returns local first so ranking logic sees a stable base.
 */
export function mergeWithCatalog(localModels, catalogModels) {
  const localIds = new Set(localModels.map((m) => m.id));
  const catalogOnly = catalogModels.filter((m) => !localIds.has(m.id));
  return [...localModels, ...catalogOnly];
}

/** Drop the in-memory catalog so the next call refetches. */
export function invalidateCatalog() {
  cache = null;
  cacheTimestamp = 0;
}

/** Connector ids this catalog build knows how to describe. */
export function catalogConnectorIds() {
  return CONNECTOR_IDS.slice();
}

/**
 * Connector registry — the single source of truth for every LLM connector
 * SENTINEL can talk to.
 *
 * This file replaces four hand-maintained tables that used to drift:
 *
 *   src/shared/models/index.js  getEnvKeyForProvider()
 *   src/agent/providers.js      ENV_KEYS
 *   src/agent/doctor.js         PROVIDER_ENV
 *   src/config/configManager.js default `providers` block
 *
 * The drift was already documented as a bug in doctor.js:33-35 (Copilot lists
 * GITHUB_COPILOT_TOKEN, discovery reads GITHUB_TOKEN || GITHUB_COPILOT_TOKEN).
 * One table cannot disagree with itself.
 *
 * ## Why a connector and not a "provider"
 *
 * A provider is a vendor. A connector is *how SENTINEL reaches it*: transport
 * shape, base URL, credential handling, and how to enumerate models. Groq via a
 * corporate proxy and Groq direct are the same provider but different
 * connectors. That distinction is what makes custom endpoints a config concern
 * instead of a code change.
 *
 * ## Fields
 *
 *   id           stable key; also the first segment of a model id
 *   label        display name in `/connect` and `/models`
 *   transport    how requests are shaped — see TRANSPORT
 *   baseURL()    root for the OpenAI-compatible / native endpoints
 *   env[]        credential env vars, in precedence order. For a local daemon
 *                this holds the host override instead, which is where that
 *                connector reads its configuration from.
 *   auth[]       how a user can supply a credential — see AUTH
 *   modelsPath   listing endpoint, or null when the vendor exposes none
 *   mapModels    response shape at modelsPath — see MODEL_MAPPERS
 *   keyPrefix    namespace prepended to model ids in the registry
 *   local        runs on the user's machine; needs no credential
 *   docs         where to get a credential
 *
 * `baseURL` is a function because several of these read an env var at call
 * time (a proxy override must win over the default).
 */

/** Request shapes providers.js knows how to stream. */
export const TRANSPORT = Object.freeze({
  OPENAI_COMPAT: 'openai-compat',
  ANTHROPIC: 'anthropic',
  GOOGLE: 'google',
});

/** Ways a user can authenticate. Drives the `/connect` method picker. */
export const AUTH = Object.freeze({
  /** Paste an API key. */
  KEY: 'key',
  /** Device-code flow: print a URL + code, poll until authorized (GitHub). */
  OAUTH_DEVICE: 'oauth-device',
  /** Browser redirect flow with a localhost callback (Anthropic, OpenAI). */
  OAUTH_BROWSER: 'oauth-browser',
  /** Reuse an already-authenticated cloud CLI (az, gcloud). */
  CLI_SESSION: 'cli-session',
  /** Nothing to supply — the daemon answers or it does not. */
  NONE: 'none',
});

/** Response shapes at a connector's `modelsPath`. */
export const MODEL_MAPPERS = Object.freeze({
  OPENAI: 'openai',
  GOOGLE: 'google',
  OLLAMA: 'ollama',
});

const CONNECTOR_LIST = [
  // ── First-party (non-OpenAI-shaped) transports ────────────────────────────
  {
    id: 'anthropic',
    label: 'Anthropic',
    transport: TRANSPORT.ANTHROPIC,
    baseURL: () => process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
    env: ['ANTHROPIC_API_KEY'],
    auth: [AUTH.KEY, AUTH.OAUTH_BROWSER],
    modelsPath: null, // no public listing API; the catalog comes from models.dev
    mapModels: null,
    keyPrefix: null,
    local: false,
    docs: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'google',
    label: 'Google Gemini',
    transport: TRANSPORT.GOOGLE,
    baseURL: () => 'https://generativelanguage.googleapis.com/v1beta',
    env: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    auth: [AUTH.KEY],
    modelsPath: '/models',
    mapModels: MODEL_MAPPERS.GOOGLE,
    keyPrefix: null,
    local: false,
    docs: 'https://aistudio.google.com/apikey',
  },

  // ── OpenAI-compatible ─────────────────────────────────────────────────────
  {
    id: 'openai',
    label: 'OpenAI',
    transport: TRANSPORT.OPENAI_COMPAT,
    baseURL: () => process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    env: ['OPENAI_API_KEY'],
    auth: [AUTH.KEY, AUTH.OAUTH_BROWSER],
    modelsPath: '/models',
    mapModels: MODEL_MAPPERS.OPENAI,
    keyPrefix: null,
    local: false,
    docs: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'groq',
    label: 'Groq',
    transport: TRANSPORT.OPENAI_COMPAT,
    baseURL: () => process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
    env: ['GROQ_API_KEY'],
    auth: [AUTH.KEY],
    modelsPath: '/models',
    mapModels: MODEL_MAPPERS.OPENAI,
    keyPrefix: null,
    local: false,
    docs: 'https://console.groq.com/keys',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    transport: TRANSPORT.OPENAI_COMPAT,
    baseURL: () => process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    env: ['OPENROUTER_API_KEY'],
    auth: [AUTH.KEY],
    modelsPath: '/models',
    mapModels: MODEL_MAPPERS.OPENAI,
    keyPrefix: 'openrouter/', // ids are already vendor/model; namespace them
    local: false,
    docs: 'https://openrouter.ai/settings/keys',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    transport: TRANSPORT.OPENAI_COMPAT,
    baseURL: () => process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    env: ['DEEPSEEK_API_KEY'],
    auth: [AUTH.KEY],
    modelsPath: '/models',
    mapModels: MODEL_MAPPERS.OPENAI,
    keyPrefix: null,
    local: false,
    docs: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    transport: TRANSPORT.OPENAI_COMPAT,
    baseURL: () => process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1',
    env: ['MISTRAL_API_KEY'],
    auth: [AUTH.KEY],
    modelsPath: '/models',
    mapModels: MODEL_MAPPERS.OPENAI,
    keyPrefix: null,
    local: false,
    docs: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    transport: TRANSPORT.OPENAI_COMPAT,
    baseURL: () => process.env.XAI_BASE_URL || 'https://api.x.ai/v1',
    env: ['XAI_API_KEY'],
    auth: [AUTH.KEY],
    modelsPath: '/models',
    mapModels: MODEL_MAPPERS.OPENAI,
    keyPrefix: null,
    local: false,
    docs: 'https://console.x.ai',
  },
  {
    id: 'together',
    label: 'Together AI',
    transport: TRANSPORT.OPENAI_COMPAT,
    baseURL: () => process.env.TOGETHER_BASE_URL || 'https://api.together.xyz/v1',
    env: ['TOGETHER_API_KEY'],
    auth: [AUTH.KEY],
    modelsPath: '/models',
    mapModels: MODEL_MAPPERS.OPENAI,
    keyPrefix: null,
    local: false,
    docs: 'https://api.together.ai/settings/api-keys',
  },
  {
    id: 'fireworks',
    label: 'Fireworks AI',
    transport: TRANSPORT.OPENAI_COMPAT,
    baseURL: () => process.env.FIREWORKS_BASE_URL || 'https://api.fireworks.ai/inference/v1',
    env: ['FIREWORKS_API_KEY'],
    auth: [AUTH.KEY],
    modelsPath: '/models',
    mapModels: MODEL_MAPPERS.OPENAI,
    keyPrefix: null,
    local: false,
    docs: 'https://fireworks.ai/api-keys',
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    transport: TRANSPORT.OPENAI_COMPAT,
    baseURL: () => process.env.PERPLEXITY_BASE_URL || 'https://api.perplexity.ai',
    env: ['PERPLEXITY_API_KEY'],
    auth: [AUTH.KEY],
    modelsPath: '/models',
    mapModels: MODEL_MAPPERS.OPENAI,
    keyPrefix: null,
    local: false,
    docs: 'https://www.perplexity.ai/settings/api',
  },
  {
    id: 'github-copilot',
    label: 'GitHub Copilot',
    transport: TRANSPORT.OPENAI_COMPAT,
    baseURL: () => process.env.COPILOT_BASE_URL || 'https://api.githubcopilot.com',
    env: ['GITHUB_TOKEN', 'GITHUB_COPILOT_TOKEN'],
    auth: [AUTH.KEY, AUTH.OAUTH_DEVICE],
    modelsPath: '/v1/models',
    mapModels: MODEL_MAPPERS.OPENAI,
    keyPrefix: 'copilot/',
    local: false,
    docs: 'https://github.com/settings/tokens',
  },

  // ── Local daemons ─────────────────────────────────────────────────────────
  {
    id: 'ollama',
    label: 'Ollama (local)',
    transport: TRANSPORT.OPENAI_COMPAT,
    baseURL: () => `${(process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/$/, '')}/v1`,
    // Native tags endpoint, not the OpenAI one: /api/tags reports size and
    // context length, which /v1/models omits. Availability is proof the
    // daemon answered, so there is deliberately no credential.
    discoveryBaseURL: () => (process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/$/, ''),
    // Not a credential — a host override. It is listed because `env[]` is what
    // answers "where does this connector read its configuration from", and the
    // two `baseURL` closures above read exactly this variable. Declaring `[]`
    // made OLLAMA_HOST invisible to `getConnectorEnvVar`, so a host saved via
    // /setup or config was never published back into the environment.
    //
    // Safe to add: every credential path short-circuits on `local` — see
    // `resolveCredential` and `authHeadersFor` — so this is never sent as a key.
    env: ['OLLAMA_HOST'],
    auth: [AUTH.NONE],
    modelsPath: '/api/tags',
    mapModels: MODEL_MAPPERS.OLLAMA,
    keyPrefix: 'ollama/',
    local: true,
    docs: 'https://ollama.com/download',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (local)',
    transport: TRANSPORT.OPENAI_COMPAT,
    baseURL: () => `${(process.env.LMSTUDIO_HOST || 'http://localhost:1234').replace(/\/$/, '')}/v1`,
    // Host override, not a credential — same reasoning as the Ollama row above.
    env: ['LMSTUDIO_HOST'],
    auth: [AUTH.NONE],
    modelsPath: '/v1/models',
    mapModels: MODEL_MAPPERS.OPENAI,
    keyPrefix: 'lmstudio/',
    local: true,
    docs: 'https://lmstudio.ai',
  },

  // ── Catalog-only connectors ───────────────────────────────────────────────
  //
  // These are OpenAI-compatible with no listing quirk, so a registry row plus
  // the models.dev catalog is the whole implementation. They exist to prove
  // the point: adding a provider is one row, not twenty lines.
  {
    id: 'cerebras',
    label: 'Cerebras',
    transport: TRANSPORT.OPENAI_COMPAT,
    baseURL: () => process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1',
    env: ['CEREBRAS_API_KEY'],
    auth: [AUTH.KEY],
    modelsPath: '/models',
    mapModels: MODEL_MAPPERS.OPENAI,
    keyPrefix: null,
    local: false,
    docs: 'https://cloud.cerebras.ai',
  },
  {
    id: 'nvidia',
    label: 'NVIDIA (build.nvidia.com)',
    transport: TRANSPORT.OPENAI_COMPAT,
    baseURL: () => process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
    env: ['NVIDIA_API_KEY'],
    auth: [AUTH.KEY],
    modelsPath: '/models',
    mapModels: MODEL_MAPPERS.OPENAI,
    keyPrefix: null,
    local: false,
    docs: 'https://build.nvidia.com',
  },
  {
    id: 'deepinfra',
    label: 'DeepInfra',
    transport: TRANSPORT.OPENAI_COMPAT,
    baseURL: () => process.env.DEEPINFRA_BASE_URL || 'https://api.deepinfra.com/v1/openai',
    env: ['DEEPINFRA_API_KEY'],
    auth: [AUTH.KEY],
    modelsPath: '/models',
    mapModels: MODEL_MAPPERS.OPENAI,
    keyPrefix: null,
    local: false,
    docs: 'https://deepinfra.com/dash/api_keys',
  },
  {
    id: 'nebius',
    label: 'Nebius Token Factory',
    transport: TRANSPORT.OPENAI_COMPAT,
    baseURL: () => process.env.NEBIUS_BASE_URL || 'https://api.studio.nebius.ai/v1',
    env: ['NEBIUS_API_KEY'],
    auth: [AUTH.KEY],
    modelsPath: '/models',
    mapModels: MODEL_MAPPERS.OPENAI,
    keyPrefix: null,
    local: false,
    docs: 'https://tokenfactory.nebius.com',
  },
  {
    id: 'moonshot',
    label: 'Moonshot AI (Kimi)',
    transport: TRANSPORT.OPENAI_COMPAT,
    baseURL: () => process.env.MOONSHOT_BASE_URL || 'https://api.moonshot.ai/v1',
    env: ['MOONSHOT_API_KEY'],
    auth: [AUTH.KEY],
    modelsPath: '/models',
    mapModels: MODEL_MAPPERS.OPENAI,
    keyPrefix: null,
    local: false,
    docs: 'https://platform.moonshot.ai/console/api-keys',
  },
  {
    id: 'vercel-ai-gateway',
    label: 'Vercel AI Gateway',
    transport: TRANSPORT.OPENAI_COMPAT,
    baseURL: () => process.env.VERCEL_AI_GATEWAY_BASE_URL || 'https://ai-gateway.vercel.sh/v1',
    env: ['AI_GATEWAY_API_KEY'],
    auth: [AUTH.KEY],
    modelsPath: '/models',
    mapModels: MODEL_MAPPERS.OPENAI,
    keyPrefix: null,
    local: false,
    docs: 'https://vercel.com/ai-gateway',
  },
  {
    id: 'huggingface',
    label: 'Hugging Face Inference',
    transport: TRANSPORT.OPENAI_COMPAT,
    baseURL: () => process.env.HF_BASE_URL || 'https://router.huggingface.co/v1',
    env: ['HF_TOKEN', 'HUGGINGFACE_API_KEY'],
    auth: [AUTH.KEY],
    modelsPath: '/models',
    mapModels: MODEL_MAPPERS.OPENAI,
    keyPrefix: null,
    local: false,
    docs: 'https://huggingface.co/settings/tokens',
  },
  {
    id: 'zai',
    label: 'Z.AI (GLM)',
    transport: TRANSPORT.OPENAI_COMPAT,
    baseURL: () => process.env.ZAI_BASE_URL || 'https://api.z.ai/api/paas/v4',
    env: ['ZAI_API_KEY'],
    auth: [AUTH.KEY],
    modelsPath: '/models',
    mapModels: MODEL_MAPPERS.OPENAI,
    keyPrefix: null,
    local: false,
    docs: 'https://z.ai',
  },
];

/** Frozen id → connector. Every lookup path goes through this object. */
export const CONNECTORS = Object.freeze(
  Object.fromEntries(CONNECTOR_LIST.map((c) => [c.id, Object.freeze(c)]))
);

/** Stable display order for `/connect` and `sentinel doctor`. */
export const CONNECTOR_IDS = Object.freeze(CONNECTOR_LIST.map((c) => c.id));

export function getConnector(id) {
  return CONNECTORS[id] || null;
}

export function listConnectors() {
  return CONNECTOR_LIST.slice();
}

/** Local daemons run on the user's machine and need no credential. */
export function isLocalConnector(id) {
  return CONNECTORS[id]?.local === true;
}

/**
 * The credential env var a connector reads, first match wins.
 * Empty string when the connector has none (local daemons).
 */
export function getConnectorEnvVar(id) {
  return CONNECTORS[id]?.env?.[0] || '';
}

/** Every env var a connector accepts, in precedence order. */
export function getConnectorEnvVars(id) {
  return CONNECTORS[id]?.env?.slice() || [];
}

/**
 * Does the environment hold a credential for this connector?
 *
 * Local connectors are always available — their presence in the registry after
 * discovery is itself proof the daemon answered, so there is nothing to check.
 */
export function hasEnvCredential(id) {
  const conn = CONNECTORS[id];
  if (!conn) return false;
  if (conn.local) return true;
  return getConnectorEnvVars(id).some((k) => !!process.env[k]);
}

/** Root URL for a connector's request endpoints. */
export function getConnectorBaseUrl(id) {
  const conn = CONNECTORS[id];
  if (!conn) return '';
  return conn.baseURL();
}

/**
 * URL used for *discovery* only. Most connectors share their request base, but
 * Ollama's listing endpoint lives on the native host, outside the /v1 root.
 */
export function getDiscoveryBaseUrl(id) {
  const conn = CONNECTORS[id];
  if (!conn) return '';
  return conn.discoveryBaseURL ? conn.discoveryBaseURL() : conn.baseURL();
}

/** Can this connector be asked what models it serves? */
export function canDiscoverModels(id) {
  return !!CONNECTORS[id]?.modelsPath;
}

/**
 * Model ids that already carry a vendor namespace (`accounts/fireworks/...`,
 * `openrouter/vendor/model`) need the connector prefix stripped before the id
 * goes on the wire. This reads the prefix off the registry instead of
 * hardcoding a list that silently missed `accounts/fireworks/`.
 */
export function getConnectorKeyPrefix(id) {
  return CONNECTORS[id]?.keyPrefix || null;
}

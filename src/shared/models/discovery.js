/**
 * Dynamic model discovery — fetches available models from each provider's API.
 *
 * Instead of hardcoding model IDs, this queries provider APIs at runtime
 * using the user's API keys. Falls back to a minimal static list when
 * APIs are unreachable or unconfigured.
 *
 * Supports: OpenAI, Groq, Mistral, Together, Fireworks, OpenRouter,
 *           Perplexity, xAI/Grok, DeepSeek, Ollama, LM Studio, Google.
 * Static fallback (no listing API): Anthropic.
 */

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

async function discoverOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return [];
  const data = await fetchJson('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!data?.data) return [];
  return data.data
    .filter((m) => m.id.startsWith('gpt-') || m.id.startsWith('o') || m.id.startsWith('chatgpt-'))
    .map((m) => ({
      id: m.id,
      provider: 'openai',
      label: m.id,
      inputUsdPerMillionTokens: 0,
      outputUsdPerMillionTokens: 0,
      ownedBy: m.owned_by,
    }));
}

async function discoverGroq() {
  const key = process.env.GROQ_API_KEY;
  if (!key) return [];
  const data = await fetchJson('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!data?.data) return [];
  return data.data
    .filter((m) => m.active !== false)
    .map((m) => ({
      id: m.id,
      provider: 'groq',
      label: m.id,
      inputUsdPerMillionTokens: 0,
      outputUsdPerMillionTokens: 0,
      ownedBy: m.owned_by,
    }));
}

async function discoverMistral() {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) return [];
  const data = await fetchJson('https://api.mistral.ai/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!data?.data) return [];
  return data.data.map((m) => ({
    id: m.id,
    provider: 'mistral',
    label: m.id,
    inputUsdPerMillionTokens: 0,
    outputUsdPerMillionTokens: 0,
    ownedBy: m.owned_by,
  }));
}

async function discoverTogether() {
  const key = process.env.TOGETHER_API_KEY;
  if (!key) return [];
  const data = await fetchJson('https://api.together.xyz/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!data) return [];
  const list = Array.isArray(data) ? data : data.data;
  if (!list) return [];
  return list
    .filter((m) => m.id && (m.id.includes('llama') || m.id.includes('qwen') || m.id.includes('deepseek') || m.id.includes('mistral')))
    .map((m) => ({
      id: m.id,
      provider: 'together',
      label: m.id,
      inputUsdPerMillionTokens: 0,
      outputUsdPerMillionTokens: 0,
      ownedBy: m.owned_by || 'together',
    }));
}

async function discoverFireworks() {
  const key = process.env.FIREWORKS_API_KEY;
  if (!key) return [];
  const data = await fetchJson('https://api.fireworks.ai/inference/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!data?.data) return [];
  return data.data.map((m) => ({
    id: m.id,
    provider: 'fireworks',
    label: m.id,
    inputUsdPerMillionTokens: 0,
    outputUsdPerMillionTokens: 0,
    ownedBy: m.owned_by,
  }));
}

async function discoverOpenRouter() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return [];
  const data = await fetchJson('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!data?.data) return [];
  return data.data.map((m) => ({
    id: `openrouter/${m.id}`,
    provider: 'openrouter',
    label: m.name || m.id,
    inputUsdPerMillionTokens: m.pricing?.prompt ? parseFloat(m.pricing.prompt) * 1_000_000 : 0,
    outputUsdPerMillionTokens: m.pricing?.completion ? parseFloat(m.pricing.completion) * 1_000_000 : 0,
    contextLength: m.context_length,
    ownedBy: m.id?.split('/')[0],
  }));
}

async function discoverPerplexity() {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return [];
  const data = await fetchJson('https://api.perplexity.ai/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!data) return [];
  const list = Array.isArray(data) ? data : data.data;
  if (!list) return [];
  return list.map((m) => ({
    id: m.id,
    provider: 'perplexity',
    label: m.id,
    inputUsdPerMillionTokens: 0,
    outputUsdPerMillionTokens: 0,
    ownedBy: 'perplexity',
  }));
}

async function discoverXAI() {
  const key = process.env.XAI_API_KEY;
  if (!key) return [];
  const data = await fetchJson('https://api.x.ai/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!data?.data) return [];
  return data.data.map((m) => ({
    id: m.id,
    provider: 'xai',
    label: m.id,
    inputUsdPerMillionTokens: 0,
    outputUsdPerMillionTokens: 0,
    ownedBy: m.owned_by,
  }));
}

async function discoverDeepSeek() {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return [];
  const data = await fetchJson('https://api.deepseek.com/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!data?.data) return [];
  return data.data.map((m) => ({
    id: m.id,
    provider: 'deepseek',
    label: m.id,
    inputUsdPerMillionTokens: 0,
    outputUsdPerMillionTokens: 0,
    ownedBy: m.owned_by,
  }));
}

async function discoverGoogle() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return [];
  const data = await fetchJson(
    `https://generativelanguage.googleapis.com/v1/models?key=${key}`
  );
  if (!data?.models) return [];
  return data.models
    .filter((m) => m.name.includes('gemini'))
    .map((m) => ({
      id: m.name.replace('models/', ''),
      provider: 'google',
      label: m.displayName || m.name,
      inputUsdPerMillionTokens: 0,
      outputUsdPerMillionTokens: 0,
      ownedBy: 'google',
      contextLength: m.inputTokenLimit,
      description: m.description,
    }));
}

/**
 * Embedding models (bge, nomic-embed, *-embedding) are installed alongside
 * chat models but cannot hold a conversation; picking one fails the turn.
 * The family alone is not enough: qwen3-embedding reports family "qwen3".
 */
export function isEmbeddingOnlyModel(m) {
  const family = String(m?.details?.family || '');
  if (/bert$/i.test(family)) return true;
  return /embed|(^|[/:-])bge-|minilm/i.test(String(m?.name || ''));
}

async function discoverOllama() {
  const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const data = await fetchJson(`${host}/api/tags`);
  if (!data?.models) return [];
  return data.models.filter((m) => !isEmbeddingOnlyModel(m)).map((m) => ({
    id: `ollama/${m.name}`,
    provider: 'ollama',
    label: `Ollama ${m.name}`,
    inputUsdPerMillionTokens: 0,
    outputUsdPerMillionTokens: 0,
    ownedBy: 'ollama',
    size: m.size,
    contextLength: m.details?.context_length,
  }));
}

async function discoverLMStudio() {
  const host = process.env.LMSTUDIO_HOST || 'http://localhost:1234';
  const data = await fetchJson(`${host}/v1/models`);
  if (!data?.data) return [];
  return data.data.map((m) => ({
    id: `lmstudio/${m.id}`,
    provider: 'lmstudio',
    label: `LM Studio ${m.id}`,
    inputUsdPerMillionTokens: 0,
    outputUsdPerMillionTokens: 0,
    ownedBy: 'lmstudio',
  }));
}

async function discoverGitHubCopilot() {
  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_COPILOT_TOKEN;
  if (!token) return [];
  const data = await fetchJson('https://api.githubcopilot.com/v1/models', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!data?.data) return [];
  return data.data.map((m) => ({
    id: `copilot/${m.id}`,
    provider: 'github-copilot',
    label: `${m.id} (GitHub Copilot)`,
    inputUsdPerMillionTokens: 0,
    outputUsdPerMillionTokens: 0,
    ownedBy: m.owned_by,
  }));
}

export async function discoverAllModels() {
  if (cache && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cache;
  }

  const discoveries = await Promise.allSettled([
    discoverOpenAI(),
    discoverGroq(),
    discoverMistral(),
    discoverTogether(),
    discoverFireworks(),
    discoverOpenRouter(),
    discoverPerplexity(),
    discoverXAI(),
    discoverDeepSeek(),
    discoverGoogle(),
    discoverOllama(),
    discoverLMStudio(),
    discoverGitHubCopilot(),
  ]);

  const allModels = [];
  for (const result of discoveries) {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      allModels.push(...result.value);
    }
  }

  if (allModels.length === 0) {
    return getFallbackModels();
  }

  cache = allModels;
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

function getAnthropicStaticModels() {
  // Static catalog: Anthropic exposes no model-listing API, and flagship
  // pricing below is pinned from official Sep 2026 announcements so cost
  // accounting is right even before a live discovery refresh. `tier`
  // classifies entries for the model picker (flagship | mid | budget).
  return [
    { id: 'claude-opus-5-5', provider: 'anthropic', label: 'Claude Opus 5.5', inputUsdPerMillionTokens: 4, outputUsdPerMillionTokens: 20, thinking: true, tier: 'flagship' },
    { id: 'gpt-6-astra', provider: 'openai', label: 'GPT-6 Astra', inputUsdPerMillionTokens: 10, outputUsdPerMillionTokens: 50, thinking: true, tier: 'flagship' },
    { id: 'gpt-6-sol', provider: 'openai', label: 'GPT-6 Sol', inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 10, thinking: true, tier: 'mid' },
    { id: 'gpt-6-luna', provider: 'openai', label: 'GPT-6 Luna', inputUsdPerMillionTokens: 0.1, outputUsdPerMillionTokens: 0.5, tier: 'budget' },
    { id: 'claude-opus-4-6', provider: 'anthropic', label: 'Claude Opus 4.6', inputUsdPerMillionTokens: 5, outputUsdPerMillionTokens: 25, thinking: true, tier: 'flagship' },
    { id: 'claude-sonnet-4-6', provider: 'anthropic', label: 'Claude Sonnet 4.6', inputUsdPerMillionTokens: 3, outputUsdPerMillionTokens: 15, thinking: true, tier: 'mid' },
    { id: 'claude-haiku-4-5', provider: 'anthropic', label: 'Claude Haiku 4.5', inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 5, tier: 'budget' },
    { id: 'claude-opus-4-5', provider: 'anthropic', label: 'Claude Opus 4.5', inputUsdPerMillionTokens: 10, outputUsdPerMillionTokens: 30, thinking: true, tier: 'flagship' },
    { id: 'claude-sonnet-4-5', provider: 'anthropic', label: 'Claude Sonnet 4.5', inputUsdPerMillionTokens: 3, outputUsdPerMillionTokens: 15, thinking: true, tier: 'mid' },
  ];
}

/**
 * Classify any registry model (static or live-discovered) into a pricing
 * tier. Static entries carry their own tier; discovered models (which
 * usually lack pricing) are classified by id prefix.
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

export function invalidateCache() {
  cache = null;
  cacheTimestamp = 0;
}

export async function resolveModel(modelId) {
  const models = await discoverAllModels();
  const found = models.find((m) => m.id === modelId);
  if (found) return found;

  const staticModels = getAnthropicStaticModels();
  const staticFound = staticModels.find((m) => m.id === modelId);
  if (staticFound) return staticFound;

  const provider = inferProvider(modelId);
  if (provider) {
    return { id: modelId, provider, label: modelId, inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0 };
  }

  return null;
}

export function inferProvider(modelId) {
  if (modelId.startsWith('ollama/')) return 'ollama';
  if (modelId.startsWith('openrouter/')) return 'openrouter';
  if (modelId.startsWith('lmstudio/')) return 'lmstudio';
  if (modelId.startsWith('copilot/')) return 'github-copilot';
  if (modelId.startsWith('accounts/fireworks/')) return 'fireworks';
  return null;
}

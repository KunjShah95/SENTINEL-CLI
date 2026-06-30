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

async function discoverOllama() {
  const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const data = await fetchJson(`${host}/api/tags`);
  if (!data?.models) return [];
  return data.models.map((m) => ({
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
    { id: 'llama-3.1-8b-instant', provider: 'groq', label: 'Llama 3.1 8B Instant (Groq)', inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0 },
    { id: 'gemma2-9b-it', provider: 'groq', label: 'Gemma 9B (Groq)', inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0 },
    { id: 'mixtral-8x7b-32768', provider: 'groq', label: 'Mixtral 8x7B (Groq)', inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0 },
    { id: 'qwen-qwq-32b', provider: 'groq', label: 'Qwen QwQ 32B (Groq)', inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0 },
    { id: 'claude-sonnet-4-6', provider: 'anthropic', label: 'Claude Sonnet 4.6', inputUsdPerMillionTokens: 3, outputUsdPerMillionTokens: 15 },
    { id: 'claude-haiku-4-5', provider: 'anthropic', label: 'Claude Haiku 4.5', inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 5 },
    { id: 'gpt-4o-mini', provider: 'openai', label: 'GPT-4o mini', inputUsdPerMillionTokens: 0.15, outputUsdPerMillionTokens: 0.6 },
    { id: 'mistral-small-latest', provider: 'mistral', label: 'Mistral Small', inputUsdPerMillionTokens: 0.1, outputUsdPerMillionTokens: 0.3 },
  ];
}

function getAnthropicStaticModels() {
  return [
    { id: 'claude-opus-4-6', provider: 'anthropic', label: 'Claude Opus 4.6', inputUsdPerMillionTokens: 5, outputUsdPerMillionTokens: 25, thinking: true },
    { id: 'claude-sonnet-4-6', provider: 'anthropic', label: 'Claude Sonnet 4.6', inputUsdPerMillionTokens: 3, outputUsdPerMillionTokens: 15, thinking: true },
    { id: 'claude-haiku-4-5', provider: 'anthropic', label: 'Claude Haiku 4.5', inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 5 },
    { id: 'claude-opus-4-5', provider: 'anthropic', label: 'Claude Opus 4.5', inputUsdPerMillionTokens: 10, outputUsdPerMillionTokens: 30, thinking: true },
    { id: 'claude-sonnet-4-5', provider: 'anthropic', label: 'Claude Sonnet 4.5', inputUsdPerMillionTokens: 3, outputUsdPerMillionTokens: 15, thinking: true },
  ];
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

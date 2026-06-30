/**
 * Model registry — dynamically discovers available models from provider APIs.
 *
 * On first load, uses a minimal fallback list of free open-source models.
 * Call `refreshModels()` to discover all available models from provider APIs.
 * This handles new model releases, deprecation, and user-specific entitlements.
 *
 * Free open-source models are the default. Paid models are available when
 * the user connects their subscription via API key.
 */

import { discoverAllModels, getFallbackModels, inferProvider as discoverInferProvider } from './discovery.js';

export const USD_PER_CREDIT = 0.01;

export const SupportedProvider = Object.freeze({
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai',
  GOOGLE: 'google',
  GROQ: 'groq',
  MISTRAL: 'mistral',
  DEEPSEEK: 'deepseek',
  XAI: 'xai',
  TOGETHER: 'together',
  FIREWORKS: 'fireworks',
  OPENROUTER: 'openrouter',
  OLLAMA: 'ollama',
  LMSTUDIO: 'lmstudio',
  PERPLEXITY: 'perplexity',
  GITHUB_COPILOT: 'github-copilot',
});

let _refreshPromise = null;

const fallback = getFallbackModels();
export const SUPPORTED_CHAT_MODELS = fallback.slice();

function setModels(models) {
  SUPPORTED_CHAT_MODELS.length = 0;
  SUPPORTED_CHAT_MODELS.push(...models);
}

export const DEFAULT_CHAT_MODEL_ID = 'llama-3.1-8b-instant';

export async function refreshModels() {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    try {
      const discovered = await discoverAllModels();
      if (discovered && discovered.length > 0) {
        setModels(discovered);
      }
    } catch {
      // keep fallback
    }
    _refreshPromise = null;
  })();
  return _refreshPromise;
}

export function invalidateModelCache() {
  setModels(getFallbackModels());
}

export function findSupportedChatModel(modelId) {
  return SUPPORTED_CHAT_MODELS.find((m) => m.id === modelId) || null;
}

const CAPABILITY_RANK = {
  'claude-opus': 10, 'claude-sonnet': 8, 'claude-haiku': 5,
  'gpt-4o': 9, 'gpt-4': 7, 'gpt-4o-mini': 5,
  'o1': 10, 'o3': 10,
  'deepseek-reasoner': 9, 'deepseek-chat': 7,
  'qwen-qwq': 8, 'qwen': 6,
  'llama-3.3': 8, 'llama-3.2': 6, 'llama-3.1': 7,
  'mixtral': 7, 'mistral-large': 8, 'mistral-small': 5,
  'gemma': 5, 'gemini-2.0': 9, 'gemini': 7,
  'grok': 7,
  'codestral': 6,
};

function getModelCapability(model) {
  for (const [prefix, rank] of Object.entries(CAPABILITY_RANK)) {
    if (model.id.startsWith(prefix) || model.label.toLowerCase().includes(prefix)) {
      return rank;
    }
  }
  return 1;
}

export function getRankedModels() {
  return [...SUPPORTED_CHAT_MODELS].sort((a, b) => {
    const aFree = (a.inputUsdPerMillionTokens || 0) + (a.outputUsdPerMillionTokens || 0) === 0 ? 0 : 1;
    const bFree = (b.inputUsdPerMillionTokens || 0) + (b.outputUsdPerMillionTokens || 0) === 0 ? 0 : 1;
    if (aFree !== bFree) return aFree - bFree;
    const aThinking = a.thinking ? 1 : 0;
    const bThinking = b.thinking ? 1 : 0;
    if (aThinking !== bThinking) return bThinking - aThinking;
    const aCap = getModelCapability(a);
    const bCap = getModelCapability(b);
    if (aCap !== bCap) return bCap - aCap;
    return a.provider.localeCompare(b.provider);
  });
}

// Local providers run on the user's machine (no API key, no signup). They are
// "available" purely by being installed/running: discovery only returns their
// models when the local daemon actually answered, so a model's presence in the
// registry is itself proof the provider is reachable.
export const LOCAL_PROVIDERS = Object.freeze(new Set(['ollama', 'lmstudio']));

export function isLocalProvider(provider) {
  return LOCAL_PROVIDERS.has(provider);
}

/**
 * A provider is available if it's local (Ollama/LM Studio detected via its
 * running daemon) OR an API key is set in the environment.
 */
export function isProviderAvailable(provider) {
  if (isLocalProvider(provider)) return true;
  return !!process.env[getEnvKeyForProvider(provider)];
}

export function autoSelectBestModel() {
  const ranked = getRankedModels();
  if (ranked.length === 0) return DEFAULT_CHAT_MODEL_ID;
  for (const m of ranked) {
    if (isProviderAvailable(m.provider)) return m.id;
  }
  return ranked[0].id;
}

function getEnvKeyForProvider(provider) {
  const map = {
    groq: 'GROQ_API_KEY', openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY',
    google: 'GEMINI_API_KEY', mistral: 'MISTRAL_API_KEY', deepseek: 'DEEPSEEK_API_KEY',
    xai: 'XAI_API_KEY', together: 'TOGETHER_API_KEY', fireworks: 'FIREWORKS_API_KEY',
    perplexity: 'PERPLEXITY_API_KEY', openrouter: 'OPENROUTER_API_KEY',
    'github-copilot': 'GITHUB_TOKEN', ollama: 'OLLAMA_HOST', lmstudio: 'LMSTUDIO_HOST',
  };
  return map[provider] || '';
}

export function inferProviderFromModelId(modelId) {
  return discoverInferProvider(modelId);
}

export function isSupportedChatModel(modelId) {
  if (findSupportedChatModel(modelId) !== null) return true;
  return discoverInferProvider(modelId) !== null;
}

export function getBareModelId(modelId) {
  for (const prefix of ['ollama/', 'openrouter/', 'lmstudio/']) {
    if (modelId.startsWith(prefix)) return modelId.slice(prefix.length);
  }
  return modelId;
}

export function getProviderOptions(modelId) {
  const model = findSupportedChatModel(modelId);
  if (!model) return undefined;
  const opts = {};
  if (model.provider === SupportedProvider.ANTHROPIC && model.thinking) {
    opts.anthropic = { thinking: { type: 'enabled', budgetTokens: 10000 } };
  }
  if (model.provider === SupportedProvider.OPENAI && model.thinking) {
    opts.openai = { thinking: { reasoningSummary: 'detailed' } };
  }
  return Object.keys(opts).length > 0 ? opts : undefined;
}

export async function applyModelOverrides(modelId, baseOptions) {
  const model = findSupportedChatModel(modelId);
  if (!model) return baseOptions;
  const { loadModelConfig } = await import('./prefs.js');
  const overrides = await loadModelConfig(model.provider, model.id);
  if (!overrides) return baseOptions;
  return {
    ...baseOptions,
    ...overrides.options,
    provider: {
      ...baseOptions?.provider,
      ...overrides.options?.provider,
    },
  };
}

export function getModelPricing(modelId) {
  const bare = getBareModelId(modelId);
  const model = findSupportedChatModel(bare);
  if (!model) {
    return {
      provider: discoverInferProvider(modelId) || 'unknown',
      modelId,
      inputUsdPerMillionTokens: 0,
      outputUsdPerMillionTokens: 0,
    };
  }
  return {
    provider: model.provider,
    modelId: model.id,
    inputUsdPerMillionTokens: model.inputUsdPerMillionTokens || 0,
    outputUsdPerMillionTokens: model.outputUsdPerMillionTokens || 0,
  };
}

export function estimateCostUsd({ inputTokens, outputTokens }, pricing) {
  if (!pricing) throw new Error('Pricing required');
  const input = (inputTokens / 1_000_000) * pricing.inputUsdPerMillionTokens;
  const output = (outputTokens / 1_000_000) * pricing.outputUsdPerMillionTokens;
  return input + output;
}

export function convertUsdToCredits(estimatedCostUsd) {
  if (estimatedCostUsd <= 0) return 0;
  return Math.max(1, Math.ceil(estimatedCostUsd / USD_PER_CREDIT));
}

export function calculateCreditsForUsage({ provider, model, usage }) {
  if (!usage) throw new Error('usage is required');
  if (!Number.isFinite(usage.inputTokens) || !Number.isFinite(usage.outputTokens)) {
    throw new Error('Credit conversion requires input and output token counts');
  }
  if (usage.inputTokens < 0 || usage.outputTokens < 0) {
    throw new Error('Token counts must be non-negative');
  }
  const pricing = getModelPricing(model);
  if (pricing.provider !== provider) {
    throw new Error(`Unsupported billing provider: ${provider}`);
  }
  const cost = estimateCostUsd(
    { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
    pricing
  );
  return { credits: convertUsdToCredits(cost) };
}

const SMALL_MODEL_FALLBACKS = [
  'llama-3.1-8b-instant', 'gemma2-9b-it', 'claude-haiku-4-5',
  'gpt-4o-mini', 'mistral-small-latest',
];

export async function resolveSmallModel(preferredId) {
  if (preferredId) {
    const found = findSupportedChatModel(preferredId);
    if (found) return resolveChatModel(found.id);
  }
  const { loadSmallModel } = await import('./prefs.js');
  const saved = await loadSmallModel();
  if (saved) {
    const found = findSupportedChatModel(saved);
    if (found) return resolveChatModel(found.id);
  }
  const model = findSupportedChatModel(DEFAULT_CHAT_MODEL_ID);
  if (model && (model.inputUsdPerMillionTokens || 0) <= 1) {
    return resolveChatModel(model.id);
  }
  for (const fallback of SMALL_MODEL_FALLBACKS) {
    const found = findSupportedChatModel(fallback);
    if (found) return resolveChatModel(found.id);
  }
  return resolveChatModel(DEFAULT_CHAT_MODEL_ID);
}

export function resolveChatModel(modelId) {
  const model = findSupportedChatModel(modelId);
  if (model) {
    return {
      modelId: model.id,
      provider: model.provider,
      providerOptions: getProviderOptions(modelId),
      label: model.label,
    };
  }
  const inferredProvider = discoverInferProvider(modelId);
  if (inferredProvider) {
    return {
      modelId,
      provider: inferredProvider,
      providerOptions: undefined,
      label: modelId,
    };
  }
  throw new Error(`Unsupported model: ${modelId}`);
}

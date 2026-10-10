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

import { discoverAllModels, getFallbackModels, inferProvider as discoverInferProvider, getModelTier } from './discovery.js';
import {
  CONNECTOR_IDS,
  getConnectorEnvVar,
  getConnectorKeyPrefix,
  isLocalConnector,
} from '../connectors/registry.js';
import { isConnectedSync } from '../connectors/credentials.js';

export { getModelTier };

export const USD_PER_CREDIT = 0.01;

/**
 * Provider constants, derived from the registry rather than restated.
 *
 * This object used to be a hand-written list of the same fourteen ids the
 * registry also knew about. `CEREBRAS` and the rest now appear automatically,
 * and the derived form means a connector cannot exist without a constant here.
 * Key shape is preserved (`GITHUB_COPILOT`, not `GITHUB-COPILOT`) because
 * call sites destructure `SupportedProvider.ANTHROPIC`.
 */
export const SupportedProvider = Object.freeze(
  Object.fromEntries(
    CONNECTOR_IDS.map((id) => [id.toUpperCase().replace(/-/g, '_'), id])
  )
);

let _refreshPromise = null;
let _refreshOptions = null;

const fallback = getFallbackModels();
export const SUPPORTED_CHAT_MODELS = fallback.slice();

function setModels(models) {
  SUPPORTED_CHAT_MODELS.length = 0;
  SUPPORTED_CHAT_MODELS.push(...models);
}

export const DEFAULT_CHAT_MODEL_ID = 'openai/gpt-oss-20b';

/**
 * Populate `SUPPORTED_CHAT_MODELS` from every reachable connector.
 *
 * The in-flight promise is shared, but only among callers that asked for the
 * same view. Mixing a connected-only refresh with an `--all` refresh into one
 * memo would mean whichever finished last wins, and `sentinel models --all`
 * could leave the TUI's registry holding models the user cannot call — which
 * then get selected by `autoSelectBestModel` and fail mid-turn.
 *
 * @param {{includeUnconnected?: boolean}} [options]
 */
export async function refreshModels(options = {}) {
  if (_refreshPromise && _refreshOptions?.includeUnconnected === !!options.includeUnconnected) {
    return _refreshPromise;
  }
  const includeUnconnected = !!options.includeUnconnected;
  const promise = (async () => {
    try {
      const discovered = await discoverAllModels({ includeUnconnected });
      if (discovered && discovered.length > 0) {
        setModels(discovered);
      }
    } catch {
      // keep fallback
    }
  })().finally(() => {
    if (_refreshPromise === promise) {
      _refreshPromise = null;
      _refreshOptions = null;
    }
  });
  _refreshPromise = promise;
  _refreshOptions = { includeUnconnected };
  return promise;
}

export function invalidateModelCache() {
  setModels(getFallbackModels());
}

export function findSupportedChatModel(modelId) {
  return SUPPORTED_CHAT_MODELS.find((m) => m.id === modelId) || null;
}

const CAPABILITY_RANK = {
  'claude-opus': 10, 'claude-sonnet': 8, 'claude-haiku': 5,
  'gpt-6-astra': 10, 'gpt-6-sol': 9, 'gpt-6-luna': 7,
  'gpt-4o': 9, 'gpt-4': 7, 'gpt-4o-mini': 5,
  'o1': 10, 'o3': 10,
  'deepseek-reasoner': 9, 'deepseek-chat': 7, 'deepseek-v4': 9,
  'qwen-qwq': 8, 'qwen': 6,
  'llama-3.3': 8, 'llama-3.2': 6, 'llama-3.1': 7, 'muse-spark': 8,
  'mixtral': 7, 'mistral-large': 8, 'mistral-small': 5,
  'gemma': 5, 'gemini-3.8': 9, 'gemini-2.0': 9, 'gemini': 7,
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
    // Ollama cloud models list at $0 but are metered, so they rank as paid.
    const aFree = (a.inputUsdPerMillionTokens || 0) + (a.outputUsdPerMillionTokens || 0) === 0 && !isOllamaCloudModel(a) ? 0 : 1;
    const bFree = (b.inputUsdPerMillionTokens || 0) + (b.outputUsdPerMillionTokens || 0) === 0 && !isOllamaCloudModel(b) ? 0 : 1;
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
  return isLocalConnector(provider);
}

/**
 * A provider is available if it's local (Ollama/LM Studio detected via its
 * running daemon) OR a credential exists for it.
 *
 * Credential resolution is delegated to the store, which checks
 * `~/.sentinel/auth.json` before `process.env`. That ordering is the fix for a
 * real bug: this used to read only `process.env`, so a key saved via
 * `sentinel connect` made every paid model look unreachable and the ranking
 * below silently fell through to a free local model.
 */
export function isProviderAvailable(provider) {
  if (isLocalProvider(provider)) return true;
  return isConnectedSync(provider);
}

/**
 * Ollama `:cloud` / `-cloud` tags are proxied to ollama.com and metered on the
 * account, even though discovery lists them at $0 like a local model.
 */
export function isOllamaCloudModel(model) {
  return model?.provider === 'ollama' && /[:-]cloud$/i.test(String(model.id || ''));
}

export function autoSelectBestModel() {
  const ranked = getRankedModels();
  if (ranked.length === 0) return DEFAULT_CHAT_MODEL_ID;
  // Never auto-pick a metered cloud model while a truly local one is installed:
  // on a free Ollama account the first turn would fail with HTTP 402.
  const available = ranked.filter((m) => isProviderAvailable(m.provider));
  const pick = available.find((m) => !isOllamaCloudModel(m)) || available[0];
  return pick ? pick.id : ranked[0].id;
}

/** The env var a provider reads, for setup hints. Registry-owned. */
export function getEnvKeyForProvider(provider) {
  return getConnectorEnvVar(provider);
}

export function inferProviderFromModelId(modelId) {
  return discoverInferProvider(modelId);
}

export function isSupportedChatModel(modelId) {
  if (findSupportedChatModel(modelId) !== null) return true;
  return discoverInferProvider(modelId) !== null;
}

/**
 * Strip the registry namespace off a model id, leaving the bare id the vendor
 * expects on the wire.
 *
 * Prefix list comes from the registry, plus one special case. Fireworks returns
 * ids shaped `accounts/fireworks/<model>`, a *vendor* namespace that arrives
 * inside the id from the wire rather than a connector prefix. The old
 * hardcoded list knew about `copilot/` and `lmstudio/` but not that one, so a
 * Fireworks model was recognised as belonging to Fireworks by `inferProvider`
 * and then sent to the API still wearing the namespace. It came back as a 404
 * attributed to a credential problem, because the error formatter only knew
 * how to talk about keys.
 */
export function getBareModelId(modelId) {
  if (typeof modelId !== 'string') return modelId;
  if (modelId.startsWith('accounts/fireworks/')) return modelId.slice('accounts/fireworks/'.length);
  for (const id of CONNECTOR_IDS) {
    const prefix = getConnectorKeyPrefix(id);
    if (prefix && modelId.startsWith(prefix)) return modelId.slice(prefix.length);
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
  'openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'claude-haiku-4-5',
  'gpt-4o-mini', 'mistral-small-latest', 'gpt-6-luna',
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

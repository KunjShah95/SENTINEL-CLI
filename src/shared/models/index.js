/**
 * Model registry — supported chat models, provider options, pricing, and
 * credit-conversion math. Mirrors packages/shared/src/models.ts from Nightcode.
 *
 * Sentinel already supports more providers (openai, anthropic, gemini, groq,
 * ollama, openrouter) than Nightcode, so this registry is the union with
 * the parity-only set used by the AI coding agent chat.
 */

export const USD_PER_CREDIT = 0.01;

export const SupportedProvider = Object.freeze({
  ANTHROPIC: "anthropic",
  OPENAI: "openai",
  GOOGLE: "google",
  GROQ: "groq",
  MISTRAL: "mistral",
  DEEPSEEK: "deepseek",
  XAI: "xai",
  TOGETHER: "together",
  FIREWORKS: "fireworks",
  OPENROUTER: "openrouter",
  OLLAMA: "ollama",
  LMSTUDIO: "lmstudio",
  PERPLEXITY: "perplexity",
});

/**
 * @typedef {Object} ChatModelDefinition
 * @property {string} id
 * @property {keyof typeof SupportedProvider} provider
 * @property {number} inputUsdPerMillionTokens
 * @property {number} outputUsdPerMillionTokens
 * @property {boolean} [thinking]
 * @property {string} [label]
 */

/** @type {ReadonlyArray<ChatModelDefinition>} */
export const SUPPORTED_CHAT_MODELS = Object.freeze([
  // Anthropic
  { id: "claude-opus-4-6", provider: SupportedProvider.ANTHROPIC, inputUsdPerMillionTokens: 5, outputUsdPerMillionTokens: 25, thinking: true, label: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-6", provider: SupportedProvider.ANTHROPIC, inputUsdPerMillionTokens: 3, outputUsdPerMillionTokens: 15, thinking: true, label: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-5", provider: SupportedProvider.ANTHROPIC, inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 5, label: "Claude Haiku 4.5" },

  // OpenAI
  { id: "gpt-5.4", provider: SupportedProvider.OPENAI, inputUsdPerMillionTokens: 2.5, outputUsdPerMillionTokens: 15, thinking: true, label: "GPT-5.4" },
  { id: "gpt-5.4-mini", provider: SupportedProvider.OPENAI, inputUsdPerMillionTokens: 0.75, outputUsdPerMillionTokens: 4.5, label: "GPT-5.4 mini" },
  { id: "gpt-5.4-nano", provider: SupportedProvider.OPENAI, inputUsdPerMillionTokens: 0.2, outputUsdPerMillionTokens: 1.25, label: "GPT-5.4 nano" },
  { id: "gpt-4o", provider: SupportedProvider.OPENAI, inputUsdPerMillionTokens: 2.5, outputUsdPerMillionTokens: 10, label: "GPT-4o" },
  { id: "gpt-4o-mini", provider: SupportedProvider.OPENAI, inputUsdPerMillionTokens: 0.15, outputUsdPerMillionTokens: 0.6, label: "GPT-4o mini" },

  // Google
  { id: "gemini-2.5-pro", provider: SupportedProvider.GOOGLE, inputUsdPerMillionTokens: 1.25, outputUsdPerMillionTokens: 10, thinking: true, label: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash", provider: SupportedProvider.GOOGLE, inputUsdPerMillionTokens: 0.3, outputUsdPerMillionTokens: 2.5, label: "Gemini 2.5 Flash" },

  // Groq — ultra-fast inference
  { id: "llama-3.3-70b-versatile", provider: SupportedProvider.GROQ, inputUsdPerMillionTokens: 0.59, outputUsdPerMillionTokens: 0.79, label: "Llama 3.3 70B (Groq)" },
  { id: "llama-3.1-8b-instant", provider: SupportedProvider.GROQ, inputUsdPerMillionTokens: 0.05, outputUsdPerMillionTokens: 0.08, label: "Llama 3.1 8B Instant (Groq)" },
  { id: "mixtral-8x7b-32768", provider: SupportedProvider.GROQ, inputUsdPerMillionTokens: 0.24, outputUsdPerMillionTokens: 0.24, label: "Mixtral 8x7B (Groq)" },
  { id: "gemma2-9b-it", provider: SupportedProvider.GROQ, inputUsdPerMillionTokens: 0.20, outputUsdPerMillionTokens: 0.20, label: "Gemma2 9B (Groq)" },
  { id: "qwen-qwq-32b", provider: SupportedProvider.GROQ, inputUsdPerMillionTokens: 0.29, outputUsdPerMillionTokens: 0.39, thinking: true, label: "Qwen QwQ 32B (Groq)" },

  // Mistral — strong European models + Codestral for code
  { id: "mistral-large-latest", provider: SupportedProvider.MISTRAL, inputUsdPerMillionTokens: 2.0, outputUsdPerMillionTokens: 6.0, label: "Mistral Large" },
  { id: "codestral-latest", provider: SupportedProvider.MISTRAL, inputUsdPerMillionTokens: 0.3, outputUsdPerMillionTokens: 0.9, label: "Codestral (Mistral)" },
  { id: "mistral-small-latest", provider: SupportedProvider.MISTRAL, inputUsdPerMillionTokens: 0.1, outputUsdPerMillionTokens: 0.3, label: "Mistral Small" },
  { id: "open-mistral-nemo", provider: SupportedProvider.MISTRAL, inputUsdPerMillionTokens: 0.15, outputUsdPerMillionTokens: 0.15, label: "Mistral Nemo" },

  // DeepSeek — strong reasoning, very cheap
  { id: "deepseek-chat", provider: SupportedProvider.DEEPSEEK, inputUsdPerMillionTokens: 0.27, outputUsdPerMillionTokens: 1.1, label: "DeepSeek V3" },
  { id: "deepseek-reasoner", provider: SupportedProvider.DEEPSEEK, inputUsdPerMillionTokens: 0.55, outputUsdPerMillionTokens: 2.19, thinking: true, label: "DeepSeek R1 (Reasoner)" },

  // xAI / Grok — very large context, fast
  { id: "grok-3", provider: SupportedProvider.XAI, inputUsdPerMillionTokens: 3.0, outputUsdPerMillionTokens: 15.0, label: "Grok 3 (xAI)" },
  { id: "grok-3-mini", provider: SupportedProvider.XAI, inputUsdPerMillionTokens: 0.3, outputUsdPerMillionTokens: 0.5, thinking: true, label: "Grok 3 Mini (xAI)" },

  // Together AI — fast open-source inference
  { id: "meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo", provider: SupportedProvider.TOGETHER, inputUsdPerMillionTokens: 0.88, outputUsdPerMillionTokens: 0.88, label: "Llama 3.3 70B (Together)" },
  { id: "Qwen/Qwen2.5-Coder-32B-Instruct", provider: SupportedProvider.TOGETHER, inputUsdPerMillionTokens: 0.8, outputUsdPerMillionTokens: 0.8, label: "Qwen 2.5 Coder 32B (Together)" },
  { id: "deepseek-ai/DeepSeek-V3", provider: SupportedProvider.TOGETHER, inputUsdPerMillionTokens: 1.25, outputUsdPerMillionTokens: 1.25, label: "DeepSeek V3 (Together)" },

  // Fireworks AI — fastest inference for open models
  { id: "accounts/fireworks/models/deepseek-v3", provider: SupportedProvider.FIREWORKS, inputUsdPerMillionTokens: 0.9, outputUsdPerMillionTokens: 0.9, label: "DeepSeek V3 (Fireworks)" },
  { id: "accounts/fireworks/models/llama-v3p3-70b-instruct", provider: SupportedProvider.FIREWORKS, inputUsdPerMillionTokens: 0.9, outputUsdPerMillionTokens: 0.9, label: "Llama 3.3 70B (Fireworks)" },
  { id: "accounts/fireworks/models/qwen2p5-coder-32b-instruct", provider: SupportedProvider.FIREWORKS, inputUsdPerMillionTokens: 0.9, outputUsdPerMillionTokens: 0.9, label: "Qwen2.5 Coder 32B (Fireworks)" },

  // Perplexity — online search capability
  { id: "llama-3.1-sonar-large-128k-online", provider: SupportedProvider.PERPLEXITY, inputUsdPerMillionTokens: 1.0, outputUsdPerMillionTokens: 1.0, label: "Sonar Large Online (Perplexity)" },
  { id: "llama-3.1-sonar-small-128k-online", provider: SupportedProvider.PERPLEXITY, inputUsdPerMillionTokens: 0.2, outputUsdPerMillionTokens: 0.2, label: "Sonar Small Online (Perplexity)" },

  // OpenRouter — meta-provider routing 200+ models
  { id: "openrouter/auto", provider: SupportedProvider.OPENROUTER, inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0, label: "Auto (OpenRouter)" },
  { id: "openrouter/anthropic/claude-opus-4", provider: SupportedProvider.OPENROUTER, inputUsdPerMillionTokens: 15, outputUsdPerMillionTokens: 75, label: "Claude Opus 4 (OpenRouter)" },
  { id: "openrouter/google/gemini-2.5-pro", provider: SupportedProvider.OPENROUTER, inputUsdPerMillionTokens: 1.25, outputUsdPerMillionTokens: 10, label: "Gemini 2.5 Pro (OpenRouter)" },

  // Ollama — fully local, no API key needed
  { id: "ollama/llama3.2", provider: SupportedProvider.OLLAMA, inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0, label: "Llama 3.2 (Ollama)" },
  { id: "ollama/codellama", provider: SupportedProvider.OLLAMA, inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0, label: "CodeLlama (Ollama)" },
  { id: "ollama/qwen2.5-coder", provider: SupportedProvider.OLLAMA, inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0, label: "Qwen2.5 Coder (Ollama)" },
  { id: "ollama/deepseek-coder-v2", provider: SupportedProvider.OLLAMA, inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0, label: "DeepSeek Coder V2 (Ollama)" },
  { id: "ollama/mistral", provider: SupportedProvider.OLLAMA, inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0, label: "Mistral 7B (Ollama)" },

  // LM Studio — local OpenAI-compatible server
  { id: "lmstudio/local-model", provider: SupportedProvider.LMSTUDIO, inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0, label: "Local Model (LM Studio)" },
]);

export const DEFAULT_CHAT_MODEL_ID = "claude-sonnet-4-6";

export function findSupportedChatModel(modelId) {
  return SUPPORTED_CHAT_MODELS.find((m) => m.id === modelId) || null;
}

/** Detect provider from a free-form model ID for dynamic models (Ollama, OpenRouter, LM Studio). */
export function inferProviderFromModelId(modelId) {
  if (modelId.startsWith("ollama/")) return SupportedProvider.OLLAMA;
  if (modelId.startsWith("openrouter/")) return SupportedProvider.OPENROUTER;
  if (modelId.startsWith("lmstudio/")) return SupportedProvider.LMSTUDIO;
  if (modelId.startsWith("accounts/fireworks/")) return SupportedProvider.FIREWORKS;
  return null;
}

export function isSupportedChatModel(modelId) {
  if (findSupportedChatModel(modelId) !== null) return true;
  // Allow dynamic prefixes for local/OpenRouter models
  return inferProviderFromModelId(modelId) !== null;
}

/** Return the bare model ID (strip provider prefix for local/openrouter). */
export function getBareModelId(modelId) {
  for (const prefix of ["ollama/", "openrouter/", "lmstudio/"]) {
    if (modelId.startsWith(prefix)) return modelId.slice(prefix.length);
  }
  return modelId;
}

/**
 * Provider options for streaming. Mirrors packages/server/src/lib/models.ts
 * (the thinking config block).
 */
export function getProviderOptions(modelId) {
  const model = findSupportedChatModel(modelId);
  if (!model) return undefined;
  if (model.provider === SupportedProvider.ANTHROPIC && model.thinking) {
    return {
      anthropic: { thinking: { type: "enabled", budgetTokens: 10000 } },
    };
  }
  if (model.provider === SupportedProvider.OPENAI && model.thinking) {
    return {
      openai: { thinking: { reasoningSummary: "detailed" } },
    };
  }
  return undefined;
}

/**
 * Resolve a model ID to provider name + pricing. Used by the credit math.
 */
export function getModelPricing(modelId) {
  const model = findSupportedChatModel(modelId);
  if (!model) {
    throw new Error(`Unsupported billing model: ${modelId}`);
  }
  return {
    provider: model.provider,
    modelId: model.id,
    inputUsdPerMillionTokens: model.inputUsdPerMillionTokens,
    outputUsdPerMillionTokens: model.outputUsdPerMillionTokens,
  };
}

export function estimateCostUsd({ inputTokens, outputTokens }, pricing) {
  if (!pricing) throw new Error("Pricing required");
  const input = (inputTokens / 1_000_000) * pricing.inputUsdPerMillionTokens;
  const output = (outputTokens / 1_000_000) * pricing.outputUsdPerMillionTokens;
  return input + output;
}

export function convertUsdToCredits(estimatedCostUsd) {
  if (estimatedCostUsd <= 0) return 0;
  return Math.max(1, Math.ceil(estimatedCostUsd / USD_PER_CREDIT));
}

/**
 * Calculate credits to bill for a given usage object. Mirrors
 * `calculateCreditsForUsage` in Nightcode's credits.ts.
 * @param {{ provider: string, model: string, usage: { inputTokens: number, outputTokens: number } }} args
 */
export function calculateCreditsForUsage({ provider, model, usage }) {
  if (!usage) throw new Error("usage is required");
  if (!Number.isFinite(usage.inputTokens) || !Number.isFinite(usage.outputTokens)) {
    throw new Error("Credit conversion requires input and output token counts");
  }
  if (usage.inputTokens < 0 || usage.outputTokens < 0) {
    throw new Error("Token counts must be non-negative");
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

/**
 * Pick the underlying SDK function for a model. We don't import the AI SDK
 * provider packages here so this file stays cheap to load — callers wire
 * the actual SDK invocation. This is a soft resolver used by the server.
 */
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
  // Handle dynamic model IDs (ollama/*, openrouter/*, lmstudio/*, fireworks/*)
  const inferredProvider = inferProviderFromModelId(modelId);
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

import { isProviderAvailable, getRankedModels, DEFAULT_CHAT_MODEL_ID } from '../models/index.js';

export const ComplexityTiers = {
  PLANNING: 'planning',     // Multi-step task planning & dependencies
  GEN_CODE: 'gen_code',     // Multi-file code generation
  SIMPLE_FIX: 'simple_fix', // Single-file type, syntax, lint patching
  SUMMARY: 'summary',       // Context compression and token compaction
};

export class ModelRouter {
  /**
   * Resolves the best available and configured model for a given task complexity tier.
   * Falls back gracefully to free open-source models (like Groq) if premium ones are unavailable.
   * 
   * @param {string} complexityTier - A value from ComplexityTiers
   * @returns {object} Resolves to { provider, modelId }
   */
  static resolveModelForTier(complexityTier) {
    const ranked = getRankedModels();

    // Helper to find the first available model matching a set of preferred ids/providers
    const findAvailable = (preferredIds, preferredProviders = []) => {
      // 1. Try exact matches on preferred model IDs
      for (const id of preferredIds) {
        const model = ranked.find(m => m.id === id);
        if (model && isProviderAvailable(model.provider)) {
          return { provider: model.provider, modelId: model.id };
        }
      }

      // 2. Try matching preferred providers
      for (const provider of preferredProviders) {
        const model = ranked.find(m => m.provider === provider);
        if (model && isProviderAvailable(provider)) {
          return { provider, modelId: model.id };
        }
      }

      return null;
    };

    let selection = null;

    switch (complexityTier) {
      case ComplexityTiers.PLANNING:
        // Deep reasoning and planning preference: o1/o3, Claude 3.5 Sonnet, GPT-4o
        selection = findAvailable(
          ['claude-3-5-sonnet', 'o1-preview', 'o1-mini', 'gpt-4o', 'deepseek-reasoner'],
          ['anthropic', 'openai', 'deepseek']
        );
        break;

      case ComplexityTiers.GEN_CODE:
        // Coding capability preference: Claude 3.5 Sonnet, GPT-4o, Llama 3.3 70B, Qwen QWQ
        selection = findAvailable(
          ['claude-3-5-sonnet', 'gpt-4o', 'qwen-qwq-32b', 'llama-3.3-70b-specdec'],
          ['anthropic', 'openai', 'groq', 'deepseek']
        );
        break;

      case ComplexityTiers.SIMPLE_FIX:
        // Speed and mid-tier capability preference: Gemini Flash, GPT-4o-mini, Llama 3.3, Claude Haiku
        selection = findAvailable(
          ['gemini-2.0-flash', 'gpt-4o-mini', 'claude-3-5-haiku', 'llama-3.3-70b-specdec'],
          ['google', 'openai', 'anthropic', 'groq']
        );
        break;

      case ComplexityTiers.SUMMARY:
        // High speed, low cost preference: Groq Llama 8B, Gemini Flash, GPT-4o-mini
        selection = findAvailable(
          ['llama-3.1-8b-instant', 'gemini-2.0-flash', 'gpt-4o-mini'],
          ['groq', 'google', 'openai']
        );
        break;
    }

    // Default fallback: find the best overall configured model, or return static default
    if (!selection) {
      for (const m of ranked) {
        if (isProviderAvailable(m.provider)) {
          return { provider: m.provider, modelId: m.id };
        }
      }
      return { provider: 'groq', modelId: DEFAULT_CHAT_MODEL_ID };
    }

    return selection;
  }
}

export default ModelRouter;

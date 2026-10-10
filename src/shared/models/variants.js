/**
 * Model variants — named effort presets for the same model.
 *
 * ## Why
 *
 * `getProviderOptions` hardcoded `budgetTokens: 10000` for any Anthropic model
 * flagged as reasoning-capable. Ten thousand tokens is a guess: it is far too
 * much for a "rename this variable" request and far too little for a hard
 * architectural decision. The user had no way to change it short of hand-editing
 * `preferences.json` with a schema they had to read the source to learn.
 *
 * A variant is a named effort level. `claude-sonnet-4-5#high` and
 * `claude-sonnet-4-5#fast` are the same model at different reasoning budgets, so
 * switching effort is not a context switch and does not lose the thread.
 *
 * ## Where the presets come from
 *
 * models.dev publishes `reasoning_options` per model, including the minimum
 * budget the API accepts. Anthropic rejects `budgetTokens` below 1024 with a 400
 * that reads like a malformed request, which is indistinguishable from a real
 * one until you have read the docs. `reasoning_options` is carried through the
 * catalog conversion so the floor is enforced here instead of at the wire.
 *
 * ## Why variants are explicit
 *
 * Effort changes price. Doubling `budgetTokens` on a long-horizon task can
 * multiply output cost, because the budget is spent whether or not the model
 * needs it. So a variant never applies implicitly, and the chosen name is
 * reported back on the model label so cost records stay explainable.
 */
import { findSupportedChatModel, getProviderOptions } from './index.js';
import { loadSmallModel } from './prefs.js';

/** Effort levels, cheapest first. */
export const VARIANT = Object.freeze({
  OFF: 'off',
  FAST: 'fast',
  STANDARD: 'standard',
  HIGH: 'high',
  MAX: 'max',
});

/**
 * Reasoning token budget per level.
 *
 * `max` is bounded by the model's own output limit, checked against the catalog
 * when it is known — Anthropic rejects a thinking budget larger than `max_tokens`
 * with a 400, so an unbounded `max` is a request that fails at full price.
 */
export const BUDGETS = Object.freeze({
  [VARIANT.OFF]: 0,
  [VARIANT.FAST]: 2048,
  [VARIANT.STANDARD]: 8192,
  [VARIANT.HIGH]: 16384,
  [VARIANT.MAX]: 32000,
});

/** Suffix that selects a variant inline, e.g. `claude-sonnet-4-5#high`. */
const SEPARATOR = '#';

export function isVariantName(name) {
  return Object.hasOwn(BUDGETS, name);
}

/** Parse `model#variant` into its parts. A bare id yields a null variant. */
export function parseVariant(spec) {
  const raw = String(spec || '');
  const at = raw.lastIndexOf(SEPARATOR);
  if (at <= 0) return { modelId: raw, variant: null };
  const tail = raw.slice(at + 1);
  if (!isVariantName(tail)) return { modelId: raw, variant: null };
  return { modelId: raw.slice(0, at), variant: tail };
}

/**
 * Resolve a model id that may carry a variant suffix.
 *
 * `resolveChatModel` rejects `claude-sonnet-4-5#high` today, which is why an
 * inline variant is stripped before resolution and re-applied by the caller.
 */
export function resolveVariantModel(spec) {
  const { modelId, variant } = parseVariant(spec);
  return { ...(findSupportedChatModel(modelId) ? { modelId, variant } : { modelId, variant: null }), raw: spec };
}

/** Does this model actually support a reasoning budget? */
export function supportsThinking(modelId) {
  const model = findSupportedChatModel(modelId);
  if (!model) return false;
  return model.thinking === true;
}

/**
 * Smallest budget the API will accept, from the catalog's `reasoning_options`.
 * Unknown models fall back to Anthropic's documented 1024 floor.
 */
export function minimumBudget(modelId) {
  const model = findSupportedChatModel(modelId);
  const declared = model?.reasoningMinTokens;
  return Number.isFinite(declared) && declared > 0 ? declared : 1024;
}

/** Largest budget the model accepts, from the catalog's output limit. */
export function maximumBudget(modelId) {
  const model = findSupportedChatModel(modelId);
  const cap = model?.outputTokenLimit;
  return Number.isFinite(cap) && cap > 0 ? cap : Infinity;
}

/**
 * Clamp a requested budget into what the model will accept.
 * @returns {{budgetTokens: number, clamped: boolean, reason: string|null}}
 */
export function clampBudget(modelId, requested) {
  const min = minimumBudget(modelId);
  const max = maximumBudget(modelId);
  if (requested < min) return { budgetTokens: min, clamped: true, reason: `below the ${min}-token floor` };
  if (requested > max) return { budgetTokens: max, clamped: true, reason: `above the model's ${max}-token output limit` };
  return { budgetTokens: requested, clamped: false, reason: null };
}

/**
 * Build provider options for a model at a given variant.
 *
 * Returns the base options unchanged when the model does not reason, so this is
 * safe to call unconditionally on the request path.
 */
export function optionsForVariant(modelId, variant) {
  const base = getProviderOptions(modelId);
  if (!variant) return base;
  if (!supportsThinking(modelId)) return base;
  const model = findSupportedChatModel(modelId);

  // `off` must actually turn reasoning off. Returning `base` here would leave
  // the default 10k budget enabled, so asking for the cheapest setting would
  // silently cost the second-most expensive one.
  if (variant === VARIANT.OFF) {
    if (model.provider === 'anthropic') return { anthropic: { thinking: { type: 'disabled', budgetTokens: 0 } } };
    return { openai: { thinking: { reasoningEffort: 'none', reasoningSummary: 'none' } } };
  }

  const { budgetTokens } = clampBudget(modelId, BUDGETS[variant] ?? BUDGETS[VARIANT.STANDARD]);

  if (model.provider === 'anthropic') {
    return { ...base, anthropic: { ...(base?.anthropic || {}), thinking: { type: 'enabled', budgetTokens } } };
  }
  if (model.provider === 'openai') {
    // OpenAI takes an effort enum, not a token count.
    const effort = variant === VARIANT.MAX || variant === VARIANT.HIGH ? 'high'
      : variant === VARIANT.FAST ? 'low' : 'medium';
    return {
      ...base,
      openai: {
        ...(base?.openai || {}),
        thinking: { ...(base?.openai?.thinking || {}), reasoningEffort: effort, reasoningSummary: 'detailed' },
      },
    };
  }
  return base;
}

/** Variants worth offering for a model, cheapest first. */
export function availableVariants(modelId) {
  if (!supportsThinking(modelId)) return [];
  const max = maximumBudget(modelId);
  return Object.values(VARIANT).filter((v) => {
    if (v === VARIANT.OFF) return true;
    return BUDGETS[v] <= max;
  });
}

/**
 * Persist and recall the chosen variant.
 *
 * Stored per model, not globally: `high` for an architectural change and
 * `fast` for a rename are different moments, and a single global setting
 * forces the user to change it back and forth all session.
 */
export async function saveVariant(modelId, variant) {
  const { saveModelVariant } = await import('./prefs.js');
  await saveModelVariant(modelId, variant);
}

export async function loadVariant(modelId, { smallModelFallback = true } = {}) {
  try {
    const { loadModelVariant } = await import('./prefs.js');
    const stored = await loadModelVariant(modelId);
    if (stored && isVariantName(stored)) return stored;
  } catch {
    // fall through to the default
  }
  if (!smallModelFallback) return VARIANT.STANDARD;
  // A cheap model chosen for routing should also run cheap. Defaulting to
  // `high` on the exploration model would quietly undo the point of routing.
  try {
    const small = await loadSmallModel();
    if (small && small === modelId) return VARIANT.FAST;
  } catch {
    // ignore
  }
  return VARIANT.STANDARD;
}

/** A display label that carries the variant, for cost records and the picker. */
export function variantLabel(modelId, variant) {
  return variant && variant !== VARIANT.STANDARD ? `${modelId}#${variant}` : modelId;
}

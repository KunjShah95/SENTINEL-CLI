/**
 * Cost tracking — turns token usage into USD using the model registry's
 * pricing data. Module-level cumulative totals per model + a session total.
 */
import { getModelPricing, estimateCostUsd } from '../shared/models/index.js';

const perModel = new Map(); // modelId -> { inputTokens, outputTokens, usd }

export function recordUsage(modelId, usage) {
  if (!usage || (!usage.inputTokens && !usage.outputTokens)) return { usd: 0 };
  const pricing = getModelPricing(modelId);
  let usd = 0;
  try {
    usd = estimateCostUsd(usage, pricing);
  } catch {
    usd = 0;
  }
  const entry = perModel.get(modelId) || { inputTokens: 0, outputTokens: 0, usd: 0 };
  entry.inputTokens += usage.inputTokens || 0;
  entry.outputTokens += usage.outputTokens || 0;
  entry.usd += usd;
  perModel.set(modelId, entry);
  return { usd, totals: getTotals() };
}

export function getTotals() {
  let usd = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const e of perModel.values()) {
    usd += e.usd;
    inputTokens += e.inputTokens;
    outputTokens += e.outputTokens;
  }
  return { usd, inputTokens, outputTokens, models: perModel.size };
}

export function resetTotals() {
  perModel.clear();
}

export function formatUsd(n) {
  if (!Number.isFinite(n) || n <= 0) return '$0.0000';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

/** Cheap token estimate when the provider omits usage (~4 chars/token). */
export function estimateTokensFromText(text) {
  return Math.ceil(String(text || '').length / 4);
}

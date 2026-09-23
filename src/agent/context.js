/**
 * Context estimation utilities (pure, dependency-free).
 *
 * Shared by the in-process agent (loop.js) and the TUI compactor
 * (src/tui/lib/context-compactor.ts, which delegates to these functions).
 * Messages carry `parts` shaped like:
 *   { type: 'text' | 'reasoning', text }
 *   { type: 'tool-call', toolName, input, output, errorText }
 */

export const DEFAULT_MAX_TOKENS = 40_000;
export const ASYNC_THRESHOLD = 0.6; // start background compaction
export const SYNC_THRESHOLD = 0.8; // compact before continuing

/**
 * Estimate tokens for a message list (~1 token per 3.8 chars).
 * Mirrors the TUI's estimator so budgets match.
 */
export function estimateTokens(messages = []) {
  let charCount = 0;
  for (const msg of messages) {
    for (const part of msg?.parts || []) {
      if (part?.type === 'text' || part?.type === 'reasoning') {
        charCount += String(part.text || '').length;
      } else if (part?.type === 'tool-call') {
        try {
          charCount += JSON.stringify(part.input).length;
        } catch {
          // ignore
        }
        if (part.output !== undefined) {
          try {
            charCount += JSON.stringify(part.output).length;
          } catch {
            // ignore
          }
        }
        if (part.errorText) charCount += String(part.errorText).length;
      }
    }
  }
  return Math.ceil(charCount / 3.8);
}

export function getCompactionState(messages, options = {}) {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const estimated = estimateTokens(messages);
  const ratio = estimated / maxTokens;
  return {
    estimatedTokens: estimated,
    atAsyncThreshold: ratio >= ASYNC_THRESHOLD,
    atSyncThreshold: ratio >= SYNC_THRESHOLD,
    percentage: Math.min(100, Math.round(ratio * 100)),
  };
}

export function shouldCompact(messages, options = {}) {
  return getCompactionState(messages, options).atAsyncThreshold;
}

export function formatTokenUsage(messages, maxTokens = DEFAULT_MAX_TOKENS) {
  const state = getCompactionState(messages, { maxTokens });
  const remaining = Math.max(0, maxTokens - state.estimatedTokens);
  const fmt = (n) => Number(n).toLocaleString('en-US');
  const warning = state.atSyncThreshold
    ? ' over 80%'
    : state.atAsyncThreshold
      ? ' above 60%'
      : '';
  return `~${fmt(state.estimatedTokens)} tokens used · ${fmt(remaining)} remaining (${fmt(maxTokens)} limit)${warning}`;
}

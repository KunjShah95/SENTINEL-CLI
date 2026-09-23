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

export const MICROCOMPACT_TOMBSTONE = '[microcompacted: superseded by a later identical call]';

/** Deterministic JSON stringify (sorted object keys) for call-identity keys. */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined';
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/** Logical identity of a completed tool call: tool + input, or its call id. */
function toolCallIdentity(part) {
  try {
    return `${part.toolName}:${stableStringify(part.input ?? null)}`;
  } catch {
    return `id:${String(part.toolCallId)}`;
  }
}

/**
 * Microcompact: tombstone stale tool results in place, before summary
 * compaction. A completed result (output-available / output-error) is stale
 * when the same logical call was run again later — same toolName + input,
 * or a duplicate toolCallId. The most recent result of every call is kept
 * verbatim, so the model never loses the freshest observation.
 *
 * Pure and copy-on-write: the input array is never mutated, and untouched
 * messages keep their identity so React state diffing stays cheap.
 *
 * @param {Array}  messages              UI-shaped messages (id/role/parts)
 * @param {object} [options]
 * @param {number} [options.protectLast] don't touch the last N messages
 *        (the compactor's active zone) — defaults to 0
 * @returns {{ messages: Array, droppedCount: number, estimatedTokensSaved: number }}
 */
export function microcompactMessages(messages = [], options = {}) {
  const protectFrom = messages.length - Math.max(0, Math.floor(options.protectLast ?? 0));

  // Pass 1: last completed occurrence per logical call.
  const lastByCall = new Map();
  const lastById = new Map();
  messages.forEach((msg, mi) => {
    (msg?.parts || []).forEach((part, pi) => {
      if (part?.type !== 'tool-call') return;
      if (part.state !== 'output-available' && part.state !== 'output-error') return;
      const ref = { mi, pi };
      lastByCall.set(toolCallIdentity(part), ref);
      lastById.set(String(part.toolCallId), ref);
    });
  });

  const isLatest = (part, mi, pi) => {
    const byCall = lastByCall.get(toolCallIdentity(part));
    const byId = lastById.get(String(part.toolCallId));
    return Boolean(
      byCall && byCall.mi === mi && byCall.pi === pi &&
      byId && byId.mi === mi && byId.pi === pi
    );
  };

  // Pass 2: copy-on-write tombstone of superseded results.
  let droppedCount = 0;
  const next = messages.map((msg, mi) => {
    const parts = msg?.parts;
    if (!Array.isArray(parts) || parts.length === 0) return msg;
    let changed = false;
    const nextParts = parts.map((part, pi) => {
      if (part?.type !== 'tool-call') return part;
      if (part.state !== 'output-available' && part.state !== 'output-error') return part;
      if (mi >= protectFrom) return part;
      if (isLatest(part, mi, pi)) return part;
      // Errored results are always stale once re-run (the error misleads the
      // model); successful ones only when the tombstone actually shrinks them.
      if (part.state === 'output-available') {
        let resultLen = 0;
        try {
          resultLen = part.output === undefined ? 0 : JSON.stringify(part.output).length;
        } catch {
          resultLen = 0;
        }
        if (resultLen <= MICROCOMPACT_TOMBSTONE.length) return part;
      }
      changed = true;
      droppedCount += 1;
      return {
        ...part,
        state: 'output-available',
        output: MICROCOMPACT_TOMBSTONE,
        errorText: undefined,
      };
    });
    if (!changed) return msg;
    return { ...msg, parts: nextParts };
  });

  if (droppedCount === 0) return { messages, droppedCount: 0, estimatedTokensSaved: 0 };

  return {
    messages: next,
    droppedCount,
    estimatedTokensSaved: Math.max(0, estimateTokens(messages) - estimateTokens(next)),
  };
}

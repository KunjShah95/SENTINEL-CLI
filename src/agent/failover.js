/**
 * Failover chains — a named group of models that try each other in order.
 *
 * ## Why this is not `race`
 *
 * `race.js` runs N models in parallel and keeps the best answer. That is a
 * quality decision and it costs N times the tokens. Failover is a reliability
 * decision: it costs one call, and only spends more when a call *fails*.
 *
 * The motivating case is narrow and common. A provider rate-limits you mid-turn
 * (HTTP 429), or a free tier's credit runs out (HTTP 402), or the socket drops.
 * Today the turn dies with whatever `formatProviderError` produced. With a
 * chain it moves to the next model and the user never sees the failure.
 *
 * ## What counts as worth retrying
 *
 * The classification below is the whole design. Retrying everything is wrong in
 * both directions:
 *
 *   - A malformed request (400) fails identically on every model. Retrying it
 *     three times just triples the latency of an error the user must fix.
 *   - A rate limit or a dead socket is specific to one provider. Retrying is
 *     exactly right.
 *
 * 401 and 403 are treated as retryable because a chain usually spans
 * *connectors*, and a stale key on one of them should not end a turn that a
 * healthy second key could have served. They are reported distinctly so the
 * user learns which connector needs re-auth.
 *
 * ## Chains are opt-in
 *
 * A chain that silently changed models would make cost and quality
 * unreproducible — the same prompt would bill differently run to run. So a
 * switch emits a `failover` event and the active model id is reported in the
 * turn's finish event, which is what `--json` consumers read.
 */
import { resolveChatModel, isProviderAvailable } from '../shared/models/index.js';
import { getConnector } from '../shared/connectors/registry.js';

/** Failure classes that decide whether the chain continues. */
export const REASON = Object.freeze({
  RATE_LIMITED: 'rate-limited',
  OUT_OF_CREDIT: 'out-of-credit',
  SERVER_ERROR: 'server-error',
  NETWORK: 'network',
  AUTH: 'auth',
  UNSUPPORTED: 'unsupported',
  REJECTED: 'rejected',   // the request itself is wrong; stop here
  ABORTED: 'aborted',     // the user cancelled; never fail over
});

/**
 * Classify a provider failure.
 * @param {{status?: number, message?: string}} err
 * @returns {string} one of REASON
 */
export function classifyFailure(err) {
  const message = String(err?.message || '');
  const status = err?.status;

  if (/abort/i.test(message)) return REASON.ABORTED;

  if (typeof status === 'number') {
    if (status === 429) return REASON.RATE_LIMITED;
    // 402 is what a provider returns when a card is declined or a free tier's
    // credit is spent. Ollama Cloud is the common case in practice.
    if (status === 402) return REASON.OUT_OF_CREDIT;
    if (status === 401 || status === 403) return REASON.AUTH;
    if (status === 404) return REASON.UNSUPPORTED;
    if (status >= 500) return REASON.SERVER_ERROR;
    if (status === 400) return REASON.REJECTED;
  }

  // A thrown error with no status is a transport failure: the request never
  // got an answer, so another connector is a genuinely different attempt.
  if (!status) return REASON.NETWORK;
  return REASON.REJECTED;
}

/** Should the chain move on after this reason? */
export function isRetryable(reason) {
  return reason !== REASON.REJECTED && reason !== REASON.ABORTED;
}

/**
 * Resolve a chain spec into an ordered list of models.
 *
 * Accepts a bare group name (`cheap:`), a comma-separated list of model ids,
 * or a list of either. Entries that cannot resolve are dropped with a reason
 * rather than throwing, so one stale id in a config file does not break the
 * chain — it just makes the chain shorter.
 *
 * @returns {{models: Array, skipped: Array<{id: string, why: string}>}}
 */
export function resolveChain(spec) {
  const ids = String(spec || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const models = [];
  const skipped = [];
  for (const id of ids) {
    try {
      const resolved = resolveChatModel(id);
      if (!isProviderAvailable(resolved.provider)) {
        skipped.push({ id, why: `${resolved.provider} not connected` });
        continue;
      }
      models.push(resolved);
    } catch (e) {
      skipped.push({ id, why: e?.message || 'unresolvable' });
    }
  }
  return { models, skipped };
}

/**
 * Load the chain for a model id, if one is configured for it.
 *
 * Configuration lives in `~/.sentinel.yaml`:
 *
 *     failover:
 *       default: gpt-6-luna, claude-haiku-4-5, ollama/qwen3:8b
 *
 * and `SENTINEL_FAILOVER` overrides for one run. `default` applies to any model
 * not named explicitly; a key matching the model id applies to that model only,
 * which is how you give an expensive model a careful chain and a cheap one a
 * throwaway one.
 *
 * Returns `null` when no chain applies, so the caller can skip the machinery
 * entirely on the common path.
 */
export async function loadFailoverChain(modelId) {
  if (process.env.SENTINEL_FAILOVER === 'off') return null;

  let config = {};
  try {
    const { configManager } = await import('../config/configManager.js');
    await configManager.load();
    config = configManager.get('failover', {}) || {};
  } catch {
    config = {};
  }

  const envOverride = process.env.SENTINEL_FAILOVER;
  const spec = (modelId && config[modelId]) || config.default || envOverride || null;
  if (!spec) return null;

  const { models, skipped } = resolveChain(spec);
  // A chain of one is not a chain; it just adds a wasted round trip on failure.
  if (models.length < 2) return null;
  return { models, skipped, modelIds: models.map((m) => m.modelId) };
}

/**
 * Stream one turn, walking the chain when a model fails.
 *
 * The generator buffers nothing and replays nothing: the underlying stream is
 * consumed fresh for each attempt, and an attempt that fails before producing
 * anything leaves the consumer's accumulated state untouched. A failure *after*
 * partial output does not retry — replaying tokens the user already saw would
 * duplicate text on screen, which is worse than an error.
 *
 * @param {object} opts
 * @param {object} opts.model            resolved primary model
 * @param {Array}  [opts.chain]          ordered fallbacks after the primary
 * @param {Function} opts.stream         (attempt) => AsyncIterable of provider events
 * @param {Function} [opts.onFailover]   called with {from, to, reason} on a switch
 */
export async function* streamWithFailover({ model, chain, stream, onFailover }) {
  const attempts = [model, ...(chain || [])].filter(Boolean);
  // Whether the chain actually moved. Set on the terminal error so the UI can
  // say "we already tried your other models and here is why they all failed"
  // rather than the more alarming and untrue "we never tried anything else".
  let switched = false;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    const isLast = i === attempts.length - 1;
    let producedOutput = false;
    // Distinguishes "the attempt failed" from "the attempt ran to completion".
    // Without it, a successful primary falls through to the next attempt and
    // the caller gets every fallback's answer concatenated onto the first.
    let attemptFailed = false;

    try {
      for await (const ev of stream(attempt)) {
        if (ev.type === 'text' && ev.text) producedOutput = true;
        if (ev.type === 'tool_call') producedOutput = true;

        if (ev.type !== 'error') {
          yield ev;
          continue;
        }

        const reason = classifyFailure(ev);

        // Last attempt, or nothing left that a different model could fix.
        if (isLast || !isRetryable(reason) || producedOutput) {
          yield { ...ev, failoverExhausted: switched };
          return;
        }

        attemptFailed = true;
        switched = true;
        const next = attempts[i + 1];
        const fromLabel = describe(attempt);
        const toLabel = describe(next);
        if (onFailover) onFailover({ from: attempt, to: next, reason, fromLabel, toLabel });
        yield {
          type: 'failover',
          reason,
          from: attempt.modelId,
          to: next.modelId,
          message: failMessage(reason, fromLabel, toLabel),
        };
        break; // abandon this attempt and start the next one
      }
      // The stream ran out without an error: this attempt succeeded.
      if (!attemptFailed) return;
    } catch (e) {
      const reason = classifyFailure(e);
      if (isLast || !isRetryable(reason) || producedOutput) throw e;
      const next = attempts[i + 1];
      switched = true;
      if (onFailover) {
        onFailover({ from: attempt, to: next, reason, fromLabel: describe(attempt), toLabel: describe(next) });
      }
      yield {
        type: 'failover',
        reason,
        from: attempt.modelId,
        to: next.modelId,
        message: failMessage(reason, describe(attempt), describe(next)),
      };
    }
  }
}

function describe(model) {
  const conn = getConnector(model.provider);
  return `${model.modelId} (${conn?.label || model.provider})`;
}

function failMessage(reason, from, to) {
  switch (reason) {
  case REASON.RATE_LIMITED: return `${from} is rate limited — falling back to ${to}`;
  case REASON.OUT_OF_CREDIT: return `${from} has no credit left — falling back to ${to}`;
  case REASON.AUTH: return `${from} rejected the credential — falling back to ${to}`;
  case REASON.SERVER_ERROR: return `${from} returned a server error — falling back to ${to}`;
  case REASON.UNSUPPORTED: return `${from} does not serve that model — falling back to ${to}`;
  case REASON.NETWORK: return `${from} was unreachable — falling back to ${to}`;
  default: return `${from} failed (${reason}) — falling back to ${to}`;
  }
}

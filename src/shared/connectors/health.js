/**
 * Connector health — a live probe per connector, not a key-presence check.
 *
 * ## Why "do I have a key" is not a health check
 *
 * `sentinel doctor` currently reports a connector as fine when its env var is
 * set. That answers the wrong question. A key can be set and still be expired,
 * revoked, rate-limited to zero, or pointed at a proxy that 502s. The user gets
 * a green check and then a failed turn.
 *
 * So this probes the thing that will actually be called — the connector's
 * model listing endpoint — and reports what came back. The distinction that
 * matters most:
 *
 *   **out of quota** and **bad credential** both mean "this turn will fail",
 *   and they mean opposite things to the person fixing it. The first is fixed
 *   by upgrading or waiting; the second by re-running `sentinel auth login`.
 *   Collapsing both into "provider error" is why provider outages are so slow
 *   to diagnose. They are classified separately here.
 *
 * This is also what failover wants: a chain can prefer a connector that
 * answered 200 in the last few minutes over one that has been timing out.
 *
 * ## Cost
 *
 * Every connector is probed concurrently with a short timeout, and only
 * connectors with a credential are probed — an unconfigured connector is
 * `absent`, not `unhealthy`. Probing all 22 would be 22 pointless requests and
 * a wall of red.
 */
import { CONNECTOR_IDS, CONNECTORS, getDiscoveryBaseUrl, canDiscoverModels } from './registry.js';
import { resolveCredentialSync } from './credentials.js';

/** Health states. Ordered worst-to-best for sorting. */
export const HEALTH = Object.freeze({
  ABSENT: 'absent',           // no credential; nothing to probe
  UNREACHABLE: 'unreachable', // DNS/TCP/TLS/timeout — the host did not answer
  UNAUTHORIZED: 'unauthorized', // 401/403 — credential rejected
  QUOTA: 'quota',             // 402/429 — real key, cannot serve right now
  UNSUPPORTED: 'unsupported', // 404 — endpoint shape wrong, or model gone
  ERROR: 'error',             // 5xx
  DEGRADED: 'degraded',       // answered, but slowly
  OK: 'ok',
});

const RANK = {
  [HEALTH.OK]: 0,
  [HEALTH.DEGRADED]: 1,
  [HEALTH.UNSUPPORTED]: 2,
  [HEALTH.ERROR]: 3,
  [HEALTH.QUOTA]: 4,
  [HEALTH.UNAUTHORIZED]: 5,
  [HEALTH.UNREACHABLE]: 6,
  [HEALTH.ABSENT]: 7,
};

const DEFAULT_TIMEOUT_MS = 4000;
/** Above this a connector works but is worth noticing. */
const SLOW_MS = 1500;

/** Map an HTTP status onto a health state. */
export function classifyStatus(status) {
  if (status === 401 || status === 403) return HEALTH.UNAUTHORIZED;
  if (status === 402 || status === 429) return HEALTH.QUOTA;
  if (status === 404) return HEALTH.UNSUPPORTED;
  if (status >= 500) return HEALTH.ERROR;
  return HEALTH.OK;
}

/**
 * What to do about a given state. Deliberately specific: "check your key" on a
 * quota error sends the user to re-auth a credential that is working fine.
 */
export function adviceFor(state) {
  switch (state) {
  case HEALTH.ABSENT: return 'Not configured — `sentinel auth login <id>`';
  case HEALTH.UNAUTHORIZED: return 'Credential rejected — `sentinel auth login <id>`';
  case HEALTH.QUOTA: return 'Key is valid but out of quota — upgrade, or wait for the limit to reset';
  case HEALTH.UNSUPPORTED: return 'Endpoint shape changed — the connector row may need updating';
  case HEALTH.ERROR: return 'Provider is returning server errors — retry later';
  case HEALTH.UNREACHABLE: return 'Could not reach the host — check network, VPN, or proxy';
  case HEALTH.DEGRADED: return 'Responding, but slow';
  default: return 'Healthy';
  }
}

/**
 * Probe one connector.
 *
 * Sends the same request discovery would send, so a healthy result here means
 * `/models` will populate. Uses HEAD semantics in spirit but a real GET,
 * because several providers 405 a HEAD.
 */
async function probeConnector(connectorId, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const conn = CONNECTORS[connectorId];
  const base = { id: connectorId, label: conn.label, local: conn.local === true };

  const { key, source } = resolveCredentialSync(connectorId);
  if (!key && !conn.local) {
    return { ...base, state: HEALTH.ABSENT, source, latencyMs: null, models: 0, advice: adviceFor(HEALTH.ABSENT) };
  }
  if (!canDiscoverModels(connectorId)) {
    // Anthropic exposes no listing endpoint. Its health is whatever its
    // inference endpoint says, which is not worth probing on every doctor run.
    return { ...base, state: HEALTH.OK, source, latencyMs: null, models: 0, note: 'no listing endpoint — inference only' };
  }

  const url = `${getDiscoveryBaseUrl(connectorId)}${conn.modelsPath}`;
  const headers = { Accept: 'application/json' };
  if (key) headers[connectorId === 'google' ? 'x-goog-api-key' : 'Authorization'] = connectorId === 'google' ? key : `Bearer ${key}`;

  const started = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers });
    const latencyMs = Date.now() - started;
    const state = classifyStatus(res.status);
    let models = 0;
    if (res.ok) {
      try {
        const body = await res.json();
        models = Array.isArray(body?.data) ? body.data.length
          : Array.isArray(body?.models) ? body.models.length
            : 0;
      } catch {
        // A 200 with an unparseable body is still a reachable connector.
      }
    }
    return {
      ...base,
      state: state === HEALTH.OK && latencyMs > SLOW_MS ? HEALTH.DEGRADED : state,
      status: res.status,
      latencyMs,
      models,
      source,
      advice: adviceFor(state === HEALTH.OK && latencyMs > SLOW_MS ? HEALTH.DEGRADED : state),
    };
  } catch (e) {
    return {
      ...base,
      state: HEALTH.UNREACHABLE,
      latencyMs: Date.now() - started,
      models: 0,
      source,
      detail: e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timed out' : (e?.cause?.code || e?.message || 'failed'),
      advice: adviceFor(HEALTH.UNREACHABLE),
    };
  }
}

/**
 * Probe every connector that has a credential.
 *
 * @param {{only?: string[], timeoutMs?: number, includeAbsent?: boolean}} [options]
 */
export async function probeConnectors({ only, timeoutMs = DEFAULT_TIMEOUT_MS, includeAbsent = false } = {}) {
  const ids = only?.length ? only.filter((id) => CONNECTORS[id]) : CONNECTOR_IDS;
  const rows = await Promise.all(ids.map((id) => probeConnector(id, { timeoutMs })));
  const kept = includeAbsent ? rows : rows.filter((r) => r.state !== HEALTH.ABSENT);
  return kept.sort((a, b) => RANK[a.state] - RANK[b.state] || (a.latencyMs ?? 1e9) - (b.latencyMs ?? 1e9));
}

/** One-line summary for the TUI status line. */
export function summarize(rows) {
  const live = rows.filter((r) => r.state !== HEALTH.ABSENT);
  if (live.length === 0) return 'no connector configured';
  const ok = rows.filter((r) => r.state === HEALTH.OK || r.state === HEALTH.DEGRADED).length;
  const models = rows.reduce((n, r) => n + (r.models || 0), 0);
  const parts = [`${ok}/${live.length} healthy`];
  if (models) parts.push(`${models} models`);
  const bad = rows.find((r) => r.state !== HEALTH.OK && r.state !== HEALTH.DEGRADED && r.state !== HEALTH.ABSENT);
  if (bad) parts.push(`${bad.label}: ${bad.state}`);
  return parts.join(' · ');
}

/**
 * Connector ids worth preferring right now, healthiest first.
 *
 * Intended for failover chains: given the same model available on three
 * connectors, this orders them by whether they actually answered recently.
 */
export function healthiestFirst(rows) {
  return rows
    .filter((r) => r.state === HEALTH.OK || r.state === HEALTH.DEGRADED)
    .map((r) => r.id);
}

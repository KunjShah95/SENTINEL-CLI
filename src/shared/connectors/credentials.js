/**
 * Credential store — `~/.sentinel/auth.json`.
 *
 * ## The bug this fixes
 *
 * `discovery.js` read credentials from `process.env` only. `configManager`
 * could store a key via `setApiKey()`, and `providers.js` could use it — so
 * an API key that worked for inference was invisible to `/models`. The user
 * typed a working key, ran `/models`, and saw the model missing.
 *
 * Resolution is store-first, env-second: a key the user explicitly pasted
 * wins, and an env var is the zero-config path for people who already export
 * one. Nothing writes an env var from this file, and nothing reads a key out
 * of an assistant's config (see the OAuth note in `cli/connect.js` — URLs and
 * headers end up in logs and shell history).
 *
 * ## Safety
 *
 *   - mode 0600 on create, and re-asserted on every write
 *   - keys are never returned by list/status calls, only `present`/`source`
 *   - `redact()` masks all but the last 4 characters for display
 */
import { promises as fs } from 'node:fs';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { CONNECTORS, getConnectorEnvVar, isLocalConnector } from './registry.js';

const AUTH_DIR = join(homedir(), '.sentinel');
const AUTH_PATH = join(AUTH_DIR, 'auth.json');

/** How a credential reached the store. Surfaced in `/connect` status. */
export const SOURCE = Object.freeze({
  STORE: 'store',
  ENV: 'env',
  NONE: 'none',
});

function emptyStore() {
  return { version: 1, connectors: {} };
}

async function readStore() {
  if (!existsSync(AUTH_PATH)) return emptyStore();
  try {
    const parsed = JSON.parse(await fs.readFile(AUTH_PATH, 'utf-8'));
    if (!parsed || typeof parsed !== 'object') return emptyStore();
    if (!parsed.connectors || typeof parsed.connectors !== 'object') parsed.connectors = {};
    return parsed;
  } catch {
    // A corrupt auth file must not lock the user out of every connector.
    return emptyStore();
  }
}

async function writeStore(store) {
  await fs.mkdir(AUTH_DIR, { recursive: true });
  await fs.writeFile(AUTH_PATH, JSON.stringify(store, null, 2), { mode: 0o600 });
  syncCache = { store, mtimeMs: Date.now() };
}

// Sync cache for `resolveCredentialSync`. The store is a few KB and changes
// only when the user runs `sentinel connect`, so a mtime-keyed in-process
// cache is enough to keep the sync call sites free of disk I/O per model.
let syncCache = null;

function readStoreSync() {
  try {
    if (!existsSync(AUTH_PATH)) return emptyStore();
    const { mtimeMs } = statSync(AUTH_PATH);
    if (syncCache && syncCache.mtimeMs === mtimeMs) return syncCache.store;
    const parsed = JSON.parse(readFileSync(AUTH_PATH, 'utf-8'));
    if (!parsed || typeof parsed !== 'object') return emptyStore();
    if (!parsed.connectors || typeof parsed.connectors !== 'object') parsed.connectors = {};
    syncCache = { store: parsed, mtimeMs };
    return parsed;
  } catch {
    return emptyStore();
  }
}

/**
 * Store a credential for one connector.
 * @param {string} connectorId
 * @param {{key?: string, method?: string, meta?: object}} entry
 */
export async function setCredential(connectorId, entry) {
  if (!CONNECTORS[connectorId]) throw new Error(`Unknown connector: ${connectorId}`);
  if (isLocalConnector(connectorId)) {
    throw new Error(`${CONNECTORS[connectorId].label} is local and needs no credential`);
  }
  if (!entry?.key) throw new Error('A key is required');
  const store = await readStore();
  store.connectors[connectorId] = {
    key: entry.key,
    method: entry.method || 'key',
    ...(entry.meta ? { meta: entry.meta } : {}),
    savedAt: new Date().toISOString(),
  };
  await writeStore(store);
  return { connectorId, saved: true };
}

/** Forget one connector's credential. Idempotent. */
export async function clearCredential(connectorId) {
  const store = await readStore();
  const existed = !!store.connectors[connectorId];
  delete store.connectors[connectorId];
  if (existed) await writeStore(store);
  return { connectorId, removed: existed };
}

/**
 * Resolve the credential to use for a connector.
 *
 * Store beats env. Returns `{ key, source }`, or `{ key: null, source: NONE }`.
 * Local connectors report `source: 'local'` with no key — availability there is
 * proven by the daemon answering, not by a secret.
 */
export async function resolveCredential(connectorId) {
  const conn = CONNECTORS[connectorId];
  if (!conn) return { key: null, source: SOURCE.NONE, method: null };
  if (conn.local) return { key: null, source: 'local', method: 'none' };

  const store = await readStore();
  const stored = store.connectors[connectorId]?.key;
  if (stored) {
    return { key: stored, source: SOURCE.STORE, method: store.connectors[connectorId].method || 'key' };
  }
  for (const envName of conn.env) {
    const value = process.env[envName];
    if (value) return { key: value, source: SOURCE.ENV, method: 'key', envName };
  }
  return { key: null, source: SOURCE.NONE, method: null };
}

/** True when the connector can be reached. Never returns the key. */
export async function isConnected(connectorId) {
  const { key, source } = await resolveCredential(connectorId);
  return !!key || source === 'local';
}

/**
 * Synchronous form of `resolveCredential`, for ranking and availability
 * checks that run inside a sync function (`autoSelectBestModel`,
 * `isProviderAvailable`).
 *
 * Same precedence: store, then env. Keeping this synchronous matters for more
 * than tidiness — the availability check decides which model the agent picks
 * on a cold start, and if it only read `process.env` then a key the user had
 * stored would make every paid model look unreachable and silently route the
 * session to whatever free local model happened to be installed.
 */
export function resolveCredentialSync(connectorId) {
  const conn = CONNECTORS[connectorId];
  if (!conn) return { key: null, source: SOURCE.NONE, method: null };
  if (conn.local) return { key: null, source: 'local', method: 'none' };
  const stored = readStoreSync().connectors[connectorId]?.key;
  if (stored) {
    return { key: stored, source: SOURCE.STORE, method: 'key' };
  }
  for (const envName of conn.env) {
    const value = process.env[envName];
    if (value) return { key: value, source: SOURCE.ENV, method: 'key', envName };
  }
  return { key: null, source: SOURCE.NONE, method: null };
}

/** Sync availability check — never touches the network. */
export function isConnectedSync(connectorId) {
  const { key, source } = resolveCredentialSync(connectorId);
  return !!key || source === 'local';
}

/**
 * Every connector's connection state, for `/connect` and `sentinel doctor`.
 *
 * The key is deliberately absent — a status listing that contains credentials
 * ends up in terminal scrollback and in `--json` output pasted into an issue.
 */
export async function connectionStatus() {
  const rows = [];
  for (const id of Object.keys(CONNECTORS)) {
    const conn = CONNECTORS[id];
    const { key, source, method, envName } = await resolveCredential(id);
    rows.push({
      id,
      label: conn.label,
      local: conn.local === true,
      connected: !!key || conn.local === true,
      source,
      method,
      envName: envName || null,
      hasStoredKey: source === SOURCE.STORE,
      docs: conn.docs,
    });
  }
  return rows;
}

/** Mask a key for display: `sk-abc…7f2e`. Short keys stay fully masked. */
export function redact(key) {
  if (!key) return '';
  if (key.length <= 8) return '*'.repeat(key.length);
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

/**
 * The env var a connector *would* read, for the error message when nothing is
 * configured. Delegates to the registry so the hint cannot name a var the
 * connector does not actually read.
 */
export function credentialHint(connectorId) {
  if (isLocalConnector(connectorId)) {
    return `run ${CONNECTORS[connectorId].label} locally — no key needed`;
  }
  const envName = getConnectorEnvVar(connectorId);
  return envName
    ? `run: sentinel auth login ${connectorId}, or set ${envName}`
    : `run: sentinel auth login ${connectorId}`;
}

/**
 * API client — typed-ish Hono client for the Sentinel server.
 *
 * Mirrors packages/cli/src/lib/api-client.ts from Nightcode. Adds a
 * custom fetch wrapper that injects the bearer token from the local
 * auth file and clears it on 401.
 *
 * This module can be imported from the Node CLI to talk to the Hono
 * server without any TypeScript build step.
 */

import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';

const CONFIG_DIR =
  process.env.SENTINEL_HOME || path.join(process.env.HOME || process.env.USERPROFILE || '.', '.sentinel');
const AUTH_FILE = path.join(CONFIG_DIR, 'auth.json');

let cachedAuth = null;

export function getAuth() {
  if (cachedAuth) return cachedAuth;
  try {
    if (!fs.existsSync(AUTH_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
    if (typeof parsed?.token === 'string') {
      cachedAuth = { token: parsed.token, userId: parsed.userId };
      return cachedAuth;
    }
  } catch {
    // ignore
  }
  return null;
}

export function saveAuth({ token, userId }) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    AUTH_FILE,
    JSON.stringify({ token, userId, savedAt: new Date().toISOString() }),
    { mode: 0o600 }
  );
  cachedAuth = { token, userId };
}

export function clearAuth() {
  try {
    if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE);
  } catch {
    // ignore
  }
  cachedAuth = null;
}

/**
 * Authenticated fetch wrapper.
 */
async function authedFetch(url, init = {}) {
  const auth = getAuth();
  const headers = new Headers(init.headers || {});
  if (auth?.token) headers.set('Authorization', `Bearer ${auth.token}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    clearAuth();
  }
  return res;
}

/**
 * Extract error message from a response. Mirrors `getErrorMessage` in
 * Nightcode's http-errors.ts.
 */
export async function getErrorMessage(response) {
  try {
    const data = await response.clone().json();
    if (data && typeof data.error === 'string') return data.error;
  } catch {
    // ignore
  }
  return response.statusText || `Request failed with status ${response.status}`;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Tiny request helper. Avoids the `hono/client` import (which would
 * require a build step) by encoding routes manually.
 *
 * Retries on 429 (rate-limited) and 503 (service unavailable) with
 * backoff. Other errors are thrown immediately.
 */
export async function api(method, path, body) {
  const base = process.env.SENTINEL_API_URL || process.env.API_URL || 'http://localhost:3000';
  const url = new URL(path, base).toString();
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  const MAX_RETRIES = 3;
  let lastRes;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await authedFetch(url, init);

    if (res.status === 429) {
      if (attempt === MAX_RETRIES) { lastRes = res; break; }
      const retryAfter = res.headers.get('Retry-After');
      const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : 2000;
      await sleep(waitMs);
      continue;
    }

    if (res.status === 503) {
      if (attempt === MAX_RETRIES) { lastRes = res; break; }
      const waitMs = 1000 * Math.pow(2, attempt);
      await sleep(waitMs);
      continue;
    }

    return res;
  }

  return lastRes;
}

/**
 * Stream a POST endpoint as raw SSE. Returns an async iterator.
 */
export async function streamSse(path, body) {
  const res = await api('POST', path, body);
  if (!res.ok) {
    const message = await getErrorMessage(res);
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  return (async function* () {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const event = parseSseFrame(raw);
          if (event) yield event;
        }
      }
      if (buf.length > 0) {
        const event = parseSseFrame(buf);
        if (event) yield event;
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // ignore
      }
    }
  })();
}

function parseSseFrame(raw) {
  let event = 'message';
  const dataLines = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice(7).trim();
    else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
  }
  if (dataLines.length === 0) return null;
  const dataStr = dataLines.join('\n');
  let data;
  try {
    data = JSON.parse(dataStr);
  } catch {
    data = dataStr;
  }
  return { event, data };
}

/**
 * Convenience wrappers.
 */
export const Sessions = {
  list: () => api('GET', '/sessions'),
  get: (id) => api('GET', `/sessions/${id}`),
  create: (body) => api('POST', '/sessions', body),
  delete: (id) => api('DELETE', `/sessions/${id}`),
};

export const Billing = {
  checkout: () => api('POST', '/billing/checkout'),
  portal: () => api('POST', '/billing/portal'),
};

export const Auth = {
  devLogin: (userId) => api('POST', '/auth/dev-login', { userId }),
  devLogout: (token) => api('POST', '/auth/dev-logout', { token }),
};

export { authedFetch as fetch };

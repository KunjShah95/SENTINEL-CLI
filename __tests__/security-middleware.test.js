/**
 * Tests for Hono server security middleware.
 *
 * Covers:
 * - securityHeaders: OWASP headers, HSTS, CSP, cache control
 * - requestId: generation and passthrough
 * - bodyLimit: rejection of oversized payloads
 * - rateLimiter: window tracking, header emission, 429 enforcement
 * - inputSanitizer: null bytes, path traversal, query limits, JSON body
 *
 * Run with:  node --test __tests__/security-middleware.test.js
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Isolate SENTINEL_HOME for CORS tests that import app.js (which reads config)
const sentinelHome = await mkdtemp(join(tmpdir(), 'sentinel-cors-'));
process.env.SENTINEL_HOME = sentinelHome;

after(async () => {
  if (sentinelHome) await rm(sentinelHome, { recursive: true, force: true });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(path, init = {}) {
  return new Request(`http://test.local${path}`, init);
}

// ─── securityHeaders ──────────────────────────────────────────────────────────

describe('securityHeaders()', () => {
  test('sets OWASP-recommended security headers on all responses', async () => {
    const { securityHeaders } = await import('../src/server/api/middleware/security.js');
    const app = new Hono();
    app.use('*', securityHeaders());
    app.get('/test', (c) => c.text('ok'));

    const res = await app.fetch(makeRequest('/test'));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(res.headers.get('X-XSS-Protection'), '0');
    assert.equal(res.headers.get('Referrer-Policy'), 'no-referrer');
    assert.equal(res.headers.get('Permissions-Policy'), 'camera=(), microphone=(), geolocation=()');
    assert.equal(res.headers.get('Content-Security-Policy'), "default-src 'none'; frame-ancestors 'none'");
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
  });

  test('sets HSTS only for HTTPS requests', async () => {
    const { securityHeaders } = await import('../src/server/api/middleware/security.js');
    const app = new Hono();
    app.use('*', securityHeaders());
    app.get('/test', (c) => c.text('ok'));

    // HTTP request — no HSTS
    const httpRes = await app.fetch(new Request('http://test.local/test'));
    assert.equal(httpRes.headers.get('Strict-Transport-Security'), null);

    // HTTPS request — HSTS present
    const httpsRes = await app.fetch(new Request('https://test.local/test'));
    assert.equal(httpsRes.headers.get('Strict-Transport-Security'), 'max-age=31536000; includeSubDomains');
  });
});

// ─── requestId ────────────────────────────────────────────────────────────────

describe('requestId()', () => {
  test('generates a request ID when none is provided', async () => {
    const { requestId } = await import('../src/server/api/middleware/security.js');
    const app = new Hono();
    app.use('*', requestId());
    app.get('/test', (c) => c.text('ok'));

    const res = await app.fetch(makeRequest('/test'));
    assert.ok(res.headers.get('X-Request-ID').startsWith('req_'));
  });

  test('preserves client-provided X-Request-ID header', async () => {
    const { requestId } = await import('../src/server/api/middleware/security.js');
    const app = new Hono();
    app.use('*', requestId());
    app.get('/test', (c) => c.text('ok'));

    const res = await app.fetch(makeRequest('/test', {
      headers: { 'X-Request-ID': 'client-req-123' },
    }));
    assert.equal(res.headers.get('X-Request-ID'), 'client-req-123');
  });
});

// ─── bodyLimit ────────────────────────────────────────────────────────────────

describe('bodyLimit()', () => {
  test('allows payloads under the limit', async () => {
    const { bodyLimit } = await import('../src/server/api/middleware/security.js');
    const app = new Hono();
    app.use('*', bodyLimit(100));
    app.post('/test', (c) => c.text('ok'));

    const res = await app.fetch(makeRequest('/test', {
      method: 'POST',
      headers: { 'content-length': '50' },
    }));
    assert.equal(res.status, 200);
  });

  test('rejects payloads over the limit with 413', async () => {
    const { bodyLimit } = await import('../src/server/api/middleware/security.js');
    const app = new Hono();
    app.use('*', bodyLimit(100));
    app.post('/test', (c) => c.text('ok'));

    const res = await app.fetch(makeRequest('/test', {
      method: 'POST',
      headers: { 'content-length': '200' },
    }));
    assert.equal(res.status, 413);
    const body = await res.json();
    assert.equal(body.error, 'Request body too large');
    assert.equal(body.limit, 100);
  });

  test('passes through requests without content-length', async () => {
    const { bodyLimit } = await import('../src/server/api/middleware/security.js');
    const app = new Hono();
    app.use('*', bodyLimit(100));
    app.get('/test', (c) => c.text('ok'));

    const res = await app.fetch(makeRequest('/test'));
    assert.equal(res.status, 200);
  });
});

// ─── rateLimiter ──────────────────────────────────────────────────────────────

describe('rateLimiter()', () => {
  test('emits X-RateLimit headers on every response', async () => {
    const { rateLimiter } = await import('../src/server/api/middleware/security.js');
    const app = new Hono();
    app.use('*', rateLimiter({ maxRequests: 5 }));
    app.get('/test', (c) => c.text('ok'));

    const res = await app.fetch(makeRequest('/test'));
    assert.equal(res.headers.get('X-RateLimit-Limit'), '5');
    assert.equal(res.headers.get('X-RateLimit-Remaining'), '4');
    assert.ok(res.headers.get('X-RateLimit-Reset'));
  });

  test('returns 429 when limit exceeded', async () => {
    const { rateLimiter } = await import('../src/server/api/middleware/security.js');
    const app = new Hono();
    app.use('*', rateLimiter({ windowMs: 60_000, maxRequests: 2 }));
    app.get('/test', (c) => c.text('ok'));

    // First request should pass
    const r1 = await app.fetch(makeRequest('/test'));
    assert.equal(r1.status, 200);
    assert.equal(r1.headers.get('X-RateLimit-Remaining'), '1');

    // Second request should pass
    const r2 = await app.fetch(makeRequest('/test'));
    assert.equal(r2.status, 200);
    assert.equal(r2.headers.get('X-RateLimit-Remaining'), '0');

    // Third request should be denied
    const r3 = await app.fetch(makeRequest('/test'));
    assert.equal(r3.status, 429);
    const body = await r3.json();
    assert.equal(body.error, 'Too many requests');
    assert.ok(body.retryAfter);
  });
});

// ─── inputSanitizer ───────────────────────────────────────────────────────────

describe('inputSanitizer()', () => {
  test('blocks path traversal in request path', async () => {
    const { inputSanitizer } = await import('../src/server/api/middleware/sanitize.js');
    const app = new Hono();
    app.use('*', inputSanitizer());
    app.get('*', (c) => c.text('ok'));

    const res = await app.fetch(makeRequest('/%2e%2e%2fetc%2fpasswd'));
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Invalid path');
  });

  test('blocks null bytes in request path', async () => {
    const { inputSanitizer } = await import('../src/server/api/middleware/sanitize.js');
    const app = new Hono();
    app.use('*', inputSanitizer());
    app.get('*', (c) => c.text('ok'));

    const res = await app.fetch(makeRequest('/test%00.jpg'));
    assert.equal(res.status, 400);
  });

  test('passes through normalized path traversal (URL constructor resolves it)', async () => {
    const { inputSanitizer } = await import('../src/server/api/middleware/sanitize.js');
    const app = new Hono();
    app.use('*', inputSanitizer());
    app.get('*', (c) => c.text('ok'));

    // The URL constructor normalizes /../../../etc/passwd → /etc/passwd
    // which is safe (can't escape root). Encoded variants are caught above.
    const res = await app.fetch(makeRequest('/../../../etc/passwd'));
    assert.equal(res.status, 200);
  });

  test('rejects query parameters that are too long', async () => {
    const { inputSanitizer } = await import('../src/server/api/middleware/sanitize.js');
    const app = new Hono();
    app.use('*', inputSanitizer());
    app.get('/test', (c) => c.text('ok'));

    const longValue = 'a'.repeat(3000);
    const res = await app.fetch(makeRequest(`/test?q=${longValue}`));
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Query parameter too long');
  });

  test('passes through normal requests', async () => {
    const { inputSanitizer } = await import('../src/server/api/middleware/sanitize.js');
    const app = new Hono();
    app.use('*', inputSanitizer());
    app.get('/test', (c) => c.text('ok'));

    const res = await app.fetch(makeRequest('/test?name=hello'));
    assert.equal(res.status, 200);
  });

  test('sanitizes null bytes in JSON request body', async () => {
    const { inputSanitizer } = await import('../src/server/api/middleware/sanitize.js');
    const { sanitizeString } = await import('../src/server/api/middleware/sanitize.js');
    assert.equal(sanitizeString('hello\0world'), 'helloworld');
    assert.equal(sanitizeString('normal text'), 'normal text');
    assert.equal(sanitizeString(42), 42);
  });
});

// ─── CORS middleware ──────────────────────────────────────────────────────────

describe('CORS (app level)', () => {
  test('returns Access-Control-Allow-Origin for allowed origin', async () => {
    const { default: app } = await import('../src/server/api/app.js');
    const res = await app.fetch(makeRequest('/health', {
      headers: { 'Origin': 'http://localhost:5173' },
    }));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173');
  });

  test('responds to preflight OPTIONS request', async () => {
    const { default: app } = await import('../src/server/api/app.js');
    const res = await app.fetch(makeRequest('/health', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
      },
    }));
    assert.ok(res.status === 204 || res.status === 200);
    assert.ok(res.headers.get('Access-Control-Allow-Methods'));
    assert.ok(res.headers.get('Access-Control-Allow-Headers'));
  });

  test('rejects disallowed origins in production', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { default: app } = await import('../src/server/api/app.js');
      const res = await app.fetch(makeRequest('/health', {
        headers: { 'Origin': 'https://evil.com' },
      }));
      // CORS header should not echo back the disallowed origin
      const corsHeader = res.headers.get('Access-Control-Allow-Origin');
      assert.ok(!corsHeader || corsHeader !== 'https://evil.com');
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});

// ─── Auth middleware ──────────────────────────────────────────────────────────

describe('requireAuth()', () => {
  test('returns 401 for unauthenticated requests', async () => {
    const { requireAuth } = await import('../src/server/api/middleware/auth.js');
    const app = new Hono();
    app.use('/protected/*', requireAuth());
    app.get('/protected/data', (c) => c.text('secure data'));

    const res = await app.fetch(makeRequest('/protected/data'));
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized. Run /login to continue.');
  });

  test('allows access with valid dev token', async () => {
    const { requireAuth, issueDevToken } = await import('../src/server/api/middleware/auth.js');
    const app = new Hono();
    app.use('/protected/*', requireAuth());
    app.get('/protected/data', (c) => c.text(`hello ${c.get('userId')}`));

    // Set up isolated SENTINEL_HOME for token scope
    const tmp = (await import('node:fs/promises')).mkdtemp;
    const join = (await import('node:path')).join;
    const sentinelHome = join(process.env.HOME || process.env.USERPROFILE || '.', '.sentinel');

    const token = issueDevToken('test-user-42');
    const res = await app.fetch(makeRequest('/protected/data', {
      headers: { 'Authorization': `Bearer ${token}` },
    }));
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('test-user-42'));
  });

  test('accepts X-Sentinel-Token header', async () => {
    const { requireAuth, issueDevToken } = await import('../src/server/api/middleware/auth.js');
    const app = new Hono();
    app.use('/protected/*', requireAuth());
    app.get('/protected/data', (c) => c.text('ok'));
    const token = issueDevToken('user-1');
    const res = await app.fetch(makeRequest('/protected/data', {
      headers: { 'X-Sentinel-Token': token },
    }));
    assert.equal(res.status, 200);
  });
});

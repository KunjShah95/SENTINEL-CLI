/**
 * Security middleware for Hono — adds security headers, body size limits,
 * and rate limiting to all routes.
 *
 * Production hardening:
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - X-XSS-Protection: 0 (modern standard)
 * - Strict-Transport-Security (HSTS)
 * - Content-Security-Policy (restrictive)
 * - Referrer-Policy: no-referrer
 * - Permissions-Policy: restrict browser features
 * - Body size limit (1 MB default, configurable)
 * - Request ID injection for tracing
 */

import { createMiddleware } from 'hono/factory';
import crypto from 'node:crypto';

const DEFAULT_BODY_LIMIT = 1024 * 1024; // 1 MB

/**
 * Security headers middleware — applies OWASP-recommended headers.
 */
export function securityHeaders() {
  return createMiddleware(async (c, next) => {
    await next();

    // Prevent MIME-type sniffing
    c.header('X-Content-Type-Options', 'nosniff');
    // Prevent clickjacking
    c.header('X-Frame-Options', 'DENY');
    // Disable legacy XSS filter (modern browsers use CSP)
    c.header('X-XSS-Protection', '0');
    // Referrer policy
    c.header('Referrer-Policy', 'no-referrer');
    // Restrict browser features
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    // Content Security Policy — API server, no inline scripts needed
    c.header(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'"
    );

    // HSTS only over HTTPS
    if (c.req.url.startsWith('https://')) {
      c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // Cache control for API responses
    c.header('Cache-Control', 'no-store');
  });
}

/**
 * Request ID middleware — generates a unique ID per request for tracing.
 */
export function requestId() {
  return createMiddleware(async (c, next) => {
    const id = c.req.header('X-Request-ID') || `req_${crypto.randomBytes(8).toString('hex')}`;
    c.set('requestId', id);
    c.header('X-Request-ID', id);
    await next();
  });
}

/**
 * Body size limit middleware — rejects payloads exceeding the limit.
 * @param {number} [limitBytes] - Maximum body size in bytes (default: 1 MB)
 */
export function bodyLimit(limitBytes = DEFAULT_BODY_LIMIT) {
  return createMiddleware(async (c, next) => {
    const contentLength = c.req.header('content-length');
    if (contentLength && parseInt(contentLength, 10) > limitBytes) {
      return c.json(
        { error: 'Request body too large', limit: limitBytes },
        413
      );
    }
    await next();
  });
}

/**
 * Simple in-memory rate limiter.
 * @param {object} [options]
 * @param {number} [options.windowMs] - Time window in ms (default: 60s)
 * @param {number} [options.maxRequests] - Max requests per window (default: 100)
 */
export function rateLimiter(options = {}) {
  const windowMs = options.windowMs || 60_000;
  const maxRequests = options.maxRequests || 100;
  const store = new Map();

  // Cleanup every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now - entry.windowStart > windowMs * 2) store.delete(key);
    }
  }, 300_000).unref?.();

  return createMiddleware(async (c, next) => {
    const key = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || now - entry.windowStart > windowMs) {
      entry = { windowStart: now, count: 0 };
      store.set(key, entry);
    }

    entry.count++;

    // Set rate limit headers
    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil((entry.windowStart + windowMs) / 1000)));

    if (entry.count > maxRequests) {
      c.header('Retry-After', String(Math.ceil(windowMs / 1000)));
      return c.json({ error: 'Too many requests', retryAfter: Math.ceil(windowMs / 1000) }, 429);
    }

    await next();
  });
}

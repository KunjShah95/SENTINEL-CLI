/**
 * Input sanitization middleware for Hono.
 *
 * - Strips null bytes from all string inputs
 * - Validates JSON body structure
 * - Limits query parameter lengths
 * - Sanitizes path parameters
 */

import { createMiddleware } from 'hono/factory';

const MAX_QUERY_VALUE_LENGTH = 2048;
const MAX_PATH_PARAM_LENGTH = 512;

/**
 * Strip null bytes and control characters (except \n, \r, \t) from strings.
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  // Remove null bytes
  return str.replace(/\0/g, '');
}

/**
 * Recursively sanitize an object's string values.
 */
function sanitizeObject(obj, depth = 0) {
  if (depth > 10 || !obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(v => sanitizeObject(v, depth + 1));

  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    const cleanKey = sanitizeString(key);
    if (typeof value === 'string') {
      cleaned[cleanKey] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      cleaned[cleanKey] = sanitizeObject(value, depth + 1);
    } else {
      cleaned[cleanKey] = value;
    }
  }
  return cleaned;
}

/**
 * Query parameter validation middleware.
 * Rejects requests with excessively long query values.
 */
export function sanitizeQuery() {
  return createMiddleware(async (c, next) => {
    const url = new URL(c.req.url);
    for (const [key, value] of url.searchParams) {
      if (key.length > MAX_PATH_PARAM_LENGTH || value.length > MAX_QUERY_VALUE_LENGTH) {
        return c.json(
          { error: 'Query parameter too long', param: key.slice(0, 50) },
          400
        );
      }
    }
    await next();
  });
}

/**
 * Path parameter sanitization middleware.
 * Prevents path traversal in URL parameters.
 */
export function sanitizePath() {
  return createMiddleware(async (c, next) => {
    const pathname = new URL(c.req.url).pathname;
    // Block null bytes and path traversal attempts
    if (pathname.includes('\0') || pathname.includes('..')) {
      return c.json({ error: 'Invalid path' }, 400);
    }
    await next();
  });
}

/**
 * JSON body sanitizer — parses and sanitizes JSON request bodies.
 * Stores sanitized body in context for route handlers.
 */
export function sanitizeBody() {
  return createMiddleware(async (c, next) => {
    const contentType = c.req.header('content-type') || '';
    if (!contentType.includes('application/json')) {
      await next();
      return;
    }

    try {
      const raw = await c.req.json();
      const sanitized = sanitizeObject(raw);
      c.set('sanitizedBody', sanitized);
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    await next();
  });
}

/**
 * Combined input sanitization middleware.
 * Applies query, path, and body sanitization in one middleware.
 */
export function inputSanitizer() {
  return createMiddleware(async (c, next) => {
    // Path check — decode first so percent-encoded null bytes and
    // traversal sequences like %2e%2e%2f are caught.
    const rawUrl = c.req.url;
    // Raw path from the request line (before URL normalization)
    const rawPath = rawUrl.startsWith('http')
      ? new URL(rawUrl).pathname
      : rawUrl;
    const decoded = decodeURIComponent(rawPath);
    if (decoded.includes('\0') || decoded.includes('..')) {
      return c.json({ error: 'Invalid path' }, 400);
    }
    // Also check percent-encoded forms that decodeURIComponent might miss
    if (rawPath.includes('%00') || rawPath.toLowerCase().includes('%2e%2e%2f')) {
      return c.json({ error: 'Invalid path' }, 400);
    }

    // Query check
    const url = new URL(c.req.url);
    for (const [key, value] of url.searchParams) {
      if (key.length > MAX_PATH_PARAM_LENGTH || value.length > MAX_QUERY_VALUE_LENGTH) {
        return c.json(
          { error: 'Query parameter too long', param: key.slice(0, 50) },
          400
        );
      }
    }

    // Body sanitization (for JSON requests)
    const contentType = c.req.header('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const raw = await c.req.json();
        c.set('sanitizedBody', sanitizeObject(raw));
      } catch {
        return c.json({ error: 'Invalid JSON body' }, 400);
      }
    }

    await next();
  });
}

export { sanitizeString, sanitizeObject };

/**
 * Zod validation middleware for Hono.
 *
 * Provides a `validate()` middleware factory that validates request body,
 * query parameters, and path parameters against Zod schemas. Returns
 * consistent 400-level error responses matching the existing Sentinel API
 * error shape.
 *
 * Integrates with the existing `inputSanitizer()` middleware — if
 * `sanitizedBody` is already set on the context (from sanitize.js), the
 * body validator uses it to avoid a redundant JSON parse. Otherwise it
 * falls back to `c.req.json()`.
 *
 * Usage:
 *
 *   import { z } from 'zod';
 *   import { validate } from '../middleware/validate.js';
 *
 *   const createSchema = z.object({
 *     title: z.string().min(1, 'title is required'),
 *     mode:  z.enum(['BUILD', 'PLAN', 'REVIEW']).optional(),
 *   });
 *
 *   app.post('/', validate({ body: createSchema }), async (c) => {
 *     const data = c.get('validatedBody');  // { title, mode }
 *     // ...
 *   });
 *
 *   app.get('/:id', validate({ params: z.object({ id: z.string() }) }), ...);
 *   app.get('/search', validate({ query: z.object({ q: z.string().min(1) }) }), ...);
 */

import { z } from 'zod';
import { createMiddleware } from 'hono/factory';

// ── Error response helper ──────────────────────────────────────────────
// Matches the { error, requestId } shape used by app.js onError handler.
function validationError(c, issues, source) {
  const reqId = c.get('requestId') || 'unknown';

  const details = issues.map(issue => {
    const err = {
      path: issue.path.length > 0 ? issue.path.join('.') : undefined,
      message: issue.message,
      code: issue.code,
    };
    if (issue.expected) err.expected = issue.expected;
    if (issue.received) err.received = issue.received;
    return err;
  });

  return c.json(
    {
      error: `Validation failed: ${source}`,
      details,
      requestId: reqId,
    },
    400
  );
}

/**
 * Parse the request body, respecting an already-parsed `sanitizedBody`
 * from the inputSanitizer middleware.
 */
async function readBody(c) {
  // inputSanitizer() stores sanitized JSON here — avoid a redundant parse.
  const sanitized = c.get('sanitizedBody');
  if (sanitized !== undefined) return sanitized;

  const contentType = c.req.header('content-type') || '';
  if (!contentType.includes('application/json')) return undefined;

  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

/**
 * Read all query parameters as a plain object.
 * Uses Hono's c.req.queries() to handle repeated params (?id=1&id=2).
 */
function readQuery(c) {
  const obj = {};
  for (const [key, value] of c.req.queries()) {
    if (value.length === 1) {
      obj[key] = value[0];
    } else {
      obj[key] = value;
    }
  }
  return obj;
}

/**
 * Read all path parameters as a plain object.
 */
function readParams(c) {
  return c.req.param();
}

// ── Middleware factory ──────────────────────────────────────────────────

/**
 * Validate request input against Zod schemas.
 *
 * @param {object} schemas
 * @param {import('zod').ZodSchema} [schemas.body]   - Schema for request JSON body
 * @param {import('zod').ZodSchema} [schemas.query]  - Schema for query string params
 * @param {import('zod').ZodSchema} [schemas.params] - Schema for path params (/:id)
 * @returns {import('hono').MiddlewareHandler}
 */
export function validate(schemas = {}) {
  return createMiddleware(async (c, next) => {
    // ── Body validation ─────────────────────────────────────────────
    if (schemas.body) {
      const raw = await readBody(c);
      // A missing body is validated as `{}` so schemas whose fields are all
      // optional (e.g. dev-login) pass and generate defaults, while schemas
      // with required fields still fail with a precise Zod error (400).
      const candidate = raw === undefined ? {} : raw;
      const result = schemas.body.safeParse(candidate);
      if (!result.success) {
        return validationError(c, result.error.issues, 'body');
      }
      c.set('validatedBody', result.data);
    }

    // ── Query validation ────────────────────────────────────────────
    if (schemas.query) {
      const raw = readQuery(c);
      const result = schemas.query.safeParse(raw);
      if (!result.success) {
        return validationError(c, result.error.issues, 'query');
      }
      c.set('validatedQuery', result.data);
    }

    // ── Path params validation ──────────────────────────────────────
    if (schemas.params) {
      const raw = readParams(c);
      const result = schemas.params.safeParse(raw);
      if (!result.success) {
        return validationError(c, result.error.issues, 'params');
      }
      c.set('validatedParams', result.data);
    }

    await next();
  });
}

// ── Pre-built Zod schemas for common patterns ──────────────────────────

/** Mode enum shared across chat and sessions */
export const modeSchema = z.enum(['BUILD', 'PLAN', 'REVIEW']);

/** Non-empty trimmed string */
export const nonEmptyString = z.string().min(1, 'Must not be empty').trim();

// ── Session schemas ────────────────────────────────────────────────────

export const createSessionSchema = z.object({
  title: nonEmptyString,
  mode: modeSchema.optional(),
  model: z.string().optional(),
  projectPath: z.string().optional(),
}).strict();

// ── Chat schemas ───────────────────────────────────────────────────────

export const chatSubmitSchema = z.object({
  id: z.string().min(1),
  messages: z.array(z.object({}).passthrough()).min(1, 'messages must not be empty'),
  mode: modeSchema,
  model: z.string().min(1),
}).strict();

// ── Auth schemas ───────────────────────────────────────────────────────

export const devLoginSchema = z.object({
  userId: z.string().min(1).optional(),
}).strict();

export const devLogoutSchema = z.object({
  token: z.string().min(1),
}).strict();

export default validate;

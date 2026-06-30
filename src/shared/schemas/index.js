/**
 * Zod-style validators for the Sentinel ↔ server API.
 *
 * The server runs on Node, so we use a tiny zod-compatible validation layer
 * (no external zod dep required) that exposes the same surface as the
 * Nightcode zod schemas. The shapes match exactly so the AI SDK `tool()`
 * contracts line up.
 */

import { Mode, isMode } from './mode.js';

function makeValidator(check) {
  const v = (input) => {
    const result = check(input);
    if (!result.ok) {
      const err = new Error(result.error || 'Invalid value');
      err.issues = result.issues || [{ message: result.error }];
      throw err;
    }
    return result.value ?? input;
  };
  v.safeParse = (input) => {
    try {
      const value = v(input);
      return { success: true, data: value };
    } catch (e) {
      return { success: false, error: e };
    }
  };
  v._isValidator = true;
  return v;
}

// Chainable wrapper — supports `.refine`, `.min`, `.optional` AND is
// itself callable as a validator. Returns a function with extra methods.
function chain(baseValidator) {
  const fn = (input) => baseValidator(input);
  fn._v = baseValidator;
  fn.refine = (check, message) =>
    chain(
      makeValidator((v) => {
        if (v === undefined) return { ok: true, value: undefined };
        baseValidator(v);
        if (!check(v)) return { ok: false, error: message };
        return { ok: true };
      })
    );
  fn.min = (n, message) =>
    chain(
      makeValidator((v) => {
        if (v === undefined) return { ok: true };
        baseValidator(v);
        const len = typeof v === 'string' ? v.length : Array.isArray(v) ? v.length : 0;
        if (len < n) {
          return { ok: false, error: message || `Must be at least ${n} (got ${len})` };
        }
        return { ok: true };
      })
    );
  fn.optional = () =>
    chain(
      makeValidator((v) => {
        if (v === undefined || v === null) return { ok: true };
        baseValidator(v);
        return { ok: true };
      })
    );
  fn.safeParse = (input) => {
    try {
      baseValidator(input);
      return { success: true, data: input };
    } catch (e) {
      return { success: false, error: e };
    }
  };
  return fn;
}

function string() {
  return chain(
    makeValidator((v) => {
      if (typeof v !== 'string') return { ok: false, error: 'Must be a string' };
      return { ok: true };
    })
  );
}

function number() {
  return chain(
    makeValidator((v) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        return { ok: false, error: 'Must be a number' };
      }
      return { ok: true };
    })
  );
}

function integer() {
  return chain(
    makeValidator((v) => {
      if (!Number.isInteger(v)) return { ok: false, error: 'Must be an integer' };
      return { ok: true };
    })
  );
}

function array(item) {
  return chain(
    makeValidator((v) => {
      if (!Array.isArray(v)) return { ok: false, error: 'Must be an array' };
      for (let i = 0; i < v.length; i++) {
        try {
          item(v[i]);
        } catch (e) {
          return { ok: false, error: `Item ${i}: ${e.message}` };
        }
      }
      return { ok: true };
    })
  );
}

function object(shape) {
  return chain(
    makeValidator((v) => {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) {
        return { ok: false, error: 'Must be an object' };
      }
      for (const key of Object.keys(shape)) {
        try {
          shape[key](v[key]);
        } catch (e) {
          return { ok: false, error: `Field "${key}": ${e.message}` };
        }
      }
      return { ok: true };
    })
  );
}

function enumValues(values) {
  return chain(
    makeValidator((v) => {
      if (!Array.isArray(values) || !values.includes(v)) {
        return { ok: false, error: `Must be one of: ${values.join(', ')}` };
      }
      return { ok: true };
    })
  );
}

export const z = {
  string,
  number,
  integer,
  array,
  object,
  enum: enumValues,
};

const { z: zz } = { z };
export { zz as zod };

export const createSessionSchema = z.object({
  title: z.string().refine((v) => typeof v === 'string' && v.length > 0, 'title is required'),
});

export const modeValidator = z.enum([Mode.BUILD, Mode.PLAN], 'mode must be BUILD or PLAN');

export const submitSchema = z.object({
  id: z.string(),
  messages: z.array(z.object({}), 'messages must be an array').refine((arr) => arr.length > 0, 'messages must not be empty'),
  mode: modeValidator,
  model: z.string(),
});

export const newSessionStateSchema = z.object({
  message: z.string(),
  mode: modeValidator,
  model: z.string(),
});

export const ChatMessageMetadata = {
  mode: undefined,
  model: undefined,
  durationMs: undefined,
  usage: undefined,
};

export { isMode };

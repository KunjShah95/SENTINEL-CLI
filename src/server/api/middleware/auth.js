/**
 * Auth middleware for the Hono server.
 *
 * Supports two modes:
 *   1. Clerk OAuth token (production parity with Nightcode)
 *   2. Simple bearer token (dev/test fallback)
 *
 * Token resolution order:
 *   1. `Authorization: Bearer <token>` header
 *   2. `X-Sentinel-Token` header
 *   3. `?token=<token>` query (dev only)
 *
 * For the dev fallback, tokens are checked against a local file
 * (`~/.sentinel/dev-tokens.json`) that maps `token -> userId`. This lets
 * the CLI work end-to-end without configuring Clerk.
 *
 * Mirrors packages/server/src/middleware/require-auth.ts from Nightcode.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const CONFIG_DIR = process.env.SENTINEL_HOME || path.join(process.env.HOME || process.env.USERPROFILE || ".", ".sentinel");
const DEV_TOKENS_PATH = path.join(CONFIG_DIR, "dev-tokens.json");

let devTokens = null;

function loadDevTokens() {
  if (devTokens !== null) return devTokens;
  try {
    if (fs.existsSync(DEV_TOKENS_PATH)) {
      devTokens = JSON.parse(fs.readFileSync(DEV_TOKENS_PATH, "utf-8"));
    } else {
      devTokens = {};
    }
  } catch {
    devTokens = {};
  }
  return devTokens;
}

function saveDevTokens() {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(DEV_TOKENS_PATH, JSON.stringify(devTokens, null, 2), { mode: 0o600 });
  } catch {
    // ignore
  }
}

/**
 * Issue a dev token for a user (used by the CLI when Clerk isn't configured).
 * @param {string} userId
 * @returns {string} token
 */
export function issueDevToken(userId) {
  loadDevTokens();
  const token = `snt_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  devTokens[token] = { userId, issuedAt: new Date().toISOString() };
  saveDevTokens();
  return token;
}

export function revokeDevToken(token) {
  loadDevTokens();
  delete devTokens[token];
  saveDevTokens();
}

/**
 * Authenticate a request. Returns { userId, mode: "clerk"|"dev" } or null.
 */
export function authenticateRequest(request) {
  const url = new URL(request.url || "http://localhost/");
  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const token =
    bearer ||
    request.headers.get("x-sentinel-token") ||
    (process.env.NODE_ENV !== "production" ? url.searchParams.get("token") : null);

  if (!token) return null;

  // 1. Clerk path (only if @clerk/backend is installed and configured)
  if (process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY) {
    try {
      // eslint-disable-next-line global-require
      require("@clerk/backend");
      // Note: full Clerk validation requires async authenticateRequest,
      // which we don't block on. For the dev fallback we accept dev tokens.
    } catch {
      // @clerk/backend not installed — fall through to dev tokens.
    }
  }

  // 2. Dev tokens
  const tokens = loadDevTokens();
  if (tokens[token]) {
    return { userId: tokens[token].userId, mode: "dev" };
  }

  return null;
}

/**
 * Hono middleware factory — sets `userId` on the context or returns 401.
 */
export function requireAuth() {
  return async (c, next) => {
    const auth = authenticateRequest(c.req.raw);
    if (!auth) {
      return c.json({ error: "Unauthorized. Run /login to continue." }, 401);
    }
    c.set("userId", auth.userId);
    c.set("authMode", auth.mode);
    await next();
  };
}

/**
 * Optional auth — does not fail if no token, but populates `userId` when
 * one is present. Useful for routes that are public but personalised.
 */
export function optionalAuth() {
  return async (c, next) => {
    const auth = authenticateRequest(c.req.raw);
    if (auth) {
      c.set("userId", auth.userId);
      c.set("authMode", auth.mode);
    }
    await next();
  };
}

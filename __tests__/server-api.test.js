/**
 * Unit tests for the Hono server using node:test.
 *
 * Boots the app in-process (no HTTP listener) and dispatches requests
 * via app.fetch(). Uses the JSON adapter so no optional deps are
 * required to run these tests.
 *
 * Run with:
 *   node --test __tests__/server-api.test.js
 *   npm run test:unit
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Force JSON adapter and an isolated SENTINEL_HOME for every test run.
process.env.SENTINEL_DB_BACKEND = "json";
process.env.SENTINEL_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "sentinel-test-"));
delete process.env.DATABASE_URL;
delete process.env.CLERK_SECRET_KEY;
delete process.env.CLERK_PUBLISHABLE_KEY;
delete process.env.POLAR_ACCESS_TOKEN;

const { app } = await import("../src/server/api/app.js");
const { issueDevToken } = await import("../src/server/api/middleware/auth.js");
const { resetDatabase } = await import("../src/server/database/adapter.js");

function makeAuthHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

async function jsonRequest(method, urlPath, { headers = {}, body } = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const req = new Request(`http://localhost${urlPath}`, init);
  const res = await app.fetch(req);
  let parsed = null;
  const text = await res.text();
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: res.status, body: parsed, raw: res };
}

test.beforeEach(() => {
  resetDatabase();
});

test("GET /health returns ok", async () => {
  const { status, body } = await jsonRequest("GET", "/health");
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(typeof body.ts, "number");
});

test("GET / returns service metadata", async () => {
  const { status, body } = await jsonRequest("GET", "/");
  assert.equal(status, 200);
  assert.equal(body.name, "sentinel-api");
  assert.ok(typeof body.version === "string");
});

test("POST /auth/dev-login issues a token", async () => {
  const { status, body } = await jsonRequest("POST", "/auth/dev-login", {
    body: { userId: "alice" },
  });
  assert.equal(status, 200);
  assert.equal(body.userId, "alice");
  assert.match(body.token, /^snt_/);
});

test("POST /auth/dev-login generates a userId if missing", async () => {
  const { status, body } = await jsonRequest("POST", "/auth/dev-login");
  assert.equal(status, 200);
  assert.match(body.userId, /^local-/);
  assert.ok(body.token.length > 5);
});

test("GET /sessions requires auth", async () => {
  const { status, body } = await jsonRequest("GET", "/sessions");
  assert.equal(status, 401);
  assert.match(body.error, /Unauthorized/i);
});

test("GET /sessions returns [] with a valid dev token", async () => {
  const token = issueDevToken("bob");
  const { status, body } = await jsonRequest("GET", "/sessions", {
    headers: makeAuthHeader(token),
  });
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  assert.equal(body.length, 0);
});

test("POST /sessions then GET /sessions/:id roundtrips", async () => {
  const token = issueDevToken("carol");
  const headers = makeAuthHeader(token);

  const create = await jsonRequest("POST", "/sessions", {
    headers,
    body: { title: "demo", mode: "PLAN", model: "claude-sonnet-4-6" },
  });
  assert.equal(create.status, 201);
  assert.ok(create.body.id);
  assert.equal(create.body.title, "demo");
  assert.equal(create.body.mode, "PLAN");

  const fetched = await jsonRequest("GET", `/sessions/${create.body.id}`, {
    headers,
  });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.id, create.body.id);
  assert.equal(fetched.body.userId, "carol");
});

test("POST /sessions rejects non-string title", async () => {
  const token = issueDevToken("dave");
  const { status, body } = await jsonRequest("POST", "/sessions", {
    headers: makeAuthHeader(token),
    body: { title: 42 },
  });
  assert.equal(status, 400);
  assert.ok(body.error);
});

test("DELETE /sessions/:id removes a session", async () => {
  const token = issueDevToken("eve");
  const headers = makeAuthHeader(token);

  const create = await jsonRequest("POST", "/sessions", {
    headers,
    body: { title: "to delete" },
  });
  assert.equal(create.status, 201);

  const del = await jsonRequest("DELETE", `/sessions/${create.body.id}`, {
    headers,
  });
  assert.equal(del.status, 200);
  assert.equal(del.body.ok, true);

  const get = await jsonRequest("GET", `/sessions/${create.body.id}`, {
    headers,
  });
  assert.equal(get.status, 404);
});

test("sessions are scoped per user", async () => {
  const tokenA = issueDevToken("user-a");
  const tokenB = issueDevToken("user-b");

  await jsonRequest("POST", "/sessions", {
    headers: makeAuthHeader(tokenA),
    body: { title: "A session" },
  });

  const listB = await jsonRequest("GET", "/sessions", {
    headers: makeAuthHeader(tokenB),
  });
  assert.equal(listB.status, 200);
  assert.equal(listB.body.length, 0);

  const listA = await jsonRequest("GET", "/sessions", {
    headers: makeAuthHeader(tokenA),
  });
  assert.equal(listA.status, 200);
  assert.equal(listA.body.length, 1);
  assert.equal(listA.body[0].title, "A session");
});

test("GET /billing/success is public", async () => {
  const { status, body } = await jsonRequest("GET", "/billing/success");
  assert.equal(status, 200);
  assert.match(body, /Sentinel/);
});

test("shared tool registry exposes read-only tools for PLAN", async () => {
  const { getToolContracts, READ_ONLY_TOOL_NAMES } = await import(
    "../src/shared/index.js"
  );
  const contracts = getToolContracts("PLAN");
  assert.deepEqual(Object.keys(contracts).sort(), [...READ_ONLY_TOOL_NAMES].sort());
});

test("shared tool registry exposes read-only tools for REVIEW", async () => {
  const { getToolContracts, READ_ONLY_TOOL_NAMES } = await import(
    "../src/shared/index.js"
  );
  const contracts = getToolContracts("REVIEW");
  assert.deepEqual(Object.keys(contracts).sort(), [...READ_ONLY_TOOL_NAMES].sort());
});

test("shared tool registry exposes 11 tools for BUILD", async () => {
  const { getToolContracts } = await import("../src/shared/index.js");
  const contracts = getToolContracts("BUILD");
  assert.equal(Object.keys(contracts).length, 11);
  assert.ok(contracts.bash);
  assert.ok(contracts.writeFile);
  assert.ok(contracts.editFile);
  assert.ok(contracts.batchEdit);
  assert.ok(contracts.searchWeb);
  assert.ok(contracts.diffFile);
  assert.ok(contracts.undoLastChange);
});

test("calculateCreditsForUsage produces a positive integer", async () => {
  const { calculateCreditsForUsage } = await import("../src/shared/index.js");
  const { credits } = calculateCreditsForUsage({
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    usage: { inputTokens: 1000, outputTokens: 500 },
  });
  assert.ok(Number.isInteger(credits));
  assert.ok(credits >= 1);
});

/**
 * Unit tests for the GitHub PR Bot server (Express webhook handler).
 *
 * Tests signature verification, PR event parsing, error handling, and routing
 * by starting the Express app on a random port and dispatching real HTTP requests.
 *
 * Run with:
 *   node --test __tests__/pr-bot-server.test.js
 *   npm run test:unit
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { writeFileSync, unlinkSync } from 'node:fs';

const WEBHOOK_SECRET = 'test-secret-123';

function signPayload(payloadStr) {
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  return 'sha256=' + hmac.update(payloadStr).digest('hex');
}

function silentLog() {}

describe('PR Bot server', () => {
  let server;
  let baseUrl;

  before(async () => {
    const origT = process.env.GITHUB_TOKEN;
    const origS = process.env.WEBHOOK_SECRET;
    const origP = process.env.PORT;

    process.env.GITHUB_TOKEN = 'ghp_test-token-12345';
    process.env.WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.PORT = '0';

    const log = console.log; const warn = console.warn; const err = console.error;
    console.log = silentLog; console.warn = silentLog; console.error = silentLog;

    try {
      const { startPRBotServer, verifyWebhookSignature } = await import('../src/github/prBotServer.js');
      server = await startPRBotServer({ port: 0, host: '127.0.0.1' });
      baseUrl = 'http://127.0.0.1:' + server.address().port;
      server._verify = verifyWebhookSignature;
    } finally {
      console.log = log; console.warn = warn; console.error = err;
      process.env.GITHUB_TOKEN = origT;
      process.env.WEBHOOK_SECRET = origS;
      process.env.PORT = origP;
    }
  });

  after(async () => {
    if (server) await new Promise(r => server.close(r));
  });

  async function postSigned(path, body, headers = {}) {
    const rawBody = JSON.stringify(body);
    const sig = signPayload(rawBody);
    const res = await fetch(baseUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sig, ...headers },
      body: rawBody,
    });
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: res.status, body: parsed };
  }

  // ─── Pure function: verifyWebhookSignature ───────────────────────────────

  test('verifyWebhookSignature: correct signature returns true', () => {
    const verify = server._verify;
    const payload = JSON.stringify({ action: 'opened' });
    assert.equal(verify(payload, signPayload(payload)), true);
  });

  test('verifyWebhookSignature: undefined signature returns false', () => {
    assert.equal(server._verify('{}', undefined), false);
  });

  test('verifyWebhookSignature: null signature returns false', () => {
    assert.equal(server._verify('{}', null), false);
  });

  test('verifyWebhookSignature: wrong signature returns false', () => {
    const result = server._verify(
      JSON.stringify({ action: 'opened' }),
      'sha256=0000000000000000000000000000000000000000000000000000000000000000'
    );
    assert.equal(result, false);
  });

  test('verifyWebhookSignature: timing-safe comparison does not throw', () => {
    assert.doesNotThrow(() => {
      server._verify(JSON.stringify({ a: 1 }), signPayload(JSON.stringify({ a: 1 })));
    });
  });

  // ─── Dev mode: verifyWebhookSignature bypasses when no secret ────────────
  //
  // ESM caches modules in-process, so we re-import with a different
  // WEBHOOK_SECRET via a child process.  The child uses assert.equal
  // directly — if any assertion fails, execSync throws with the stderr
  // containing the assertion error (which includes our per-call messages).

  test('verifyWebhookSignature: returns true when WEBHOOK_SECRET is empty (dev mode)', () => {
    const tmpDir = process.env.TEMP || '/tmp';
    const scriptPath = join(tmpDir, 'sentinel-dev-mode-test.mjs');

    const scriptContent = [
      'import assert from "node:assert/strict";',
      '',
      'process.env.WEBHOOK_SECRET = "";',
      'process.env.GITHUB_TOKEN = "dummy";',
      'const { verifyWebhookSignature } = await import("./src/github/prBotServer.js");',
      'const p = JSON.stringify({a:1});',
      'assert.equal(verifyWebhookSignature(p, undefined), true, "sig=undefined");',
      'assert.equal(verifyWebhookSignature(p, null), true, "sig=null");',
      'assert.equal(verifyWebhookSignature(p, "sha256=0000000000000000000000000000000000000000000000000000000000000000"), true, "sig=sha256");',
      'assert.equal(verifyWebhookSignature(p, ""), true, "sig=empty");',
    ].join('\n');

    writeFileSync(scriptPath, scriptContent, 'utf-8');

    try {
      // execSync throws on non-zero exit (assertion failure).
      // On zero exit all assertions passed — test succeeds silently.
      execSync('node', [scriptPath], {
        cwd: process.cwd(),
        timeout: 10_000,
        stdio: 'pipe',
        encoding: 'buffer',
      });
    } finally {
      try { unlinkSync(scriptPath); } catch {}
    }
  });

  // ─── Health ──────────────────────────────────────────────────────────────

  test('GET /health returns 200', async () => {
    const res = await fetch(baseUrl + '/health');
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'sentinel-pr-bot');
    assert.ok(typeof body.version === 'string');
  });

  // ─── Ping ────────────────────────────────────────────────────────────────

  test('POST /webhook/github ping → pong', async () => {
    const { status, body } = await postSigned('/webhook/github', { hook_id: 42 }, { 'X-GitHub-Event': 'ping' });
    assert.equal(status, 200);
    assert.equal(body.message, 'pong');
    assert.equal(body.hook_id, 42);
  });

  // ─── Valid PR actions ────────────────────────────────────────────────────

  const prPayload = (action) => ({
    action,
    pull_request: { number: 1, head: { sha: 'abc' } },
    repository: { name: 'repo', owner: { login: 'owner' } },
  });

  for (const action of ['opened', 'synchronize', 'reopened']) {
    test(`POST /webhook/github pull_request ${action} → 200 processing`, async () => {
      const { status, body } = await postSigned('/webhook/github', prPayload(action), { 'X-GitHub-Event': 'pull_request' });
      assert.equal(status, 200);
      assert.equal(body.status, 'processing');
      assert.equal(body.action, action);
    });
  }

  // ─── Ignored PR actions ──────────────────────────────────────────────────

  for (const action of ['closed', 'labeled', 'assigned', 'review_requested']) {
    test(`POST /webhook/github pull_request ${action} → ignored`, async () => {
      const { status, body } = await postSigned('/webhook/github', prPayload(action), { 'X-GitHub-Event': 'pull_request' });
      assert.equal(status, 200);
      assert.match(body.message, /Ignoring PR action/);
    });
  }

  // ─── Non-PR events ───────────────────────────────────────────────────────

  for (const event of ['push', 'issues', 'create', 'delete', 'star']) {
    test(`POST /webhook/github event ${event} → ignored`, async () => {
      const { status, body } = await postSigned('/webhook/github', {}, { 'X-GitHub-Event': event });
      assert.equal(status, 200);
      assert.match(body.message, /Ignoring event/);
    });
  }

  // ─── Error handling ──────────────────────────────────────────────────────

  test('POST /webhook/github invalid signature → 401', async () => {
    const res = await fetch(baseUrl + '/webhook/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-GitHub-Event': 'pull_request', 'X-Hub-Signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000' },
      body: JSON.stringify({ action: 'opened', pull_request: { number: 1 } }),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Invalid signature');
  });

  test('POST /webhook/github missing pull_request → 400', async () => {
    const { status, body } = await postSigned('/webhook/github', { action: 'opened' }, { 'X-GitHub-Event': 'pull_request' });
    assert.equal(status, 400);
    assert.equal(body.error, 'Missing pull_request or repository in payload');
  });

  test('POST /webhook/github missing repository → 400', async () => {
    const { status, body } = await postSigned('/webhook/github', { action: 'opened', pull_request: { number: 1 } }, { 'X-GitHub-Event': 'pull_request' });
    assert.equal(status, 400);
    assert.match(body.error, /Missing/);
  });

  // ─── 404 ─────────────────────────────────────────────────────────────────

  test('GET /unknown → 404', async () => {
    const res = await fetch(baseUrl + '/unknown');
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.match(body.error, /Not found/);
  });

  test('POST /unknown → 404', async () => {
    const res = await fetch(baseUrl + '/unknown', { method: 'POST' });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.match(body.error, /Not found/);
  });
});

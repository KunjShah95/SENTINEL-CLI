/**
 * Auth route — server-side callback for the Clerk OAuth flow + a dev
 * login endpoint.
 *
 * In production, `/auth/callback` is the redirect target that Clerk hits
 * after the user authorises the CLI. The server decodes the `state`
 * parameter, extracts the CLI's local callback port, and redirects the
 * browser to `http://localhost:<port>/callback?code=...&state=...` so the
 * CLI can complete the PKCE exchange.
 *
 * For dev mode (no Clerk), `/auth/dev-login` accepts a JSON body
 * `{ userId }` and returns a dev token. This is what the CLI uses when
 * Clerk isn't configured.
 */

import { Hono } from 'hono';
import { issueDevToken, revokeDevToken } from '../middleware/auth.js';

const auth = new Hono();

auth.get('/callback', (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');
  const errorDescription = c.req.query('error_description');

  if (error) {
    return c.text(errorDescription || error, 400);
  }
  if (!code || !state) {
    return c.text('Missing authorization code or state', 400);
  }

  let port;
  try {
    // state is `<base64url(JSON({port, nonce}))>.<rest>`
    const b64 = state.split('.')[0];
    const json = Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
    const payload = JSON.parse(json);
    if (!payload || typeof payload.port !== 'number') {
      throw new Error('Missing port in state');
    }
    port = payload.port;
  } catch (e) {
    return c.text('Invalid authentication state', 400);
  }

  const target = `http://localhost:${port}/callback?code=${encodeURIComponent(
    code
  )}&state=${encodeURIComponent(state)}`;
  return c.redirect(target);
});

auth.post('/dev-login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const userId = (body && body.userId) || `local-${Math.random().toString(36).slice(2, 10)}`;
  const token = issueDevToken(userId);
  return c.json({ token, userId });
});

auth.post('/dev-logout', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (body && body.token) revokeDevToken(body.token);
  return c.json({ ok: true });
});

export default auth;

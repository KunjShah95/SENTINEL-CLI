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
 *
 * Input validation uses the Zod middleware from validate.js.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { issueDevToken, revokeDevToken } from '../middleware/auth.js';
import { validate, devLoginSchema, devLogoutSchema } from '../middleware/validate.js';

const auth = new Hono();

// ── OAuth callback: validate query params with Zod ─────────────────────
const callbackQuerySchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State parameter is required'),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

auth.get('/callback',
  validate({ query: callbackQuerySchema }),
  (c) => {
    const { code, state, error, error_description } = c.get('validatedQuery');

    if (error) {
      return c.text(error_description || error, 400);
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
  }
);

auth.post('/dev-login',
  validate({ body: devLoginSchema }),
  async (c) => {
    const body = c.get('validatedBody');
    const userId = body.userId || `local-${Math.random().toString(36).slice(2, 10)}`;
    const token = issueDevToken(userId);
    return c.json({ token, userId });
  }
);

auth.post('/dev-logout',
  validate({ body: devLogoutSchema }),
  async (c) => {
    const { token } = c.get('validatedBody');
    revokeDevToken(token);
    return c.json({ ok: true });
  }
);

export default auth;

/**
 * Hono server entry point.
 *
 * Mirrors packages/server/src/index.ts from Nightcode. Routes are
 * mounted under `/auth`, `/billing`, `/sessions`, `/chat`. The default
 * auth middleware (when Clerk is configured) is applied to protected
 * paths.
 *
 * This file is consumed by:
 *   - `src/server/api/start.js` to run as a standalone process
 *   - The CLI's hono client to type the API surface
 */

import { Hono } from 'hono';
import { getLogger } from '../../utils/structuredLogger.js';
import authRoutes from './routes/auth.js';
import billingRoutes from './routes/billing.js';
import sessionRoutes from './routes/sessions.js';
import chatRoutes from './routes/chat.js';
import { requireAuth } from './middleware/auth.js';
import { cors } from 'hono/cors';
import { securityHeaders, requestId, bodyLimit, rateLimiter } from './middleware/security.js';
import { inputSanitizer } from './middleware/sanitize.js';
import { auditMiddleware } from './middleware/audit.js';

// Import webhook handler for GitHub PR events
import githubWebhookRoute from './routes/github-webhook.js';
import gitlabWebhookRoute from './routes/gitlab-webhook.js';

const app = new Hono();

// ── Production security middleware ────────────────────────────────────
app.use('*', requestId());
app.use('*', securityHeaders());
app.use('*', bodyLimit());
app.use('*', inputSanitizer());
// CORS — restrict origins in production
app.use('*', cors({
  origin: (origin) => {
    if (!origin || process.env.NODE_ENV !== 'production') return origin || '*';
    const allowed = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000').split(',');
    if (allowed.includes(origin)) return origin;
    return null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Sentinel-Token'],
  maxAge: 86400,
}));
// Rate limiting on API routes (skip webhooks — they're signature-verified)
app.use('/auth/*', rateLimiter({ maxRequests: 30 }));
app.use('/sessions/*', rateLimiter());
app.use('/chat/*', rateLimiter({ maxRequests: 60 }));

// Audit logging (non-blocking, runs after response)
app.use('*', auditMiddleware());

app.onError((err, c) => {
  const reqId = c.get('requestId') || 'unknown';
  getLogger().error(`[server] unhandled error (reqId=${reqId})`, { err, requestId: reqId });
  if (err instanceof Error && err.name === 'HTTPException') {
    return c.json({ error: err.message, requestId: reqId }, err.status || 500);
  }
  return c.json({ error: 'Internal server error', requestId: reqId }, 500);
});

app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));
app.get('/', (c) =>
  c.json({
    name: 'sentinel-api',
    version: '2.0.2',
    docs: 'https://github.com/KunjShah95/SENTINEL-CLI',
  })
);

app.route('/auth', authRoutes);

// Protected paths
app.use('/sessions/*', requireAuth());
app.use('/chat/*', requireAuth());
app.use('/billing/checkout', requireAuth());
app.use('/billing/portal', requireAuth());

app.route('/billing', billingRoutes);
app.route('/sessions', sessionRoutes);
app.route('/chat', chatRoutes);

// GitHub webhook route (no auth — uses signature verification)
app.route('/webhook', githubWebhookRoute);

// GitLab webhook route (no auth — uses token verification)
app.route('/webhook', gitlabWebhookRoute);

// Session viewer (no auth — localhost only)
import viewerRoutes from './routes/session-viewer.js';
app.route('/viewer', viewerRoutes);

// Review dashboard API routes
import reviewRoutes from './routes/review-ui.js';
app.route('/api/reviews', reviewRoutes);

// Enhanced health checks
import healthRoutes from './routes/health.js';
app.route('/health', healthRoutes);

export { app };
export default app;

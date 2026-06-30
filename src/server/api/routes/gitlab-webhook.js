/**
 * GitLab Webhook Route — Hono
 *
 * Mounts the GitLab MR review pipeline as a Hono route.
 *
 * Route: POST /webhook/gitlab
 * Headers: x-gitlab-event, x-gitlab-token
 */

import { Hono } from 'hono';
import { GitLabWebhookHandler } from '../../../automation/gitlabWebhookHandler.js';

const app = new Hono();
const WEBHOOK_SECRET = process.env.GITLAB_WEBHOOK_SECRET || '';

const gitlabHandler = new GitLabWebhookHandler({
  webhookSecret: WEBHOOK_SECRET,
});

app.post('/gitlab', async (c) => {
  const eventType = c.req.header('x-gitlab-event');
  const token = c.req.header('x-gitlab-token');

  if (!eventType) {
    return c.json({ error: 'Missing x-gitlab-event header' }, 400);
  }

  // Verify token
  if (WEBHOOK_SECRET && token !== WEBHOOK_SECRET) {
    return c.json({ error: 'Invalid GitLab webhook token' }, 401);
  }

  let payload;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }

  // Handle pipeline events (informational)
  if (eventType === 'Pipeline Hook') {
    return c.json({ message: 'Pipeline event received', handled: false });
  }

  // Process the webhook
  try {
    const result = await gitlabHandler.handleWebhook(eventType, payload, {
      'x-gitlab-token': token,
    });

    return c.json({
      status: result.reviewed ? 'reviewed' : 'skipped',
      ...result,
    });
  } catch (error) {
    console.error('[gitlab-webhook] Error:', error.message);
    return c.json({ error: error.message }, 500);
  }
});

export default app;

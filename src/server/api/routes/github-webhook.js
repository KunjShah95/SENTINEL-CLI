/**
 * GitHub Webhook Route — Hono
 *
 * Mounts the PR Bot review pipeline as a Hono route so it can run
 * inside the existing Sentinel API server (port 3000) alongside chat,
 * sessions, and auth.
 *
 * Route: POST /webhook/github
 * Headers: x-github-event, x-hub-signature-256
 */

import { Hono } from 'hono';
import crypto from 'node:crypto';
import { GitHubIntegration } from '../../../integrations/github.js';

const app = new Hono();
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

function verifySignature(rawBody, signature) {
  if (!WEBHOOK_SECRET) return true; // dev mode
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  const digest = 'sha256=' + hmac.update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

async function runReviewPipeline(owner, repo, prNumber) {
  const github = new GitHubIntegration({ token: process.env.GITHUB_TOKEN || '' });

  const prDetails = await github.getPrDetails(owner, repo, prNumber);
  const headSha = prDetails.head.sha;

  // Run local SAST if available
  const allIssues = [];
  try {
    const { runSast } = await import('../../../tui/lib/sast-runner.js');
    const sast = await runSast({ target: process.cwd() });
    allIssues.push(...(sast.findings || []));
  } catch {
    // SAST runner not available — skip
  }

  // Post inline comments
  const inlineIssues = allIssues.filter(i => i.file && i.line);
  if (inlineIssues.length > 0) {
    const formatted = github.formatIssuesForReview(inlineIssues);
    try {
      await github.createReview(owner, repo, prNumber, headSha, formatted);
    } catch {
      // fall through — summary comment alone is fine
    }
  }

  // Post summary
  const summary = github.generateSummaryComment(allIssues);
  await github.postComment(owner, repo, prNumber, summary);

  // Create check run
  const criticalCount = allIssues.filter(i => i.severity === 'critical').length;
  const highCount = allIssues.filter(i => i.severity === 'high').length;
  const conclusion = criticalCount > 0 ? 'action_required'
    : highCount > 0 ? 'neutral' : 'success';

  try {
    await github.createCheckRun(owner, repo, headSha, {
      status: 'completed',
      conclusion,
      output: {
        title: `Sentinel: ${allIssues.length} issue(s) found`,
        summary: `${criticalCount} critical, ${highCount} high, ${allIssues.filter(i => i.severity === 'medium').length} medium, ${allIssues.filter(i => i.severity === 'low').length} low`,
        text: allIssues.slice(0, 50).map(i =>
          `- [${i.severity?.toUpperCase()}] ${i.file ? `${i.file}:${i.line || ''} ` : ''}${i.message || i.title}`
        ).join('\n'),
      },
    });
  } catch {
    // check run is optional
  }

  return { issuesFound: allIssues.length, conclusion };
}

app.post('/github', async (c) => {
  const signature = c.req.header('x-hub-signature-256');
  const eventName = c.req.header('x-github-event');

  // Read raw body for signature verification
  let rawBody;
  try {
    rawBody = await c.req.text();
  } catch {
    return c.json({ error: 'Cannot read body' }, 400);
  }

  // Verify signature
  if (!verifySignature(rawBody, signature)) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  // Handle ping
  if (eventName === 'ping') {
    return c.json({ message: 'pong' });
  }

  if (eventName !== 'pull_request') {
    return c.json({ message: `Ignoring event: ${eventName}` });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const action = body.action;
  if (!['opened', 'synchronize', 'reopened'].includes(action)) {
    return c.json({ message: `Ignoring PR action: ${action}` });
  }

  const pr = body.pull_request;
  const repo = body.repository;
  if (!pr || !repo) {
    return c.json({ error: 'Missing pull_request or repository' }, 400);
  }

  const owner = repo.owner?.login || repo.owner?.name;
  const repoName = repo.name;

  // Acknowledge immediately
  c.executionCtx.waitUntil(
    runReviewPipeline(owner, repoName, pr.number).catch(e => {
      console.error('[github-webhook] Review pipeline failed:', e.message);
    })
  );

  return c.json({
    status: 'processing',
    pr: pr.number,
    repo: `${owner}/${repoName}`,
    action,
  });
});

export default app;

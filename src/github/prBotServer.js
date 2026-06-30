#!/usr/bin/env node

/**
 * GitHub PR Bot Server
 *
 * Express webhook server that listens for GitHub PR events (opened,
 * synchronize, reopened), runs Sentinel's SAST + AI review pipeline,
 * and posts formatted review comments + check runs back to the PR.
 *
 * Usage:
 *   sentinel webhook-server [--port 3001] [--host 0.0.0.0]
 *
 * Required env vars:
 *   GITHUB_TOKEN  — Personal access token with repo scope
 *   WEBHOOK_SECRET  — GitHub webhook secret for signature verification (optional)
 */

import express from 'express';
import crypto from 'crypto';
import { GitHubIntegration } from '../integrations/github.js';
import { AutoReviewEngine } from '../automation/autoReviewEngine.js';
import { ManualTriggerHandler } from '../automation/manualTriggerHandler.js';

// ─── Configuration ────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

// ─── GitHub client ────────────────────────────────────────────────────────────

let github;

function getGitHub() {
  if (!github) {
    if (!GITHUB_TOKEN) {
      console.error('GITHUB_TOKEN environment variable is required');
      process.exit(1);
    }
    github = new GitHubIntegration({ token: GITHUB_TOKEN });
  }
  return github;
}

// ─── Webhook signature verification ───────────────────────────────────────────

function verifyWebhookSignature(payload, signature) {
  if (!WEBHOOK_SECRET) {
    // No secret configured — skip verification (dev mode)
    return true;
  }
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

// ─── SAST + AI review pipeline ────────────────────────────────────────────────

async function runReviewPipeline(owner, repo, prNumber, injectedGitHub, injectables = {}) {
  const gh = injectedGitHub || getGitHub();
  const results = [];

  // 1. Get PR details and changed files
  console.log(`[pr-bot] Fetching PR #${prNumber} in ${owner}/${repo}...`);
  const prDetails = await gh.getPrDetails(owner, repo, prNumber);
  const headSha = prDetails.head.sha;

  // 2. Run local SAST (if available in the repo)
  console.log('[pr-bot] Running SAST analysis...');
  let sastFindings = [];
  try {
    const runSast = injectables.runSast || (await import('../tui/lib/sast-runner.js')).runSast;
    const sast = await runSast({ target: process.cwd() });
    sastFindings = sast.findings || [];
    results.push(...sastFindings);
    console.log(`[pr-bot] SAST found ${sastFindings.length} issues`);
  } catch (e) {
    console.warn(`[pr-bot] SAST runner unavailable: ${e.message}`);
  }

  // 3. Run git diff analysis (AI review via CLI)
  console.log('[pr-bot] Running AI diff review...');
  let aiIssues = [];
  try {
    if (injectables.execCliAnalyze) {
      const result = injectables.execCliAnalyze();
      aiIssues = result.issues || [];
    } else {
      const { execSync } = await import('child_process');
      const { resolve } = await import('path');
      const cliPath = resolve(process.cwd(), 'src/core/cli.js');
      const diffOutput = execSync(
        `node "${cliPath}" analyze --format json 2>/dev/null || echo '{"issues":[]}'`,
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 120_000 }
      );
      const parsed = JSON.parse(diffOutput);
      aiIssues = parsed.issues || [];
    }
    results.push(...aiIssues);
    console.log(`[pr-bot] AI review found ${aiIssues.length} issues`);
  } catch (e) {
    console.warn(`[pr-bot] AI review unavailable: ${e.message}`);
  }

  // 4. Post review comments
  console.log(`[pr-bot] Posting ${results.length} issues to PR #${prNumber}...`);

  // Combine all issues into a unified review
  const allIssues = [...sastFindings, ...aiIssues];

  let inlineCommentCount = 0;
  let checkRunConclusion = 'success';

  try {
    // Post inline comments for issues with file+line
    const inlineIssues = allIssues.filter(i => i.file && i.line);
    const formatted = gh.formatIssuesForReview(inlineIssues);
    inlineCommentCount = formatted.length;

    if (formatted.length > 0) {
      try {
        await gh.createReview(owner, repo, prNumber, headSha, formatted);
        console.log(`[pr-bot] Posted ${formatted.length} inline comments`);
      } catch (e) {
        console.warn(`[pr-bot] Inline comments failed: ${e.message}`);
      }
    }

    // Post summary comment
    const summary = gh.generateSummaryComment(allIssues);
    await gh.postComment(owner, repo, prNumber, summary);
    console.log('[pr-bot] Summary comment posted');

    // Create check run
    try {
      const criticalCount = allIssues.filter(i => i.severity === 'critical').length;
      const highCount = allIssues.filter(i => i.severity === 'high').length;
      checkRunConclusion = criticalCount > 0 ? 'action_required'
        : highCount > 0 ? 'neutral'
          : 'success';

      await gh.createCheckRun(owner, repo, headSha, {
        status: 'completed',
        conclusion: checkRunConclusion,
        output: {
          title: criticalCount > 0
            ? `Sentinel: ${criticalCount} critical, ${highCount} high issues`
            : highCount > 0
              ? `Sentinel: ${highCount} high severity issues`
              : 'Sentinel: All checks passed',
          summary: `Found ${allIssues.length} issue(s): ${allIssues.filter(i => i.severity === 'critical').length} critical, ${allIssues.filter(i => i.severity === 'high').length} high, ${allIssues.filter(i => i.severity === 'medium').length} medium, ${allIssues.filter(i => i.severity === 'low').length} low.`,
          text: allIssues.slice(0, 50).map(i =>
            `- [${i.severity?.toUpperCase()}] ${i.file ? `${i.file}:${i.line || ''} ` : ''}${i.message || i.title}`
          ).join('\n'),
        },
      });
      console.log(`[pr-bot] Check run created: ${checkRunConclusion}`);
    } catch (e) {
      console.warn(`[pr-bot] Check run failed: ${e.message}`);
    }

    return {
      success: true,
      prNumber,
      issuesFound: allIssues.length,
      inlineComments: inlineCommentCount,
      checkRunConclusion,
    };
  } catch (e) {
    console.error(`[pr-bot] Failed to post review: ${e.message}`);
    return { success: false, error: e.message };
  }
}

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express();

// Parse raw body for signature verification
app.use(express.json({
  verify: (req, _res, buf) => {
    (req).rawBody = buf.toString();
  },
}));

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'sentinel-pr-bot',
    version: '2.0.2',
    timestamp: new Date().toISOString(),
  });
});

// Auto-review engine instance
let autoReviewEngine;
function getAutoReviewEngine() {
  if (!autoReviewEngine) {
    autoReviewEngine = new AutoReviewEngine();
  }
  return autoReviewEngine;
}

// GitHub webhook endpoint
app.post('/webhook/github', async (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const eventName = req.headers['x-github-event'];
  const rawBody = req.rawBody || JSON.stringify(req.body);

  // Verify signature
  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn(`[pr-bot] Invalid webhook signature from ${req.ip}`);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Handle ping
  if (eventName === 'ping') {
    console.log('[pr-bot] Received ping — hook is alive');
    return res.json({ message: 'pong', hook_id: req.body.hook_id });
  }

  // Handle issue_comment events (manual triggers)
  if (eventName === 'issue_comment') {
    const commentAction = req.body.action;
    if (commentAction !== 'created') {
      return res.json({ message: 'Ignoring non-created comment' });
    }

    const comment = req.body.comment;
    const issue = req.body.issue;
    if (!issue?.pull_request) {
      return res.json({ message: 'Not a PR comment' });
    }

    const repo = req.body.repository;
    const owner = repo.owner?.login || repo.owner?.name;

    const engine = getAutoReviewEngine();
    const manualHandler = new ManualTriggerHandler();
    const command = manualHandler.parseComment(comment?.body || '');

    if (!command) {
      return res.json({ message: 'No sentinel command found' });
    }

    console.log(`[pr-bot] Processing @sentinel command: ${command.action} on PR #${issue.number}`);
    res.json({ status: 'processing', command: command.action, pr: issue.number });

    try {
      const gh = getGitHub();
      const result = await engine.handleCommentEvent(
        { comment, issue, repository: repo },
        async (params) => runReviewPipeline(params.owner, params.repo, params.prNumber, gh)
      );
      console.log(`[pr-bot] Command ${command.action} completed:`, result);

      // Post status comment
      if (command.action === 'help') {
        await gh.postComment(owner, repo.name, issue.number, manualHandler.getHelpText());
      } else if (command.action === 'pause') {
        await gh.postComment(owner, repo.name, issue.number, '⏸️ **Sentinel auto-review paused** for this PR. Use `@sentinel resume` to re-enable.');
      } else if (command.action === 'resume') {
        await gh.postComment(owner, repo.name, issue.number, '▶️ **Sentinel auto-review resumed** for this PR.');
      }
    } catch (e) {
      console.error(`[pr-bot] Comment command failed:`, e.message);
    }
    return;
  }

  // Only handle pull_request events
  if (eventName !== 'pull_request') {
    return res.json({ message: `Ignoring event: ${eventName}` });
  }

  const action = req.body.action;
  const validActions = ['opened', 'synchronize', 'reopened'];

  if (!validActions.includes(action)) {
    return res.json({ message: `Ignoring PR action: ${action}` });
  }

  const pr = req.body.pull_request;
  const repo = req.body.repository;

  if (!pr || !repo) {
    return res.status(400).json({ error: 'Missing pull_request or repository in payload' });
  }

  const owner = repo.owner?.login || repo.owner?.name;
  const repoName = repo.name;
  const prNumber = pr.number;

  console.log(`[pr-bot] Processing PR #${prNumber} (${action}) in ${owner}/${repoName}`);

  // Acknowledge immediately (GitHub expects a fast response)
  res.json({
    status: 'processing',
    pr: prNumber,
    repo: `${owner}/${repoName}`,
    action,
  });

  // Route through AutoReviewEngine
  const engine = getAutoReviewEngine();
  const gh = getGitHub();

  try {
    const result = await engine.processPREvent(
      { action, pr, repository: repo, sender: req.body.sender },
      async (params) => runReviewPipeline(params.owner, params.repo, params.prNumber, gh)
    );

    if (result.reviewed) {
      console.log(`[pr-bot] PR #${prNumber} auto-review complete (${result.mode}): ${result.result?.issuesFound || 0} issues`);
    } else {
      console.log(`[pr-bot] PR #${prNumber} skipped: ${result.reason}`);
    }
  } catch (e) {
    console.error(`[pr-bot] PR #${prNumber} review failed:`, e.message);
  }
});

// Fallback
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found. POST /webhook/github for webhooks, GET /health for health check.' });
});

// ─── Start server ─────────────────────────────────────────────────────────────

export { app, verifyWebhookSignature, runReviewPipeline };

export async function startPRBotServer(options = {}) {
  const port = options.port || PORT;
  const host = options.host || HOST;

  if (!GITHUB_TOKEN) {
    console.error('');
    console.error('  ❌ GitHub PR Bot requires GITHUB_TOKEN');
    console.error('');
    console.error('  Set the GITHUB_TOKEN environment variable:');
    console.error('    export GITHUB_TOKEN=ghp_xxxxxxxxxxxx');
    console.error('  Or create a .env file with:');
    console.error('    GITHUB_TOKEN=ghp_xxxxxxxxxxxx');
    console.error('    WEBHOOK_SECRET=your_webhook_secret (optional)');
    console.error('');
    process.exit(1);
  }

  return new Promise((resolve) => {
    const server = app.listen(port, host, () => {
      console.log('');
      console.log('  🛡️  Sentinel PR Bot');
      console.log('  ─────────────────');
      console.log(`  Webhook:   http://${host}:${port}/webhook/github`);
      console.log(`  Health:    http://${host}:${port}/health`);
      console.log(`  Token:     ${GITHUB_TOKEN ? '✓ configured' : '✗ missing'}`);
      console.log(`  Secret:    ${WEBHOOK_SECRET ? '✓ configured' : '○ not set (dev mode)'}`);
      console.log('');
      console.log('  Configure your GitHub repo webhook to point to:');
      console.log(`  http://<your-server>:${port}/webhook/github`);
      console.log('  Select "Pull requests" events (opened, synchronize, reopened).');
      console.log('');
      resolve(server);
    });
  });
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

// When run directly as `node src/github/prBotServer.js`
const isMain = process.argv[1] && (
  process.argv[1].endsWith('prBotServer.js') ||
  process.argv[1].endsWith('prBotServer')
);

if (isMain) {
  startPRBotServer().catch((e) => {
    console.error('Fatal:', e.message);
    process.exit(1);
  });
}

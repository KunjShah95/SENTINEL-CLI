/**
 * GitLab Webhook Handler
 *
 * Handles Merge Request Hook and Note Hook events from GitLab.
 * Normalizes events to a unified PR event format that the AutoReviewEngine can process.
 */

import crypto from 'crypto';
import { GitLabReviewIntegration } from '../integrations/gitlabReviewIntegration.js';
import { AutoReviewEngine } from '../automation/autoReviewEngine.js';
import { ManualTriggerHandler } from '../automation/manualTriggerHandler.js';

export class GitLabWebhookHandler {
  constructor(options = {}) {
    this.webhookSecret = options.webhookSecret || process.env.GITLAB_WEBHOOK_SECRET;
    this.reviewIntegration = options.reviewIntegration || new GitLabReviewIntegration();
    this.autoReviewEngine = options.autoReviewEngine || new AutoReviewEngine();
    this.manualHandler = options.manualHandler || new ManualTriggerHandler();
  }

  /**
   * Verify GitLab webhook token (GitLab uses a simple token, not HMAC).
   */
  verifyToken(headerToken) {
    if (!this.webhookSecret) return true; // Dev mode
    return headerToken === this.webhookSecret;
  }

  /**
   * Handle incoming GitLab webhook.
   */
  async handleWebhook(eventType, payload, headers = {}) {
    // Verify token
    const token = headers['x-gitlab-token'];
    if (!this.verifyToken(token)) {
      throw new Error('Invalid GitLab webhook token');
    }

    switch (eventType) {
    case 'Merge Request Hook':
      return this.handleMergeRequestEvent(payload);

    case 'Note Hook':
      return this.handleNoteEvent(payload);

    case 'Push Hook':
      return { message: 'Push event received', handled: false };

    case 'Pipeline Hook':
      return { message: 'Pipeline event received', handled: false };

    default:
      return { message: `Unhandled event: ${eventType}`, handled: false };
    }
  }

  /**
   * Handle Merge Request events — normalize to unified format and route through AutoReviewEngine.
   */
  async handleMergeRequestEvent(payload) {
    const attrs = payload.object_attributes;
    const action = attrs.action;

    // Map GitLab actions to GitHub-like actions
    const actionMap = {
      open: 'opened',
      reopen: 'reopened',
      update: 'synchronize',
      approved: 'approved',
      unapproved: 'unapproved',
      merge: 'merged',
      close: 'closed',
    };

    const normalizedAction = actionMap[action] || action;

    // Only process reviewable actions
    if (!['opened', 'synchronize', 'reopened'].includes(normalizedAction)) {
      return { message: `Ignoring MR action: ${action}`, reviewed: false };
    }

    // Normalize to unified event format
    const normalizedEvent = {
      action: normalizedAction,
      pr: {
        number: attrs.iid,
        title: attrs.title,
        draft: attrs.draft || attrs.work_in_progress,
        base: { ref: attrs.target_branch },
        head: { sha: attrs.last_commit?.id },
        labels: (payload.labels || []).map(l => l.title),
      },
      repository: {
        name: payload.project?.name,
        owner: { login: payload.project?.namespace || payload.project?.path_with_namespace?.split('/')[0] },
        full_name: payload.project?.path_with_namespace,
      },
      sender: { login: payload.user?.username },
      // GitLab-specific
      mrUrl: attrs.url,
      projectPath: payload.project?.path_with_namespace,
    };

    // Route through AutoReviewEngine
    const result = await this.autoReviewEngine.processPREvent(
      normalizedEvent,
      async (params) => {
        return this.runReview(params, normalizedEvent);
      }
    );

    return result;
  }

  /**
   * Handle Note (comment) events for manual triggers.
   */
  async handleNoteEvent(payload) {
    const attrs = payload.object_attributes;
    const noteableType = attrs.noteable_type;

    if (noteableType !== 'MergeRequest') {
      return { message: 'Not a MR comment', handled: false };
    }

    const command = this.manualHandler.parseComment(attrs.note);
    if (!command) {
      return { message: 'No sentinel command found', handled: false };
    }

    const mrUrl = payload.merge_request?.url || attrs.url;
    if (!mrUrl) {
      return { message: 'No MR URL available', handled: false };
    }

    // Route through AutoReviewEngine comment handler
    const normalizedEvent = {
      comment: { body: attrs.note },
      issue: {
        number: payload.merge_request?.iid,
        pull_request: true,
      },
      repository: {
        name: payload.project?.name,
        owner: { login: payload.project?.namespace },
      },
    };

    const result = await this.autoReviewEngine.handleCommentEvent(
      normalizedEvent,
      async (params) => {
        return this.runReview(params, { mrUrl });
      }
    );

    return result;
  }

  /**
   * Run the Sentinel review pipeline for a GitLab MR.
   */
  async runReview(params, context = {}) {
    const mrUrl = context.mrUrl || this.buildMRUrl(context);
    if (!mrUrl) {
      throw new Error('Cannot determine MR URL');
    }

    // Run analysis using the review integration
    const integration = this.reviewIntegration;
    const results = [];

    try {
      // Import and run the analysis pipeline
      const { ReviewPipeline } = await import('../agents/review-pipeline.js');
      const pipeline = new ReviewPipeline();
      const analysisResult = await pipeline.reviewRange({
        base: params.diffRange?.base,
        head: params.diffRange?.head,
      });
      results.push(...(analysisResult.issues || []));
    } catch (error) {
      console.warn(`[gitlab-webhook] Review pipeline error: ${error.message}`);
    }

    // Post the review
    const reviewResult = await integration.postFullReview(mrUrl, results, {
      mode: params.mode,
      metrics: { duration: 0 },
    });

    return {
      issuesFound: results.length,
      success: true,
      ...reviewResult,
    };
  }

  /**
   * Build a GitLab MR URL from context.
   */
  buildMRUrl(context) {
    const projectPath = context.projectPath;
    const prNumber = context.prNumber;
    if (!projectPath || !prNumber) return null;

    const baseUrl = process.env.GITLAB_BASE_URL || 'https://gitlab.com';
    return `${baseUrl}/${projectPath}/-/merge_requests/${prNumber}`;
  }
}

export default GitLabWebhookHandler;

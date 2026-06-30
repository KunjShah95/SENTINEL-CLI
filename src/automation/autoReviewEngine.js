/**
 * Auto-Review Engine
 *
 * Decides when to automatically review PRs based on configuration rules.
 * Supports draft filtering, branch matching, label ignore, username ignore,
 * auto-pause after N reviewed commits, and incremental reviews.
 */

import { configManager } from '../config/configManager.js';
import { ReviewHistoryStore } from './reviewHistoryStore.js';
import { IncrementalReviewTracker } from './incrementalReviewTracker.js';
import { ManualTriggerHandler } from './manualTriggerHandler.js';

export class AutoReviewEngine {
  constructor(options = {}) {
    this.config = options.config || configManager;
    this.historyStore = options.historyStore || new ReviewHistoryStore();
    this.incrementalTracker = options.incrementalTracker || new IncrementalReviewTracker();
    this.manualHandler = options.manualHandler || new ManualTriggerHandler();
    this.pausedPRs = new Map(); // `${owner}/${repo}#${prNumber}` → true
  }

  /**
   * Evaluate whether a PR event should trigger an auto-review.
   * @param {object} event - Normalized PR event
   * @returns {{ shouldReview: boolean, reason: string, mode: 'full'|'incremental'|null }}
   */
  async evaluatePREvent(event) {
    const { action, pr, repository, sender } = event;
    const owner = repository.owner?.login || repository.owner?.name;
    const repo = repository.name;
    const prNumber = pr.number;
    const prKey = `${owner}/${repo}#${prNumber}`;

    await this.config.load();
    const autoReviewConfig = this.config.getAutoReviewConfig();

    // 1. Check if auto-review is enabled
    if (!autoReviewConfig.enabled) {
      return { shouldReview: false, reason: 'Auto-review is disabled', mode: null };
    }

    // 2. Check if PR is paused (manual pause or auto-pause)
    if (this.pausedPRs.has(prKey)) {
      return { shouldReview: false, reason: 'PR is paused', mode: null };
    }

    // 3. Filter draft PRs
    if (pr.draft && !autoReviewConfig.drafts) {
      return { shouldReview: false, reason: 'Draft PR — drafts are excluded', mode: null };
    }

    // 4. Check base branch
    const baseBranch = pr.base?.ref || '';
    if (autoReviewConfig.base_branches?.length > 0) {
      const matched = autoReviewConfig.base_branches.some(b => {
        if (b.includes('*')) {
          const regex = new RegExp('^' + b.replace(/\*/g, '.*') + '$');
          return regex.test(baseBranch);
        }
        return b === baseBranch;
      });
      if (!matched) {
        return { shouldReview: false, reason: `Base branch '${baseBranch}' not in allowed list`, mode: null };
      }
    }

    // 5. Check ignore labels
    const prLabels = (pr.labels || []).map(l => l.name || l);
    if (autoReviewConfig.labels?.length > 0) {
      // If labels are specified, only review PRs with those labels
      const hasLabel = prLabels.some(l => autoReviewConfig.labels.includes(l));
      if (!hasLabel) {
        return { shouldReview: false, reason: 'PR does not have required labels', mode: null };
      }
    }

    // 6. Check ignore title keywords
    const prTitle = pr.title || '';
    if (autoReviewConfig.ignore_title_keywords?.length > 0) {
      const shouldIgnore = autoReviewConfig.ignore_title_keywords.some(kw =>
        prTitle.toLowerCase().includes(kw.toLowerCase())
      );
      if (shouldIgnore) {
        return { shouldReview: false, reason: `PR title matches ignore keyword`, mode: null };
      }
    }

    // 7. Check ignore usernames
    const senderLogin = sender?.login || '';
    if (autoReviewConfig.ignore_usernames?.length > 0) {
      if (autoReviewConfig.ignore_usernames.includes(senderLogin)) {
        return { shouldReview: false, reason: `Sender '${senderLogin}' is in ignore list`, mode: null };
      }
    }

    // 8. Check auto-pause threshold
    const maxCommits = autoReviewConfig.auto_pause_after_reviewed_commits || Infinity;
    const reviewedCount = await this.historyStore.getReviewCount(prKey);
    if (reviewedCount >= maxCommits) {
      this.pausedPRs.set(prKey, true);
      return { shouldReview: false, reason: `Auto-paused after ${reviewedCount} reviewed commits`, mode: null };
    }

    // 9. Determine review mode (full vs incremental)
    let mode = 'full';
    if (autoReviewConfig.auto_incremental_review && action === 'synchronize') {
      const lastReviewedSha = await this.historyStore.getLastReviewedCommit(prKey);
      if (lastReviewedSha) {
        mode = 'incremental';
      }
    }

    return { shouldReview: true, reason: 'All checks passed', mode };
  }

  /**
   * Process a PR event through the full auto-review pipeline.
   */
  async processPREvent(event, reviewCallback) {
    const evaluation = await this.evaluatePREvent(event);

    if (!evaluation.shouldReview) {
      return { reviewed: false, ...evaluation };
    }

    const pr = event.pr;
    const repository = event.repository;
    const owner = repository.owner?.login || repository.owner?.name;
    const repo = repository.name;
    const prKey = `${owner}/${repo}#${pr.number}`;

    let diffRange = null;
    if (evaluation.mode === 'incremental') {
      const lastSha = await this.historyStore.getLastReviewedCommit(prKey);
      diffRange = await this.incrementalTracker.computeDiffRange(
        owner, repo, pr.number, lastSha, pr.head?.sha
      );
    }

    // Execute the review
    const result = await reviewCallback({
      owner,
      repo,
      prNumber: pr.number,
      headSha: pr.head?.sha,
      mode: evaluation.mode,
      diffRange,
    });

    // Record the review
    await this.historyStore.recordReview(prKey, pr.head?.sha, result);

    return { reviewed: true, ...evaluation, result };
  }

  /**
   * Handle an issue_comment event for manual triggers.
   */
  async handleCommentEvent(event, reviewCallback) {
    const { comment, issue, repository } = event;
    const owner = repository.owner?.login || repository.owner?.name;
    const repo = repository.name;
    const prKey = `${owner}/${repo}#${issue.number}`;

    const command = this.manualHandler.parseComment(comment.body);
    if (!command) {
      return { handled: false, reason: 'No sentinel command found' };
    }

    switch (command.action) {
    case 'review': {
      const result = await reviewCallback({
        owner, repo, prNumber: issue.number,
        headSha: null, mode: 'incremental', diffRange: null,
      });
      await this.historyStore.recordReview(prKey, null, result);
      return { handled: true, action: 'review', result };
    }

    case 'full_review': {
      const result = await reviewCallback({
        owner, repo, prNumber: issue.number,
        headSha: null, mode: 'full', diffRange: null,
      });
      await this.historyStore.recordReview(prKey, null, result);
      return { handled: true, action: 'full_review', result };
    }

    case 'pause':
      this.pausedPRs.set(prKey, true);
      return { handled: true, action: 'pause' };

    case 'resume':
      this.pausedPRs.delete(prKey);
      return { handled: true, action: 'resume' };

    case 'resolve':
      this.pausedPRs.delete(prKey);
      await this.historyStore.resetReviewCount(prKey);
      return { handled: true, action: 'resolve' };

    default:
      return { handled: false, reason: `Unknown command: ${command.action}` };
    }
  }

  /**
   * Pause a specific PR.
   */
  pausePR(owner, repo, prNumber) {
    this.pausedPRs.set(`${owner}/${repo}#${prNumber}`, true);
  }

  /**
   * Resume a paused PR.
   */
  resumePR(owner, repo, prNumber) {
    this.pausedPRs.delete(`${owner}/${repo}#${prNumber}`);
  }

  /**
   * Check if a PR is currently paused.
   */
  isPRPaused(owner, repo, prNumber) {
    return this.pausedPRs.has(`${owner}/${repo}#${prNumber}`);
  }
}

export default AutoReviewEngine;

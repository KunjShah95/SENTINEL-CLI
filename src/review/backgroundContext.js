/**
 * Background Context — provides requirement/business context for targeted reviews.
 *
 * Inspired by open-code-review's `--background` flag.
 * Auto-fills from commit messages when reviewing a specific commit.
 */

import { execSync } from 'node:child_process';

export class BackgroundContext {
  /**
   * Resolve the context string for a review.
   * @param {string} [userContext] — user-provided --background text
   * @param {object} [options]
   * @param {string} [options.commit] — commit SHA to extract message from
   * @param {boolean} [options.inferFromDiff=true] — infer context from git diff
   * @returns {BackgroundContextResult}
   */
  resolve(userContext, options = {}) {
    let context = userContext || '';
    const sources = [];

    // 1. User-provided context takes priority
    if (userContext) {
      sources.push({ type: 'user', text: userContext, priority: 10 });
    }

    // 2. Commit message context
    if (options.commit && !userContext) {
      const commitMsg = this._getCommitMessage(options.commit);
      if (commitMsg) {
        sources.push({ type: 'commit', text: commitMsg, priority: 5 });
        if (!context) context = commitMsg;
      }
    }

    // 3. Infer from branch name
    if (options.inferFromDiff !== false && !context) {
      const branchContext = this._inferFromBranch();
      if (branchContext) {
        sources.push({ type: 'branch', text: branchContext, priority: 3 });
        if (!context) context = branchContext;
      }
    }

    // 4. Detect from diff summary
    if (options.inferFromDiff !== false && !context) {
      const diffContext = this._inferFromDiff();
      if (diffContext) {
        sources.push({ type: 'diff', text: diffContext, priority: 2 });
        if (!context) context = diffContext;
      }
    }

    return {
      text: context,
      sources,
      hasContext: !!context,
      isEmpty: !context,
    };
  }

  /**
   * Build a context prompt from the resolved context.
   */
  buildPrompt(result) {
    if (!result.hasContext) return '';

    return [
      '## Review Context',
      '',
      'The following context should guide the code review. Focus on whether the',
      'changes correctly implement the stated requirements.',
      '',
      result.text,
      '',
      'Consider:',
      '- Does the implementation correctly address the requirements?',
      '- Are there edge cases or missing functionality?',
      '- Is the approach appropriate for the stated goal?',
      '',
    ].join('\n');
  }

  /**
   * Summarize the context for display.
   */
  summarize(result) {
    if (!result.hasContext) return '  Background: none provided';
    const source = result.sources[0];
    const text = result.text.length > 80
      ? result.text.slice(0, 77) + '...'
      : result.text;
    return `  Background: [${source.type}] ${text}`;
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  _getCommitMessage(commit) {
    try {
      return execSync(`git log -1 --format=%B ${commit}`, {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return null;
    }
  }

  _inferFromBranch() {
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        encoding: 'utf-8',
        timeout: 3000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();

      if (branch === 'HEAD') return null;

      // Convert kebab-case branch names to readable context
      return branch
        .replace(/^feature\//i, '')
        .replace(/^fix\//i, '')
        .replace(/^bugfix\//i, '')
        .replace(/^hotfix\//i, '')
        .replace(/^chore\//i, '')
        .replace(/^refactor\//i, '')
        .replace(/^dependabot\//i, '')
        .replace(/[/_-]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
    } catch {
      return null;
    }
  }

  _inferFromDiff() {
    try {
      const diffStat = execSync('git diff --stat HEAD~1..HEAD 2>/dev/null || git diff --stat', {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();

      if (!diffStat) return null;

      const lines = diffStat.split('\n').filter(l => l.trim());
      const fileCount = lines.length - 1; // last line is summary
      const lastLine = lines[lines.length - 1] || '';

      return `Code changes across ${Math.max(0, fileCount)} file(s). ${lastLine}`;
    } catch {
      return null;
    }
  }
}

export default BackgroundContext;

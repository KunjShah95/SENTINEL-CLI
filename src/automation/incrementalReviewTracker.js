/**
 * Incremental Review Tracker
 *
 * Tracks which commits have been reviewed and computes diff ranges
 * for incremental reviews (only analyzing new commits since last review).
 */

export class IncrementalReviewTracker {
  constructor(options = {}) {
    this.github = options.github || null;
  }

  /**
   * Compute the diff range for incremental review.
   * Returns the base and head SHAs to diff between.
   *
   * @param {string} owner
   * @param {string} repo
   * @param {number} prNumber
   * @param {string|null} lastReviewedSha - SHA of the last reviewed commit
   * @param {string|null} currentHeadSha - Current PR head SHA
   * @returns {{ base: string, head: string, commits: number } | null}
   */
  async computeDiffRange(owner, repo, prNumber, lastReviewedSha, currentHeadSha) {
    if (!lastReviewedSha) return null;

    try {
      const gh = this.github || await this.getGitHubIntegration();
      if (!gh) return null;

      // Get commits since last review
      const compareUrl = `/repos/${owner}/${repo}/compare/${lastReviewedSha}...${currentHeadSha || 'HEAD'}`;
      const comparison = await gh.request('GET', compareUrl);

      const newCommits = comparison.commits || [];
      if (newCommits.length === 0) return null;

      return {
        base: lastReviewedSha,
        head: currentHeadSha || newCommits[newCommits.length - 1].sha,
        commits: newCommits.length,
        files: (comparison.files || []).map(f => ({
          path: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch,
        })),
      };
    } catch (error) {
      console.warn(`[incremental-tracker] Failed to compute diff range: ${error.message}`);
      return null;
    }
  }

  /**
   * Get only the changed files since last review.
   */
  async getChangedFilesSince(owner, repo, lastReviewedSha, currentHeadSha) {
    const diffRange = await this.computeDiffRange(owner, repo, null, lastReviewedSha, currentHeadSha);
    return diffRange?.files || [];
  }

  /**
   * Check if there are new commits to review.
   */
  async hasNewCommits(owner, repo, prNumber, lastReviewedSha, currentHeadSha) {
    if (!lastReviewedSha) return true;
    if (lastReviewedSha === currentHeadSha) return false;

    const diffRange = await this.computeDiffRange(owner, repo, prNumber, lastReviewedSha, currentHeadSha);
    return diffRange !== null && diffRange.commits > 0;
  }

  /**
   * Get a lazy GitHub integration instance.
   */
  async getGitHubIntegration() {
    try {
      const { GitHubIntegration } = await import('../integrations/github.js');
      this.github = new GitHubIntegration({ token: process.env.GITHUB_TOKEN });
      return this.github;
    } catch {
      return null;
    }
  }
}

export default IncrementalReviewTracker;

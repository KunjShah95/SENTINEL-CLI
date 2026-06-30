/**
 * Multi-Repo Analyzer
 *
 * Links related repositories, detects breaking API changes across repos,
 * and provides cross-repo context for reviews.
 */

export class MultiRepoAnalyzer {
  constructor(options = {}) {
    this.repos = options.repos || [];
    this.githubToken = options.githubToken || process.env.GITHUB_TOKEN;
    this.cache = new Map();
  }

  /**
   * Add a linked repository.
   */
  addRepo(repoUrl, branches = ['main']) {
    const parsed = this.parseRepoUrl(repoUrl);
    if (parsed) {
      this.repos.push({ ...parsed, branches });
    }
  }

  /**
   * Parse a GitHub repo URL into owner/repo.
   */
  parseRepoUrl(url) {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
  }

  /**
   * Fetch the latest API surface (exported functions/types) from a linked repo.
   */
  async fetchRepoAPI(repoInfo) {
    const cacheKey = `${repoInfo.owner}/${repoInfo.repo}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    if (!this.githubToken) return null;

    try {
      // Fetch the repo's main index/exports
      const branch = repoInfo.branches[0] || 'main';
      const response = await fetch(
        `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/src/index.ts?ref=${branch}`,
        {
          headers: {
            Authorization: `Bearer ${this.githubToken}`,
            Accept: 'application/vnd.github.v3.raw',
          },
        }
      );

      if (!response.ok) {
        // Try index.js
        const jsResponse = await fetch(
          `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/src/index.js?ref=${branch}`,
          {
            headers: {
              Authorization: `Bearer ${this.githubToken}`,
              Accept: 'application/vnd.github.v3.raw',
            },
          }
        );
        if (!jsResponse.ok) return null;
        const content = await jsResponse.text();
        const api = this.extractExports(content);
        this.cache.set(cacheKey, api);
        return api;
      }

      const content = await response.text();
      const api = this.extractExports(content);
      this.cache.set(cacheKey, api);
      return api;
    } catch {
      return null;
    }
  }

  /**
   * Extract exported symbols from source code.
   */
  extractExports(source) {
    const exports = [];

    // Match export declarations
    const patterns = [
      /export\s+(?:default\s+)?(?:function|class|interface|type|const|let|var)\s+(\w+)/g,
      /export\s+\{([^}]+)\}/g,
      /module\.exports\s*=\s*\{([^}]+)\}/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(source)) !== null) {
        if (match[1]) {
          if (match[0].includes('{')) {
            // Named exports: export { a, b, c }
            const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/).pop());
            exports.push(...names.filter(Boolean));
          } else {
            exports.push(match[1]);
          }
        }
      }
    }

    return { exports: [...new Set(exports)], sourceLength: source.length };
  }

  /**
   * Check for potential breaking changes between two API snapshots.
   */
  detectBreakingChanges(oldAPI, newAPI) {
    if (!oldAPI || !newAPI) return [];

    const removed = oldAPI.exports.filter(e => !newAPI.exports.includes(e));
    const added = newAPI.exports.filter(e => !oldAPI.exports.includes(e));

    const changes = [];
    for (const name of removed) {
      changes.push({
        type: 'removed',
        symbol: name,
        severity: 'high',
        message: `Export '${name}' was removed — this is a breaking change`,
      });
    }
    for (const name of added) {
      changes.push({
        type: 'added',
        symbol: name,
        severity: 'info',
        message: `New export '${name}' added`,
      });
    }

    return changes;
  }

  /**
   * Get cross-repo context for a review.
   */
  async getCrossRepoContext(changedFiles) {
    if (this.repos.length === 0) return '';

    const contexts = [];
    for (const repo of this.repos.slice(0, 3)) {
      const api = await this.fetchRepoAPI(repo);
      if (api) {
        contexts.push({
          repo: `${repo.owner}/${repo.repo}`,
          ...api,
        });
      }
    }

    if (contexts.length === 0) return '';

    let summary = '## Cross-Repo Context\n\n';
    for (const ctx of contexts) {
      summary += `### ${ctx.repo}\n`;
      summary += `Exported symbols: ${ctx.exports.slice(0, 20).join(', ')}`;
      if (ctx.exports.length > 20) summary += ` (+${ctx.exports.length - 20} more)`;
      summary += '\n\n';
    }

    return summary;
  }
}

export default MultiRepoAnalyzer;

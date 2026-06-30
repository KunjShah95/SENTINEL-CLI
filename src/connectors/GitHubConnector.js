/**
 * GitHubConnector — wraps GitHubIntegration into the standard ConnectorBase interface.
 *
 * Env vars: GITHUB_TOKEN
 * Provides PR review, comments, check runs, and repository access.
 */

import { ConnectorBase } from './ConnectorBase.js';
import { GitHubIntegration } from '../integrations/github.js';

export class GitHubConnector extends ConnectorBase {
  id = 'github';
  name = 'GitHub';
  description = 'Connect to GitHub or GitHub Enterprise for PR reviews, comments, and check runs';
  docsUrl = 'https://docs.github.com/en/rest';

  static configSchema = {
    envVars: ['GITHUB_TOKEN'],
    fields: [
      { key: 'token', label: 'GitHub Token', type: 'password', env: 'GITHUB_TOKEN' },
      { key: 'baseUrl', label: 'API Base URL', type: 'text', default: 'https://api.github.com' },
      { key: 'enterpriseDomains', label: 'Enterprise Domains', type: 'text', optional: true },
    ],
  };

  constructor(options = {}) {
    super(options);
    this.client = null;
  }

  async connect() {
    const token = this.config.token || process.env.GITHUB_TOKEN;
    if (!token) {
      return { success: false, message: 'GITHUB_TOKEN not set. Provide token via config or GITHUB_TOKEN env var.' };
    }

    try {
      this.client = new GitHubIntegration({
        token,
        baseUrl: this.config.baseUrl || 'https://api.github.com',
        enterpriseDomains: this.config.enterpriseDomains,
      });

      // Verify by hitting the /user endpoint
      const user = await this.client.request('GET', '/user');
      this.connected = true;
      return { success: true, message: `Connected as ${user.login}` };
    } catch (err) {
      this.connected = false;
      return { success: false, message: `GitHub connection failed: ${err.message}` };
    }
  }

  async disconnect() {
    this.client = null;
    this.connected = false;
    return { success: true, message: 'GitHub disconnected' };
  }

  async healthCheck() {
    if (!this.client) {
      return { alive: false, error: 'Not connected' };
    }
    try {
      const user = await this.client.request('GET', '/user');
      const rateLimit = await this.client.request('GET', '/rate_limit');
      const remaining = rateLimit?.rate?.remaining ?? 'unknown';
      return { alive: true, error: null, details: `Authenticated as ${user.login}, rate limit remaining: ${remaining}` };
    } catch (err) {
      return { alive: false, error: err.message };
    }
  }

  // ─── GitHub-specific convenience methods ──────────────────────────────────

  async getPRInfo(prUrl) {
    if (!this.client) throw new Error('Not connected. Call connect() first.');
    const { owner, repo, prNumber } = this.client.parsePrUrl(prUrl);
    return this.client.getPrDetails(owner, repo, prNumber);
  }

  async postReview(prUrl, issues) {
    if (!this.client) throw new Error('Not connected. Call connect() first.');
    return this.client.postReview(prUrl, issues);
  }

  async postComment(prUrl, body) {
    if (!this.client) throw new Error('Not connected. Call connect() first.');
    const { owner, repo, prNumber } = this.client.parsePrUrl(prUrl);
    return this.client.postComment(owner, repo, prNumber, body);
  }

  async createCheckRun(owner, repo, sha, options) {
    if (!this.client) throw new Error('Not connected. Call connect() first.');
    return this.client.createCheckRun(owner, repo, sha, options);
  }
}

export default GitHubConnector;

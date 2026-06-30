/**
 * GitLabConnector — GitLab API connector with standard ConnectorBase interface.
 *
 * Env vars: GITLAB_TOKEN
 * Provides merge request review, comments, discussion threads, and pipeline status.
 *
 * API docs: https://docs.gitlab.com/ee/api/
 *
 * Usage:
 *   import { GitLabConnector } from './connectors/GitLabConnector.js';
 *   const gl = new GitLabConnector({ config: { token: 'glpat-...' } });
 *   await gl.connect();
 *   const mr = await gl.getMRInfo('https://gitlab.com/owner/repo/-/merge_requests/42');
 */

import { ConnectorBase } from './ConnectorBase.js';

export class GitLabConnector extends ConnectorBase {
  id = 'gitlab';
  name = 'GitLab';
  description = 'Connect to GitLab (gitlab.com or self-managed) for MR reviews, comments, discussions, and pipeline status';
  docsUrl = 'https://docs.gitlab.com/ee/api/';

  static configSchema = {
    envVars: ['GITLAB_TOKEN'],
    fields: [
      { key: 'token', label: 'GitLab Personal Access Token', type: 'password', env: 'GITLAB_TOKEN' },
      { key: 'baseUrl', label: 'GitLab Base URL', type: 'text', default: 'https://gitlab.com' },
    ],
  };

  constructor(options = {}) {
    super(options);
    this.token = null;
    this.apiBase = 'https://gitlab.com/api/v4';
  }

  // ─── Connection lifecycle ─────────────────────────────────────────────────

  async connect() {
    this.token = this.config.token || process.env.GITLAB_TOKEN;
    if (!this.token) {
      return { success: false, message: 'GITLAB_TOKEN not set. Provide token via config or GITLAB_TOKEN env var.' };
    }

    const baseUrl = this.config.baseUrl || 'https://gitlab.com';
    this.apiBase = `${baseUrl.replace(/\/+$/, '')}/api/v4`;

    try {
      // Verify by hitting /user — lightweight auth check
      const user = await this._request('GET', '/user');
      this.connected = true;
      return { success: true, message: `Connected to GitLab as ${user.username} (${user.name})` };
    } catch (err) {
      this.connected = false;
      return { success: false, message: `GitLab connection failed: ${err.message}` };
    }
  }

  async disconnect() {
    this.token = null;
    this.connected = false;
    return { success: true, message: 'GitLab disconnected' };
  }

  async healthCheck() {
    if (!this.token) {
      return { alive: false, error: 'Not connected' };
    }
    try {
      const start = Date.now();
      const version = await this._request('GET', '/version');
      const user = await this._request('GET', '/user');
      const latencyMs = Date.now() - start;
      return {
        alive: true,
        latencyMs,
        details: `GitLab ${version.version} — Authenticated as ${user.username}`,
      };
    } catch (err) {
      return { alive: false, error: err.message };
    }
  }

  // ─── Core request helper ──────────────────────────────────────────────────

  /**
   * Make an authenticated request to the GitLab API.
   */
  async _request(method, endpoint, body = null, query = {}) {
    if (!this.token) {
      throw new Error('Not connected. Call connect() first or set GITLAB_TOKEN.');
    }

    const url = new URL(`${this.apiBase}${endpoint}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    const options = {
      method,
      headers: {
        'PRIVATE-TOKEN': this.token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Sentinel-CLI',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url.toString(), options);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`GitLab API error (${response.status}): ${errorBody || response.statusText}`);
    }

    // Handle 204 No Content
    if (response.status === 204) return null;

    return response.json();
  }

  /**
   * URL-encode a project path (e.g. "group/subgroup/project" → "group%2Fsubgroup%2Fproject").
   */
  _encodeProjectPath(path) {
    return encodeURIComponent(path);
  }

  /**
   * Parse a GitLab MR URL into project path and MR IID.
   * Supports:
   *   https://gitlab.com/owner/repo/-/merge_requests/42
   *   https://gitlab.example.com/group/subgroup/project/-/merge_requests/7
   */
  parseMRUrl(mrUrl) {
    const match = mrUrl.match(/https?:\/\/[^/]+\/(.+?)\/-\/merge_requests\/(\d+)/);
    if (!match) {
      throw new Error(`Invalid GitLab MR URL: ${mrUrl}. Expected format: https://gitlab.com/owner/repo/-/merge_requests/123`);
    }
    return {
      projectPath: match[1],
      mrIid: parseInt(match[2], 10),
    };
  }

  // ─── Merge Request methods ────────────────────────────────────────────────

  /**
   * Get details of a merge request.
   * @param {string} mrUrl — Full GitLab MR URL
   * @returns {Promise<object>} MR details
   */
  async getMRInfo(mrUrl) {
    const { projectPath, mrIid } = this.parseMRUrl(mrUrl);
    return this._request('GET', `/projects/${this._encodeProjectPath(projectPath)}/merge_requests/${mrIid}`);
  }

  /**
   * List merge requests for a project with optional filters.
   * @param {string} projectPath — e.g. "group/repo"
   * @param {object} [filters] — { state, scope, labels, search, ... }
   * @returns {Promise<Array>}
   */
  async listMRs(projectPath, filters = {}) {
    return this._request('GET', `/projects/${this._encodeProjectPath(projectPath)}/merge_requests`, null, {
      state: filters.state || 'opened',
      scope: filters.scope || 'all',
      labels: filters.labels,
      search: filters.search,
      per_page: filters.perPage || 20,
      ...filters,
    });
  }

  /**
   * Get the diff/changed files for a merge request.
   * @param {string} mrUrl
   * @returns {Promise<Array>} — array of { old_path, new_path, new_file, renamed_file, deleted_file, diff }
   */
  async getMRDiff(mrUrl) {
    const { projectPath, mrIid } = this.parseMRUrl(mrUrl);
    return this._request('GET', `/projects/${this._encodeProjectPath(projectPath)}/merge_requests/${mrIid}/changes`);
  }

  /**
   * Create a comment (note) on a merge request.
   * @param {string} mrUrl
   * @param {string} body — Comment text (Markdown supported)
   * @returns {Promise<object>}
   */
  async postComment(mrUrl, body) {
    const { projectPath, mrIid } = this.parseMRUrl(mrUrl);
    return this._request('POST', `/projects/${this._encodeProjectPath(projectPath)}/merge_requests/${mrIid}/notes`, { body });
  }

  /**
   * Create a discussion thread on a specific line of a merge request diff.
   * @param {string} mrUrl
   * @param {object} options
   * @param {string} options.body — Comment text
   * @param {string} options.position[position_type] — 'text' or 'image'
   * @param {string} options.position[base_sha] — Base commit SHA
   * @param {string} options.position[start_sha] — Start commit SHA
   * @param {string} options.position[head_sha] — Head commit SHA
   * @param {string} options.position[new_path] — File path
   * @param {number} options.position[new_line] — Line number in new file
   * @param {string} options.position[old_path] — File path (for old file)
   * @param {number} options.position[old_line] — Line number in old file
   * @returns {Promise<object>}
   */
  async postDiscussion(mrUrl, body, position = {}) {
    const { projectPath, mrIid } = this.parseMRUrl(mrUrl);
    const payload = { body };

    if (Object.keys(position).length > 0) {
      payload.position = position;
    }

    return this._request(
      'POST',
      `/projects/${this._encodeProjectPath(projectPath)}/merge_requests/${mrIid}/discussions`,
      payload,
    );
  }

  /**
   * List comments (notes) on a merge request.
   * @param {string} mrUrl
   * @returns {Promise<Array>}
   */
  async listComments(mrUrl) {
    const { projectPath, mrIid } = this.parseMRUrl(mrUrl);
    return this._request('GET', `/projects/${this._encodeProjectPath(projectPath)}/merge_requests/${mrIid}/notes`);
  }

  /**
   * Merge a merge request.
   * @param {string} mrUrl
   * @param {object} [options] — { merge_commit_message, squash, should_remove_source_branch }
   * @returns {Promise<object>}
   */
  async acceptMR(mrUrl, options = {}) {
    const { projectPath, mrIid } = this.parseMRUrl(mrUrl);
    return this._request(
      'PUT',
      `/projects/${this._encodeProjectPath(projectPath)}/merge_requests/${mrIid}/merge`,
      options,
    );
  }

  /**
   * Approve a merge request (requires GitLab Premium).
   * @param {string} mrUrl
   * @returns {Promise<object>}
   */
  async approveMR(mrUrl) {
    const { projectPath, mrIid } = this.parseMRUrl(mrUrl);
    return this._request('POST', `/projects/${this._encodeProjectPath(projectPath)}/merge_requests/${mrIid}/approve`);
  }

  // ─── Pipeline methods ─────────────────────────────────────────────────────

  /**
   * List pipelines for a project.
   * @param {string} projectPath — e.g. "group/repo"
   * @param {object} [filters] — { status, ref, scope, ... }
   * @returns {Promise<Array>}
   */
  async listPipelines(projectPath, filters = {}) {
    return this._request('GET', `/projects/${this._encodeProjectPath(projectPath)}/pipelines`, null, {
      status: filters.status,
      ref: filters.ref,
      scope: filters.scope,
      per_page: filters.perPage || 20,
      ...filters,
    });
  }

  /**
   * Get a single pipeline's details.
   * @param {string} projectPath
   * @param {number} pipelineId
   * @returns {Promise<object>}
   */
  async getPipeline(projectPath, pipelineId) {
    return this._request('GET', `/projects/${this._encodeProjectPath(projectPath)}/pipelines/${pipelineId}`);
  }

  /**
   * Get the status of the latest pipeline for a given branch.
   * @param {string} projectPath
   * @param {string} [branch='HEAD'] — branch/ref name
   * @returns {Promise<{ status: string, id: number, web_url: string }|null>}
   */
  async getLatestPipelineStatus(projectPath, branch = 'HEAD') {
    const pipelines = await this.listPipelines(projectPath, { ref: branch, per_page: 1 });
    if (pipelines.length === 0) return null;
    const p = pipelines[0];
    return { status: p.status, id: p.id, web_url: p.web_url, sha: p.sha };
  }

  /**
   * Get pipeline jobs for a specific pipeline.
   * @param {string} projectPath
   * @param {number} pipelineId
   * @returns {Promise<Array>}
   */
  async getPipelineJobs(projectPath, pipelineId) {
    return this._request('GET', `/projects/${this._encodeProjectPath(projectPath)}/pipelines/${pipelineId}/jobs`);
  }

  // ─── Convenience: post review with issues ─────────────────────────────────

  /**
   * Get all commits for a merge request.
   */
  async getMRCommits(mrUrl) {
    const { projectPath, mrIid } = this.parseMRUrl(mrUrl);
    return this._request('GET', `/projects/${this._encodeProjectPath(projectPath)}/merge_requests/${mrIid}/commits`);
  }

  /**
   * Get all discussion threads on a merge request.
   */
  async getMRDiscussions(mrUrl) {
    const { projectPath, mrIid } = this.parseMRUrl(mrUrl);
    return this._request('GET', `/projects/${this._encodeProjectPath(projectPath)}/merge_requests/${mrIid}/discussions`);
  }

  /**
   * Resolve (or unresolve) a discussion thread.
   */
  async resolveDiscussion(mrUrl, discussionId, resolved = true) {
    const { projectPath, mrIid } = this.parseMRUrl(mrUrl);
    return this._request(
      'PUT',
      `/projects/${this._encodeProjectPath(projectPath)}/merge_requests/${mrIid}/discussions/${discussionId}`,
      { resolved },
    );
  }

  /**
   * Get the pipeline status for a merge request.
   */
  async getMRPipelineStatus(mrUrl) {
    const { projectPath, mrIid } = this.parseMRUrl(mrUrl);
    const mr = await this._request('GET', `/projects/${this._encodeProjectPath(projectPath)}/merge_requests/${mrIid}`);
    return {
      pipeline: mr.pipeline || null,
      headPipeline: mr.head_pipeline || null,
      hasConflicts: mr.has_conflicts || false,
      mergeStatus: mr.merge_status,
      detailedMergeStatus: mr.detailed_merge_status,
    };
  }

  /**
   * Get changed files (normalized format) for a merge request.
   */
  async getMRChangedFiles(mrUrl) {
    const changes = await this.getMRDiff(mrUrl);
    return (changes.changes || []).map(f => ({
      path: f.new_path,
      oldPath: f.old_path,
      status: f.new_file ? 'added' : f.deleted_file ? 'removed' : f.renamed_file ? 'renamed' : 'modified',
      diff: f.diff,
      additions: (f.diff?.match(/^\+/gm) || []).length,
      deletions: (f.diff?.match(/^-/gm) || []).length,
    }));
  }

  // ─── Convenience: post review with issues ─────────────────────────────────

  /**
   * Post a full review as a comment on a merge request with a summary.
   * @param {string} mrUrl
   * @param {Array} issues — Sentinel issues array
   * @returns {Promise<{ success: boolean, comment: object, mrUrl: string }>}
   */
  async postReview(mrUrl, issues) {
    const { projectPath, mrIid } = this.parseMRUrl(mrUrl);

    // Build summary
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const issue of issues) {
      const sev = (issue.severity || 'info').toLowerCase();
      if (counts[sev] !== undefined) counts[sev]++;
    }
    const total = issues.length;

    let body = '## 🛡️ Sentinel Code Review\n\n';
    body += `**Total Issues Found:** ${total}\n\n`;
    body += '| Severity | Count |\n|----------|-------|\n';
    if (counts.critical > 0) body += `| 🛑 Critical | ${counts.critical} |\n`;
    if (counts.high > 0) body += `| 🔶 High | ${counts.high} |\n`;
    if (counts.medium > 0) body += `| 🔷 Medium | ${counts.medium} |\n`;
    if (counts.low > 0) body += `| 🟢 Low | ${counts.low} |\n`;

    if (total === 0) {
      body += '\n✨ **Great job!** No issues detected.\n';
    } else if (counts.critical > 0 || counts.high > 0) {
      body += '\n⚠️ **Action Required:** Critical or high severity issues detected.\n';
    } else {
      body += '\n✅ No critical issues.\n';
    }

    if (issues.length > 0) {
      body += '\n### Issue Details\n\n';
      for (const issue of issues.slice(0, 20)) {
        const sevEmoji = { critical: '🛑', high: '🔶', medium: '🔷', low: '🟢', info: 'ℹ️' }[issue.severity] || '⚠️';
        const loc = issue.file ? `\`${issue.file}:${issue.line || 1}\`` : '';
        body += `${sevEmoji} **${issue.title || 'Issue'}** ${loc}\n`;
        body += `   ${issue.message || ''}\n`;
        if (issue.suggestion) body += `   💡 ${issue.suggestion}\n`;
        body += '\n';
      }
      if (issues.length > 20) {
        body += `_... and ${issues.length - 20} more issues_\n\n`;
      }
    }

    body += '---\n';
    body += `_Powered by [Sentinel CLI](https://github.com/KunjShah95/Sentinel-CLI)_\n`;

    const comment = await this.postComment(mrUrl, body);
    return { success: true, comment, mrUrl };
  }
}

export default GitLabConnector;

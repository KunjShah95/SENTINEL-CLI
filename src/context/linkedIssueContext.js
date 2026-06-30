/**
 * Linked Issue Context
 *
 * Extracts issue references from PR titles/bodies (#123, PROJ-123)
 * and fetches issue details from GitHub, GitLab, Jira, and Linear.
 * Provides rich context for more informed code reviews.
 */

export class LinkedIssueContext {
  constructor(options = {}) {
    this.githubToken = options.githubToken || process.env.GITHUB_TOKEN;
    this.gitlabToken = options.gitlabToken || process.env.GITLAB_TOKEN;
    this.jiraToken = options.jiraToken || process.env.JIRA_TOKEN;
    this.jiraBaseUrl = options.jiraBaseUrl || process.env.JIRA_BASE_URL;
    this.linearToken = options.linearToken || process.env.LINEAR_TOKEN;
    this.cache = new Map();
  }

  /**
   * Extract issue references from PR title and body.
   */
  extractIssueRefs(title = '', body = '') {
    const text = `${title}\n${body}`;
    const refs = [];

    // GitHub/GitLab style: #123, fixes #456, closes #789
    const githubPattern = /(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?|relate[sd]?|ref(?:s)?)?\s*#(\d+)/gi;
    let match;
    while ((match = githubPattern.exec(text)) !== null) {
      refs.push({ type: 'github', number: parseInt(match[1]), raw: match[0] });
    }

    // Jira style: PROJ-123, TEAM-456
    const jiraPattern = /\b([A-Z][A-Z0-9]+-\d+)\b/g;
    while ((match = jiraPattern.exec(text)) !== null) {
      if (!refs.some(r => r.raw === match[1])) {
        refs.push({ type: 'jira', key: match[1], raw: match[1] });
      }
    }

    // Linear style: ENG-123, ABC-456 (same as Jira, disambiguated by config)
    const linearPattern = /\b(LIN|LINEAR)-(\d+)\b/gi;
    while ((match = linearPattern.exec(text)) !== null) {
      refs.push({ type: 'linear', number: parseInt(match[2]), raw: match[0] });
    }

    return refs;
  }

  /**
   * Fetch issue details from the appropriate tracker.
   */
  async fetchIssue(ref, context = {}) {
    const cacheKey = `${ref.type}:${ref.raw}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    let issue = null;

    switch (ref.type) {
    case 'github':
      issue = await this.fetchGitHubIssue(ref.number, context);
      break;
    case 'jira':
      issue = await this.fetchJiraIssue(ref.key);
      break;
    case 'linear':
      issue = await this.fetchLinearIssue(ref.number);
      break;
    }

    if (issue) this.cache.set(cacheKey, issue);
    return issue;
  }

  /**
   * Fetch a GitHub issue.
   */
  async fetchGitHubIssue(issueNumber, context = {}) {
    if (!this.githubToken) return null;

    const owner = context.owner;
    const repo = context.repo;
    if (!owner || !repo) return null;

    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
        {
          headers: {
            Authorization: `Bearer ${this.githubToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );

      if (!response.ok) return null;
      const data = await response.json();

      return {
        type: 'github',
        number: data.number,
        title: data.title,
        body: data.body?.slice(0, 5000),
        labels: (data.labels || []).map(l => l.name),
        state: data.state,
        assignee: data.assignee?.login,
        milestone: data.milestone?.title,
        url: data.html_url,
      };
    } catch {
      return null;
    }
  }

  /**
   * Fetch a Jira issue.
   */
  async fetchJiraIssue(issueKey) {
    if (!this.jiraToken || !this.jiraBaseUrl) return null;

    try {
      const baseUrl = this.jiraBaseUrl.replace(/\/+$/, '');
      const response = await fetch(`${baseUrl}/rest/api/2/issue/${issueKey}`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`sentinel:${this.jiraToken}`).toString('base64')}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) return null;
      const data = await response.json();

      return {
        type: 'jira',
        key: data.key,
        title: data.fields.summary,
        body: data.fields.description?.slice(0, 5000),
        status: data.fields.status?.name,
        priority: data.fields.priority?.name,
        assignee: data.fields.assignee?.displayName,
        labels: data.fields.labels || [],
        url: `${baseUrl}/browse/${data.key}`,
      };
    } catch {
      return null;
    }
  }

  /**
   * Fetch a Linear issue.
   */
  async fetchLinearIssue(issueNumber) {
    if (!this.linearToken) return null;

    try {
      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          Authorization: this.linearToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `query { issue(number: ${issueNumber}) { id title description state { name } priority label assignee { name } url } }`,
        }),
      });

      if (!response.ok) return null;
      const { data } = await response.json();
      const issue = data?.issue;
      if (!issue) return null;

      return {
        type: 'linear',
        number: issueNumber,
        title: issue.title,
        body: issue.description?.slice(0, 5000),
        status: issue.state?.name,
        priority: issue.priority,
        assignee: issue.assignee?.name,
        url: issue.url,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get combined context from all issue references in a PR.
   */
  async getContextFromPR(prTitle, prBody, context = {}) {
    const refs = this.extractIssueRefs(prTitle, prBody);
    if (refs.length === 0) return { issues: [], summary: '' };

    const issues = [];
    for (const ref of refs.slice(0, 5)) { // Limit to 5 issues
      const issue = await this.fetchIssue(ref, context);
      if (issue) issues.push(issue);
    }

    let summary = '';
    if (issues.length > 0) {
      summary = '## Linked Issues\n\n';
      for (const issue of issues) {
        summary += `### ${issue.title} (${issue.type === 'github' ? '#' + issue.number : issue.key})\n`;
        summary += `- Status: ${issue.status || issue.state || 'unknown'}\n`;
        if (issue.body) {
          const truncated = issue.body.length > 1000 ? issue.body.slice(0, 1000) + '...' : issue.body;
          summary += `- Description: ${truncated}\n`;
        }
        if (issue.labels?.length > 0) summary += `- Labels: ${issue.labels.join(', ')}\n`;
        summary += '\n';
      }
    }

    return { issues, summary };
  }
}

export default LinkedIssueContext;

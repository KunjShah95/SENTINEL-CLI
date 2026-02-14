import axios from 'axios';
import path from 'path';

export class JiraIntegration {
  constructor(config = {}) {
    this.config = {
      baseUrl: config.baseUrl || process.env.JIRA_BASE_URL,
      email: config.email || process.env.JIRA_EMAIL,
      apiToken: config.apiToken || process.env.JIRA_API_TOKEN,
      projectKey: config.projectKey || process.env.JIRA_PROJECT_KEY,
      issueType: config.issueType || 'Bug',
    };
    this.client = this.createClient();
  }

  createClient() {
    if (!this.config.baseUrl || !this.config.email || !this.config.apiToken) {
      return null;
    }

    return axios.create({
      baseURL: `${this.config.baseUrl}/rest/api/3`,
      headers: {
        'Authorization': `Basic ${Buffer.from(`${this.config.email}:${this.config.apiToken}`).toString('base64')}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
  }

  isConfigured() {
    return this.client !== null;
  }

  /**
   * Create a Jira issue from a security finding
   */
  async createIssue(issue, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('Jira integration not configured');
    }

    const summary = this.formatSummary(issue);
    const description = this.formatDescription(issue);
    const priority = this.mapPriority(issue.severity);
    const labels = this.generateLabels(issue);

    try {
      const response = await this.client.post('/issue', {
        fields: {
          project: { key: options.projectKey || this.config.projectKey },
          summary,
          description: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: description }],
              },
            ],
          },
          issuetype: { name: options.issueType || this.config.issueType },
          priority: { name: priority },
          labels,
        },
      });

      return {
        success: true,
        key: response.data.key,
        url: `${this.config.baseUrl}/browse/${response.data.key}`,
      };
    } catch (error) {
      throw new Error(`Failed to create Jira issue: ${error.message}`);
    }
  }

  /**
   * Create multiple issues in bulk
   */
  async createBulkIssues(issues, options = {}) {
    const results = [];
    
    for (const issue of issues) {
      try {
        const result = await this.createIssue(issue, options);
        results.push({ issue, ...result });
      } catch (error) {
        results.push({ issue, success: false, error: error.message });
      }
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 200));
    }

    return {
      total: issues.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  }

  /**
   * Link existing issues to a security finding
   */
  async linkIssue(issueKey, issue, _relationship = 'relates to') {
    try {
      await this.client.post(`/issue/${issueKey}/remotelink`, {
        object: {
          url: `sentinel://issue/${issue.id || 'unknown'}`,
          title: `[Sentinel] ${issue.title || issue.message}`,
          summary: `${issue.severity?.toUpperCase()}: ${issue.file}:${issue.line}`,
        },
      });
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to link issue: ${error.message}`);
    }
  }

  /**
   * Search for existing related issues
   */
  async searchIssues(query) {
    try {
      const response = await this.client.get('/search', {
        params: {
          jql: query,
          maxResults: 10,
        },
      });
      return response.data.issues;
    } catch (error) {
      throw new Error(`Failed to search issues: ${error.message}`);
    }
  }

  /**
   * Get issue details
   */
  async getIssue(issueKey) {
    try {
      const response = await this.client.get(`/issue/${issueKey}`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get issue: ${error.message}`);
    }
  }

  /**
   * Add comment to an issue
   */
  async addComment(issueKey, comment) {
    try {
      await this.client.post(`/issue/${issueKey}/comment`, {
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: comment }],
            },
          ],
        },
      });
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to add comment: ${error.message}`);
    }
  }

  /**
   * Transition issue to different status
   */
  async transitionIssue(issueKey, transitionId) {
    try {
      await this.client.post(`/issue/${issueKey}/transitions`, {
        transition: { id: transitionId },
      });
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to transition issue: ${error.message}`);
    }
  }

  /**
   * Get available transitions
   */
  async getTransitions(issueKey) {
    try {
      const response = await this.client.get(`/issue/${issueKey}/transitions`);
      return response.data.transitions;
    } catch (error) {
      throw new Error(`Failed to get transitions: ${error.message}`);
    }
  }

  formatSummary(issue) {
    const prefix = issue.severity === 'critical' ? '[SECURITY]' : '[Code Review]';
    return `${prefix} ${issue.title || issue.message || issue.type} in ${path.basename(issue.file)}`;
  }

  formatDescription(issue) {
    return `## Security Finding

*Found by Sentinel CLI*

### Details
- **Severity:** ${issue.severity || 'Unknown'}
- **Type:** ${issue.type || 'security'}
- **File:** \`${issue.file}:${issue.line}\`
- **Analyzer:** ${issue.analyzer || 'Unknown'}

### Message
${issue.message || 'No message provided'}

### Suggestion
${issue.suggestion || 'Review and remediate as appropriate'}

### Code Snippet
\`\`\`
${issue.snippet || 'No snippet available'}
\`\`\`

---
_Generated by Sentinel CLI_`;
  }

  mapPriority(severity) {
    const mapping = {
      critical: 'Highest',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
      info: 'Lowest',
    };
    return mapping[severity] || 'Medium';
  }

  generateLabels(issue) {
    const labels = ['sentinel', 'automated'];
    
    if (issue.severity) labels.push(issue.severity);
    if (issue.analyzer) labels.push(issue.analyzer);
    if (issue.type) labels.push(issue.type);
    
    return [...new Set(labels)];
  }
}

/**
 * Create Jira issues from analysis results
 */
export async function createJiraTickets(issues, options = {}) {
  const jira = new JiraIntegration(options);
  
  if (!jira.isConfigured()) {
    throw new Error('Jira is not configured. Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN environment variables.');
  }

  // Filter issues by severity
  const criticalIssues = issues.filter(i => i.severity === 'critical');
  const highIssues = issues.filter(i => i.severity === 'high');
  
  const results = {
    critical: { created: 0, errors: [] },
    high: { created: 0, errors: [] },
  };

  // Create issues for critical findings
  if (criticalIssues.length > 0) {
    console.log(`Creating Jira tickets for ${criticalIssues.length} critical issues...`);
    const result = await jira.createBulkIssues(criticalIssues, { 
      ...options, 
      issueType: 'Bug' 
    });
    results.critical = { created: result.successful, errors: result.results.filter(r => !r.success) };
  }

  // Create issues for high severity
  if (highIssues.length > 0) {
    console.log(`Creating Jira tickets for ${highIssues.length} high severity issues...`);
    const result = await jira.createBulkIssues(highIssues, { 
      ...options, 
      issueType: 'Task' 
    });
    results.high = { created: result.successful, errors: result.results.filter(r => !r.success) };
  }

  return results;
}

export default JiraIntegration;

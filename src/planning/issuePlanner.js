/**
 * Issue Planner
 *
 * Fetches issue details from GitHub/GitLab/Jira/Linear and generates
 * codebase-aware implementation plans.
 */

import { LinkedIssueContext } from '../context/linkedIssueContext.js';

export class IssuePlanner {
  constructor(options = {}) {
    this.llmClient = options.llmClient || null;
    this.issueContext = options.issueContext || new LinkedIssueContext(options);
    this.githubToken = options.githubToken || process.env.GITHUB_TOKEN;
    this.gitlabToken = options.gitlabToken || process.env.GITLAB_TOKEN;
  }

  /**
   * Plan implementation from an issue URL.
   * @param {string} issueUrl - Full URL to the issue (GitHub/GitLab/Jira/Linear)
   * @param {object} repoContext - { owner, repo, repoPath, languages, structure }
   */
  async planFromIssue(issueUrl, repoContext = {}) {
    const issue = await this.fetchIssueFromUrl(issueUrl, repoContext);
    if (!issue) {
      throw new Error(`Could not fetch issue from: ${issueUrl}`);
    }

    const codebaseContext = await this.gatherCodebaseContext(repoContext);

    return {
      issue,
      plan: await this.generatePlan(issue, codebaseContext, repoContext),
      codebaseContext,
    };
  }

  /**
   * Fetch issue details from a URL.
   */
  async fetchIssueFromUrl(issueUrl, context = {}) {
    // GitHub issue URL
    const githubMatch = issueUrl.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/i);
    if (githubMatch) {
      const ref = { type: 'github', number: parseInt(githubMatch[3]) };
      return this.issueContext.fetchIssue(ref, {
        owner: githubMatch[1],
        repo: githubMatch[2],
        ...context,
      });
    }

    // GitLab MR/Issue URL
    const gitlabMatch = issueUrl.match(/gitlab[^/]*\.com\/(.+)\/-\/issues\/(\d+)/i);
    if (gitlabMatch) {
      return this.fetchGitLabIssue(gitlabMatch[1], parseInt(gitlabMatch[2]));
    }

    // Jira URL
    const jiraMatch = issueUrl.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/i);
    if (jiraMatch) {
      return this.issueContext.fetchIssue({ type: 'jira', key: jiraMatch[1] });
    }

    // Linear URL
    const linearMatch = issueUrl.match(/linear\.app\/.*?(\d+)/i);
    if (linearMatch) {
      return this.issueContext.fetchIssue({ type: 'linear', number: parseInt(linearMatch[1]) });
    }

    // Try as Jira key directly
    const directJira = issueUrl.match(/^([A-Z][A-Z0-9]+-\d+)$/);
    if (directJira) {
      return this.issueContext.fetchIssue({ type: 'jira', key: directJira[1] });
    }

    return null;
  }

  /**
   * Fetch a GitLab issue.
   */
  async fetchGitLabIssue(projectPath, issueNumber) {
    if (!this.gitlabToken) return null;

    try {
      const baseUrl = process.env.GITLAB_BASE_URL || 'https://gitlab.com';
      const encodedPath = encodeURIComponent(projectPath);
      const response = await fetch(`${baseUrl}/api/v4/projects/${encodedPath}/issues/${issueNumber}`, {
        headers: { 'PRIVATE-TOKEN': this.gitlabToken },
      });

      if (!response.ok) return null;
      const data = await response.json();

      return {
        type: 'gitlab',
        number: data.iid,
        title: data.title,
        body: data.description?.slice(0, 5000),
        labels: data.labels || [],
        state: data.state,
        assignee: data.assignee?.name,
        url: data.web_url,
      };
    } catch {
      return null;
    }
  }

  /**
   * Gather codebase context for plan generation.
   */
  async gatherCodebaseContext(repoContext) {
    const context = {
      languages: repoContext.languages || [],
      structure: repoContext.structure || {},
      entryPoints: [],
      existingPatterns: [],
    };

    if (repoContext.repoPath) {
      try {
        const { execSync } = await import('child_process');
        const fs = await import('fs');

        // Detect languages from file extensions
        const files = execSync(
          `find "${repoContext.repoPath}" -type f -name "*.js" -o -name "*.ts" -o -name "*.py" -o -name "*.go" -o -name "*.java" -o -name "*.rs" -o -name "*.rb" 2>/dev/null | head -100`,
          { encoding: 'utf-8', timeout: 5000 }
        ).trim().split('\n').filter(Boolean);

        const extCounts = {};
        for (const file of files) {
          const ext = file.split('.').pop();
          extCounts[ext] = (extCounts[ext] || 0) + 1;
        }
        context.languages = Object.entries(extCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([ext]) => ext);

        // Detect key directories
        const dirs = execSync(
          `ls -d "${repoContext.repoPath}"/*/ 2>/dev/null || echo ""`,
          { encoding: 'utf-8', timeout: 3000 }
        ).trim().split('\n').filter(Boolean);
        context.structure = { directories: dirs.map(d => d.replace(repoContext.repoPath, '')) };

        // Find test patterns
        const testFiles = files.filter(f => /test|spec/.test(f));
        context.testPattern = testFiles.length > 0 ? 'detected' : 'none';
      } catch {
        // Use provided context
      }
    }

    return context;
  }

  /**
   * Generate an implementation plan from issue + codebase context.
   */
  async generatePlan(issue, codebaseContext, repoContext) {
    if (!this.llmClient) {
      return this.generateStaticPlan(issue, codebaseContext);
    }

    const prompt = `You are a senior software engineer creating an implementation plan.

ISSUE: ${issue.title}
${issue.body ? `Description: ${issue.body}` : ''}
Labels: ${(issue.labels || []).join(', ')}

CODEBASE CONTEXT:
Languages: ${codebaseContext.languages.join(', ')}
Structure: ${JSON.stringify(codebaseContext.structure)}
Test pattern: ${codebaseContext.testPattern || 'unknown'}

Generate a detailed implementation plan with:
1. Analysis: What needs to be done?
2. Files to create/modify (with specific paths)
3. Step-by-step implementation tasks
4. Code snippets or pseudocode for key changes
5. Tests to add
6. Edge cases to consider
7. Estimated effort (in story points or hours)

Format as a structured markdown plan.`;

    try {
      const response = await this.llmClient.chat(
        [{ role: 'user', content: prompt }],
        { maxTokens: 3000, timeout: 30_000 }
      );

      const content = response.content || response.message?.content;
      if (content) {
        return {
          type: 'llm',
          content,
          issue: issue.title,
          steps: this.parsePlanSteps(content),
        };
      }
    } catch {
      // Fallback to static plan
    }

    return this.generateStaticPlan(issue, codebaseContext);
  }

  /**
   * Generate a static plan without LLM.
   */
  generateStaticPlan(issue, codebaseContext) {
    const steps = [];
    const title = (issue.title || '').toLowerCase();

    // Analyze issue type from title/labels
    const isBugFix = /bug|fix|error|crash|broken|issue/i.test(title) ||
      (issue.labels || []).some(l => /bug|fix/i.test(l));
    const isFeature = /add|implement|create|build|new|feature/i.test(title) ||
      (issue.labels || []).some(l => /feature|enhancement/i.test(l));
    const isRefactor = /refactor|clean|improve|optimize|restructure/i.test(title) ||
      (issue.labels || []).some(l => /refactor/i.test(l));

    if (isBugFix) {
      steps.push(
        { title: 'Reproduce the bug', description: 'Create a minimal reproduction case', type: 'analysis' },
        { title: 'Identify root cause', description: 'Trace the bug to its source', type: 'analysis' },
        { title: 'Write failing test', description: 'Add a test that demonstrates the bug', type: 'test' },
        { title: 'Implement fix', description: 'Fix the root cause', type: 'implementation' },
        { title: 'Verify fix', description: 'Run tests and verify the fix works', type: 'test' }
      );
    } else if (isFeature) {
      steps.push(
        { title: 'Design the feature', description: 'Define API/data model/UX', type: 'analysis' },
        { title: 'Create data models', description: 'Add schemas/types for the new feature', type: 'implementation' },
        { title: 'Implement core logic', description: 'Build the main functionality', type: 'implementation' },
        { title: 'Add API endpoints', description: 'Expose the feature via API', type: 'implementation' },
        { title: 'Write tests', description: 'Unit and integration tests', type: 'test' },
        { title: 'Update documentation', description: 'Document the new feature', type: 'documentation' }
      );
    } else if (isRefactor) {
      steps.push(
        { title: 'Analyze current code', description: 'Understand existing structure', type: 'analysis' },
        { title: 'Design new structure', description: 'Plan the refactored architecture', type: 'analysis' },
        { title: 'Refactor incrementally', description: 'Make small, testable changes', type: 'implementation' },
        { title: 'Ensure tests pass', description: 'Verify no regressions', type: 'test' },
        { title: 'Clean up', description: 'Remove dead code, update imports', type: 'cleanup' }
      );
    } else {
      steps.push(
        { title: 'Analyze requirements', description: 'Understand what needs to be done', type: 'analysis' },
        { title: 'Plan implementation', description: 'Design the approach', type: 'analysis' },
        { title: 'Implement changes', description: 'Make the code changes', type: 'implementation' },
        { title: 'Write tests', description: 'Add test coverage', type: 'test' },
        { title: 'Review and verify', description: 'Self-review and validate', type: 'verification' }
      );
    }

    return {
      type: 'static',
      content: this.formatStaticPlan(issue, steps, codebaseContext),
      issue: issue.title,
      steps,
    };
  }

  /**
   * Parse plan steps from LLM output.
   */
  parsePlanSteps(content) {
    const steps = [];
    const stepPattern = /(?:^|\n)(?:\d+\.\s*|\*\*|#{2,3}\s*)([^\n]+)/g;
    let match;
    while ((match = stepPattern.exec(content)) !== null) {
      steps.push({
        title: match[1].replace(/[*#]/g, '').trim(),
        description: '',
        type: 'implementation',
      });
    }
    return steps;
  }

  /**
   * Format a static plan as markdown.
   */
  formatStaticPlan(issue, steps, codebaseContext) {
    let plan = `# Implementation Plan: ${issue.title}\n\n`;
    plan += `**Issue:** ${issue.url || issue.title}\n`;
    plan += `**Type:** ${(issue.labels || []).join(', ') || 'general'}\n`;
    plan += `**Codebase Languages:** ${codebaseContext.languages.join(', ') || 'unknown'}\n\n`;

    plan += '## Steps\n\n';
    for (let i = 0; i < steps.length; i++) {
      plan += `${i + 1}. **${steps[i].title}** — ${steps[i].description}\n`;
    }

    plan += '\n## Notes\n\n';
    plan += '- Follow existing code patterns and conventions\n';
    plan += '- Add tests for all new functionality\n';
    plan += '- Update documentation as needed\n';

    return plan;
  }
}

export default IssuePlanner;

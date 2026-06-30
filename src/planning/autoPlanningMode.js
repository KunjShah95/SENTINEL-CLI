/**
 * Auto Planning Mode
 *
 * Automatically generates implementation plans when issues match configured rules.
 * Monitors issue creation/labeling events and triggers plan generation.
 */

import { IssuePlanner } from './issuePlanner.js';
import { PlanGenerator } from './planGenerator.js';

export class AutoPlanningMode {
  constructor(options = {}) {
    this.llmClient = options.llmClient || null;
    this.issuePlanner = options.issuePlanner || new IssuePlanner(options);
    this.planGenerator = options.planGenerator || new PlanGenerator(options);
    this.config = options.config || {};
    this.enabled = options.enabled ?? false;
    this.plans = new Map(); // issueKey → plan
    this.rules = options.rules || [];
  }

  /**
   * Check if auto-planning is enabled in config.
   */
  isEnabled() {
    return this.enabled || this.config?.planning?.auto_plan === true;
  }

  /**
   * Evaluate an issue event and decide if a plan should be generated.
   * @param {object} event - { action, issue, repository }
   */
  async evaluateIssueEvent(event) {
    if (!this.isEnabled()) {
      return { shouldPlan: false, reason: 'Auto-planning disabled' };
    }

    const { action, issue } = event;
    if (!issue) return { shouldPlan: false, reason: 'No issue in event' };

    // Only plan on opened, labeled, or milestoned events
    const planActions = ['opened', 'labeled', 'milestoned', 'assigned'];
    if (!planActions.includes(action)) {
      return { shouldPlan: false, reason: `Action '${action}' does not trigger planning` };
    }

    // Check rules
    if (this.rules.length > 0) {
      const matchesRule = this.rules.some(rule => this.matchesRule(issue, rule));
      if (!matchesRule) {
        return { shouldPlan: false, reason: 'Issue does not match any planning rule' };
      }
    }

    // Check for planning labels
    const planLabels = this.config?.planning?.trigger_labels || ['plan', 'needs-plan', 'planning'];
    const issueLabels = (issue.labels || []).map(l => (typeof l === 'string' ? l : l.name).toLowerCase());
    const hasPlanLabel = issueLabels.some(l => planLabels.includes(l));

    if (this.rules.length === 0 && !hasPlanLabel && action !== 'opened') {
      return { shouldPlan: false, reason: 'No matching planning label' };
    }

    return {
      shouldPlan: true,
      reason: `Issue #${issue.number} matches planning criteria`,
      issue,
    };
  }

  /**
   * Check if an issue matches a specific rule.
   */
  matchesRule(issue, rule) {
    const labels = (issue.labels || []).map(l => (typeof l === 'string' ? l : l.name).toLowerCase());
    const title = (issue.title || '').toLowerCase();

    // Label match
    if (rule.labels && rule.labels.length > 0) {
      if (!rule.labels.some(l => labels.includes(l.toLowerCase()))) {
        return false;
      }
    }

    // Title pattern match
    if (rule.title_pattern) {
      const pattern = new RegExp(rule.title_pattern, 'i');
      if (!pattern.test(title)) return false;
    }

    // Milestone match
    if (rule.milestones && rule.milestones.length > 0) {
      const milestone = issue.milestone?.title?.toLowerCase();
      if (!milestone || !rule.milestones.some(m => m.toLowerCase() === milestone)) {
        return false;
      }
    }

    // Assignee match
    if (rule.assignees && rule.assignees.length > 0) {
      const assignee = issue.assignee?.login?.toLowerCase();
      if (!assignee || !rule.assignees.some(a => a.toLowerCase() === assignee)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Generate a plan for an issue automatically.
   */
  async generateAutoPlan(event, repoContext = {}) {
    const { issue } = event;
    if (!issue) throw new Error('No issue provided for auto-planning');

    const issueKey = `${event.repository?.full_name || 'local'}#${issue.number}`;

    // Check if we already have a plan
    if (this.plans.has(issueKey)) {
      return { cached: true, plan: this.plans.get(issueKey) };
    }

    const issueData = {
      title: issue.title,
      body: issue.body,
      labels: (issue.labels || []).map(l => typeof l === 'string' ? l : l.name),
      url: issue.html_url || issue.url,
      number: issue.number,
    };

    const codebaseContext = await this.issuePlanner.gatherCodebaseContext(repoContext);
    const planResult = await this.planGenerator.generate(issueData, codebaseContext);

    const plan = {
      issueKey,
      issueTitle: issue.title,
      issueUrl: issue.html_url || issue.url,
      generatedAt: new Date().toISOString(),
      ...planResult,
    };

    this.plans.set(issueKey, plan);

    return { cached: false, plan };
  }

  /**
   * Get all generated plans.
   */
  getPlans() {
    return [...this.plans.values()];
  }

  /**
   * Get a specific plan by issue key.
   */
  getPlan(issueKey) {
    return this.plans.get(issueKey) || null;
  }

  /**
   * Format auto-plan result as a PR/issue comment.
   */
  formatAsComment(plan) {
    let body = '## 🛡️ Sentinel Auto-Plan\n\n';
    body += `**Issue:** ${plan.issueTitle}\n`;
    body += `**Generated:** ${plan.generatedAt}\n\n`;

    if (plan.summary) {
      body += `**Summary:** ${plan.summary}\n\n`;
    }

    if (plan.estimatedEffort) {
      body += `**Effort:** ${plan.estimatedEffort.complexity} (~${plan.estimatedEffort.hours}h, ${plan.estimatedEffort.storyPoints} SP)\n\n`;
    }

    if (plan.steps?.length > 0) {
      body += '### Implementation Steps\n\n';
      for (const step of plan.steps) {
        body += `${step.id}. **${step.title}** — ${step.description}\n`;
        if (step.files?.length > 0) {
          body += `   Files: ${step.files.map(f => `\`${f}\``).join(', ')}\n`;
        }
      }
      body += '\n';
    }

    if (plan.risks?.length > 0) {
      body += '### Risks\n\n';
      for (const risk of plan.risks) {
        body += `- ⚠️ ${risk}\n`;
      }
      body += '\n';
    }

    body += '---\n_Powered by [Sentinel CLI](https://github.com/KunjShah95/SENTINEL-CLI)_';
    return body;
  }
}

export default AutoPlanningMode;

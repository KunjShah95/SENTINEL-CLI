/**
 * Plan Generator
 *
 * LLM-powered plan generation with file paths, code changes,
 * step-by-step rationale, and effort estimation.
 */

export class PlanGenerator {
  constructor(options = {}) {
    this.llmClient = options.llmClient || null;
  }

  /**
   * Generate a detailed plan from issue context and codebase info.
   * @param {object} issue - Issue details
   * @param {object} codebaseContext - Codebase structure, languages, patterns
   * @param {object} options - Additional options
   */
  async generate(issue, codebaseContext, options = {}) {
    const plan = {
      title: issue.title,
      issueUrl: issue.url,
      createdAt: new Date().toISOString(),
      steps: [],
      filesToChange: [],
      estimatedEffort: null,
      risks: [],
      tests: [],
    };

    if (this.llmClient) {
      const llmPlan = await this.generateLLMPlan(issue, codebaseContext, options);
      if (llmPlan) {
        return { ...plan, ...llmPlan };
      }
    }

    return this.generateTemplatePlan(issue, codebaseContext, options);
  }

  /**
   * Generate a plan using LLM with structured output.
   */
  async generateLLMPlan(issue, codebaseContext, options) {
    const prompt = `You are a senior engineer creating a detailed implementation plan.

ISSUE: ${issue.title}
${issue.body ? `\nDescription:\n${issue.body.slice(0, 3000)}` : ''}
Labels: ${(issue.labels || []).join(', ')}

CODEBASE:
Languages: ${codebaseContext.languages?.join(', ') || 'unknown'}
Directories: ${JSON.stringify(codebaseContext.structure?.directories || [])}
Test pattern: ${codebaseContext.testPattern || 'unknown'}

${options.additionalContext || ''}

Generate a JSON plan with this exact structure:
{
  "summary": "2-3 sentence overview",
  "steps": [
    {
      "id": 1,
      "title": "Step title",
      "description": "What to do",
      "files": ["path/to/file.js"],
      "type": "create|modify|delete",
      "codeSnippet": "optional pseudocode or example",
      "rationale": "why this step"
    }
  ],
  "filesToChange": [
    { "path": "src/example.js", "action": "modify", "reason": "Add new handler" }
  ],
  "estimatedEffort": { "hours": 4, "complexity": "medium", "storyPoints": 3 },
  "risks": ["Risk description"],
  "tests": ["test description"]
}`;

    try {
      const response = await this.llmClient.chat(
        [{ role: 'user', content: prompt }],
        { maxTokens: 4000, timeout: 30_000 }
      );

      const content = response.content || response.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      return null;
    }
  }

  /**
   * Generate a template-based plan without LLM.
   */
  generateTemplatePlan(issue, codebaseContext, options) {
    const title = (issue.title || '').toLowerCase();
    const labels = (issue.labels || []).map(l => l.toLowerCase());
    const languages = codebaseContext.languages || ['js'];
    const primaryLang = languages[0] || 'js';

    const isBug = /bug|fix|error|crash/i.test(title) || labels.some(l => /bug|fix/.test(l));
    const isFeature = /add|feature|implement|create|new/i.test(title) || labels.some(l => /feature|enhancement/.test(l));

    const steps = [];
    const filesToChange = [];
    const tests = [];

    if (isBug) {
      steps.push(
        { id: 1, title: 'Reproduce', description: 'Create minimal reproduction', type: 'analysis' },
        { id: 2, title: 'Root cause analysis', description: 'Identify the source of the bug', type: 'analysis' },
        { id: 3, title: 'Write failing test', description: 'Add test case that demonstrates the bug', type: 'test' },
        { id: 4, title: 'Fix', description: 'Implement the fix', type: 'modify' },
        { id: 5, title: 'Verify', description: 'Ensure all tests pass', type: 'test' }
      );
      tests.push('Regression test for the bug scenario');
    } else if (isFeature) {
      steps.push(
        { id: 1, title: 'Design', description: 'Define interface/data model', type: 'analysis' },
        { id: 2, title: 'Data layer', description: 'Create models/types/schemas', type: 'create' },
        { id: 3, title: 'Business logic', description: 'Implement core functionality', type: 'create' },
        { id: 4, title: 'API/integration', description: 'Wire up the feature', type: 'modify' },
        { id: 5, title: 'Tests', description: 'Add comprehensive tests', type: 'create' },
        { id: 6, title: 'Documentation', description: 'Update docs', type: 'modify' }
      );
      tests.push('Unit tests for new functions', 'Integration test for the feature flow');
    } else {
      steps.push(
        { id: 1, title: 'Analyze', description: 'Understand requirements', type: 'analysis' },
        { id: 2, title: 'Implement', description: 'Make changes', type: 'modify' },
        { id: 3, title: 'Test', description: 'Verify changes', type: 'test' }
      );
      tests.push('Tests for modified functionality');
    }

    return {
      summary: `${isBug ? 'Bug fix' : isFeature ? 'Feature implementation' : 'Code change'} for: ${issue.title}`,
      steps,
      filesToChange,
      estimatedEffort: this.estimateEffort(issue, steps),
      risks: this.identifyRisks(issue, primaryLang),
      tests,
    };
  }

  /**
   * Estimate effort based on issue complexity.
   */
  estimateEffort(issue, steps) {
    const labels = (issue.labels || []).map(l => l.toLowerCase());
    const bodyLength = (issue.body || '').length;

    let complexity = 'medium';
    let hours = 4;
    let storyPoints = 3;

    if (labels.some(l => /easy|simple|small|good.first.issue/.test(l))) {
      complexity = 'small'; hours = 2; storyPoints = 1;
    } else if (labels.some(l => /hard|complex|large|epic/.test(l))) {
      complexity = 'large'; hours = 16; storyPoints = 8;
    } else if (steps.length > 5 || bodyLength > 1000) {
      complexity = 'medium-large'; hours = 8; storyPoints = 5;
    }

    return { hours, complexity, storyPoints };
  }

  /**
   * Identify common risks for the implementation.
   */
  identifyRisks(issue, primaryLang) {
    const risks = [];
    const title = (issue.title || '').toLowerCase();

    if (/database|migration|schema/i.test(title)) {
      risks.push('Data migration may cause downtime or data loss');
      risks.push('Backward compatibility with existing data');
    }
    if (/api|endpoint|route/i.test(title)) {
      risks.push('Breaking existing API consumers');
      risks.push('Authentication/authorization changes');
    }
    if (/refactor|restructure/i.test(title)) {
      risks.push('Unintended behavior changes');
      risks.push('Missing test coverage for refactored code');
    }
    if (/performance|optimize/i.test(title)) {
      risks.push('Premature optimization may add complexity');
      risks.push('Need benchmarks to verify improvement');
    }

    if (risks.length === 0) {
      risks.push('Ensure existing tests still pass after changes');
    }

    return risks;
  }

  /**
   * Format a plan for display.
   */
  formatPlan(plan) {
    let output = `# Implementation Plan: ${plan.title}\n\n`;
    output += `**Summary:** ${plan.summary || ''}\n`;
    output += `**Effort:** ${plan.estimatedEffort?.complexity || 'unknown'} (~${plan.estimatedEffort?.hours || '?'}h, ${plan.estimatedEffort?.storyPoints || '?'} SP)\n\n`;

    output += '## Steps\n\n';
    for (const step of plan.steps) {
      output += `### ${step.id}. ${step.title}\n`;
      output += `${step.description}\n`;
      if (step.files?.length > 0) {
        output += `**Files:** ${step.files.map(f => `\`${f}\``).join(', ')}\n`;
      }
      if (step.codeSnippet) {
        output += `\n\`\`\`\n${step.codeSnippet}\n\`\`\`\n`;
      }
      if (step.rationale) {
        output += `> ${step.rationale}\n`;
      }
      output += '\n';
    }

    if (plan.filesToChange?.length > 0) {
      output += '## Files to Change\n\n';
      output += '| File | Action | Reason |\n|------|--------|--------|\n';
      for (const f of plan.filesToChange) {
        output += `| \`${f.path}\` | ${f.action} | ${f.reason} |\n`;
      }
      output += '\n';
    }

    if (plan.risks?.length > 0) {
      output += '## Risks\n\n';
      for (const risk of plan.risks) {
        output += `- ⚠️ ${risk}\n`;
      }
      output += '\n';
    }

    if (plan.tests?.length > 0) {
      output += '## Tests to Add\n\n';
      for (const test of plan.tests) {
        output += `- ${test}\n`;
      }
    }

    return output;
  }
}

export default PlanGenerator;

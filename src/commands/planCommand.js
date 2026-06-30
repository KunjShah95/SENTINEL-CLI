/**
 * Plan Command — sentinel plan <issue-url>
 *
 * Generates implementation plans from issue URLs.
 * Supports GitHub, GitLab, Jira, and Linear issues.
 */

import { IssuePlanner } from '../planning/issuePlanner.js';
import { PlanGenerator } from '../planning/planGenerator.js';

export class PlanCommand {
  constructor(options = {}) {
    this.llmClient = options.llmClient || null;
    this.issuePlanner = new IssuePlanner(options);
    this.planGenerator = new PlanGenerator(options);
  }

  /**
   * Execute the plan command.
   * @param {string} issueUrl - URL or key of the issue to plan
   * @param {object} options - { repoPath, owner, repo, output, format }
   */
  async execute(issueUrl, options = {}) {
    if (!issueUrl) {
      return {
        success: false,
        error: 'Usage: sentinel plan <issue-url>\n\nExamples:\n  sentinel plan https://github.com/owner/repo/issues/123\n  sentinel plan PROJ-456\n  sentinel plan https://gitlab.com/group/project/-/issues/789',
      };
    }

    console.log(`\n📋 Generating implementation plan for: ${issueUrl}\n`);

    // Gather repo context from current directory
    const repoContext = await this.detectRepoContext(options);

    try {
      // Fetch issue details
      const issue = await this.issuePlanner.fetchIssueFromUrl(issueUrl, repoContext);
      if (!issue) {
        return {
          success: false,
          error: `Could not fetch issue: ${issueUrl}\nEnsure the URL is correct and you have access.`,
        };
      }

      console.log(`  Issue: ${issue.title}`);
      console.log(`  Labels: ${(issue.labels || []).join(', ') || 'none'}`);
      console.log(`  Status: ${issue.state || issue.status || 'unknown'}\n`);

      // Gather codebase context
      const codebaseContext = await this.issuePlanner.gatherCodebaseContext(repoContext);
      console.log(`  Languages: ${codebaseContext.languages.join(', ') || 'unknown'}`);
      console.log(`  Test pattern: ${codebaseContext.testPattern || 'not detected'}\n`);

      // Generate plan
      console.log('  Generating plan...');
      const plan = await this.planGenerator.generate(issue, codebaseContext, {
        additionalContext: options.context,
      });

      // Format output
      const formatted = this.planGenerator.formatPlan({
        title: issue.title,
        ...plan,
      });

      if (options.output === 'json') {
        return {
          success: true,
          issue,
          plan,
          formatted,
        };
      }

      // Print to console
      console.log('\n' + formatted);

      // Optionally save to file
      if (options.save) {
        const fs = await import('fs');
        const filename = options.save === true
          ? `plan-${issue.number || Date.now()}.md`
          : options.save;
        fs.writeFileSync(filename, formatted);
        console.log(`\n💾 Plan saved to: ${filename}`);
      }

      return {
        success: true,
        issue,
        plan,
        formatted,
      };
    } catch (error) {
      return {
        success: false,
        error: `Plan generation failed: ${error.message}`,
      };
    }
  }

  /**
   * Detect repository context from current working directory.
   */
  async detectRepoContext(options) {
    const context = {
      repoPath: options.repoPath || process.cwd(),
      owner: options.owner,
      repo: options.repo,
      languages: [],
      structure: {},
    };

    try {
      const { execSync } = await import('child_process');

      // Try to detect git remote
      if (!context.owner || !context.repo) {
        const remote = execSync('git remote get-url origin 2>/dev/null', {
          encoding: 'utf-8',
          cwd: context.repoPath,
          timeout: 3000,
        }).trim();

        const ghMatch = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/i);
        if (ghMatch) {
          context.owner = ghMatch[1];
          context.repo = ghMatch[2];
        }

        const glMatch = remote.match(/gitlab[^/]*\.com[:/](.+)\/([^/.]+)/i);
        if (glMatch && !context.owner) {
          context.owner = glMatch[1];
          context.repo = glMatch[2];
        }
      }

      // Detect package.json for JS/TS projects
      const fs = await import('fs');
      const path = await import('path');
      const pkgPath = path.join(context.repoPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          context.packageName = pkg.name;
          context.hasTypescript = !!(pkg.devDependencies?.typescript || pkg.dependencies?.typescript);
        } catch { /* ignore */ }
      }
    } catch {
      // Use provided context
    }

    return context;
  }
}

export default PlanCommand;

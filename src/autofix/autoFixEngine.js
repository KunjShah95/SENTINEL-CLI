/**
 * Auto-Fix Engine
 *
 * Generates fix patches via LLM + pattern matching.
 * Creates fix branches, pushes commits to PR or creates fix PRs.
 */

import { FixGenerator } from './fixGenerator.js';
import { DocstringGenerator } from './docstringGenerator.js';
import { TestGenerator } from './testGenerator.js';
import { ConflictResolver } from './conflictResolver.js';
import { CustomRecipes } from './customRecipes.js';
import { configManager } from '../config/configManager.js';

export class AutoFixEngine {
  constructor(options = {}) {
    this.config = options.config || configManager;
    this.fixGenerator = options.fixGenerator || new FixGenerator(options);
    this.docstringGenerator = options.docstringGenerator || new DocstringGenerator();
    this.testGenerator = options.testGenerator || new TestGenerator(options);
    this.conflictResolver = options.conflictResolver || new ConflictResolver(options);
    this.customRecipes = options.customRecipes || new CustomRecipes();
    this.llmClient = options.llmClient || null;
    this.github = options.github || null;
  }

  /**
   * Process review issues and generate fixes.
   * @param {Array} issues - Issues from review pipeline
   * @param {object} context - { owner, repo, prNumber, branchName, headSha }
   * @returns {object} Fix results
   */
  async processFixes(issues, context = {}) {
    await this.config.load();
    const autofixConfig = this.config.getAutofixConfig();

    if (!autofixConfig.enabled) {
      return { fixes: [], skipped: true, reason: 'Autofix is disabled' };
    }

    const fixableIssues = issues.filter(i =>
      i.severity !== 'info' &&
      (i.confidence || 0.5) >= autofixConfig.confidence_threshold
    );

    const fixes = [];

    for (const issue of fixableIssues) {
      try {
        const fix = await this.fixGenerator.generateFix(issue);
        if (fix) {
          fixes.push({ issue, fix, confidence: fix.confidence });
        }
      } catch (error) {
        console.warn(`[autofix] Failed to generate fix for "${issue.title}": ${error.message}`);
      }
    }

    // Optionally generate docstrings
    if (autofixConfig.generate_docstrings) {
      const docFixes = await this.generateDocstrings(context.changedFiles || []);
      fixes.push(...docFixes);
    }

    // Optionally generate tests
    if (autofixConfig.generate_tests) {
      const testFixes = await this.generateTests(context.changedFiles || []);
      fixes.push(...testFixes);
    }

    // Push fixes to PR if auto_push is enabled
    if (autofixConfig.auto_push && fixes.length > 0 && context.owner) {
      await this.pushFixes(fixes, context);
    }

    return {
      fixes: fixes.map(f => ({
        issueTitle: f.issue?.title || f.title,
        fix: f.fix,
        confidence: f.confidence,
        type: f.type || 'auto-fix',
      })),
      total: fixes.length,
      fixable: fixableIssues.length,
      totalIssues: issues.length,
    };
  }

  /**
   * Generate docstrings for files missing documentation.
   */
  async generateDocstrings(changedFiles) {
    const fixes = [];
    for (const file of changedFiles) {
      try {
        const docFixes = await this.docstringGenerator.generateForFile(
          file.path, file.content || ''
        );
        for (const fix of docFixes) {
          fixes.push({
            title: `Add docstring: ${fix.symbol}`,
            type: 'docstring',
            fix: { path: file.path, line: fix.line, content: fix.docstring },
            confidence: 0.9,
          });
        }
      } catch { /* optional */ }
    }
    return fixes;
  }

  /**
   * Generate unit tests for changed files.
   */
  async generateTests(changedFiles) {
    const fixes = [];
    for (const file of changedFiles) {
      try {
        const tests = await this.testGenerator.generateForFile(
          file.path, file.content || ''
        );
        if (tests) {
          fixes.push({
            title: `Generate tests: ${file.path}`,
            type: 'test',
            fix: { path: tests.testFilePath, content: tests.content },
            confidence: 0.8,
          });
        }
      } catch { /* optional */ }
    }
    return fixes;
  }

  /**
   * Resolve merge conflicts.
   */
  async resolveConflicts(conflictContent) {
    return this.conflictResolver.resolve(conflictContent);
  }

  /**
   * Execute a custom recipe.
   */
  async executeRecipe(recipeName, context) {
    return this.customRecipes.execute(recipeName, context);
  }

  /**
   * Push fixes to a PR via Git Data API.
   */
  async pushFixes(fixes, context) {
    const gh = this.github || await this.getGitHub();
    if (!gh) return;

    const { owner, repo, prNumber, branchName } = context;
    const files = fixes
      .filter(f => f.fix?.content && f.fix?.path)
      .map(f => ({ path: f.fix.path, content: f.fix.content }));

    if (files.length === 0) return;

    try {
      await gh.pushToPR(
        owner, repo, prNumber, branchName, files,
        `Sentinel: Apply ${files.length} auto-fix(es)`
      );
    } catch (error) {
      console.error(`[autofix] Failed to push fixes: ${error.message}`);
    }
  }

  async getGitHub() {
    try {
      const { GitHubIntegration } = await import('../integrations/github.js');
      this.github = new GitHubIntegration({ token: process.env.GITHUB_TOKEN });
      return this.github;
    } catch {
      return null;
    }
  }
}

export default AutoFixEngine;

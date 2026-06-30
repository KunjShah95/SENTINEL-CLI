/**
 * Quality Gate Engine
 *
 * Runs built-in + custom checks before merge.
 * Returns pass/warn/fail with configurable enforcement modes.
 */

import { configManager } from '../config/configManager.js';
import { BuiltInChecks } from './builtInChecks.js';
import { CustomCheckRunner } from './customCheckRunner.js';
import { OverrideManager } from './overrideManager.js';

export class QualityGateEngine {
  constructor(options = {}) {
    this.config = options.config || configManager;
    this.builtInChecks = options.builtInChecks || new BuiltInChecks();
    this.customCheckRunner = options.customCheckRunner || new CustomCheckRunner(options);
    this.overrideManager = options.overrideManager || new OverrideManager();
    this.llmClient = options.llmClient || null;
  }

  /**
   * Run all quality gate checks for a PR.
   * @param {object} prContext - { owner, repo, prNumber, title, body, files, labels }
   * @returns {{ passed: boolean, results: Array, conclusion: string }}
   */
  async runChecks(prContext) {
    await this.config.load();
    const checksConfig = this.config.getPreMergeChecks();

    // Check for overrides
    const override = await this.overrideManager.getOverride(prContext.prNumber);
    if (override?.active) {
      return {
        passed: true,
        overridden: true,
        overrideReason: override.reason,
        overrideBy: override.author,
        results: [],
        conclusion: 'neutral',
      };
    }

    const results = [];

    // Run built-in checks
    if (checksConfig.docstring_coverage?.enabled) {
      const result = await this.builtInChecks.checkDocstringCoverage(
        prContext.files,
        checksConfig.docstring_coverage
      );
      results.push(result);
    }

    if (checksConfig.pr_title?.enabled) {
      const result = await this.builtInChecks.checkPRTitle(
        prContext.title,
        checksConfig.pr_title
      );
      results.push(result);
    }

    if (checksConfig.pr_description?.enabled) {
      const result = await this.builtInChecks.checkPRDescription(
        prContext.body,
        checksConfig.pr_description
      );
      results.push(result);
    }

    if (checksConfig.issue_assessment?.enabled) {
      const result = await this.builtInChecks.checkIssueAssessment(
        prContext,
        checksConfig.issue_assessment
      );
      results.push(result);
    }

    // Run custom checks
    if (checksConfig.custom_checks?.length > 0) {
      const customResults = await this.customCheckRunner.runAll(
        checksConfig.custom_checks,
        prContext
      );
      results.push(...customResults);
    }

    // Determine overall conclusion
    const hasError = results.some(r => r.status === 'fail' && r.mode === 'error');
    const hasWarning = results.some(r => r.status === 'fail' && r.mode === 'warning');
    const passed = !hasError;

    return {
      passed,
      results,
      conclusion: hasError ? 'failure' : hasWarning ? 'neutral' : 'success',
      errorCount: results.filter(r => r.status === 'fail' && r.mode === 'error').length,
      warningCount: results.filter(r => r.status === 'fail' && r.mode === 'warning').length,
    };
  }

  /**
   * Format quality gate results as a PR comment.
   */
  formatResultsComment(gateResults) {
    let body = '## 🛡️ Sentinel Pre-Merge Quality Gates\n\n';

    if (gateResults.overridden) {
      body += `⚠️ **Quality gates overridden** by ${gateResults.overrideBy}: ${gateResults.overrideReason}\n\n`;
      return body;
    }

    const statusEmoji = { pass: '✅', fail: '❌', warn: '⚠️' };
    const modeLabel = { error: 'blocking', warning: 'non-blocking' };

    body += `**Overall:** ${gateResults.passed ? '✅ PASSED' : '❌ FAILED'}\n\n`;
    body += '| Check | Status | Mode | Details |\n';
    body += '|-------|--------|------|---------|\n';

    for (const result of gateResults.results) {
      const emoji = statusEmoji[result.status] || '❓';
      const mode = modeLabel[result.mode] || result.mode;
      body += `| ${result.name} | ${emoji} ${result.status} | ${mode} | ${result.message || ''} |\n`;
    }

    if (!gateResults.passed) {
      body += '\n❌ **Action Required:** Fix the blocking issues before merging.\n';
    }

    body += '\n---\n_Powered by [Sentinel CLI](https://github.com/KunjShah95/SENTINEL-CLI)_';
    return body;
  }
}

export default QualityGateEngine;

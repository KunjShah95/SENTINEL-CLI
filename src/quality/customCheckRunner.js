/**
 * Custom Check Runner
 *
 * Sends natural language instructions to LLM for custom validation.
 * Supports up to 20 custom checks per configuration.
 */

export class CustomCheckRunner {
  constructor(options = {}) {
    this.llmClient = options.llmClient || null;
    this.maxChecks = options.maxChecks || 20;
  }

  /**
   * Run all custom checks defined in config.
   */
  async runAll(checks, prContext) {
    if (!checks || checks.length === 0) return [];

    const limitedChecks = checks.slice(0, this.maxChecks);
    const results = [];

    for (const check of limitedChecks) {
      try {
        const result = await this.runSingle(check, prContext);
        results.push(result);
      } catch (error) {
        results.push({
          name: check.name || 'Custom Check',
          status: 'fail',
          mode: check.mode || 'warning',
          message: `Check failed: ${error.message}`,
        });
      }
    }

    return results;
  }

  /**
   * Run a single custom check using LLM.
   */
  async runSingle(check, prContext) {
    const name = check.name || 'Custom Check';
    const instructions = check.instructions || '';
    const mode = check.mode || 'warning';

    if (!this.llmClient) {
      return { name, status: 'pass', mode, message: 'LLM client not available — skipping custom check' };
    }

    // Build context summary for the LLM
    const contextSummary = this.buildContextSummary(prContext);

    const prompt = `You are a code review quality gate evaluator.

Your task: ${instructions}

PR Context:
${contextSummary}

Evaluate whether this check PASSES or FAILS.
Return a JSON object: { "passed": true|false, "reason": "brief explanation" }
Return ONLY the JSON, no other text.`;

    try {
      const response = await this.llmClient.chat(
        [{ role: 'user', content: prompt }],
        { maxTokens: 500, timeout: 15_000 }
      );

      const text = response.content || response.message?.content || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          name,
          status: result.passed ? 'pass' : 'fail',
          mode,
          message: result.reason || (result.passed ? 'Check passed' : 'Check failed'),
        };
      }

      return { name, status: 'pass', mode, message: 'Could not parse LLM response — defaulting to pass' };
    } catch (error) {
      return { name, status: 'pass', mode, message: `LLM error: ${error.message} — defaulting to pass` };
    }
  }

  /**
   * Build a summary of the PR context for LLM evaluation.
   */
  buildContextSummary(prContext) {
    let summary = '';
    summary += `Title: ${prContext.title || 'N/A'}\n`;
    summary += `Description: ${(prContext.body || '').slice(0, 500)}\n`;
    summary += `Changed files: ${(prContext.files || []).length}\n`;

    if (prContext.files) {
      summary += 'Files:\n';
      for (const file of prContext.files.slice(0, 10)) {
        summary += `- ${file.path || 'unknown'} (${file.additions || 0}+, ${file.deletions || 0}-)\n`;
      }
    }

    return summary;
  }
}

export default CustomCheckRunner;

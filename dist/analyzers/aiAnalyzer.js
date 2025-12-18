import BaseAnalyzer from './baseAnalyzer.js';
import LLMOrchestrator from '../llm/llmOrchestrator.js';
import AnalysisCache from '../utils/analysisCache.js';

export class AIAnalyzer extends BaseAnalyzer {
  constructor(config = null) {
    super('AIAnalyzer', config);
    if (!config) {
      console.warn('AIAnalyzer initialized without config');
      this.enabled = false;
      return;
    }

    this.aiConfig = config.get('ai') || {};
    this.enabled = Boolean(this.aiConfig.enabled);
    this.orchestrator = new LLMOrchestrator(this.aiConfig);
    this.cacheConfig = this.aiConfig.cache || {};
    this.cacheEnabled = this.cacheConfig.enabled !== false;
    this.cache = this.cacheEnabled ? new AnalysisCache(this.cacheConfig) : null;
  }

  async analyze(files, context) {
    if (!this.enabled) return [];
    if (!this.orchestrator || this.orchestrator.providers.length === 0) {
      return [];
    }

    this.reset();
    const startTime = Date.now();

    for (const file of files) {
      if (!this.shouldAnalyzeFile(file.path)) continue;

      this.stats.filesAnalyzed++;
      this.stats.linesAnalyzed += file.content.split('\n').length;

      await this.analyzeFile(file.path, file.content, context);
    }

    this.stats.executionTime = Date.now() - startTime;
    return this.getIssues();
  }

  async analyzeFile(filePath, content, context) {
    try {
      const cachedPayload =
        this.cacheEnabled && this.cache ? await this.cache.get(filePath, content) : null;

      let mergedIssues = cachedPayload?.issues;
      let providerFindings = cachedPayload?.providerFindings;

      if (!mergedIssues) {
        const prompt = this.createPrompt(filePath, content, context);
        const review = await this.orchestrator.review(prompt, { filePath });
        mergedIssues = review.mergedIssues || [];
        providerFindings = review.providerFindings || [];

        if (this.cacheEnabled && this.cache) {
          await this.cache.set(filePath, content, {
            issues: mergedIssues,
            providerFindings,
          });
        }
      }

      for (const issue of mergedIssues || []) {
        this.addIssue({
          ...issue,
          file: issue.file || filePath,
          column: issue.column || 1,
          metadata: {
            ...(issue.metadata || {}),
            sourceProviders: issue.sourceProviders,
          },
        });
      }
    } catch (error) {
      console.warn(`[AI Analyzer] Failed to analyze ${filePath}: ${error.message}`);
    }
  }

  createPrompt(filePath, content, context = {}) {
    const contextLines = [
      context.commit ? `Commit: ${context.commit}` : null,
      context.branch ? `Branch: ${context.branch}` : null,
      context.staged ? 'Scope: staged changes' : null,
    ]
      .filter(Boolean)
      .join('\n');

    return `
You are an expert Senior Software Engineer performing a deep code review.
File under review: ${filePath}
${contextLines}

Code:
\`\`\`
${content}
\`\`\`

Instructions:
- Only report issues that can be verified from the snippet.
- Focus on bugs, security vulnerabilities, performance regressions, and important code quality risks.
- Return STRICT JSON with this schema:
{
  "issues": [
    {
      "severity": "critical|high|medium|low|info",
      "type": "security|bug|performance|quality",
      "title": "Short issue title",
      "message": "What is wrong and why it matters",
      "line": <line_number>,
      "suggestion": "Actionable remediation guidance",
      "confidence": <0-1 float>
    }
  ]
}
- If nothing is found respond with {"issues": []}.
`.trim();
  }
}

export default AIAnalyzer;

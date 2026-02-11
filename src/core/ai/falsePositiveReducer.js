import { EventBus } from '../events/eventBus.js';
import { MetricsCollector } from '../metrics/metricsCollector.js';

class FalsePositiveReducer {
  constructor(options = {}) {
    this.eventBus = options.eventBus || new EventBus();
    this.metrics = options.metrics || new MetricsCollector({ serviceName: 'false-positive-reducer' });
    this.learningData = new Map();
    this.confidenceThreshold = options.confidenceThreshold || 0.7;
    this.autoLearn = options.autoLearn !== false;
    this.feedbackHistory = [];
  }

  async reduce(issues, context = {}) {
    const reducedIssues = [];
    const suppressedIssues = [];

    for (const issue of issues) {
      const analysis = await this.analyzeIssue(issue, context);

      if (analysis.isFalsePositive) {
        suppressedIssues.push({
          ...issue,
          suppressed: true,
          suppressionReason: analysis.reason,
          confidence: analysis.confidence,
          suggestedFix: analysis.suggestedFix,
        });

        this.metrics.incrementCounter('false-positives.suppressed', 1, {
          analyzer: issue.analyzer,
          type: issue.type,
        });
      } else {
        issue.confidence = Math.max(issue.confidence || 0.5, analysis.confidence);
        reducedIssues.push(issue);
      }
    }

    this.eventBus.emit('issues:filtered', {
      original: issues.length,
      reduced: reducedIssues.length,
      suppressed: suppressedIssues.length,
    });

    return {
      issues: reducedIssues,
      suppressed: suppressedIssues,
      statistics: this.getStatistics(),
    };
  }

  async analyzeIssue(issue, context = {}) {
    const signals = [];

    signals.push(await this.checkPatternSignal(issue));
    signals.push(await this.contextSignal(issue, context));
    signals.push(await this.historySignal(issue));
    signals.push(await this.codePatternSignal(issue));

    const isFalsePositive = signals.some(s => s.isFalsePositive);
    const confidence = this.calculateConfidence(signals);
    const reason = isFalsePositive
      ? signals.find(s => s.isFalsePositive)?.reason
      : null;

    return {
      isFalsePositive,
      confidence,
      reason,
      signals,
      suggestedFix: isFalsePositive ? null : await this.suggestFix(issue),
    };
  }

  async checkPatternSignal(issue) {
    const falsePositivePatterns = [
      {
        pattern: /process\.env\./,
        analyzers: ['security'],
        reason: 'Environment variable access is safe',
      },
      {
        pattern: /mock|test|dummy|sample|example/i,
        analyzers: ['security', 'bugs'],
        reason: 'Test/mock code should be excluded from security scanning',
      },
      {
        pattern: /\/\/\s*eslint-disable/,
        analyzers: ['quality'],
        reason: 'Intentionally disabled lint rule',
      },
    ];

    for (const fp of falsePositivePatterns) {
      if (fp.analyzers.includes(issue.analyzer)) {
        if (fp.pattern.test(issue.message) || fp.pattern.test(issue.snippet || '')) {
          return {
            isFalsePositive: true,
            confidence: 0.9,
            reason: fp.reason,
          };
        }
      }
    }

    return { isFalsePositive: false, confidence: 0.5 };
  }

  async contextSignal(issue, context = {}) {
    const filePath = issue.file || '';

    if (context.testFiles?.some(test => filePath.includes(test))) {
      return {
        isFalsePositive: true,
        confidence: 0.8,
        reason: 'Issue in test file - may be intentional for testing',
      };
    }

    if (context.excludedPaths?.some(path => filePath.includes(path))) {
      return {
        isFalsePositive: true,
        confidence: 0.95,
        reason: 'File is in excluded paths',
      };
    }

    return { isFalsePositive: false, confidence: 0.5 };
  }

  async historySignal(issue) {
    const key = `${issue.analyzer}:${issue.type}:${issue.file}`;

    if (this.learningData.has(key)) {
      const history = this.learningData.get(key);
      const falsePositiveRate = history.falsePositives / history.total;

      if (falsePositiveRate > 0.8) {
        return {
          isFalsePositive: true,
          confidence: Math.min(0.95, falsePositiveRate),
          reason: 'High false positive rate for this issue type',
        };
      }
    }

    return { isFalsePositive: false, confidence: 0.5 };
  }

  async codePatternSignal(issue) {
    const snippet = issue.snippet || '';

    const safePatterns = [
      { pattern: /encodeURI|decodeURI|encodeURIComponent/, reason: 'URL encoding is safe' },
      { pattern: /innerText|textContent/, reason: 'Safe DOM text manipulation' },
      { pattern: /text\/plain/i, reason: 'Content type is safe' },
      { pattern: /https?:\/\//, reason: 'HTTPS URL is safe' },
      { pattern: /config|settings|constants?/i, reason: 'Configuration code' },
    ];

    for (const safe of safePatterns) {
      if (safe.pattern.test(snippet)) {
        return {
          isFalsePositive: true,
          confidence: 0.85,
          reason: safe.reason,
        };
      }
    }

    return { isFalsePositive: false, confidence: 0.5 };
  }

  calculateConfidence(signals) {
    const weights = {
      pattern: 0.2,
      context: 0.25,
      history: 0.35,
      codePattern: 0.2,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const [index, name] of ['pattern', 'context', 'history', 'codePattern'].entries()) {
      const signal = signals[index];
      const weight = weights[name];
      weightedSum += (1 - signal.confidence) * weight;
      totalWeight += weight;
    }

    return 1 - (weightedSum / totalWeight);
  }

  async suggestFix(issue) {
    const fixes = {
      security: {
        'hardcoded-password': 'Use environment variables or a secrets manager',
        'sql-injection': 'Use parameterized queries or an ORM',
        'xss': 'Use proper output encoding or CSP headers',
      },
      quality: {
        'complex-function': 'Consider breaking this function into smaller functions',
        'long-file': 'Consider splitting this file into smaller modules',
      },
    };

    const categoryFixes = fixes[issue.analyzer];
    if (categoryFixes) {
      for (const [type, fix] of Object.entries(categoryFixes)) {
        if (issue.type?.includes(type) || issue.message?.includes(type)) {
          return fix;
        }
      }
    }

    return null;
  }

  recordFeedback(issue, isFalsePositive, userFeedback = {}) {
    const key = `${issue.analyzer}:${issue.type}:${issue.file}`;

    if (!this.learningData.has(key)) {
      this.learningData.set(key, {
        total: 0,
        falsePositives: 0,
        truePositives: 0,
        feedback: [],
      });
    }

    const history = this.learningData.get(key);
    history.total++;
    if (isFalsePositive) {
      history.falsePositives++;
    } else {
      history.truePositives++;
    }

    history.feedback.push({
      timestamp: Date.now(),
      isFalsePositive,
      ...userFeedback,
    });

    this.feedbackHistory.push({
      issue,
      isFalsePositive,
      timestamp: Date.now(),
    });

    if (this.feedbackHistory.length > 1000) {
      this.feedbackHistory.shift();
    }

    this.eventBus.emit('feedback:recorded', {
      key,
      isFalsePositive,
      total: history.total,
    });
  }

  getStatistics() {
    let totalFalsePositives = 0;
    let totalIssuesCount = 0;

    for (const history of this.learningData.values()) {
      totalFalsePositives += history.falsePositives;
      totalIssuesCount += history.total;
    }

    return {
      trackedIssueTypes: totalIssuesCount,
      falsePositiveRate: totalIssuesCount > 0
        ? (totalFalsePositives / totalIssuesCount * 100).toFixed(2)
        : 0,
      feedbackCount: this.feedbackHistory.length,
      avgConfidence: this.calculateAverageConfidence(),
    };
  }

  calculateAverageConfidence() {
    let total = 0;
    let count = 0;

    for (const history of this.learningData.values()) {
      for (const feedback of history.feedback) {
        if (feedback.confidence !== undefined) {
          total += feedback.confidence;
          count++;
        }
      }
    }

    return count > 0 ? (total / count).toFixed(2) : 0;
  }

  exportLearningData() {
    const data = {};
    for (const [key, history] of this.learningData) {
      data[key] = {
        ...history,
        feedback: history.feedback.slice(-100),
      };
    }
    return data;
  }

  async importLearningData(data) {
    for (const [key, history] of Object.entries(data)) {
      this.learningData.set(key, {
        ...history,
        feedback: history.feedback || [],
      });
    }
    return true;
  }
}

export default FalsePositiveReducer;

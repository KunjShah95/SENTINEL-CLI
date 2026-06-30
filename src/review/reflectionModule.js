/**
 * Reflection Module — validates and reflects on AI-generated review comments
 * before outputting them.
 *
 * Inspired by open-code-review's reflection module that systematically improves
 * both the location accuracy and content accuracy of AI feedback.
 */

import { PositioningModule } from './positioningModule.js';

export class ReflectionModule {
  constructor(options = {}) {
    this.positioning = options.positioningModule || new PositioningModule();
    this.minConfidence = options.minConfidence || 0.4;
    this.maxIssues = options.maxIssues || 50;
  }

  /**
   * Reflect on and validate a set of review issues.
   * @param {object[]} issues — review issues with { file, line, message, severity, snippet, suggestion }
   * @param {object} [options]
   * @returns {{ comments: object[], discarded: object[], stats: object }}
   */
  reflect(issues, options = {}) {
    const comments = [];
    const discarded = [];

    // Step 1: Position each comment
    const positioned = this.positioning.positionAll(issues, options);

    // Step 2: Validate content
    for (const result of positioned) {
      const issue = result.issue;

      // Check confidence threshold
      if (result.confidence < (options.minConfidence || this.minConfidence)) {
        discarded.push({
          ...issue,
          _reflection: { reason: 'low_confidence', confidence: result.confidence },
        });
        continue;
      }

      // Check for empty or meaningless messages
      if (this._isMeaningless(issue)) {
        discarded.push({
          ...issue,
          _reflection: { reason: 'meaningless', confidence: result.confidence },
        });
        continue;
      }

      // Check for duplicates in the same file+line
      const isDuplicate = comments.some(
        c => c.file === issue.file && c.line === issue.line &&
          this._similarity(c.message, issue.message) > 0.8
      );
      if (isDuplicate) {
        discarded.push({
          ...issue,
          _reflection: { reason: 'duplicate', confidence: result.confidence },
        });
        continue;
      }

      // Check severity is valid
      const severity = this._validateSeverity(issue.severity);
      if (!severity) {
        discarded.push({
          ...issue,
          _reflection: { reason: 'invalid_severity', confidence: result.confidence },
        });
        continue;
      }

      // Enhance with reflection metadata
      comments.push({
        ...issue,
        severity,
        _reflection: {
          confidence: result.confidence,
          adjusted: result.adjusted,
          originalLine: result.originalLine,
          matchType: result.matchType || 'unknown',
          reflectedAt: new Date().toISOString(),
        },
      });
    }

    // Step 3: Prioritize (critical → high → medium → low → info)
    const _sevRank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    comments.sort((a, b) => {
      const va = _sevRank[a.severity] ?? 5;
      const vb = _sevRank[b.severity] ?? 5;
      return va < vb ? -1 : va > vb ? 1 : 0;
    });

    // Step 4: Limit
    const max = options.maxIssues || this.maxIssues;
    const excess = comments.splice(max);
    discarded.push(...excess.map(c => ({
      ...c,
      _reflection: { reason: 'exceeded_max', confidence: c._reflection.confidence },
    })));

    return {
      comments,
      discarded,
      stats: {
        total: positioned.length,
        accepted: comments.length,
        discarded: discarded.length,
        avgConfidence: this._avg(comments.map(c => c._reflection.confidence)),
      },
    };
  }

  /**
   * Classify each comment by priority level (for audience=agent output).
   */
  classifyByPriority(issues) {
    return {
      high: issues.filter(i => i.severity === 'critical' || i.severity === 'high'),
      medium: issues.filter(i => i.severity === 'medium'),
      low: issues.filter(i => i.severity === 'low' || i.severity === 'info'),
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  _isMeaningless(issue) {
    const msg = (issue.message || issue.title || '').trim().toLowerCase();
    if (!msg || msg.length < 5) return true;

    const meaningless = [
      'nitpick', 'nit:', 'nitpick:',
      'consider', 'maybe', 'perhaps',
      'looks good', 'looks fine', 'nice',
      'good job', 'great work',
      'not sure', 'i think', 'maybe you could',
    ];
    return meaningless.some(m => msg.startsWith(m));
  }

  _validateSeverity(severity) {
    const valid = ['critical', 'high', 'medium', 'low', 'info'];
    const s = (severity || '').toLowerCase();
    return valid.includes(s) ? s : null;
  }

  _similarity(a, b) {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let intersection = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) intersection++;
    }
    return intersection / Math.max(wordsA.size, wordsB.size);
  }

  _avg(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }
}

export default ReflectionModule;

import { getSessionStore } from './sessionStore.js';

/**
 * Learning and Feedback System
 * Tracks user feedback, learns from corrections, and improves recommendations
 */
export class LearningSystem {
  constructor(projectPath = process.cwd()) {
    this.projectPath = projectPath;
    this.sessionStore = getSessionStore();
    this.learningThreshold = 3; // Minimum occurrences before learning
  }

  /**
   * Record user feedback on a finding
   */
  async recordFeedback(sessionId, finding, action, reason = null) {
    // Validate action
    const validActions = ['suppressed', 'fixed', 'false_positive', 'confirmed', 'ignored'];
    if (!validActions.includes(action)) {
      throw new Error(`Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`);
    }

    // Store feedback
    const findingHash = this.sessionStore.hashFinding(finding);
    this.sessionStore.addFeedback(sessionId, finding, action, reason);

    // Learn from feedback
    await this.learnFromFeedback(finding, action, reason);

    return {
      findingHash,
      action,
      learned: await this.shouldAutoSuppress(finding)
    };
  }

  /**
   * Learn from user feedback
   */
  async learnFromFeedback(finding, action, _reason) {
    const ruleId = finding.ruleId || finding.rule;

      // If marked as false positive multiple times, suggest custom suppression
    if (action === 'false_positive') {
      const falsePositives = this.sessionStore.getFalsePositivePatterns(ruleId);

      this.extractPattern(finding);
      const similar = falsePositives.filter(fp =>
        fp.file_path === (finding.file || finding.filePath) ||
        this.isSimilarPattern(fp.file_path, finding.file || finding.filePath)
      );

      if (similar.length >= this.learningThreshold) {
        // Auto-suggest suppression
        await this.suggestSuppression(finding, similar);
      }
    }

    // Learn from successful fixes
    if (action === 'fixed') {
      // This will be enhanced to suggest similar fixes
      await this.learnFixPattern(finding);
    }
  }

  /**
   * Check if finding should be auto-suppressed based on history
   */
  async shouldAutoSuppress(finding) {
    const ruleId = finding.ruleId || finding.rule;
    const filePath = finding.file || finding.filePath;

    // Check if suppressed in database
    if (this.sessionStore.isSuppressed(this.projectPath, filePath, ruleId)) {
      return true;
    }

    // Check if marked as false positive multiple times
    const falsePositives = this.sessionStore.getFalsePositivePatterns(ruleId, 10);
    const matchingFP = falsePositives.filter(fp =>
      fp.file_path === filePath || this.isSimilarPattern(fp.file_path, filePath)
    );

    return matchingFP.length >= this.learningThreshold;
  }

  /**
   * Suggest suppression rule
   */
  async suggestSuppression(finding, similar) {
    const suggestion = {
      type: 'suppression',
      ruleId: finding.ruleId || finding.rule,
      pattern: this.extractPattern(finding),
      reason: `Marked as false positive ${similar.length} times`,
      confidence: Math.min(similar.length / 10, 1.0),
      examples: similar.slice(0, 3)
    };

    // Store as knowledge
    this.sessionStore.setKnowledge(
      this.projectPath,
      'suggested_suppression',
      finding.ruleId || finding.rule,
      suggestion,
      suggestion.confidence,
      'learned'
    );

    return suggestion;
  }

  /**
   * Learn fix pattern from successful fix
   */
  async learnFixPattern(finding) {
    const ruleId = finding.ruleId || finding.rule;

    // Get successful fixes for this rule
    const successfulFixes = this.sessionStore.getSuccessfulFixes(ruleId, 10);

    if (successfulFixes.length >= this.learningThreshold) {
      // Analyze common patterns
      const pattern = await this.analyzeFixPatterns(successfulFixes);

      this.sessionStore.setKnowledge(
        this.projectPath,
        'fix_pattern',
        ruleId,
        pattern,
        0.8,
        'learned'
      );
    }
  }

  /**
   * Record fix outcome
   */
  async recordFixOutcome(sessionId, finding, fix, success, userCorrection = null) {
    this.sessionStore.recordFixOutcome(sessionId, finding, fix, success, userCorrection);

    // If user corrected the fix, learn from it
    if (userCorrection) {
      await this.learnFromCorrection(finding, fix, userCorrection);
    }

    return {
      recorded: true,
      learning: userCorrection !== null
    };
  }

  /**
   * Learn from user correction
   */
  async learnFromCorrection(finding, originalFix, userCorrection) {
    const ruleId = finding.ruleId || finding.rule;

    const learningData = {
      rule: ruleId,
      originalFix: originalFix,
      userCorrection: userCorrection,
      diff: this.computeDiff(originalFix, userCorrection),
      timestamp: new Date().toISOString()
    };

    this.sessionStore.setKnowledge(
      this.projectPath,
      'correction',
      ruleId,
      learningData,
      1.0,
      'learned'
    );
  }

  /**
   * Get learned patterns for a rule
   */
  getLearnedPatterns(ruleId) {
    const knowledge = this.sessionStore.getKnowledge(this.projectPath, 'fix_pattern');
    return knowledge.filter(k => k.key === ruleId);
  }

  /**
   * Get suggested suppressions
   */
  getSuggestedSuppressions() {
    const knowledge = this.sessionStore.getKnowledge(this.projectPath, 'suggested_suppression');
    return knowledge.map(k => k.value);
  }

  /**
   * Apply learned suppressions
   */
  async applyLearnedSuppressions() {
    const suggestions = this.getSuggestedSuppressions();
    const applied = [];

    for (const suggestion of suggestions) {
      if (suggestion.confidence >= 0.7) {
        this.sessionStore.addSuppression(
          this.projectPath,
          suggestion.examples[0].file_path,
          suggestion.ruleId,
          suggestion.pattern,
          suggestion.reason
        );
        applied.push(suggestion);
      }
    }

    return applied;
  }

  /**
   * Get fix recommendations based on learning
   */
  async getFixRecommendations(finding) {
    const ruleId = finding.ruleId || finding.rule;

    // Get learned patterns
    const patterns = this.getLearnedPatterns(ruleId);

    // Get successful fixes
    const successfulFixes = this.sessionStore.getSuccessfulFixes(ruleId, 5);

    // Get corrections
    const corrections = this.sessionStore.getKnowledge(this.projectPath, 'correction')
      .filter(k => k.key === ruleId);

    const recommendations = [];

    // Add learned pattern recommendations
    if (patterns.length > 0) {
      recommendations.push({
        source: 'learned_pattern',
        confidence: patterns[0].confidence,
        fix: patterns[0].value,
        usage_count: patterns.length
      });
    }

    // Add successful fix recommendations
    if (successfulFixes.length > 0) {
      const mostCommon = this.findMostCommonFix(successfulFixes);
      recommendations.push({
        source: 'successful_fix',
        confidence: mostCommon.frequency,
        fix: JSON.parse(mostCommon.fix_content),
        usage_count: mostCommon.count
      });
    }

    // Add correction-based recommendations
    if (corrections.length > 0) {
      const latestCorrection = corrections[0];
      recommendations.push({
        source: 'user_correction',
        confidence: 0.9,
        fix: latestCorrection.value.userCorrection,
        note: 'Based on previous user correction'
      });
    }

    return recommendations;
  }

  /**
   * Get learning statistics
   */
  getStats() {
    const stats = {
      feedbackCount: {},
      fixSuccessRate: null,
      learnedPatterns: 0,
      suggestedSuppressions: 0,
      corrections: 0
    };

    // Get feedback counts
    const allFeedback = this.sessionStore.db.prepare(`
      SELECT user_action, COUNT(*) as count
      FROM feedback f
      JOIN sessions s ON f.session_id = s.id
      WHERE s.project_path = ?
      GROUP BY user_action
    `).all(this.projectPath);

    allFeedback.forEach(row => {
      stats.feedbackCount[row.user_action] = row.count;
    });

    // Get fix success rate
    const fixStats = this.sessionStore.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful
      FROM fix_outcomes fo
      JOIN sessions s ON fo.session_id = s.id
      WHERE s.project_path = ?
    `).get(this.projectPath);

    if (fixStats.total > 0) {
      stats.fixSuccessRate = (fixStats.successful / fixStats.total * 100).toFixed(2) + '%';
    }

    // Get learned patterns count
    const patterns = this.sessionStore.getKnowledge(this.projectPath, 'fix_pattern');
    stats.learnedPatterns = patterns.length;

    // Get suggested suppressions count
    const suppressions = this.sessionStore.getKnowledge(this.projectPath, 'suggested_suppression');
    stats.suggestedSuppressions = suppressions.length;

    // Get corrections count
    const corrections = this.sessionStore.getKnowledge(this.projectPath, 'correction');
    stats.corrections = corrections.length;

    return stats;
  }

  /**
   * Generate learning report
   */
  async generateLearningReport() {
    const stats = this.getStats();
    const suggestions = this.getSuggestedSuppressions();

    const report = {
      timestamp: new Date().toISOString(),
      project: this.projectPath,
      statistics: stats,
      insights: []
    };

    // Add insights
    if (stats.suggestedSuppressions > 0) {
      report.insights.push({
        type: 'suppression',
        message: `Found ${stats.suggestedSuppressions} patterns that could be suppressed`,
        suggestions: suggestions.filter(s => s.confidence >= 0.7)
      });
    }

    if (stats.corrections > 0) {
      report.insights.push({
        type: 'improvement',
        message: `Learned from ${stats.corrections} user corrections`,
        action: 'Future fixes will incorporate these corrections'
      });
    }

    const falsePositiveRate = stats.feedbackCount.false_positive || 0;
    const totalFeedback = Object.values(stats.feedbackCount).reduce((a, b) => a + b, 0);

    if (totalFeedback > 0) {
      const fpRate = (falsePositiveRate / totalFeedback * 100).toFixed(2);
      report.insights.push({
        type: 'accuracy',
        message: `False positive rate: ${fpRate}%`,
        details: stats.feedbackCount
      });
    }

    return report;
  }

  // Helper methods
  extractPattern(finding) {
    const code = finding.code || finding.snippet || '';
    const pattern = code.substring(0, 50);
    return pattern;
  }

  isSimilarPattern(path1, path2) {
    // Simple similarity check - could be enhanced
    const dir1 = path1.split('/').slice(0, -1).join('/');
    const dir2 = path2.split('/').slice(0, -1).join('/');
    return dir1 === dir2;
  }

  async analyzeFixPatterns(fixes) {
    // Simple pattern extraction - could be enhanced with ML
    const pattern = {
      commonChanges: [],
      avgConfidence: 0,
      examples: fixes.slice(0, 3).map(f => JSON.parse(f.fix_content))
    };

    return pattern;
  }

  findMostCommonFix(fixes) {
    const fixCounts = {};

    fixes.forEach(fix => {
      const key = fix.fix_hash;
      fixCounts[key] = fixCounts[key] || { count: 0, fix: fix };
      fixCounts[key].count++;
    });

    const sorted = Object.values(fixCounts).sort((a, b) => b.count - a.count);

    if (sorted.length === 0) return null;

    return {
      fix_content: sorted[0].fix.fix_content,
      count: sorted[0].count,
      frequency: sorted[0].count / fixes.length
    };
  }

  computeDiff(original, corrected) {
    // Simple diff - could be enhanced
    return {
      original: String(original),
      corrected: String(corrected),
      changed: original !== corrected
    };
  }

  /**
   * Export learning data
   */
  async exportLearningData() {
    const data = {
      project: this.projectPath,
      exportedAt: new Date().toISOString(),
      patterns: this.sessionStore.getKnowledge(this.projectPath, 'fix_pattern'),
      suppressions: this.sessionStore.getKnowledge(this.projectPath, 'suggested_suppression'),
      corrections: this.sessionStore.getKnowledge(this.projectPath, 'correction'),
      stats: this.getStats()
    };

    return data;
  }

  /**
   * Import learning data
   */
  async importLearningData(data) {
    // Import patterns
    for (const pattern of data.patterns || []) {
      this.sessionStore.setKnowledge(
        this.projectPath,
        'fix_pattern',
        pattern.key,
        pattern.value,
        pattern.confidence,
        'imported'
      );
    }

    // Import suppressions
    for (const suppression of data.suppressions || []) {
      this.sessionStore.setKnowledge(
        this.projectPath,
        'suggested_suppression',
        suppression.key,
        suppression.value,
        suppression.confidence,
        'imported'
      );
    }

    // Import corrections
    for (const correction of data.corrections || []) {
      this.sessionStore.setKnowledge(
        this.projectPath,
        'correction',
        correction.key,
        correction.value,
        correction.confidence,
        'imported'
      );
    }

    return {
      imported: {
        patterns: data.patterns?.length || 0,
        suppressions: data.suppressions?.length || 0,
        corrections: data.corrections?.length || 0
      }
    };
  }

  /**
   * Reset learning data
   */
  async resetLearning() {
    // This would delete all learned knowledge for the project
    const types = ['fix_pattern', 'suggested_suppression', 'correction'];

    for (const type of types) {
      this.sessionStore.getKnowledge(this.projectPath, type);
      // Delete from database (would need to add delete method to sessionStore)
    }

    return { reset: true };
  }
}

// Factory function
export function createLearningSystem(projectPath) {
  return new LearningSystem(projectPath);
}

export default LearningSystem;

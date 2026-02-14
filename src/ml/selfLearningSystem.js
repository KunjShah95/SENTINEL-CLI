/**
 * SELF-LEARNING SYSTEM
 * 
 * Inspired by DeepMind's self-play approach and Andrew Ng's data-centric AI principles.
 * This system learns from user feedback to improve security analysis over time.
 * 
 * Key Features:
 * - Feedback collection and analysis
 * - Confidence calibration
 * - Automatic threshold optimization
 * - Continuous model improvement
 * - Human-in-the-loop learning
 */

import { EventEmitter } from 'events';

/**
 * Feedback types from users
 */
export const FeedbackType = {
  ACCEPT: 'accept',           // User accepted the suggestion
  REJECT: 'reject',          // User rejected the suggestion
  MODIFY: 'modify',          // User modified the suggestion
  IGNORE: 'ignore',          // User ignored the suggestion
  UPVOTE: 'upvote',          // User upvoted the finding
  DOWNVOTE: 'downvote',      // User downvoted the finding
  FALSE_POSITIVE: 'false_positive',  // Marked as false positive
  TRUE_POSITIVE: 'true_positive'     // Confirmed as true positive
};

/**
 * Learning strategies
 */
export const LearningStrategy = {
  PASSIVE: 'passive',        // Learn from explicit feedback only
  ACTIVE: 'active',          // Actively query for feedback
  REINFORCEMENT: 'rl',       // Reinforcement learning based
  DISTILLATION: 'distillation'  // Knowledge distillation
};

export class SelfLearningSystem extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      learningRate: options.learningRate || 0.01,
      momentum: options.momentum || 0.9,
      decayFactor: options.decayFactor || 0.95,
      minSamplesForUpdate: options.minSamplesForUpdate || 100,
      confidenceThreshold: options.confidenceThreshold || 0.7,
      feedbackWindowSize: options.feedbackWindowSize || 1000,
      autoThresholdOptimization: options.autoThresholdOptimization ?? true,
      strategy: options.strategy || LearningStrategy.PASSIVE,
      ...options
    };

    // Feedback storage
    this.feedbackHistory = [];
    this.positiveFeedback = [];
    this.negativeFeedback = [];
    
    // Model state
    this.modelWeights = {
      severity: {},
      falsePositiveRate: {},
      truePositiveRate: {},
      confidence: {}
    };

    // Performance metrics
    this.performanceMetrics = {
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      auc: 0,
      totalFeedback: 0,
      lastUpdate: null
    };

    // Thresholds
    this.thresholds = {
      severity: options.severityThreshold || 0.5,
      confidence: options.confidenceThreshold || 0.7,
      falsePositiveLikelihood: 0.3
    };

    // Statistics
    this.statistics = {
      totalAnalyses: 0,
      acceptedSuggestions: 0,
      rejectedSuggestions: 0,
      confidenceCalibration: [],
      learningProgress: []
    };

    // Initialize default weights
    this._initializeWeights();
  }

  /**
   * Initialize default model weights
   */
  _initializeWeights() {
    // Severity weights per category
    this.modelWeights.severity = {
      critical: 1.0,
      high: 0.8,
      medium: 0.5,
      low: 0.3,
      info: 0.1
    };

    // False positive rates per rule
    this.modelWeights.falsePositiveRate = {
      default: 0.2
    };

    // True positive rates per rule
    this.modelWeights.truePositiveRate = {
      default: 0.8
    };

    // Confidence factors
    this.modelWeights.confidence = {
      ruleStrength: 0.4,
      contextMatch: 0.3,
      historicalAccuracy: 0.2,
      similarityScore: 0.1
    };
  }

  /**
   * Record feedback from user
   */
  async recordFeedback(feedback) {
    const feedbackRecord = {
      id: `fb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type: feedback.type,
      findingId: feedback.findingId,
      ruleId: feedback.ruleId,
      severity: feedback.severity,
      confidence: feedback.confidence,
      actualOutcome: feedback.actualOutcome,
      userId: feedback.userId,
      context: feedback.context || {},
      metadata: feedback.metadata || {}
    };

    // Add to history
    this.feedbackHistory.push(feedbackRecord);
    this.statistics.totalAnalyses++;

    // Categorize feedback
    if (this._isPositiveFeedback(feedbackRecord.type)) {
      this.positiveFeedback.push(feedbackRecord);
      this.statistics.acceptedSuggestions++;
    } else if (this._isNegativeFeedback(feedbackRecord.type)) {
      this.negativeFeedback.push(feedbackRecord);
      this.statistics.rejectedSuggestions++;
    }

    // Trim to window size
    if (this.feedbackHistory.length > this.options.feedbackWindowSize) {
      this.feedbackHistory = this.feedbackHistory.slice(-this.options.feedbackWindowSize);
    }

    // Emit feedback event
    this.emit('feedback:recorded', feedbackRecord);

    // Trigger learning if enough samples
    if (this.feedbackHistory.length >= this.options.minSamplesForUpdate) {
      await this._triggerLearning();
    }

    return feedbackRecord;
  }

  /**
   * Check if feedback is positive
   */
  _isPositiveFeedback(type) {
    return [
      FeedbackType.ACCEPT,
      FeedbackType.UPVOTE,
      FeedbackType.TRUE_POSITIVE
    ].includes(type);
  }

  /**
   * Check if feedback is negative
   */
  _isNegativeFeedback(type) {
    return [
      FeedbackType.REJECT,
      FeedbackType.DOWNVOTE,
      FeedbackType.FALSE_POSITIVE,
      FeedbackType.IGNORE
    ].includes(type);
  }

  /**
   * Trigger learning update
   */
  async _triggerLearning() {
    try {
      await this.updateModel();
      this.emit('model:updated', this.performanceMetrics);
    } catch (error) {
      this.emit('learning:error', error);
    }
  }

  /**
   * Update model based on feedback
   */
  async updateModel() {
    if (this.feedbackHistory.length < this.options.minSamplesForUpdate) {
      return;
    }

    const startTime = Date.now();

    // Calculate performance metrics
    this._calculatePerformanceMetrics();

    // Update weights based on feedback
    await this._updateWeights();

    // Optimize thresholds if enabled
    if (this.options.autoThresholdOptimization) {
      await this._optimizeThresholds();
    }

    // Calibrate confidence scores
    this._calibrateConfidence();

    // Update statistics
    this.performanceMetrics.lastUpdate = Date.now();
    this.statistics.learningProgress.push({
      timestamp: Date.now(),
      duration: Date.now() - startTime,
      metrics: { ...this.performanceMetrics },
      feedbackCount: this.feedbackHistory.length
    });

    this.emit('model:updated', {
      metrics: this.performanceMetrics,
      weights: this.modelWeights,
      thresholds: this.thresholds
    });

    return this.performanceMetrics;
  }

  /**
   * Calculate performance metrics
   */
  _calculatePerformanceMetrics() {
    const tp = this.positiveFeedback.filter(f => 
      f.type === FeedbackType.TRUE_POSITIVE || f.type === FeedbackType.ACCEPT
    ).length;
    
    const fp = this.negativeFeedback.filter(f => 
      f.type === FeedbackType.FALSE_POSITIVE || f.type === FeedbackType.REJECT
    ).length;
    
    const fn = this.feedbackHistory.filter(f => 
      f.type === FeedbackType.IGNORE
    ).length;
    
    const tn = this.feedbackHistory.filter(f => 
      f.type === FeedbackType.ACCEPT && f.confidence < 0.5
    ).length;

    // Precision
    this.performanceMetrics.precision = tp / (tp + fp) || 0;
    
    // Recall
    this.performanceMetrics.recall = tp / (tp + fn) || 0;
    
    // F1 Score
    const precision = this.performanceMetrics.precision;
    const recall = this.performanceMetrics.recall;
    this.performanceMetrics.f1Score = 
      (2 * precision * recall) / (precision + recall) || 0;
    
    // Accuracy
    this.performanceMetrics.accuracy = (tp + tn) / 
      (tp + tn + fp + fn) || 0;
    
    this.performanceMetrics.totalFeedback = this.feedbackHistory.length;
  }

  /**
   * Update model weights based on feedback
   */
  async _updateWeights() {
    const learningRate = this.options.learningRate;
    
    // Group feedback by rule ID
    const ruleFeedback = {};
    for (const feedback of this.feedbackHistory) {
      const ruleId = feedback.ruleId || 'default';
      if (!ruleFeedback[ruleId]) {
        ruleFeedback[ruleId] = { positive: 0, negative: 0, total: 0 };
      }
      ruleFeedback[ruleId].total++;
      if (this._isPositiveFeedback(feedback.type)) {
        ruleFeedback[ruleId].positive++;
      } else if (this._isNegativeFeedback(feedback.type)) {
        ruleFeedback[ruleId].negative++;
      }
    }

    // Update false positive rates
    for (const [ruleId, stats] of Object.entries(ruleFeedback)) {
      const fpRate = stats.negative / stats.total || 0;
      const currentFpRate = this.modelWeights.falsePositiveRate[ruleId] || 
        this.modelWeights.falsePositiveRate.default;
      
      // Exponential moving average
      this.modelWeights.falsePositiveRate[ruleId] = 
        currentFpRate * this.options.decayFactor + 
        fpRate * (1 - this.options.decayFactor);
    }

    // Update true positive rates
    for (const [ruleId, stats] of Object.entries(ruleFeedback)) {
      const tpRate = stats.positive / stats.total || 0;
      const currentTpRate = this.modelWeights.truePositiveRate[ruleId] || 
        this.modelWeights.truePositiveRate.default;
      
      this.modelWeights.truePositiveRate[ruleId] = 
        currentTpRate * this.options.decayFactor + 
        tpRate * (1 - this.options.decayFactor);
    }

    // Update severity weights based on feedback
    const severityFeedback = {};
    for (const feedback of this.feedbackHistory) {
      const severity = feedback.severity || 'medium';
      if (!severityFeedback[severity]) {
        severityFeedback[severity] = { correct: 0, total: 0 };
      }
      severityFeedback[severity].total++;
      // Assume user accepted severity if they accepted the finding
      if (this._isPositiveFeedback(feedback.type)) {
        severityFeedback[severity].correct++;
      }
    }

    for (const [severity, stats] of Object.entries(severityFeedback)) {
      const accuracy = stats.correct / stats.total || 0;
      const currentWeight = this.modelWeights.severity[severity] || 0.5;
      this.modelWeights.severity[severity] = 
        currentWeight + learningRate * (accuracy - currentWeight);
    }
  }

  /**
   * Optimize detection thresholds
   */
  async _optimizeThresholds() {
    if (this.feedbackHistory.length < this.options.minSamplesForUpdate * 2) {
      return;
    }

    // Find optimal severity threshold
    const severities = this.feedbackHistory
      .filter(f => f.severity && f.confidence !== undefined)
      .map(f => ({ severity: f.severity, confidence: f.confidence }));

    if (severities.length === 0) return;

    // Binary search for optimal threshold
    let low = 0, high = 1;
    for (let i = 0; i < 20; i++) {
      const mid = (low + high) / 2;
      const predicted = severities.filter(s => s.confidence >= mid);
      const correct = predicted.filter(p => 
        this._isPositiveFeedback(p.type)
      ).length;
      
      if (correct / predicted.length > 0.8) {
        low = mid;
      } else {
        high = mid;
      }
    }

    this.thresholds.severity = (low + high) / 2;

    // Optimize false positive likelihood threshold
    const fpRate = this.negativeFeedback.length / this.feedbackHistory.length || 0;
    this.thresholds.falsePositiveLikelihood = 
      Math.max(0.1, Math.min(0.5, fpRate * 1.5));
  }

  /**
   * Calibrate confidence scores
   */
  _calibrateConfidence() {
    const calibrations = [];
    
    for (const feedback of this.feedbackHistory) {
      if (feedback.confidence === undefined) continue;
      
      const isCorrect = this._isPositiveFeedback(feedback.type);
      calibrations.push({
        predicted: feedback.confidence,
        actual: isCorrect ? 1 : 0
      });
    }

    if (calibrations.length < 10) return;

    // Simple calibration: compute bins
    const bins = {};
    const binSize = 0.1;
    
    for (const cal of calibrations) {
      const bin = Math.floor(cal.predicted / binSize) * binSize;
      if (!bins[bin]) {
        bins[bin] = { sum: 0, count: 0 };
      }
      bins[bin].sum += cal.actual;
      bins[bin].count++;
    }

    // Update confidence weights
    for (const [bin, data] of Object.entries(bins)) {
      const calibrated = data.sum / data.count || 0;
      this.statistics.confidenceCalibration.push({
        bin: parseFloat(bin),
        calibrated,
        count: data.count
      });
    }
  }

  /**
   * Predict if a finding is likely to be accepted
   */
  predictAcceptance(finding) {
    const ruleId = finding.ruleId || 'default';
    
    const fpRate = this.modelWeights.falsePositiveRate[ruleId] || 
      this.modelWeights.falsePositiveRate.default;
    const tpRate = this.modelWeights.truePositiveRate[ruleId] || 
      this.modelWeights.truePositiveRate.default;
    
    const severityWeight = this.modelWeights.severity[finding.severity] || 0.5;
    
    // Calculate prediction score
    const score = 
      (finding.confidence || 0.5) * tpRate * severityWeight +
      (1 - fpRate) * (1 - severityWeight) * 0.5;
    
    return {
      score,
      likelyAccepted: score > this.thresholds.confidence,
      confidence: score,
      factors: {
        truePositiveRate: tpRate,
        falsePositiveRate: fpRate,
        severityWeight,
        threshold: this.thresholds.confidence
      }
    };
  }

  /**
   * Adjust finding confidence based on learning
   */
  adjustConfidence(finding) {
    const prediction = this.predictAcceptance(finding);
    
    // Adjust confidence based on historical accuracy
    const historicalAccuracy = this.performanceMetrics.accuracy || 0.5;
    
    const adjustedConfidence = finding.confidence * prediction.score * 
      (0.5 + historicalAccuracy * 0.5);
    
    return {
      ...finding,
      originalConfidence: finding.confidence,
      adjustedConfidence: Math.min(1, Math.max(0, adjustedConfidence)),
      learningAdjusted: true,
      prediction: prediction
    };
  }

  /**
   * Get suggestions for improvement
   */
  getImprovementSuggestions() {
    const suggestions = [];

    // Check if more feedback needed
    if (this.feedbackHistory.length < this.options.minSamplesForUpdate) {
      suggestions.push({
        type: 'need_more_data',
        message: `Need ${this.options.minSamplesForUpdate - this.feedbackHistory.length} more feedback samples for model update`,
        priority: 'high'
      });
    }

    // Check precision
    if (this.performanceMetrics.precision < 0.7) {
      suggestions.push({
        type: 'low_precision',
        message: 'Consider tightening detection thresholds to reduce false positives',
        priority: 'medium',
        action: 'reduce_threshold',
        currentValue: this.thresholds.severity
      });
    }

    // Check recall
    if (this.performanceMetrics.recall < 0.7) {
      suggestions.push({
        type: 'low_recall',
        message: 'Consider loosening detection thresholds to catch more issues',
        priority: 'medium',
        action: 'increase_threshold',
        currentValue: this.thresholds.severity
      });
    }

    // Check F1 score
    if (this.performanceMetrics.f1Score < 0.6) {
      suggestions.push({
        type: 'low_f1',
        message: 'Model performance needs improvement',
        priority: 'high',
        metrics: this.performanceMetrics
      });
    }

    return suggestions;
  }

  /**
   * Get performance report
   */
  getPerformanceReport() {
    return {
      metrics: { ...this.performanceMetrics },
      thresholds: { ...this.thresholds },
      statistics: { ...this.statistics },
      weights: JSON.parse(JSON.stringify(this.modelWeights)),
      suggestions: this.getImprovementSuggestions()
    };
  }

  /**
   * Export model state
   */
  exportModel() {
    return {
      version: '1.0',
      timestamp: Date.now(),
      weights: this.modelWeights,
      thresholds: this.thresholds,
      performanceMetrics: this.performanceMetrics,
      feedbackCount: this.feedbackHistory.length
    };
  }

  /**
   * Import model state
   */
  async importModel(model) {
    if (model.weights) {
      this.modelWeights = model.weights;
    }
    if (model.thresholds) {
      this.thresholds = model.thresholds;
    }
    if (model.performanceMetrics) {
      this.performanceMetrics = model.performanceMetrics;
    }
    
    this.emit('model:imported', model);
  }

  /**
   * Reset learning state
   */
  reset() {
    this.feedbackHistory = [];
    this.positiveFeedback = [];
    this.negativeFeedback = [];
    this._initializeWeights();
    this.performanceMetrics = {
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      auc: 0,
      totalFeedback: 0,
      lastUpdate: null
    };
    this.statistics = {
      totalAnalyses: 0,
      acceptedSuggestions: 0,
      rejectedSuggestions: 0,
      confidenceCalibration: [],
      learningProgress: []
    };
    
    this.emit('model:reset');
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      ...this.statistics,
      positiveRatio: this.feedbackHistory.length > 0 
        ? this.positiveFeedback.length / this.feedbackHistory.length 
        : 0,
      negativeRatio: this.feedbackHistory.length > 0 
        ? this.negativeFeedback.length / this.feedbackHistory.length 
        : 0
    };
  }
}

/**
 * Factory function
 */
export function createSelfLearningSystem(options) {
  return new SelfLearningSystem(options);
}

export default SelfLearningSystem;

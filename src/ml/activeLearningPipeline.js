/**
 * ACTIVE LEARNING PIPELINE
 * 
 * Inspired by Andrew Ng's work on data-centric AI and active learning.
 * This system intelligently selects the most valuable samples for labeling.
 * 
 * Key Features:
 * - Uncertainty sampling
 * - Query-by-Committee
 * - Diversity-based sampling
 * - Human-in-the-loop integration
 * - Smart labeling suggestions
 */

import { EventEmitter } from 'events';

/**
 * Sampling strategies for active learning
 */
export const SamplingStrategy = {
  UNCERTAINTY: 'uncertainty',      // Least confident sampling
  MARGIN: 'margin',                // Margin sampling (difference between top 2)
  ENTROPY: 'entropy',              // Maximum entropy
  QUERY_BY_COMMITTEE: 'qbc',       // Query-by-Committee
  DIVERSITY: 'diversity',          // Diversity-based
  EXPECTED_MODEL_CHANGE: 'emc',    // Expected model change
  EXPECTED_ERROR_REDUCTION: 'eer'  // Expected error reduction
};

/**
 * Query types
 */
export const QueryType = {
  MANUAL: 'manual',                // Human labels manually
  SEMI_AUTOMATIC: 'semi_auto',    // Human verifies auto-label
  SYNTHETIC: 'synthetic',         // Generated synthetic labels
  TRANSFER: 'transfer'            // Transfer from similar samples
};

export class ActiveLearningPipeline extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      batchSize: options.batchSize || 10,
      initialLabeledSize: options.initialLabeledSize || 100,
      queryBudget: options.queryBudget || 1000,
      uncertaintyThreshold: options.uncertaintyThreshold || 0.5,
      diversityWeight: options.diversityWeight || 0.3,
      strategy: options.strategy || SamplingStrategy.UNCERTAINTY,
      committeeSize: options.committeeSize || 3,
      ...options
    };

    // Data stores
    this.unlabeledData = [];
    this.labeledData = [];
    this.queryHistory = [];
    
    // Committee models for QBC
    this.committeeModels = [];
    
    // Statistics
    this.statistics = {
      totalQueries: 0,
      manualQueries: 0,
      autoQueries: 0,
      labelDistribution: {},
      uncertaintyDistribution: {},
      improvementHistory: []
    };

    // Performance tracking
    this.performanceMetrics = {
      currentAccuracy: 0,
      initialAccuracy: 0,
      labeledRatio: 0,
      unlabeledRatio: 1
    };
  }

  /**
   * Initialize with seed labeled data
   */
  async initialize(labeledData, unlabeledData) {
    // Use initial labeled data
    if (labeledData && labeledData.length > 0) {
      this.labeledData = [...labeledData];
    }

    // Set unlabeled data
    if (unlabeledData && unlabeledData.length > 0) {
      this.unlabeledData = [...unlabeledData];
    }

    // Calculate initial performance
    await this._evaluatePerformance();
    this.performanceMetrics.initialAccuracy = this.performanceMetrics.currentAccuracy;

    this.emit('initialized', {
      labeledCount: this.labeledData.length,
      unlabeledCount: this.unlabeledData.length
    });

    return {
      labeledCount: this.labeledData.length,
      unlabeledCount: this.unlabeledData.length
    };
  }

  /**
   * Add unlabeled sample
   */
  addUnlabeledSample(sample) {
    this.unlabeledData.push({
      ...sample,
      id: sample.id || `sample-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      addedAt: Date.now(),
      queried: false
    });
  }

  /**
   * Add batch of unlabeled samples
   */
  addUnlabeledBatch(samples) {
    for (const sample of samples) {
      this.addUnlabeledSample(sample);
    }
    this.emit('samples:added', { count: samples.length });
  }

  /**
   * Select samples for labeling (main query strategy)
   */
  async selectSamples(count = null) {
    const batchSize = count || this.options.batchSize;
    
    if (this.unlabeledData.length === 0) {
      return [];
    }

    let selectedSamples;
    
    switch (this.options.strategy) {
      case SamplingStrategy.UNCERTAINTY:
        selectedSamples = await this._uncertaintySampling(batchSize);
        break;
      case SamplingStrategy.MARGIN:
        selectedSamples = await this._marginSampling(batchSize);
        break;
      case SamplingStrategy.ENTROPY:
        selectedSamples = await this._entropySampling(batchSize);
        break;
      case SamplingStrategy.QUERY_BY_COMMITTEE:
        selectedSamples = await this._queryByCommittee(batchSize);
        break;
      case SamplingStrategy.DIVERSITY:
        selectedSamples = await this._diversitySampling(batchSize);
        break;
      default:
        selectedSamples = await this._uncertaintySampling(batchSize);
    }

    // Mark samples as queried
    for (const sample of selectedSamples) {
      const idx = this.unlabeledData.findIndex(s => s.id === sample.id);
      if (idx !== -1) {
        this.unlabeledData[idx].queried = true;
        this.unlabeledData[idx].queriedAt = Date.now();
      }
    }

    // Record query
    this.queryHistory.push({
      timestamp: Date.now(),
      strategy: this.options.strategy,
      selectedCount: selectedSamples.length,
      samples: selectedSamples.map(s => s.id)
    });

    this.statistics.totalQueries += selectedSamples.length;

    this.emit('samples:selected', {
      samples: selectedSamples,
      strategy: this.options.strategy
    });

    return selectedSamples;
  }

  /**
   * Uncertainty sampling - select least confident predictions
   */
  async _uncertaintySampling(count) {
    // Calculate uncertainty for each sample
    const samplesWithUncertainty = this.unlabeledData
      .filter(s => !s.queried && s.prediction !== undefined)
      .map(sample => {
        const confidence = sample.prediction?.confidence || 0.5;
        const uncertainty = 1 - Math.abs(confidence - 0.5) * 2; // Higher = more uncertain
        return { ...sample, uncertainty };
      })
      .sort((a, b) => b.uncertainty - a.uncertainty);

    return samplesWithUncertainty.slice(0, count);
  }

  /**
   * Margin sampling - select where top predictions are close
   */
  async _marginSampling(count) {
    const samplesWithMargin = this.unlabeledData
      .filter(s => !s.queried && s.prediction?.probabilities)
      .map(sample => {
        const probs = sample.prediction.probabilities.sort((a, b) => b - a);
        const margin = probs[0] - (probs[1] || 0); // Smaller margin = more uncertain
        return { ...sample, margin };
      })
      .sort((a, b) => a.margin - b.margin);

    return samplesWithMargin.slice(0, count);
  }

  /**
   * Entropy sampling - select highest entropy
   */
  async _entropySampling(count) {
    const samplesWithEntropy = this.unlabeledData
      .filter(s => !s.queried && s.prediction?.probabilities)
      .map(sample => {
        const probs = sample.prediction.probabilities;
        const entropy = -probs.reduce((sum, p) => {
          return sum + (p > 0 ? p * Math.log2(p) : 0);
        }, 0);
        return { ...sample, entropy };
      })
      .sort((a, b) => b.entropy - a.entropy);

    return samplesWithEntropy.slice(0, count);
  }

  /**
   * Query-by-Committee - disagreement between models
   */
  async _queryByCommittee(count) {
    if (this.committeeModels.length < 2) {
      // Fallback to uncertainty if not enough models
      return this._uncertaintySampling(count);
    }

    const samplesWithDisagreement = this.unlabeledData
      .filter(s => !s.queried)
      .map(sample => {
        const predictions = this.committeeModels.map(model => 
          model.predict(sample)
        );
        
        // Calculate disagreement
        const votes = {};
        for (const pred of predictions) {
          const label = pred.label || 'unknown';
          votes[label] = (votes[label] || 0) + 1;
        }
        
        const disagreement = 1 - (Math.max(...Object.values(votes)) / predictions.length);
        return { ...sample, disagreement };
      })
      .sort((a, b) => b.disagreement - a.disagreement);

    return samplesWithDisagreement.slice(0, count);
  }

  /**
   * Diversity sampling - select diverse samples
   */
  async _diversitySampling(count) {
    // Simple diversity: select samples that are farthest from each other
    const selected = [];
    const remaining = this.unlabeledData.filter(s => !s.queried);
    
    if (remaining.length === 0) return [];
    
    // Start with most uncertain
    const first = await this._uncertaintySampling(1);
    if (first.length > 0) {
      selected.push(first[0]);
      const idx = remaining.findIndex(s => s.id === first[0].id);
      if (idx !== -1) remaining.splice(idx, 1);
    }

    // Select diverse samples
    while (selected.length < count && remaining.length > 0) {
      let bestCandidate = null;
      let bestMinDistance = -1;

      for (const candidate of remaining) {
        const minDistance = Math.min(
          ...selected.map(s => this._distance(s, candidate))
        );
        
        if (minDistance > bestMinDistance) {
          bestMinDistance = minDistance;
          bestCandidate = candidate;
        }
      }

      if (bestCandidate) {
        selected.push(bestCandidate);
        const idx = remaining.findIndex(s => s.id === bestCandidate.id);
        if (idx !== -1) remaining.splice(idx, 1);
      } else {
        break;
      }
    }

    return selected;
  }

  /**
   * Calculate distance between two samples (simple feature-based)
   */
  _distance(sample1, sample2) {
    // Simple Hamming-like distance for demonstration
    const features1 = sample1.features || {};
    const features2 = sample2.features || {};
    
    let distance = 0;
    const allKeys = new Set([...Object.keys(features1), ...Object.keys(features2)]);
    
    for (const key of allKeys) {
      const v1 = features1[key] || 0;
      const v2 = features2[key] || 0;
      distance += Math.abs(v1 - v2);
    }
    
    return distance;
  }

  /**
   * Add labeled sample
   */
  async addLabeledSample(sample, label) {
    // Find in unlabeled and move to labeled
    const idx = this.unlabeledData.findIndex(s => s.id === sample.id);
    
    const labeledSample = {
      ...sample,
      label,
      labeledAt: Date.now()
    };
    
    if (idx !== -1) {
      this.unlabeledData.splice(idx, 1);
    }
    
    this.labeledData.push(labeledSample);
    
    // Update label distribution
    this.statistics.labelDistribution[label] = 
      (this.statistics.labelDistribution[label] || 0) + 1;
    
    // Update ratios
    this.performanceMetrics.labeledRatio = 
      this.labeledData.length / (this.labeledData.length + this.unlabeledData.length);
    this.performanceMetrics.unlabeledRatio = 1 - this.performanceMetrics.labeledRatio;
    
    // Re-evaluate performance
    await this._evaluatePerformance();
    
    this.emit('sample:labeled', { sample: labeledSample, label });
    
    return labeledSample;
  }

  /**
   * Add batch of labeled samples
   */
  async addLabeledBatch(labeledSamples) {
    for (const { sample, label } of labeledSamples) {
      await this.addLabeledSample(sample, label);
    }
    
    this.emit('batch:labeled', { count: labeledSamples.length });
  }

  /**
   * Evaluate model performance
   */
  async _evaluatePerformance() {
    if (this.labeledData.length === 0) {
      this.performanceMetrics.currentAccuracy = 0;
      return;
    }

    // Simple accuracy calculation
    let correct = 0;
    for (const sample of this.labeledData) {
      const prediction = sample.prediction?.label;
      if (prediction === sample.label) {
        correct++;
      }
    }
    
    this.performanceMetrics.currentAccuracy = correct / this.labeledData.length;
    
    // Track improvement
    if (this.statistics.totalQueries > 0) {
      this.statistics.improvementHistory.push({
        timestamp: Date.now(),
        accuracy: this.performanceMetrics.currentAccuracy,
        labeledCount: this.labeledData.length
      });
    }
  }

  /**
   * Get smart labeling suggestions
   */
  getLabelingSuggestions(count = null) {
    const batchSize = count || this.options.batchSize;
    
    // Get samples that need labeling
    const suggestions = this.unlabeledData
      .filter(s => !s.queried)
      .slice(0, batchSize)
      .map(sample => {
        // Calculate various metrics
        const uncertainty = sample.prediction?.confidence 
          ? 1 - Math.abs(sample.prediction.confidence - 0.5) * 2 
          : 1;
        
        // Determine suggestion type
        let suggestionType = QueryType.MANUAL;
        let suggestedLabel = null;
        
        if (sample.prediction?.confidence > 0.9) {
          suggestionType = QueryType.SEMI_AUTOMATIC;
          suggestedLabel = sample.prediction.label;
        }
        
        return {
          id: sample.id,
          sample,
          uncertainty,
          suggestionType,
          suggestedLabel,
          priority: uncertainty > 0.7 ? 'high' : uncertainty > 0.4 ? 'medium' : 'low',
          reason: this._getSuggestionReason(uncertainty, suggestionType)
        };
      })
      .sort((a, b) => b.uncertainty - a.uncertainty);
    
    return suggestions;
  }

  /**
   * Get reason for suggestion
   */
  _getSuggestionReason(uncertainty, type) {
    if (type === QueryType.SEMI_AUTOMATIC) {
      return 'High confidence prediction - verify only';
    }
    if (uncertainty > 0.7) {
      return 'High uncertainty - needs human labeling';
    }
    if (uncertainty > 0.4) {
      return 'Medium uncertainty - valuable for learning';
    }
    return 'Low uncertainty - may not need labeling';
  }

  /**
   * Add committee model for QBC
   */
  addCommitteeModel(model) {
    this.committeeModels.push(model);
    this.emit('committee:model_added', { modelCount: this.committeeModels.length });
  }

  /**
   * Get learning progress report
   */
  getProgressReport() {
    return {
      performance: { ...this.performanceMetrics },
      statistics: { ...this.statistics },
      data: {
        labeled: this.labeledData.length,
        unlabeled: this.unlabeledData.length,
        queried: this.queryHistory.length
      },
      strategy: this.options.strategy,
      committeeSize: this.committeeModels.length,
      suggestions: this.getLabelingSuggestions(5)
    };
  }

  /**
   * Export training data
   */
  exportTrainingData() {
    return {
      labeled: this.labeledData,
      unlabeled: this.unlabeledData,
      metadata: {
        exportedAt: Date.now(),
        totalSamples: this.labeledData.length + this.unlabeledData.length,
        labelDistribution: this.statistics.labelDistribution
      }
    };
  }

  /**
   * Change sampling strategy
   */
  setStrategy(strategy) {
    this.options.strategy = strategy;
    this.emit('strategy:changed', { strategy });
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      ...this.statistics,
      labeledDistribution: this.statistics.labelDistribution,
      totalDataSize: this.labeledData.length + this.unlabeledData.length,
      labelEfficiency: this.labeledData.length > 0 
        ? this.performanceMetrics.currentAccuracy / this.labeledData.length 
        : 0
    };
  }
}

/**
 * Factory function
 */
export function createActiveLearningPipeline(options) {
  return new ActiveLearningPipeline(options);
}

export default ActiveLearningPipeline;

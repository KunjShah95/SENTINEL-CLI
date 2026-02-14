/**
 * ACTIVE LEARNING SYSTEM
 *
 * Intelligently suggests which samples need labeling to maximize learning
 *
 * Features:
 * - Uncertainty sampling (suggest most uncertain predictions)
 * - Query-by-committee (use disagreement between models)
 * - Expected model change (suggest samples that will change model most)
 * - Diversity sampling (ensure representative coverage)
 * - Budget-aware labeling (prioritize within labeling budget)
 * - Human-in-the-loop integration
 * - Progressive labeling workflow
 *
 * Inspired by:
 * - Google's Active Learning research
 * - DeepMind's data efficiency techniques
 * - Anthropic's Constitutional AI labeling strategies
 */

import { getLLMOrchestrator } from '../llm/llmOrchestrator.js';
import { getSessionStore } from '../context/sessionStore.js';
import crypto from 'crypto';

export class ActiveLearningSystem {
  constructor(options = {}) {
    this.options = {
      uncertaintyThreshold: options.uncertaintyThreshold || 0.4,
      diversityWeight: options.diversityWeight || 0.3,
      representativenessWeight: options.representativenessWeight || 0.2,
      batchSize: options.batchSize || 10,
      labelingBudget: options.labelingBudget || 100,
      committeSize: options.committeSize || 5,
      samplingStrategy: options.samplingStrategy || 'hybrid', // uncertainty, diversity, hybrid
      ...options
    };

    this.llm = null;
    this.sessionStore = null;

    // Unlabeled pool
    this.unlabeledPool = [];

    // Labeled dataset
    this.labeledDataset = [];

    // Model committee for query-by-committee
    this.committee = [];

    // Labeling history
    this.labelingHistory = [];

    // Budget tracking
    this.budgetUsed = 0;
  }

  async initialize() {
    this.llm = getLLMOrchestrator();
    this.sessionStore = getSessionStore();

    // Load labeled dataset
    await this.loadLabeledDataset();

    // Load labeling history
    await this.loadLabelingHistory();

    console.log('✅ Active Learning System initialized');
    console.log(`📊 Labeled samples: ${this.labeledDataset.length}`);
    console.log(`💰 Budget used: ${this.budgetUsed}/${this.options.labelingBudget}`);
  }

  /**
   * SUGGEST SAMPLES TO LABEL
   *
   * Main entry point - suggests most valuable samples for labeling
   */
  async suggestSamplesToLabel(unlabeledSamples, options = {}) {
    const {
      batchSize = this.options.batchSize,
      strategy = this.options.samplingStrategy
    } = options;

    console.log(`🎯 Analyzing ${unlabeledSamples.length} unlabeled samples...`);

    // Add to unlabeled pool
    this.unlabeledPool = unlabeledSamples;

    // Score all samples based on strategy
    const scored = await this.scoreSamples(unlabeledSamples, strategy);

    // Select top samples
    const selected = this.selectTopSamples(scored, batchSize);

    console.log(`✅ Selected ${selected.length} samples for labeling`);
    console.log(`📊 Avg uncertainty: ${this.avgScore(selected, 'uncertainty').toFixed(3)}`);
    console.log(`📊 Avg diversity: ${this.avgScore(selected, 'diversity').toFixed(3)}`);

    return {
      samples: selected,
      strategy,
      reasoning: this.explainSelection(selected)
    };
  }

  /**
   * SCORE SAMPLES
   *
   * Score samples based on various active learning strategies
   */
  async scoreSamples(samples, strategy) {
    const scored = [];

    for (const sample of samples) {
      const score = {
        sample,
        id: sample.id || crypto.randomUUID(),
        uncertainty: 0,
        diversity: 0,
        representativeness: 0,
        expectedChange: 0,
        finalScore: 0
      };

      // Calculate component scores
      score.uncertainty = await this.calculateUncertainty(sample);
      score.diversity = await this.calculateDiversity(sample);
      score.representativeness = await this.calculateRepresentativeness(sample);
      score.expectedChange = await this.estimateModelChange(sample);

      // Combine scores based on strategy
      score.finalScore = this.combineScores(score, strategy);

      scored.push(score);
    }

    return scored;
  }

  /**
   * UNCERTAINTY SAMPLING
   *
   * Measure model's uncertainty about a sample
   */
  async calculateUncertainty(sample) {
    // Method 1: Entropy-based uncertainty
    const entropyScore = await this.calculateEntropy(sample);

    // Method 2: Margin sampling (difference between top 2 predictions)
    const marginScore = await this.calculateMargin(sample);

    // Method 3: Query-by-committee (disagreement among committee)
    const committeeScore = await this.queryByCommittee(sample);

    // Combine uncertainty measures
    return (entropyScore * 0.4 + marginScore * 0.3 + committeeScore * 0.3);
  }

  async calculateEntropy(sample) {
    // Get model predictions for this sample
    // In production, would run actual model inference
    // For now, simulate based on sample complexity

    const predictions = await this.getPredictions(sample);

    // Calculate Shannon entropy
    let entropy = 0;
    for (const prob of predictions) {
      if (prob > 0) {
        entropy -= prob * Math.log2(prob);
      }
    }

    // Normalize by max entropy (log2 of number of classes)
    const maxEntropy = Math.log2(predictions.length);
    return maxEntropy > 0 ? entropy / maxEntropy : 0;
  }

  async calculateMargin(sample) {
    const predictions = await this.getPredictions(sample);

    // Sort predictions in descending order
    predictions.sort((a, b) => b - a);

    // Margin = difference between top 2
    const margin = predictions[0] - predictions[1];

    // Return inverted margin (lower margin = higher uncertainty)
    return 1 - margin;
  }

  async queryByCommittee(sample) {
    if (this.committee.length === 0) {
      await this.buildCommittee();
    }

    // Get predictions from each committee member
    const committeePredictions = await Promise.all(
      this.committee.map(model => this.getModelPrediction(model, sample))
    );

    // Calculate vote entropy (disagreement)
    const voteCounts = new Map();
    for (const pred of committeePredictions) {
      voteCounts.set(pred, (voteCounts.get(pred) || 0) + 1);
    }

    const voteProbs = Array.from(voteCounts.values()).map(
      count => count / committeePredictions.length
    );

    // Calculate entropy of votes
    let entropy = 0;
    for (const prob of voteProbs) {
      if (prob > 0) {
        entropy -= prob * Math.log2(prob);
      }
    }

    const maxEntropy = Math.log2(this.committee.length);
    return maxEntropy > 0 ? entropy / maxEntropy : 0;
  }

  /**
   * DIVERSITY SAMPLING
   *
   * Ensure selected samples cover diverse regions of feature space
   */
  async calculateDiversity(sample) {
    // Measure distance to already labeled samples
    const features = this.extractFeatures(sample);

    if (this.labeledDataset.length === 0) {
      return 1.0; // Maximum diversity if no labeled samples
    }

    // Calculate minimum distance to labeled samples
    let minDistance = Infinity;

    for (const labeled of this.labeledDataset) {
      const labeledFeatures = this.extractFeatures(labeled);
      const distance = this.euclideanDistance(features, labeledFeatures);

      if (distance < minDistance) {
        minDistance = distance;
      }
    }

    // Normalize distance
    return Math.min(1, minDistance / 10);
  }

  /**
   * REPRESENTATIVENESS SAMPLING
   *
   * Select samples that are representative of the unlabeled pool
   */
  async calculateRepresentativeness(sample) {
    if (this.unlabeledPool.length === 0) {
      return 0.5;
    }

    const features = this.extractFeatures(sample);

    // Calculate average distance to all unlabeled samples
    let totalDistance = 0;

    for (const unlabeled of this.unlabeledPool) {
      const unlabeledFeatures = this.extractFeatures(unlabeled);
      const distance = this.euclideanDistance(features, unlabeledFeatures);
      totalDistance += distance;
    }

    const avgDistance = totalDistance / this.unlabeledPool.length;

    // Lower average distance = more representative
    // Invert and normalize
    return Math.max(0, 1 - avgDistance / 10);
  }

  /**
   * EXPECTED MODEL CHANGE
   *
   * Estimate how much model will change if we label this sample
   */
  async estimateModelChange(sample) {
    // Estimate gradient magnitude (how much parameters would change)
    // Simplified: use uncertainty as proxy
    const uncertainty = await this.calculateUncertainty(sample);

    // High uncertainty samples likely to cause more change
    return uncertainty;
  }

  /**
   * COMBINE SCORES
   */
  combineScores(score, strategy) {
    switch (strategy) {
      case 'uncertainty':
        return score.uncertainty;

      case 'diversity':
        return (
          score.diversity * 0.6 +
          score.representativeness * 0.4
        );

      case 'hybrid':
        return (
          score.uncertainty * 0.5 +
          score.diversity * this.options.diversityWeight +
          score.representativeness * this.options.representativenessWeight
        );

      case 'expected_change':
        return score.expectedChange;

      default:
        return score.uncertainty;
    }
  }

  /**
   * SELECT TOP SAMPLES
   *
   * Select samples with highest scores while ensuring diversity
   */
  selectTopSamples(scoredSamples, batchSize) {
    // Sort by score
    scoredSamples.sort((a, b) => b.finalScore - a.finalScore);

    const selected = [];
    const selectedFeatures = [];

    for (const scored of scoredSamples) {
      if (selected.length >= batchSize) break;

      // Check diversity constraint
      const features = this.extractFeatures(scored.sample);

      let tooSimilar = false;
      for (const selectedF of selectedFeatures) {
        const distance = this.euclideanDistance(features, selectedF);
        if (distance < 2.0) {
          // Too similar to already selected sample
          tooSimilar = true;
          break;
        }
      }

      if (!tooSimilar) {
        selected.push(scored);
        selectedFeatures.push(features);
      }
    }

    return selected;
  }

  /**
   * RECORD LABEL
   *
   * User provides label for a sample
   */
  async recordLabel(sampleId, label, confidence = 1.0, metadata = {}) {
    // Find sample in unlabeled pool
    const sampleIndex = this.unlabeledPool.findIndex(s =>
      (s.id || s) === sampleId
    );

    if (sampleIndex === -1) {
      throw new Error(`Sample ${sampleId} not found in unlabeled pool`);
    }

    const sample = this.unlabeledPool[sampleIndex];

    // Remove from unlabeled pool
    this.unlabeledPool.splice(sampleIndex, 1);

    // Add to labeled dataset
    const labeledSample = {
      ...sample,
      label,
      confidence,
      labeledAt: Date.now(),
      labeledBy: metadata.user || 'user',
      metadata
    };

    this.labeledDataset.push(labeledSample);

    // Update budget
    this.budgetUsed++;

    // Record in history
    this.labelingHistory.push({
      sampleId,
      label,
      timestamp: Date.now(),
      budgetRemaining: this.options.labelingBudget - this.budgetUsed
    });

    // Save to session store
    await this.saveLabeledDataset();
    await this.saveLabelingHistory();

    console.log(`✅ Labeled sample ${sampleId}`);
    console.log(`💰 Budget: ${this.budgetUsed}/${this.options.labelingBudget}`);

    return labeledSample;
  }

  /**
   * BATCH LABELING WORKFLOW
   *
   * Interactive labeling session
   */
  async labelingSession(unlabeledSamples, options = {}) {
    const {
      batchSize = this.options.batchSize,
      callback = null
    } = options;

    console.log('🎯 Starting labeling session...');

    // Suggest samples
    const suggestion = await this.suggestSamplesToLabel(unlabeledSamples, {
      batchSize
    });

    // If callback provided, get labels interactively
    if (callback) {
      for (const scored of suggestion.samples) {
        const label = await callback(scored.sample, scored);

        if (label) {
          await this.recordLabel(
            scored.id,
            label,
            scored.uncertainty < 0.3 ? 1.0 : 0.8
          );
        }
      }
    }

    console.log('✅ Labeling session complete');

    return {
      labeled: suggestion.samples.length,
      budgetUsed: this.budgetUsed,
      budgetRemaining: this.options.labelingBudget - this.budgetUsed
    };
  }

  /**
   * PROGRESSIVE LABELING
   *
   * Iteratively label samples and retrain
   */
  async progressiveLabeling(unlabeledSamples, model, options = {}) {
    const {
      iterations = 10,
      batchSize = this.options.batchSize,
      retrainCallback = null
    } = options;

    console.log(`🔄 Starting progressive labeling (${iterations} iterations)...`);

    const results = {
      iterations: [],
      finalAccuracy: 0,
      totalLabeled: 0
    };

    for (let i = 0; i < iterations; i++) {
      console.log(`\n📍 Iteration ${i + 1}/${iterations}`);

      // Suggest samples
      const suggestion = await this.suggestSamplesToLabel(unlabeledSamples, {
        batchSize
      });

      // Simulate labeling (in production, would be human-in-the-loop)
      for (const scored of suggestion.samples) {
        const simulatedLabel = this.simulateLabel(scored.sample);
        await this.recordLabel(scored.id, simulatedLabel);
      }

      // Retrain model
      if (retrainCallback) {
        const newModel = await retrainCallback(this.labeledDataset);
        this.committee = [newModel, ...this.committee.slice(0, this.options.committeSize - 1)];
      }

      // Track progress
      results.iterations.push({
        iteration: i + 1,
        labeled: suggestion.samples.length,
        totalLabeled: this.labeledDataset.length,
        avgUncertainty: this.avgScore(suggestion.samples, 'uncertainty')
      });

      results.totalLabeled = this.labeledDataset.length;
    }

    console.log('✅ Progressive labeling complete');

    return results;
  }

  /**
   * HELPER METHODS
   */

  async getPredictions(sample) {
    // Simulate model predictions
    // In production, would run actual model
    const complexity = sample.complexity || 'moderate';

    const distributions = {
      simple: [0.8, 0.15, 0.05],
      moderate: [0.4, 0.4, 0.2],
      complex: [0.3, 0.3, 0.4],
      very_complex: [0.2, 0.3, 0.5]
    };

    return distributions[complexity] || [0.33, 0.33, 0.34];
  }

  async buildCommittee() {
    // Build committee of diverse models
    // In production, would train different models
    // For now, create synthetic committee members

    this.committee = Array(this.options.committeSize).fill(null).map((_, i) => ({
      id: `model_${i}`,
      variant: i,
      temperature: 0.3 + i * 0.1
    }));
  }

  async getModelPrediction(model, sample) {
    // Get prediction from committee member
    // In production, would run model inference
    const predictions = await this.getPredictions(sample);

    // Add some variation based on model variant
    (Math.random() - 0.5) * 0.1 * model.variant;
    const maxIndex = predictions.indexOf(Math.max(...predictions));

    return maxIndex;
  }

  extractFeatures(sample) {
    // Extract feature vector for similarity computation
    return {
      queryLength: sample.query?.length || 0,
      wordCount: sample.query?.split(/\s+/).length || 0,
      complexity: this.complexityToNumber(sample.complexity),
      hasTrace: sample.features?.hasTrace ? 1 : 0,
      hasRelation: sample.features?.hasRelation ? 1 : 0,
      hasSecurity: sample.features?.hasSecurity ? 1 : 0,
      hasMultiple: sample.features?.hasMultiple ? 1 : 0,
      hasFunction: sample.features?.hasFunction ? 1 : 0,
      hasClass: sample.features?.hasClass ? 1 : 0
    };
  }

  euclideanDistance(features1, features2) {
    let sum = 0;

    for (const key in features1) {
      if (key in features2) {
        sum += Math.pow(features1[key] - features2[key], 2);
      }
    }

    return Math.sqrt(sum);
  }

  complexityToNumber(complexity) {
    const mapping = {
      simple: 0.25,
      moderate: 0.5,
      complex: 0.75,
      very_complex: 1.0
    };
    return mapping[complexity] || 0.5;
  }

  avgScore(samples, scoreType) {
    if (samples.length === 0) return 0;

    const sum = samples.reduce((acc, s) => acc + (s[scoreType] || 0), 0);
    return sum / samples.length;
  }

  explainSelection(samples) {
    const avgUncertainty = this.avgScore(samples, 'uncertainty');
    const avgDiversity = this.avgScore(samples, 'diversity');

    const reasons = [];

    if (avgUncertainty > 0.6) {
      reasons.push('High uncertainty - model is uncertain about these samples');
    } else if (avgUncertainty < 0.3) {
      reasons.push('Low uncertainty but high diversity - covering different regions');
    }

    if (avgDiversity > 0.6) {
      reasons.push('High diversity - samples cover different areas of feature space');
    }

    return reasons.join('; ');
  }

  simulateLabel(sample) {
    // Simulate oracle labeling
    // In production, would be human labeling
    const complexity = sample.complexity || 'moderate';

    const labelMapping = {
      simple: 'correct',
      moderate: Math.random() > 0.5 ? 'correct' : 'partially_correct',
      complex: Math.random() > 0.3 ? 'partially_correct' : 'incorrect',
      very_complex: Math.random() > 0.5 ? 'incorrect' : 'partially_correct'
    };

    return labelMapping[complexity] || 'partially_correct';
  }

  /**
   * PERSISTENCE
   */

  async loadLabeledDataset() {
    try {
      const saved = this.sessionStore.getKnowledge('global', 'active_learning', 'labeled_dataset');
      if (saved.length > 0) {
        this.labeledDataset = saved[0].value;
        console.log(`📂 Loaded ${this.labeledDataset.length} labeled samples`);
      }
    } catch (error) {
      console.log('No labeled dataset found');
    }
  }

  async saveLabeledDataset() {
    this.sessionStore.setKnowledge(
      'global',
      'active_learning',
      'labeled_dataset',
      this.labeledDataset,
      1.0,
      'learned'
    );
  }

  async loadLabelingHistory() {
    try {
      const saved = this.sessionStore.getKnowledge('global', 'active_learning', 'history');
      if (saved.length > 0) {
        this.labelingHistory = saved[0].value;
        this.budgetUsed = this.labelingHistory.length;
        console.log(`📂 Loaded labeling history (${this.budgetUsed} labels)`);
      }
    } catch (error) {
      console.log('No labeling history found');
    }
  }

  async saveLabelingHistory() {
    this.sessionStore.setKnowledge(
      'global',
      'active_learning',
      'history',
      this.labelingHistory,
      1.0,
      'learned'
    );
  }

  /**
   * GET STATS
   */
  getStats() {
    return {
      labeledSamples: this.labeledDataset.length,
      unlabeledSamples: this.unlabeledPool.length,
      budgetUsed: this.budgetUsed,
      budgetRemaining: this.options.labelingBudget - this.budgetUsed,
      labelingHistory: this.labelingHistory.length,
      committeeSize: this.committee.length,
      recentLabels: this.labelingHistory.slice(-10)
    };
  }
}

// Factory function
export function createActiveLearningSystem(options) {
  return new ActiveLearningSystem(options);
}

export default ActiveLearningSystem;

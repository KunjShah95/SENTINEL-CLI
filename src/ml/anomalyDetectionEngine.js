/**
 * ANOMALY DETECTION ENGINE
 * 
 * Inspired by DeepMind's research on anomaly detection and Andrew Ng's 
 * practical ML applications. Uses statistical and ML methods to detect
 * unusual patterns in code and security findings.
 * 
 * Key Features:
 * - Isolation Forest for outlier detection
 * - Statistical anomaly detection
 * - Profile-based detection
 * - Real-time alerting
 * - Multi-dimensional analysis
 */

import { EventEmitter } from 'events';

/**
 * Anomaly types
 */
export const AnomalyType = {
  STATISTICAL: 'statistical',        // Statistical outlier
  CONTEXTUAL: 'contextual',          // Context-dependent anomaly
  COLLECTIVE: 'collective',          // Collective anomaly
  POINT: 'point',                   // Point anomaly
  SEQUENTIAL: 'sequential'          // Sequential pattern anomaly
};

/**
 * Severity levels for anomalies
 */
export const AnomalySeverity = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info'
};

export class AnomalyDetectionEngine extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      contamination: options.contamination || 0.1,  // Expected proportion of anomalies
      threshold: options.threshold || 0.5,
      nEstimators: options.nEstimators || 100,
      maxSamples: options.maxSamples || 256,
      enableOnline: options.enableOnline ?? true,
      profileUpdateInterval: options.profileUpdateInterval || 3600000, // 1 hour
      alertOnAnomaly: options.alertOnAnomaly ?? true,
      ...options
    };

    // Profiles for different entities
    this.profiles = {
      user: new Map(),
      file: new Map(),
      rule: new Map(),
      session: new Map()
    };

    // Historical data for baseline
    this.baselineData = {
      findings: [],
      patterns: [],
      statistics: {}
    };

    // Anomaly history
    this.anomalyHistory = [];
    this.maxHistorySize = options.maxHistorySize || 10000;

    // Detection models
    this.models = {
      isolationForest: null,
      statistical: null,
      profile: null
    };

    // Alert rules
    this.alertRules = [];

    // Initialize detection components
    this._initializeModels();
  }

  /**
   * Initialize detection models
   */
  _initializeModels() {
    // Initialize Isolation Forest (simplified implementation)
    this.models.isolationForest = {
      trees: [],
      nEstimators: this.options.nEstimators,
      maxSamples: this.options.maxSamples,
      trained: false
    };

    // Initialize statistical model
    this.models.statistical = {
      mean: {},
      std: {},
      quartiles: {},
      distribution: 'normal'
    };

    // Initialize profile-based model
    this.models.profile = {
      userProfiles: new Map(),
      fileProfiles: new Map(),
      ruleProfiles: new Map()
    };
  }

  /**
   * Train the anomaly detection model
   */
  async train(data) {
    const startTime = Date.now();
    
    // Convert data to feature vectors
    const featureVectors = data.map(item => this._extractFeatures(item));
    
    // Train Isolation Forest
    this._trainIsolationForest(featureVectors);
    
    // Calculate statistical properties
    this._calculateStatistics(featureVectors);
    
    // Build profiles
    this._buildProfiles(data);
    
    const trainingTime = Date.now() - startTime;
    
    this.emit('model:trained', {
      trainingTime,
      dataSize: data.length,
      featureDimension: featureVectors[0]?.length || 0
    });

    return {
      trainingTime,
      dataSize: data.length,
      featureDimension: featureVectors[0]?.length || 0
    };
  }

  /**
   * Extract features from data point
   */
  _extractFeatures(item) {
    const features = [];
    
    // Numerical features
    features.push(item.confidence || 0.5);
    features.push(item.severityScore || 0.5);
    features.push(item.fileComplexity || 0);
    features.push(item.ruleFrequency || 0);
    features.push(item.userActivity || 0);
    
    // Categorical features (encoded)
    features.push(this._encodeSeverity(item.severity));
    features.push(this._encodeCategory(item.category));
    features.push(this._encodeLanguage(item.language));
    
    // Contextual features
    features.push(item.timeOfDay || 12);
    features.push(item.dayOfWeek || 1);
    
    return features;
  }

  /**
   * Encode severity to numerical
   */
  _encodeSeverity(severity) {
    const map = { critical: 1, high: 0.75, medium: 0.5, low: 0.25, info: 0 };
    return map[severity] || 0.5;
  }

  /**
   * Encode category to numerical
   */
  _encodeCategory(category) {
    const map = { 
      security: 1, 
      performance: 0.8, 
      reliability: 0.6, 
      maintainability: 0.4, 
      accessibility: 0.2 
    };
    return map[category] || 0.5;
  }

  /**
   * Encode language to numerical
   */
  _encodeLanguage(language) {
    const map = {
      javascript: 0.1,
      typescript: 0.2,
      python: 0.3,
      java: 0.4,
      go: 0.5,
      rust: 0.6,
      cpp: 0.7,
      csharp: 0.8
    };
    return map[language?.toLowerCase()] || 0.5;
  }

  /**
   * Train Isolation Forest (simplified)
   */
  _trainIsolationForest(data) {
    const { nEstimators, maxSamples } = this.options;
    const sampleSize = Math.min(maxSamples, data.length);
    
    this.models.isolationForest.trees = [];
    
    for (let i = 0; i < nEstimators; i++) {
      // Random subsample
      const sample = [];
      for (let j = 0; j < sampleSize; j++) {
        sample.push(data[Math.floor(Math.random() * data.length)]);
      }
      
      // Build a random tree
      const tree = this._buildRandomTree(sample, 0, Math.ceil(Math.log2(sampleSize)));
      this.models.isolationForest.trees.push(tree);
    }
    
    this.models.isolationForest.trained = true;
  }

  /**
   * Build random tree for Isolation Forest
   */
  _buildRandomTree(data, depth, maxDepth) {
    if (depth >= maxDepth || data.length <= 1) {
      return { type: 'leaf', size: data.length };
    }

    // Random split
    const featureIndex = Math.floor(Math.random() * data[0].length);
    const splitValue = Math.random();
    
    const left = data.filter(d => d[featureIndex] < splitValue);
    const right = data.filter(d => d[featureIndex] >= splitValue);
    
    return {
      type: 'node',
      featureIndex,
      splitValue,
      left: this._buildRandomTree(left, depth + 1, maxDepth),
      right: this._buildRandomTree(right, depth + 1, maxDepth)
    };
  }

  /**
   * Calculate path length for Isolation Forest
   */
  _pathLength(sample, tree, depth = 0) {
    if (tree.type === 'leaf') {
      return depth + this._c(tree.size);
    }
    
    if (sample[tree.featureIndex] < tree.splitValue) {
      return this._pathLength(sample, tree.left, depth + 1);
    } else {
      return this._pathLength(sample, tree.right, depth + 1);
    }
  }

  /**
   * Correction factor for path length
   */
  _c(n) {
    if (n <= 1) return 0;
    return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1) / n);
  }

  /**
   * Calculate statistics for baseline
   */
  _calculateStatistics(data) {
    const numFeatures = data[0]?.length || 0;
    
    for (let i = 0; i < numFeatures; i++) {
      const values = data.map(d => d[i]).filter(v => v !== undefined);
      
      // Mean
      this.models.statistical.mean[i] = values.reduce((a, b) => a + b, 0) / values.length;
      
      // Standard deviation
      const mean = this.models.statistical.mean[i];
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      this.models.statistical.std[i] = Math.sqrt(variance);
      
      // Quartiles
      const sorted = [...values].sort((a, b) => a - b);
      this.models.statistical.quartiles[i] = {
        q1: sorted[Math.floor(sorted.length * 0.25)],
        q2: sorted[Math.floor(sorted.length * 0.5)],
        q3: sorted[Math.floor(sorted.length * 0.75)]
      };
    }
  }

  /**
   * Build profiles for entities
   */
  _buildProfiles(data) {
    // Group by entity type and calculate profiles
    const groupedByUser = {};
    const groupedByFile = {};
    const groupedByRule = {};
    
    for (const item of data) {
      if (item.userId) {
        if (!groupedByUser[item.userId]) {
          groupedByUser[item.userId] = [];
        }
        groupedByUser[item.userId].push(item);
      }
      
      if (item.filePath) {
        if (!groupedByFile[item.filePath]) {
          groupedByFile[item.filePath] = [];
        }
        groupedByFile[item.filePath].push(item);
      }
      
      if (item.ruleId) {
        if (!groupedByRule[item.ruleId]) {
          groupedByRule[item.ruleId] = [];
        }
        groupedByRule[item.ruleId].push(item);
      }
    }
    
    // Store profiles
    for (const [userId, items] of Object.entries(groupedByUser)) {
      this.models.profile.userProfiles.set(userId, this._createProfile(items));
    }
    
    for (const [filePath, items] of Object.entries(groupedByFile)) {
      this.models.profile.fileProfiles.set(filePath, this._createProfile(items));
    }
    
    for (const [ruleId, items] of Object.entries(groupedByRule)) {
      this.models.profile.ruleProfiles.set(ruleId, this._createProfile(items));
    }
  }

  /**
   * Create profile from items
   */
  _createProfile(items) {
    return {
      count: items.length,
      avgConfidence: items.reduce((sum, i) => sum + (i.confidence || 0), 0) / items.length,
      severityDistribution: this._getSeverityDistribution(items),
      firstSeen: Math.min(...items.map(i => i.timestamp || Date.now())),
      lastSeen: Math.max(...items.map(i => i.timestamp || Date.now()))
    };
  }

  /**
   * Get severity distribution
   */
  _getSeverityDistribution(items) {
    const dist = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const item of items) {
      const severity = item.severity || 'medium';
      dist[severity] = (dist[severity] || 0) + 1;
    }
    return dist;
  }

  /**
   * Detect anomalies in data
   */
  async detect(data) {
    if (!this.models.isolationForest.trained) {
      throw new Error('Model not trained. Call train() first.');
    }

    const results = [];
    
    for (const item of data) {
      const features = this._extractFeatures(item);
      
      // Run all detection methods
      const isolationScore = this._detectIsolationForest(features);
      const statisticalScore = this._detectStatistical(features);
      const profileScore = this._detectProfile(item);
      
      // Combine scores
      const anomalyScore = (
        isolationScore * 0.4 +
        statisticalScore * 0.3 +
        profileScore * 0.3
      );

      const scores = { isolationScore, statisticalScore, profileScore };

      if (anomalyScore > this.options.threshold) {
        const anomaly = {
          id: `anomaly-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          item,
          anomalyScore,
          type: this._determineAnomalyType(item, scores),
          severity: this._determineSeverity(anomalyScore),
          details: {
            isolationScore,
            statisticalScore,
            profileScore
          },
          timestamp: Date.now()
        };
        
        results.push(anomaly);
        
        // Store in history
        this._addToHistory(anomaly);
        
        // Emit alert if enabled
        if (this.options.alertOnAnomaly) {
          this._checkAlertRules(anomaly);
        }
      }
    }
    
    this.emit('anomalies:detected', { count: results.length, anomalies: results });
    
    return results;
  }

  /**
   * Detect using Isolation Forest
   */
  _detectIsolationForest(features) {
    const pathLengths = this.models.isolationForest.trees.map(
      tree => this._pathLength(features, tree)
    );
    
    const avgPathLength = pathLengths.reduce((a, b) => a + b, 0) / pathLengths.length;
    
    // Calculate anomaly score
    const c = this._c(this.options.maxSamples);
    const score = Math.pow(2, -avgPathLength / c);
    
    return score;
  }

  /**
   * Detect using statistical methods
   */
  _detectStatistical(features) {
    let maxScore = 0;
    
    for (let i = 0; i < features.length; i++) {
      const value = features[i];
      const mean = this.models.statistical.mean[i] || 0;
      const std = this.models.statistical.std[i] || 1;
      
      // Z-score
      const zScore = Math.abs((value - mean) / std);
      
      // Convert to 0-1 score (higher = more anomalous)
      const score = Math.min(1, zScore / 3);
      maxScore = Math.max(maxScore, score);
    }
    
    return maxScore;
  }

  /**
   * Detect using profile-based method
   */
  _detectProfile(item) {
    let maxScore = 0;
    
    // Check user profile
    if (item.userId) {
      const profile = this.models.profile.userProfiles.get(item.userId);
      if (profile) {
        const deviation = Math.abs((item.confidence || 0.5) - profile.avgConfidence);
        maxScore = Math.max(maxScore, deviation * 2);
      }
    }
    
    // Check file profile
    if (item.filePath) {
      const profile = this.models.profile.fileProfiles.get(item.filePath);
      if (profile) {
        maxScore = Math.max(maxScore, 1 / (profile.count + 1));
      }
    }
    
    // Check rule profile
    if (item.ruleId) {
      const profile = this.models.profile.ruleProfiles.get(item.ruleId);
      if (profile) {
        maxScore = Math.max(maxScore, 1 / (profile.count + 1));
      }
    }
    
    return Math.min(1, maxScore);
  }

  /**
   * Determine anomaly type
   */
  _determineAnomalyType(item, scores) {
    if (scores.isolationScore > 0.7) return AnomalyType.POINT;
    if (scores.statisticalScore > 0.6) return AnomalyType.STATISTICAL;
    if (scores.profileScore > 0.5) return AnomalyType.CONTEXTUAL;
    return AnomalyType.POINT;
  }

  /**
   * Determine severity
   */
  _determineSeverity(score) {
    if (score > 0.9) return AnomalySeverity.CRITICAL;
    if (score > 0.7) return AnomalySeverity.HIGH;
    if (score > 0.5) return AnomalySeverity.MEDIUM;
    if (score > 0.3) return AnomalySeverity.LOW;
    return AnomalySeverity.INFO;
  }

  /**
   * Add anomaly to history
   */
  _addToHistory(anomaly) {
    this.anomalyHistory.push(anomaly);
    
    if (this.anomalyHistory.length > this.maxHistorySize) {
      this.anomalyHistory = this.anomalyHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Check alert rules
   */
  _checkAlertRules(anomaly) {
    for (const rule of this.alertRules) {
      if (this._matchesAlertRule(anomaly, rule)) {
        this.emit('alert:triggered', {
          rule: rule.name,
          anomaly,
          severity: anomaly.severity
        });
      }
    }
  }

  /**
   * Check if anomaly matches alert rule
   */
  _matchesAlertRule(anomaly, rule) {
    if (rule.minScore && anomaly.anomalyScore < rule.minScore) return false;
    if (rule.maxScore && anomaly.anomalyScore > rule.maxScore) return false;
    if (rule.severity && anomaly.severity !== rule.severity) return false;
    if (rule.type && anomaly.type !== rule.type) return false;
    return true;
  }

  /**
   * Add alert rule
   */
  addAlertRule(rule) {
    this.alertRules.push({
      ...rule,
      id: `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now()
    });
    
    this.emit('alert_rule:added', rule);
  }

  /**
   * Get anomaly statistics
   */
  getStatistics() {
    const recent = this.anomalyHistory.slice(-1000);
    
    return {
      totalAnomalies: this.anomalyHistory.length,
      recentAnomalies: recent.length,
      bySeverity: this._countBySeverity(recent),
      byType: this._countByType(recent),
      avgScore: recent.length > 0 
        ? recent.reduce((sum, a) => sum + a.anomalyScore, 0) / recent.length 
        : 0,
      trend: this._calculateTrend(recent)
    };
  }

  /**
   * Count by severity
   */
  _countBySeverity(anomalies) {
    const counts = {};
    for (const a of anomalies) {
      counts[a.severity] = (counts[a.severity] || 0) + 1;
    }
    return counts;
  }

  /**
   * Count by type
   */
  _countByType(anomalies) {
    const counts = {};
    for (const a of anomalies) {
      counts[a.type] = (counts[a.type] || 0) + 1;
    }
    return counts;
  }

  /**
   * Calculate trend
   */
  _calculateTrend(anomalies) {
    if (anomalies.length < 2) return 'stable';
    
    const half = Math.floor(anomalies.length / 2);
    const firstHalf = anomalies.slice(0, half);
    const secondHalf = anomalies.slice(half);
    
    const firstAvg = firstHalf.reduce((sum, a) => sum + a.anomalyScore, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, a) => sum + a.anomalyScore, 0) / secondHalf.length;
    
    if (secondAvg > firstAvg * 1.1) return 'increasing';
    if (secondAvg < firstAvg * 0.9) return 'decreasing';
    return 'stable';
  }

  /**
   * Get recent anomalies
   */
  getRecentAnomalies(count = 10) {
    return this.anomalyHistory.slice(-count).reverse();
  }

  /**
   * Export model
   */
  exportModel() {
    return {
      version: '1.0',
      timestamp: Date.now(),
      options: this.options,
      statistical: this.models.statistical,
      profile: {
        userCount: this.models.profile.userProfiles.size,
        fileCount: this.models.profile.fileProfiles.size,
        ruleCount: this.models.profile.ruleProfiles.size
      }
    };
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.anomalyHistory = [];
    this.emit('history:cleared');
  }
}

/**
 * Factory function
 */
export function createAnomalyDetectionEngine(options) {
  return new AnomalyDetectionEngine(options);
}

export default AnomalyDetectionEngine;

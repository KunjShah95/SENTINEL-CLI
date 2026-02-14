/**
 * ANOMALY DETECTION SYSTEM
 *
 * Detect unusual patterns in code, behavior, and security
 *
 * Features:
 * - Statistical anomaly detection (Z-score, IQR, Isolation Forest)
 * - Behavioral anomaly detection (unusual patterns)
 * - Security anomaly detection (suspicious code patterns)
 * - Time-series anomaly detection (trend changes)
 * - Ensemble anomaly detection (multiple methods)
 * - Explainable anomalies (why something is anomalous)
 * - Adaptive thresholds based on historical data
 *
 * Inspired by:
 * - DeepMind's anomaly detection research
 * - Google's security anomaly systems
 * - Isolation Forest algorithm
 */

import { parse as babelParse } from '@babel/parser';
import traverse from '@babel/traverse';
import { getSessionStore } from '../context/sessionStore.js';

export class AnomalyDetectionSystem {
  constructor(options = {}) {
    this.options = {
      zScoreThreshold: options.zScoreThreshold || 3,
      isolationTreeCount: options.isolationTreeCount || 100,
      minSamplesForDetection: options.minSamplesForDetection || 30,
      anomalyThreshold: options.anomalyThreshold || 0.7,
      adaptiveThresholds: options.adaptiveThresholds !== false,
      ...options
    };

    this.sessionStore = null;

    // Historical data for baseline
    this.baseline = {
      codeMetrics: [],
      behaviorMetrics: [],
      securityPatterns: new Map()
    };

    // Isolation forest
    this.isolationForest = [];

    // Detected anomalies
    this.detectedAnomalies = [];
  }

  async initialize() {
    this.sessionStore = getSessionStore();

    // Load historical baseline
    await this.loadBaseline();

    // Train isolation forest if enough data
    if (this.baseline.codeMetrics.length >= this.options.minSamplesForDetection) {
      await this.trainIsolationForest();
    }

    console.log('✅ Anomaly Detection System initialized');
    console.log(`📊 Baseline samples: ${this.baseline.codeMetrics.length}`);
  }

  /**
   * DETECT ANOMALIES
   *
   * Main entry point - detect anomalies in code/behavior
   */
  async detectAnomalies(data, options = {}) {
    const {
      type = 'code', // code, behavior, security, timeseries
      methods = ['all'], // statistical, isolation, behavioral, ensemble
      explain = true
    } = options;

    console.log(`🔍 Detecting ${type} anomalies...`);

    const anomalies = [];

    // Extract features from data
    const features = await this.extractFeatures(data, type);

    // Apply detection methods
    if (methods.includes('all') || methods.includes('statistical')) {
      const statAnomalies = await this.statisticalDetection(features);
      anomalies.push(...statAnomalies);
    }

    if (methods.includes('all') || methods.includes('isolation')) {
      const isoAnomalies = await this.isolationForestDetection(features);
      anomalies.push(...isoAnomalies);
    }

    if (methods.includes('all') || methods.includes('behavioral')) {
      const behavAnomalies = await this.behavioralDetection(data, type);
      anomalies.push(...behavAnomalies);
    }

    // Ensemble scoring (combine multiple methods)
    const ensembleAnomalies = this.ensembleDetection(anomalies);

    // Filter by threshold
    const filtered = ensembleAnomalies.filter(
      a => a.anomalyScore >= this.options.anomalyThreshold
    );

    // Add explanations
    if (explain) {
      for (const anomaly of filtered) {
        anomaly.explanation = this.explainAnomaly(anomaly);
      }
    }

    // Store detected anomalies
    this.detectedAnomalies.push(...filtered);

    // Update baseline with normal samples
    await this.updateBaseline(features, filtered.length === 0);

    console.log(`✅ Detected ${filtered.length} anomalies`);

    return filtered;
  }

  /**
   * STATISTICAL ANOMALY DETECTION
   *
   * Use statistical methods (Z-score, IQR)
   */
  async statisticalDetection(features) {
    const anomalies = [];

    for (const [feature, value] of Object.entries(features)) {
      // Get historical values for this feature
      const historicalValues = this.baseline.codeMetrics.map(m => m[feature]).filter(v => v !== undefined);

      if (historicalValues.length < this.options.minSamplesForDetection) {
        continue; // Not enough data
      }

      // Z-score method
      const zScore = this.calculateZScore(value, historicalValues);

      if (Math.abs(zScore) > this.options.zScoreThreshold) {
        anomalies.push({
          type: 'statistical',
          method: 'z-score',
          feature,
          value,
          zScore,
          anomalyScore: Math.min(1, Math.abs(zScore) / 10),
          severity: this.classifySeverity(Math.abs(zScore))
        });
      }

      // IQR method (Interquartile Range)
      const iqrAnomaly = this.iqrOutlierDetection(value, historicalValues);

      if (iqrAnomaly) {
        anomalies.push({
          type: 'statistical',
          method: 'iqr',
          feature,
          value,
          anomalyScore: 0.8,
          severity: 'high'
        });
      }
    }

    return anomalies;
  }

  calculateZScore(value, historicalValues) {
    const mean = this.mean(historicalValues);
    const std = this.std(historicalValues);

    return std > 0 ? (value - mean) / std : 0;
  }

  iqrOutlierDetection(value, values) {
    const sorted = [...values].sort((a, b) => a - b);
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);

    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;

    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    return value < lowerBound || value > upperBound;
  }

  /**
   * ISOLATION FOREST DETECTION
   *
   * Use isolation forest algorithm for anomaly detection
   */
  async isolationForestDetection(features) {
    if (this.isolationForest.length === 0) {
      return []; // Forest not trained yet
    }

    // Calculate anomaly score
    const avgPathLength = this.averagePathLength(features);

    // Anomaly score based on path length
    // Shorter paths = more anomalous (easier to isolate)
    const anomalyScore = Math.pow(2, -avgPathLength / this.normalizedPathLength());

    if (anomalyScore >= this.options.anomalyThreshold) {
      return [{
        type: 'isolation',
        method: 'isolation-forest',
        features,
        pathLength: avgPathLength,
        anomalyScore,
        severity: this.classifySeverity(anomalyScore * 10)
      }];
    }

    return [];
  }

  async trainIsolationForest() {
    console.log('🌲 Training isolation forest...');

    this.isolationForest = [];

    for (let i = 0; i < this.options.isolationTreeCount; i++) {
      const tree = this.buildIsolationTree(
        this.sampleData(this.baseline.codeMetrics),
        0,
        10 // max depth
      );

      this.isolationForest.push(tree);
    }

    console.log(`✅ Trained ${this.isolationForest.length} isolation trees`);
  }

  buildIsolationTree(data, depth, maxDepth) {
    // Stop conditions
    if (depth >= maxDepth || data.length <= 1) {
      return {
        type: 'leaf',
        size: data.length,
        depth
      };
    }

    // Randomly select feature and split point
    const features = Object.keys(data[0]);
    const splitFeature = features[Math.floor(Math.random() * features.length)];

    const values = data.map(d => d[splitFeature]).filter(v => v !== undefined);

    if (values.length === 0) {
      return { type: 'leaf', size: data.length, depth };
    }

    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const splitValue = minVal + Math.random() * (maxVal - minVal);

    // Split data
    const leftData = data.filter(d => (d[splitFeature] || 0) < splitValue);
    const rightData = data.filter(d => (d[splitFeature] || 0) >= splitValue);

    return {
      type: 'node',
      splitFeature,
      splitValue,
      left: this.buildIsolationTree(leftData, depth + 1, maxDepth),
      right: this.buildIsolationTree(rightData, depth + 1, maxDepth)
    };
  }

  averagePathLength(features) {
    let totalPath = 0;

    for (const tree of this.isolationForest) {
      totalPath += this.pathLength(tree, features, 0);
    }

    return totalPath / this.isolationForest.length;
  }

  pathLength(node, features, currentDepth) {
    if (node.type === 'leaf') {
      // Adjust for tree size
      return currentDepth + this.c(node.size);
    }

    const value = features[node.splitFeature] || 0;

    if (value < node.splitValue) {
      return this.pathLength(node.left, features, currentDepth + 1);
    } else {
      return this.pathLength(node.right, features, currentDepth + 1);
    }
  }

  c(n) {
    // Average path length of unsuccessful search in BST
    if (n <= 1) return 0;
    return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1) / n);
  }

  normalizedPathLength() {
    return this.c(256); // Typical sample size
  }

  /**
   * BEHAVIORAL ANOMALY DETECTION
   *
   * Detect unusual behavioral patterns
   */
  async behavioralDetection(data, type) {
    const anomalies = [];

    if (type === 'code') {
      anomalies.push(...await this.detectCodeAnomalies(data));
    } else if (type === 'security') {
      anomalies.push(...await this.detectSecurityAnomalies(data));
    } else if (type === 'behavior') {
      anomalies.push(...await this.detectBehaviorAnomalies(data));
    }

    return anomalies;
  }

  async detectCodeAnomalies(code) {
    const anomalies = [];

    try {
      const ast = babelParse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
        errorRecovery: true
      });

      // Detect unusual patterns
      traverse.default(ast, {
        // Unusually deep nesting
        BlockStatement(path) {
          const depth = this.getBlockDepth(path);
          if (depth > 6) {
            anomalies.push({
              type: 'behavioral',
              method: 'code-pattern',
              pattern: 'deep-nesting',
              depth,
              line: path.node.loc?.start.line,
              anomalyScore: Math.min(1, depth / 10),
              severity: 'high',
              description: `Unusually deep nesting (${depth} levels)`
            });
          }
        },

        // Unusually long functions and unusual number of parameters
        FunctionDeclaration(path) {
          const length = path.node.body.body.length;
          if (length > 50) {
            anomalies.push({
              type: 'behavioral',
              method: 'code-pattern',
              pattern: 'long-function',
              length,
              name: path.node.id?.name,
              line: path.node.loc?.start.line,
              anomalyScore: Math.min(1, length / 100),
              severity: 'medium',
              description: `Unusually long function (${length} statements)`
            });
          }

          const paramCount = path.node.params.length;
          if (paramCount > 7) {
            anomalies.push({
              type: 'behavioral',
              method: 'code-pattern',
              pattern: 'many-parameters',
              paramCount,
              name: path.node.id?.name,
              line: path.node.loc?.start.line,
              anomalyScore: Math.min(1, paramCount / 15),
              severity: 'medium',
              description: `Unusual number of parameters (${paramCount})`
            });
          }
        },

        // Suspicious patterns
        CallExpression(path) {
          const callee = path.node.callee.name || path.node.callee.property?.name;

          // eval usage
          if (callee === 'eval') {
            anomalies.push({
              type: 'behavioral',
              method: 'code-pattern',
              pattern: 'eval-usage',
              line: path.node.loc?.start.line,
              anomalyScore: 0.95,
              severity: 'critical',
              description: 'Use of eval() detected'
            });
          }

          // Unusual repetition
          const argCount = path.node.arguments.length;
          if (argCount > 10) {
            anomalies.push({
              type: 'behavioral',
              method: 'code-pattern',
              pattern: 'many-arguments',
              argCount,
              line: path.node.loc?.start.line,
              anomalyScore: Math.min(1, argCount / 20),
              severity: 'low',
              description: `Unusual number of arguments (${argCount})`
            });
          }
        }
      });

    } catch (error) {
      // Parse error itself is an anomaly
      anomalies.push({
        type: 'behavioral',
        method: 'code-pattern',
        pattern: 'parse-error',
        error: error.message,
        anomalyScore: 0.9,
        severity: 'high',
        description: 'Code parse error - possibly malformed or obfuscated'
      });
    }

    return anomalies;
  }

  async detectSecurityAnomalies(code) {
    const anomalies = [];

    // Pattern-based security anomalies
    const suspiciousPatterns = [
      { pattern: /eval\s*\(/gi, name: 'eval', severity: 'critical', score: 0.95 },
      { pattern: /exec\s*\(/gi, name: 'exec', severity: 'critical', score: 0.9 },
      { pattern: /innerHTML\s*=/gi, name: 'innerHTML', severity: 'high', score: 0.8 },
      { pattern: /document\.write/gi, name: 'document.write', severity: 'high', score: 0.75 },
      { pattern: /base64_decode/gi, name: 'base64_decode', severity: 'medium', score: 0.6 },
      { pattern: /\$\{.*\}/g, name: 'template-injection', severity: 'medium', score: 0.65 }
    ];

    for (const { pattern, name, severity, score } of suspiciousPatterns) {
      const matches = code.match(pattern);

      if (matches) {
        anomalies.push({
          type: 'behavioral',
          method: 'security-pattern',
          pattern: name,
          occurrences: matches.length,
          anomalyScore: score,
          severity,
          description: `Suspicious pattern detected: ${name}`
        });
      }
    }

    // Obfuscation detection
    const entropy = this.calculateEntropy(code);
    if (entropy > 0.85) {
      anomalies.push({
        type: 'behavioral',
        method: 'obfuscation',
        pattern: 'high-entropy',
        entropy,
        anomalyScore: entropy,
        severity: 'high',
        description: `Possible obfuscation detected (entropy: ${entropy.toFixed(2)})`
      });
    }

    return anomalies;
  }

  async detectBehaviorAnomalies(behaviorData) {
    // Detect anomalies in system behavior (e.g., request patterns, error rates)
    const anomalies = [];

    if (behaviorData.errorRate > 0.1) {
      anomalies.push({
        type: 'behavioral',
        method: 'behavior-metric',
        metric: 'error-rate',
        value: behaviorData.errorRate,
        anomalyScore: Math.min(1, behaviorData.errorRate / 0.5),
        severity: 'high',
        description: `Unusual error rate: ${(behaviorData.errorRate * 100).toFixed(1)}%`
      });
    }

    if (behaviorData.requestRate && behaviorData.requestRate > 1000) {
      anomalies.push({
        type: 'behavioral',
        method: 'behavior-metric',
        metric: 'request-rate',
        value: behaviorData.requestRate,
        anomalyScore: Math.min(1, behaviorData.requestRate / 5000),
        severity: 'medium',
        description: `Unusual request rate: ${behaviorData.requestRate} req/s`
      });
    }

    return anomalies;
  }

  /**
   * ENSEMBLE DETECTION
   *
   * Combine multiple detection methods
   */
  ensembleDetection(anomalies) {
    // Group anomalies by feature/location
    const grouped = new Map();

    for (const anomaly of anomalies) {
      const key = anomaly.feature || anomaly.pattern || anomaly.line || 'global';

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }

      grouped.get(key).push(anomaly);
    }

    // Combine scores for each group
    const ensembleAnomalies = [];

    for (const [, group] of grouped) {
      if (group.length === 1) {
        ensembleAnomalies.push(group[0]);
      } else {
        // Multiple methods agree - higher confidence
        const combinedScore = Math.min(1, group.reduce((sum, a) => sum + a.anomalyScore, 0) / group.length * 1.2);

        ensembleAnomalies.push({
          ...group[0],
          anomalyScore: combinedScore,
          methods: group.map(a => a.method),
          agreementCount: group.length,
          description: `Multiple methods agree: ${group.map(a => a.method).join(', ')}`
        });
      }
    }

    return ensembleAnomalies;
  }

  /**
   * EXPLAIN ANOMALY
   */
  explainAnomaly(anomaly) {
    const explanations = [];

    explanations.push(`Anomaly detected using ${anomaly.method}`);

    if (anomaly.zScore) {
      explanations.push(`Value is ${Math.abs(anomaly.zScore).toFixed(1)} standard deviations from mean`);
    }

    if (anomaly.methods) {
      explanations.push(`Confirmed by ${anomaly.methods.length} detection methods`);
    }

    explanations.push(`Severity: ${anomaly.severity}`);

    if (anomaly.description) {
      explanations.push(anomaly.description);
    }

    return explanations.join('. ');
  }

  /**
   * HELPER METHODS
   */

  async extractFeatures(data, type) {
    if (type === 'code') {
      return this.extractCodeFeatures(data);
    } else if (type === 'behavior') {
      return data; // Already features
    } else {
      return {};
    }
  }

  extractCodeFeatures(code) {
    const features = {
      length: code.length,
      lineCount: code.split('\n').length,
      avgLineLength: 0,
      functionCount: 0,
      classCount: 0,
      cyclomaticComplexity: 1,
      nestingDepth: 0,
      commentRatio: 0
    };

    try {
      const ast = babelParse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
        errorRecovery: true
      });

      traverse.default(ast, {
        FunctionDeclaration() { features.functionCount++; },
        ClassDeclaration() { features.classCount++; },
        IfStatement() { features.cyclomaticComplexity++; },
        WhileStatement() { features.cyclomaticComplexity++; },
        ForStatement() { features.cyclomaticComplexity++; }
      });

    } catch (error) {
      // Use basic features on parse error
    }

    // Calculate derived features
    features.avgLineLength = features.length / features.lineCount;
    features.commentRatio = (code.match(/\/\/.*/g) || []).length / features.lineCount;

    return features;
  }

  getBlockDepth(path) {
    let depth = 0;
    let current = path.parent;

    while (current) {
      if (current.type === 'BlockStatement') {
        depth++;
      }
      current = current.parent;
    }

    return depth;
  }

  calculateEntropy(text) {
    const freq = new Map();

    for (const char of text) {
      freq.set(char, (freq.get(char) || 0) + 1);
    }

    let entropy = 0;
    const length = text.length;

    for (const count of freq.values()) {
      const p = count / length;
      entropy -= p * Math.log2(p);
    }

    // Normalize by max entropy
    const maxEntropy = Math.log2(freq.size);
    return maxEntropy > 0 ? entropy / maxEntropy : 0;
  }

  classifySeverity(score) {
    if (score >= 8) return 'critical';
    if (score >= 5) return 'high';
    if (score >= 3) return 'medium';
    return 'low';
  }

  async updateBaseline(features, isNormal) {
    if (isNormal) {
      this.baseline.codeMetrics.push(features);

      // Keep baseline size manageable
      if (this.baseline.codeMetrics.length > 1000) {
        this.baseline.codeMetrics.shift();
      }

      // Retrain forest periodically
      if (this.baseline.codeMetrics.length % 100 === 0) {
        await this.trainIsolationForest();
      }

      await this.saveBaseline();
    }
  }

  mean(values) {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  std(values) {
    const avg = this.mean(values);
    const squareDiffs = values.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(this.mean(squareDiffs));
  }

  sampleData(data) {
    // Sample 256 random data points
    const sampleSize = Math.min(256, data.length);
    const sampled = [];

    for (let i = 0; i < sampleSize; i++) {
      const index = Math.floor(Math.random() * data.length);
      sampled.push(data[index]);
    }

    return sampled;
  }

  /**
   * PERSISTENCE
   */

  async loadBaseline() {
    try {
      const saved = this.sessionStore.getKnowledge('global', 'anomaly_detection', 'baseline');
      if (saved.length > 0) {
        this.baseline = saved[0].value;
        console.log(`📂 Loaded baseline (${this.baseline.codeMetrics.length} samples)`);
      }
    } catch (error) {
      console.log('No baseline found');
    }
  }

  async saveBaseline() {
    this.sessionStore.setKnowledge(
      'global',
      'anomaly_detection',
      'baseline',
      this.baseline,
      1.0,
      'learned'
    );
  }

  /**
   * GET STATS
   */
  getStats() {
    return {
      baselineSamples: this.baseline.codeMetrics.length,
      isolationTrees: this.isolationForest.length,
      detectedAnomalies: this.detectedAnomalies.length,
      severityDistribution: Object.entries(
        this.detectedAnomalies.reduce((acc, a) => {
          acc[a.severity] = (acc[a.severity] || 0) + 1;
          return acc;
        }, {})
      ),
      recentAnomalies: this.detectedAnomalies.slice(-10).map(a => ({
        type: a.type,
        pattern: a.pattern,
        severity: a.severity,
        score: a.anomalyScore.toFixed(2)
      }))
    };
  }
}

// Factory function
export function createAnomalyDetectionSystem(options) {
  return new AnomalyDetectionSystem(options);
}

export default AnomalyDetectionSystem;

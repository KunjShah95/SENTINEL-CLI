/**
 * MLOPS PIPELINE
 *
 * Production ML pipeline for model serving, A/B testing, and monitoring
 *
 * Features:
 * - Model versioning and registry
 * - Model serving with load balancing
 * - A/B testing and traffic splitting
 * - Performance monitoring and alerting
 * - Model drift detection
 * - Automated rollback on failures
 * - Feature store integration
 * - Experiment tracking
 * - Shadow mode deployment
 *
 * Inspired by:
 * - Google's TFX (TensorFlow Extended)
 * - Uber's Michelangelo
 * - Netflix's model deployment
 * - Anthropic's Claude deployment pipeline
 */

import { getSessionStore } from '../context/sessionStore.js';
import EventEmitter from 'events';

export class MLOpsPipeline extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      modelRegistryPath: options.modelRegistryPath || 'models/registry',
      enableABTesting: options.enableABTesting !== false,
      enableShadowMode: options.enableShadowMode !== false,
      monitoringInterval: options.monitoringInterval || 60000, // 1 minute
      driftThreshold: options.driftThreshold || 0.15,
      rollbackThreshold: options.rollbackThreshold || 0.8, // rollback if performance < 80% of baseline
      ...options
    };

    this.sessionStore = null;

    // Model registry
    this.modelRegistry = new Map();

    // Active models (currently deployed)
    this.activeModels = new Map();

    // A/B test configurations
    this.abTests = new Map();

    // Performance metrics
    this.metrics = {
      requests: 0,
      latency: [],
      errors: 0,
      modelPerformance: new Map()
    };

    // Feature store
    this.featureStore = new Map();

    // Monitoring interval handle
    this.monitoringHandle = null;
  }

  async initialize() {
    this.sessionStore = getSessionStore();

    // Load model registry
    await this.loadModelRegistry();

    // Start monitoring
    this.startMonitoring();

    console.log('✅ MLOps Pipeline initialized');
    console.log(`📊 Registered models: ${this.modelRegistry.size}`);
    console.log(`🚀 Active models: ${this.activeModels.size}`);
  }

  /**
   * REGISTER MODEL
   *
   * Add model to registry with versioning
   */
  async registerModel(modelName, modelConfig, metadata = {}) {
    const version = this.getNextVersion(modelName);

    const modelEntry = {
      name: modelName,
      version,
      config: modelConfig,
      metadata: {
        ...metadata,
        registeredAt: Date.now(),
        registeredBy: metadata.user || 'system'
      },
      status: 'registered', // registered, deployed, archived
      metrics: {
        deployments: 0,
        requests: 0,
        avgLatency: 0,
        errorRate: 0
      }
    };

    const modelId = `${modelName}:v${version}`;
    this.modelRegistry.set(modelId, modelEntry);

    await this.saveModelRegistry();

    console.log(`✅ Registered model: ${modelId}`);

    this.emit('model-registered', { modelId, model: modelEntry });

    return { modelId, version };
  }

  /**
   * DEPLOY MODEL
   *
   * Deploy model to production
   */
  async deployModel(modelId, options = {}) {
    const {
      trafficSplit = 1.0, // 100% traffic
      shadowMode = false,
      canary = false,
      canaryPercentage = 0.05
    } = options;

    const model = this.modelRegistry.get(modelId);

    if (!model) {
      throw new Error(`Model ${modelId} not found in registry`);
    }

    // Deployment strategy
    if (shadowMode) {
      await this.deployShadowMode(modelId);
    } else if (canary) {
      await this.deployCanary(modelId, canaryPercentage);
    } else {
      await this.deployStandard(modelId, trafficSplit);
    }

    model.status = 'deployed';
    model.metrics.deployments++;

    await this.saveModelRegistry();

    console.log(`🚀 Deployed model: ${modelId} (traffic: ${trafficSplit * 100}%)`);

    this.emit('model-deployed', { modelId, options });

    return { success: true, modelId };
  }

  async deployStandard(modelId, trafficSplit) {
    const model = this.modelRegistry.get(modelId);

    this.activeModels.set(modelId, {
      ...model,
      trafficSplit,
      shadowMode: false,
      deployedAt: Date.now()
    });
  }

  async deployShadowMode(modelId) {
    const model = this.modelRegistry.get(modelId);

    this.activeModels.set(modelId, {
      ...model,
      trafficSplit: 0, // No real traffic
      shadowMode: true,
      deployedAt: Date.now()
    });

    console.log(`👥 Shadow mode enabled for ${modelId}`);
  }

  async deployCanary(modelId, percentage) {
    // Canary deployment: small percentage of traffic
    await this.deployStandard(modelId, percentage);

    // Schedule canary evaluation
    setTimeout(() => {
      this.evaluateCanary(modelId, percentage);
    }, 300000); // 5 minutes

    console.log(`🐤 Canary deployment: ${modelId} at ${percentage * 100}%`);
  }

  async evaluateCanary(modelId, currentPercentage) {
    const performance = await this.getModelPerformance(modelId);

    const baseline = this.getBaselinePerformance();

    // If canary performs well, gradually increase traffic
    if (performance.successRate >= baseline.successRate * 0.95) {
      const newPercentage = Math.min(1.0, currentPercentage * 2);

      await this.updateTrafficSplit(modelId, newPercentage);

      if (newPercentage < 1.0) {
        // Continue canary rollout
        setTimeout(() => {
          this.evaluateCanary(modelId, newPercentage);
        }, 300000);
      } else {
        console.log(`✅ Canary promoted to full deployment: ${modelId}`);
        this.emit('canary-promoted', { modelId });
      }
    } else {
      // Canary failed, rollback
      console.warn(`⚠️ Canary failed, rolling back: ${modelId}`);
      await this.rollbackModel(modelId);
    }
  }

  /**
   * A/B TESTING
   */
  async createABTest(testName, modelA, modelB, options = {}) {
    const {
      splitRatio = 0.5, // 50/50 split
      duration = 7 * 24 * 60 * 60 * 1000, // 7 days
      metrics = ['accuracy', 'latency', 'errorRate']
    } = options;

    const abTest = {
      name: testName,
      models: {
        A: modelA,
        B: modelB
      },
      splitRatio,
      startTime: Date.now(),
      endTime: Date.now() + duration,
      metrics,
      results: {
        A: { requests: 0, successes: 0, latencies: [], errors: 0 },
        B: { requests: 0, successes: 0, latencies: [], errors: 0 }
      },
      status: 'running'
    };

    this.abTests.set(testName, abTest);

    // Deploy both models
    await this.deployStandard(modelA, splitRatio);
    await this.deployStandard(modelB, 1 - splitRatio);

    // Schedule test evaluation
    setTimeout(() => {
      this.evaluateABTest(testName);
    }, duration);

    console.log(`🔬 A/B test started: ${testName} (${modelA} vs ${modelB})`);

    this.emit('ab-test-started', { testName, abTest });

    return abTest;
  }

  async evaluateABTest(testName) {
    const test = this.abTests.get(testName);

    if (!test) {
      return;
    }

    test.status = 'completed';

    // Calculate metrics
    const resultA = this.calculateABMetrics(test.results.A);
    const resultB = this.calculateABMetrics(test.results.B);

    // Determine winner
    const winner = this.determineABWinner(resultA, resultB, test.metrics);

    test.winner = winner;
    test.resultA = resultA;
    test.resultB = resultB;

    console.log(`✅ A/B test completed: ${testName}`);
    console.log(`🏆 Winner: Model ${winner}`);
    console.log(`📊 Model A: ${JSON.stringify(resultA)}`);
    console.log(`📊 Model B: ${JSON.stringify(resultB)}`);

    this.emit('ab-test-completed', { testName, test, winner });

    return { winner, resultA, resultB };
  }

  calculateABMetrics(results) {
    const successRate = results.requests > 0
      ? results.successes / results.requests
      : 0;

    const avgLatency = results.latencies.length > 0
      ? results.latencies.reduce((a, b) => a + b, 0) / results.latencies.length
      : 0;

    const errorRate = results.requests > 0
      ? results.errors / results.requests
      : 0;

    return { successRate, avgLatency, errorRate };
  }

  determineABWinner(resultA, resultB, metrics) {
    let scoreA = 0;
    let scoreB = 0;

    if (metrics.includes('accuracy')) {
      if (resultA.successRate > resultB.successRate) scoreA++;
      else if (resultB.successRate > resultA.successRate) scoreB++;
    }

    if (metrics.includes('latency')) {
      if (resultA.avgLatency < resultB.avgLatency) scoreA++;
      else if (resultB.avgLatency < resultA.avgLatency) scoreB++;
    }

    if (metrics.includes('errorRate')) {
      if (resultA.errorRate < resultB.errorRate) scoreA++;
      else if (resultB.errorRate < resultA.errorRate) scoreB++;
    }

    return scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : 'tie';
  }

  /**
   * MODEL INFERENCE
   *
   * Serve prediction request
   */
  async predict(input, options = {}) {
    const {
      modelId = null,
      abTestName = null
    } = options;

    const startTime = Date.now();
    this.metrics.requests++;

    try {
      // Select model (A/B test, specific model, or default)
      const selectedModel = this.selectModel(modelId, abTestName);

      if (!selectedModel) {
        throw new Error('No model available for prediction');
      }

      // Make prediction
      const prediction = await this.runModelInference(selectedModel, input);

      // Record metrics
      const latency = Date.now() - startTime;
      this.metrics.latency.push(latency);

      this.recordModelMetrics(selectedModel.modelId, {
        success: true,
        latency
      });

      // Record A/B test metrics
      if (abTestName) {
        this.recordABTestMetrics(abTestName, selectedModel.variant, {
          success: true,
          latency
        });
      }

      return {
        prediction,
        modelId: selectedModel.modelId,
        latency
      };

    } catch (error) {
      this.metrics.errors++;

      console.error('Prediction error:', error.message);

      this.emit('prediction-error', { error, input });

      throw error;
    }
  }

  selectModel(modelId, abTestName) {
    // If specific model requested
    if (modelId && this.activeModels.has(modelId)) {
      return {
        modelId,
        ...this.activeModels.get(modelId)
      };
    }

    // If A/B test active
    if (abTestName && this.abTests.has(abTestName)) {
      const test = this.abTests.get(abTestName);

      const variant = Math.random() < test.splitRatio ? 'A' : 'B';
      const selectedModelId = test.models[variant];

      return {
        modelId: selectedModelId,
        variant,
        ...this.activeModels.get(selectedModelId)
      };
    }

    // Default: select model with highest traffic split
    let bestModel = null;
    let maxTraffic = 0;

    for (const [id, model] of this.activeModels) {
      if (!model.shadowMode && model.trafficSplit > maxTraffic) {
        maxTraffic = model.trafficSplit;
        bestModel = { modelId: id, ...model };
      }
    }

    return bestModel;
  }

  async runModelInference(model, _input) {
    // Simplified model inference
    // In production, would call actual model server

    // Simulate inference based on model config
    const latency = 50 + Math.random() * 100; // 50-150ms
    await this.sleep(latency);

    // Return mock prediction
    return {
      result: 'prediction_result',
      confidence: 0.85 + Math.random() * 0.15,
      modelVersion: model.version
    };
  }

  /**
   * MONITORING
   */
  startMonitoring() {
    this.monitoringHandle = setInterval(async () => {
      await this.collectMetrics();
      await this.detectDrift();
      await this.checkHealth();
    }, this.options.monitoringInterval);

    console.log('📡 Monitoring started');
  }

  stopMonitoring() {
    if (this.monitoringHandle) {
      clearInterval(this.monitoringHandle);
      this.monitoringHandle = null;
      console.log('📡 Monitoring stopped');
    }
  }

  async collectMetrics() {
    // Calculate aggregate metrics
    const avgLatency = this.metrics.latency.length > 0
      ? this.metrics.latency.reduce((a, b) => a + b, 0) / this.metrics.latency.length
      : 0;

    const errorRate = this.metrics.requests > 0
      ? this.metrics.errors / this.metrics.requests
      : 0;

    const throughput = this.metrics.requests / (this.options.monitoringInterval / 1000);

    // Emit metrics
    this.emit('metrics-collected', {
      timestamp: Date.now(),
      requests: this.metrics.requests,
      avgLatency,
      errorRate,
      throughput
    });

    // Reset counters
    this.metrics.latency = [];
  }

  async detectDrift() {
    // Model drift detection
    for (const [modelId] of this.activeModels) {
      const currentPerformance = await this.getModelPerformance(modelId);
      const baseline = this.getBaselinePerformance();

      const drift = Math.abs(currentPerformance.successRate - baseline.successRate);

      if (drift > this.options.driftThreshold) {
        console.warn(`⚠️  Model drift detected: ${modelId} (drift: ${(drift * 100).toFixed(1)}%)`);

        this.emit('model-drift', { modelId, drift, currentPerformance, baseline });

        // Consider automatic retraining or alerting
      }
    }
  }

  async checkHealth() {
    // Health check for active models
    for (const [modelId] of this.activeModels) {
      const performance = await this.getModelPerformance(modelId);
      const baseline = this.getBaselinePerformance();

      // Check if performance dropped below threshold
      if (performance.successRate < baseline.successRate * this.options.rollbackThreshold) {
        console.warn(`⚠️  Model performance degraded: ${modelId}`);

        this.emit('model-unhealthy', { modelId, performance, baseline });

        // Automatic rollback
        await this.rollbackModel(modelId);
      }
    }
  }

  /**
   * ROLLBACK
   */
  async rollbackModel(modelId) {
    console.log(`🔄 Rolling back model: ${modelId}`);

    // Remove from active models
    this.activeModels.delete(modelId);

    // Update registry
    const model = this.modelRegistry.get(modelId);
    if (model) {
      model.status = 'archived';
    }

    await this.saveModelRegistry();

    this.emit('model-rolled-back', { modelId });

    // Activate previous version
    const [modelName] = modelId.split(':');
    const previousVersion = await this.getPreviousVersion(modelName);

    if (previousVersion) {
      await this.deployStandard(previousVersion, 1.0);
      console.log(`✅ Rolled back to: ${previousVersion}`);
    }
  }

  /**
   * FEATURE STORE
   */
  registerFeature(featureName, featureConfig) {
    this.featureStore.set(featureName, {
      name: featureName,
      config: featureConfig,
      registeredAt: Date.now()
    });

    console.log(`✅ Registered feature: ${featureName}`);
  }

  async getFeatures(featureNames, entityId) {
    const features = {};

    for (const name of featureNames) {
      const featureConfig = this.featureStore.get(name);

      if (featureConfig) {
        // Compute or retrieve feature value
        features[name] = await this.computeFeature(featureConfig, entityId);
      }
    }

    return features;
  }

  async computeFeature(_featureConfig, _entityId) {
    // Simplified feature computation
    // In production, would query feature store or compute on-the-fly

    return Math.random(); // Mock feature value
  }

  /**
   * HELPER METHODS
   */

  getNextVersion(modelName) {
    let maxVersion = 0;

    for (const [id] of this.modelRegistry) {
      if (id.startsWith(`${modelName}:v`)) {
        const version = parseInt(id.split(':v')[1]);
        if (version > maxVersion) {
          maxVersion = version;
        }
      }
    }

    return maxVersion + 1;
  }

  async getPreviousVersion(modelName) {
    const versions = [];

    for (const [id, model] of this.modelRegistry) {
      if (id.startsWith(`${modelName}:v`) && model.status === 'deployed') {
        versions.push({ id, version: model.version, deployedAt: model.metadata.registeredAt });
      }
    }

    if (versions.length === 0) return null;

    // Sort by version descending
    versions.sort((a, b) => b.version - a.version);

    return versions[1]?.id; // Second most recent
  }

  async updateTrafficSplit(modelId, newSplit) {
    const model = this.activeModels.get(modelId);

    if (model) {
      model.trafficSplit = newSplit;
      console.log(`📊 Updated traffic split for ${modelId}: ${newSplit * 100}%`);
    }
  }

  recordModelMetrics(modelId, metrics) {
    if (!this.metrics.modelPerformance.has(modelId)) {
      this.metrics.modelPerformance.set(modelId, {
        requests: 0,
        successes: 0,
        latencies: [],
        errors: 0
      });
    }

    const modelMetrics = this.metrics.modelPerformance.get(modelId);
    modelMetrics.requests++;

    if (metrics.success) {
      modelMetrics.successes++;
    } else {
      modelMetrics.errors++;
    }

    modelMetrics.latencies.push(metrics.latency);
  }

  recordABTestMetrics(testName, variant, metrics) {
    const test = this.abTests.get(testName);

    if (!test) return;

    const results = test.results[variant];
    results.requests++;

    if (metrics.success) {
      results.successes++;
    } else {
      results.errors++;
    }

    results.latencies.push(metrics.latency);
  }

  async getModelPerformance(modelId) {
    const metrics = this.metrics.modelPerformance.get(modelId);

    if (!metrics) {
      return { successRate: 0, avgLatency: 0, errorRate: 0 };
    }

    return {
      successRate: metrics.requests > 0 ? metrics.successes / metrics.requests : 0,
      avgLatency: metrics.latencies.length > 0
        ? metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length
        : 0,
      errorRate: metrics.requests > 0 ? metrics.errors / metrics.requests : 0
    };
  }

  getBaselinePerformance() {
    // Return baseline performance (from historical data)
    // In production, would load from database

    return {
      successRate: 0.95,
      avgLatency: 100,
      errorRate: 0.05
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * PERSISTENCE
   */

  async loadModelRegistry() {
    try {
      const saved = this.sessionStore.getKnowledge('global', 'mlops', 'model_registry');
      if (saved.length > 0) {
        const data = saved[0].value;
        this.modelRegistry = new Map(data);
        console.log(`📂 Loaded ${this.modelRegistry.size} models from registry`);
      }
    } catch (error) {
      console.log('No model registry found');
    }
  }

  async saveModelRegistry() {
    this.sessionStore.setKnowledge(
      'global',
      'mlops',
      'model_registry',
      Array.from(this.modelRegistry.entries()),
      1.0,
      'learned'
    );
  }

  /**
   * GET STATS
   */
  getStats() {
    return {
      registeredModels: this.modelRegistry.size,
      activeModels: this.activeModels.size,
      abTests: this.abTests.size,
      totalRequests: this.metrics.requests,
      totalErrors: this.metrics.errors,
      errorRate: this.metrics.requests > 0 ? this.metrics.errors / this.metrics.requests : 0,
      activeABTests: Array.from(this.abTests.values()).filter(t => t.status === 'running').length
    };
  }

  /**
   * CLEANUP
   */
  async shutdown() {
    this.stopMonitoring();
    await this.saveModelRegistry();
    console.log('👋 MLOps Pipeline shut down');
  }
}

// Factory function
export function createMLOpsPipeline(options) {
  return new MLOpsPipeline(options);
}

export default MLOpsPipeline;

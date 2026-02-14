/**
 * MLOPS PIPELINE
 * 
 * Inspired by Andrew Ng's MLOps principles and DeepMind's production ML systems.
 * Provides model lifecycle management, versioning, and deployment capabilities.
 * 
 * Key Features:
 * - Model registry
 * - Version control
 * - A/B testing
 * - Rollback capabilities
 * - Model serving
 * - Performance monitoring
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';

/**
 * Model statuses
 */
export const ModelStatus = {
  REGISTERED: 'registered',
  TRAINING: 'training',
  VALIDATING: 'validating',
  DEPLOYED: 'deployed',
  ARCHIVED: 'archived',
  FAILED: 'failed'
};

/**
 * Deployment types
 */
export const DeploymentType = {
  CANARY: 'canary',
  BLUE_GREEN: 'blue_green',
  ROLLING: 'rolling',
  SHADOW: 'shadow'
};

export class MLOpsPipeline extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      modelDir: options.modelDir || './models',
      registryName: options.registryName || 'sentinel-models',
      maxVersions: options.maxVersions || 10,
      autoArchive: options.autoArchive ?? true,
      enableABTesting: options.enableABTesting ?? true,
      ...options
    };

    // Model registry
    this.registry = new Map();
    
    // Deployment status
    this.deployments = new Map();
    
    // A/B tests
    this.abTests = new Map();
    
    // Current active model
    this.activeModel = null;
    
    // Metrics
    this.metrics = {
      totalModels: 0,
      deployedModels: 0,
      failedDeployments: 0,
      rollbacks: 0
    };
    
    // Ensure model directory exists
    this._ensureModelDirectory();
  }

  /**
   * Ensure model directory exists
   */
  _ensureModelDirectory() {
    if (!fs.existsSync(this.options.modelDir)) {
      fs.mkdirSync(this.options.modelDir, { recursive: true });
    }
  }

  /**
   * Register a new model
   */
  async registerModel(modelConfig) {
    const modelId = `model-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    
    const model = {
      id: modelId,
      name: modelConfig.name,
      version: modelConfig.version || '1.0.0',
      status: ModelStatus.REGISTERED,
      metadata: modelConfig.metadata || {},
      metrics: modelConfig.metrics || {},
      artifacts: modelConfig.artifacts || {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: modelConfig.createdBy || 'system',
      description: modelConfig.description || '',
      tags: modelConfig.tags || [],
      parentModelId: modelConfig.parentModelId || null,
      experimentId: modelConfig.experimentId || null
    };

    // Save model to registry
    this.registry.set(modelId, model);
    
    // Save model file
    await this._saveModelFile(model);
    
    // Update metrics
    this.metrics.totalModels++;
    
    this.emit('model:registered', model);
    
    return model;
  }

  /**
   * Save model to file
   */
  async _saveModelFile(model) {
    const modelPath = path.join(
      this.options.modelDir, 
      `${model.name}-${model.version}.json`
    );
    
    fs.writeFileSync(modelPath, JSON.stringify(model, null, 2));
  }

  /**
   * Get model by ID
   */
  getModel(modelId) {
    return this.registry.get(modelId);
  }

  /**
   * Get model by name and version
   */
  getModelByName(name, version = null) {
    for (const model of this.registry.values()) {
      if (model.name === name) {
        if (!version || model.version === version) {
          return model;
        }
      }
    }
    return null;
  }

  /**
   * Get all models
   */
  getAllModels() {
    return Array.from(this.registry.values());
  }

  /**
   * Get models by name
   */
  getModelsByName(name) {
    return Array.from(this.registry.values())
      .filter(m => m.name === name)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Update model status
   */
  async updateModelStatus(modelId, status, metadata = {}) {
    const model = this.registry.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    model.status = status;
    model.updatedAt = Date.now();
    model.metadata = { ...model.metadata, ...metadata };
    
    await this._saveModelFile(model);
    
    this.emit('model:status_updated', { modelId, status });
    
    return model;
  }

  /**
   * Update model metrics
   */
  async updateModelMetrics(modelId, metrics) {
    const model = this.registry.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    model.metrics = { ...model.metrics, ...metrics };
    model.updatedAt = Date.now();
    
    await this._saveModelFile(model);
    
    this.emit('model:metrics_updated', { modelId, metrics });
    
    return model;
  }

  /**
   * Deploy model
   */
  async deployModel(modelId, deploymentConfig = {}) {
    const model = this.registry.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    const deployment = {
      id: `deploy-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      modelId,
      type: deploymentConfig.type || DeploymentType.CANARY,
      status: 'deploying',
      trafficSplit: deploymentConfig.trafficSplit || 100,
      config: deploymentConfig,
      startedAt: Date.now(),
      completedAt: null,
      rollbackHistory: []
    };

    // Update model status
    await this.updateModelStatus(modelId, ModelStatus.DEPLOYED);
    
    // Save deployment
    this.deployments.set(deployment.id, deployment);
    
    // Set as active model
    this.activeModel = model;
    this.metrics.deployedModels++;
    
    deployment.status = 'deployed';
    deployment.completedAt = Date.now();
    
    this.emit('model:deployed', { model, deployment });
    
    // Auto-archive old versions if enabled
    if (this.options.autoArchive) {
      await this._autoArchiveOldVersions(model.name);
    }
    
    return { model, deployment };
  }

  /**
   * Auto-archive old model versions
   */
  async _autoArchiveOldVersions(modelName) {
    const models = this.getModelsByName(modelName);
    
    if (models.length > this.options.maxVersions) {
      const toArchive = models.slice(this.options.maxVersions);
      
      for (const model of toArchive) {
        if (model.status !== ModelStatus.ARCHIVED) {
          await this.updateModelStatus(model.id, ModelStatus.ARCHIVED);
        }
      }
    }
  }

  /**
   * Rollback deployment
   */
  async rollback(deploymentId, reason = '') {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    const model = this.registry.get(deployment.modelId);
    if (!model) {
      throw new Error('Model not found for deployment');
    }

    // Find previous stable version
    const previousModels = this.getModelsByName(model.name)
      .filter(m => m.id !== model.id && m.status === ModelStatus.DEPLOYED);
    
    if (previousModels.length === 0) {
      throw new Error('No previous version available for rollback');
    }

    const previousModel = previousModels[0];
    
    // Archive current
    await this.updateModelStatus(model.id, ModelStatus.ARCHIVED);
    
    // Deploy previous
    const newDeployment = await this.deployModel(previousModel.id);
    
    // Record rollback
    deployment.rollbackHistory.push({
      timestamp: Date.now(),
      toModelId: previousModel.id,
      reason
    });
    
    this.metrics.rollbacks++;
    
    this.emit('deployment:rolled_back', {
      from: model,
      to: previousModel,
      reason
    });
    
    return {
      rolledBack: model,
      rolledTo: previousModel,
      deployment: newDeployment.deployment
    };
  }

  /**
   * Start A/B test
   */
  async startABTest(config) {
    if (!this.options.enableABTesting) {
      throw new Error('A/B testing is not enabled');
    }

    const { modelAId, modelBId, trafficSplit = 50, metrics = [] } = config;
    
    const modelA = this.registry.get(modelAId);
    const modelB = this.registry.get(modelBId);
    
    if (!modelA || !modelB) {
      throw new Error('One or both models not found');
    }

    const test = {
      id: `abtest-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      modelAId,
      modelBId,
      modelA,
      modelB,
      trafficSplit: { a: trafficSplit, b: 100 - trafficSplit },
      metrics,
      status: 'running',
      startedAt: Date.now(),
      completedAt: null,
      results: {
        a: { requests: 0, conversions: 0 },
        b: { requests: 0, conversions: 0 }
      }
    };

    this.abTests.set(test.id, test);
    
    this.emit('abtest:started', test);
    
    return test;
  }

  /**
   * Record A/B test metric
   */
  async recordABTestMetric(testId, variant, metric) {
    const test = this.abTests.get(testId);
    if (!test) {
      throw new Error(`A/B test ${testId} not found`);
    }

    const variantKey = variant === 'a' ? 'a' : 'b';
    test.results[variantKey].requests++;
    
    if (metric.conversion) {
      test.results[variantKey].conversions++;
    }
    
    this.emit('abtest:metric_recorded', { testId, variant, metric });
  }

  /**
   * Complete A/B test
   */
  async completeABTest(testId, winner = null) {
    const test = this.abTests.get(testId);
    if (!test) {
      throw new Error(`A/B test ${testId} not found`);
    }

    test.status = 'completed';
    test.completedAt = Date.now();
    test.winner = winner;
    
    // Calculate results
    const aConversionRate = test.results.a.requests > 0 
      ? test.results.a.conversions / test.results.a.requests 
      : 0;
    const bConversionRate = test.results.b.requests > 0 
      ? test.results.b.conversions / test.results.b.requests 
      : 0;
    
    test.results.comparison = {
      a: { conversionRate: aConversionRate, requests: test.results.a.requests },
      b: { conversionRate: bConversionRate, requests: test.results.b.requests },
      winner: aConversionRate > bConversionRate ? 'a' : 'b'
    };
    
    // Deploy winner if specified
    if (winner) {
      const winningModelId = winner === 'a' ? test.modelAId : test.modelBId;
      await this.deployModel(winningModelId);
    }
    
    this.emit('abtest:completed', test);
    
    return test;
  }

  /**
   * Get A/B test results
   */
  getABTestResults(testId) {
    const test = this.abTests.get(testId);
    if (!test) {
      return null;
    }
    
    return {
      ...test.results,
      status: test.status,
      winner: test.winner,
      duration: test.completedAt 
        ? test.completedAt - test.startedAt 
        : Date.now() - test.startedAt
    };
  }

  /**
   * Get active model
   */
  getActiveModel() {
    return this.activeModel;
  }

  /**
   * Get deployment history
   */
  getDeploymentHistory(modelId = null) {
    const deployments = Array.from(this.deployments.values());
    
    if (modelId) {
      return deployments.filter(d => d.modelId === modelId);
    }
    
    return deployments;
  }

  /**
   * Get model performance comparison
   */
  compareModels(modelIds) {
    const models = modelIds.map(id => this.registry.get(id)).filter(Boolean);
    
    if (models.length < 2) {
      return null;
    }

    const comparison = {
      models: models.map(m => ({
        id: m.id,
        name: m.name,
        version: m.version,
        metrics: m.metrics,
        createdAt: m.createdAt
      })),
      comparisonAt: Date.now()
    };
    
    return comparison;
  }

  /**
   * Export registry
   */
  exportRegistry() {
    return {
      models: Array.from(this.registry.values()),
      deployments: Array.from(this.deployments.values()),
      abTests: Array.from(this.abTests.values()),
      exportedAt: Date.now()
    };
  }

  /**
   * Import registry
   */
  async importRegistry(data) {
    if (data.models) {
      for (const model of data.models) {
        this.registry.set(model.id, model);
      }
    }
    
    if (data.deployments) {
      for (const deployment of data.deployments) {
        this.deployments.set(deployment.id, deployment);
      }
    }
    
    if (data.abTests) {
      for (const test of data.abTests) {
        this.abTests.set(test.id, test);
      }
    }
    
    this.emit('registry:imported');
  }

  /**
   * Get statistics
   */
  getStatistics() {
    const models = Array.from(this.registry.values());
    
    return {
      totalModels: models.length,
      deployedModels: models.filter(m => m.status === ModelStatus.DEPLOYED).length,
      archivedModels: models.filter(m => m.status === ModelStatus.ARCHIVED).length,
      activeDeployments: Array.from(this.deployments.values())
        .filter(d => d.status === 'deployed').length,
      activeABTests: Array.from(this.abTests.values())
        .filter(t => t.status === 'running').length,
      rollbacks: this.metrics.rollbacks
    };
  }

  /**
   * Archive model
   */
  async archiveModel(modelId) {
    return this.updateModelStatus(modelId, ModelStatus.ARCHIVED);
  }

  /**
   * Delete model
   */
  async deleteModel(modelId) {
    const model = this.registry.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    // Don't delete deployed models
    if (model.status === ModelStatus.DEPLOYED) {
      throw new Error('Cannot delete deployed model. Archive it first.');
    }

    // Delete file
    const modelPath = path.join(
      this.options.modelDir, 
      `${model.name}-${model.version}.json`
    );
    
    if (fs.existsSync(modelPath)) {
      fs.unlinkSync(modelPath);
    }

    // Remove from registry
    this.registry.delete(modelId);
    this.metrics.totalModels--;
    
    this.emit('model:deleted', { modelId });
  }
}

/**
 * Factory function
 */
export function createMLOpsPipeline(options) {
  return new MLOpsPipeline(options);
}

export default MLOpsPipeline;

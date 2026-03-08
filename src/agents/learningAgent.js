import { promises as fs } from 'fs';
import path from 'path';

/**
 * Agent Learning System
 * Tracks agent performance and improves over time based on feedback
 */
export class AgentLearningSystem {
  constructor(options = {}) {
    this.storagePath = options.storagePath || path.join(process.cwd(), '.sentinel', 'agent-learning.json');
    this.data = {
      agentPerformance: {},
      taskHistory: [],
      successPatterns: {},
      errorPatterns: {},
      recommendations: {}
    };
  }

  /**
   * Initialize the learning system
   */
  async init() {
    try {
      const dir = path.dirname(this.storagePath);
      await fs.mkdir(dir, { recursive: true });
      
      try {
        const content = await fs.readFile(this.storagePath, 'utf-8');
        this.data = { ...this.data, ...JSON.parse(content) };
      } catch {
        // Start fresh
      }
    } catch (error) {
      console.warn('Failed to initialize learning system:', error.message);
    }
  }

  /**
   * Save data to storage
   */
  async save() {
    try {
      await fs.writeFile(this.storagePath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.warn('Failed to save learning data:', error.message);
    }
  }

  /**
   * Record an agent task execution
   */
  async recordTask(agentType, task, result) {
    const taskRecord = {
      id: Date.now().toString(),
      agentType,
      task: task.type || 'unknown',
      success: result.success || false,
      timestamp: new Date().toISOString(),
      duration: result.duration || 0,
      error: result.error || null,
      context: {
        language: task.language,
        framework: task.framework,
        fileCount: task.fileCount
      }
    };

    this.data.taskHistory.push(taskRecord);

    // Keep only last 1000 tasks
    if (this.data.taskHistory.length > 1000) {
      this.data.taskHistory = this.data.taskHistory.slice(-1000);
    }

    // Update agent performance
    if (!this.data.agentPerformance[agentType]) {
      this.data.agentPerformance[agentType] = {
        totalTasks: 0,
        successfulTasks: 0,
        failedTasks: 0,
        avgDuration: 0,
        successRate: 0
      };
    }

    const perf = this.data.agentPerformance[agentType];
    perf.totalTasks++;
    
    if (result.success) {
      perf.successfulTasks++;
    } else {
      perf.failedTasks++;
    }

    perf.successRate = perf.successfulTasks / perf.totalTasks;
    perf.avgDuration = ((perf.avgDuration * (perf.totalTasks - 1)) + (result.duration || 0)) / perf.totalTasks;

    // Record success/error patterns
    if (result.success) {
      this.recordSuccessPattern(agentType, task);
    } else {
      this.recordErrorPattern(agentType, task, result.error);
    }

    await this.save();
    return taskRecord;
  }

  /**
   * Record successful task patterns
   */
  recordSuccessPattern(agentType, task) {
    const key = this.getPatternKey(task);
    
    if (!this.data.successPatterns[agentType]) {
      this.data.successPatterns[agentType] = {};
    }
    
    if (!this.data.successPatterns[agentType][key]) {
      this.data.successPatterns[agentType][key] = {
        count: 0,
        examples: []
      };
    }

    const pattern = this.data.successPatterns[agentType][key];
    pattern.count++;
    
    if (pattern.examples.length < 5) {
      pattern.examples.push({
        task: task.type,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Record error patterns
   */
  recordErrorPattern(agentType, task, error) {
    const key = this.getPatternKey(task);
    const errorType = this.categorizeError(error);
    
    if (!this.data.errorPatterns[agentType]) {
      this.data.errorPatterns[agentType] = {};
    }
    
    if (!this.data.errorPatterns[agentType][errorType]) {
      this.data.errorPatterns[agentType][errorType] = {
        count: 0,
        tasks: [],
        lastError: null
      };
    }

    const pattern = this.data.errorPatterns[agentType][errorType];
    pattern.count++;
    pattern.lastError = error;
    
    if (pattern.tasks.length < 10) {
      pattern.tasks.push({
        task: task.type,
        key,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get pattern key from task
   */
  getPatternKey(task) {
    return [
      task.language || 'unknown',
      task.framework || 'none',
      task.type || 'general'
    ].join(':');
  }

  /**
   * Categorize error
   */
  categorizeError(error) {
    if (!error) return 'unknown';
    
    const errorStr = String(error).toLowerCase();
    
    if (errorStr.includes('timeout')) return 'timeout';
    if (errorStr.includes('parse') || errorStr.includes('syntax')) return 'parsing';
    if (errorStr.includes('network') || errorStr.includes('fetch')) return 'network';
    if (errorStr.includes('auth') || errorStr.includes('permission')) return 'auth';
    if (errorStr.includes('memory')) return 'memory';
    if (errorStr.includes('not found') || errorStr.includes('enoent')) return 'not_found';
    
    return 'other';
  }

  /**
   * Get best agent for task
   */
  getBestAgent(task) {
    const candidates = ['scanner', 'fixer', 'validator', 'security', 'universal'];
    let bestAgent = 'universal';
    let bestScore = 0;

    for (const agent of candidates) {
      const perf = this.data.agentPerformance[agent];
      if (perf && perf.successRate > bestScore) {
        bestScore = perf.successRate;
        bestAgent = agent;
      }
    }

    // Adjust based on task type
    if (task.type === 'fix') {
      if (this.data.agentPerformance['fixer']?.successRate > 0.7) {
        bestAgent = 'fixer';
      }
    } else if (task.type === 'analyze') {
      if (this.data.agentPerformance['scanner']?.successRate > 0.7) {
        bestAgent = 'scanner';
      }
    }

    return {
      agent: bestAgent,
      confidence: bestScore,
      reason: `Based on historical success rate of ${(bestScore * 100).toFixed(1)}%`
    };
  }

  /**
   * Get recommendations for improving performance
   */
  getRecommendations() {
    const recommendations = [];

    // Analyze error patterns
    for (const [agent, patterns] of Object.entries(this.data.errorPatterns)) {
      for (const [errorType, data] of Object.entries(patterns)) {
        if (data.count >= 3) {
          recommendations.push({
            agent,
            errorType,
            count: data.count,
            priority: data.count > 5 ? 'high' : 'medium',
            message: `${agent} has ${data.count} ${errorType} errors`,
            suggestion: this.getErrorSuggestion(errorType)
          });
        }
      }
    }

    // Analyze agent performance
    for (const [agent, perf] of Object.entries(this.data.agentPerformance)) {
      if (perf.successRate < 0.5 && perf.totalTasks > 5) {
        recommendations.push({
          agent,
          priority: 'high',
          message: `${agent} has low success rate: ${(perf.successRate * 100).toFixed(1)}%`,
          suggestion: `Consider improving ${agent} agent or using alternative approach`
        });
      }
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Get suggestion for error type
   */
  getErrorSuggestion(errorType) {
    const suggestions = {
      timeout: 'Increase timeout or optimize processing',
      parsing: 'Check input format or use different parser',
      network: 'Check API availability or add retry logic',
      auth: 'Verify credentials and permissions',
      memory: 'Process in smaller batches',
      not_found: 'Verify file paths and resource availability',
      other: 'Review error details and handle appropriately'
    };
    
    return suggestions[errorType] || suggestions.other;
  }

  /**
   * Get performance stats
   */
  getStats() {
    const totalTasks = Object.values(this.data.agentPerformance)
      .reduce((sum, p) => sum + p.totalTasks, 0);
    
    const successfulTasks = Object.values(this.data.agentPerformance)
      .reduce((sum, p) => sum + p.successfulTasks, 0);

    return {
      totalTasks,
      successfulTasks,
      overallSuccessRate: totalTasks > 0 ? successfulTasks / totalTasks : 0,
      agents: Object.entries(this.data.agentPerformance).map(([name, perf]) => ({
        name,
        ...perf
      })),
      recentTasks: this.data.taskHistory.slice(-10).reverse()
    };
  }

  /**
   * Clear learning data
   */
  async clearData() {
    this.data = {
      agentPerformance: {},
      taskHistory: [],
      successPatterns: {},
      errorPatterns: {},
      recommendations: {}
    };
    
    await this.save();
    return { success: true };
  }

  /**
   * Export learning data
   */
  async export() {
    return JSON.stringify(this.data, null, 2);
  }

  /**
   * Import learning data
   */
  async import(dataStr) {
    try {
      const imported = JSON.parse(dataStr);
      this.data = { ...this.data, ...imported };
      await this.save();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

export default AgentLearningSystem;

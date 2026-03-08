/**
 * Agent Learning System - Feedback-driven agent improvement
 *
 * Tracks agent performance, collects feedback, and improves selection over time
 * Uses ELO rating system for agent performance
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class AgentLearningSystem {
  constructor(options = {}) {
    this.storePath = options.storePath || path.join(__dirname, '..', '..', '.sentinel');
    this.dataFile = path.join(this.storePath, 'agent-learning.json');
    this.agentStats = new Map();
    this.performanceHistory = [];
    this.feedbackQueue = [];

    // ELO rating system
    this.baseRating = 1200;
    this.kFactor = 32;

    this.loadStats();
  }

  /**
   * Load agent statistics from disk
   */
  loadStats() {
    if (fs.existsSync(this.dataFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
        this.agentStats = new Map(data.agents || []);
        this.performanceHistory = data.history || [];
      } catch (error) {
        console.warn('Failed to load agent stats:', error.message);
        this.agentStats = new Map();
        this.performanceHistory = [];
      }
    }
  }

  /**
   * Save agent statistics to disk
   */
  saveStats() {
    try {
      const data = {
        agents: Array.from(this.agentStats.entries()),
        history: this.performanceHistory,
        lastUpdated: Date.now()
      };

      if (!fs.existsSync(this.storePath)) {
        fs.mkdirSync(this.storePath, { recursive: true });
      }

      fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('Failed to save agent stats:', error.message);
    }
  }

  /**
   * Record agent execution result
   */
  recordExecution(agentName, task, result) {
    const execution = {
      timestamp: Date.now(),
      agent: agentName,
      task,
      success: result.success,
      duration: result.duration || 0,
      quality: this.evaluateQuality(result),
      feedback: null
    };

    this.performanceHistory.push(execution);

    if (!this.agentStats.has(agentName)) {
      this.agentStats.set(agentName, {
        name: agentName,
        rating: this.baseRating,
        executions: 0,
        successes: 0,
        failures: 0,
        avgDuration: 0,
        avgQuality: 0,
        lastUsed: null
      });
    }

    const stats = this.agentStats.get(agentName);
    stats.executions++;
    stats.lastUsed = Date.now();

    if (result.success) {
      stats.successes++;
    } else {
      stats.failures++;
    }

    stats.avgDuration = (stats.avgDuration * (stats.executions - 1) + execution.duration) / stats.executions;
    stats.avgQuality = (stats.avgQuality * (stats.executions - 1) + execution.quality) / stats.executions;

    this.saveStats();
    return execution;
  }

  /**
   * Record feedback for an execution
   */
  recordFeedback(executionId, rating, notes = '') {
    const execution = this.performanceHistory.find(e => e.timestamp === executionId);
    if (!execution) return null;

    execution.feedback = {
      rating, // 1-5 stars
      notes,
      timestamp: Date.now()
    };

    // Update ELO rating based on feedback
    if (rating <= 2) {
      // Poor performance
      this.updateRating(execution.agent, false);
    } else if (rating >= 4) {
      // Good performance
      this.updateRating(execution.agent, true);
    }

    this.saveStats();
    return execution;
  }

  /**
   * Update agent rating using ELO system
   */
  updateRating(agentName, won) {
    const agent = this.agentStats.get(agentName);
    if (!agent) return;

    // Compare against average
    const avgRating = Array.from(this.agentStats.values()).reduce((sum, a) => sum + a.rating, 0) / this.agentStats.size;

    const expectedScore = 1 / (1 + Math.pow(10, (avgRating - agent.rating) / 400));
    const actualScore = won ? 1 : 0;
    const ratingChange = this.kFactor * (actualScore - expectedScore);

    agent.rating = Math.max(1000, Math.min(2800, agent.rating + ratingChange));
  }

  /**
   * Evaluate quality of result (0-1)
   */
  evaluateQuality(result) {
    if (!result.success) return 0.2;

    let quality = 0.7; // Base for success

    if (result.errorCount === 0) quality += 0.15;
    if (result.testsPass) quality += 0.1;
    if (result.coverage > 0.8) quality += 0.05;

    return Math.min(1, quality);
  }

  /**
   * Select best agent for a task
   */
  selectBestAgent(taskType, candidates) {
    if (!candidates || candidates.length === 0) {
      return null;
    }

    // Score each candidate
    const scores = candidates.map(agentName => {
      const stats = this.agentStats.get(agentName);
      if (!stats) {
        return { agent: agentName, score: this.baseRating };
      }

      // Multi-factor scoring
      const ratingScore = stats.rating / 2800; // Normalized
      const reliabilityScore = stats.executions > 0 ? stats.successes / stats.executions : 0.5;
      const speedScore = Math.max(0, 1 - (stats.avgDuration / 60)); // Assume 60s is max
      const qualityScore = stats.avgQuality;

      const totalScore = (
        ratingScore * 0.4 +
        reliabilityScore * 0.35 +
        qualityScore * 0.15 +
        speedScore * 0.1
      );

      return { agent: agentName, score: totalScore };
    });

    // Sort by score and return best
    scores.sort((a, b) => b.score - a.score);
    return {
      best: scores[0].agent,
      alternatives: scores.slice(1, 3).map(s => s.agent),
      scores: Object.fromEntries(scores.map(s => [s.agent, s.score]))
    };
  }

  /**
   * Get agent statistics
   */
  getStats(agentName = null) {
    if (agentName) {
      return this.agentStats.get(agentName) || null;
    }

    // Return all stats sorted by rating
    const allStats = Array.from(this.agentStats.values());
    allStats.sort((a, b) => b.rating - a.rating);
    return allStats;
  }

  /**
   * Get performance trends
   */
  getTrends(agentName, days = 7) {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const recent = this.performanceHistory.filter(
      e => e.agent === agentName && e.timestamp > cutoff
    );

    if (recent.length === 0) {
      return { agent: agentName, trend: 'insufficient_data' };
    }

    const successRate = recent.filter(e => e.success).length / recent.length;
    const avgDuration = recent.reduce((sum, e) => sum + e.duration, 0) / recent.length;
    const avgQuality = recent.reduce((sum, e) => sum + e.quality, 0) / recent.length;

    return {
      agent: agentName,
      period: `${days} days`,
      executions: recent.length,
      successRate,
      avgDuration,
      avgQuality,
      trend: successRate > 0.75 ? 'improving' : successRate < 0.5 ? 'declining' : 'stable'
    };
  }

  /**
   * Get leaderboard
   */
  getLeaderboard(limit = 10) {
    const stats = this.getStats();
    return stats.slice(0, limit).map((agent, idx) => ({
      rank: idx + 1,
      name: agent.name,
      rating: Math.round(agent.rating),
      successes: agent.successes,
      failures: agent.failures,
      reliability: agent.executions > 0 ? (agent.successes / agent.executions * 100).toFixed(1) + '%' : 'N/A',
      avgQuality: (agent.avgQuality * 100).toFixed(1) + '%',
      avgDuration: agent.avgDuration.toFixed(2) + 's'
    }));
  }

  /**
   * Reset stats for an agent
   */
  resetAgent(agentName) {
    this.agentStats.delete(agentName);
    this.performanceHistory = this.performanceHistory.filter(e => e.agent !== agentName);
    this.saveStats();
  }

  /**
   * Clear all learning data
   */
  clearAll() {
    this.agentStats.clear();
    this.performanceHistory = [];
    this.feedbackQueue = [];
    this.saveStats();
  }
}

export default AgentLearningSystem;

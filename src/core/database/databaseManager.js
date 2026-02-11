import { promises as fs } from 'fs';
import path from 'path';

class DatabaseManager {
  constructor(options = {}) {
    this.dbPath = options.dbPath || '.sentinel/database.json';
    this.data = {
      analyses: [],
      issues: [],
      feedback: [],
      metrics: [],
      history: [],
    };
    this.isLoaded = false;
    this.autoSave = options.autoSave !== false;
    this.saveInterval = options.saveInterval || 30000;
    this.saveTimer = null;
  }

  async initialize() {
    await this.load();

    if (this.autoSave) {
      this.startAutoSave();
    }

    return this;
  }

  async load() {
    try {
      const content = await fs.readFile(this.dbPath, 'utf8');
      const loaded = JSON.parse(content);
      this.data = { ...this.data, ...loaded };
      this.isLoaded = true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        await this.save();
        this.isLoaded = true;
      } else {
        throw error;
      }
    }
  }

  async save() {
    const dir = path.dirname(this.dbPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.dbPath, JSON.stringify(this.data, null, 2));
  }

  startAutoSave() {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
    }

    this.saveTimer = setInterval(async () => {
      await this.save();
    }, this.saveInterval);
  }

  stopAutoSave() {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
  }

  // Analysis operations
  async saveAnalysis(analysis) {
    const id = `analysis_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const entry = {
      id,
      ...analysis,
      createdAt: Date.now(),
    };

    this.data.analyses.push(entry);
    await this.save();

    return id;
  }

  async getAnalysis(id) {
    return this.data.analyses.find(a => a.id === id) || null;
  }

  async getAnalyses(filter = {}) {
    let results = [...this.data.analyses];

    if (filter.since) {
      results = results.filter(a => a.createdAt >= filter.since);
    }

    if (filter.project) {
      results = results.filter(a => a.project === filter.project);
    }

    if (filter.branch) {
      results = results.filter(a => a.branch === filter.branch);
    }

    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  async deleteAnalysis(id) {
    const index = this.data.analyses.findIndex(a => a.id === id);
    if (index !== -1) {
      this.data.analyses.splice(index, 1);
      await this.save();
      return true;
    }
    return false;
  }

  // Issue operations
  async saveIssue(issue) {
    const id = `issue_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const entry = {
      id,
      ...issue,
      createdAt: Date.now(),
    };

    this.data.issues.push(entry);

    if (this.data.issues.length > 10000) {
      this.data.issues = this.data.issues.slice(-10000);
    }

    await this.save();
    return id;
  }

  async getIssues(filter = {}) {
    let results = [...this.data.issues];

    if (filter.severity) {
      results = results.filter(i => i.severity === filter.severity);
    }

    if (filter.type) {
      results = results.filter(i => i.type === filter.type);
    }

    if (filter.file) {
      results = results.filter(i => i.file?.includes(filter.file));
    }

    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  async getIssueStats() {
    const stats = {
      total: this.data.issues.length,
      bySeverity: {},
      byType: {},
      byFile: {},
    };

    for (const issue of this.data.issues) {
      stats.bySeverity[issue.severity] = (stats.bySeverity[issue.severity] || 0) + 1;
      stats.byType[issue.type] = (stats.byType[issue.type] || 0) + 1;

      if (issue.file) {
        stats.byFile[issue.file] = (stats.byFile[issue.file] || 0) + 1;
      }
    }

    return stats;
  }

  // Feedback operations
  async saveFeedback(feedback) {
    const id = `feedback_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const entry = {
      id,
      ...feedback,
      createdAt: Date.now(),
    };

    this.data.feedback.push(entry);
    await this.save();
    return id;
  }

  async getFeedback(filter = {}) {
    let results = [...this.data.feedback];

    if (filter.issueId) {
      results = results.filter(f => f.issueId === filter.issueId);
    }

    if (filter.userId) {
      results = results.filter(f => f.userId === filter.userId);
    }

    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  // Metrics operations
  async saveMetrics(metrics) {
    const entry = {
      id: `metrics_${Date.now()}`,
      ...metrics,
      timestamp: Date.now(),
    };

    this.data.metrics.push(entry);

    if (this.data.metrics.length > 1000) {
      this.data.metrics = this.data.metrics.slice(-1000);
    }

    await this.save();
  }

  async getMetrics(timeRange = {}) {
    let results = [...this.data.metrics];

    if (timeRange.start) {
      results = results.filter(m => m.timestamp >= timeRange.start);
    }

    if (timeRange.end) {
      results = results.filter(m => m.timestamp <= timeRange.end);
    }

    return results;
  }

  // Aggregation queries
  async getTrends(metric, days = 30) {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const metrics = this.data.metrics.filter(m => m.timestamp >= cutoff);

    const trends = {};

    for (const m of metrics) {
      const day = new Date(m.timestamp).toISOString().split('T')[0];
      if (!trends[day]) {
        trends[day] = [];
      }
      trends[day].push(m[metric]);
    }

    return Object.entries(trends).map(([date, values]) => ({
      date,
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
    }));
  }

  async exportData() {
    return {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      data: this.data,
    };
  }

  async importData(exportData) {
    if (exportData.data) {
      this.data = { ...this.data, ...exportData.data };
      await this.save();
    }
  }

  async cleanup(days = 90) {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);

    this.data.analyses = this.data.analyses.filter(a => a.createdAt >= cutoff);
    this.data.issues = this.data.issues.filter(i => i.createdAt >= cutoff);
    this.data.feedback = this.data.feedback.filter(f => f.createdAt >= cutoff);
    this.data.metrics = this.data.metrics.filter(m => m.timestamp >= cutoff);

    await this.save();
  }

  async close() {
    this.stopAutoSave();
    await this.save();
  }
}

export default DatabaseManager;

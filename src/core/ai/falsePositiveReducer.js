import { EventBus } from '../events/eventBus.js';
import { MetricsCollector } from '../metrics/metricsCollector.js';
import crypto from 'crypto';

export const SUPPRESSION_TAXONOMY = {
  PATTERN_MATCH: 'pattern_match',
  CONTEXT_BASED: 'context_based',
  HISTORY_BASED: 'history_based',
  CODE_PATTERN: 'code_pattern',
  USER_CONFIRMED: 'user_confirmed',
  AUTO_LEARNED: 'auto_learned',
};

export const DO_NOT_SUPPRESS_TAGS = [
  'critical',
  'security-critical',
  'pci-dss',
  'gdpr-violation',
  'hipaa-violation',
  'oauth-misconfiguration',
  'crypto-weak',
];

class FalsePositiveReducer {
  constructor(options = {}) {
    this.eventBus = options.eventBus || new EventBus();
    this.metrics = options.metrics || new MetricsCollector({ serviceName: 'false-positive-reducer' });
    this.learningData = new Map();
    this.confidenceThreshold = options.confidenceThreshold || 0.7;
    this.autoLearn = options.autoLearn !== false;
    this.feedbackHistory = [];
    this.suppressionAnalytics = new Map();
    this.perAnalyzerThresholds = options.perAnalyzerThresholds || {
      security: 0.8,
      quality: 0.6,
      bugs: 0.7,
      performance: 0.6,
    };
    this.currentTenantId = null;
    this.currentTeamId = null;
    this.teamApprovalRequired = new Map();
    this.teamApprovalQueue = new Map();
  }

  setTenantContext(tenantId, teamId = null) {
    this.currentTenantId = tenantId;
    this.currentTeamId = teamId;
    
    const tenantKey = this.getTenantKey(tenantId, teamId);
    if (!this.learningData.has(tenantKey)) {
      this.learningData.set(tenantKey, {
        tenantId,
        teamId,
        data: new Map(),
        suppressionHistory: [],
      });
    }
  }

  getTenantKey(tenantId, teamId) {
    return teamId ? `${tenantId}:${teamId}` : tenantId;
  }

  getLearningData() {
    const key = this.getTenantKey(this.currentTenantId, this.currentTeamId);
    return this.learningData.get(key)?.data || this.learningData;
  }

  setApprovalRequirement(teamId, requireApprovalForCritical = true) {
    this.teamApprovalRequired.set(teamId, {
      requireApprovalForCritical,
      enabled: true,
    });
  }

  requiresApproval(issue) {
    if (!this.currentTeamId) return false;
    
    const teamConfig = this.teamApprovalRequired.get(this.currentTeamId);
    if (!teamConfig?.enabled) return false;
    
    if (teamConfig.requireApprovalForCritical && issue.severity === 'critical') {
      return true;
    }
    
    return false;
  }

  requestApproval(issue, justification) {
    if (!this.requiresApproval(issue)) {
      return { approved: true, autoApproved: true };
    }

    const request = {
      id: `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      issue,
      justification,
      requestedAt: new Date().toISOString(),
      status: 'pending',
      requestedBy: this.currentTeamId,
    };

    if (!this.teamApprovalQueue.has(this.currentTeamId)) {
      this.teamApprovalQueue.set(this.currentTeamId, []);
    }

    this.teamApprovalQueue.get(this.currentTeamId).push(request);

    this.eventBus.emit('suppression:approval_requested', request);

    return { approved: false, requestId: request.id };
  }

  approveSuppression(requestId, approvedBy) {
    for (const [, queue] of this.teamApprovalQueue) {
      const request = queue.find(r => r.id === requestId);
      if (request) {
        request.status = approvedBy ? 'approved' : 'rejected';
        request.approvedAt = new Date().toISOString();
        request.approvedBy = approvedBy;
        
        this.eventBus.emit('suppression:approval_updated', request);
        
        return { success: true, request };
      }
    }
    return { success: false, reason: 'Request not found' };
  }

  getPendingApprovals() {
    const pending = [];
    for (const [, queue] of this.teamApprovalQueue) {
      pending.push(...queue.filter(r => r.status === 'pending'));
    }
    return pending;
  }

  getThresholdForAnalyzer(analyzer) {
    return this.perAnalyzerThresholds[analyzer] || this.confidenceThreshold;
  }

  setThresholdForAnalyzer(analyzer, threshold) {
    this.perAnalyzerThresholds[analyzer] = threshold;
  }

  hasDoNotSuppressTag(issue) {
    const tags = issue.tags || [];
    return tags.some(tag => DO_NOT_SUPPRESS_TAGS.includes(tag));
  }

  async reduce(issues, context = {}) {
    const reducedIssues = [];
    const suppressedIssues = [];

    this.initializeAnalytics(issues);

    for (const issue of issues) {
      const analysis = await this.analyzeIssue(issue, context);
      const threshold = this.getThresholdForAnalyzer(issue.analyzer);

      if (this.hasDoNotSuppressTag(issue)) {
        issue.confidence = Math.max(issue.confidence || 0.5, threshold);
        reducedIssues.push(issue);
        this.trackSuppressionAnalytics(issue, 'do_not_suppress', false);
        continue;
      }

      if (analysis.isFalsePositive) {
        suppressedIssues.push({
          ...issue,
          suppressed: true,
          suppressionReason: analysis.reason,
          suppressionCategory: analysis.suppressionCategory,
          confidence: analysis.confidence,
          suggestedFix: analysis.suggestedFix,
        });

        this.metrics.incrementCounter('false-positives.suppressed', 1, {
          analyzer: issue.analyzer,
          type: issue.type,
        });

        this.trackSuppressionAnalytics(issue, analysis.suppressionCategory, true);
      } else {
        issue.confidence = Math.max(issue.confidence || 0.5, analysis.confidence);
        reducedIssues.push(issue);
        this.trackSuppressionAnalytics(issue, analysis.suppressionCategory || 'none', false);
      }
    }

    this.eventBus.emit('issues:filtered', {
      original: issues.length,
      reduced: reducedIssues.length,
      suppressed: suppressedIssues.length,
    });

    return {
      issues: reducedIssues,
      suppressed: suppressedIssues,
      statistics: this.getStatistics(),
    };
  }

  initializeAnalytics(issues) {
    for (const issue of issues) {
      const key = `${issue.analyzer}:${issue.type}`;
      if (!this.suppressionAnalytics.has(key)) {
        this.suppressionAnalytics.set(key, {
          analyzer: issue.analyzer,
          rule: issue.type,
          total: 0,
          suppressed: 0,
          truePositives: 0,
          suppressionReasons: {},
        });
      }
      const stats = this.suppressionAnalytics.get(key);
      stats.total++;
    }
  }

  trackSuppressionAnalytics(issue, category, suppressed) {
    const key = `${issue.analyzer}:${issue.type}`;
    const stats = this.suppressionAnalytics.get(key);
    
    if (stats) {
      if (suppressed) {
        stats.suppressed++;
        stats.suppressionReasons[category] = (stats.suppressionReasons[category] || 0) + 1;
      } else {
        stats.truePositives++;
      }
    }
  }

  getSuppressionAnalytics() {
    const analytics = [];
    for (const [, stats] of this.suppressionAnalytics) {
      analytics.push({
        ...stats,
        suppressionRate: stats.total > 0 
          ? ((stats.suppressed / stats.total) * 100).toFixed(2) 
          : 0,
      });
    }
    return analytics;
  }

  async analyzeIssue(issue, context = {}) {
    const signals = [];
    let suppressionCategory = null;

    const patternResult = await this.checkPatternSignal(issue);
    if (patternResult.isFalsePositive) {
      patternResult.category = SUPPRESSION_TAXONOMY.PATTERN_MATCH;
    }
    signals.push(patternResult);

    const contextResult = await this.contextSignal(issue, context);
    if (contextResult.isFalsePositive) {
      contextResult.category = SUPPRESSION_TAXONOMY.CONTEXT_BASED;
    }
    signals.push(contextResult);

    const historyResult = await this.historySignal(issue);
    if (historyResult.isFalsePositive) {
      historyResult.category = SUPPRESSION_TAXONOMY.HISTORY_BASED;
    }
    signals.push(historyResult);

    const codePatternResult = await this.codePatternSignal(issue);
    if (codePatternResult.isFalsePositive) {
      codePatternResult.category = SUPPRESSION_TAXONOMY.CODE_PATTERN;
    signals.push(codePatternResult);
    }

    const isFalsePositive = signals.some(s => s.isFalsePositive);
    const confidence = this.calculateConfidence(signals);
    const reason = isFalsePositive
      ? signals.find(s => s.isFalsePositive)?.reason
      : null;
    
    if (isFalsePositive) {
      const positiveSignal = signals.find(s => s.isFalsePositive);
      suppressionCategory = positiveSignal?.category || SUPPRESSION_TAXONOMY.PATTERN_MATCH;
    }

    return {
      isFalsePositive,
      confidence,
      reason,
      suppressionCategory,
      signals,
      suggestedFix: isFalsePositive ? null : await this.suggestFix(issue),
    };
  }

  async checkPatternSignal(issue) {
    const falsePositivePatterns = [
      {
        pattern: /process\.env\./,
        analyzers: ['security'],
        reason: 'Environment variable access is safe',
      },
      {
        pattern: /mock|test|dummy|sample|example/i,
        analyzers: ['security', 'bugs'],
        reason: 'Test/mock code should be excluded from security scanning',
      },
      {
        pattern: /\/\/\s*eslint-disable/,
        analyzers: ['quality'],
        reason: 'Intentionally disabled lint rule',
      },
    ];

    for (const fp of falsePositivePatterns) {
      if (fp.analyzers.includes(issue.analyzer)) {
        if (fp.pattern.test(issue.message) || fp.pattern.test(issue.snippet || '')) {
          return {
            isFalsePositive: true,
            confidence: 0.9,
            reason: fp.reason,
          };
        }
      }
    }

    return { isFalsePositive: false, confidence: 0.5 };
  }

  async contextSignal(issue, context = {}) {
    const filePath = issue.file || '';

    if (context.testFiles?.some(test => filePath.includes(test))) {
      return {
        isFalsePositive: true,
        confidence: 0.8,
        reason: 'Issue in test file - may be intentional for testing',
      };
    }

    if (context.excludedPaths?.some(path => filePath.includes(path))) {
      return {
        isFalsePositive: true,
        confidence: 0.95,
        reason: 'File is in excluded paths',
      };
    }

    return { isFalsePositive: false, confidence: 0.5 };
  }

  async historySignal(issue) {
    const key = `${issue.analyzer}:${issue.type}:${issue.file}`;
    const learningData = this.getLearningData();

    if (learningData.has(key)) {
      const history = learningData.get(key);
      const falsePositiveRate = history.falsePositives / history.total;

      if (falsePositiveRate > 0.8) {
        return {
          isFalsePositive: true,
          confidence: Math.min(0.95, falsePositiveRate),
          reason: 'High false positive rate for this issue type',
        };
      }
    }

    return { isFalsePositive: false, confidence: 0.5 };
  }

  async codePatternSignal(issue) {
    const snippet = issue.snippet || '';

    const safePatterns = [
      { pattern: /encodeURI|decodeURI|encodeURIComponent/, reason: 'URL encoding is safe' },
      { pattern: /innerText|textContent/, reason: 'Safe DOM text manipulation' },
      { pattern: /text\/plain/i, reason: 'Content type is safe' },
      { pattern: /https?:\/\//, reason: 'HTTPS URL is safe' },
      { pattern: /config|settings|constants?/i, reason: 'Configuration code' },
    ];

    for (const safe of safePatterns) {
      if (safe.pattern.test(snippet)) {
        return {
          isFalsePositive: true,
          confidence: 0.85,
          reason: safe.reason,
        };
      }
    }

    return { isFalsePositive: false, confidence: 0.5 };
  }

  calculateConfidence(signals) {
    const weights = {
      pattern: 0.2,
      context: 0.25,
      history: 0.35,
      codePattern: 0.2,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const [index, name] of ['pattern', 'context', 'history', 'codePattern'].entries()) {
      const signal = signals[index];
      const weight = weights[name];
      weightedSum += (1 - signal.confidence) * weight;
      totalWeight += weight;
    }

    return 1 - (weightedSum / totalWeight);
  }

  async suggestFix(issue) {
    const fixes = {
      security: {
        'hardcoded-password': 'Use environment variables or a secrets manager',
        'sql-injection': 'Use parameterized queries or an ORM',
        'xss': 'Use proper output encoding or CSP headers',
      },
      quality: {
        'complex-function': 'Consider breaking this function into smaller functions',
        'long-file': 'Consider splitting this file into smaller modules',
      },
    };

    const categoryFixes = fixes[issue.analyzer];
    if (categoryFixes) {
      for (const [type, fix] of Object.entries(categoryFixes)) {
        if (issue.type?.includes(type) || issue.message?.includes(type)) {
          return fix;
        }
      }
    }

    return null;
  }

  recordFeedback(issue, isFalsePositive, userFeedback = {}) {
    const key = `${issue.analyzer}:${issue.type}:${issue.file}`;

    if (!this.learningData.has(key)) {
      this.learningData.set(key, {
        total: 0,
        falsePositives: 0,
        truePositives: 0,
        feedback: [],
      });
    }

    const history = this.learningData.get(key);
    history.total++;
    if (isFalsePositive) {
      history.falsePositives++;
    } else {
      history.truePositives++;
    }

    history.feedback.push({
      timestamp: Date.now(),
      isFalsePositive,
      ...userFeedback,
    });

    this.feedbackHistory.push({
      issue,
      isFalsePositive,
      timestamp: Date.now(),
    });

    if (this.feedbackHistory.length > 1000) {
      this.feedbackHistory.shift();
    }

    this.eventBus.emit('feedback:recorded', {
      key,
      isFalsePositive,
      total: history.total,
    });
  }

  getStatistics() {
    let totalFalsePositives = 0;
    let totalIssuesCount = 0;

    for (const history of this.learningData.values()) {
      totalFalsePositives += history.falsePositives;
      totalIssuesCount += history.total;
    }

    return {
      trackedIssueTypes: totalIssuesCount,
      falsePositiveRate: totalIssuesCount > 0
        ? (totalFalsePositives / totalIssuesCount * 100).toFixed(2)
        : 0,
      feedbackCount: this.feedbackHistory.length,
      avgConfidence: this.calculateAverageConfidence(),
      suppressionAnalytics: this.getSuppressionAnalytics(),
      perAnalyzerThresholds: this.perAnalyzerThresholds,
    };
  }

  calculateAverageConfidence() {
    let total = 0;
    let count = 0;

    for (const history of this.learningData.values()) {
      for (const feedback of history.feedback) {
        if (feedback.confidence !== undefined) {
          total += feedback.confidence;
          count++;
        }
      }
    }

    return count > 0 ? (total / count).toFixed(2) : 0;
  }

  exportLearningData(options = {}) {
    const { tenantId, teamId, includeAllTenants = false, sign = false, secretKey = null } = options;
    
    let dataToExport;
    
    if (includeAllTenants) {
      dataToExport = {};
      for (const [key, tenantData] of this.learningData) {
        dataToExport[key] = {
          ...tenantData,
          data: Object.fromEntries(tenantData.data || new Map()),
        };
      }
    } else {
      const key = this.getTenantKey(tenantId || this.currentTenantId, teamId || this.currentTeamId);
      const tenantData = this.learningData.get(key);
      
      if (!tenantData) {
        return null;
      }
      
      dataToExport = {
        [key]: {
          ...tenantData,
          data: Object.fromEntries(tenantData.data || new Map()),
        },
      };
    }

    const exportPackage = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      tenantId: tenantId || this.currentTenantId,
      teamId: teamId || this.currentTeamId,
      data: dataToExport,
    };

    if (sign && secretKey) {
      exportPackage.signature = this.signData(JSON.stringify(dataToExport), secretKey);
      exportPackage.signedAt = new Date().toISOString();
    }

    return exportPackage;
  }

  signData(data, secretKey) {
    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(data);
    return hmac.digest('hex');
  }

  verifySignature(data, signature, secretKey) {
    const computedSignature = this.signData(data, secretKey);
    return computedSignature === signature;
  }

  async importLearningData(data, options = {}) {
    const { verifySignature: verify = false, secretKey = null, tenantId = null, teamId = null } = options;
    
    if (verify && secretKey && data.signature) {
      const dataString = JSON.stringify(data.data);
      const isValid = this.verifySignature(dataString, data.signature, secretKey);
      
      if (!isValid) {
        throw new Error('Signature verification failed - data may have been tampered with');
      }
    }

    const targetKey = this.getTenantKey(tenantId || data.tenantId, teamId || data.teamId);
    
    if (!this.learningData.has(targetKey)) {
      this.learningData.set(targetKey, {
        tenantId: tenantId || data.tenantId,
        teamId: teamId || data.teamId,
        data: new Map(),
        suppressionHistory: [],
      });
    }

    const tenantData = this.learningData.get(targetKey);
    
    for (const [key, history] of Object.entries(data.data || data)) {
      if (key !== 'version' && key !== 'exportedAt' && key !== 'tenantId' && key !== 'teamId') {
        tenantData.data.set(key, {
          ...history,
          feedback: history.feedback || [],
          remediationOutcomes: history.remediationOutcomes || [],
        });
      }
    }

    return true;
  }

  recordRemediationOutcome(issue, outcome) {
    const key = `${issue.analyzer}:${issue.type}:${issue.file}`;
    
    if (!this.learningData.has(key)) {
      this.learningData.set(key, {
        total: 0,
        falsePositives: 0,
        truePositives: 0,
        feedback: [],
        remediationOutcomes: [],
      });
    }

    const history = this.learningData.get(key);
    history.remediationOutcomes = history.remediationOutcomes || [];
    
    const outcomeRecord = {
      timestamp: Date.now(),
      outcome,
      fixId: issue.fixId,
      issueId: issue.id,
    };
    
    history.remediationOutcomes.push(outcomeRecord);

    if (outcome === 'accepted' || outcome === 'validated') {
      history.truePositives++;
      this.adjustConfidence(key, 0.05);
    } else if (outcome === 'rejected' || outcome === 'rollback') {
      history.falsePositives++;
      this.adjustConfidence(key, -0.1);
    }

    this.eventBus.emit('remediation:outcome_recorded', {
      key,
      outcome,
      issueType: issue.type,
    });

    if (history.remediationOutcomes.length > 100) {
      history.remediationOutcomes = history.remediationOutcomes.slice(-100);
    }
  }

  adjustConfidence(key, adjustment) {
    const history = this.learningData.get(key);
    if (!history) return;

    history.confidenceAdjustment = history.confidenceAdjustment || 0;
    history.confidenceAdjustment += adjustment;

    if (Math.abs(history.confidenceAdjustment) > 0.3) {
      const penalty = history.remediationOutcomes?.filter(o => o.outcome === 'rollback' || o.outcome === 'rejected').length || 0;
      if (penalty > 3) {
        history.confidenceAdjustment = -0.2;
      }
    }
  }

  async recalibrateConfidence(issues) {
    const recalibrationResults = [];
    
    for (const issue of issues) {
      const key = `${issue.analyzer}:${issue.type}:${issue.file}`;
      const history = this.learningData.get(key);
      
      if (!history) continue;

      const recentOutcomes = (history.remediationOutcomes || []).slice(-20);
      const acceptedCount = recentOutcomes.filter(o => o.outcome === 'accepted' || o.outcome === 'validated').length;
      const rejectedCount = recentOutcomes.filter(o => o.outcome === 'rejected' || o.outcome === 'rollback').length;
      const total = acceptedCount + rejectedCount;
      
      if (total >= 5) {
        const newConfidence = acceptedCount / total;
        const oldConfidence = issue.confidence || 0.5;
        
        recalibrationResults.push({
          key,
          oldConfidence,
          newConfidence,
          adjusted: newConfidence !== oldConfidence,
          sampleSize: total,
        });

        issue.confidence = newConfidence;
      }
    }

    return {
      recalibrated: recalibrationResults.filter(r => r.adjusted).length,
      totalReviewed: recalibrationResults.length,
      results: recalibrationResults,
    };
  }

  getRemediationStats() {
    const stats = {
      totalPatterns: this.learningData.size,
      patternsWithOutcomes: 0,
      totalOutcomes: 0,
      accepted: 0,
      rejected: 0,
      rolledBack: 0,
      acceptanceRate: 0,
    };

    for (const history of this.learningData.values()) {
      const outcomes = history.remediationOutcomes || [];
      if (outcomes.length > 0) {
        stats.patternsWithOutcomes++;
        stats.totalOutcomes += outcomes.length;
        
        stats.accepted += outcomes.filter(o => o.outcome === 'accepted' || o.outcome === 'validated').length;
        stats.rejected += outcomes.filter(o => o.outcome === 'rejected').length;
        stats.rolledBack += outcomes.filter(o => o.outcome === 'rollback').length;
      }
    }

    if (stats.totalOutcomes > 0) {
      stats.acceptanceRate = ((stats.accepted / stats.totalOutcomes) * 100).toFixed(2);
    }

    return stats;
  }

  trackConfidenceSnapshot(analyzer, rule, confidence, context = {}) {
    const key = `${analyzer}:${rule}`;
    const snapshot = {
      timestamp: Date.now(),
      confidence,
      analyzer,
      rule,
      context,
    };

    if (!this.confidenceHistory) {
      this.confidenceHistory = new Map();
    }

    if (!this.confidenceHistory.has(key)) {
      this.confidenceHistory.set(key, []);
    }

    const history = this.confidenceHistory.get(key);
    history.push(snapshot);

    if (history.length > 1000) {
      history.shift();
    }

    return snapshot;
  }

  generateConfidenceDriftReport(options = {}) {
    const {
      analyzer = null,
      rule = null,
      timeWindowMs = 7 * 24 * 60 * 60 * 1000,
      minSnapshots = 5,
    } = options;

    const cutoffTime = Date.now() - timeWindowMs;
    const report = {
      generatedAt: new Date().toISOString(),
      timeWindowDays: timeWindowMs / (24 * 60 * 60 * 1000),
      analyzer,
      rule,
      drifts: [],
      summary: {
        totalRulesTracked: 0,
        rulesWithDrift: 0,
        rulesImproving: 0,
        rulesDegrading: 0,
        averageDrift: 0,
      },
    };

    const drifts = [];
    let totalDrift = 0;
    let driftCount = 0;

    for (const [key, history] of this.confidenceHistory || []) {
      const [histAnalyzer, histRule] = key.split(':');

      if (analyzer && histAnalyzer !== analyzer) continue;
      if (rule && histRule !== rule) continue;

      const recentSnapshots = history.filter(s => s.timestamp > cutoffTime);
      
      if (recentSnapshots.length < minSnapshots) continue;

      report.summary.totalRulesTracked++;

      const firstConfidence = recentSnapshots[0].confidence;
      const lastConfidence = recentSnapshots[recentSnapshots.length - 1].confidence;
      const drift = lastConfidence - firstConfidence;
      const avgConfidence = recentSnapshots.reduce((sum, s) => sum + s.confidence, 0) / recentSnapshots.length;
      const variance = recentSnapshots.reduce((sum, s) => sum + Math.pow(s.confidence - avgConfidence, 2), 0) / recentSnapshots.length;
      const stdDev = Math.sqrt(variance);

      drifts.push({
        key,
        analyzer: histAnalyzer,
        rule: histRule,
        firstConfidence,
        lastConfidence,
        drift,
        driftPercentage: firstConfidence > 0 ? ((drift / firstConfidence) * 100).toFixed(2) : 0,
        avgConfidence: avgConfidence.toFixed(2),
        stdDev: stdDev.toFixed(3),
        snapshotCount: recentSnapshots.length,
        trend: drift > 0.05 ? 'improving' : drift < -0.05 ? 'degrading' : 'stable',
      });

      if (Math.abs(drift) > 0.05) {
        report.summary.rulesWithDrift++;
        if (drift > 0) report.summary.rulesImproving++;
        else report.summary.rulesDegrading++;
      }

      totalDrift += Math.abs(drift);
      driftCount++;
    }

    report.drifts = drifts.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
    report.summary.averageDrift = driftCount > 0 ? (totalDrift / driftCount).toFixed(3) : 0;

    return report;
  }

  detectAnomalousDrift(threshold = 0.2) {
    const anomalies = [];
    const recentTime = Date.now() - (24 * 60 * 60 * 1000);

    for (const [key, history] of this.confidenceHistory || []) {
      const recentSnapshots = history.filter(s => s.timestamp > recentTime);
      
      if (recentSnapshots.length < 3) continue;

      const [analyzer, rule] = key.split(':');
      const recentDrift = recentSnapshots[recentSnapshots.length - 1].confidence - recentSnapshots[0].confidence;

      if (Math.abs(recentDrift) > threshold) {
        anomalies.push({
          key,
          analyzer,
          rule,
          drift: recentDrift,
          direction: recentDrift > 0 ? 'increasing' : 'decreasing',
          severity: Math.abs(recentDrift) > 0.3 ? 'high' : 'medium',
          snapshotCount: recentSnapshots.length,
        });
      }
    }

    return anomalies;
  }
}

export default FalsePositiveReducer;

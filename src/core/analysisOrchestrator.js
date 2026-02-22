import ParallelProcessor from './processing/parallelProcessor.js';
import FalsePositiveReducer from './ai/falsePositiveReducer.js';
import SecretsScanner from '../analyzers/secretsScanner.js';
import AutoFixGenerator from './ai/autoFixGenerator.js';
import crypto from 'crypto';

class AnalysisOrchestrator {
  constructor(options = {}) {
    this.parallelProcessor = options.parallelProcessor || new ParallelProcessor({
      maxWorkers: options.maxWorkers || 4,
    });
    this.falsePositiveReducer = options.falsePositiveReducer || new FalsePositiveReducer();
    this.secretsScanner = options.secretsScanner || new SecretsScanner();
    this.autoFixGenerator = options.autoFixGenerator || new AutoFixGenerator();
    this.eventBus = options.eventBus;
    this.metrics = options.metrics;
    this.isInitialized = false;
    this.runId = null;
    this.stageMetrics = {};
    this.fixTraceMap = new Map();
    this.dryRunMode = false;
    this.tenantContext = null;
    this.policyProfile = null;
    this.queuePriority = 'normal';
  }

  setTenantContext(tenantId, teamId = null, repoId = null) {
    this.tenantContext = {
      tenantId,
      teamId,
      repoId,
      setAt: new Date().toISOString(),
    };
    
    this.eventBus?.emit('tenant:context_set', this.tenantContext);
  }

  setPolicyProfile(profileName) {
    this.policyProfile = profileName;
    this.eventBus?.emit('policy:profile_changed', { profile: profileName });
  }

  setQueuePriority(priority) {
    const validPriorities = ['low', 'normal', 'high', 'critical'];
    if (validPriorities.includes(priority)) {
      this.queuePriority = priority;
      this.eventBus?.emit('queue:priority_changed', { priority });
    }
  }

  getExecutionMetadata() {
    return {
      runId: this.runId,
      tenantContext: this.tenantContext,
      policyProfile: this.policyProfile,
      queuePriority: this.queuePriority,
      timestamp: new Date().toISOString(),
    };
  }

  async initialize() {
    await this.parallelProcessor.initialize();
    this.isInitialized = true;
    return this;
  }

  generateRunId() {
    return `run_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`;
  }

  startStage(stageName) {
    this.stageMetrics[stageName] = {
      startTime: Date.now(),
      status: 'in_progress',
      tenantId: this.tenantContext?.tenantId,
      teamId: this.tenantContext?.teamId,
    };
    this.eventBus?.emit('analysis:stage_started', {
      runId: this.runId,
      stage: stageName,
      timestamp: new Date().toISOString(),
      tenantContext: this.tenantContext,
    });
  }

  completeStage(stageName, result = {}) {
    const metric = this.stageMetrics[stageName];
    if (metric) {
      metric.endTime = Date.now();
      metric.duration = metric.endTime - metric.startTime;
      metric.status = 'completed';
      metric.result = result;
    }
    this.eventBus?.emit('analysis:stage_completed', {
      runId: this.runId,
      stage: stageName,
      duration: metric?.duration,
      timestamp: new Date().toISOString(),
      tenantContext: this.tenantContext,
      ...result,
    });
  }

  async analyze(files, options = {}) {
    const {
      analyzers = ['security', 'quality', 'bugs', 'performance'],
      parallel = true,
      reduceFalsePositives = true,
      scanSecrets = true,
      generateRemediation = false,
      dryRun = false,
      timeout = 60000,
      tenantId,
      teamId,
      repoId,
      policyProfile,
      priority,
    } = options;

    if (tenantId) {
      this.setTenantContext(tenantId, teamId, repoId);
    }
    
    if (policyProfile) {
      this.setPolicyProfile(policyProfile);
    }
    
    if (priority) {
      this.setQueuePriority(priority);
    }

    this.runId = this.generateRunId();
    this.stageMetrics = {};
    this.fixTraceMap = new Map();
    this.dryRunMode = dryRun;
    
    const executionMetadata = this.getExecutionMetadata();
    
    this.eventBus?.emit('analysis:started', {
      runId: this.runId,
      fileCount: files.length,
      analyzerCount: analyzers.length,
      generateRemediation,
      dryRun,
    });

    try {
      const result = await this.runPipeline(files, analyzers, {
        parallel,
        reduceFalsePositives,
        scanSecrets,
        generateRemediation,
        dryRun,
        timeout,
      });

      return {
        ...result,
        runId: this.runId,
        stageMetrics: this.stageMetrics,
        fixTraceMap: Object.fromEntries(this.fixTraceMap),
        executionMetadata,
      };
    } catch (error) {
      this.eventBus?.emit('analysis:error', {
        runId: this.runId,
        error: error.message,
      });
      throw error;
    }
  }

  async runPipeline(files, analyzers, options) {
    let stageResult;
    
    this.startStage('scan');
    stageResult = await this.stageScan(files, analyzers, options);
    this.completeStage('scan', { issueCount: stageResult.issues.length });
    
    this.startStage('enrich');
    stageResult = await this.stageEnrich(stageResult.issues);
    this.completeStage('enrich', { issueCount: stageResult.issues.length });
    
    this.startStage('dedupe');
    stageResult = await this.stageDedupe(stageResult.issues);
    this.completeStage('dedupe', { issueCount: stageResult.issues.length });
    
    if (options.reduceFalsePositives) {
      this.startStage('reduceFalsePositives');
      stageResult = await this.stageReduceFalsePositives(stageResult.issues, files);
      this.completeStage('reduceFalsePositives', { 
        issueCount: stageResult.issues.length,
        suppressedCount: stageResult.suppressed?.length || 0,
      });
    }
    
    this.startStage('prioritize');
    stageResult = await this.stagePrioritize(stageResult.issues);
    this.completeStage('prioritize', { issueCount: stageResult.issues.length });

    if (options.generateRemediation) {
      this.startStage('generateFix');
      stageResult = await this.stageGenerateFix(stageResult.issues);
      this.completeStage('generateFix', { 
        fixCount: stageResult.fixes?.length || 0,
        issuesWithFixes: stageResult.issues.filter(i => i.fix).length,
      });

      this.startStage('validateFix');
      stageResult = await this.stageValidateFix(stageResult);
      this.completeStage('validateFix', { 
        validFixCount: stageResult.fixes?.filter(f => f.isValid).length || 0,
        invalidFixCount: stageResult.fixes?.filter(f => !f.isValid).length || 0,
      });

      this.startStage('recommend');
      stageResult = await this.stageRecommend(stageResult);
      this.completeStage('recommend', { 
        recommendedCount: stageResult.issues.filter(i => i.recommendation).length,
      });
    }

    return stageResult;
  }

  async stageGenerateFix(issues) {
    const fixes = [];
    const issuesWithFixes = [];
    
    for (const issue of issues) {
      const shouldGenerateFix = issue.severity === 'critical' || 
                               issue.severity === 'high' || 
                               this.autoFixGenerator.canAutoFix(issue);

      if (shouldGenerateFix) {
        const fix = await this.autoFixGenerator.generateFix(issue);
        
        if (fix) {
          const fixId = `fix_${this.runId}_${issue.id || Math.random().toString(36).substr(2, 9)}`;
          
          this.fixTraceMap.set(fixId, {
            issueId: issue.id,
            issueType: issue.type,
            file: issue.file,
            line: issue.line,
            fix,
            generatedAt: new Date().toISOString(),
            status: 'generated',
          });

          fixes.push({
            id: fixId,
            issueId: issue.id,
            fix,
            confidence: fix.confidence || 0.8,
          });

          issuesWithFixes.push({
            ...issue,
            fix: fix,
            fixId,
          });
          
          this.eventBus?.emit('fix:generated', {
            runId: this.runId,
            fixId,
            issueId: issue.id,
            issueType: issue.type,
          });
        } else {
          issuesWithFixes.push(issue);
        }
      } else {
        issuesWithFixes.push(issue);
      }
    }

    return { 
      issues: issuesWithFixes,
      fixes,
    };
  }

  async stageValidateFix(stageResult) {
    const validatedFixes = [];
    
    for (const fix of stageResult.fixes || []) {
      const validation = await this.validateFix(fix, stageResult.issues);
      
      const traceEntry = this.fixTraceMap.get(fix.id);
      if (traceEntry) {
        traceEntry.validation = validation;
        traceEntry.status = validation.isValid ? 'validated' : 'rejected';
        traceEntry.validatedAt = new Date().toISOString();
      }

      validatedFixes.push({
        ...fix,
        isValid: validation.isValid,
        validationErrors: validation.errors,
        validationWarnings: validation.warnings,
      });

      this.eventBus?.emit('fix:validated', {
        runId: this.runId,
        fixId: fix.id,
        isValid: validation.isValid,
        errors: validation.errors,
      });
    }

    return {
      ...stageResult,
      fixes: validatedFixes,
    };
  }

  async validateFix(fix, issues) {
    const errors = [];
    const warnings = [];

    if (this.dryRunMode) {
      return { isValid: true, errors: [], warnings: ['Dry-run mode - no actual validation'] };
    }

    if (!fix.fix || !fix.fix.code) {
      errors.push('Fix has no code to validate');
      return { isValid: false, errors, warnings };
    }

    if (fix.confidence < 0.7) {
      warnings.push(`Low confidence fix (${fix.confidence})`);
    }

    const originalIssue = issues.find(i => i.id === fix.issueId || i.fixId === fix.id);
    if (originalIssue) {
      if (originalIssue.severity === 'critical' && fix.confidence < 0.9) {
        errors.push('Critical issues require high-confidence fixes (>=0.9)');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async stageRecommend(stageResult) {
    const recommendedIssues = [];
    
    for (const issue of stageResult.issues) {
      const recommendation = this.generateRecommendation(issue, stageResult.fixes);
      
      if (recommendation) {
        recommendedIssues.push({
          ...issue,
          recommendation,
        });
      } else {
        recommendedIssues.push(issue);
      }
    }

    return {
      ...stageResult,
      issues: recommendedIssues,
    };
  }

  generateRecommendation(issue, fixes) {
    const issueFix = fixes?.find(f => f.issueId === issue.id || f.id === issue.fixId);
    
    if (!issueFix) {
      return null;
    }

    const recommendation = {
      action: 'review_fix',
      priority: issue.severity === 'critical' ? 'high' : 'medium',
      autoApply: false,
    };

    if (issueFix.isValid) {
      recommendation.message = 'A validated fix is available for this issue';
      recommendation.fixId = issueFix.id;
      recommendation.confidence = issueFix.confidence;
      
      if (this.dryRunMode) {
        recommendation.message += ' (dry-run mode - fix not applied)';
      }
    } else {
      recommendation.message = 'Fix generated but validation failed - manual review required';
      recommendation.action = 'manual_review';
      recommendation.validationErrors = issueFix.validationErrors;
    }

    if (issue.severity === 'critical') {
      recommendation.autoApply = issueFix.isValid && issueFix.confidence >= 0.9;
    }

    return recommendation;
  }

  async stageScan(files, analyzers, options) {
    const tasks = this.createAnalysisTasks(files, analyzers);
    
    let results;
    if (options.parallel) {
      results = await this.parallelProcessor.process(tasks, { timeout: options.timeout });
    } else {
      results = await this.processSequentially(tasks);
    }
    
    let issues = this.aggregateResults(results);

    if (options.scanSecrets) {
      const secrets = await this.scanForSecrets(files);
      issues = [...issues, ...secrets];
    }

    return { issues };
  }

  async stageEnrich(issues) {
    const enriched = [];
    
    for (const issue of issues) {
      const enrichedIssue = {
        ...issue,
        enriched: true,
        cwe: issue.cwe || this.inferCWE(issue),
        owasp: issue.owasp || this.inferOWASP(issue),
        severityScore: this.calculateSeverityScore(issue),
        category: issue.category || this.categorizeIssue(issue),
      };
      enriched.push(enrichedIssue);
    }

    return { issues: enriched };
  }

  inferCWE(issue) {
    const cweMap = {
      'sql-injection': 'CWE-89',
      'xss': 'CWE-79',
      'command-injection': 'CWE-78',
      'path-traversal': 'CWE-22',
      'hardcoded-password': 'CWE-259',
      'secret': 'CWE-798',
    };
    return cweMap[issue.type] || null;
  }

  inferOWASP(issue) {
    const owaspMap = {
      'sql-injection': 'A03:2021-Injection',
      'xss': 'A03:2021-Injection',
      'command-injection': 'A03:2021-Injection',
      'hardcoded-password': 'A02:2021-Cryptographic Failures',
      'secret': 'A02:2021-Cryptographic Failures',
    };
    return owaspMap[issue.type] || null;
  }

  calculateSeverityScore(issue) {
    const severityWeights = {
      critical: 10,
      high: 7,
      medium: 4,
      low: 1,
      info: 0,
    };
    return severityWeights[issue.severity] || 0;
  }

  categorizeIssue(issue) {
    if (issue.analyzer === 'security') return 'security';
    if (issue.analyzer === 'quality') return 'quality';
    if (issue.analyzer === 'bugs') return 'defect';
    if (issue.analyzer === 'performance') return 'performance';
    return 'general';
  }

  async stageDedupe(issues) {
    const seen = new Map();
    const deduplicated = [];
    
    for (const issue of issues) {
      const key = `${issue.analyzer}:${issue.type}:${issue.file}:${issue.line || 0}`;
      
      if (!seen.has(key)) {
        seen.set(key, issue);
        deduplicated.push(issue);
      } else {
        const existing = seen.get(key);
        if (issue.confidence > (existing.confidence || 0)) {
          seen.set(key, issue);
          const index = deduplicated.indexOf(existing);
          if (index !== -1) {
            deduplicated[index] = issue;
          }
        }
      }
    }

    return { issues: deduplicated };
  }

  async stageReduceFalsePositives(issues, files) {
    const testFiles = files
      .filter(f => f.path.includes('.test.') || f.path.includes('.spec.'))
      .map(f => f.path);

    const reduced = await this.falsePositiveReducer.reduce(issues, {
      testFiles,
      runId: this.runId,
    });

    this.eventBus?.emit('analysis:completed', {
      runId: this.runId,
      totalIssues: issues.length,
      reducedIssues: reduced.issues.length,
      suppressedIssues: reduced.suppressed.length,
    });

    return reduced;
  }

  async stagePrioritize(issues) {
    const prioritized = [...issues].sort((a, b) => {
      const scoreA = (a.severityScore || 0) + (a.confidence || 0.5) * 5;
      const scoreB = (b.severityScore || 0) + (b.confidence || 0.5) * 5;
      return scoreB - scoreA;
    });

    return { issues: prioritized };
  }

  createAnalysisTasks(files, analyzers) {
    const tasks = [];

    for (const file of files) {
      for (const analyzer of analyzers) {
        tasks.push({
          type: 'analyze',
          analyzer,
          file: file.path,
          content: file.content,
          options: {},
        });
      }
    }

    return tasks;
  }

  async processSequentially(tasks) {
    const results = [];

    for (const task of tasks) {
      const result = await this.parallelProcessor.submitTask(task);
      results.push(result);
    }

    return results;
  }

  aggregateResults(results) {
    const issues = [];

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('Task failed:', result.reason);
        continue;
      }

      const { value } = result;
      if (value?.result?.issues) {
        issues.push(...value.result.issues);
      }
    }

    return issues;
  }

  async scanForSecrets(files, options = {}) {
    const { entropyAnalysis = true, customPatterns = [] } = options;

    const tasks = [];

    for (const file of files) {
      tasks.push({
        type: 'scan',
        scanner: 'secrets',
        file: file.path,
        content: file.content,
        options: { entropyAnalysis, customPatterns },
      });
    }

    const results = await this.parallelProcessor.process(tasks);
    const allSecrets = [];

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value?.result) {
        allSecrets.push(...result.value.result.issues);
      }
    }

    return allSecrets;
  }

  async shutdown() {
    await this.parallelProcessor.shutdown();
    this.isInitialized = false;
  }

  getMetrics() {
    return {
      processor: this.parallelProcessor.getMetrics(),
      falsePositiveReducer: this.falsePositiveReducer.getStatistics(),
      isInitialized: this.isInitialized,
      currentRunId: this.runId,
      stageMetrics: this.stageMetrics,
      tenantContext: this.tenantContext,
      policyProfile: this.policyProfile,
      queuePriority: this.queuePriority,
    };
  }
}

export default AnalysisOrchestrator;

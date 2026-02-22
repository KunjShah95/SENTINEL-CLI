import Config from '../config/config.js';
import { SecurityAnalyzer } from '../analyzers/securityAnalyzer.js';
import { QualityAnalyzer } from '../analyzers/qualityAnalyzer.js';
import { BugAnalyzer } from '../analyzers/bugAnalyzer.js';
import { PerformanceAnalyzer } from '../analyzers/performanceAnalyzer.js';
import { DependencyAnalyzer } from '../analyzers/dependencyAnalyzer.js';
import { AccessibilityAnalyzer } from '../analyzers/accessibilityAnalyzer.js';
import { TypeScriptAnalyzer } from '../analyzers/typescriptAnalyzer.js';
import { ReactAnalyzer } from '../analyzers/reactAnalyzer.js';
import { APISecurityAnalyzer } from '../analyzers/apiSecurityAnalyzer.js';
import { EnvSecurityAnalyzer } from '../analyzers/envSecurityAnalyzer.js';
import { DockerAnalyzer } from '../analyzers/dockerAnalyzer.js';
import ReportGenerator from '../output/reportGenerator.js';
import PolicyEngine from './policy/policyEngine.js';

import {
  AnalysisOrchestrator,
  ParallelProcessor,
  FalsePositiveReducer,
  FeatureFlags,
  globalEventBus,
  globalMetrics,
} from './index.js';

const config = new Config();

export class CodeReviewBot {
  constructor(options = {}) {
    this.analyzers = [];
    this.reportGenerator = new ReportGenerator();
    this.analysisOrchestrator = options.analysisOrchestrator || null;
    this.parallelProcessor = null;
    this.falsePositiveReducer = null;
    this.featureFlags = null;
    this.policyEngine = null;
    this.eventBus = options.eventBus || globalEventBus;
    this.metrics = options.metrics || globalMetrics;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      await config.load();
      await config.validate();

      try {
        const { configManager } = await import('../config/configManager.js');
        await configManager.load();
        configManager.injectEnvVars();
      } catch (globalConfigError) {
        // Silently continue if global config fails
      }

      await this.initializeScalableComponents();

      const enabledAnalyzers = config.getAnalyzers();

      if (enabledAnalyzers.includes('security')) {
        this.analyzers.push(new SecurityAnalyzer(config));
      }

      if (enabledAnalyzers.includes('quality')) {
        this.analyzers.push(new QualityAnalyzer(config));
      }

      if (enabledAnalyzers.includes('bugs')) {
        this.analyzers.push(new BugAnalyzer(config));
      }

      if (enabledAnalyzers.includes('performance')) {
        this.analyzers.push(new PerformanceAnalyzer(config));
      }

      if (enabledAnalyzers.includes('dependency') || enabledAnalyzers.includes('deps')) {
        this.analyzers.push(new DependencyAnalyzer(config));
      }

      if (enabledAnalyzers.includes('accessibility') || enabledAnalyzers.includes('a11y')) {
        this.analyzers.push(new AccessibilityAnalyzer(config));
      }

      if (enabledAnalyzers.includes('typescript') || enabledAnalyzers.includes('ts')) {
        this.analyzers.push(new TypeScriptAnalyzer(config));
      }

      if (enabledAnalyzers.includes('react') || enabledAnalyzers.includes('jsx')) {
        this.analyzers.push(new ReactAnalyzer(config));
      }

      if (enabledAnalyzers.includes('api') || enabledAnalyzers.includes('api-security')) {
        this.analyzers.push(new APISecurityAnalyzer(config));
      }

      if (enabledAnalyzers.includes('secrets') || enabledAnalyzers.includes('env')) {
        this.analyzers.push(new EnvSecurityAnalyzer(config));
      }

      if (enabledAnalyzers.includes('docker') || enabledAnalyzers.includes('dockerfile')) {
        this.analyzers.push(new DockerAnalyzer(config));
      }

      this.isInitialized = true;

      this.eventBus.emit('bot:initialized', {
        analyzerCount: this.analyzers.length,
        enabledAnalyzers,
      });

      return true;
    } catch (error) {
      console.error('Failed to initialize CodeReviewBot:', error.message);
      return false;
    }
  }

  async initializeScalableComponents() {
    const useParallel = config.get('analysis.enableParallelProcessing', true);

    if (useParallel) {
      this.parallelProcessor = new ParallelProcessor({
        maxWorkers: config.get('analysis.maxWorkers', 4),
        eventBus: this.eventBus,
      });
      await this.parallelProcessor.initialize();
    }

    this.falsePositiveReducer = new FalsePositiveReducer({
      eventBus: this.eventBus,
      metrics: this.metrics,
      confidenceThreshold: config.get('ml.confidenceThreshold', 0.7),
    });

    this.featureFlags = new FeatureFlags({
      storagePath: '.sentinel/feature-flags.json',
    });
    await this.featureFlags.load();

    this.policyEngine = new PolicyEngine({
      policyDir: '.sentinel/policies',
      enforcementMode: config.get('policy.enforcementMode', 'advisory'),
    });
    await this.policyEngine.loadPolicies();

    this.analysisOrchestrator = new AnalysisOrchestrator({
      parallelProcessor: this.parallelProcessor,
      falsePositiveReducer: this.falsePositiveReducer,
      eventBus: this.eventBus,
      metrics: this.metrics,
    });

    if (this.parallelProcessor) {
      await this.analysisOrchestrator.initialize();
    }
  }

  async analyzeFiles(files, options = {}) {
    const timer = this.metrics.startTimer('bot.analyze-files');

    this.eventBus.emit('analysis:start', {
      fileCount: files.length,
      options,
    });

    const useNewFramework = this.featureFlags?.isEnabled('new-analyzer-framework') ?? true;

    let issues;

    if (useNewFramework && this.analysisOrchestrator) {
      const result = await this.analysisOrchestrator.analyze(files, {
        parallel: options.parallel ?? true,
        reduceFalsePositives: options.reduceFalsePositives ?? true,
        timeout: options.timeout ?? 60000,
      });

      issues = result.issues;
    } else {
      issues = await this.analyzeFilesLegacy(files);
    }

    this.eventBus.emit('analysis:complete', {
      issueCount: issues.length,
    });

    this.metrics.endTimer(timer);

    return issues;
  }

  async analyzeFilesLegacy(files) {
    const allIssues = [];

    for (const analyzer of this.analyzers) {
      const analyzerTimer = this.metrics.startTimer(`analyzer.${analyzer.name}`);

      try {
        if (typeof analyzer.analyzeFiles === 'function') {
          const issues = await analyzer.analyzeFiles(files, {});
          allIssues.push(...issues);
        } else if (typeof analyzer.analyze === 'function') {
          const issues = await analyzer.analyze(files, {});
          allIssues.push(...issues);
        }
      } catch (error) {
        this.eventBus.emit('analyzer:error', {
          analyzer: analyzer.name,
          error: error.message,
        });
      }

      this.metrics.endTimer(analyzerTimer);
    }

    return allIssues;
  }

  async evaluatePolicies(issues, options = {}) {
    if (!this.policyEngine || !this.policyEngine.policies.size) {
      return null;
    }

    const context = {
      runId: options.runId,
      branch: options.branch,
      commit: options.commit,
    };

    const result = this.policyEngine.evaluate(issues, context);

    this.eventBus.emit('policy:evaluated', {
      policyCount: this.policyEngine.policies.size,
      violations: result.violations.length,
      passed: result.passed.length,
      score: result.score,
    });

    return result;
  }

  checkPolicyGate(policyResult, options = {}) {
    if (!policyResult) return { shouldFail: false };

    const failOnScore = options.failOnScore ?? 0;
    const failOnSeverity = options.failOnSeverity || 'critical';

    const severityOrder = ['info', 'low', 'medium', 'high', 'critical'];
    const failSeverityIndex = severityOrder.indexOf(failOnSeverity.toLowerCase());

    if (policyResult.score < failOnScore) {
      return {
        shouldFail: true,
        reason: `Policy score ${policyResult.score} below threshold ${failOnScore}`,
        policyResult,
      };
    }

    const failingViolations = policyResult.violations.filter(v => {
      const vIndex = severityOrder.indexOf(v.severity?.toLowerCase());
      return vIndex >= failSeverityIndex;
    });

    if (failingViolations.length > 0) {
      return {
        shouldFail: true,
        reason: `${failingViolations.length} violations at or above '${failOnSeverity}' severity`,
        policyResult,
        failingViolations,
      };
    }

    return { shouldFail: false, policyResult };
  }

  async shutdown() {
    if (this.analysisOrchestrator) {
      await this.analysisOrchestrator.shutdown();
    }

    if (this.parallelProcessor) {
      await this.parallelProcessor.shutdown();
    }

    if (this.featureFlags) {
      this.featureFlags.stopAutoRefresh();
    }

    this.eventBus.emit('bot:shutdown');

    this.isInitialized = false;
  }

  getMetrics() {
    return {
      analyzerCount: this.analyzers.length,
      orchestrator: this.analysisOrchestrator?.getMetrics() ?? null,
      parallelProcessor: this.parallelProcessor?.getMetrics() ?? null,
      falsePositiveReducer: this.falsePositiveReducer?.getStatistics() ?? null,
      policyEngine: {
        loadedPolicies: this.policyEngine?.policies.size ?? 0,
        policies: this.policyEngine?.getAllPolicies() ?? [],
      },
      isInitialized: this.isInitialized,
    };
  }
}
export default CodeReviewBot;

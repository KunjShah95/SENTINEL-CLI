import ParallelProcessor from './processing/parallelProcessor.js';
import FalsePositiveReducer from './ai/falsePositiveReducer.js';
import SecretsScanner from '../analyzers/secretsScanner.js';

class AnalysisOrchestrator {
  constructor(options = {}) {
    this.parallelProcessor = options.parallelProcessor || new ParallelProcessor({
      maxWorkers: options.maxWorkers || 4,
    });
    this.falsePositiveReducer = options.falsePositiveReducer || new FalsePositiveReducer();
    this.secretsScanner = options.secretsScanner || new SecretsScanner();
    this.eventBus = options.eventBus;
    this.metrics = options.metrics;
    this.isInitialized = false;
  }

  async initialize() {
    await this.parallelProcessor.initialize();
    this.isInitialized = true;
    return this;
  }

  async analyze(files, options = {}) {
    const {
      analyzers = ['security', 'quality', 'bugs', 'performance'],
      parallel = true,
      reduceFalsePositives = true,
      timeout = 60000,
    } = options;

    const tasks = this.createAnalysisTasks(files, analyzers);
    this.eventBus?.emit('analysis:started', {
      fileCount: files.length,
      analyzerCount: analyzers.length,
      taskCount: tasks.length,
    });

    let results;

    if (parallel) {
      results = await this.parallelProcessor.process(tasks, { timeout });
    } else {
      results = await this.processSequentially(tasks);
    }

    const allIssues = this.aggregateResults(results);

    if (reduceFalsePositives) {
      const reduced = await this.falsePositiveReducer.reduce(allIssues, {
        testFiles: files.filter(f => f.path.includes('.test.') || f.path.includes('.spec.')).map(f => f.path),
      });

      this.eventBus?.emit('analysis:completed', {
        totalIssues: allIssues.length,
        reducedIssues: reduced.issues.length,
        suppressedIssues: reduced.suppressed.length,
      });

      return reduced;
    }

    return {
      issues: allIssues,
      suppressed: [],
      statistics: {},
    };
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
    };
  }
}

export default AnalysisOrchestrator;

import { readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { AnalyzerCategory, EventType } from '../../interfaces/index.js';
import EventBus from '../events/eventBus.js';
import MetricsCollector from '../metrics/metricsCollector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class AnalyzerRegistry {
  constructor(options = {}) {
    this.analyzers = new Map();
    this.categories = new Map();
    this.analyzerPath = options.analyzerPath || path.join(__dirname, '../../analyzers');
    this.eventBus = options.eventBus || new EventBus();
    this.metrics = options.metrics || new MetricsCollector({ serviceName: 'analyzer-registry' });
    this.isInitialized = false;
    this.parallelAnalyzers = options.parallelAnalyzers || 4;
  }

  async initialize() {
    if (this.isInitialized) return;

    await this.loadBuiltInAnalyzers();
    this.isInitialized = true;

    return this;
  }

  async loadBuiltInAnalyzers() {
    try {
      const entries = await readdir(this.analyzerPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          await this.loadAnalyzerDirectory(path.join(this.analyzerPath, entry.name));
        }
      }
    } catch (error) {
      console.warn('Failed to load built-in analyzers:', error.message);
    }
  }

  async loadAnalyzerDirectory(dirPath) {
    try {
      const files = await readdir(dirPath);
      const indexFile = files.find(f => f.endsWith('Analyzer.js') || f.endsWith('Analyzer.ts'));

      if (indexFile) {
        const analyzerPath = path.join(dirPath, indexFile);
        const module = await import(`file://${analyzerPath}`);

        if (module.default) {
          await this.register(module.default, { autoInitialize: true });
        }
      }
    } catch (error) {
      console.warn(`Failed to load analyzer from ${dirPath}:`, error.message);
    }
  }

  async register(AnalyzerClass, options = {}) {
    try {
      const metadata = this.extractMetadata(AnalyzerClass);

      if (this.analyzers.has(metadata.id)) {
        console.warn(`Analyzer ${metadata.id} is already registered, overwriting`);
      }

      const analyzerInstance = options.autoInitialize
        ? new AnalyzerClass()
        : new AnalyzerClass(options.config || {});

      const analyzer = {
        class: AnalyzerClass,
        instance: analyzerInstance,
        metadata,
        enabled: options.enabled !== false,
        priority: options.priority || metadata.priority || 100,
        config: options.config || {},
        registeredAt: Date.now(),
        version: metadata.version || '1.0.0',
      };

      this.analyzers.set(metadata.id, analyzer);

      for (const category of metadata.categories || []) {
        if (!this.categories.has(category)) {
          this.categories.set(category, new Set());
        }
        this.categories.get(category).add(metadata.id);
      }

      this.eventBus.emit('analyzer:registered', {
        id: metadata.id,
        name: metadata.name,
        categories: metadata.categories,
      });

      return metadata.id;
    } catch (error) {
      console.error(`Failed to register analyzer:`, error.message);
      throw error;
    }
  }

  unregister(analyzerId) {
    const analyzer = this.analyzers.get(analyzerId);
    if (!analyzer) return false;

    for (const category of analyzer.metadata.categories || []) {
      const categorySet = this.categories.get(category);
      if (categorySet) {
        categorySet.delete(analyzerId);
        if (categorySet.size === 0) {
          this.categories.delete(category);
        }
      }
    }

    this.analyzers.delete(analyzerId);

    this.eventBus.emit('analyzer:unregistered', {
      id: analyzerId,
      name: analyzer.metadata.name,
    });

    return true;
  }

  extractMetadata(AnalyzerClass) {
    const defaultInstance = new AnalyzerClass();

    return {
      id: defaultInstance.name || AnalyzerClass.name.replace('Analyzer', '').toLowerCase(),
      name: defaultInstance.getName?.() || AnalyzerClass.name.replace('Analyzer', ''),
      description: defaultInstance.description || '',
      version: defaultInstance.version || '1.0.0',
      author: defaultInstance.author || 'Sentinel Team',
      categories: defaultInstance.categories || [AnalyzerCategory.CORRECTNESS],
      supportedLanguages: defaultInstance.supportedLanguages || ['javascript', 'typescript'],
      filePatterns: defaultInstance.filePatterns || ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx'],
      priority: defaultInstance.priority || 100,
      configurable: typeof defaultInstance.configure === 'function',
      healthCheck: typeof defaultInstance.healthCheck === 'function',
    };
  }

  getAnalyzer(analyzerId) {
    return this.analyzers.get(analyzerId) || null;
  }

  getAllAnalyzers() {
    return Array.from(this.analyzers.values());
  }

  getEnabledAnalyzers() {
    return Array.from(this.analyzers.values())
      .filter(a => a.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  getAnalyzersByCategory(category) {
    const analyzerIds = this.categories.get(category) || [];
    return analyzerIds
      .map(id => this.analyzers.get(id))
      .filter(Boolean);
  }

  getAnalyzersForFile(filePath) {
    const matchingAnalyzers = [];

    for (const analyzer of this.getEnabledAnalyzers()) {
      const patterns = analyzer.metadata.filePatterns;

      for (const pattern of patterns) {
        if (this.matchesPattern(filePath, pattern)) {
          matchingAnalyzers.push(analyzer);
          break;
        }
      }
    }

    return matchingAnalyzers;
  }

  matchesPattern(filePath, pattern) {
    const regex = this.patternToRegex(pattern);
    return regex.test(filePath);
  }

  patternToRegex(pattern) {
    const regexStr = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\./g, '\\.');

    return new RegExp(`^${regexStr}$`);
  }

  async executeAnalyzers(analyzers, files, context = {}) {
    const timer = this.metrics.startTimer('total-analysis-time');
    const results = [];

    const enabledAnalyzers = analyzers.length > 0
      ? analyzers.filter(a => this.analyzers.get(a)?.enabled)
      : this.getEnabledAnalyzers();

    const parallelGroups = this.groupAnalyzersForParallelism(enabledAnalyzers);

    for (const group of parallelGroups) {
      const groupResults = await Promise.all(
        group.map(analyzer => this.executeAnalyzer(analyzer, files, context))
      );

      results.push(...groupResults);
    }

    this.metrics.endTimer(timer);

    return results;
  }

  groupAnalyzersForParallelism(analyzers) {
    const groups = [];
    const currentGroup = [];

    for (const analyzer of analyzers) {
      if (analyzer.metadata.blocking) {
        if (currentGroup.length > 0) {
          groups.push([...currentGroup]);
          currentGroup.length = 0;
        }
        groups.push([analyzer]);
      } else {
        currentGroup.push(analyzer);
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  async executeAnalyzer(analyzer, files, context = {}) {
    const timer = this.metrics.startTimer(`analyzer:${analyzer.metadata.id}`, {
      category: analyzer.metadata.categories?.[0] || 'unknown',
    });

    this.eventBus.emit(EventType.ANALYZER_START, {
      analyzerId: analyzer.metadata.id,
      analyzerName: analyzer.metadata.name,
      fileCount: files.length,
    });

    try {
      const startTime = Date.now();

      let results;
      if (typeof analyzer.instance.analyzeFiles === 'function') {
        results = await analyzer.instance.analyzeFiles(files, context);
      } else if (typeof analyzer.instance.analyze === 'function') {
        results = await analyzer.instance.analyze(files, context);
      } else {
        throw new Error(`Analyzer ${analyzer.metadata.id} has no analyze method`);
      }

      const duration = Date.now() - startTime;

      this.metrics.incrementCounter('analyzer:executed', 1, {
        analyzer: analyzer.metadata.id,
        status: 'success',
      });

      this.metrics.recordHistogram('analyzer:execution-time', duration, {
        analyzer: analyzer.metadata.id,
      });

      this.eventBus.emit(EventType.ANALYZER_COMPLETE, {
        analyzerId: analyzer.metadata.id,
        analyzerName: analyzer.metadata.name,
        duration,
        issueCount: results?.length || 0,
      });

      this.metrics.endTimer(timer);

      return {
        analyzerId: analyzer.metadata.id,
        analyzerName: analyzer.metadata.name,
        results,
        duration,
        success: true,
      };
    } catch (error) {
      this.metrics.incrementCounter('analyzer:executed', 1, {
        analyzer: analyzer.metadata.id,
        status: 'error',
      });

      this.metrics.recordHistogram('analyzer:execution-time', 0, {
        analyzer: analyzer.metadata.id,
        status: 'error',
      });

      this.eventBus.emit(EventType.ANALYZER_ERROR, {
        analyzerId: analyzer.metadata.id,
        analyzerName: analyzer.metadata.name,
        error: error.message,
      });

      this.metrics.endTimer(timer);

      return {
        analyzerId: analyzer.metadata.id,
        analyzerName: analyzer.metadata.name,
        results: [],
        duration: 0,
        success: false,
        error: error.message,
      };
    }
  }

  enableAnalyzer(analyzerId) {
    const analyzer = this.analyzers.get(analyzerId);
    if (!analyzer) return false;

    analyzer.enabled = true;
    return true;
  }

  disableAnalyzer(analyzerId) {
    const analyzer = this.analyzers.get(analyzerId);
    if (!analyzer) return false;

    analyzer.enabled = false;
    return true;
  }

  configureAnalyzer(analyzerId, config) {
    const analyzer = this.analyzers.get(analyzerId);
    if (!analyzer) return false;

    analyzer.config = { ...analyzer.config, ...config };

    if (typeof analyzer.instance.configure === 'function') {
      analyzer.instance.configure(config);
    }

    return true;
  }

  getRegistryStats() {
    const stats = {
      totalAnalyzers: this.analyzers.size,
      enabledAnalyzers: this.getEnabledAnalyzers().length,
      categories: {},
      totalFiles: 0,
    };

    for (const [category, analyzerIds] of this.categories) {
      stats.categories[category] = analyzerIds.size;
    }

    return stats;
  }

  async healthCheck() {
    const results = [];

    for (const analyzer of this.getEnabledAnalyzers()) {
      try {
        if (typeof analyzer.instance.healthCheck === 'function') {
          const health = await analyzer.instance.healthCheck();
          results.push({
            id: analyzer.metadata.id,
            name: analyzer.metadata.name,
            healthy: health.healthy || true,
            details: health.details || {},
          });
        }
      } catch (error) {
        results.push({
          id: analyzer.metadata.id,
          name: analyzer.metadata.name,
          healthy: false,
          error: error.message,
        });
      }
    }

    const allHealthy = results.every(r => r.healthy);

    return {
      healthy: allHealthy,
      analyzers: results,
      timestamp: new Date().toISOString(),
    };
  }

  async createAnalyzerTemplate(name, category = AnalyzerCategory.CORRECTNESS) {
    const template = `import BaseAnalyzer from '../baseAnalyzer.js';
import { AnalyzerCategory, SeverityLevel } from '../../interfaces/index.js';

export default class ${name}Analyzer extends BaseAnalyzer {
  constructor(config = {}) {
    super('${name.toLowerCase()}', config);
    this.name = '${name}';
    this.description = 'Analyzes code for ${name.toLowerCase()} issues';
    this.version = '1.0.0';
    this.categories = [${category}];
    this.supportedLanguages = ['javascript', 'typescript'];
    this.filePatterns = ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx'];
  }

  async analyze(files, context = {}) {
    const issues = [];

    for (const file of files) {
      const fileIssues = await this.analyzeFile(file.path, file.content, context);
      issues.push(...fileIssues);
    }

    return issues;
  }

  async analyzeFile(filePath, content, context = {}) {
    const issues = [];

    // TODO: Implement your analysis logic here
    // Example issue:
    /*
    issues.push(this.addIssue({
      severity: SeverityLevel.MEDIUM,
      type: '${name.toLowerCase()}-issue',
      title: 'Example Issue',
      message: 'This is an example issue found in the code',
      file: filePath,
      line: 1,
      column: 1,
      snippet: this.getCodeSnippet(content, 1).snippet,
      suggestion: 'Consider fixing this issue',
      confidence: 0.9,
      tags: ['${name.toLowerCase()}', 'example'],
    }));
    */

    return issues;
  }

  getName() {
    return this.name;
  }

  getDescription() {
    return this.description;
  }
}
`;

    return template;
  }
}

export default AnalyzerRegistry;

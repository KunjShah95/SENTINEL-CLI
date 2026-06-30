import Config from '../config/config.js';
import GitUtils from '../git/gitUtils.js';
import chalk from 'chalk';
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
import { getRuleEngine } from '../rules/rule-engine.js';

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
    this.gitUtils = new GitUtils();
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

      const ruleEngine = await getRuleEngine();
      const enabledAnalyzers = config.getAnalyzers();
      const analyzerMap = {
        security: SecurityAnalyzer,
        quality: QualityAnalyzer,
        bugs: BugAnalyzer,
        performance: PerformanceAnalyzer,
        dependency: DependencyAnalyzer,
        deps: DependencyAnalyzer,
        accessibility: AccessibilityAnalyzer,
        a11y: AccessibilityAnalyzer,
        typescript: TypeScriptAnalyzer,
        ts: TypeScriptAnalyzer,
        react: ReactAnalyzer,
        jsx: ReactAnalyzer,
        api: APISecurityAnalyzer,
        'api-security': APISecurityAnalyzer,
        secrets: EnvSecurityAnalyzer,
        env: EnvSecurityAnalyzer,
        docker: DockerAnalyzer,
        dockerfile: DockerAnalyzer,
      };

      const seen = new Set();
      for (const key of enabledAnalyzers) {
        const AnalyzerClass = analyzerMap[key];
        if (AnalyzerClass && !seen.has(AnalyzerClass)) {
          seen.add(AnalyzerClass);
          const instance = new AnalyzerClass(config);
          await instance.setRuleEngine(ruleEngine);
          this.analyzers.push(instance);
        }
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

    // Normalize files to objects { path, content }
    const normalizedFiles = [];
    const { readFileSync, existsSync, statSync } = await import('fs');
    const { join } = await import('path');
    const { globSync } = await import('glob');

    const EXCLUDE_DIRS = [
      'node_modules',
      '.git',
      'dist',
      'build',
      '.next',
      '.cache',
      'coverage',
      '.venv',
      'venv',
    ];

    for (const file of files) {
      const filePath = typeof file === 'string' ? file : file?.path;
      if (!filePath) continue;

      if (existsSync(filePath) && statSync(filePath).isDirectory()) {
        const matches = globSync(
          '**/*.{js,ts,jsx,tsx,mjs,cjs,json,yaml,yml,py,rs,go,java,kt,cs,cpp,c,h,hpp}',
          {
            cwd: filePath,
            nodir: true,
            ignore: EXCLUDE_DIRS.map(d => `**/${d}/**`),
          }
        );
        for (const m of matches) {
          const fullPath = join(filePath, m);
          try {
            const content = readFileSync(fullPath, 'utf-8');
            normalizedFiles.push({ path: fullPath, content });
          } catch {}
        }
      } else {
        try {
          const content = typeof file === 'object' && file?.content !== undefined
            ? file.content
            : readFileSync(filePath, 'utf-8');
          normalizedFiles.push({ path: filePath, content });
        } catch {}
      }
    }

    for (const analyzer of this.analyzers) {
      const analyzerTimer = this.metrics.startTimer(`analyzer.${analyzer.name}`);

      try {
        if (typeof analyzer.analyzeFiles === 'function') {
          const issues = await analyzer.analyzeFiles(normalizedFiles, {});
          allIssues.push(...issues);
        } else if (typeof analyzer.analyze === 'function') {
          const issues = await analyzer.analyze(normalizedFiles, {});
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

  async runAnalysis(options = {}) {
    const ora = (await import('ora')).default;
    const spinner = options.silent ? null : ora('Running code analysis...').start();

    try {
      // Get files to analyze
      const files = await this.getFilesToAnalyze(options);

      if (files.length === 0) {
        if (spinner) spinner.warn('No files to analyze');
        return { report: '', issues: [] };
      }

      if (spinner) spinner.text = `Analyzing ${files.length} files...`;

      // Run code review bot analysis
      const allIssues = await this.analyzeFiles(files, options);

      // Run SAST orchestrator if enabled
      if (options.sast !== false) {
        try {
          if (spinner) spinner.text = 'Running SAST analysis...';
          const { SastOrchestrator } = await import('../sast/sastOrchestrator.js');
          const orchestrator = new SastOrchestrator({
            config: options.sastConfig,
            cwd: process.cwd(),
            enabledTools: options.sastTools,
          });
          const filePaths = files.map(f => f.path);
          const sastResult = await orchestrator.analyze(filePaths);
          // Merge SAST findings into issues
          for (const finding of sastResult.findings) {
            allIssues.push({
              file: finding.file,
              line: finding.line,
              severity: finding.severity,
              category: 'sast',
              title: `[${finding.tool}] ${finding.rule || 'finding'}`,
              message: finding.message,
              suggestion: finding.suggestion,
              analyzer: 'sast-orchestrator',
              tool: finding.tool,
            });
          }
          if (spinner && sastResult.toolsRun.length > 0) {
            spinner.text = `SAST: ${sastResult.findings.length} findings from ${sastResult.toolsRun.join(', ')}`;
          }
        } catch (sastError) {
          if (spinner) spinner.text = 'SAST analysis skipped';
          console.warn(chalk.yellow('⚠') + ` SAST orchestrator: ${sastError.message}`);
        }
      }

      // Evaluate policies
      const policyResult = await this.evaluatePolicies(allIssues, options);

      // Generate report
      const report = await this.reportGenerator.generate(allIssues, {
        format: options.format || 'console',
        outputFile: options.output,
        includeSnippets: options.snippets !== false,
      });

      if (spinner) spinner.succeed('Analysis complete');

      // Display results
      if ((options.format === 'console' || !options.format) && !options.silent) {
        this.displayResults(allIssues);
      }

      return { report, issues: allIssues, policyResult };
    } catch (error) {
      if (spinner) spinner.fail('Analysis failed');
      throw error;
    }
  }

  async getFilesToAnalyze(options) {
    const files = [];
    const { promises: fs } = await import('fs');
    const path = await import('path');

    try {
      if (options.files && options.files.length > 0) {
        // Analyze specific files provided via CLI
        for (const filePath of options.files) {
          try {
            const absolutePath = path.resolve(filePath);
            const workspaceRoot = process.cwd();
            const relativePath = path.relative(workspaceRoot, absolutePath);

            if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
              console.warn(chalk.yellow('⚠') + ` Skipping file outside workspace: ${filePath}`);
              continue;
            }

            const content = await fs.readFile(absolutePath, 'utf8');
            files.push({
              path: relativePath, // Use relative path for reporting
              content: content,
              type: 'file',
            });
          } catch (error) {
            console.warn(chalk.yellow('⚠') + ` Could not read file ${filePath}: ${error.message}`);
          }
        }
      } else if (options.commit) {
        // Analyze specific commit
        const changes = await this.gitUtils.getCommitChanges(options.commit);
        const parsedFiles = this.gitUtils.parseDiff(changes.diff);

        for (const file of parsedFiles) {
          if (file.path !== 'unknown') {
            const content = await this.gitUtils.getFileContentAtCommit(file.path, options.commit);
            if (content) {
              files.push({
                path: file.path,
                content: content,
                type: 'commit',
              });
            }
          }
        }
      } else if (options.branch) {
        // Analyze branch changes
        const changes = await this.gitUtils.getBranchDiff('main', options.branch);
        const parsedFiles = this.gitUtils.parseDiff(changes.diff);

        for (const file of parsedFiles) {
          if (file.path !== 'unknown') {
            const content = await this.gitUtils.getFileContent(file.path);
            if (content) {
              files.push({
                path: file.path,
                content: content,
                type: 'branch',
              });
            }
          }
        }
      } else if (options.staged) {
        // Analyze staged changes
        const changes = await this.gitUtils.getStagedChanges();
        const parsedFiles = this.gitUtils.parseDiff(changes.diff);

        for (const file of parsedFiles) {
          if (file.path !== 'unknown') {
            try {
              const content = await this.gitUtils.git.show([`:${file.path}`]);
              files.push({
                path: file.path,
                content: content,
                type: 'staged',
              });
            } catch (e) {
              try {
                const content = await fs.readFile(file.path, 'utf8');
                files.push({
                  path: file.path,
                  content: content,
                  type: 'staged',
                });
              } catch (fsErr) {
                // Skip
              }
            }
          }
        }
      } else {
        // Analyze latest commit
        const changes = await this.gitUtils.getLatestCommitChanges();
        if (changes.files.length > 0) {
          const parsedFiles = this.gitUtils.parseDiff(changes.diff);

          for (const file of parsedFiles) {
            if (file.path !== 'unknown') {
              const content = await this.gitUtils.getFileContent(file.path);
              if (content) {
                files.push({
                  path: file.path,
                  content: content,
                  type: 'commit',
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn(chalk.yellow('⚠') + ` Could not get files from git: ${error.message}`);
      return [];
    }

    return files;
  }

  displayResults(issues) {
    if (issues.length === 0) {
      console.log(chalk.hex('#34A853')('\n✨ Clean Code! No issues detected. Great job! ✨\n'));
      return;
    }

    // Group issues by severity
    const groupedIssues = {
      critical: issues.filter(issue => issue.severity === 'critical'),
      high: issues.filter(issue => issue.severity === 'high'),
      medium: issues.filter(issue => issue.severity === 'medium'),
      low: issues.filter(issue => issue.severity === 'low'),
      info: issues.filter(issue => issue.severity === 'info'),
    };

    // Display summary
    console.log('\n' + chalk.bold.hex('#4285F4')('📊 Analysis Summary'));
    console.log(chalk.gray('──────────────────────────────────────────────────'));

    let total = 0;
    for (const [severity, group] of Object.entries(groupedIssues)) {
      if (group.length > 0) {
        total += group.length;
        const color = this.getSeverityColor(severity);
        const icon = this.getSeverityIcon(severity);
        console.log(
          `  ${icon} ${color(severity.toUpperCase().padEnd(8))} : ${chalk.bold(group.length)}`
        );
      }
    }
    console.log(chalk.gray('──────────────────────────────────────────────────'));
    console.log(`  📝 Total Issues : ${chalk.bold(total)}`);

    // Display detailed issues
    console.log('\n' + chalk.bold.hex('#9B72CB')('🔍 Detailed Findings'));

    for (const [severity, severityIssues] of Object.entries(groupedIssues)) {
      if (severityIssues.length === 0) continue;

      const color = this.getSeverityColor(severity);

      console.log(
        '\n' + color(`  ${this.getSeverityHeaderIcon(severity)} ${severity.toUpperCase()} ISSUES`)
      );

      for (const issue of severityIssues) {
        this.displayIssue(issue, color);
      }
    }

    // Display suggestions count
    const suggestions = issues.filter(issue => issue.suggestion).length;
    if (suggestions > 0) {
      console.log(
        '\n' +
        chalk.hex('#FBBC05')('💡 Optimization Tips') +
        chalk.gray(`: ${suggestions} suggestions available to improve your code.`)
      );
    }
    console.log('');
  }

  displayIssue(issue, color) {
    console.log(chalk.gray('  ┌── ' + '─'.repeat(45)));
    console.log(`  │ ${color('●')} ${chalk.bold.white(issue.title)}`);

    const location = `${issue.file}:${issue.line}${issue.column ? ':' + issue.column : ''}`;
    console.log(`  │ 📂 ${chalk.cyan(location)}`);
    console.log(`  │ 💬 ${chalk.white(issue.message)}`);
    console.log(`  │ 🏷️  ${chalk.dim(issue.type)} | ${chalk.dim(issue.analyzer)}`);

    if (issue.snippet && issue.snippet.length > 0) {
      console.log('  │');
      console.log(`  │ ${chalk.dim('Code Context:')}`);
      issue.snippet.split('\n').forEach(line => {
        console.log(`  │ ${chalk.gray(line)}`);
      });
    }

    if (issue.suggestion) {
      console.log('  │');
      console.log(`  │ ✨ ${chalk.hex('#34A853')('Suggestion:')} ${chalk.white(issue.suggestion)}`);
    }

    console.log(chalk.gray('  └── ' + '─'.repeat(45)));
  }

  getSeverityColor(severity) {
    const colors = {
      critical: chalk.hex('#EA4335'), // Google Red
      high: chalk.hex('#FBBC05'), // Google Yellow/Orangeish
      medium: chalk.hex('#4285F4'), // Google Blue
      low: chalk.hex('#34A853'), // Google Green
      info: chalk.hex('#9AA0A6'), // Google Grey
    };
    return colors[severity] || chalk.gray;
  }

  getSeverityIcon(severity) {
    const icons = {
      critical: '🛑',
      high: '🔶',
      medium: '🔷',
      low: '🟢',
      info: 'ℹ️ ',
    };
    return icons[severity] || 'ℹ️ ';
  }

  getSeverityHeaderIcon(severity) {
    const icons = {
      critical: '🚫',
      high: '⚠️ ',
      medium: '⚡',
      low: '✅',
      info: '📝',
    };
    return icons[severity] || '•';
  }
}
export default CodeReviewBot;


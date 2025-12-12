import chalk from 'chalk';
import ora from 'ora';
import { promises as fs } from 'fs';
import path from 'path';

import Config from './config/config.js';
import GitUtils from './git/gitUtils.js';
import { SecurityAnalyzer } from './analyzers/securityAnalyzer.js';
import { QualityAnalyzer } from './analyzers/qualityAnalyzer.js';
import { BugAnalyzer } from './analyzers/bugAnalyzer.js';
import { PerformanceAnalyzer } from './analyzers/performanceAnalyzer.js';
import { DependencyAnalyzer } from './analyzers/dependencyAnalyzer.js';
import { AccessibilityAnalyzer } from './analyzers/accessibilityAnalyzer.js';
import { AIAnalyzer } from './analyzers/aiAnalyzer.js';
import ReportGenerator from './output/reportGenerator.js';

const config = new Config();
const gitUtils = new GitUtils();

export class CodeReviewBot {
  constructor() {
    this.analyzers = [];
    this.reportGenerator = new ReportGenerator();
  }

  async initialize() {
    try {
      await config.load();
      await config.validate();

      // Initialize analyzers
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

      // NEW: Dependency vulnerability analyzer
      if (enabledAnalyzers.includes('dependency') || enabledAnalyzers.includes('deps')) {
        this.analyzers.push(new DependencyAnalyzer(config));
      }

      // NEW: Accessibility (a11y) analyzer
      if (enabledAnalyzers.includes('accessibility') || enabledAnalyzers.includes('a11y')) {
        this.analyzers.push(new AccessibilityAnalyzer(config));
      }

      // Initialize AI Analyzer if enabled in config
      const aiConfig = config.get('ai');
      if (aiConfig && aiConfig.enabled) {
        this.analyzers.push(new AIAnalyzer(config));
      }
    } catch (error) {
      console.error(chalk.red('✗') + ` Failed to initialize: ${error.message}`);
      throw error;
    }
  }

  async runAnalysis(options = {}) {
    const spinner = options.silent ? null : ora('Running code analysis...').start();

    try {
      // Get files to analyze
      const files = await this.getFilesToAnalyze(options);

      if (files.length === 0) {
        if (spinner) spinner.warn('No files to analyze');
        return [];
      }

      if (spinner) spinner.text = `Analyzing ${files.length} files...`;

      // Run all analyzers
      const allIssues = [];

      for (const analyzer of this.analyzers) {
        const issues = await analyzer.analyze(files, {
          commit: options.commit,
          branch: options.branch,
          staged: options.staged,
        });

        allIssues.push(...issues);
        if (spinner) spinner.text = `${analyzer.getName()}: ${issues.length} issues found`;
      }

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

      return { report, issues: allIssues };
    } catch (error) {
      if (spinner) spinner.fail('Analysis failed');
      throw error;
    }
  }

  async getFilesToAnalyze(options) {
    const files = [];

    try {
      if (options.files && options.files.length > 0) {
        // Analyze specific files provided via CLI
        for (const filePath of options.files) {
          try {
            const absolutePath = path.resolve(filePath);
            const content = await fs.readFile(absolutePath, 'utf8');
            files.push({
              path: filePath, // Keep relative path for reporting
              content: content,
              type: 'file',
            });
          } catch (error) {
            console.warn(chalk.yellow('⚠') + ` Could not read file ${filePath}: ${error.message}`);
          }
        }
      } else if (options.commit) {
        // Analyze specific commit
        const changes = await gitUtils.getCommitChanges(options.commit);
        const parsedFiles = gitUtils.parseDiff(changes.diff);

        for (const file of parsedFiles) {
          // Skip deleted files or unknown
          if (file.path !== 'unknown') {
            const content = await gitUtils.getFileContentAtCommit(file.path, options.commit);
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
        const changes = await gitUtils.getBranchDiff('main', options.branch);
        const parsedFiles = gitUtils.parseDiff(changes.diff);

        for (const file of parsedFiles) {
          if (file.path !== 'unknown') {
            const content = await gitUtils.getFileContent(file.path);
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
        const changes = await gitUtils.getStagedChanges();
        const parsedFiles = gitUtils.parseDiff(changes.diff);

        for (const file of parsedFiles) {
          if (file.path !== 'unknown') {
            try {
              const content = await gitUtils.git.show([`:${file.path}`]);
              files.push({
                path: file.path,
                content: content,
                type: 'staged',
              });
            } catch (e) {
              // Fallback if index lookup fails, try FS but warn
              try {
                const content = await fs.readFile(file.path, 'utf8');
                files.push({
                  path: file.path,
                  content: content,
                  type: 'staged',
                });
              } catch (fsErr) {
                // Fallback read failed, skip this file
              }
            }
          }
        }
      } else {
        // Analyze latest commit
        const changes = await gitUtils.getLatestCommitChanges();
        if (changes.files.length > 0) {
          const parsedFiles = gitUtils.parseDiff(changes.diff);

          for (const file of parsedFiles) {
            if (file.path !== 'unknown') {
              const content = await gitUtils.getFileContent(file.path);
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

    // Filter files based on configuration
    return files.filter(file => {
      if (this.analyzers.length > 0) {
        return this.analyzers[0].shouldAnalyzeFile(file.path);
      }
      return true;
    });
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

    // File location
    const location = `${issue.file}:${issue.line}${issue.column ? ':' + issue.column : ''}`;
    console.log(`  │ 📂 ${chalk.cyan(location)}`);

    // Message
    console.log(`  │ 💬 ${chalk.white(issue.message)}`);

    // Type/Analyzer info
    console.log(`  │ 🏷️  ${chalk.dim(issue.type)} | ${chalk.dim(issue.analyzer)}`);

    // Code Snippet
    if (issue.snippet && issue.snippet.length > 0) {
      console.log('  │');
      console.log(`  │ ${chalk.dim('Code Context:')}`);
      issue.snippet.split('\n').forEach(line => {
        console.log(`  │ ${chalk.gray(line)}`);
      });
    }

    // Suggestion
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

  async setupConfiguration() {
    const inquirer = (await import('inquirer')).default;

    const basicQuestions = [
      {
        type: 'checkbox',
        name: 'analyzers',
        message: 'Which analyzers would you like to enable?',
        choices: [
          { name: 'Security Analyzer (detects vulnerabilities)', value: 'security', checked: true },
          { name: 'Quality Analyzer (checks code quality)', value: 'quality', checked: true },
          { name: 'Bug Analyzer (finds common bugs)', value: 'bugs', checked: true },
          {
            name: 'Performance Analyzer (identifies performance issues)',
            value: 'performance',
            checked: true,
          },
          {
            name: 'Dependency Analyzer (scans for vulnerable packages)',
            value: 'dependency',
            checked: true,
          },
          {
            name: 'Accessibility Analyzer (WCAG compliance checks)',
            value: 'accessibility',
            checked: false,
          },
        ],
      },
      {
        type: 'confirm',
        name: 'blocking',
        message: 'Should the bot block commits with critical issues?',
        default: false,
      },
      {
        type: 'list',
        name: 'format',
        message: 'Default output format?',
        choices: [
          { name: 'Console (colored text output)', value: 'console', checked: true },
          { name: 'JSON (machine-readable)', value: 'json' },
          { name: 'HTML (web report)', value: 'html' },
          { name: 'Markdown (documentation)', value: 'markdown' },
        ],
        default: 'console',
      },
      {
        type: 'confirm',
        name: 'enableAI',
        message: 'Enable AI Analysis?',
        default: false,
      },
    ];

    const answers = await inquirer.prompt(basicQuestions);

    let aiSettings = {};
    if (answers.enableAI) {
      const aiQuestions = [
        {
          type: 'list',
          name: 'provider',
          message: 'Select AI Provider (set the matching environment variable separately):',
          choices: [
            { name: 'OpenAI (GPT-3.5/4) - OPENAI_API_KEY', value: 'openai' },
            { name: 'Anthropic (Claude) - ANTHROPIC_API_KEY', value: 'anthropic' },
            { name: 'Google (Gemini) - GEMINI_API_KEY', value: 'gemini' },
            { name: 'Groq (Llama3/Mixtral) - GROQ_API_KEY', value: 'groq' },
            { name: 'OpenRouter (Various Models) - OPENROUTER_API_KEY', value: 'openrouter' },
          ],
          default: 'openai',
        },
      ];
      aiSettings = await inquirer.prompt(aiQuestions);

      // Security reminder about API keys
      console.log('');
      console.log(chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log(chalk.yellow.bold('⚠️  IMPORTANT: Store your API key in a .env file!'));
      console.log(chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log('');
      console.log(chalk.white('  1. Copy .env.example to .env:'));
      console.log(chalk.cyan('     cp .env.example .env'));
      console.log('');
      console.log(
        chalk.white(`  2. Add your ${aiSettings.provider.toUpperCase()} API key to the .env file:`)
      );

      const envVarMap = {
        openai: 'OPENAI_API_KEY',
        anthropic: 'ANTHROPIC_API_KEY',
        gemini: 'GEMINI_API_KEY',
        groq: 'GROQ_API_KEY',
        openrouter: 'OPENROUTER_API_KEY',
      };
      console.log(chalk.cyan(`     ${envVarMap[aiSettings.provider]}=your-api-key-here`));
      console.log('');
      console.log(chalk.red.bold('  ❌ NEVER hardcode API keys in your source code!'));
      console.log(chalk.green.bold('  ✅ Always use environment variables from .env files.'));
      console.log('');
    }

    // Update configuration
    config.set('analysis.enabledAnalyzers', answers.analyzers);
    config.set('integrations.precommit.blocking', answers.blocking);
    config.set('output.format', answers.format);

    if (answers.enableAI) {
      config.set('ai.enabled', true);
      config.set('ai.provider', aiSettings.provider);

      // Set default models based on provider
      let model = 'gpt-3.5-turbo';
      if (aiSettings.provider === 'anthropic') model = 'claude-3-opus-20240229';
      if (aiSettings.provider === 'gemini') model = 'gemini-pro';
      if (aiSettings.provider === 'groq') model = 'llama3-70b-8192';

      config.set('ai.model', model);
    } else {
      config.set('ai.enabled', false);
    }

    await config.save();
    console.log(chalk.green('✓') + ' Configuration saved successfully!');
    return true;
  }

  async showStats() {
    const stats = await gitUtils.getRepositoryStats();
    const totalIssues = await this.getTotalIssuesCount();
    return { stats, totalIssues };
  }

  async getTotalIssuesCount() {
    try {
      if (this.analyzers.length === 0) return 0;

      const files = await this.getFilesToAnalyze({});
      let totalIssues = 0;

      for (const analyzer of this.analyzers) {
        // Skip AI for quick stats as it costs money
        if (analyzer.getName() === 'AIAnalyzer') continue;

        await analyzer.analyze(files, {});
        totalIssues += analyzer.getIssues().length;
      }

      return totalIssues;
    } catch (error) {
      return 0;
    }
  }
}

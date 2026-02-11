import chalk from 'chalk';
import ora from 'ora';
import { promises as fs } from 'fs';
import path from 'path';
import { CodeReviewBot } from '../bot.js';

export async function runParallelAnalysis(targetPath, options = {}) {
  const spinner = ora('Initializing parallel analysis...').start();

  try {
    const bot = new CodeReviewBot();
    const initialized = await bot.initialize();

    if (!initialized) {
      spinner.fail('Failed to initialize bot');
      process.exit(1);
    }

    spinner.text = 'Discovering files...';

    const files = await discoverFiles(targetPath, options);

    if (files.length === 0) {
      spinner.warn('No files to analyze');
      return;
    }

    spinner.text = `Analyzing ${files.length} files with ${options.workers || 4} workers...`;

    const startTime = Date.now();

    const issues = await bot.analyzeFiles(files, {
      parallel: true,
      reduceFalsePositives: options.reduceFalsePositives !== false,
      timeout: options.timeout || 60000,
    });

    const duration = Date.now() - startTime;

    spinner.succeed(`Analysis complete in ${duration}ms`);

    displayResults(issues, options);

    const metrics = bot.getMetrics();
    console.log('\n' + chalk.gray('Performance Metrics:'));
    console.log(`  Workers: ${metrics.parallelProcessor?.activeWorkers || 0}`);
    console.log(`  Tasks: ${metrics.parallelProcessor?.tasksSubmitted || 0}`);
    console.log(`  Avg Time: ${metrics.parallelProcessor?.avgProcessingTime || 0}ms`);

    await bot.shutdown();

  } catch (error) {
    spinner.fail(`Analysis failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

async function discoverFiles(targetPath, options) {
  const files = [];
  const extensions = options.extensions || ['.js', '.ts', '.jsx', '.tsx'];

  try {
    const entries = await fs.readdir(targetPath, { withFileTypes: true, recursive: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          const filePath = path.join(entry.parentPath || targetPath, entry.name);
          const content = await fs.readFile(filePath, 'utf8');
          files.push({ path: filePath, content });
        }
      }
    }
  } catch (error) {
    console.error('Error discovering files:', error.message);
  }

  return files;
}

function displayResults(result, options) {
  if (typeof result === 'object' && result.issues) {
    const { issues, suppressed, statistics } = result;

    console.log('\n' + chalk.bold('═'.repeat(60)));
    console.log(chalk.bold('Analysis Results'));
    console.log(chalk.bold('═'.repeat(60)));

    console.log(`\n${chalk.green('✓')} Found ${issues.length} issues`);

    if (suppressed && suppressed.length > 0) {
      console.log(`${chalk.yellow('⚠')} Suppressed ${suppressed.length} false positives`);
    }

    if (statistics) {
      console.log(`\n${chalk.gray('False Positive Rate:')} ${statistics.falsePositiveRate || 0}%`);
    }

    if (options.verbose && issues.length > 0) {
      console.log('\n' + chalk.bold('Issues:'));
      issues.slice(0, 20).forEach((issue, idx) => {
        const severityColor = {
          critical: chalk.red,
          high: chalk.red,
          medium: chalk.yellow,
          low: chalk.blue,
          info: chalk.gray,
        }[issue.severity] || chalk.white;

        console.log(`\n${idx + 1}. ${severityColor(issue.severity.toUpperCase())} - ${issue.message}`);
        console.log(`   File: ${chalk.cyan(issue.file)}:${issue.line}`);
        if (issue.suggestion) {
          console.log(`   Suggestion: ${chalk.green(issue.suggestion)}`);
        }
      });

      if (issues.length > 20) {
        console.log(`\n${chalk.gray(`... and ${issues.length - 20} more issues`)}`);
      }
    }
  } else {
    console.log(`\n${chalk.green('✓')} Found ${result.length} issues`);
  }
}

export async function showParallelStatus() {
  console.log(chalk.bold('\nParallel Processing Status\n'));

  const bot = new CodeReviewBot();

  try {
    await bot.initialize();
    const metrics = bot.getMetrics();

    console.log(`${chalk.bold('Status:')} ${metrics.isInitialized ? chalk.green('Active') : chalk.red('Inactive')}`);
    console.log(`${chalk.bold('Analyzers:')} ${metrics.analyzerCount}`);

    if (metrics.parallelProcessor) {
      console.log(`\n${chalk.bold('Worker Metrics:')}`);
      console.log(`  Active Workers: ${metrics.parallelProcessor.activeWorkers}`);
      console.log(`  Busy Workers: ${metrics.parallelProcessor.busyWorkers}`);
      console.log(`  Queued Tasks: ${metrics.parallelProcessor.queuedTasks}`);
      console.log(`  Tasks Submitted: ${metrics.parallelProcessor.tasksSubmitted}`);
      console.log(`  Tasks Completed: ${metrics.parallelProcessor.tasksCompleted}`);
      console.log(`  Tasks Failed: ${metrics.parallelProcessor.tasksFailed}`);
      console.log(`  Avg Processing Time: ${metrics.parallelProcessor.avgProcessingTime}ms`);
    }

    if (metrics.falsePositiveReducer) {
      console.log(`\n${chalk.bold('False Positive Reduction:')}`);
      console.log(`  Tracked Types: ${metrics.falsePositiveReducer.trackedIssueTypes}`);
      console.log(`  FP Rate: ${metrics.falsePositiveReducer.falsePositiveRate}%`);
      console.log(`  Feedback Count: ${metrics.falsePositiveReducer.feedbackCount}`);
    }

    await bot.shutdown();
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
  }
}

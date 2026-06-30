import chalk from 'chalk';
import readline from 'readline';

export class ProgressBar {
  constructor(options = {}) {
    this.width = options.width || 40;
    this.current = options.current || 0;
    this.total = options.total || 100;
    this.label = options.label || 'Progress';
    this.startTime = Date.now();
  }

  update(current, label) {
    this.current = current;
    if (label) this.label = label;
    this.render();
  }

  increment(label) {
    this.current++;
    if (label) this.label = label;
    this.render();
  }

  render() {
    const percent = Math.min(100, Math.round((this.current / this.total) * 100));
    const filled = Math.round((percent / 100) * this.width);
    const empty = this.width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    const elapsed = Date.now() - this.startTime;
    const rate = this.current / (elapsed / 1000);
    const remaining = this.total - this.current;
    const eta = remaining / rate;

    const etaStr = isFinite(eta) ? `· ${Math.round(eta)}s remaining` : '';

    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);

    process.stdout.write(
      chalk.cyan(this.label) +
            ' [' + chalk.green(bar) + '] ' +
            chalk.white(`${this.current}/${this.total}`) +
            chalk.gray(` (${percent}%) ${etaStr}`)
    );
  }

  complete(message = 'Done') {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    console.log(chalk.green('✓ ') + this.label + ' ' + message + '\n');
  }

  fail(message = 'Failed') {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    console.log(chalk.red('✗ ') + this.label + ' ' + message + '\n');
  }
}

export class StreamingAnalyzer {
  constructor(options = {}) {
    this.projectPath = options.projectPath || process.cwd();
    this.progress = null;
    this.issues = [];
  }

  async analyzeWithProgress(files, analyzers) {
    this.progress = new ProgressBar({
      label: 'Analyzing',
      total: files.length
    });

    console.log('');

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      this.progress.update(i + 1, `Analyzing ${file.slice(0, 30)}`);

      try {
        const fileIssues = await this.analyzeFile(file, analyzers);
        this.issues.push(...fileIssues);
      } catch (e) {
        // Skip problematic files
      }
    }

    this.progress.complete(`${this.issues.length} issues found`);

    return this.issues;
  }

  async analyzeFile(_file, _analyzers) {
    return [];
  }

  displayLiveIssues(issues) {
    const critical = issues.filter(i => i.severity === 'critical');
    const high = issues.filter(i => i.severity === 'high');

    if (critical.length > 0) {
      console.log(chalk.red(`\n  🔴 ${critical.length} critical issue(s) found!`));
    }
    if (high.length > 0) {
      console.log(chalk.yellow(`  🟠 ${high.length} high severity issue(s) found`));
    }
  }
}

export function createSpinner(label) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frame = 0;
  let interval;

  return {
    start: () => {
      interval = setInterval(() => {
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(chalk.cyan(frames[frame++ % frames.length]) + ' ' + label);
      }, 80);
    },
    succeed: (msg = 'Done') => {
      clearInterval(interval);
      readline.clearLine(process.stdout, 0);
      console.log(chalk.green('✓ ') + label + ' ' + msg);
    },
    fail: (msg = 'Failed') => {
      clearInterval(interval);
      readline.clearLine(process.stdout, 0);
      console.log(chalk.red('✗ ') + label + ' ' + msg);
    },
    update: (newLabel) => {
      label = newLabel;
    }
  };
}

export default { ProgressBar, StreamingAnalyzer, createSpinner };

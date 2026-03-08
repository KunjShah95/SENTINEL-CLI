import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { glob } from 'glob';

const execAsync = promisify(exec);

/**
 * Linter - Integrated linter with auto-fix capability
 * Supports: ESLint, Prettier, Stylelint, HTMLHint
 */
export class Linter {
  constructor(projectPath = process.cwd()) {
    this.projectPath = projectPath;
    this.supportedLinters = ['eslint', 'prettier', 'stylelint', 'htmlhint'];
    this.fixTypes = {
      eslint: ['--fix'],
      prettier: ['--write'],
      stylelint: ['--fix']
    };
  }

  /**
   * Detect which linter(s) are configured
   */
  async detectLinters() {
    const found = [];

    try {
      const packageJsonPath = path.join(this.projectPath, 'package.json');
      if (await this.fileExists(packageJsonPath)) {
        const pkg = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        const scripts = pkg.scripts || {};

        // Check ESLint
        if (deps.eslint || scripts.lint?.includes('eslint') ||
            fs.existsSync(path.join(this.projectPath, '.eslintrc.js')) ||
            fs.existsSync(path.join(this.projectPath, '.eslintrc.cjs')) ||
            fs.existsSync(path.join(this.projectPath, '.eslintrc.yaml')) ||
            fs.existsSync(path.join(this.projectPath, '.eslintrc.yml')) ||
            fs.existsSync(path.join(this.projectPath, 'eslint.config.js'))) {
          found.push({ name: 'eslint', config: pkg.eslintConfig || {} });
        }

        // Check Prettier
        if (deps.prettier || scripts.format?.includes('prettier') ||
            fs.existsSync(path.join(this.projectPath, '.prettierrc')) ||
            fs.existsSync(path.join(this.projectPath, '.prettierrc.json')) ||
            fs.existsSync(path.join(this.projectPath, '.prettierrc.yaml')) ||
            fs.existsSync(path.join(this.projectPath, '.prettierrc.yml')) ||
            fs.existsSync(path.join(this.projectPath, '.prettierignore')) ||
            pkg.prettier) {
          found.push({ name: 'prettier', config: pkg.prettier || {} });
        }

        // Check Stylelint
        if (deps.stylelint || scripts.lint?.includes('stylelint') ||
            fs.existsSync(path.join(this.projectPath, '.stylelintrc')) ||
            fs.existsSync(path.join(this.projectPath, '.stylelintrc.json')) ||
            fs.existsSync(path.join(this.projectPath, '.stylelintrc.yaml')) ||
            fs.existsSync(path.join(this.projectPath, '.stylelintrc.yml')) ||
            fs.existsSync(path.join(this.projectPath, 'stylelint.config.js'))) {
          found.push({ name: 'stylelint', config: pkg.stylelint || {} });
        }

        // Check HTMLHint
        if (deps.htmlhint || scripts.lint?.includes('htmlhint') ||
            fs.existsSync(path.join(this.projectPath, '.htmlhintrc'))) {
          found.push({ name: 'htmlhint', config: {} });
        }

        // Check TypeScript ESLint
        if (deps['@typescript-eslint/parser'] || deps['@typescript-eslint/eslint-plugin']) {
          found.push({ name: 'typescript-eslint', config: {} });
        }
      }
    } catch (error) {
      console.error('Error detecting linters:', error.message);
    }

    // Default to ESLint if no linters found
    if (found.length === 0) {
      found.push({ name: 'eslint', config: {} });
    }

    return found;
  }

  /**
   * Check if a file exists
   */
  async fileExists(filepath) {
    try {
      await fs.promises.access(filepath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get files to lint
   */
  async getFilesToLint(patterns = ['**/*.{js,jsx,ts,tsx}'], options = {}) {
    try {
      const files = await glob(patterns, {
        cwd: this.projectPath,
        ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**'],
        ...options
      });
      return files;
    } catch {
      return [];
    }
  }

  /**
   * Run ESLint
   */
  async runESLint(options = {}) {
    const { fix = false, format = 'json' } = options;
    const args = ['eslint', ...this.getESLintArgs(fix, format)];

    try {
      const { stdout: stdoutVal } = await execAsync(`npx ${args.join(' ')}`, {
        cwd: this.projectPath,
        maxBuffer: 50 * 1024 * 1024,
        timeout: 300000
      });

      return this.parseESLintOutput(stdoutVal, format);
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.code || 1
      };
    }
  }

  /**
   * Get ESLint command arguments
   */
  getESLintArgs(fix, format) {
    const args = [];

    if (fix) {
      args.push('--fix');
    }

    if (format === 'json') {
      args.push('--format', 'json');
    } else if (format === 'stylish') {
      args.push('--format', 'stylish');
    } else if (format === 'unix') {
      args.push('--format', 'unix');
    } else {
      args.push('--format', 'json');
    }

    args.push('.', '--ext', '.js,.jsx,.ts,.tsx');

    return args;
  }

  /**
   * Parse ESLint output
   */
  parseESLintOutput(output, format) {
    try {
      if (format === 'json') {
        const results = JSON.parse(output);
        const filesWithIssues = results.filter(r => r.errorCount > 0 || r.warningCount > 0);

        return {
          success: filesWithIssues.length === 0,
          framework: 'eslint',
          summary: {
            files: results.length,
            errors: results.reduce((sum, r) => sum + r.errorCount, 0),
            warnings: results.reduce((sum, r) => sum + r.warningCount, 0)
          },
          issues: this.flattenESLintIssues(results),
          output
        };
      }

      return {
        success: true,
        framework: 'eslint',
        output
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse ESLint output: ${error.message}`,
        output
      };
    }
  }

  /**
   * Flatten ESLint issues
   */
  flattenESLintIssues(results) {
    const issues = [];

    for (const file of results) {
      for (const msg of file.messages) {
        issues.push({
          severity: msg.severity === 2 ? 'error' : 'warning',
          message: msg.message,
          ruleId: msg.ruleId || '',
          file: file.filePath,
          line: msg.line || 0,
          column: msg.column || 0,
          source: msg.source || ''
        });
      }
    }

    return issues;
  }

  /**
   * Run Prettier
   */
  async runPrettier(options = {}) {
    const { fix = false } = options;
    const args = ['prettier', '--check'];

    if (fix) {
      args.push('--write');
    }

    args.push('**/*.{js,jsx,ts,tsx,json,css,scss,md,yaml,yml}');

    try {
      const { stdout, stderr } = await execAsync(`npx ${args.join(' ')}`, {
        cwd: this.projectPath,
        maxBuffer: 50 * 1024 * 1024,
        timeout: 300000
      });

      return {
        success: stderr === '',
        framework: 'prettier',
        output: stdout + stderr,
        filesFormatted: stdout.includes('formatted') ? this.countFiles(stdout) : 0
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || ''
      };
    }
  }

  /**
   * Count formatted files from Prettier output
   */
  countFiles(output) {
    const match = output.match(/(\d+) files?/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Run stylelint
   */
  async runStylelint(options = {}) {
    const { fix = false } = options;
    const args = ['stylelint'];

    if (fix) {
      args.push('--fix');
    }

    args.push('**/*.{css,scss,less}');

    try {
      const { stdout, stderr } = await execAsync(`npx ${args.join(' ')}`, {
        cwd: this.projectPath,
        maxBuffer: 50 * 1024 * 1024,
        timeout: 300000
      });

      return {
        success: stderr === '',
        framework: 'stylelint',
        output: stdout + stderr
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || ''
      };
    }
  }

  /**
   * Run all configured linters
   */
  async runAll(options = {}) {
    const { fix = false } = options;
    const linters = await this.detectLinters();
    const results = [];

    for (const linter of linters) {
      let result;

      switch (linter.name) {
        case 'eslint':
        case 'typescript-eslint':
          result = await this.runESLint({ fix, format: 'json' });
          break;
        case 'prettier':
          result = await this.runPrettier({ fix });
          break;
        case 'stylelint':
          result = await this.runStylelint({ fix });
          break;
        case 'htmlhint':
          result = await this.runHTMLHint({ fix });
          break;
        default:
          result = { success: false, error: `Unknown linter: ${linter.name}` };
      }

      results.push({
        linter: linter.name,
        ...result
      });
    }

    const hasErrors = results.some(r => !r.success);

    return {
      success: !hasErrors,
      results
    };
  }

  /**
   * Run HTMLHint
   */
  async runHTMLHint(_options = {}) {
    const args = ['htmlhint'];

    try {
      const { stdout, stderr } = await execAsync(`npx ${args.join(' ')}`, {
        cwd: this.projectPath,
        maxBuffer: 50 * 1024 * 1024,
        timeout: 300000
      });

      return {
        success: stderr === '',
        framework: 'htmlhint',
        output: stdout + stderr
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || ''
      };
    }
  }

  /**
   * Auto-fix linting issues
   */
  async autoFix() {
    const linters = await this.detectLinters();
    const fixes = [];

    for (const linter of linters) {
      if (this.fixTypes[linter.name]) {
        let result;

        switch (linter.name) {
          case 'eslint':
            result = await this.runESLint({ fix: true, format: 'json' });
            break;
          case 'prettier':
            result = await this.runPrettier({ fix: true });
            break;
          case 'stylelint':
            result = await this.runStylelint({ fix: true });
            break;
          default:
            result = { success: false, error: `Auto-fix not supported for ${linter.name}` };
        }

        fixes.push({
          linter: linter.name,
          ...result
        });
      }
    }

    const hasErrors = fixes.some(f => !f.success);

    return {
      success: !hasErrors,
      fixes
    };
  }

  /**
   * Format a specific file
   */
  async formatFile(filePath, options = {}) {
    const { linter = 'prettier' } = options;

    try {
      let command;

      switch (linter) {
        case 'prettier':
          command = `npx prettier --write "${filePath}"`;
          break;
        case 'eslint':
          command = `npx eslint --fix "${filePath}"`;
          break;
        case 'stylelint':
          command = `npx stylelint --fix "${filePath}"`;
          break;
        default:
          return { success: false, error: `Unknown linter: ${linter}` };
      }

      const { stdout, stderr } = await execAsync(command, {
        cwd: this.projectPath,
        maxBuffer: 10 * 1024 * 1024
      });

      return {
        success: stderr === '',
        linter,
        output: stdout + stderr
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get linting report
   */
  async getReport(options = {}) {
    const { fix = false } = options;

    const result = await this.runAll({ fix });

    if (result.success) {
      return {
        success: true,
        message: 'All linting checks passed!',
        summary: this.summarizeResults(result.results)
      };
    }

    return {
      success: false,
      message: 'Linting found issues',
      summary: this.summarizeResults(result.results),
      results: result.results
    };
  }

  /**
   * Summarize linting results
   */
  summarizeResults(results) {
    const summary = {
      totalLinters: results.length,
      passed: 0,
      failed: 0,
      totalErrors: 0,
      totalWarnings: 0
    };

    for (const result of results) {
      if (result.success) {
        summary.passed++;
      } else {
        summary.failed++;
      }

      if (result.summary) {
        summary.totalErrors += result.summary.errors || 0;
        summary.totalWarnings += result.summary.warnings || 0;
      }
    }

    return summary;
  }
}

export default Linter;

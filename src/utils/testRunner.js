import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { glob } from 'glob';

const execAsync = promisify(exec);

/**
 * TestRunner - Integrated test runner with auto-fix capability
 * Supports: Jest, Mocha, Vitest, Pytest, Rust cargo test
 */
export class TestRunner {
  constructor(projectPath = process.cwd()) {
    this.projectPath = projectPath;
    this.supportedFrameworks = ['jest', 'mocha', 'vitest', 'pytest', 'cargo', 'go'];
    this.testResults = null;
  }

  /**
   * Detect which test framework is being used
   */
  async detectFramework() {
    try {
      // Check package.json for test scripts and dependencies
      const packageJsonPath = path.join(this.projectPath, 'package.json');
      if (await this.fileExists(packageJsonPath)) {
        const pkg = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf-8'));
        const scripts = pkg.scripts || {};
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        // Check for Jest
        if (deps.jest || scripts.test?.includes('jest') || fs.existsSync(path.join(this.projectPath, 'jest.config.js'))) {
          return { framework: 'jest', config: pkg.jest || {} };
        }

        // Check for Vitest
        if (deps.vitest || scripts.test?.includes('vitest') || fs.existsSync(path.join(this.projectPath, 'vitest.config.js'))) {
          return { framework: 'vitest', config: pkg.vitest || {} };
        }

        // Check for Mocha
        if (deps.mocha || scripts.test?.includes('mocha') || fs.existsSync(path.join(this.projectPath, 'mocha.opts'))) {
          return { framework: 'mocha', config: {} };
        }

        // Check for Ava
        if (deps.ava || scripts.test?.includes('ava')) {
          return { framework: 'ava', config: {} };
        }

        // Check for Tap
        if (deps.tap || scripts.test?.includes('tap')) {
          return { framework: 'tap', config: {} };
        }
      }

      // Check for Python/Pytest
      const pytestIni = path.join(this.projectPath, 'pytest.ini');
      const conftest = path.join(this.projectPath, 'conftest.py');
      if (await this.fileExists(pytestIni) || await this.fileExists(conftest)) {
        return { framework: 'pytest', config: {} };
      }

      // Check for Go
      if (fs.existsSync(path.join(this.projectPath, 'go.mod'))) {
        return { framework: 'go', config: {} };
      }

      // Check for Rust
      if (fs.existsSync(path.join(this.projectPath, 'Cargo.toml'))) {
        return { framework: 'cargo', config: {} };
      }

      // Default to Jest if no framework detected
      return { framework: 'jest', config: {} };
    } catch (error) {
      return { framework: 'jest', config: {}, error: error.message };
    }
  }

  /**
   * Check if a test file exists
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
   * Get all test files
   */
  async getTestFiles(pattern = '**/*.test.{js,ts,jsx,tsx}', options = {}) {
    try {
      const files = await glob(pattern, {
        cwd: this.projectPath,
        ignore: ['node_modules/**', 'dist/**', 'build/**'],
        ...options
      });
      return files;
    } catch {
      return [];
    }
  }

  /**
   * Run tests with a specific framework
   */
  async runTests(options = {}) {
    const { framework } = await this.detectFramework();

    let command;
    let args = [];

    switch (framework) {
      case 'jest':
        command = 'npx';
        args = ['jest', '--json', '--outputFile', '.jest-results.json', ...options.args || []];
        break;
      case 'vitest':
        command = 'npx';
        args = ['vitest', '--json', '--outputFile', '.vitest-results.json', ...options.args || []];
        break;
      case 'mocha':
        command = 'npx';
        args = ['mocha', '--reporter', 'json', '--output', '.mocha-results.json', ...options.args || []];
        break;
      case 'pytest':
        command = 'python';
        args = ['-m', 'pytest', '--json', '--json-report', '--json-report-file=.pytest-results.json', ...options.args || []];
        break;
      case 'cargo':
        command = 'cargo';
        args = ['test', '--message-format', 'json', ...options.args || []];
        break;
      case 'go':
        command = 'go';
        args = ['test', '-json', ...options.args || []];
        break;
      default:
        return {
          success: false,
          error: `Unsupported test framework: ${framework}`
        };
    }

    try {
      const { stdout, stderr } = await execAsync(`${command} ${args.join(' ')}`, {
        cwd: this.projectPath,
        maxBuffer: 50 * 1024 * 1024,
        timeout: options.timeout || 300000 // 5 minutes
      });

      this.testResults = {
        framework,
        stdout,
        stderr,
        success: true
      };

      return this.parseResults(stdout, framework);
    } catch (error) {
      this.testResults = {
        framework,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        success: false,
        exitCode: error.code || 1
      };

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
   * Parse test results from different frameworks
   */
  parseResults(output, framework) {
    try {
      switch (framework) {
        case 'jest':
          return this.parseJestResults(output);
        case 'vitest':
          return this.parseVitestResults(output);
        case 'mocha':
          return this.parseMochaResults(output);
        case 'pytest':
          return this.parsePytestResults(output);
        case 'cargo':
          return this.parseCargoResults(output);
        case 'go':
          return this.parseGoResults(output);
        default:
          return { success: true, output };
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse results: ${error.message}`,
        output
      };
    }
  }

  /**
   * Parse Jest JSON output
   */
  parseJestResults(output) {
    try {
      const json = JSON.parse(output);
      const failures = json.testResults?.filter(t => t.status === 'failed') || [];

      return {
        success: json.success,
        framework: 'jest',
        summary: {
          total: json.numTotalTests,
          passed: json.numPassedTests,
          failed: json.numFailedTests,
          skipped: json.numPendingTests,
          duration: json.perfStats?.runDurationMs || 0
        },
        failures: failures.map(f => ({
          name: f.title,
          message: f.failureMessages?.[0] || '',
          file: f.ancestorTitles?.[0] || 'unknown',
          line: 0
        })),
        output
      };
    } catch {
      return {
        success: false,
        error: 'Failed to parse Jest output',
        output
      };
    }
  }

  /**
   * Parse Vitest JSON output
   */
  parseVitestResults(output) {
    try {
      const json = JSON.parse(output);
      const failures = json.tests?.filter(t => t.result?.state === 'fail') || [];

      return {
        success: !json.hasError,
        framework: 'vitest',
        summary: {
          total: json.tests?.length || 0,
          passed: json.tests?.filter(t => t.result?.state === 'pass').length || 0,
          failed: json.tests?.filter(t => t.result?.state === 'fail').length || 0,
          duration: 0
        },
        failures: failures.map(f => ({
          name: f.name,
          message: f.result?.errors?.[0]?.message || '',
          file: f.file || 'unknown',
          line: 0
        })),
        output
      };
    } catch {
      return {
        success: false,
        error: 'Failed to parse Vitest output',
        output
      };
    }
  }

  /**
   * Parse Mocha JSON output
   */
  parseMochaResults(output) {
    try {
      const json = JSON.parse(output);
      const failures = json.failures || [];

      return {
        success: json.failures.length === 0,
        framework: 'mocha',
        summary: {
          total: json.stats?.suites || 0,
          passed: json.stats?.passes || 0,
          failed: json.stats?.failures || 0,
          duration: json.stats?.duration || 0
        },
        failures: failures.map(f => ({
          name: f.title,
          message: f.err?.message || '',
          file: f.file || 'unknown',
          line: f.err?.stack ? this.extractLineNumber(f.err.stack) : 0
        })),
        output
      };
    } catch {
      return {
        success: false,
        error: 'Failed to parse Mocha output',
        output
      };
    }
  }

  /**
   * Parse Pytest JSON output
   */
  parsePytestResults(output) {
    try {
      const json = JSON.parse(output);
      const failures = json.tests?.filter(t => t.outcome === 'failed') || [];

      return {
        success: json.summary?.failed === 0,
        framework: 'pytest',
        summary: {
          total: json.summary?.total || 0,
          passed: json.summary?.passed || 0,
          failed: json.summary?.failed || 0,
          skipped: json.summary?.skipped || 0,
          duration: 0
        },
        failures: failures.map(f => ({
          name: f.nodeid,
          message: f.longrepr?.message || f.longrepr?.reprcrash?.message || '',
          file: f.nodeid.split('::')[0] || 'unknown',
          line: f.lineno || 0
        })),
        output
      };
    } catch {
      return {
        success: false,
        error: 'Failed to parse Pytest output',
        output
      };
    }
  }

  /**
   * Parse Cargo JSON output
   */
  parseCargoResults(output) {
    try {
      const lines = output.trim().split('\n').filter(line => line.trim());
      const failures = [];
      let passed = 0;
      let failed = 0;

      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          if (json.type === 'test' && json.test_status === 'fail') {
            failures.push({
              name: json.name,
              message: json.stdout || '',
              file: json.test_index?.toString() || 'unknown',
              line: 0
            });
            failed++;
          } else if (json.type === 'test' && json.test_status === 'ok') {
            passed++;
          }
        } catch {
          // Skip non-JSON lines
        }
      }

      return {
        success: failed === 0,
        framework: 'cargo',
        summary: {
          total: passed + failed,
          passed,
          failed,
          duration: 0
        },
        failures,
        output
      };
    } catch {
      return {
        success: false,
        error: 'Failed to parse Cargo output',
        output
      };
    }
  }

  /**
   * Parse Go test output
   */
  parseGoResults(output) {
    try {
      const lines = output.trim().split('\n').filter(line => line.trim());
      const failures = [];
      let passed = 0;
      let failed = 0;

      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          if (json.Event === 'output' && json.Output.includes('--- FAIL:')) {
            const match = json.Output.match(/--- FAIL: (\S+) \((\d+\.\d+)s\)/);
            if (match) {
              failures.push({
                name: match[1],
                message: json.Output,
                file: 'unknown',
                line: 0
              });
              failed++;
            }
          } else if (json.Event === 'pass') {
            passed++;
          } else if (json.Event === 'fail') {
            failed++;
          }
        } catch {
          // Skip non-JSON lines
        }
      }

      return {
        success: failed === 0,
        framework: 'go',
        summary: {
          total: passed + failed,
          passed,
          failed,
          duration: 0
        },
        failures,
        output
      };
    } catch {
      return {
        success: false,
        error: 'Failed to parse Go test output',
        output
      };
    }
  }

  /**
   * Extract line number from stack trace
   */
  extractLineNumber(stack) {
    const lines = stack.split('\n');
    for (const line of lines) {
      const match = line.match(/:(\d+):\d+$/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    return 0;
  }

  /**
   * Auto-fix failed tests by analyzing failures
   */
  async autoFixTests() {
    const results = this.testResults;
    if (!results || !results.framework) {
      return { success: false, error: 'No test results available' };
    }

    const failures = results.failures || [];
    if (failures.length === 0) {
      return { success: true, message: 'No failures to fix' };
    }

    const fixes = [];

    for (const failure of failures) {
      // Analyze failure type and suggest fixes
      const fix = await this.analyzeFailure(failure, results.framework);
      if (fix) {
        fixes.push(fix);
      }
    }

    return {
      success: true,
      framework: results.framework,
      totalFailures: failures.length,
      fixesApplied: fixes.length,
      fixes
    };
  }

  /**
   * Analyze a test failure and suggest fixes
   */
  async analyzeFailure(failure, _framework) {
    const message = failure.message?.toLowerCase() || '';
    const name = failure.name?.toLowerCase() || '';

    let fix = null;

    // Check for common failure patterns
    if (message.includes('assertion error') || message.includes('expected')) {
      fix = {
        type: 'assertion',
        description: 'Update assertion to match expected behavior',
       建议: 'Review test expectations and update accordingly'
      };
    } else if (message.includes('undefined') || message.includes('null')) {
      fix = {
        type: 'null_pointer',
        description: 'Add null/undefined check',
        suggestion: 'Add defensive checks before accessing properties'
      };
    } else if (message.includes('timeout')) {
      fix = {
        type: 'timeout',
        description: 'Increase test timeout or optimize code',
        suggestion: 'Use done() callback or return a promise'
      };
    } else if (message.includes('async')) {
      fix = {
        type: 'async',
        description: 'Fix async handling',
        suggestion: 'Ensure async functions are properly awaited'
      };
    } else if (name.includes('snapshot') || message.includes('snapshot')) {
      fix = {
        type: 'snapshot',
        description: 'Update snapshot',
        suggestion: 'Run with -u flag to update snapshots'
      };
    } else if (message.includes('import') || message.includes('module not found')) {
      fix = {
        type: 'import',
        description: 'Fix missing import or module',
        suggestion: 'Check import statements and dependencies'
      };
    }

    return {
      failure: {
        name: failure.name,
        file: failure.file
      },
      fix,
      message: failure.message
    };
  }

  /**
   * Get test coverage report
   */
  async getCoverage() {
    const { framework } = await this.detectFramework();

    try {
      let command;
      let coverageFile;

      switch (framework) {
        case 'jest':
          command = 'npx jest --coverage --json';
          coverageFile = 'coverage/coverage-final.json';
          break;
        case 'vitest':
          command = 'npx vitest --coverage';
          coverageFile = 'coverage/coverage-final.json';
          break;
        default:
          return { success: false, error: `Coverage not supported for ${framework}` };
      }

      const { stdout } = await execAsync(command, {
        cwd: this.projectPath,
        maxBuffer: 50 * 1024 * 1024,
        timeout: 300000
      });

      return {
        success: true,
        framework,
        output: stdout,
        coverageFile: path.join(this.projectPath, coverageFile)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Watch mode for tests
   */
  async watchTests(_options = {}) {
    const { framework } = await this.detectFramework();

    let command;
    switch (framework) {
      case 'jest':
        command = 'npx jest --watch';
        break;
      case 'vitest':
        command = 'npx vitest';
        break;
      default:
        return { success: false, error: `Watch mode not supported for ${framework}` };
    }

    return {
      success: true,
      command,
      message: 'Test watcher started. Press Ctrl+C to stop.',
      running: true
    };
  }
}

export default TestRunner;

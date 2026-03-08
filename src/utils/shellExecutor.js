import { exec as execSync, spawn, fork } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(execSync);

export class ShellExecutor {
  constructor(options = {}) {
    this.cwd = options.cwd || process.cwd();
    this.timeout = options.timeout || 120000;
    this.maxBuffer = options.maxBuffer || 50 * 1024 * 1024;
    this.env = { ...process.env, ...options.env };
    this.shell = options.shell || (process.platform === 'win32' ? 'cmd.exe' : '/bin/bash');
    this.backgroundProcesses = new Map();
  }

  // ===== NEW: Command chaining with &&, ||, and pipes =====
  async execChain(commands, options = {}) {
    const separator = options.separator || '&&';
    const command = Array.isArray(commands)
      ? commands.join(` ${separator} `)
      : commands;

    return await this.exec(command, options);
  }

  // ===== NEW: Pipeline support (cmd1 | cmd2 | cmd3) =====
  async pipeline(commands, options = {}) {
    if (!Array.isArray(commands) || commands.length < 2) {
      return await this.exec(commands[0], options);
    }

    const results = [];
    let lastResult = null;

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      const isLast = i === commands.length - 1;

      const cmdOptions = {
        ...options,
        // For non-last commands, capture stdout for piping
        ...( !isLast ? { captureOutput: true } : {} )
      };

      lastResult = await this.exec(cmd, cmdOptions);
      results.push(lastResult);

      // If any command fails in pipeline (and not using ||), stop
      if (!lastResult.success && options.separator !== '||') {
        return {
          success: false,
          results,
          stdout: lastResult.stdout,
          stderr: lastResult.stderr,
          exitCode: lastResult.exitCode,
          failedAt: i,
          command: cmd
        };
      }
    }

    return {
      success: lastResult.success,
      results,
      stdout: lastResult.stdout,
      stderr: lastResult.stderr,
      exitCode: lastResult.exitCode
    };
  }

  // ===== NEW: Background process management =====
  async spawnBackground(command, args = [], options = {}) {
    const id = options.id || `bg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const child = spawn(command, args, {
      cwd: options.cwd || this.cwd,
      env: { ...this.env, ...options.env },
      shell: options.shell || this.shell,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: options.detached || false
    });

    let stdout = '';
    let stderr = '';

    if (child.stdout) {
      child.stdout.on('data', (data) => {
        stdout += data.toString();
        if (options.onStdout) options.onStdout(data.toString());
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (data) => {
        stderr += data.toString();
        if (options.onStderr) options.onStderr(data.toString());
      });
    }

    const processInfo = {
      id,
      child,
      command,
      args,
      startTime: Date.now(),
      stdout,
      stderr,
      status: 'running'
    };

    this.backgroundProcesses.set(id, processInfo);

    // Handle process exit
    child.on('close', (code) => {
      processInfo.status = code === 0 ? 'completed' : 'failed';
      processInfo.exitCode = code;
      processInfo.endTime = Date.now();
      if (options.onExit) options.onExit(code);
    });

    child.on('error', (error) => {
      processInfo.status = 'error';
      processInfo.error = error.message;
      if (options.onError) options.onError(error);
    });

    return {
      success: true,
      id,
      pid: child.pid,
      info: processInfo
    };
  }

  // Execute command in background (simpler interface)
  async bg(command, options = {}) {
    const args = options.args || [];
    const shell = options.shell !== false;

    return await this.spawnBackground(
      shell ? (process.platform === 'win32' ? 'cmd' : '/bin/sh') : command,
      shell ? ['/c', command] : args,
      { ...options, id: options.id }
    );
  }

  // List background processes
  listBackgroundProcesses() {
    return Array.from(this.backgroundProcesses.values()).map(p => ({
      id: p.id,
      command: p.command,
      status: p.status,
      pid: p.child.pid,
      uptime: Date.now() - p.startTime
    }));
  }

  // Get background process info
  getBackgroundProcess(id) {
    return this.backgroundProcesses.get(id);
  }

  // Kill background process
  async killBackground(id, signal = 'SIGTERM') {
    const process = this.backgroundProcesses.get(id);
    if (!process) {
      return { success: false, error: 'Process not found' };
    }

    try {
      process.child.kill(signal);
      process.status = 'killed';
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Kill all background processes
  async killAllBackground(signal = 'SIGTERM') {
    const results = [];
    for (const [id] of this.backgroundProcesses) {
      results.push(await this.killBackground(id, signal));
    }
    return results;
  }

  // ===== NEW: Watch mode - run command on file changes =====
  async watch(command, patterns = ['**/*'], options = {}) {
    const chokidar = await import('chokidar').catch(() => null);

    if (!chokidar) {
      // Fallback: just run once
      return await this.exec(command, options);
    }

    const watcher = chokidar.watch(patterns, {
      cwd: options.cwd || this.cwd,
      ignored: options.ignore || /node_modules|\.git/,
      persistent: options.persistent !== false,
      ignoreInitial: true
    });

    let runCount = 0;
    const maxRuns = options.maxRuns || Infinity;
    let debounceTimer = null;

    const runCommand = async () => {
      if (runCount >= maxRuns) {
        watcher.close();
        return;
      }

      runCount++;
      const result = await this.exec(command, options);

      if (options.onChange) {
        options.onChange({ runCount, result });
      }

      return result;
    };

    watcher.on('all', (_event, _filePath) => {
      if (options.debounce) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => runCommand(), options.debounce);
      } else {
        runCommand();
      }
    });

    return {
      success: true,
      watcher,
      stop: () => watcher.close()
    };
  }

  // ===== Interactive shell (PTY) support =====
  async execInteractive(command, options = {}) {
    try {
      // Try to load node-pty for true terminal emulation
      const nodePty = await import('node-pty').catch(() => null);

      if (!nodePty || !nodePty.spawn) {
        // Fallback to regular spawn if node-pty not available
        return await this.spawn(command, [], options);
      }

      return new Promise((resolve) => {
        const ptyProcess = nodePty.spawn(
          process.platform === 'win32' ? 'cmd.exe' : '/bin/bash',
          process.platform === 'win32' ? ['/c', command] : ['-c', command],
          {
            name: 'xterm-256color',
            cols: options.cols || 80,
            rows: options.rows || 24,
            cwd: options.cwd || this.cwd,
            env: { ...this.env, ...options.env },
            timeout: options.timeout || this.timeout
          }
        );

        let stdout = '';
        let stderr = '';

        ptyProcess.onData((data) => {
          stdout += data;
          if (options.onData) options.onData(data);
        });

        ptyProcess.onExit((code) => {
          resolve({
            success: code.exitCode === 0,
            stdout,
            stderr,
            exitCode: code.exitCode || 0
          });
        });

        if (options.input) {
          ptyProcess.write(options.input);
        }
      });
    } catch (error) {
      // Fallback to regular spawn
      return await this.spawn(command, [], options);
    }
  }

  // ===== Original exec with enhancements =====
  async exec(command, options = {}) {
    const opts = {
      cwd: options.cwd || this.cwd,
      timeout: options.timeout || this.timeout,
      maxBuffer: options.maxBuffer || this.maxBuffer,
      env: { ...this.env, ...options.env },
      shell: options.shell || this.shell,
      ...options
    };

    try {
      const { stdout, stderr } = await execAsync(command, opts);
      return {
        success: true,
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: 0
      };
    } catch (error) {
      return {
        success: false,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.code || 1,
        error: error.message
      };
    }
  }

  // ===== Spawn with streaming =====
  async spawn(command, args = [], options = {}) {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd: options.cwd || this.cwd,
        env: { ...this.env, ...options.env },
        shell: options.shell || this.shell,
        stdio: options.stdio || 'pipe'
      });

      let stdout = '';
      let stderr = '';

      if (child.stdout) {
        child.stdout.on('data', (data) => {
          stdout += data.toString();
          if (options.onStdout) options.onStdout(data.toString());
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (data) => {
          stderr += data.toString();
          if (options.onStderr) options.onStderr(data.toString());
        });
      }

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({
          success: false,
          stdout,
          stderr: stderr + '\nTimed out',
          exitCode: -1,
          timedOut: true
        });
      }, options.timeout || this.timeout);

      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          success: code === 0,
          stdout,
          stderr,
          exitCode: code
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          stdout,
          stderr: error.message,
          exitCode: -1,
          error: error.message
        });
      });
    });
  }

  // ===== NEW: Fork Node.js modules =====
  async fork(modulePath, args = [], options = {}) {
    return new Promise((resolve) => {
      const child = fork(modulePath, args, {
        cwd: options.cwd || this.cwd,
        env: { ...this.env, ...options.env },
        silent: true
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
        if (options.onStdout) options.onStdout(data.toString());
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
        if (options.onStderr) options.onStderr(data.toString());
      });

      child.on('close', (code) => {
        resolve({
          success: code === 0,
          stdout,
          stderr,
          exitCode: code
        });
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          stdout,
          stderr: error.message,
          exitCode: -1,
          error: error.message
        });
      });
    });
  }

  // ===== NEW: Test runner integration =====
  async runTests(testFramework = 'auto', options = {}) {
    const pkg = await this.getPackageJson();
    let testCommand = options.command;

    if (!testCommand) {
      // Detect test framework
      if (testFramework === 'auto') {
        if (pkg?.dependencies?.jest || pkg?.devDependencies?.jest) {
          testCommand = 'jest';
        } else if (pkg?.dependencies?.vitest || pkg?.devDependencies?.vitest) {
          testCommand = 'vitest';
        } else if (pkg?.dependencies?.mocha || pkg?.devDependencies?.mocha) {
          testCommand = 'mocha';
        } else if (pkg?.scripts?.test) {
          testCommand = 'npm test';
        } else {
          return { success: false, error: 'No test framework detected' };
        }
      } else {
        testCommand = testFramework;
      }
    }

    const args = testCommand.includes(' ') ? testCommand.split(' ') : [testCommand];
    const result = await this.exec(args.join(' '), { timeout: options.timeout || 120000 });

    // Parse test output for summary
    const testResult = this.parseTestOutput(result.stdout + result.stderr, testCommand);
    return { ...result, ...testResult };
  }

  async getPackageJson() {
    try {
      const pkgPath = path.join(this.cwd, 'package.json');
      const content = await fs.promises.readFile(pkgPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  parseTestOutput(output, framework) {
    const result = {
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      duration: 0,
      suites: []
    };

    // Jest output parsing
    if (framework === 'jest' || output.includes('Tests:')) {
      const timeMatch = output.match(/Time:\s+([\d.]+s|[\d]+ms)/);

      const passedMatch = output.match(/(\d+)\s+passed/);
      const failedMatch = output.match(/(\d+)\s+failed/);
      const skippedMatch = output.match(/(\d+)\s+skipped/);

      if (passedMatch) result.passed = parseInt(passedMatch[1]);
      if (failedMatch) result.failed = parseInt(failedMatch[1]);
      if (skippedMatch) result.skipped = parseInt(skippedMatch[1]);
      if (timeMatch) result.duration = timeMatch[1];
      result.total = result.passed + result.failed + result.skipped;
    }

    // Vitest output parsing
    else if (framework === 'vitest' || output.includes('✓') || output.includes('✗')) {
      const passMatch = output.match(/(\d+)\s+passed/);
      const failMatch = output.match(/(\d+)\s+failed/);

      if (passMatch) result.passed = parseInt(passMatch[1]);
      if (failMatch) result.failed = parseInt(failMatch[1]);
      result.total = result.passed + result.failed;
    }

    // Pytest output parsing
    else if (framework === 'pytest' || output.includes('====')) {
      const passedMatch = output.match(/(\d+)\s+passed/);
      const failedMatch = output.match(/(\d+)\s+failed/);
      const skippedMatch = output.match(/(\d+)\s+skipped/);

      if (passedMatch) result.passed = parseInt(passedMatch[1]);
      if (failedMatch) result.failed = parseInt(failedMatch[1]);
      if (skippedMatch) result.skipped = parseInt(skippedMatch[1]);
      result.total = result.passed + result.failed + result.skipped;
    }

    return result;
  }

  // ===== NEW: Linter integration =====
  async runLinter(linter = 'auto', options = {}) {
    const pkg = await this.getPackageJson();
    let lintCommand = options.command;

    if (!lintCommand) {
      if (linter === 'auto') {
        if (pkg?.devDependencies?.eslint || pkg?.dependencies?.eslint) {
          lintCommand = 'eslint . --ext .js,.jsx,.ts,.tsx';
        } else if (pkg?.devDependencies?.typescript) {
          lintCommand = 'tsc --noEmit';
        } else if (pkg?.scripts?.lint) {
          lintCommand = 'npm run lint';
        } else {
          return { success: false, error: 'No linter detected' };
        }
      } else {
        lintCommand = linter;
      }
    }

    const result = await this.exec(lintCommand, { timeout: options.timeout || 60000 });
    return {
      ...result,
      issues: this.parseLinterOutput(result.stdout + result.stderr, lintCommand)
    };
  }

  parseLinterOutput(output, _linter) {
    const issues = [];

    // ESLint parsing (simplified)
    if (output.includes('error') || output.includes('warning')) {
      const lines = output.split('\n');
      for (const line of lines) {
        const match = line.match(/(.+?):(\d+):(\d+):\s*(error|warning|info):\s*(.+)/);
        if (match) {
          issues.push({
            file: match[1],
            line: parseInt(match[2]),
            column: parseInt(match[3]),
            severity: match[4],
            message: match[5]
          });
        }
      }
    }

    return issues;
  }

  // ===== System info =====
  async getSystemInfo() {
    return {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      memory: os.totalmem(),
      freeMemory: os.freemem(),
      hostname: os.hostname(),
      homeDir: os.homedir(),
      tmpDir: os.tmpdir(),
      cwd: this.cwd
    };
  }

  async which(command) {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'where' : 'which';
    try {
      const { stdout } = await execAsync(`${cmd} ${command}`, { shell: true });
      return stdout.trim().split('\n')[0];
    } catch {
      return null;
    }
  }

  setCwd(cwd) {
    this.cwd = cwd;
  }

  setEnv(env) {
    this.env = { ...this.env, ...env };
  }
}

export default ShellExecutor;

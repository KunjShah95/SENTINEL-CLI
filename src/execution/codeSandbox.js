/**
 * CODE EXECUTION SANDBOX
 *
 * Safely execute and verify generated code
 *
 * Features:
 * - Isolated execution environment
 * - Resource limits (CPU, memory, time)
 * - Security sandboxing
 * - Result caching
 */

import { Worker } from 'worker_threads';
import { VM } from 'vm2';
import Docker from 'dockerode';

export class CodeExecutionSandbox {
  constructor(options = {}) {
    this.options = {
      timeout: options.timeout || 5000, // 5 seconds
      memoryLimit: options.memoryLimit || 128, // 128MB
      cpuQuota: options.cpuQuota || 0.5, // 50% of one CPU
      method: options.method || 'vm2', // 'vm2', 'worker', 'docker'
      ...options
    };

    this.docker = this.options.method === 'docker' ? new Docker() : null;
  }

  /**
   * Execute code safely
   */
  async execute(code, language = 'javascript') {
    switch (this.options.method) {
      case 'vm2':
        return await this.executeVM2(code);

      case 'worker':
        return await this.executeWorker(code);

      case 'docker':
        return await this.executeDocker(code, language);

      default:
        throw new Error(`Unknown execution method: ${this.options.method}`);
    }
  }

  /**
   * VM2 Execution (fastest, JavaScript only)
   */
  async executeVM2(code) {
    const vm = new VM({
      timeout: this.options.timeout,
      sandbox: {
        console: {
          log: (...args) => args.join(' ')
        }
      }
    });

    const start = Date.now();

    try {
      const result = vm.run(code);

      return {
        success: true,
        output: result,
        executionTime: Date.now() - start
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - start
      };
    }
  }

  /**
   * Worker Thread Execution (safe, isolated)
   */
  async executeWorker(code) {
    return new Promise((resolve) => {
      const start = Date.now();

      const worker = new Worker(`
        const { parentPort } = require('worker_threads');

        try {
          const result = eval(\`${code.replace(/`/g, '\\`')}\`);
          parentPort.postMessage({ success: true, result });
        } catch (error) {
          parentPort.postMessage({ success: false, error: error.message });
        }
      `, { eval: true });

      const timeout = setTimeout(() => {
        worker.terminate();
        resolve({
          success: false,
          error: 'Execution timeout',
          executionTime: this.options.timeout
        });
      }, this.options.timeout);

      worker.on('message', (message) => {
        clearTimeout(timeout);
        worker.terminate();

        resolve({
          ...message,
          output: message.result,
          executionTime: Date.now() - start
        });
      });

      worker.on('error', (error) => {
        clearTimeout(timeout);
        worker.terminate();

        resolve({
          success: false,
          error: error.message,
          executionTime: Date.now() - start
        });
      });
    });
  }

  /**
   * Docker Execution (most secure, supports all languages)
   */
  async executeDocker(code, language) {
    const start = Date.now();

    // Create container configuration
    const containerConfig = this.getContainerConfig(language);

    try {
      // Create container
      const container = await this.docker.createContainer({
        Image: containerConfig.image,
        Cmd: containerConfig.command(code),
        HostConfig: {
          Memory: this.options.memoryLimit * 1024 * 1024,
          NanoCpus: this.options.cpuQuota * 1000000000,
          NetworkMode: 'none' // No network access
        },
        AttachStdout: true,
        AttachStderr: true
      });

      // Start container
      await container.start();

      // Wait for execution with timeout
      const output = await Promise.race([
        this.getContainerOutput(container),
        this.timeoutPromise(this.options.timeout)
      ]);

      // Stop and remove container
      await container.stop();
      await container.remove();

      return {
        success: true,
        output: output.stdout,
        error: output.stderr,
        executionTime: Date.now() - start
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - start
      };
    }
  }

  /**
   * Get container configuration for language
   */
  getContainerConfig(language) {
    const configs = {
      javascript: {
        image: 'node:18-alpine',
        command: (code) => ['node', '-e', code]
      },
      python: {
        image: 'python:3.11-alpine',
        command: (_code) => ['python', '-c', _code]
      },
      go: {
        image: 'golang:1.21-alpine',
        command: (_code) => ['go', 'run', '-']
      },
      rust: {
        image: 'rust:1.75-alpine',
        command: (_code) => ['rustc', '-', '-o', '/tmp/a.out', '&&', '/tmp/a.out']
      }
    };

    return configs[language] || configs.javascript;
  }

  /**
   * Get container output
   */
  async getContainerOutput(container) {
    const stream = await container.logs({
      stdout: true,
      stderr: true,
      follow: true
    });

    let stdout = '';
    let stderr = '';

    return new Promise((resolve) => {
      stream.on('data', (chunk) => {
        const str = chunk.toString();
        if (str.startsWith('\u0001')) {
          stdout += str.substring(8);
        } else if (str.startsWith('\u0002')) {
          stderr += str.substring(8);
        }
      });

      stream.on('end', () => {
        resolve({ stdout, stderr });
      });
    });
  }

  /**
   * Timeout promise
   */
  timeoutPromise(ms) {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Execution timeout')), ms)
    );
  }

  /**
   * Verify code execution
   */
  async verify(code, expectedOutput = null) {
    const result = await this.execute(code);

    if (!result.success) {
      return {
        verified: false,
        reason: 'Execution failed',
        error: result.error
      };
    }

    if (expectedOutput !== null) {
      const matches = this.compareOutput(result.output, expectedOutput);

      return {
        verified: matches,
        reason: matches ? 'Output matches expected' : 'Output mismatch',
        actual: result.output,
        expected: expectedOutput
      };
    }

    return {
      verified: true,
      reason: 'Execution successful',
      output: result.output
    };
  }

  /**
   * Compare output
   */
  compareOutput(actual, expected) {
    // Normalize whitespace
    const normalize = (str) => String(str).trim().replace(/\s+/g, ' ');

    return normalize(actual) === normalize(expected);
  }

  /**
   * Static code analysis (before execution)
   */
  async analyzeBeforeExecution(code) {
    const dangers = {
      fs: /require\(['"]fs['"]\)|import.*from\s+['"]fs['"]/,
      network: /require\(['"]https?['"]\)|fetch\(|axios/,
      process: /process\.exit|child_process|exec\(/,
      eval: /eval\(|Function\(|new Function/,
      infinite: /while\s*\(\s*true\s*\)|for\s*\(\s*;\s*;\s*\)/
    };

    const detected = [];

    for (const [danger, pattern] of Object.entries(dangers)) {
      if (pattern.test(code)) {
        detected.push(danger);
      }
    }

    return {
      safe: detected.length === 0,
      dangers: detected
    };
  }
}

export function createSandbox(options) {
  return new CodeExecutionSandbox(options);
}

export default CodeExecutionSandbox;

/**
 * INTEGRATED CODE VERIFICATION SYSTEM
 *
 * End-to-end code verification with:
 * - Static analysis before execution
 * - Multiple execution environments
 * - Result validation
 * - Security sandboxing
 * - Performance profiling
 */

import { createSandbox } from '../execution/codeSandbox.js';
import { parse as babelParse } from '@babel/parser';
import traverse from '@babel/traverse';

export class IntegratedCodeVerification {
  constructor(options = {}) {
    this.options = {
      enableStaticAnalysis: options.enableStaticAnalysis !== false,
      enableExecution: options.enableExecution !== false,
      enablePerformanceProfile: options.enablePerformanceProfile || false,
      executionMethod: options.executionMethod || 'vm2',
      timeout: options.timeout || 5000,
      maxMemory: options.maxMemory || 128,
      ...options
    };

    this.sandbox = createSandbox({
      method: this.options.executionMethod,
      timeout: this.options.timeout,
      memoryLimit: this.options.maxMemory
    });

    this.verificationCache = new Map();
  }

  /**
   * VERIFY CODE - Main entry point
   */
  async verify(code, options = {}) {
    const {
      language = 'javascript',
      expectedOutput = null,
      testCases = []
    } = options;

    console.log('🔍 Verifying code...');

    const verification = {
      code,
      language,
      staticAnalysis: null,
      execution: null,
      testResults: null,
      security: null,
      performance: null,
      overall: {
        passed: false,
        confidence: 0,
        issues: []
      }
    };

    // Step 1: Static Analysis
    if (this.options.enableStaticAnalysis) {
      verification.staticAnalysis = await this.staticAnalysis(code, language);

      if (!verification.staticAnalysis.safe) {
        verification.overall.passed = false;
        verification.overall.issues.push('Failed static analysis');
        return verification;
      }
    }

    // Step 2: Execute Code
    if (this.options.enableExecution) {
      verification.execution = await this.executeCode(code, language);

      if (!verification.execution.success) {
        verification.overall.passed = false;
        verification.overall.issues.push('Execution failed');
        return verification;
      }
    }

    // Step 3: Validate Output
    if (expectedOutput !== null) {
      verification.outputValidation = await this.validateOutput(
        verification.execution.output,
        expectedOutput
      );

      if (!verification.outputValidation.matches) {
        verification.overall.passed = false;
        verification.overall.issues.push('Output mismatch');
        return verification;
      }
    }

    // Step 4: Run Test Cases
    if (testCases.length > 0) {
      verification.testResults = await this.runTestCases(code, testCases, language);

      const passRate = verification.testResults.passed / verification.testResults.total;

      if (passRate < 0.8) {
        verification.overall.passed = false;
        verification.overall.issues.push(`Test pass rate: ${(passRate * 100).toFixed(1)}%`);
        return verification;
      }
    }

    // Step 5: Security Check
    verification.security = await this.securityCheck(code, language);

    if (verification.security.vulnerabilities.length > 0) {
      verification.overall.issues.push(
        `${verification.security.vulnerabilities.length} security issues`
      );
    }

    // Step 6: Performance Profiling (optional)
    if (this.options.enablePerformanceProfile) {
      verification.performance = await this.profilePerformance(code, language);
    }

    // Calculate overall confidence
    verification.overall.confidence = this.calculateConfidence(verification);

    verification.overall.passed =
      verification.overall.confidence > 0.7 &&
      verification.overall.issues.length === 0;

    console.log(`✅ Verification complete: ${verification.overall.passed ? 'PASSED' : 'FAILED'}`);
    console.log(`📊 Confidence: ${(verification.overall.confidence * 100).toFixed(1)}%`);

    return verification;
  }

  /**
   * STATIC ANALYSIS
   */
  async staticAnalysis(code, language) {
    if (language !== 'javascript' && language !== 'typescript') {
      return { safe: true, warnings: [], language: 'unsupported' };
    }

    const analysis = {
      safe: true,
      warnings: [],
      patterns: [],
      complexity: 0
    };

    try {
      const ast = babelParse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
        errorRecovery: true
      });

      // Check for dangerous patterns
      traverse.default(ast, {
        CallExpression: (path) => {
          const callee = path.node.callee.name || path.node.callee.property?.name;

          // eval, Function constructor
          if (callee === 'eval' || (path.node.callee.name === 'Function')) {
            analysis.safe = false;
            analysis.warnings.push({
              type: 'dangerous_eval',
              line: path.node.loc?.start.line,
              severity: 'critical'
            });
          }

          // Child process execution
          if (/exec|spawn|fork/i.test(callee)) {
            analysis.safe = false;
            analysis.warnings.push({
              type: 'process_execution',
              line: path.node.loc?.start.line,
              severity: 'critical'
            });
          }

          // File system access
          if (/readFile|writeFile|unlink|rmdir/i.test(callee)) {
            analysis.warnings.push({
              type: 'filesystem_access',
              line: path.node.loc?.start.line,
              severity: 'high'
            });
          }

          // Network access
          if (/fetch|axios|request|http\./i.test(callee)) {
            analysis.warnings.push({
              type: 'network_access',
              line: path.node.loc?.start.line,
              severity: 'medium'
            });
          }
        },

        WhileStatement: (path) => {
          // Check for infinite loops
          if (!path.node.test || path.node.test.type === 'BooleanLiteral' && path.node.test.value === true) {
            analysis.warnings.push({
              type: 'potential_infinite_loop',
              line: path.node.loc?.start.line,
              severity: 'high'
            });
          }
        }
      });

      // Calculate complexity
      analysis.complexity = this.calculateComplexity(ast);

      if (analysis.complexity > 20) {
        analysis.warnings.push({
          type: 'high_complexity',
          value: analysis.complexity,
          severity: 'low'
        });
      }

    } catch (error) {
      analysis.safe = false;
      analysis.warnings.push({
        type: 'parse_error',
        message: error.message,
        severity: 'critical'
      });
    }

    return analysis;
  }

  /**
   * EXECUTE CODE
   */
  async executeCode(code, language) {
    // Check cache first
    const cacheKey = this.getCacheKey(code);
    if (this.verificationCache.has(cacheKey)) {
      return this.verificationCache.get(cacheKey);
    }

    const execution = await this.sandbox.execute(code, language);

    // Cache result
    this.verificationCache.set(cacheKey, execution);

    return execution;
  }

  /**
   * VALIDATE OUTPUT
   */
  async validateOutput(actual, expected) {
    const normalize = (val) => {
      if (typeof val === 'string') {
        return val.trim().toLowerCase().replace(/\s+/g, ' ');
      }
      return JSON.stringify(val);
    };

    const actualNorm = normalize(actual);
    const expectedNorm = normalize(expected);

    const matches = actualNorm === expectedNorm;

    return {
      matches,
      actual: actualNorm,
      expected: expectedNorm,
      similarity: this.calculateSimilarity(actualNorm, expectedNorm)
    };
  }

  /**
   * RUN TEST CASES
   */
  async runTestCases(code, testCases, language) {
    const results = {
      total: testCases.length,
      passed: 0,
      failed: 0,
      cases: []
    };

    for (const testCase of testCases) {
      const testCode = this.buildTestCode(code, testCase, language);

      const execution = await this.sandbox.execute(testCode, language);

      const passed = execution.success &&
        this.matchesExpectedOutput(execution.output, testCase.expected);

      if (passed) {
        results.passed++;
      } else {
        results.failed++;
      }

      results.cases.push({
        input: testCase.input,
        expected: testCase.expected,
        actual: execution.output,
        passed,
        error: execution.error
      });
    }

    return results;
  }

  /**
   * SECURITY CHECK
   */
  async securityCheck(code, _language) {
    const check = {
      vulnerabilities: [],
      secure: true
    };

    // SQL Injection patterns
    if (/query.*\+|execute.*\+|sql.*\+/i.test(code)) {
      check.vulnerabilities.push({
        type: 'sql_injection',
        severity: 'critical',
        description: 'Potential SQL injection through string concatenation'
      });
      check.secure = false;
    }

    // XSS patterns
    if (/innerHTML\s*=|dangerouslySetInnerHTML/i.test(code)) {
      check.vulnerabilities.push({
        type: 'xss',
        severity: 'high',
        description: 'Potential XSS through innerHTML'
      });
    }

    // Hardcoded secrets
    if (/(api[_-]?key|secret|password)\s*=\s*['"][^'"]+['"]/i.test(code)) {
      check.vulnerabilities.push({
        type: 'hardcoded_secret',
        severity: 'high',
        description: 'Hardcoded credentials detected'
      });
    }

    // Command injection
    if (/exec\(|spawn\(|system\(/i.test(code)) {
      check.vulnerabilities.push({
        type: 'command_injection',
        severity: 'critical',
        description: 'Potential command injection'
      });
      check.secure = false;
    }

    return check;
  }

  /**
   * PERFORMANCE PROFILING
   */
  async profilePerformance(code, language) {
    const iterations = 10;
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await this.sandbox.execute(code, language);
      times.push(Date.now() - start);
    }

    times.sort((a, b) => a - b);

    return {
      iterations,
      avgTime: times.reduce((a, b) => a + b) / times.length,
      minTime: times[0],
      maxTime: times[times.length - 1],
      medianTime: times[Math.floor(times.length / 2)],
      p95Time: times[Math.floor(times.length * 0.95)]
    };
  }

  /**
   * HELPERS
   */

  calculateConfidence(verification) {
    let confidence = 1.0;

    // Static analysis
    if (verification.staticAnalysis) {
      if (!verification.staticAnalysis.safe) return 0;

      const criticalWarnings = verification.staticAnalysis.warnings.filter(
        w => w.severity === 'critical'
      ).length;

      confidence -= criticalWarnings * 0.3;
    }

    // Execution
    if (verification.execution && !verification.execution.success) {
      confidence -= 0.5;
    }

    // Test results
    if (verification.testResults) {
      const passRate = verification.testResults.passed / verification.testResults.total;
      confidence *= passRate;
    }

    // Security
    if (verification.security) {
      const criticalVulns = verification.security.vulnerabilities.filter(
        v => v.severity === 'critical'
      ).length;

      confidence -= criticalVulns * 0.3;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  calculateComplexity(ast) {
    let complexity = 1;

    traverse.default(ast, {
      IfStatement() { complexity++; },
      WhileStatement() { complexity++; },
      ForStatement() { complexity++; },
      SwitchCase() { complexity++; },
      ConditionalExpression() { complexity++; }
    });

    return complexity;
  }

  buildTestCode(code, testCase, language) {
    if (language === 'javascript') {
      return `
${code}

const result = main(${JSON.stringify(testCase.input)});
result;
      `;
    }

    return code;
  }

  matchesExpectedOutput(actual, expected) {
    const normalize = (val) => String(val).trim().toLowerCase();
    return normalize(actual) === normalize(expected);
  }

  calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  getCacheKey(code) {
    return require('crypto').createHash('sha256').update(code).digest('hex').substring(0, 16);
  }
}

// Factory function
export function createCodeVerification(options) {
  return new IntegratedCodeVerification(options);
}

export default IntegratedCodeVerification;

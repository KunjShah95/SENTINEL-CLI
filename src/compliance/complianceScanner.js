import { promises as fs } from 'fs';
import { join } from 'path';
import { glob } from 'glob';

/**
 * Compliance Scanner - Check against security standards
 */
export class ComplianceScanner {
  constructor(projectPath = process.cwd(), context = null) {
    this.projectPath = projectPath;
    this.context = context;

    // Define compliance standards
    this.standards = {
      'OWASP-Top-10': this.getOWASPTop10Checks(),
      'PCI-DSS': this.getPCIDSSChecks(),
      'SOC2': this.getSOC2Checks(),
      'GDPR': this.getGDPRChecks(),
      'HIPAA': this.getHIPAAChecks()
    };
  }

  /**
   * Scan for compliance
   */
  async scanCompliance(standard = 'OWASP-Top-10') {
    if (!this.standards[standard]) {
      throw new Error(`Unknown standard: ${standard}. Available: ${Object.keys(this.standards).join(', ')}`);
    }

    const checks = this.standards[standard];
    const results = {
      standard,
      timestamp: new Date().toISOString(),
      projectPath: this.projectPath,
      checks: [],
      passed: 0,
      failed: 0,
      warnings: 0,
      score: 0,
      compliance: false
    };

    for (const check of checks) {
      const result = await this.runCheck(check);
      results.checks.push(result);

      if (result.status === 'passed') results.passed++;
      else if (result.status === 'failed') results.failed++;
      else if (result.status === 'warning') results.warnings++;
    }

    // Calculate compliance score
    const total = results.passed + results.failed + results.warnings;
    results.score = total > 0 ? Math.round((results.passed / total) * 100) : 0;
    results.compliance = results.score >= 80 && results.failed === 0;

    return results;
  }

  /**
   * Run individual check
   */
  async runCheck(check) {
    try {
      const result = await check.verify(this.projectPath);

      return {
        id: check.id,
        name: check.name,
        description: check.description,
        status: result.passed ? 'passed' : (result.critical ? 'failed' : 'warning'),
        evidence: result.evidence || [],
        remediation: check.remediation,
        severity: check.severity,
        details: result.details
      };
    } catch (error) {
      return {
        id: check.id,
        name: check.name,
        description: check.description,
        status: 'error',
        error: error.message,
        severity: check.severity
      };
    }
  }

  /**
   * OWASP Top 10 checks
   */
  getOWASPTop10Checks() {
    return [
      {
        id: 'OWASP-A01',
        name: 'Broken Access Control',
        description: 'Check for missing authentication and authorization',
        severity: 'critical',
        remediation: 'Implement proper authentication and authorization',
        verify: async (projectPath) => {
          const files = await glob('**/*.{js,ts}', {
            cwd: projectPath,
            ignore: ['**/node_modules/**', '**/test/**']
          });

          const issues = [];

          for (const file of files) {
            const content = await fs.readFile(join(projectPath, file), 'utf-8');

            // Check for routes without auth
            if (/\.(get|post|put|delete)\(['"]/.test(content) && !/auth|authenticate/.test(content)) {
              issues.push({ file, issue: 'Route without authentication check' });
            }
          }

          return {
            passed: issues.length === 0,
            critical: issues.length > 5,
            evidence: issues.slice(0, 10),
            details: `Found ${issues.length} potential access control issues`
          };
        }
      },
      {
        id: 'OWASP-A02',
        name: 'Cryptographic Failures',
        description: 'Check for weak cryptography and missing encryption',
        severity: 'critical',
        remediation: 'Use strong encryption algorithms and secure key management',
        verify: async (projectPath) => {
          const files = await glob('**/*.{js,ts}', {
            cwd: projectPath,
            ignore: ['**/node_modules/**']
          });

          const issues = [];

          for (const file of files) {
            const content = await fs.readFile(join(projectPath, file), 'utf-8');

            // Check for weak algorithms
            if (/md5|sha1|des/i.test(content)) {
              issues.push({ file, issue: 'Weak cryptographic algorithm detected' });
            }

            // Check for hardcoded keys
            if (/(secret|key|password)\s*=\s*['"][^'"]+['"]/.test(content)) {
              issues.push({ file, issue: 'Potential hardcoded secret' });
            }
          }

          return {
            passed: issues.length === 0,
            critical: issues.length > 0,
            evidence: issues.slice(0, 10),
            details: `Found ${issues.length} cryptographic issues`
          };
        }
      },
      {
        id: 'OWASP-A03',
        name: 'Injection',
        description: 'Check for SQL injection, command injection, etc.',
        severity: 'critical',
        remediation: 'Use parameterized queries and input validation',
        verify: async (projectPath) => {
          const files = await glob('**/*.{js,ts}', {
            cwd: projectPath,
            ignore: ['**/node_modules/**']
          });

          const issues = [];

          for (const file of files) {
            const content = await fs.readFile(join(projectPath, file), 'utf-8');

            // SQL injection
            if (/query\s*\([^)]*\+|execute\s*\([^)]*\+|raw\s*\(/i.test(content)) {
              issues.push({ file, issue: 'Potential SQL injection' });
            }

            // Command injection
            if (/exec\s*\(|spawn\s*\(|system\s*\(/i.test(content)) {
              issues.push({ file, issue: 'Potential command injection' });
            }

            // Eval usage
            if (/eval\s*\(|Function\s*\(/i.test(content)) {
              issues.push({ file, issue: 'Dangerous eval usage' });
            }
          }

          return {
            passed: issues.length === 0,
            critical: issues.length > 0,
            evidence: issues.slice(0, 10),
            details: `Found ${issues.length} injection vulnerabilities`
          };
        }
      },
      {
        id: 'OWASP-A04',
        name: 'Insecure Design',
        description: 'Check for security design flaws',
        severity: 'high',
        remediation: 'Implement secure design patterns',
        verify: async (projectPath) => {
          const issues = [];

          // Check for rate limiting
          const files = await glob('**/*.{js,ts}', {
            cwd: projectPath,
            ignore: ['**/node_modules/**']
          });

          let hasRateLimit = false;

          for (const file of files) {
            const content = await fs.readFile(join(projectPath, file), 'utf-8');
            if (/rateLimit|rate-limit/.test(content)) {
              hasRateLimit = true;
              break;
            }
          }

          if (!hasRateLimit) {
            issues.push({ issue: 'No rate limiting detected' });
          }

          return {
            passed: issues.length === 0,
            critical: false,
            evidence: issues,
            details: `Found ${issues.length} design issues`
          };
        }
      },
      {
        id: 'OWASP-A05',
        name: 'Security Misconfiguration',
        description: 'Check for security misconfigurations',
        severity: 'high',
        remediation: 'Review and harden configurations',
        verify: async (projectPath) => {
          const issues = [];

          // Check for debug mode
          const files = await glob('**/*.{js,ts}', {
            cwd: projectPath,
            ignore: ['**/node_modules/**']
          });

          for (const file of files) {
            const content = await fs.readFile(join(projectPath, file), 'utf-8');

            if (/debug\s*:\s*true|NODE_ENV.*development/.test(content)) {
              issues.push({ file, issue: 'Debug mode may be enabled' });
            }
          }

          return {
            passed: issues.length === 0,
            critical: false,
            evidence: issues.slice(0, 10),
            details: `Found ${issues.length} configuration issues`
          };
        }
      },
      {
        id: 'OWASP-A06',
        name: 'Vulnerable and Outdated Components',
        description: 'Check for outdated dependencies',
        severity: 'high',
        remediation: 'Update dependencies regularly',
        verify: async (projectPath) => {
          try {
            const pkgPath = join(projectPath, 'package.json');
            const content = await fs.readFile(pkgPath, 'utf-8');
            const pkg = JSON.parse(content);

            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            const total = Object.keys(deps).length;

            return {
              passed: true,
              critical: false,
              evidence: [],
              details: `Project has ${total} dependencies. Run npm audit for detailed check.`
            };
          } catch {
            return {
              passed: true,
              critical: false,
              evidence: [],
              details: 'No package.json found'
            };
          }
        }
      },
      {
        id: 'OWASP-A07',
        name: 'Identification and Authentication Failures',
        description: 'Check for weak authentication',
        severity: 'critical',
        remediation: 'Implement strong authentication mechanisms',
        verify: async (projectPath) => {
          const files = await glob('**/*.{js,ts}', {
            cwd: projectPath,
            ignore: ['**/node_modules/**']
          });

          const issues = [];
          let hasMFA = false;

          for (const file of files) {
            const content = await fs.readFile(join(projectPath, file), 'utf-8');

            // Check for password without hashing
            if (/password.*===|password.*==/.test(content) && !/bcrypt|argon|pbkdf2/.test(content)) {
              issues.push({ file, issue: 'Password comparison without hashing' });
            }

            // Check for MFA
            if (/mfa|2fa|totp/.test(content)) {
              hasMFA = true;
            }
          }

          if (!hasMFA) {
            issues.push({ issue: 'No Multi-Factor Authentication detected' });
          }

          return {
            passed: issues.length === 0,
            critical: issues.length > 0,
            evidence: issues.slice(0, 10),
            details: `Found ${issues.length} authentication issues`
          };
        }
      },
      {
        id: 'OWASP-A08',
        name: 'Software and Data Integrity Failures',
        description: 'Check for integrity validation',
        severity: 'medium',
        remediation: 'Implement integrity checks',
        verify: async (projectPath) => {
          const issues = [];

          // Check for package-lock or yarn.lock
          try {
            await fs.access(join(projectPath, 'package-lock.json'));
          } catch {
            try {
              await fs.access(join(projectPath, 'yarn.lock'));
            } catch {
              issues.push({ issue: 'No lock file found' });
            }
          }

          return {
            passed: issues.length === 0,
            critical: false,
            evidence: issues,
            details: `Found ${issues.length} integrity issues`
          };
        }
      },
      {
        id: 'OWASP-A09',
        name: 'Security Logging and Monitoring Failures',
        description: 'Check for adequate logging',
        severity: 'medium',
        remediation: 'Implement comprehensive logging',
        verify: async (projectPath) => {
          const files = await glob('**/*.{js,ts}', {
            cwd: projectPath,
            ignore: ['**/node_modules/**']
          });

          let hasLogging = false;

          for (const file of files) {
            const content = await fs.readFile(join(projectPath, file), 'utf-8');

            if (/winston|morgan|pino|bunyan/.test(content)) {
              hasLogging = true;
              break;
            }
          }

          return {
            passed: hasLogging,
            critical: false,
            evidence: hasLogging ? [] : [{ issue: 'No logging library detected' }],
            details: hasLogging ? 'Logging library found' : 'No logging library detected'
          };
        }
      },
      {
        id: 'OWASP-A10',
        name: 'Server-Side Request Forgery (SSRF)',
        description: 'Check for SSRF vulnerabilities',
        severity: 'high',
        remediation: 'Validate and whitelist URLs',
        verify: async (projectPath) => {
          const files = await glob('**/*.{js,ts}', {
            cwd: projectPath,
            ignore: ['**/node_modules/**']
          });

          const issues = [];

          for (const file of files) {
            const content = await fs.readFile(join(projectPath, file), 'utf-8');

            // Check for user-controlled URLs
            if (/fetch\(req\.|axios\(req\.|request\(req\./.test(content)) {
              issues.push({ file, issue: 'Potential SSRF - user-controlled URL' });
            }
          }

          return {
            passed: issues.length === 0,
            critical: issues.length > 0,
            evidence: issues.slice(0, 10),
            details: `Found ${issues.length} potential SSRF vulnerabilities`
          };
        }
      }
    ];
  }

  /**
   * PCI-DSS checks
   */
  getPCIDSSChecks() {
    return [
      {
        id: 'PCI-3.4',
        name: 'Render PAN Unreadable',
        description: 'Check that credit card numbers are masked',
        severity: 'critical',
        remediation: 'Mask or encrypt credit card numbers',
        verify: async (projectPath) => {
          const files = await glob('**/*.{js,ts}', {
            cwd: projectPath,
            ignore: ['**/node_modules/**']
          });

          const issues = [];

          for (const file of files) {
            const content = await fs.readFile(join(projectPath, file), 'utf-8');

            if (/card.*number|ccn|credit.*card/i.test(content) && !/mask|encrypt|\\*/.test(content)) {
              issues.push({ file, issue: 'Credit card number may not be masked' });
            }
          }

          return {
            passed: issues.length === 0,
            critical: issues.length > 0,
            evidence: issues,
            details: `Found ${issues.length} potential PAN exposure issues`
          };
        }
      }
    ];
  }

  /**
   * SOC2 checks
   */
  getSOC2Checks() {
    return [
      {
        id: 'SOC2-CC6.1',
        name: 'Logical and Physical Access Controls',
        description: 'Check for authentication mechanisms',
        severity: 'high',
        remediation: 'Implement proper access controls',
        verify: async (projectPath) => {
          const files = await glob('**/*.{js,ts}', {
            cwd: projectPath,
            ignore: ['**/node_modules/**']
          });

          let hasAuth = false;

          for (const file of files) {
            const content = await fs.readFile(join(projectPath, file), 'utf-8');

            if (/passport|jwt|auth/.test(content)) {
              hasAuth = true;
              break;
            }
          }

          return {
            passed: hasAuth,
            critical: !hasAuth,
            evidence: hasAuth ? [] : [{ issue: 'No authentication mechanism detected' }],
            details: hasAuth ? 'Authentication found' : 'No authentication mechanism detected'
          };
        }
      }
    ];
  }

  /**
   * GDPR checks
   */
  getGDPRChecks() {
    return [
      {
        id: 'GDPR-Art32',
        name: 'Security of Processing',
        description: 'Check for encryption of personal data',
        severity: 'critical',
        remediation: 'Encrypt personal data at rest and in transit',
        verify: async (projectPath) => {
          const files = await glob('**/*.{js,ts}', {
            cwd: projectPath,
            ignore: ['**/node_modules/**']
          });

          let hasEncryption = false;

          for (const file of files) {
            const content = await fs.readFile(join(projectPath, file), 'utf-8');

            if (/encrypt|cipher|crypto/.test(content)) {
              hasEncryption = true;
              break;
            }
          }

          return {
            passed: hasEncryption,
            critical: !hasEncryption,
            evidence: hasEncryption ? [] : [{ issue: 'No encryption mechanism detected' }],
            details: hasEncryption ? 'Encryption found' : 'No encryption mechanism detected'
          };
        }
      }
    ];
  }

  /**
   * HIPAA checks
   */
  getHIPAAChecks() {
    return [
      {
        id: 'HIPAA-164.312',
        name: 'Technical Safeguards',
        description: 'Check for encryption and access controls',
        severity: 'critical',
        remediation: 'Implement encryption and access controls for PHI',
        verify: async (projectPath) => {
          const files = await glob('**/*.{js,ts}', {
            cwd: projectPath,
            ignore: ['**/node_modules/**']
          });

          let hasEncryption = false;
          let hasAuth = false;

          for (const file of files) {
            const content = await fs.readFile(join(projectPath, file), 'utf-8');

            if (/encrypt|cipher/.test(content)) hasEncryption = true;
            if (/auth|authenticate/.test(content)) hasAuth = true;

            if (hasEncryption && hasAuth) break;
          }

          return {
            passed: hasEncryption && hasAuth,
            critical: !hasEncryption || !hasAuth,
            evidence: [],
            details: `Encryption: ${hasEncryption}, Auth: ${hasAuth}`
          };
        }
      }
    ];
  }

  /**
   * Generate compliance report
   */
  generateReport(scanResults) {
    const report = {
      title: `${scanResults.standard} Compliance Report`,
      timestamp: scanResults.timestamp,
      summary: {
        score: scanResults.score,
        compliance: scanResults.compliance,
        passed: scanResults.passed,
        failed: scanResults.failed,
        warnings: scanResults.warnings
      },
      checks: scanResults.checks,
      recommendations: this.getRecommendations(scanResults)
    };

    return report;
  }

  /**
   * Get recommendations
   */
  getRecommendations(scanResults) {
    const recommendations = [];

    scanResults.checks.forEach(check => {
      if (check.status === 'failed') {
        recommendations.push({
          priority: 'high',
          check: check.name,
          remediation: check.remediation,
          evidence: check.evidence?.slice(0, 3)
        });
      }
    });

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }
}

// Factory function
export function createComplianceScanner(projectPath, context) {
  return new ComplianceScanner(projectPath, context);
}

export default ComplianceScanner;

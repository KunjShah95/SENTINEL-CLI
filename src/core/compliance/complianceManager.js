class ComplianceManager {
  constructor() {
    this.frameworks = new Map();
    this.rules = new Map();
    this.violations = [];
  }

  registerFramework(framework) {
    this.frameworks.set(framework.id, framework);
    return framework.id;
  }

  async checkCompliance(frameworkId, issues) {
    const framework = this.frameworks.get(frameworkId);
    if (!framework) {
      throw new Error(`Framework ${frameworkId} not found`);
    }

    const violations = [];

    for (const rule of framework.rules) {
      const violation = this.evaluateRule(rule, issues);
      if (violation) {
        violations.push(violation);
      }
    }

    const score = this.calculateComplianceScore(violations, framework);

    return {
      framework: framework.name,
      frameworkVersion: framework.version,
      score,
      violations,
      passed: violations.length === 0,
      checkedAt: new Date().toISOString(),
    };
  }

  evaluateRule(rule, issues) {
    const matchingIssues = issues.filter(issue => {
      if (rule.analyzer && issue.analyzer !== rule.analyzer) return false;
      if (rule.severity && issue.severity !== rule.severity) return false;
      if (rule.type && issue.type !== rule.type) return false;
      if (rule.tag && !issue.tags?.includes(rule.tag)) return false;
      return true;
    });

    if (rule.maxAllowed !== undefined && matchingIssues.length > rule.maxAllowed) {
      return {
        rule: rule.id,
        ruleName: rule.name,
        severity: rule.severity || 'high',
        description: rule.description,
        found: matchingIssues.length,
        allowed: rule.maxAllowed,
        message: `Exceeded maximum allowed ${rule.name}: found ${matchingIssues.length}, allowed ${rule.maxAllowed}`,
        remediation: rule.remediation,
      };
    }

    return null;
  }

  calculateComplianceScore(violations, framework) {
    if (violations.length === 0) return 100;

    const maxScore = 100;
    let penalty = 0;

    for (const violation of violations) {
      const severityPenalty = {
        critical: 25,
        high: 15,
        medium: 10,
        low: 5,
        info: 2,
      };

      penalty += severityPenalty[violation.severity] || 10;
    }

    const complianceScore = Math.max(0, maxScore - penalty);

    if (framework.thresholds) {
      return {
        score: complianceScore,
        grade: this.getGrade(complianceScore, framework.thresholds),
      };
    }

    return complianceScore;
  }

  getGrade(score, thresholds) {
    if (score >= (thresholds.A || 90)) return 'A';
    if (score >= (thresholds.B || 80)) return 'B';
    if (score >= (thresholds.C || 70)) return 'C';
    if (score >= (thresholds.D || 60)) return 'D';
    return 'F';
  }

  createOWASPFramework() {
    return {
      id: 'owasp-top-10-2021',
      name: 'OWASP Top 10 - 2021',
      version: '2021',
      rules: [
        {
          id: 'A01:2021',
          name: 'Broken Access Control',
          severity: 'high',
          tag: 'security',
          maxAllowed: 0,
          description: 'No broken access control violations allowed',
          remediation: 'Implement proper authorization checks',
        },
        {
          id: 'A03:2021',
          name: 'Injection',
          severity: 'critical',
          tag: 'security',
          maxAllowed: 0,
          description: 'No injection vulnerabilities allowed',
          remediation: 'Use parameterized queries and input validation',
        },
        {
          id: 'A05:2021',
          name: 'Security Misconfiguration',
          severity: 'medium',
          tag: 'security',
          maxAllowed: 5,
          description: 'Limited security misconfigurations allowed',
          remediation: 'Harden configuration settings',
        },
      ],
      thresholds: { A: 95, B: 85, C: 75, D: 60 },
    };
  }

  createSOC2Framework() {
    return {
      id: 'soc2-type2',
      name: 'SOC 2 Type II',
      version: '2024',
      rules: [
        {
          id: 'CC6.1',
          name: 'Logical Access Controls',
          severity: 'high',
          analyzer: 'security',
          maxAllowed: 0,
          description: 'No critical security issues allowed',
          remediation: 'Review and fix security issues immediately',
        },
        {
          id: 'CC6.6',
          name: 'Network Security',
          severity: 'high',
          tag: 'network',
          maxAllowed: 2,
          description: 'Maximum 2 network-related issues',
          remediation: 'Review network configuration',
        },
      ],
      thresholds: { A: 90, B: 80, C: 70, D: 60 },
    };
  }

  createGDPRFramework() {
    return {
      id: 'gdpr',
      name: 'GDPR Compliance',
      version: '2018',
      rules: [
        {
          id: 'ART25',
          name: 'Data Protection by Design',
          severity: 'high',
          tag: 'privacy',
          maxAllowed: 0,
          description: 'No privacy violations allowed',
          remediation: 'Review data handling practices',
        },
      ],
      thresholds: { A: 95, B: 85, C: 75, D: 60 },
    };
  }

  generateComplianceReport(result, format = 'markdown') {
    if (format === 'markdown') {
      return this.toMarkdown(result);
    }
    return JSON.stringify(result, null, 2);
  }

  toMarkdown(result) {
    return `# ${result.framework} Compliance Report
Generated: ${result.checkedAt}

## Summary
- **Score**: ${typeof result.score === 'object' ? result.score.score : result.score} (Grade: ${typeof result.score === 'object' ? result.score.grade : 'N/A'})
- **Status**: ${result.passed ? '✅ PASSED' : '❌ FAILED'}
- **Violations**: ${result.violations.length}

${result.violations.length > 0 ? `
## Violations
| Rule | Severity | Found | Allowed | Message |
|------|----------|-------|---------|---------|
${result.violations.map(v => `| ${v.rule} | ${v.severity} | ${v.found} | ${v.allowed} | ${v.message} |`).join('\n')}
` : 'No violations found. ✅'}

---
*Report generated by Sentinel CLI v1.8.0*
`;
  }
}

export default ComplianceManager;

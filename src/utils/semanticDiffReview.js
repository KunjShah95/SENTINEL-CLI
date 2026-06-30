import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

export class SemanticDiffReview {
  constructor(options = {}) {
    this.baseBranch = options.baseBranch || 'main';
    this.currentBranch = options.currentBranch || 'HEAD';
    this.analysisDepth = options.analysisDepth || 'deep';
  }

  async analyzePullRequest(projectPath, _prData = {}) {
    const changes = await this.getChangedFiles(projectPath);
    const diffStats = this.getDiffStats(projectPath, changes);
    const securityChanges = await this.analyzeSecurityChanges(projectPath, changes);
    const semanticAnalysis = this.performSemanticAnalysis(changes, securityChanges);
    const riskScore = this.calculateRiskScore(diffStats, securityChanges, semanticAnalysis);

    return {
      summary: this.generateSummary(diffStats, securityChanges, riskScore),
      diffStats,
      securityChanges,
      semanticAnalysis,
      riskScore,
      recommendations: this.generateRecommendations(securityChanges, riskScore)
    };
  }

  async getChangedFiles(projectPath) {
    try {
      const diff = execSync(
        `git diff --name-status ${this.baseBranch}...${this.currentBranch}`,
        { cwd: projectPath, encoding: 'utf-8' }
      );

      return diff
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => {
          const [status, ...pathParts] = line.split('\t');
          return {
            status: status.trim(),
            path: pathParts.join('\t').trim()
          };
        });
    } catch (error) {
      return [];
    }
  }

  getDiffStats(projectPath, changes) {
    const stats = {
      total: changes.length,
      added: 0,
      modified: 0,
      deleted: 0,
      renamed: 0,
      byType: {
        javascript: 0,
        typescript: 0,
        python: 0,
        java: 0,
        go: 0,
        other: 0
      }
    };

    const typeMap = {
      js: 'javascript', jsx: 'javascript',
      ts: 'typescript', tsx: 'typescript',
      py: 'python', java: 'java', go: 'go'
    };

    for (const change of changes) {
      const status = change.status.charAt(0).toLowerCase();
      if (status === 'a') stats.added++;
      else if (status === 'm') stats.modified++;
      else if (status === 'd') stats.deleted++;
      else if (status === 'r') stats.renamed++;

      const ext = change.path.split('.').pop()?.toLowerCase();
      const type = typeMap[ext] || 'other';
      stats.byType[type]++;
    }

    return stats;
  }

  async analyzeSecurityChanges(projectPath, changes) {
    const securityPatterns = {
      critical: [
        { pattern: /password\s*=/i, type: 'hardcoded-password' },
        { pattern: /api[_-]?key\s*=/i, type: 'hardcoded-api-key' },
        { pattern: /secret\s*=/i, type: 'hardcoded-secret' },
        { pattern: /token\s*=\s*['"`]/i, type: 'hardcoded-token' },
        { pattern: /private[_-]?key\s*=/i, type: 'private-key' },
        { pattern: /eval\s*\(/i, type: 'dangerous-eval' },
        { pattern: /exec\s*\(/i, type: 'command-injection' },
        { pattern: /spawn\s*\(/i, type: 'command-injection' },
      ],
      high: [
        { pattern: /innerHTML\s*=/i, type: 'xss-risk' },
        { pattern: /document\.write/i, type: 'xss-risk' },
        { pattern: /dangerouslySetInnerHTML/i, type: 'xss-risk' },
        { pattern: /SELECT.*FROM.*WHERE/i, type: 'sql-injection-risk' },
        { pattern: /\.query\s*\(/i, type: 'sql-injection-risk' },
        { pattern: /process\.env\[/i, type: 'env-access' },
        { pattern: /chmod\s+777/i, type: 'unsafe-permissions' },
        { pattern: /0644.*\.sh/i, type: 'unsafe-permissions' },
      ],
      medium: [
        { pattern: /console\.log/i, type: 'debug-code' },
        { pattern: /debugger/i, type: 'debug-code' },
        { pattern: /TODO/i, type: 'incomplete-code' },
        { pattern: /FIXME/i, type: 'incomplete-code' },
        { pattern: /HTTP\s+200/i, type: 'sensitive-data-exposure' },
        { pattern: /statusCode\s*=\s*200/i, type: 'sensitive-data-exposure' },
      ],
      low: [
        { pattern: /deprecated/i, type: 'deprecated-api' },
        { pattern: /old/i, type: 'outdated-code' },
      ]
    };

    const findings = {
      introduced: [],
      resolved: [],
      modified: []
    };

    for (const change of changes) {
      if (change.status === 'D') continue;

      try {
        const content = await fs.readFile(join(projectPath, change.path), 'utf-8');
        const lines = content.split('\n');

        for (const [severity, patterns] of Object.entries(securityPatterns)) {
          for (const { pattern, type } of patterns) {
            for (let i = 0; i < lines.length; i++) {
              if (pattern.test(lines[i])) {
                findings.introduced.push({
                  file: change.path,
                  line: i + 1,
                  type,
                  severity,
                  code: lines[i].substring(0, 100)
                });
              }
            }
          }
        }
      } catch (error) {
        // File might be new or deleted
      }
    }

    return findings;
  }

  performSemanticAnalysis(changes, securityChanges) {
    const analysis = {
      isSecurityFocused: false,
      isRefactoring: false,
      isNewFeature: false,
      isBugFix: false,
      changesSecurityPosture: false,
      intent: 'unknown',
      flags: []
    };

    const securityRelatedPaths = changes.filter(c =>
      /auth|security|login|password|token|credential|permission/i.test(c.path)
    );

    const refactoringPaths = changes.filter(c =>
      /refactor|cleanup|rename|move/i.test(c.path)
    );

    const newFeaturePaths = changes.filter(c =>
      c.status === 'A' && !c.path.includes('test')
    );

    const testPaths = changes.filter(c =>
      /test|spec|__tests__|__mocks__/i.test(c.path)
    );

    if (securityRelatedPaths.length > 0) {
      analysis.isSecurityFocused = true;
      analysis.intent = 'security';
    }

    if (refactoringPaths.length > 0 && securityRelatedPaths.length === 0) {
      analysis.isRefactoring = true;
      analysis.intent = 'refactor';
    }

    if (newFeaturePaths.length > testPaths.length * 2) {
      analysis.isNewFeature = true;
      analysis.intent = 'feature';
    }

    if (securityChanges.introduced.length > 0) {
      analysis.changesSecurityPosture = true;
      analysis.flags.push({
        type: 'security-risk',
        severity: 'high',
        message: `${securityChanges.introduced.length} potential security issues introduced`
      });
    }

    if (securityChanges.introduced.some(f => f.severity === 'critical')) {
      analysis.flags.push({
        type: 'critical-risk',
        severity: 'critical',
        message: 'CRITICAL: Critical severity issues detected'
      });
    }

    return analysis;
  }

  calculateRiskScore(diffStats, securityChanges, semanticAnalysis) {
    let score = 0;
    const maxScore = 100;

    score += diffStats.added * 2;
    score += diffStats.modified * 1;
    score += diffStats.deleted * 0.5;

    const severityWeights = { critical: 25, high: 15, medium: 5, low: 1 };
    for (const finding of securityChanges.introduced) {
      score += severityWeights[finding.severity] || 0;
    }

    if (semanticAnalysis.isSecurityFocused) score += 10;
    if (semanticAnalysis.isRefactoring) score += 5;
    if (semanticAnalysis.intent === 'security') score -= 10;

    return {
      raw: Math.min(score, maxScore),
      level: score < 10 ? 'low' : score < 30 ? 'medium' : score < 50 ? 'high' : 'critical',
      factors: {
        changeVolume: diffStats.total,
        securityFindings: securityChanges.introduced.length,
        intent: semanticAnalysis.intent,
        isSecurityFocused: semanticAnalysis.isSecurityFocused
      }
    };
  }

  generateSummary(diffStats, securityChanges, riskScore) {
    const newIssues = securityChanges.introduced.length;
    const critical = securityChanges.introduced.filter(f => f.severity === 'critical').length;
    const high = securityChanges.introduced.filter(f => f.severity === 'high').length;

    let posture = 'unchanged';
    let message = 'This PR maintains the current security posture.';

    if (newIssues > 0) {
      posture = 'degraded';
      message = `This PR introduces ${newIssues} new potential security issue(s). `;
      message += critical > 0 ? `${critical} CRITICAL, ` : '';
      message += high > 0 ? `${high} HIGH severity` : '';
      message += '. Review recommended.';
    } else if (riskScore.intent === 'security') {
      posture = 'improved';
      message = 'This PR appears to improve security (security-related changes detected).';
    }

    return {
      posture,
      message,
      newIssues,
      riskLevel: riskScore.level,
      changesSummary: `${diffStats.added} added, ${diffStats.modified} modified, ${diffStats.deleted} deleted`
    };
  }

  generateRecommendations(securityChanges, riskScore) {
    const recommendations = [];

    if (riskScore.level === 'critical' || riskScore.level === 'high') {
      recommendations.push({
        priority: 'high',
        message: 'Manual security review required before merge'
      });
    }

    const criticalIssues = securityChanges.introduced.filter(f => f.severity === 'critical');
    if (criticalIssues.length > 0) {
      recommendations.push({
        priority: 'critical',
        message: `Fix ${criticalIssues.length} critical issue(s) before merging:`,
        details: criticalIssues.map(i => `  - ${i.type} in ${i.file}:${i.line}`)
      });
    }

    const hardcodedSecrets = securityChanges.introduced.filter(f =>
      f.type.includes('hardcoded') || f.type.includes('secret')
    );
    if (hardcodedSecrets.length > 0) {
      recommendations.push({
        priority: 'high',
        message: 'Potential hardcoded secrets detected. Use environment variables or secrets management.'
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        priority: 'low',
        message: 'No security concerns detected. Standard review process applies.'
      });
    }

    return recommendations;
  }
}

export default SemanticDiffReview;

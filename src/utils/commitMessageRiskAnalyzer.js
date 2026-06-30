import { execSync } from 'child_process';

export class CommitMessageRiskAnalyzer {
  constructor(options = {}) {
    this.riskPatterns = this.initializeRiskPatterns();
    this.thresholds = {
      low: options.lowThreshold || 0,
      medium: options.mediumThreshold || 2,
      high: options.highThreshold || 5,
      critical: options.criticalThreshold || 8
    };
  }

  initializeRiskPatterns() {
    return {
      critical: [
        {
          pattern: /hotfix/i,
          risk: 8,
          message: 'Hotfix commits often bypass review process',
          recommendation: 'Ensure this was properly reviewed'
        },
        {
          pattern: /quick[ly]?\s*fix/i,
          risk: 7,
          message: 'Quick fixes may be incomplete or introduce new issues',
          recommendation: 'Verify thorough testing was performed'
        },
        {
          pattern: /bypass/i,
          risk: 9,
          message: 'Bypass commits often disable security checks',
          recommendation: 'Review for security implications'
        },
        {
          pattern: /disable[d]?\s*(auth|security|validation)/i,
          risk: 10,
          message: 'Disabling security features is high risk',
          recommendation: 'Ensure this is temporary and documented'
        },
        {
          pattern: /temp(orary)?\s*workaround/i,
          risk: 6,
          message: 'Temporary workarounds may become permanent',
          recommendation: 'Create issue to track proper fix'
        }
      ],
      high: [
        {
          pattern: /hack/i,
          risk: 6,
          message: 'Hacks often indicate technical debt',
          recommendation: 'Document why this was necessary'
        },
        {
          pattern: /skip\s*(test|validation)/i,
          risk: 7,
          message: 'Skipping tests reduces confidence',
          recommendation: 'Ensure manual testing was performed'
        },
        {
          pattern: /force[d]?\s*(push|merge)/i,
          risk: 6,
          message: 'Force operations can lose code or introduce conflicts',
          recommendation: 'Verify history is intact'
        },
        {
          pattern: /wip/i,
          risk: 4,
          message: 'Work in progress commits may be incomplete',
          recommendation: 'Mark as WIP or complete before merge'
        },
        {
          pattern: /revert/i,
          risk: 5,
          message: 'Reverts may indicate unstable changes',
          recommendation: 'Review why revert was necessary'
        }
      ],
      medium: [
        {
          pattern: /todo[:\s]/i,
          risk: 2,
          message: 'TODO comments indicate incomplete work',
          recommendation: 'Create issue to track remaining work'
        },
        {
          pattern: /fixme/i,
          risk: 3,
          message: 'FIXME indicates known issues',
          recommendation: 'Ensure issue exists for this'
        },
        {
          pattern: /xxx/i,
          risk: 3,
          message: 'XXX comments indicate potential problems',
          recommendation: 'Investigate and address'
        },
        {
          pattern: /clean(ing|up)?\s*up/i,
          risk: 2,
          message: 'Cleanup commits may have unintended side effects',
          recommendation: 'Review carefully'
        },
        {
          pattern: /oops/i,
          risk: 4,
          message: 'Oops commits indicate mistakes',
          recommendation: 'Review for accidental changes'
        },
        {
          pattern: /whoops/i,
          risk: 4,
          message: 'Whoops commits indicate mistakes',
          recommendation: 'Review for accidental changes'
        }
      ],
      low: [
        {
          pattern: /minor/i,
          risk: 1,
          message: 'Minor changes are low risk',
          recommendation: 'Standard review'
        },
        {
          pattern: /typo/i,
          risk: 1,
          message: 'Typo fixes are low risk',
          recommendation: 'Standard review'
        },
        {
          pattern: /cosmetic/i,
          risk: 1,
          message: 'Cosmetic changes are low risk',
          recommendation: 'Standard review'
        },
        {
          pattern: /refactor/i,
          risk: 2,
          message: 'Refactoring can introduce subtle bugs',
          recommendation: 'Ensure tests pass'
        }
      ],
      info: [
        {
          pattern: /security/i,
          risk: 0,
          message: 'Security-related changes should be carefully reviewed',
          recommendation: 'Priority review recommended'
        },
        {
          pattern: /breaking/i,
          risk: 0,
          message: 'Breaking changes require careful review',
          recommendation: 'Review changelog and migration path'
        },
        {
          pattern: /deprecate/i,
          risk: 0,
          message: 'Deprecations should be documented',
          recommendation: 'Update documentation'
        }
      ]
    };
  }

  async analyzeProject(projectPath, options = {}) {
    const limit = options.limit || 50;
    const branch = options.branch || 'HEAD';
    const commits = this.getRecentCommits(projectPath, limit, branch);

    const results = {
      commits: [],
      riskSummary: {
        totalCommits: commits.length,
        highRisk: 0,
        mediumRisk: 0,
        lowRisk: 0,
        flaggedCommits: []
      },
      recommendations: []
    };

    for (const commit of commits) {
      const analysis = this.analyzeCommitMessage(commit.message);
      results.commits.push({
        hash: commit.hash,
        message: commit.message,
        author: commit.author,
        date: commit.date,
        ...analysis
      });

      if (analysis.riskLevel !== 'none') {
        results.riskSummary.flaggedCommits.push({
          hash: commit.hash,
          riskLevel: analysis.riskLevel,
          riskScore: analysis.riskScore,
          flags: analysis.flags
        });

        if (analysis.riskLevel === 'critical' || analysis.riskLevel === 'high') {
          results.riskSummary.highRisk++;
        } else if (analysis.riskLevel === 'medium') {
          results.riskSummary.mediumRisk++;
        } else {
          results.riskSummary.lowRisk++;
        }
      }
    }

    results.recommendations = this.generateRecommendations(results.riskSummary);

    return results;
  }

  analyzeCommitMessage(message) {
    const flags = [];
    let totalRisk = 0;

    for (const [severity, patterns] of Object.entries(this.riskPatterns)) {
      for (const pattern of patterns) {
        if (pattern.pattern.test(message)) {
          flags.push({
            severity,
            message: pattern.message,
            recommendation: pattern.recommendation,
            matchedText: message.match(pattern.pattern)[0]
          });
          totalRisk += pattern.risk;
        }
      }
    }

    const riskLevel = this.calculateRiskLevel(totalRisk);

    return {
      riskScore: totalRisk,
      riskLevel,
      flags,
      message: flags.length > 0
        ? `${flags.length} risk indicator(s) detected`
        : 'No risk indicators detected'
    };
  }

  calculateRiskLevel(score) {
    if (score >= this.thresholds.critical) return 'critical';
    if (score >= this.thresholds.high) return 'high';
    if (score >= this.thresholds.medium) return 'medium';
    if (score >= this.thresholds.low) return 'low';
    return 'none';
  }

  getRecentCommits(projectPath, limit, branch) {
    try {
      const output = execSync(
        `git log ${branch} -${limit} --format="%H|%an|%ae|%at|%s"`,
        { cwd: projectPath, encoding: 'utf-8' }
      );

      return output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => {
          const [hash, author, email, timestamp, ...messageParts] = line.split('|');
          return {
            hash: hash.substring(0, 7),
            author,
            email,
            date: new Date(parseInt(timestamp) * 1000).toISOString(),
            message: messageParts.join('|')
          };
        });
    } catch (error) {
      return [];
    }
  }

  generateRecommendations(riskSummary) {
    const recommendations = [];

    if (riskSummary.highRisk > 0) {
      recommendations.push({
        priority: 'high',
        category: 'security',
        message: `${riskSummary.highRisk} high/critical risk commit(s) detected`,
        action: 'Review flagged commits for security implications'
      });
    }

    const hotfixes = riskSummary.flaggedCommits.filter(c =>
      /hotfix/i.test(c.hash) || c.riskScore >= 7
    );
    if (hotfixes.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'process',
        message: 'Hotfix/quick-fix commits detected',
        action: 'Ensure proper review process was followed'
      });
    }

    const disabledSecurity = riskSummary.flaggedCommits.filter(c =>
      c.flags.some(f => /security|auth|bypass/i.test(f.message))
    );
    if (disabledSecurity.length > 0) {
      recommendations.push({
        priority: 'critical',
        category: 'security',
        message: 'Commits may have disabled security features',
        action: 'URGENT: Review for security implications'
      });
    }

    const skippedTests = riskSummary.flaggedCommits.filter(c =>
      c.flags.some(f => /skip.*test/i.test(f.matchedText))
    );
    if (skippedTests.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'testing',
        message: 'Test-skipping commits detected',
        action: 'Verify manual testing was performed'
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        priority: 'low',
        category: 'general',
        message: 'No concerning patterns detected',
        action: 'Standard review process applies'
      });
    }

    return recommendations;
  }

  async checkPRCommits(projectPath, prBranch, baseBranch = 'main') {
    try {
      const output = execSync(
        `git log ${baseBranch}..${prBranch} --format="%H|%an|%ae|%at|%s"`,
        { cwd: projectPath, encoding: 'utf-8' }
      );

      const commits = output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => {
          const [hash, author, email, timestamp, ...messageParts] = line.split('|');
          return {
            hash: hash.substring(0, 7),
            author,
            email,
            date: new Date(parseInt(timestamp) * 1000).toISOString(),
            message: messageParts.join('|')
          };
        });

      const analysis = this.analyzeCommitMessage(
        commits.map(c => c.message).join('\n')
      );

      return {
        commitCount: commits.length,
        commits,
        analysis,
        requiresReview: analysis.riskLevel !== 'none'
      };
    } catch (error) {
      return {
        commitCount: 0,
        commits: [],
        analysis: { riskScore: 0, riskLevel: 'none', flags: [] },
        requiresReview: false,
        error: error.message
      };
    }
  }
}

export default CommitMessageRiskAnalyzer;

/**
 * Severity Scoring and Prioritization System for Sentinel
 * Implements CVSS-based scoring, contextual risk assessment,
 * and intelligent prioritization for security issues
 */

export class SeverityScorer {
  constructor(config = {}) {
    this.config = {
      // Base CVSS weights (0-10 scale)
      baseScores: {
        critical: 9.0,
        high: 7.0,
        medium: 4.0,
        low: 1.0,
        info: 0.0
      },
      
      // Contextual multipliers
      contextMultipliers: {
        // File type risk
        configFiles: 1.2,      // .env, .config files are higher risk
        authenticationFiles: 1.5, // auth, jwt, oauth files
        databaseFiles: 1.3,    // database connection/config files
        apiFiles: 1.1,         // API endpoint files
        
        // Vulnerability type risk
        sqlInjection: 1.4,
        xss: 1.2,
        csrf: 1.3,
        deserialization: 1.4,
        authentication: 1.5,
        authorization: 1.3,
        cryptography: 1.2,
        secrets: 1.6, // Secrets exposure is very high risk
        
        // Exploitability factors
        remoteExploitable: 1.3,
        requiresUserInteraction: 0.8,
        networkAccessible: 1.2,
        noAuthenticationRequired: 1.1
      },
      
      // Business impact factors
      businessImpact: {
        paymentProcessing: 1.5,
        userData: 1.4,
        authentication: 1.5,
        administrativeFunctions: 1.3,
        dataExport: 1.2
      },
      
      // Remediation complexity
      remediationComplexity: {
        simple: 0.9,      // Easy to fix
        moderate: 1.0,    // Average effort
        complex: 1.1,     // Hard to fix
        architectural: 1.3 // Requires architecture changes
      },
      
      ...config
    };
    
    this.severityWeights = {
      critical: 10,
      high: 8,
      medium: 5,
      low: 2,
      info: 0
    };
  }

  /**
   * Calculate comprehensive risk score for an issue
   * Returns score from 0-100 with detailed breakdown
   */
  calculateRiskScore(issue) {
    const baseScore = this.getBaseScore(issue.severity);
    const contextualScore = this.calculateContextualRisk(issue);
    const exploitabilityScore = this.calculateExploitabilityScore(issue);
    const businessImpactScore = this.calculateBusinessImpactScore(issue);
    const remediationScore = this.calculateRemediationScore(issue);
    
    // Weighted combination of factors
    const finalScore = Math.min(100, Math.max(0, 
      (baseScore * 0.4) +
      (contextualScore * 0.2) +
      (exploitabilityScore * 0.2) +
      (businessImpactScore * 0.1) +
      (remediationScore * 0.1)
    ));
    
    return {
      score: Math.round(finalScore),
      breakdown: {
        baseScore: Math.round(baseScore),
        contextualScore: Math.round(contextualScore),
        exploitabilityScore: Math.round(exploitabilityScore),
        businessImpactScore: Math.round(businessImpactScore),
        remediationScore: Math.round(remediationScore)
      },
      confidence: this.calculateConfidence(issue),
      priority: this.determinePriority(finalScore)
    };
  }

  /**
   * Get base score from severity level
   */
  getBaseScore(severity) {
    return this.config.baseScores[severity] * 10; // Scale to 0-100
  }

  /**
   * Calculate contextual risk based on file location and vulnerability type
   */
  calculateContextualRisk(issue) {
    let multiplier = 1.0;
    
    // File type analysis
    const filePath = issue.file?.toLowerCase() || '';
    
    if (this.isConfigFile(filePath)) {
      multiplier *= this.config.contextMultipliers.configFiles;
    }
    
    if (this.isAuthenticationFile(filePath)) {
      multiplier *= this.config.contextMultipliers.authenticationFiles;
    }
    
    if (this.isDatabaseFile(filePath)) {
      multiplier *= this.config.contextMultipliers.databaseFiles;
    }
    
    if (this.isAPIFile(filePath)) {
      multiplier *= this.config.contextMultipliers.apiFiles;
    }
    
    // Vulnerability type analysis
    const vulnerabilityType = this.categorizeVulnerability(issue);
    if (this.config.contextMultipliers[vulnerabilityType]) {
      multiplier *= this.config.contextMultipliers[vulnerabilityType];
    }
    
    return Math.min(100, this.getBaseScore(issue.severity) * multiplier);
  }

  /**
   * Calculate exploitability score based on vulnerability characteristics
   */
  calculateExploitabilityScore(issue) {
    let score = this.getBaseScore(issue.severity);
    let multiplier = 1.0;
    
    const message = issue.message?.toLowerCase() || '';
    const title = issue.title?.toLowerCase() || '';
    const combined = `${title} ${message}`;
    
    // Check for remote exploitability indicators
    if (this.containsAny(combined, ['remote', 'network', 'http', 'https', 'api'])) {
      multiplier *= this.config.contextMultipliers.remoteExploitable;
    }
    
    // Check if authentication is required
    if (this.containsAny(combined, ['no auth', 'without authentication', 'anonymous'])) {
      multiplier *= this.config.contextMultipliers.noAuthenticationRequired;
    }
    
    // Check if user interaction is required (reduces risk)
    if (this.containsAny(combined, ['user interaction', 'social engineering', 'click'])) {
      multiplier *= this.config.contextMultipliers.requiresUserInteraction;
    }
    
    return Math.min(100, score * multiplier);
  }

  /**
   * Calculate business impact score
   */
  calculateBusinessImpactScore(issue) {
    let score = this.getBaseScore(issue.severity);
    let multiplier = 1.0;
    
    const message = issue.message?.toLowerCase() || '';
    const title = issue.title?.toLowerCase() || '';
    const combined = `${title} ${message}`;
    
    // Check for high-impact keywords
    if (this.containsAny(combined, ['payment', 'credit card', 'billing', 'transaction'])) {
      multiplier *= this.config.businessImpact.paymentProcessing;
    }
    
    if (this.containsAny(combined, ['user data', 'personal', 'pii', 'privacy', 'gdpr'])) {
      multiplier *= this.config.businessImpact.userData;
    }
    
    if (this.containsAny(combined, ['auth', 'login', 'password', 'session'])) {
      multiplier *= this.config.businessImpact.authentication;
    }
    
    if (this.containsAny(combined, ['admin', 'administrator', 'root', 'privilege'])) {
      multiplier *= this.config.businessImpact.administrativeFunctions;
    }
    
    if (this.containsAny(combined, ['export', 'download', 'backup', 'dump'])) {
      multiplier *= this.config.businessImpact.dataExport;
    }
    
    return Math.min(100, score * multiplier);
  }

  /**
   * Calculate remediation complexity score
   */
  calculateRemediationScore(issue) {
    let score = this.getBaseScore(issue.severity);
    let multiplier = 1.0;
    
    const suggestion = issue.suggestion?.toLowerCase() || '';
    
    // Analyze remediation complexity from suggestions
    if (this.containsAny(suggestion, ['simple', 'easily', 'just', 'remove'])) {
      multiplier *= this.config.remediationComplexity.simple;
    } else if (this.containsAny(suggestion, ['refactor', 'redesign', 'architecture'])) {
      multiplier *= this.config.remediationComplexity.architectural;
    } else if (this.containsAny(suggestion, ['complex', 'difficult', 'significant'])) {
      multiplier *= this.config.remediationComplexity.complex;
    }
    
    return Math.min(100, score * multiplier);
  }

  /**
   * Calculate confidence in the assessment
   */
  calculateConfidence(issue) {
    let confidence = 0.7; // Base confidence
    
    // Higher confidence for specific vulnerability patterns
    const title = issue.title?.toLowerCase() || '';
    const message = issue.message?.toLowerCase() || '';
    
    if (this.containsAny(`${title} ${message}`, ['cve', 'cvss', 'known vulnerability'])) {
      confidence += 0.2;
    }
    
    if (issue.tags && issue.tags.length > 0) {
      confidence += 0.1;
    }
    
    if (issue.snippet) {
      confidence += 0.1;
    }
    
    return Math.min(1.0, confidence);
  }

  /**
   * Determine priority level based on final score
   */
  determinePriority(score) {
    if (score >= 80) return 'P0 - Critical';
    if (score >= 65) return 'P1 - High';
    if (score >= 45) return 'P2 - Medium';
    if (score >= 25) return 'P3 - Low';
    return 'P4 - Informational';
  }

  /**
   * Categorize vulnerability type for contextual scoring
   */
  categorizeVulnerability(issue) {
    const text = `${issue.title} ${issue.message}`.toLowerCase();
    
    if (this.containsAny(text, ['sql', 'injection', 'query'])) return 'sqlInjection';
    if (this.containsAny(text, ['xss', 'cross-site', 'scripting'])) return 'xss';
    if (this.containsAny(text, ['csrf', 'cross-site request'])) return 'csrf';
    if (this.containsAny(text, ['deserializ', 'pickle', 'yaml'])) return 'deserialization';
    if (this.containsAny(text, ['auth', 'login', 'password'])) return 'authentication';
    if (this.containsAny(text, ['permission', 'authorization', 'access control'])) return 'authorization';
    if (this.containsAny(text, ['crypto', 'hash', 'encryption', 'md5', 'sha1'])) return 'cryptography';
    if (this.containsAny(text, ['secret', 'key', 'token', 'credential'])) return 'secrets';
    
    return 'general';
  }

  /**
   * Check if file is a configuration file
   */
  isConfigFile(filePath) {
    return /\.(env|config|conf|cfg|ini|properties|yaml|yml|json)$/.test(filePath);
  }

  /**
   * Check if file is authentication-related
   */
  isAuthenticationFile(filePath) {
    return /(auth|login|jwt|session|oauth|passport|saml)/.test(filePath);
  }

  /**
   * Check if file is database-related
   */
  isDatabaseFile(filePath) {
    return /(db|database|sql|connection|pool)/.test(filePath);
  }

  /**
   * Check if file is API-related
   */
  isAPIFile(filePath) {
    return /(api|endpoint|route|controller|rest|graphql)/.test(filePath);
  }

  /**
   * Utility method to check if text contains any of the keywords
   */
  containsAny(text, keywords) {
    return keywords.some(keyword => text.includes(keyword));
  }

  /**
   * Prioritize and sort issues by risk score
   */
  prioritizeIssues(issues) {
    return issues
      .map(issue => ({
        ...issue,
        riskScore: this.calculateRiskScore(issue)
      }))
      .sort((a, b) => b.riskScore.score - a.riskScore.score);
  }

  /**
   * Generate priority report
   */
  generatePriorityReport(issues) {
    const prioritizedIssues = this.prioritizeIssues(issues);
    
    const report = {
      summary: {
        totalIssues: issues.length,
        totalScore: 0,
        averageScore: 0,
        highPriorityCount: 0,
        criticalCount: 0
      },
      priorities: {
        'P0 - Critical': [],
        'P1 - High': [],
        'P2 - Medium': [],
        'P3 - Low': [],
        'P4 - Informational': []
      },
      recommendations: this.generateRecommendations(prioritizedIssues)
    };
    
    for (const issue of prioritizedIssues) {
      report.summary.totalScore += issue.riskScore.score;
      
      if (issue.riskScore.score >= 80) {
        report.summary.criticalCount++;
        report.summary.highPriorityCount++;
        report.priorities['P0 - Critical'].push(issue);
      } else if (issue.riskScore.score >= 65) {
        report.summary.highPriorityCount++;
        report.priorities['P1 - High'].push(issue);
      } else if (issue.riskScore.score >= 45) {
        report.priorities['P2 - Medium'].push(issue);
      } else if (issue.riskScore.score >= 25) {
        report.priorities['P3 - Low'].push(issue);
      } else {
        report.priorities['P4 - Informational'].push(issue);
      }
    }
    
    report.summary.averageScore = issues.length > 0 ? 
      Math.round(report.summary.totalScore / issues.length) : 0;
    
    return report;
  }

  /**
   * Generate prioritized recommendations
   */
  generateRecommendations(prioritizedIssues) {
    const recommendations = [];
    
    // Top 3 highest priority issues
    const topIssues = prioritizedIssues.slice(0, 3);
    
    for (let i = 0; i < topIssues.length; i++) {
      const issue = topIssues[i];
      recommendations.push({
        priority: i + 1,
        issueId: issue.id || `issue-${i}`,
        title: issue.title,
        severity: issue.severity,
        riskScore: issue.riskScore.score,
        priorityLevel: issue.riskScore.priority,
        recommendation: this.generateIssueRecommendation(issue),
        estimatedEffort: this.estimateRemediationEffort(issue),
        businessImpact: this.assessBusinessImpact(issue)
      });
    }
    
    return recommendations;
  }

  /**
   * Generate specific recommendation for an issue
   */
  generateIssueRecommendation(issue) {
    const baseRecommendation = issue.suggestion || 'Review and remediate this issue';
    
    if (issue.riskScore.score >= 80) {
      return `URGENT: ${baseRecommendation} - This issue poses critical risk to your application.`;
    } else if (issue.riskScore.score >= 65) {
      return `HIGH PRIORITY: ${baseRecommendation} - Address this issue in the next sprint.`;
    } else if (issue.riskScore.score >= 45) {
      return `MEDIUM PRIORITY: ${baseRecommendation} - Plan remediation in upcoming iterations.`;
    } else {
      return `LOW PRIORITY: ${baseRecommendation} - Consider addressing during regular maintenance.`;
    }
  }

  /**
   * Estimate remediation effort
   */
  estimateRemediationEffort(issue) {
    const suggestion = issue.suggestion?.toLowerCase() || '';
    
    if (this.containsAny(suggestion, ['simple', 'easily', 'remove', 'delete'])) {
      return '1-2 hours';
    } else if (this.containsAny(suggestion, ['refactor', 'redesign', 'architecture'])) {
      return '2-4 weeks';
    } else if (this.containsAny(suggestion, ['complex', 'difficult', 'significant'])) {
      return '1-2 weeks';
    } else {
      return '1-3 days';
    }
  }

  /**
   * Assess business impact
   */
  assessBusinessImpact(issue) {
    if (issue.riskScore.score >= 80) {
      return 'Critical - Could result in data breach, regulatory fines, or service disruption';
    } else if (issue.riskScore.score >= 65) {
      return 'High - Significant security risk requiring immediate attention';
    } else if (issue.riskScore.score >= 45) {
      return 'Medium - Moderate security risk that should be addressed';
    } else {
      return 'Low - Minor security improvement opportunity';
    }
  }
}

export default SeverityScorer;

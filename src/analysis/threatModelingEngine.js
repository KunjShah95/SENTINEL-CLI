import { createAttackSurfaceMapper } from './attackSurfaceMapper.js';

/**
 * Threat Modeling Engine - STRIDE-based threat analysis
 */
export class ThreatModelingEngine {
  constructor(projectPath = process.cwd(), context = null) {
    this.projectPath = projectPath;
    this.context = context;
    this.attackSurfaceMapper = createAttackSurfaceMapper(projectPath, context);

    // STRIDE categories
    this.strideCategories = {
      S: 'Spoofing',
      T: 'Tampering',
      R: 'Repudiation',
      I: 'Information Disclosure',
      D: 'Denial of Service',
      E: 'Elevation of Privilege'
    };
  }

  /**
   * Generate threat model
   */
  async generateThreatModel() {
    const model = {
      timestamp: new Date().toISOString(),
      projectPath: this.projectPath,
      attackSurface: await this.attackSurfaceMapper.mapAttackSurface(),
      threats: [],
      dataFlowDiagram: null,
      trustBoundaries: [],
      assets: [],
      mitigations: []
    };

    // Identify assets
    model.assets = this.identifyAssets(model.attackSurface);

    // Identify trust boundaries
    model.trustBoundaries = this.identifyTrustBoundaries(model.attackSurface);

    // Generate STRIDE threats
    model.threats = this.generateSTRIDEThreats(model.attackSurface, model.assets, model.trustBoundaries);

    // Suggest mitigations
    model.mitigations = this.suggestMitigations(model.threats);

    return model;
  }

  /**
   * Identify assets
   */
  identifyAssets(attackSurface) {
    const assets = [];

    // User credentials
    if (attackSurface.authenticationPoints.length > 0) {
      assets.push({
        name: 'User Credentials',
        type: 'authentication',
        sensitivity: 'critical',
        locations: attackSurface.authenticationPoints.map(ap => ap.file)
      });
    }

    // Sensitive data
    const sensitiveCategories = {};
    attackSurface.sensitiveData.forEach(sd => {
      if (!sensitiveCategories[sd.category]) {
        sensitiveCategories[sd.category] = [];
      }
      sensitiveCategories[sd.category].push(sd.file);
    });

    Object.entries(sensitiveCategories).forEach(([category, files]) => {
      assets.push({
        name: category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        type: 'data',
        sensitivity: ['password', 'creditCard', 'ssn'].includes(category) ? 'critical' : 'high',
        locations: [...new Set(files)]
      });
    });

    // API endpoints
    if (attackSurface.apiEndpoints.length > 0) {
      assets.push({
        name: 'API Endpoints',
        type: 'service',
        sensitivity: 'high',
        count: attackSurface.apiEndpoints.length,
        locations: [...new Set(attackSurface.apiEndpoints.map(e => e.file))]
      });
    }

    // External integrations
    attackSurface.externalIntegrations.forEach(integration => {
      assets.push({
        name: `${integration.service} Integration`,
        type: 'integration',
        sensitivity: integration.risk === 'high' ? 'high' : 'medium',
        location: integration.file
      });
    });

    return assets;
  }

  /**
   * Identify trust boundaries
   */
  identifyTrustBoundaries(attackSurface) {
    const boundaries = [];

    // Client to Server boundary
    if (attackSurface.apiEndpoints.length > 0) {
      boundaries.push({
        name: 'Client-Server Boundary',
        type: 'network',
        description: 'Boundary between client applications and server API',
        crossings: attackSurface.apiEndpoints.length,
        risk: 'high'
      });
    }

    // Application to Database boundary
    const dbFlows = attackSurface.dataFlows.filter(f =>
      f.type === 'user_to_database' || f.type === 'database_to_user'
    );

    if (dbFlows.length > 0) {
      boundaries.push({
        name: 'Application-Database Boundary',
        type: 'data',
        description: 'Boundary between application code and database',
        crossings: dbFlows.length,
        risk: 'high'
      });
    }

    // Application to External Services boundary
    if (attackSurface.externalIntegrations.length > 0) {
      boundaries.push({
        name: 'Application-External Services Boundary',
        type: 'network',
        description: 'Boundary between application and third-party services',
        crossings: attackSurface.externalIntegrations.length,
        risk: 'medium'
      });
    }

    // User Input boundary
    if (attackSurface.userInputs.length > 0) {
      boundaries.push({
        name: 'User Input Boundary',
        type: 'validation',
        description: 'Boundary where user input enters the application',
        crossings: attackSurface.userInputs.length,
        risk: 'high'
      });
    }

    return boundaries;
  }

  /**
   * Generate STRIDE threats
   */
  generateSTRIDEThreats(attackSurface, assets, _trustBoundaries) {
    const threats = [];

    // Spoofing threats
    threats.push(...this.identifySpoofingThreats(attackSurface, assets));

    // Tampering threats
    threats.push(...this.identifyTamperingThreats(attackSurface, assets));

    // Repudiation threats
    threats.push(...this.identifyRepudiationThreats(attackSurface));

    // Information Disclosure threats
    threats.push(...this.identifyInformationDisclosureThreats(attackSurface, assets));

    // Denial of Service threats
    threats.push(...this.identifyDoSThreats(attackSurface));

    // Elevation of Privilege threats
    threats.push(...this.identifyElevationOfPrivilegeThreats(attackSurface));

    // Calculate risk for each threat
    threats.forEach(threat => {
      threat.riskScore = this.calculateThreatRisk(threat);
    });

    // Sort by risk
    threats.sort((a, b) => b.riskScore - a.riskScore);

    return threats;
  }

  /**
   * Identify Spoofing threats
   */
  identifySpoofingThreats(attackSurface, _assets) {
    const threats = [];

    // Weak authentication
    const weakAuthPoints = attackSurface.authenticationPoints.filter(ap =>
      !ap.hasMFA && !ap.hasRateLimit
    );

    weakAuthPoints.forEach(ap => {
      threats.push({
        id: `S-${threats.length + 1}`,
        category: 'Spoofing',
        title: 'Weak Authentication Mechanism',
        description: 'Authentication endpoint lacks MFA and rate limiting',
        asset: 'User Credentials',
        severity: 'high',
        likelihood: 'medium',
        impact: 'high',
        location: {
          file: ap.file,
          line: ap.line
        },
        cwe: 'CWE-287: Improper Authentication'
      });
    });

    // Unauthenticated endpoints
    const unauthEndpoints = attackSurface.apiEndpoints.filter(e => !e.authentication);

    unauthEndpoints.forEach(endpoint => {
      threats.push({
        id: `S-${threats.length + 1}`,
        category: 'Spoofing',
        title: 'Unauthenticated API Endpoint',
        description: `${endpoint.method} ${endpoint.path} has no authentication`,
        asset: 'API Endpoints',
        severity: 'high',
        likelihood: 'high',
        impact: 'medium',
        location: {
          file: endpoint.file
        },
        cwe: 'CWE-306: Missing Authentication for Critical Function'
      });
    });

    return threats;
  }

  /**
   * Identify Tampering threats
   */
  identifyTamperingThreats(attackSurface, _assets) {
    const threats = [];

    // Unvalidated inputs
    const unvalidatedInputs = attackSurface.userInputs.filter(i => !i.validated);

    unvalidatedInputs.forEach(input => {
      threats.push({
        id: `T-${threats.length + 1}`,
        category: 'Tampering',
        title: 'Unvalidated User Input',
        description: 'User input is not validated before processing',
        asset: 'Application Logic',
        severity: input.risk === 'critical' ? 'critical' : 'high',
        likelihood: 'high',
        impact: 'high',
        location: {
          file: input.file,
          line: input.line
        },
        cwe: 'CWE-20: Improper Input Validation'
      });
    });

    // SQL injection risks
    const sqlFlows = attackSurface.dataFlows.filter(f =>
      f.type === 'user_to_database' && f.concerns.includes('SQL Injection')
    );

    sqlFlows.forEach(flow => {
      threats.push({
        id: `T-${threats.length + 1}`,
        category: 'Tampering',
        title: 'Potential SQL Injection',
        description: 'User input flows to database without proper sanitization',
        asset: 'Database',
        severity: 'critical',
        likelihood: 'high',
        impact: 'critical',
        location: {
          file: flow.file
        },
        cwe: 'CWE-89: SQL Injection'
      });
    });

    return threats;
  }

  /**
   * Identify Repudiation threats
   */
  identifyRepudiationThreats(attackSurface) {
    const threats = [];

    // Missing audit logging
    if (attackSurface.authenticationPoints.length > 0) {
      threats.push({
        id: `R-1`,
        category: 'Repudiation',
        title: 'Insufficient Audit Logging',
        description: 'Authentication events may not be properly logged',
        asset: 'Audit Trail',
        severity: 'medium',
        likelihood: 'medium',
        impact: 'medium',
        cwe: 'CWE-778: Insufficient Logging'
      });
    }

    return threats;
  }

  /**
   * Identify Information Disclosure threats
   */
  identifyInformationDisclosureThreats(attackSurface, _assets) {
    const threats = [];

    // Logged sensitive data
    const loggedSensitive = attackSurface.sensitiveData.filter(s => s.logged);

    loggedSensitive.forEach(data => {
      threats.push({
        id: `I-${threats.length + 1}`,
        category: 'Information Disclosure',
        title: 'Sensitive Data in Logs',
        description: `${data.category} may be logged`,
        asset: data.category,
        severity: 'critical',
        likelihood: 'high',
        impact: 'high',
        location: {
          file: data.file,
          line: data.line
        },
        cwe: 'CWE-532: Information Exposure Through Log Files'
      });
    });

    // Unencrypted sensitive data
    const unencrypted = attackSurface.sensitiveData.filter(s =>
      !s.encrypted && ['password', 'creditCard', 'ssn'].includes(s.category)
    );

    unencrypted.forEach(data => {
      threats.push({
        id: `I-${threats.length + 1}`,
        category: 'Information Disclosure',
        title: 'Unencrypted Sensitive Data',
        description: `${data.category} is not encrypted`,
        asset: data.category,
        severity: 'critical',
        likelihood: 'medium',
        impact: 'critical',
        location: {
          file: data.file,
          line: data.line
        },
        cwe: 'CWE-311: Missing Encryption of Sensitive Data'
      });
    });

    return threats;
  }

  /**
   * Identify Denial of Service threats
   */
  identifyDoSThreats(attackSurface) {
    const threats = [];

    // Missing rate limiting
    const noRateLimit = attackSurface.apiEndpoints.filter(e =>
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(e.method) &&
      !/rateLimit|rate-limit/.test(e.file)
    );

    if (noRateLimit.length > 0) {
      threats.push({
        id: `D-1`,
        category: 'Denial of Service',
        title: 'Missing Rate Limiting',
        description: `${noRateLimit.length} endpoints lack rate limiting`,
        asset: 'API Availability',
        severity: 'medium',
        likelihood: 'high',
        impact: 'medium',
        locations: noRateLimit.map(e => ({ file: e.file })),
        cwe: 'CWE-770: Allocation of Resources Without Limits'
      });
    }

    return threats;
  }

  /**
   * Identify Elevation of Privilege threats
   */
  identifyElevationOfPrivilegeThreats(attackSurface) {
    const threats = [];

    // Admin endpoints without proper auth
    const adminEndpoints = attackSurface.apiEndpoints.filter(e =>
      /admin|superuser|root/.test(e.path) && !e.authentication
    );

    adminEndpoints.forEach(endpoint => {
      threats.push({
        id: `E-${threats.length + 1}`,
        category: 'Elevation of Privilege',
        title: 'Unprotected Admin Endpoint',
        description: `Admin endpoint ${endpoint.path} lacks authentication`,
        asset: 'Administrative Functions',
        severity: 'critical',
        likelihood: 'high',
        impact: 'critical',
        location: {
          file: endpoint.file
        },
        cwe: 'CWE-269: Improper Privilege Management'
      });
    });

    return threats;
  }

  /**
   * Calculate threat risk score
   */
  calculateThreatRisk(threat) {
    const severityScores = {
      critical: 10,
      high: 7,
      medium: 4,
      low: 2
    };

    const likelihoodScores = {
      high: 3,
      medium: 2,
      low: 1
    };

    const impactScores = {
      critical: 10,
      high: 7,
      medium: 4,
      low: 2
    };

    const severity = severityScores[threat.severity] || 0;
    const likelihood = likelihoodScores[threat.likelihood] || 0;
    const impact = impactScores[threat.impact] || 0;

    return (severity + likelihood * impact) / 2;
  }

  /**
   * Suggest mitigations
   */
  suggestMitigations(threats) {
    const mitigationMap = new Map();

    threats.forEach(threat => {
      const mitigation = this.getMitigationForThreat(threat);

      if (mitigation) {
        const key = mitigation.title;

        if (mitigationMap.has(key)) {
          mitigationMap.get(key).threats.push(threat.id);
        } else {
          mitigation.threats = [threat.id];
          mitigationMap.set(key, mitigation);
        }
      }
    });

    return Array.from(mitigationMap.values());
  }

  /**
   * Get mitigation for threat
   */
  getMitigationForThreat(threat) {
    const mitigations = {
      'Weak Authentication Mechanism': {
        title: 'Implement Multi-Factor Authentication',
        description: 'Add MFA to all authentication endpoints',
        effort: 'medium',
        priority: 'high',
        steps: [
          'Choose MFA provider (TOTP, SMS, Email)',
          'Integrate MFA library',
          'Update authentication flow',
          'Add user enrollment process'
        ]
      },
      'Unauthenticated API Endpoint': {
        title: 'Add Authentication to Endpoints',
        description: 'Implement authentication middleware for all API endpoints',
        effort: 'low',
        priority: 'high',
        steps: [
          'Create authentication middleware',
          'Apply middleware to routes',
          'Implement JWT verification',
          'Add error handling'
        ]
      },
      'Unvalidated User Input': {
        title: 'Implement Input Validation',
        description: 'Add validation schemas for all user inputs',
        effort: 'medium',
        priority: 'high',
        steps: [
          'Choose validation library (Joi, Yup, Zod)',
          'Define schemas for each endpoint',
          'Add validation middleware',
          'Implement error responses'
        ]
      },
      'Potential SQL Injection': {
        title: 'Use Parameterized Queries',
        description: 'Replace string concatenation with parameterized queries',
        effort: 'low',
        priority: 'critical',
        steps: [
          'Identify all database queries',
          'Convert to parameterized queries',
          'Use ORM where possible',
          'Add query validation'
        ]
      },
      'Sensitive Data in Logs': {
        title: 'Sanitize Logs',
        description: 'Remove sensitive data from logs',
        effort: 'low',
        priority: 'critical',
        steps: [
          'Identify all logging statements',
          'Create log sanitization function',
          'Apply to all logs',
          'Review log output'
        ]
      },
      'Unencrypted Sensitive Data': {
        title: 'Encrypt Sensitive Data',
        description: 'Implement encryption for sensitive data at rest',
        effort: 'high',
        priority: 'critical',
        steps: [
          'Choose encryption method',
          'Implement key management',
          'Encrypt data at rest',
          'Encrypt data in transit'
        ]
      },
      'Missing Rate Limiting': {
        title: 'Implement Rate Limiting',
        description: 'Add rate limiting to all endpoints',
        effort: 'low',
        priority: 'medium',
        steps: [
          'Choose rate limiting library',
          'Configure limits per endpoint',
          'Implement rate limit middleware',
          'Add rate limit headers'
        ]
      },
      'Unprotected Admin Endpoint': {
        title: 'Protect Admin Endpoints',
        description: 'Add authentication and authorization to admin endpoints',
        effort: 'low',
        priority: 'critical',
        steps: [
          'Implement role-based access control',
          'Add admin middleware',
          'Verify admin permissions',
          'Audit admin access'
        ]
      }
    };

    return mitigations[threat.title] || null;
  }

  /**
   * Export threat model to JSON
   */
  async exportThreatModel(model, filepath) {
    const fs = await import('fs/promises');
    await fs.writeFile(filepath, JSON.stringify(model, null, 2));
  }
}

// Factory function
export function createThreatModelingEngine(projectPath, context) {
  return new ThreatModelingEngine(projectPath, context);
}

export default ThreatModelingEngine;

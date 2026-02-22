import { readFile } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

class PolicyEngine {
  constructor(options = {}) {
    this.policies = new Map();
    this.waivers = new Map();
    this.policyDir = options.policyDir || '.sentinel/policies';
    this.defaultSeverity = options.defaultSeverity || 'error';
    this.enforcementMode = options.enforcementMode || 'advisory';
    this.policyVersion = options.policyVersion || '1.0.0';
    this.policyBundles = new Map();
    this.policyPrecedence = ['org', 'repo', 'local'];
    this.simulationMode = false;
    this.simulationResults = null;
    this.organizationPolicies = new Map();
    this.repositoryPolicies = new Map();
    this.localPolicies = new Map();
  }

  setPolicyVersion(version) {
    this.policyVersion = version;
  }

  createPolicyBundle(policies, metadata = {}) {
    const bundleId = `bundle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const policiesData = {};
    for (const policyId of policies) {
      const policy = this.policies.get(policyId);
      if (policy) {
        policiesData[policyId] = policy;
      }
    }

    const bundle = {
      id: bundleId,
      version: this.policyVersion,
      createdAt: new Date().toISOString(),
      policies: policiesData,
      metadata,
      checksum: null,
      signature: null,
    };

    bundle.checksum = this.calculateChecksum(bundle);
    this.policyBundles.set(bundleId, bundle);

    return bundle;
  }

  calculateChecksum(bundle) {
    const data = JSON.stringify({
      version: bundle.version,
      policies: bundle.policies,
      metadata: bundle.metadata,
    });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  signBundle(bundleId, secretKey) {
    const bundle = this.policyBundles.get(bundleId);
    if (!bundle) return null;

    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(JSON.stringify({
      id: bundle.id,
      version: bundle.version,
      checksum: bundle.checksum,
    }));
    
    bundle.signature = hmac.digest('hex');
    bundle.signedAt = new Date().toISOString();
    
    return bundle;
  }

  verifyBundleSignature(bundleId, secretKey) {
    const bundle = this.policyBundles.get(bundleId);
    if (!bundle || !bundle.signature) return false;

    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(JSON.stringify({
      id: bundle.id,
      version: bundle.version,
      checksum: bundle.checksum,
    }));

    return hmac.digest('hex') === bundle.signature;
  }

  loadPolicyBundle(bundle, options = {}) {
    const { verifyChecksum = true, secretKey = null } = options;

    if (verifyChecksum) {
      const calculatedChecksum = this.calculateChecksum(bundle);
      if (calculatedChecksum !== bundle.checksum) {
        throw new Error('Policy bundle checksum verification failed');
      }
    }

    if (secretKey && bundle.signature) {
      const isValid = this.verifyBundleSignature(bundle.id, secretKey);
      if (!isValid) {
        throw new Error('Policy bundle signature verification failed');
      }
    }

    for (const [policyId, policy] of Object.entries(bundle.policies)) {
      this.policies.set(policyId, policy);
    }

    return true;
  }

  setPolicyPrecedence(precedence) {
    const validOrders = [
      ['org', 'repo', 'local'],
      ['local', 'repo', 'org'],
    ];
    
    if (validOrders.some(order => JSON.stringify(order) === JSON.stringify(precedence))) {
      this.policyPrecedence = precedence;
    }
  }

  organizePoliciesByScope(policies) {
    const organized = {
      org: [],
      repo: [],
      local: [],
    };

    for (const policy of policies) {
      const scope = policy.scope || 'local';
      if (organized[scope]) {
        organized[scope].push(policy);
      } else {
        organized.local.push(policy);
      }
    }

    return organized;
  }

  resolvePolicyPrecedence(policyId) {
    if (this.localPolicies.has(policyId)) {
      return { policy: this.localPolicies.get(policyId), scope: 'local' };
    }
    if (this.repositoryPolicies.has(policyId)) {
      return { policy: this.repositoryPolicies.get(policyId), scope: 'repo' };
    }
    if (this.organizationPolicies.has(policyId)) {
      return { policy: this.organizationPolicies.get(policyId), scope: 'org' };
    }
    return null;
  }

  loadScopedPolicy(policy, scope) {
    if (!this.validatePolicy(policy)) {
      return false;
    }

    this.policies.set(policy.id, policy);

    switch (scope) {
      case 'org':
        this.organizationPolicies.set(policy.id, policy);
        break;
      case 'repo':
        this.repositoryPolicies.set(policy.id, policy);
        break;
      case 'local':
      default:
        this.localPolicies.set(policy.id, policy);
        break;
    }

    return true;
  }

  enableSimulationMode() {
    this.simulationMode = true;
    this.simulationResults = {
      enabled: true,
      simulatedAt: new Date().toISOString(),
      scenarios: [],
    };
  }

  disableSimulationMode() {
    this.simulationMode = false;
    const results = this.simulationResults;
    this.simulationResults = null;
    return results;
  }

  simulatePolicyChange(issues, changes) {
    if (!this.simulationMode) {
      this.enableSimulationMode();
    }

    const originalPolicies = new Map(this.policies);
    const simulatedResults = [];

    for (const change of changes) {
      if (change.action === 'add') {
        this.policies.set(change.policy.id, change.policy);
      } else if (change.action === 'remove') {
        this.policies.delete(change.policyId);
      } else if (change.action === 'modify') {
        this.policies.set(change.policy.id, change.policy);
      }

      const result = this.evaluate(issues);
      simulatedResults.push({
        change,
        result: {
          violations: result.violations.length,
          score: result.score,
          compliant: result.compliant,
        },
      });
    }

    this.policies = originalPolicies;

    this.simulationResults.scenarios.push({
      id: `scenario_${Date.now()}`,
      changes,
      results: simulatedResults,
      comparedAt: new Date().toISOString(),
    });

    return simulatedResults;
  }

  getSimulationReport() {
    if (!this.simulationResults) {
      return null;
    }

    return {
      enabled: this.simulationResults.enabled,
      scenarioCount: this.simulationResults.scenarios.length,
      scenarios: this.simulationResults.scenarios,
    };
  }

  async loadPolicies(policyPaths = []) {
    const paths = policyPaths.length > 0 
      ? policyPaths 
      : [this.policyDir];

    for (const policyPath of paths) {
      await this.loadPolicyFromPath(policyPath);
    }

    return this.policies.size;
  }

  async loadPolicyFromPath(policyPath) {
    try {
      const content = await readFile(policyPath, 'utf8');
      const policy = this.parsePolicy(content, policyPath);
      
      if (this.validatePolicy(policy)) {
        this.policies.set(policy.id, policy);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(`Failed to load policy from ${policyPath}:`, error.message);
      }
    }
  }

  parsePolicy(content, sourcePath) {
    // Support YAML, JSON, or JavaScript policies
    const ext = path.extname(sourcePath);
    
    if (ext === '.json') {
      return JSON.parse(content);
    }
    
    if (ext === '.yaml' || ext === '.yml') {
      // Simple YAML parser for basic structures
      return this.parseYAML(content);
    }
    
    if (ext === '.js') {
      // Dynamic import for JS policies
      return import(sourcePath).then(m => m.default || m);
    }

    throw new Error(`Unsupported policy format: ${ext}`);
  }

  parseYAML(content) {
    const policy = {};
    let currentSection = null;
    let currentArray = null;

    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Check for section header
      if (trimmed.endsWith(':')) {
        currentSection = trimmed.slice(0, -1);
        policy[currentSection] = {};
        currentArray = null;
        continue;
      }

      // Check for array item
      if (trimmed.startsWith('- ')) {
        if (!currentArray) {
          currentArray = [];
          policy[currentSection] = currentArray;
        }
        currentArray.push(trimmed.slice(2));
        continue;
      }

      // Key-value pair
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.slice(0, colonIndex).trim();
        const value = trimmed.slice(colonIndex + 1).trim();
        
        if (currentSection && policy[currentSection]) {
          policy[currentSection][key] = this.parseValue(value);
        } else {
          policy[key] = this.parseValue(value);
        }
      }
    }

    return policy;
  }

  parseValue(value) {
    // Try to parse as boolean
    if (value === 'true') return true;
    if (value === 'false') return false;
    
    // Try to parse as number
    if (/^-?\d+$/.test(value)) return parseInt(value, 10);
    if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
    
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }

    return value;
  }

  validatePolicy(policy) {
    const required = ['id', 'name', 'rules'];
    
    for (const field of required) {
      if (!policy[field]) {
        console.warn(`Policy missing required field: ${field}`);
        return false;
      }
    }

    return true;
  }

  evaluate(issues, context = {}) {
    const violations = [];
    const passed = [];

    for (const [policyId, policy] of this.policies) {
      const result = this.evaluatePolicy(policy, issues, context);
      
      if (result.violations.length > 0) {
        violations.push({
          policy: policyId,
          policyName: policy.name,
          severity: policy.severity || this.defaultSeverity,
          violations: result.violations,
        });
      } else {
        passed.push({
          policy: policyId,
          policyName: policy.name,
        });
      }
    }

    const evaluatedPolicies = [...violations, ...passed];
    const failGateResult = this.evaluateFailGate(evaluatedPolicies);

    return {
      passed,
      violations,
      compliant: violations.length === 0,
      score: this.calculateScore(passed, violations),
      failGate: failGateResult,
    };
  }

  evaluateFailGate(evaluatedPolicies) {
    let highestSeverity = 'none';
    let hasBlockingViolation = false;

    for (const policyResult of evaluatedPolicies) {
      if (policyResult.violations) {
        for (const violation of policyResult.violations) {
          const severityOrder = ['info', 'low', 'medium', 'high', 'critical'];
          const vIndex = severityOrder.indexOf(violation.severity?.toLowerCase() || 'info');
          const hIndex = severityOrder.indexOf(highestSeverity);
          
          if (vIndex > hIndex) {
            highestSeverity = violation.severity;
          }
          
          if (violation.severity === 'critical' || violation.severity === 'high') {
            hasBlockingViolation = true;
          }
        }
      }
    }

    return {
      highestSeverity,
      hasBlockingViolation,
      shouldFail: this.enforcementMode === 'error' && hasBlockingViolation,
    };
  }

  setEnforcementMode(mode) {
    const validModes = ['advisory', 'warning', 'error'];
    if (validModes.includes(mode)) {
      this.enforcementMode = mode;
    }
  }

  evaluatePolicy(policy, issues, context) {
    const violations = [];

    for (const rule of policy.rules || []) {
      const matchingIssues = issues.filter(issue => 
        this.matchesRule(issue, rule, context)
      );

      if (rule.mustNotExist && matchingIssues.length > 0) {
        violations.push({
          rule: rule.id || rule.name,
          message: rule.message || `Found ${matchingIssues.length} issues matching rule`,
          issues: matchingIssues,
          severity: rule.severity || 'error',
        });
      }

      if (rule.maxCount !== undefined && matchingIssues.length > rule.maxCount) {
        violations.push({
          rule: rule.id || rule.name,
          message: `Exceeded maximum count: found ${matchingIssues.length}, allowed ${rule.maxCount}`,
          issues: matchingIssues,
          severity: rule.severity || 'warning',
        });
      }

      if (rule.minCount !== undefined && matchingIssues.length < rule.minCount) {
        violations.push({
          rule: rule.id || rule.name,
          message: `Below minimum count: found ${matchingIssues.length}, required ${rule.minCount}`,
          issues: matchingIssues,
          severity: rule.severity || 'warning',
        });
      }
    }

    return { violations };
  }

  matchesRule(issue, rule, context) {
    // Check analyzer match
    if (rule.analyzer && issue.analyzer !== rule.analyzer) {
      return false;
    }

    // Check type match
    if (rule.type && issue.type !== rule.type) {
      return false;
    }

    // Check severity match
    if (rule.severity && issue.severity !== rule.severity) {
      return false;
    }

    // Check path pattern
    if (rule.pathPattern && !new RegExp(rule.pathPattern).test(issue.file || '')) {
      return false;
    }

    // Check tags
    if (rule.tags && rule.tags.length > 0) {
      const issueTags = issue.tags || [];
      if (!rule.tags.some(tag => issueTags.includes(tag))) {
        return false;
      }
    }

    // Check custom condition
    if (rule.condition && typeof rule.condition === 'function') {
      return rule.condition(issue, context);
    }

    return true;
  }

  calculateScore(passed, violations) {
    const total = passed.length + violations.length;
    if (total === 0) return 100;

    let penalty = 0;
    for (const v of violations) {
      switch (v.severity) {
        case 'critical': penalty += 25; break;
        case 'error': penalty += 15; break;
        case 'warning': penalty += 5; break;
        case 'info': penalty += 1; break;
      }
    }

    return Math.max(0, 100 - penalty);
  }

  createPolicyTemplate(name, type = 'security') {
    const templates = {
      security: {
        id: `security-policy-${Date.now()}`,
        name: name || 'Security Policy',
        description: 'Enforces security best practices',
        severity: 'error',
        rules: [
          {
            id: 'no-critical-vulnerabilities',
            name: 'No Critical Vulnerabilities',
            message: 'Critical security vulnerabilities are not allowed',
            severity: 'critical',
            analyzer: 'security',
            mustNotExist: true,
          },
          {
            id: 'max-high-severity',
            name: 'Maximum High Severity Issues',
            message: 'Too many high severity issues',
            severity: 'high',
            maxCount: 5,
          },
          {
            id: 'no-secrets',
            name: 'No Secrets in Code',
            message: 'Secrets and credentials must not be committed',
            severity: 'critical',
            type: 'secret',
            mustNotExist: true,
          },
        ],
      },
      quality: {
        id: `quality-policy-${Date.now()}`,
        name: name || 'Quality Policy',
        description: 'Enforces code quality standards',
        severity: 'warning',
        rules: [
          {
            id: 'max-complexity',
            name: 'Maximum Complexity',
            message: 'Functions should not be too complex',
            severity: 'warning',
            type: 'complex-function',
            maxCount: 10,
          },
          {
            id: 'no-console',
            name: 'No Console Statements',
            message: 'Console statements should be removed or use logger',
            severity: 'info',
            type: 'console-statement',
            maxCount: 3,
          },
        ],
      },
      compliance: {
        id: `compliance-policy-${Date.now()}`,
        name: name || 'Compliance Policy',
        description: 'Ensures regulatory compliance',
        severity: 'error',
        rules: [
          {
            id: 'gdpr-data-protection',
            name: 'GDPR Data Protection',
            message: 'Must implement data protection measures',
            severity: 'critical',
            tags: ['privacy', 'gdpr'],
            mustNotExist: true,
          },
        ],
      },
    };

    return templates[type] || templates.security;
  }

  exportPolicy(policyId, format = 'yaml') {
    const policy = this.policies.get(policyId);
    if (!policy) return null;

    if (format === 'json') {
      return JSON.stringify(policy, null, 2);
    }

    // Convert to YAML
    let yaml = `# ${policy.name}\n`;
    yaml += `# ${policy.description}\n\n`;
    
    for (const [key, value] of Object.entries(policy)) {
      if (key === 'rules' && Array.isArray(value)) {
        yaml += `${key}:\n`;
        for (const rule of value) {
          yaml += `  - id: ${rule.id}\n`;
          yaml += `    name: ${rule.name}\n`;
          if (rule.message) yaml += `    message: ${rule.message}\n`;
          if (rule.severity) yaml += `    severity: ${rule.severity}\n`;
          if (rule.analyzer) yaml += `    analyzer: ${rule.analyzer}\n`;
          if (rule.type) yaml += `    type: ${rule.type}\n`;
          if (rule.maxCount !== undefined) yaml += `    maxCount: ${rule.maxCount}\n`;
          if (rule.mustNotExist) yaml += `    mustNotExist: true\n`;
        }
      } else if (typeof value === 'object') {
        yaml += `${key}:\n`;
        for (const [k, v] of Object.entries(value)) {
          yaml += `  ${k}: ${v}\n`;
        }
      } else {
        yaml += `${key}: ${value}\n`;
      }
    }

    return yaml;
  }

  getAllPolicies() {
    return Array.from(this.policies.entries()).map(([id, policy]) => ({
      id,
      name: policy.name,
      description: policy.description,
      severity: policy.severity,
      ruleCount: policy.rules?.length || 0,
    }));
  }

  deletePolicy(policyId) {
    return this.policies.delete(policyId);
  }

  createWaiver(issue, justification, options = {}) {
    const waiver = {
      id: `waiver_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      issueId: issue.id,
      issueType: issue.type,
      analyzer: issue.analyzer,
      file: issue.file,
      line: issue.line,
      justification,
      createdAt: new Date().toISOString(),
      expiresAt: options.expiresAt || null,
      createdBy: options.createdBy || 'system',
      approvedBy: options.approvedBy || null,
      severity: issue.severity,
      status: 'active',
    };

    if (options.autoApprove) {
      waiver.approvedAt = new Date().toISOString();
      waiver.status = 'approved';
    }

    this.waivers.set(waiver.id, waiver);

    this.eventBus?.emit('waiver:created', waiver);

    return waiver;
  }

  validateWaiver(waiverId) {
    const waiver = this.waivers.get(waiverId);
    
    if (!waiver) {
      return { valid: false, reason: 'Waiver not found' };
    }

    if (waiver.status === 'revoked') {
      return { valid: false, reason: 'Waiver has been revoked' };
    }

    if (waiver.expiresAt) {
      const expiresAt = new Date(waiver.expiresAt);
      if (expiresAt < new Date()) {
        waiver.status = 'expired';
        return { valid: false, reason: 'Waiver has expired' };
      }
    }

    return { valid: true, waiver };
  }

  getWaiverForIssue(issue) {
    for (const waiver of this.waivers.values()) {
      if (waiver.status !== 'active' && waiver.status !== 'approved') {
        continue;
      }

      const isMatch = 
        waiver.issueId === issue.id ||
        (waiver.issueType === issue.type && waiver.file === issue.file && waiver.line === issue.line) ||
        (waiver.analyzer === issue.analyzer && waiver.file === issue.file);

      if (isMatch) {
        const validation = this.validateWaiver(waiver.id);
        if (validation.valid) {
          return waiver;
        }
      }
    }

    return null;
  }

  revokeWaiver(waiverId, reason) {
    const waiver = this.waivers.get(waiverId);
    if (waiver) {
      waiver.status = 'revoked';
      waiver.revokedAt = new Date().toISOString();
      waiver.revocationReason = reason;
      this.eventBus?.emit('waiver:revoked', waiver);
      return true;
    }
    return false;
  }

  getActiveWaivers() {
    const active = [];
    for (const waiver of this.waivers.values()) {
      if (waiver.status === 'active' || waiver.status === 'approved') {
        const validation = this.validateWaiver(waiver.id);
        if (validation.valid) {
          active.push(waiver);
        }
      }
    }
    return active;
  }

  evaluateWithWaivers(issues, context = {}) {
    const result = this.evaluate(issues, context);
    
    const waivedViolations = [];
    const activeViolations = [];

    for (const violation of result.violations) {
      const violationHasWaiver = violation.issues.some(issue => {
        const waiver = this.getWaiverForIssue(issue);
        return waiver !== null;
      });

      if (violationHasWaiver) {
        waivedViolations.push(violation);
      } else {
        activeViolations.push(violation);
      }
    }

    return {
      ...result,
      violations: activeViolations,
      waivedViolations,
      waiversApplied: waivedViolations.length,
    };
  }
}

export default PolicyEngine;

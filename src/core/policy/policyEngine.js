import { readFile } from 'fs/promises';
import path from 'path';

class PolicyEngine {
  constructor(options = {}) {
    this.policies = new Map();
    this.policyDir = options.policyDir || '.sentinel/policies';
    this.defaultSeverity = options.defaultSeverity || 'error';
    this.enforcementMode = options.enforcementMode || 'advisory'; // advisory, warning, error
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

    return {
      passed,
      violations,
      compliant: violations.length === 0,
      score: this.calculateScore(passed, violations),
    };
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
}

export default PolicyEngine;

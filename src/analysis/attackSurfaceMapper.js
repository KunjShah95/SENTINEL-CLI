import { promises as fs } from 'fs';
import { join } from 'path';
import { glob } from 'glob';

/**
 * Attack Surface Mapping - Identify entry points, data flows, and attack vectors
 */
export class AttackSurfaceMapper {
  constructor(projectPath = process.cwd(), context = null) {
    this.projectPath = projectPath;
    this.context = context;
  }

  /**
   * Map complete attack surface
   */
  async mapAttackSurface() {
    const surface = {
      timestamp: new Date().toISOString(),
      entryPoints: await this.findEntryPoints(),
      apiEndpoints: await this.findAPIEndpoints(),
      userInputs: await this.findUserInputs(),
      dataFlows: await this.analyzeDataFlows(),
      externalIntegrations: await this.findExternalIntegrations(),
      authenticationPoints: await this.findAuthenticationPoints(),
      sensitiveData: await this.findSensitiveDataHandling(),
      riskScore: 0,
      criticalAreas: []
    };

    // Calculate risk score
    surface.riskScore = this.calculateRiskScore(surface);
    surface.criticalAreas = this.identifyCriticalAreas(surface);

    return surface;
  }

  /**
   * Find entry points
   */
  async findEntryPoints() {
    const entryPoints = [];

    // Check common entry files
    const commonEntries = [
      'index.js', 'index.ts', 'main.js', 'main.ts',
      'app.js', 'app.ts', 'server.js', 'server.ts',
      'src/index.js', 'src/index.ts'
    ];

    for (const entry of commonEntries) {
      try {
        await fs.access(join(this.projectPath, entry));
        entryPoints.push({
          file: entry,
          type: 'application_entry',
          risk: 'medium'
        });
      } catch {
        // File doesn't exist
      }
    }

    // Find CLI commands
    const cliFiles = await glob('**/cli.{js,ts}', {
      cwd: this.projectPath,
      ignore: ['**/node_modules/**']
    });

    cliFiles.forEach(file => {
      entryPoints.push({
        file,
        type: 'cli_entry',
        risk: 'medium'
      });
    });

    return entryPoints;
  }

  /**
   * Find API endpoints
   */
  async findAPIEndpoints() {
    const endpoints = [];

    const routeFiles = await glob('**/{routes,api,controllers}/**/*.{js,ts}', {
      cwd: this.projectPath,
      ignore: ['**/node_modules/**', '**/test/**', '**/tests/**']
    });

    for (const file of routeFiles) {
      const filePath = join(this.projectPath, file);
      const content = await fs.readFile(filePath, 'utf-8');

      // Detect Express routes
      const expressRoutes = [
        ...content.matchAll(/\.(get|post|put|patch|delete|all)\(['"]([^'"]+)['"][,\s]/gi)
      ];

      expressRoutes.forEach(match => {
        endpoints.push({
          method: match[1].toUpperCase(),
          path: match[2],
          file,
          framework: 'Express',
          authentication: this.detectAuthentication(content),
          validation: this.detectValidation(content),
          risk: this.assessEndpointRisk(match[1], match[2], content)
        });
      });

      // Detect Fastify routes
      const fastifyRoutes = [
        ...content.matchAll(/fastify\.(get|post|put|patch|delete)\(['"]([^'"]+)['"][,\s]/gi)
      ];

      fastifyRoutes.forEach(match => {
        endpoints.push({
          method: match[1].toUpperCase(),
          path: match[2],
          file,
          framework: 'Fastify',
          authentication: this.detectAuthentication(content),
          validation: this.detectValidation(content),
          risk: this.assessEndpointRisk(match[1], match[2], content)
        });
      });

      // Detect GraphQL resolvers
      if (content.includes('resolvers') || content.includes('GraphQL')) {
        const resolvers = [...content.matchAll(/(\w+):\s*async\s*\(/g)];
        resolvers.forEach(match => {
          endpoints.push({
            method: 'GRAPHQL',
            path: match[1],
            file,
            framework: 'GraphQL',
            authentication: this.detectAuthentication(content),
            validation: this.detectValidation(content),
            risk: 'medium'
          });
        });
      }
    }

    return endpoints;
  }

  /**
   * Find user inputs
   */
  async findUserInputs() {
    const inputs = [];

    const files = await glob('**/*.{js,jsx,ts,tsx}', {
      cwd: this.projectPath,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
    });

    for (const file of files) {
      const filePath = join(this.projectPath, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        // Detect form inputs
        if (/<input|<textarea|<select/.test(line)) {
          inputs.push({
            file,
            line: index + 1,
            type: 'form_input',
            snippet: line.trim(),
            sanitized: /sanitize|escape|xss/i.test(content),
            validated: /validate|check|verify/i.test(content),
            risk: this.assessInputRisk(line, content)
          });
        }

        // Detect API body parsing
        if (/req\.body|request\.body|ctx\.request\.body/.test(line)) {
          inputs.push({
            file,
            line: index + 1,
            type: 'api_body',
            snippet: line.trim(),
            sanitized: /sanitize|escape/.test(content),
            validated: /validate|schema|joi|yup|zod/.test(content),
            risk: this.assessInputRisk(line, content)
          });
        }

        // Detect query parameters
        if (/req\.query|request\.query|ctx\.query/.test(line)) {
          inputs.push({
            file,
            line: index + 1,
            type: 'query_param',
            snippet: line.trim(),
            sanitized: /sanitize|escape/.test(content),
            validated: /validate/.test(content),
            risk: 'medium'
          });
        }
      });
    }

    return inputs;
  }

  /**
   * Analyze data flows
   */
  async analyzeDataFlows() {
    const flows = [];

    const files = await glob('**/*.{js,ts}', {
      cwd: this.projectPath,
      ignore: ['**/node_modules/**', '**/test/**']
    });

    for (const file of files) {
      const filePath = join(this.projectPath, file);
      const content = await fs.readFile(filePath, 'utf-8');

      // User Input → Database
      if (/req\.(body|query|params)/.test(content) && /query|execute|save|create|update|insert/.test(content)) {
        flows.push({
          file,
          type: 'user_to_database',
          risk: 'high',
          concerns: ['SQL Injection', 'Data Validation']
        });
      }

      // User Input → File System
      if (/req\.(body|query|params)/.test(content) && /fs\.|readFile|writeFile|unlink/.test(content)) {
        flows.push({
          file,
          type: 'user_to_filesystem',
          risk: 'critical',
          concerns: ['Path Traversal', 'Arbitrary File Access']
        });
      }

      // User Input → External API
      if (/req\.(body|query|params)/.test(content) && /fetch|axios|request|http\.|https\./.test(content)) {
        flows.push({
          file,
          type: 'user_to_external_api',
          risk: 'medium',
          concerns: ['SSRF', 'Data Leakage']
        });
      }

      // Database → User Response
      if (/query|execute|find|select/.test(content) && /res\.|response\.|return/.test(content)) {
        flows.push({
          file,
          type: 'database_to_user',
          risk: 'medium',
          concerns: ['Information Disclosure', 'XSS']
        });
      }
    }

    return flows;
  }

  /**
   * Find external integrations
   */
  async findExternalIntegrations() {
    const integrations = [];

    const files = await glob('**/*.{js,ts}', {
      cwd: this.projectPath,
      ignore: ['**/node_modules/**']
    });

    const patterns = {
      stripe: /stripe|sk_live|sk_test/i,
      aws: /aws-sdk|AWS\.|s3\.|dynamodb\./i,
      google: /googleapis|gapi/i,
      github: /octokit|github\.com\/api/i,
      firebase: /firebase|firestore/i,
      oauth: /oauth|passport/i,
      payment: /paypal|braintree|square/i,
      email: /sendgrid|mailgun|nodemailer/i,
      database: /mongodb|postgres|mysql|redis/i
    };

    for (const file of files) {
      const filePath = join(this.projectPath, file);
      const content = await fs.readFile(filePath, 'utf-8');

      for (const [service, pattern] of Object.entries(patterns)) {
        if (pattern.test(content)) {
          integrations.push({
            file,
            service,
            risk: ['payment', 'aws', 'database'].includes(service) ? 'high' : 'medium',
            hasCredentials: /api[_-]?key|secret|token/i.test(content)
          });
        }
      }
    }

    return integrations;
  }

  /**
   * Find authentication points
   */
  async findAuthenticationPoints() {
    const authPoints = [];

    const files = await glob('**/*.{js,ts}', {
      cwd: this.projectPath,
      ignore: ['**/node_modules/**']
    });

    for (const file of files) {
      const filePath = join(this.projectPath, file);
      const content = await fs.readFile(filePath, 'utf-8');

      const lines = content.split('\n');

      lines.forEach((line, index) => {
        // Login endpoints
        if (/\/login|\/signin|\/authenticate/.test(line)) {
          authPoints.push({
            file,
            line: index + 1,
            type: 'login_endpoint',
            snippet: line.trim(),
            hasRateLimit: /rateLimit|rate-limit/.test(content),
            hasMFA: /mfa|2fa|totp|authenticator/.test(content),
            risk: 'high'
          });
        }

        // Password handling
        if (/password|passwd/.test(line) && /compare|hash|bcrypt|argon/.test(line)) {
          authPoints.push({
            file,
            line: index + 1,
            type: 'password_handling',
            snippet: line.trim(),
            hashed: /hash|bcrypt|argon|pbkdf2/.test(line),
            risk: /hash|bcrypt|argon/.test(line) ? 'low' : 'critical'
          });
        }

        // JWT handling
        if (/jwt|jsonwebtoken/.test(line)) {
          authPoints.push({
            file,
            line: index + 1,
            type: 'jwt_handling',
            snippet: line.trim(),
            risk: 'medium'
          });
        }
      });
    }

    return authPoints;
  }

  /**
   * Find sensitive data handling
   */
  async findSensitiveDataHandling() {
    const sensitive = [];

    const files = await glob('**/*.{js,ts}', {
      cwd: this.projectPath,
      ignore: ['**/node_modules/**']
    });

    const sensitivePatterns = {
      password: /password|passwd|pwd/i,
      creditCard: /card[_-]?number|credit[_-]?card|ccn/i,
      ssn: /ssn|social[_-]?security/i,
      email: /email[_-]?address|user[_-]?email/i,
      phone: /phone[_-]?number|mobile/i,
      api_key: /api[_-]?key|api[_-]?secret/i,
      token: /access[_-]?token|auth[_-]?token/i,
      pii: /first[_-]?name|last[_-]?name|address|dob|date[_-]?of[_-]?birth/i
    };

    for (const file of files) {
      const filePath = join(this.projectPath, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        for (const [category, pattern] of Object.entries(sensitivePatterns)) {
          if (pattern.test(line)) {
            sensitive.push({
              file,
              line: index + 1,
              category,
              snippet: line.trim().substring(0, 100),
              encrypted: /encrypt|cipher/.test(content),
              logged: /console\.log|logger|log\./.test(line),
              risk: this.assessSensitiveDataRisk(category, line, content)
            });
            break;
          }
        }
      });
    }

    return sensitive;
  }

  /**
   * Helper methods
   */

  detectAuthentication(content) {
    return /auth|authenticate|verify|token|jwt|passport/.test(content);
  }

  detectValidation(content) {
    return /validate|schema|joi|yup|zod|check/.test(content);
  }

  assessEndpointRisk(method, path, content) {
    if (method.toUpperCase() === 'POST' && !this.detectValidation(content)) {
      return 'high';
    }

    if (/admin|delete|remove/.test(path) && !this.detectAuthentication(content)) {
      return 'critical';
    }

    if (method.toUpperCase() === 'GET') {
      return 'low';
    }

    return 'medium';
  }

  assessInputRisk(line, content) {
    if (/eval|exec|system|child_process/.test(content)) {
      return 'critical';
    }

    if (!/(sanitize|escape|validate)/.test(content)) {
      return 'high';
    }

    return 'medium';
  }

  assessSensitiveDataRisk(category, line, content) {
    const highRiskCategories = ['password', 'creditCard', 'ssn', 'api_key'];

    if (highRiskCategories.includes(category)) {
      if (/console\.log|logger/.test(line)) {
        return 'critical';
      }
      if (!/encrypt|hash|cipher/.test(content)) {
        return 'high';
      }
    }

    return 'medium';
  }

  calculateRiskScore(surface) {
    let score = 0;

    // Unauthenticated endpoints
    const unauthEndpoints = surface.apiEndpoints.filter(e => !e.authentication);
    score += unauthEndpoints.length * 10;

    // Unvalidated inputs
    const unvalidatedInputs = surface.userInputs.filter(i => !i.validated);
    score += unvalidatedInputs.length * 5;

    // High-risk data flows
    const highRiskFlows = surface.dataFlows.filter(f => f.risk === 'high' || f.risk === 'critical');
    score += highRiskFlows.length * 15;

    // Sensitive data without encryption
    const unencryptedSensitive = surface.sensitiveData.filter(s => !s.encrypted);
    score += unencryptedSensitive.length * 20;

    return Math.min(score, 100);
  }

  identifyCriticalAreas(surface) {
    const critical = [];

    // Critical endpoints
    surface.apiEndpoints
      .filter(e => e.risk === 'critical')
      .forEach(e => {
        critical.push({
          type: 'endpoint',
          severity: 'critical',
          file: e.file,
          details: `${e.method} ${e.path} lacks authentication`
        });
      });

    // Critical data flows
    surface.dataFlows
      .filter(f => f.risk === 'critical')
      .forEach(f => {
        critical.push({
          type: 'data_flow',
          severity: 'critical',
          file: f.file,
          details: `${f.type}: ${f.concerns.join(', ')}`
        });
      });

    // Logged sensitive data
    surface.sensitiveData
      .filter(s => s.logged)
      .forEach(s => {
        critical.push({
          type: 'sensitive_data',
          severity: 'critical',
          file: s.file,
          line: s.line,
          details: `${s.category} may be logged`
        });
      });

    return critical;
  }
}

// Factory function
export function createAttackSurfaceMapper(projectPath, context) {
  return new AttackSurfaceMapper(projectPath, context);
}

export default AttackSurfaceMapper;

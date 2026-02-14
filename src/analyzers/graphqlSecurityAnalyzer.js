import { BaseAnalyzer } from './baseAnalyzer.js';

export class GraphQLSecurityAnalyzer extends BaseAnalyzer {
  constructor(config = {}) {
    super('GraphQL Security', config);
    this.maxDepth = config.maxDepth || 10;
    this.introspectionEnabled = config.introspectionEnabled ?? false;
    this.alternateIntrospection = config.alternateIntrospection ?? false;
  }

  async analyze(files, context) {
    const issues = [];

    for (const file of files) {
      if (this.shouldAnalyzeFile(file.path)) {
        const fileIssues = await this.analyzeFile(file.path, file.content, context);
        issues.push(...fileIssues);
      }
    }

    return issues;
  }

  async analyzeFile(filePath, content, _context) {
    const issues = [];
    const lines = content.split('\n');

    // Check for GraphQL-specific security issues
    issues.push(...this.checkIntrospection(filePath, content, lines));
    issues.push(...this.checkQueryDepth(filePath, content, lines));
    issues.push(...this.checkBatchBatching(filePath, content, lines));
    issues.push(...this.checkDirectiveInjection(filePath, content, lines));
    issues.push(...this.checkFieldSuggestions(filePath, content, lines));
    issues.push(...this.checkCSRF(filePath, content, lines));
    issues.push(...this.checkAuthorization(filePath, content, lines));

    return issues;
  }

  /**
   * Check if GraphQL introspection is enabled in production
   */
  checkIntrospection(filePath, content, lines) {
    const issues = [];
    const introspectionPatterns = [
      /introspection\s*:\s*true/i,
      /playground\s*:\s*true/i,
      /editorEnabled\s*:\s*true/i,
      /apollo.*playground/i,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      for (const pattern of introspectionPatterns) {
        if (pattern.test(line)) {
          issues.push(this.addIssue({
            severity: 'medium',
            type: 'graphql-introspection',
            title: 'GraphQL Introspection Enabled',
            message: 'GraphQL introspection is enabled, exposing schema details',
            file: filePath,
            line: i + 1,
            column: line.search(pattern) + 1,
            snippet: this.getSnippet(content, i + 1),
            suggestion: 'Disable introspection in production or use Apollo Shield/GraphQL Armor',
            tags: ['graphql', 'security', 'introspection'],
            confidence: 0.9,
          }));
        }
      }
    }

    return issues;
  }

  /**
   * Check for missing query depth limiting
   */
  checkQueryDepth(filePath, content, lines) {
    const issues = [];
    
    // Check if depth limiting is implemented
    const hasDepthLimit = /maxDepth|depth.*limit|queryDepth/i.test(content);
    const isApollo = /apollo.*server|@apollo/i.test(content);
    
    if (isApollo && !hasDepthLimit) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/graphql|apollo|schema/i.test(line)) {
          issues.push(this.addIssue({
            severity: 'medium',
            type: 'graphql-depth',
            title: 'Missing Query Depth Limiting',
            message: 'No query depth limiting detected - vulnerable to DoS attacks',
            file: filePath,
            line: i + 1,
            snippet: this.getSnippet(content, i + 1),
            suggestion: 'Implement maxDepth validation using graphql-depth-limit or Apollo Depth Limiter',
            tags: ['graphql', 'security', 'dos'],
            confidence: 0.7,
          }));
          break;
        }
      }
    }

    return issues;
  }

  /**
   * Check for batch limiting
   */
  checkBatchBatching(filePath, content, lines) {
    const issues = [];
    
    const hasBatchLimit = /batch|throttle|rateLimit|maxBatchSize/i.test(content);
    const isApollo = /apollo|graphql/i.test(content);
    
    if (isApollo && !hasBatchLimit) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/server|schema|resolv/i.test(line)) {
          issues.push(this.addIssue({
            severity: 'low',
            type: 'graphql-batch',
            title: 'Missing Batch Size Limit',
            message: 'No batch query limiting detected',
            file: filePath,
            line: i + 1,
            snippet: this.getSnippet(content, i + 1),
            suggestion: 'Consider limiting batch queries to prevent abuse',
            tags: ['graphql', 'security', 'batch'],
            confidence: 0.5,
          }));
          break;
        }
      }
    }

    return issues;
  }

  /**
   * Check for directive injection
   */
  checkDirectiveInjection(filePath, content, _lines) {
    const issues = [];

    // Check if custom directives are properly validated
    const hasCustomDirective = /directive\s+\w+/i.test(content);
    const hasDirectiveValidation = /validateDirective|directive.*check/i.test(content);

    if (hasCustomDirective && !hasDirectiveValidation) {
      issues.push(this.addIssue({
        severity: 'medium',
        type: 'graphql-directive',
        title: 'Potential Directive Injection',
        message: 'Custom directives found without explicit validation',
        file: filePath,
        line: 1,
        snippet: this.getSnippet(content, 1),
        suggestion: 'Implement directive validation and sanitize directive inputs',
        tags: ['graphql', 'security', 'injection'],
        confidence: 0.6,
      }));
    }

    return issues;
  }

  /**
   * Check for field suggestions in errors
   */
  checkFieldSuggestions(filePath, content, lines) {
    const issues = [];
    
    const hasErrorMasking = /errorMasking|hideError| sanitizeError/i.test(content);
    
    if (!hasErrorMasking) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/error|exception/i.test(line)) {
          issues.push(this.addIssue({
            severity: 'low',
            type: 'graphql-error',
            title: 'Potential Information Leakage',
            message: 'Error handling may expose sensitive information',
            file: filePath,
            line: i + 1,
            snippet: this.getSnippet(content, i + 1),
            suggestion: 'Use proper error masking to prevent stack trace exposure',
            tags: ['graphql', 'security', 'information-disclosure'],
            confidence: 0.5,
          }));
          break;
        }
      }
    }

    return issues;
  }

  /**
   * Check for CSRF protection
   */
  checkCSRF(filePath, content, lines) {
    const issues = [];
    
    const hasCSRFProtection = /csrf|csrfProtection|xsrf|antiCsrf/i.test(content);
    const isApollo = /apollo|graphql/i.test(content);
    
    if (isApollo && !hasCSRFProtection) {
      for (let i = 0; i < Math.min(lines.length, 20); i++) {
        const line = lines[i];
        if (/app|server|use/i.test(line)) {
          issues.push(this.addIssue({
            severity: 'high',
            type: 'graphql-csrf',
            title: 'Missing CSRF Protection',
            message: 'No CSRF protection detected for GraphQL endpoint',
            file: filePath,
            line: i + 1,
            snippet: this.getSnippet(content, i + 1),
            suggestion: 'Implement CSRF tokens or use SameSite cookies',
            tags: ['graphql', 'security', 'csrf'],
            confidence: 0.7,
          }));
          break;
        }
      }
    }

    return issues;
  }

  /**
   * Check for proper authorization
   */
  checkAuthorization(filePath, content, lines) {
    const issues = [];
    
    const hasAuth = /auth|permission|authorize|isAuthenticated|checkAuth/i.test(content);
    const hasResolverAuth = /@auth|@isAdmin|@hasRole|@requireAuth/i.test(content);
    const hasMiddlewareAuth = /middleware.*auth|auth.*middleware/i.test(content);
    
    if (!hasAuth && !hasResolverAuth && !hasMiddlewareAuth) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/query|mutation|resolv/i.test(line)) {
          issues.push(this.addIssue({
            severity: 'high',
            type: 'graphql-authorization',
            title: 'Missing Authorization Checks',
            message: 'No explicit authorization checks found in resolvers',
            file: filePath,
            line: i + 1,
            snippet: this.getSnippet(content, i + 1),
            suggestion: 'Implement authentication and authorization for all operations',
            tags: ['graphql', 'security', 'authorization'],
            confidence: 0.6,
          }));
          break;
        }
      }
    }

    return issues;
  }

  getName() {
    return 'GraphQL Security';
  }
}

export default GraphQLSecurityAnalyzer;

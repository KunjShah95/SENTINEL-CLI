import { BaseAnalyzer } from './baseAnalyzer.js';

/**
 * Docker Security Analyzer
 * Detects security issues and best practice violations in Dockerfiles
 */
export class DockerAnalyzer extends BaseAnalyzer {
  constructor() {
    super();
    this.name = 'docker';
    this.initializePatterns();
  }

  initializePatterns() {
    this.securityPatterns = [
      {
        id: 'docker/root-user',
        pattern: /^(?!.*USER\s+\S+).*$/s,
        negativeMatch: true,
        checkFunction: (content) => !content.includes('USER ') || content.match(/USER\s+root/i),
        severity: 'high',
        title: 'Container runs as root user',
        message: 'Running containers as root is a security risk. Add a non-root USER directive.',
        suggestion: 'Add USER directive: USER node or USER 1000:1000',
      },
      {
        id: 'docker/add-instead-of-copy',
        pattern: /^ADD\s+(?!https?:\/\/)/m,
        severity: 'medium',
        title: 'Use COPY instead of ADD',
        message: 'ADD has extra features (tar extraction, URL fetching) that can be security risks.',
        suggestion: 'Use COPY for local files, ADD only for URLs or auto-extraction.',
      },
      {
        id: 'docker/latest-tag',
        pattern: /FROM\s+\S+:latest\b/i,
        severity: 'medium',
        title: 'Using :latest tag',
        message: 'Using :latest tag makes builds non-reproducible and may introduce breaking changes.',
        suggestion: 'Pin to a specific version: FROM node:20-alpine',
      },
      {
        id: 'docker/no-tag',
        pattern: /FROM\s+([a-z0-9_-]+)\s*$/im,
        severity: 'medium',
        title: 'No image tag specified',
        message: 'Base image without tag defaults to :latest, making builds non-reproducible.',
        suggestion: 'Specify a version tag: FROM node:20-alpine',
      },
      {
        id: 'docker/apt-get-no-clean',
        pattern: /apt-get\s+install(?!.*&&\s*(?:apt-get\s+clean|rm\s+-rf\s+\/var\/lib\/apt\/lists))/i,
        severity: 'low',
        title: 'apt-get install without cleanup',
        message: 'Not cleaning apt cache increases image size unnecessarily.',
        suggestion: 'Add: && apt-get clean && rm -rf /var/lib/apt/lists/*',
      },
      {
        id: 'docker/curl-wget-without-verification',
        pattern: /(?:curl|wget)\s+.*--insecure|(?:curl|wget)\s+.*-k\b/i,
        severity: 'high',
        title: 'Insecure download (SSL verification disabled)',
        message: 'Downloading files without SSL verification is a security risk.',
        suggestion: 'Remove --insecure or -k flag and ensure valid SSL certificates.',
      },
      {
        id: 'docker/hardcoded-secrets',
        pattern: /(?:ENV|ARG)\s+(?:PASSWORD|SECRET|API_KEY|TOKEN|PRIVATE_KEY)\s*=\s*["']?[^"'\s]+["']?/i,
        severity: 'critical',
        title: 'Hardcoded secret in Dockerfile',
        message: 'Secrets should not be hardcoded in Dockerfiles. They can be extracted from image layers.',
        suggestion: 'Use runtime environment variables or Docker secrets.',
      },
      {
        id: 'docker/expose-sensitive-port',
        pattern: /EXPOSE\s+(?:22|3306|5432|27017|6379)\b/,
        severity: 'medium',
        title: 'Exposing potentially sensitive port',
        message: 'Exposing database or SSH ports may be a security risk.',
        suggestion: 'Only expose necessary ports. Use Docker networks for internal communication.',
      },
      {
        id: 'docker/privileged-instructions',
        pattern: /--privileged|--cap-add|SYS_ADMIN|NET_ADMIN/i,
        severity: 'high',
        title: 'Privileged capabilities requested',
        message: 'Privileged containers or elevated capabilities can compromise host security.',
        suggestion: 'Minimize capabilities. Use --cap-drop=ALL and only add required caps.',
      },
      {
        id: 'docker/sudo-usage',
        pattern: /\bsudo\b/,
        severity: 'medium',
        title: 'sudo usage in Dockerfile',
        message: 'Using sudo in Dockerfile often indicates running as non-root unnecessarily.',
        suggestion: 'Run commands before USER directive or configure proper permissions.',
      },
      {
        id: 'docker/missing-healthcheck',
        pattern: /^(?!.*HEALTHCHECK\s+)/s,
        checkFunction: (content) => !content.includes('HEALTHCHECK'),
        severity: 'low',
        title: 'Missing HEALTHCHECK instruction',
        message: 'No healthcheck defined. Container orchestrators cannot verify application health.',
        suggestion: 'Add HEALTHCHECK CMD curl -f http://localhost/ || exit 1',
      },
      {
        id: 'docker/multiple-cmd',
        pattern: /CMD/g,
        checkFunction: (content) => (content.match(/^CMD\s/gm) || []).length > 1,
        severity: 'medium',
        title: 'Multiple CMD instructions',
        message: 'Only the last CMD instruction takes effect. This may be a mistake.',
        suggestion: 'Use a single CMD instruction at the end of the Dockerfile.',
      },
      {
        id: 'docker/shell-form-cmd',
        pattern: /^(?:CMD|ENTRYPOINT)\s+(?![[{])[^[]+$/m,
        severity: 'low',
        title: 'Shell form used for CMD/ENTRYPOINT',
        message: 'Shell form prevents proper signal handling and graceful shutdown.',
        suggestion: 'Use exec form: CMD ["node", "app.js"] instead of CMD node app.js',
      },
    ];

    this.bestPractices = [
      {
        id: 'docker/no-workdir',
        checkFunction: (content) => !content.includes('WORKDIR'),
        severity: 'low',
        title: 'Missing WORKDIR instruction',
        message: 'Not setting WORKDIR can lead to files being placed in unexpected locations.',
        suggestion: 'Add WORKDIR /app or appropriate directory.',
      },
      {
        id: 'docker/copy-before-npm-install',
        pattern: /COPY\s+\.\s+\.\s*\n.*npm\s+install/s,
        severity: 'medium',
        title: 'Suboptimal layer caching',
        message: 'Copying all files before npm install invalidates cache on any file change.',
        suggestion: 'COPY package*.json first, then npm install, then COPY rest of files.',
      },
    ];
  }

  shouldAnalyzeFile(filePath) {
    const normalized = filePath.toLowerCase();
    return (
      normalized.endsWith('dockerfile') ||
      normalized.includes('dockerfile.') ||
      normalized.endsWith('.dockerfile')
    );
  }

  async analyze(files, context) {
    this.issues = [];
    const dockerFiles = files.filter(f => this.shouldAnalyzeFile(f));

    for (const file of dockerFiles) {
      try {
        const content = await this.readFile(file);
        await this.analyzeFile(file, content, context);
      } catch (error) {
        // Skip files that can't be read
      }
    }

    return {
      analyzer: this.name,
      issues: this.issues,
      stats: this.getStats(),
    };
  }

  async readFile(filePath) {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // Validate and sanitize file path
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..')) {
      throw new Error('Path traversal detected');
    }
    
    return fs.readFile(normalizedPath, 'utf8');
  }

  async analyzeFile(filePath, content, _context) {
    const lines = content.split('\n');

    // Check security patterns
    for (const rule of this.securityPatterns) {
      if (rule.checkFunction) {
        if (rule.checkFunction(content)) {
          this.addIssue({
            id: rule.id,
            file: filePath,
            line: 1,
            severity: rule.severity,
            title: rule.title,
            message: rule.message,
            suggestion: rule.suggestion,
            analyzer: this.name,
          });
        }
      } else if (rule.pattern) {
        const matches = content.matchAll(new RegExp(rule.pattern.source, rule.pattern.flags + 'g'));
        for (const match of matches) {
          const lineNum = this.getLineNumber(content, match.index);
          this.addIssue({
            id: rule.id,
            file: filePath,
            line: lineNum,
            severity: rule.severity,
            title: rule.title,
            message: rule.message,
            suggestion: rule.suggestion,
            code: lines[lineNum - 1]?.trim(),
            analyzer: this.name,
          });
        }
      }
    }

    // Check best practices
    for (const rule of this.bestPractices) {
      if (rule.checkFunction) {
        if (rule.checkFunction(content)) {
          this.addIssue({
            id: rule.id,
            file: filePath,
            line: 1,
            severity: rule.severity,
            title: rule.title,
            message: rule.message,
            suggestion: rule.suggestion,
            analyzer: this.name,
          });
        }
      } else if (rule.pattern && rule.pattern.test(content)) {
        this.addIssue({
          id: rule.id,
          file: filePath,
          line: 1,
          severity: rule.severity,
          title: rule.title,
          message: rule.message,
          suggestion: rule.suggestion,
          analyzer: this.name,
        });
      }
    }
  }

  getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
  }
}

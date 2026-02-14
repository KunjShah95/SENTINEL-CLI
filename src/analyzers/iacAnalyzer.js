import { BaseAnalyzer } from './baseAnalyzer.js';

export class IaCAnalyzer extends BaseAnalyzer {
  constructor(config = {}) {
    super('Infrastructure as Code', config);
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
    const ext = filePath.split('.').pop()?.toLowerCase();

    switch (ext) {
      case 'tf':
        issues.push(...this.analyzeTerraform(filePath, content));
        break;
      case 'yaml':
      case 'yml':
        if (filePath.includes('k8s') || filePath.includes('kubernetes') || content.includes('apiVersion:')) {
          issues.push(...this.analyzeKubernetes(filePath, content));
        }
        break;
      case 'dockerfile':
        issues.push(...this.analyzeDockerfile(filePath, content));
        break;
      case 'json':
        if (filePath.includes('terraform') || filePath.includes('.tfstate')) {
          issues.push(...this.analyzeTerraformJson(filePath, content));
        }
        break;
    }

    return issues;
  }

  /**
   * Analyze Terraform files
   */
  analyzeTerraform(filePath, content) {
    const issues = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for hardcoded secrets
      issues.push(...this.checkHardcodedSecrets(filePath, line, lineNum, content));

      // Check for insecure configurations
      issues.push(...this.checkTerraformSecurity(filePath, line, lineNum, content));

      // Check for insecure ports
      issues.push(...this.checkInsecurePorts(filePath, line, lineNum, content));

      // Check for unencrypted storage
      issues.push(...this.checkUnencryptedStorage(filePath, line, lineNum, content));

      // Check for public access
      issues.push(...this.checkPublicAccess(filePath, line, lineNum, content));
    }

    return issues;
  }

  checkHardcodedSecrets(filePath, line, lineNum, content) {
    const issues = [];
    const secretPatterns = [
      { pattern: /password\s*=\s*["'][^"']+["']/i, type: 'password' },
      { pattern: /api_key\s*=\s*["'][^"']+["']/i, type: 'api_key' },
      { pattern: /secret\s*=\s*["'][^"']+["']/i, type: 'secret' },
      { pattern: /token\s*=\s*["'][^"']+["']/i, type: 'token' },
      { pattern: /key\s*=\s*["'][^"']{20,}["']/i, type: 'key' },
    ];

    for (const { pattern, type } of secretPatterns) {
      if (pattern.test(line) && !line.includes('var.') && !line.includes('data.')) {
        issues.push(this.addIssue({
          severity: 'critical',
          type: 'iac-secret',
          title: `Hardcoded ${type} in Terraform`,
          message: `Found hardcoded ${type} - use variables or secrets manager`,
          file: filePath,
          line: lineNum,
          snippet: this.getSnippet(content, lineNum),
          suggestion: `Use var.${type} or environment variables instead`,
          tags: ['iac', 'terraform', 'secrets'],
          confidence: 0.9,
        }));
      }
    }

    return issues;
  }

  checkTerraformSecurity(filePath, line, lineNum, content) {
    const issues = [];

    // Check for unencrypted S3
    if (/\bs3_bucket\b/i.test(line) && /encrypt\s*=\s*false/i.test(line)) {
      issues.push(this.addIssue({
        severity: 'high',
        type: 'iac-encryption',
        title: 'S3 Bucket Encryption Disabled',
        message: 'S3 bucket encryption is disabled',
        file: filePath,
        line: lineNum,
        snippet: this.getSnippet(content, lineNum),
        suggestion: 'Enable encryption with server_side_encryption_configuration',
        tags: ['iac', 'terraform', 'encryption'],
        confidence: 0.9,
      }));
    }

    // Check for public S3
    if (/\bacl\s*=\s*"public-read"/i.test(line) || /acl\s*=\s*"public-read-write"/i.test(line)) {
      issues.push(this.addIssue({
        severity: 'critical',
        type: 'iac-public',
        title: 'Public S3 Bucket Access',
        message: 'S3 bucket has public access enabled',
        file: filePath,
        line: lineNum,
        snippet: this.getSnippet(content, lineNum),
        suggestion: 'Use private ACL and IAM policies for access control',
        tags: ['iac', 'terraform', 'public-access'],
        confidence: 0.9,
      }));
    }

    // Check for insecure TLS
    if (/tls_private_key/i.test(line) && /algorithm\s*=\s*"RSA"/i.test(line)) {
      issues.push(this.addIssue({
        severity: 'medium',
        type: 'iac-tls',
        title: 'Weak TLS Key',
        message: 'RSA key may be using weak encryption',
        file: filePath,
        line: lineNum,
        snippet: this.getSnippet(content, lineNum),
        suggestion: 'Use ECDSA or Ed25519 for better security',
        tags: ['iac', 'terraform', 'tls'],
        confidence: 0.7,
      }));
    }

    return issues;
  }

  checkInsecurePorts(filePath, line, lineNum, content) {
    const issues = [];

    const insecurePorts = [
      { pattern: /port\s*=\s*23\b/, port: 23, name: 'Telnet' },
      { pattern: /port\s*=\s*21\b/, port: 21, name: 'FTP' },
      { pattern: /port\s*=\s*69\b/, port: 69, name: 'TFTP' },
      { pattern: /port\s*=\s*512\b/, port: 512, name: 'rexec' },
      { pattern: /port\s*=\s*513\b/, port: 513, name: 'rlogin' },
      { pattern: /port\s*=\s*514\b/, port: 514, name: 'rsh' },
      { pattern: /port\s*=\s*3389\b/, port: 3389, name: 'RDP' },
    ];

    for (const { pattern, port, name } of insecurePorts) {
      if (pattern.test(line)) {
        issues.push(this.addIssue({
          severity: 'high',
          type: 'iac-port',
          title: `Insecure Port: ${name}`,
          message: `Port ${port} (${name}) is insecure and should not be exposed`,
          file: filePath,
          line: lineNum,
          snippet: this.getSnippet(content, lineNum),
          suggestion: `Remove port ${port} or use secure alternatives`,
          tags: ['iac', 'terraform', 'network'],
          confidence: 0.9,
        }));
      }
    }

    return issues;
  }

  checkUnencryptedStorage(filePath, line, lineNum, content) {
    const issues = [];

    if (/resource\s+"aws_(s3|db|efs|efs_mount)_bucket"/i.test(line)) {
      const nextLines = line + ' '; // Simplified check
      if (!/encryption/i.test(nextLines) && !/kms_key_id/i.test(nextLines)) {
        issues.push(this.addIssue({
          severity: 'high',
          type: 'iac-storage',
          title: 'Unencrypted Storage Resource',
          message: 'Storage resource may not have encryption enabled',
          file: filePath,
          line: lineNum,
          snippet: this.getSnippet(content, lineNum),
          suggestion: 'Enable encryption using kms_key_id or server_side_encryption_configuration',
          tags: ['iac', 'terraform', 'encryption'],
          confidence: 0.7,
        }));
      }
    }

    return issues;
  }

  checkPublicAccess(filePath, line, lineNum, content) {
    const issues = [];

    if (/public\s*=\s*true/i.test(line) || /public_access\s*=\s*true/i.test(line)) {
      issues.push(this.addIssue({
        severity: 'critical',
        type: 'iac-public',
        title: 'Public Resource Access',
        message: 'Resource is configured with public access',
        file: filePath,
        line: lineNum,
        snippet: this.getSnippet(content, lineNum),
        suggestion: 'Restrict access using security groups or IAM policies',
        tags: ['iac', 'terraform', 'public-access'],
        confidence: 0.9,
      }));
    }

    return issues;
  }

  /**
   * Analyze Kubernetes YAML files
   */
  analyzeKubernetes(filePath, content) {
    const issues = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for privileged containers
      if (/privileged:\s*true/i.test(line)) {
        issues.push(this.addIssue({
          severity: 'critical',
          type: 'k8s-privileged',
          title: 'Privileged Container',
          message: 'Container is running in privileged mode',
          file: filePath,
          line: lineNum,
          snippet: this.getSnippet(content, lineNum),
          suggestion: 'Avoid privileged mode unless absolutely necessary',
          tags: ['kubernetes', 'security', 'container'],
          confidence: 0.9,
        }));
      }

      // Check for running as root
      if (/runAsUser:\s*0/i.test(line) || /runAsNonRoot:\s*false/i.test(line)) {
        issues.push(this.addIssue({
          severity: 'high',
          type: 'k8s-root',
          title: 'Running as Root',
          message: 'Container is configured to run as root user',
          file: filePath,
          line: lineNum,
          snippet: this.getSnippet(content, lineNum),
          suggestion: 'Use runAsNonRoot: true and runAsUser with non-zero value',
          tags: ['kubernetes', 'security', 'root'],
          confidence: 0.9,
        }));
      }

      // Check for host network
      if (/hostNetwork:\s*true/i.test(line)) {
        issues.push(this.addIssue({
          severity: 'high',
          type: 'k8s-network',
          title: 'Host Network Access',
          message: 'Pod is using host network',
          file: filePath,
          line: lineNum,
          snippet: this.getSnippet(content, lineNum),
          suggestion: 'Avoid hostNetwork unless necessary for DNS resolution',
          tags: ['kubernetes', 'security', 'network'],
          confidence: 0.9,
        }));
      }

      // Check for host PID
      if (/hostPID:\s*true/i.test(line)) {
        issues.push(this.addIssue({
          severity: 'high',
          type: 'k8s-pid',
          title: 'Host PID Access',
          message: 'Pod can access host process namespace',
          file: filePath,
          line: lineNum,
          snippet: this.getSnippet(content, lineNum),
          suggestion: 'Avoid hostPID unless necessary',
          tags: ['kubernetes', 'security', 'isolation'],
          confidence: 0.9,
        }));
      }

      // Check for container capabilities
      if (/capabilities:\s*add:\s*\[\s*"ALL"\s*\]/i.test(line)) {
        issues.push(this.addIssue({
          severity: 'critical',
          type: 'k8s-capability',
          title: 'All Capabilities Granted',
          message: 'Container has all Linux capabilities',
          file: filePath,
          line: lineNum,
          snippet: this.getSnippet(content, lineNum),
          suggestion: 'Drop ALL capabilities and add only required ones',
          tags: ['kubernetes', 'security', 'capabilities'],
          confidence: 0.9,
        }));
      }

      // Check for insecure image tag
      if (/image:\s*['"]?[^'":]+:[latest|master|main]/i.test(line)) {
        issues.push(this.addIssue({
          severity: 'medium',
          type: 'k8s-image',
          title: 'Insecure Image Tag',
          message: 'Using :latest or :master tag instead of specific version',
          file: filePath,
          line: lineNum,
          snippet: this.getSnippet(content, lineNum),
          suggestion: 'Use specific image tags for reproducibility',
          tags: ['kubernetes', 'security', 'image'],
          confidence: 0.7,
        }));
      }

      // Check for missing resource limits
      if (/^-?\s*name:\s*container-\w+/i.test(line)) {
        // Check nearby lines for resources
        const context = lines.slice(Math.max(0, i - 2), i + 10).join('\n');
        if (!/limits:/i.test(context) && !/resources:/i.test(context)) {
          issues.push(this.addIssue({
            severity: 'medium',
            type: 'k8s-resources',
            title: 'Missing Resource Limits',
            message: 'Container does not have resource limits defined',
            file: filePath,
            line: lineNum,
            snippet: this.getSnippet(content, lineNum),
            suggestion: 'Define requests and limits for CPU and memory',
            tags: ['kubernetes', 'security', 'resources'],
            confidence: 0.6,
          }));
        }
      }
    }

    return issues;
  }

  /**
   * Analyze Dockerfile
   */
  analyzeDockerfile(filePath, content) {
    const issues = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for running as root
      if (/USER\s+root/i.test(line)) {
        issues.push(this.addIssue({
          severity: 'high',
          type: 'docker-root',
          title: 'Running as Root',
          message: 'Container runs as root user',
          file: filePath,
          line: lineNum,
          snippet: this.getSnippet(content, lineNum),
          suggestion: 'Use USER with non-root user',
          tags: ['docker', 'security', 'root'],
          confidence: 0.9,
        }));
      }

      // Check for latest tag
      if (/FROM\s+[^:]+:latest/i.test(line)) {
        issues.push(this.addIssue({
          severity: 'medium',
          type: 'docker-tag',
          title: 'Using Latest Tag',
          message: 'Base image uses :latest tag',
          file: filePath,
          line: lineNum,
          snippet: this.getSnippet(content, lineNum),
          suggestion: 'Use specific version tags',
          tags: ['docker', 'security', 'image'],
          confidence: 0.8,
        }));
      }

      // Check for ADD instead of COPY
      if (/^ADD\s+/i.test(line)) {
        issues.push(this.addIssue({
          severity: 'low',
          type: 'docker-add',
          title: 'Using ADD instead of COPY',
          message: 'Use COPY instead of ADD for better security',
          file: filePath,
          line: lineNum,
          snippet: this.getSnippet(content, lineNum),
          suggestion: 'Use COPY unless extracting local archives',
          tags: ['docker', 'best-practice'],
          confidence: 0.9,
        }));
      }

      // Check for secrets in build args
      if (/ARG\s+.*[Pp]assword|ARG\s+.*[Ss]ecret|ARG\s+.*[Tt]oken/i.test(line)) {
        issues.push(this.addIssue({
          severity: 'high',
          type: 'docker-secret',
          title: 'Secret in Build Arg',
          message: 'Build arguments may contain secrets',
          file: filePath,
          line: lineNum,
          snippet: this.getSnippet(content, lineNum),
          suggestion: 'Use multi-stage builds or secret mounting',
          tags: ['docker', 'security', 'secrets'],
          confidence: 0.8,
        }));
      }
    }

    return issues;
  }

  /**
   * Analyze Terraform JSON state files
   */
  analyzeTerraformJson(filePath, content) {
    const issues = [];

    try {
      const data = JSON.parse(content);
      
      // Check for plaintext secrets in state
      const checkObject = (obj, path = '') => {
        for (const [key, value] of Object.entries(obj || {})) {
          if (typeof value === 'object') {
            checkObject(value, `${path}.${key}`);
          } else if (typeof value === 'string') {
            if (/password|secret|token|key|private/i.test(key) && value.length > 10) {
              issues.push(this.addIssue({
                severity: 'critical',
                type: 'iac-state-secret',
                title: 'Secret in Terraform State',
                message: `Potential secret found in state file at ${path}`,
                file: filePath,
                line: 1,
                suggestion: 'Encrypt state or use remote backend with encryption',
                tags: ['terraform', 'secrets', 'state'],
                confidence: 0.8,
              }));
            }
          }
        }
      };
      
      checkObject(data);
    } catch (e) {
      // Not valid JSON, skip
    }

    return issues;
  }

  getName() {
    return 'Infrastructure as Code';
  }
}

export default IaCAnalyzer;

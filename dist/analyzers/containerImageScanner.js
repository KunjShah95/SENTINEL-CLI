import { exec } from 'child_process';
import path from 'path';
import BaseAnalyzer from './baseAnalyzer.js';

/**
 * Container Image Security Scanner for Sentinel
 * Analyzes Docker images for vulnerabilities and security issues
 */
export class ContainerImageScanner extends BaseAnalyzer {
  constructor(config) {
    super('ContainerImageScanner', config);
    this.scanTools = {
      trivy: null,
      grype: null,
      snyk: null,
      docker: null,
    };
    this.cveDatabase = null;
  }

  /**
   * Initialize scanner and check for available tools
   */
  async initialize() {
    await this.detectScanTools();
    console.log('🐳 Container Image Scanner initialized');
  }

  /**
   * Detect available container scanning tools
   */
  async detectScanTools() {
    const tools = {};
    
    // Check for Trivy
    try {
      await exec('trivy version', { timeout: 5000 });
      tools.trivy = {
        available: true,
        version: await this.getTrivyVersion(),
        command: 'trivy image',
      };
      console.log('✅ Trivy detected');
    } catch (error) {
      console.log('⚠️ Trivy not available:', error.message);
      tools.trivy = { available: false, error: error.message };
    }
    
    // Check for Grype
    try {
      await exec('grype version', { timeout: 5000 });
      tools.grype = {
        available: true,
        version: await this.getGrypeVersion(),
        command: 'grype',
      };
      console.log('✅ Grype detected');
    } catch (error) {
      console.log('⚠️ Grype not available:', error.message);
      tools.grype = { available: false, error: error.message };
    }
    
    // Check for Snyk
    try {
      await exec('snyk version', { timeout: 5000 });
      tools.snyk = {
        available: true,
        version: await this.getSnykVersion(),
        command: 'snyk container',
      };
      console.log('✅ Snyk detected');
    } catch (error) {
      console.log('⚠️ Snyk not available:', error.message);
      tools.snyk = { available: false, error: error.message };
    }
    
    // Check for Docker CLI
    try {
      await exec('docker --version', { timeout: 5000 });
      tools.docker = {
        available: true,
        version: await this.getDockerVersion(),
        command: 'docker',
      };
      console.log('✅ Docker CLI detected');
    } catch (error) {
      console.log('⚠️ Docker CLI not available:', error.message);
      tools.docker = { available: false, error: error.message };
    }
    
    this.scanTools = tools;
    return tools;
  }

  /**
   * Get Trivy version
   */
  async getTrivyVersion() {
    try {
      const { stdout } = await exec('trivy version', { timeout: 10000 });
      return stdout.trim();
    } catch (error) {
      return null;
    }
  }

  /**
   * Get Grype version
   */
  async getGrypeVersion() {
    try {
      const { stdout } = await exec('grype version', { timeout: 10000 });
      return stdout.trim();
    } catch (error) {
      return null;
    }
  }

  /**
   * Get Snyk version
   */
  async getSnykVersion() {
    try {
      const { stdout } = await exec('snyk version', { timeout: 10000 });
      return stdout.trim();
    } catch (error) {
      return null;
    }
  }

  /**
   * Get Docker version
   */
  async getDockerVersion() {
    try {
      const { stdout } = await exec('docker --version', { timeout: 10000 });
      const match = stdout.match(/Docker version ([\d.]+)/);
      return match ? match[1] : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Main analysis method
   */
  async analyze(files, context = {}) {
    const issues = [];
    
    // Filter for Docker-related files
    const dockerFiles = files.filter(file => 
      this.isDockerFile(file.path) ||
      this.isKubernetesFile(file.path) ||
      this.isContainerConfigFile(file.path)
    );
    
    for (const file of dockerFiles) {
      const fileIssues = await this.analyzeFile(file, context);
      issues.push(...fileIssues);
    }
    
    return issues;
  }

  /**
   * Analyze individual Docker-related file
   */
  async analyzeFile(file, _context = {}) {
    const issues = [];
    const content = file.content;
    const filename = file.path;
    
    try {
      // Dockerfile analysis
      if (filename.toLowerCase().includes('dockerfile')) {
        const dockerfileIssues = await this.analyzeDockerfile(content, filename);
        issues.push(...dockerfileIssues);
      }
      
      // Kubernetes YAML analysis
      if (this.isKubernetesFile(filename, content)) {
        const k8sIssues = await this.analyzeKubernetesFile(content, filename);
        issues.push(...k8sIssues);
      }
      
      // Docker Compose analysis
      if (filename.toLowerCase().includes('docker-compose') || filename.toLowerCase().includes('compose.yml')) {
        const composeIssues = await this.analyzeDockerCompose(content, filename);
        issues.push(...composeIssues);
      }
      
      // Container config analysis
      if (this.isContainerConfigFile(filename, content)) {
        const configIssues = await this.analyzeContainerConfig(content, filename);
        issues.push(...configIssues);
      }
      
      // Image reference analysis
      const imageRefs = this.extractImageReferences(content);
      for (const imageRef of imageRefs) {
        const imageIssues = await this.analyzeImageReference(imageRef, content, filename);
        issues.push(...imageIssues);
      }
    } catch (error) {
      console.warn(`Error analyzing ${filename}:`, error.message);
    }
    
    return issues;
  }

  /**
   * Check if file is a Dockerfile
   */
  isDockerFile(filePath) {
    const filename = path.basename(filePath).toLowerCase();
    return filename === 'dockerfile' || filename.endsWith('.dockerfile');
  }

  /**
   * Check if file is a Kubernetes YAML
   */
  isKubernetesFile(filePath, content = '') {
    const filename = path.basename(filePath).toLowerCase();
    const likelyName = (
      filename.endsWith('.yaml') || filename.endsWith('.yml') ||
      filename.includes('deployment') || filename.includes('k8s-') || filename.includes('service-') ||
      filename.includes('namespace-') || filename.includes('configmap')
    );

    // If content is provided, check for Kubernetes keywords as well
    return likelyName || this.containsK8sKeywords(content);
  }

  /**
   * Check if file contains Kubernetes keywords
   */
  containsK8sKeywords(content) {
    const k8sKeywords = [
      'apiVersion', 'kind', 'metadata', 'spec', 'selector', 'template',
      'deployment', 'service', 'ingress', 'configmap', 'secret',
      'namespace', 'limits', 'resources', 'persistentVolume',
      'containerPort', 'env', 'volume', 'statefulset',
      'daemonset', 'job', 'cronjob', 'networkPolicy',
      'podSecurityPolicy', 'role', 'roleBinding', 'serviceAccount',
      'priorityClass', 'disruptionBudget', 'horizontalPodAutoscaler',
      'verticalPodAutoscaler', 'runtimeClass', 'affinity',
      'toleration', 'nodeSelector', 'podAntiAffinity',
      'PodDisruptionBudget', 'EndpointSlice', 'Gateway',
      'HTTPRoute', 'Ingress', 'GatewayClass',
      'TCPRoute', 'ServiceEntry', 'Service',
      'volumeAttachment', 'volumeProjection', 'StorageClass',
      'CSIDriver', 'CSIStorageCapacity', 'CSIStorageClass',
      'VolumeAttachment', 'VolumeSnapshotClass',
      'LocalVolume', 'PersistentVolume', 'PersistentVolumeClaim',
      'VolumeSnapshot', 'HorizontalPodAutoscaler'
    ];
    
    const contentLower = (content || '').toLowerCase();
    return k8sKeywords.some(keyword => contentLower.includes(keyword.toLowerCase()));
  }

  /**
   * Check if file is a container config file
   */
  isContainerConfigFile(filePath, content = '') {
    const filename = path.basename(filePath).toLowerCase();
    const nameMatch = (
      filename.endsWith('.yml') || filename.endsWith('.yaml') ||
      filename.endsWith('.json') || filename.includes('container') || filename.includes('pod')
    );

    const contentLower = (content || '').toLowerCase();
    const contentMatch = contentLower.includes('image') || contentLower.includes('registry') || contentLower.includes('pull') || contentLower.includes('build');

    return nameMatch && contentMatch;
  }

  /**
   * Analyze Dockerfile for security issues
   */
  async analyzeDockerfile(content, filename) {
    const issues = [];
    const lines = content.split('\n');

    // Add a check for missing non-root USER (if no USER directive found)
    const hasUser = lines.some(l => /^\s*USER\s+/i.test(l));
    if (!hasUser) {
      issues.push({
        id: this.generateIssueId(),
        analyzer: 'ContainerImageScanner',
        type: 'security',
        severity: 'medium',
        title: 'No USER directive in Dockerfile',
        message: 'No non-root USER directive found; running as root by default is risky',
        file: filename,
        line: 1,
        snippet: this.getCodeSnippet(content, 0, 2),
        suggestion: 'Add a non-root USER directive, e.g., USER node or USER 1000:1000',
      });
    }

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();

      // Explicit root user
      if (/^\s*USER\s+root\b/i.test(line)) {
        issues.push({
          id: this.generateIssueId(),
          analyzer: 'ContainerImageScanner',
          type: 'security',
          severity: 'high',
          title: 'Container runs as root user',
          message: 'Docker container explicitly runs as root',
          file: filename,
          line: i + 1,
          snippet: this.getCodeSnippet(content, i, 2),
          suggestion: 'Use a non-root user: USER node or USER 1000:1000',
        });
      }

      // EXPOSE checks
      if (/^\s*EXPOSE\s+/i.test(line)) {
        const portMatch = line.match(/EXPOSE\s+(\d+)/i);
        if (portMatch) {
          const port = parseInt(portMatch[1], 10);
          const sensitivePorts = [22, 3306, 5432, 27017, 6379];
          if (sensitivePorts.includes(port)) {
            issues.push({
              id: this.generateIssueId(),
              analyzer: 'ContainerImageScanner',
              type: 'security',
              severity: 'medium',
              title: 'Exposing potentially sensitive port',
              message: `Dockerfile exposes port ${port}, which may be sensitive`,
              file: filename,
              line: i + 1,
              snippet: this.getCodeSnippet(content, i, 2),
              suggestion: 'Avoid exposing sensitive database/ssh ports publicly',
            });
          }
        }
      }

      // ADD usage
      if (/^\s*ADD\s+/i.test(line)) {
        issues.push({
          id: this.generateIssueId(),
          analyzer: 'ContainerImageScanner',
          type: 'quality',
          severity: 'low',
          title: 'Use COPY instead of ADD',
          message: 'ADD has extra side effects (tar extraction, URL fetching). Prefer COPY for local files.',
          file: filename,
          line: i + 1,
          snippet: this.getCodeSnippet(content, i, 2),
          suggestion: 'Replace ADD with COPY for local files',
        });
      }

      // FROM tags
      if (/^\s*FROM\s+/i.test(line)) {
        if (/\S+:latest\b/i.test(line)) {
          issues.push({
            id: this.generateIssueId(),
            analyzer: 'ContainerImageScanner',
            type: 'quality',
            severity: 'medium',
            title: 'Using :latest tag',
            message: 'Using :latest tag makes builds non-reproducible',
            file: filename,
            line: i + 1,
            snippet: this.getCodeSnippet(content, i, 2),
            suggestion: 'Pin base image to a specific version tag',
          });
        }
        if (/^\s*FROM\s+[^:\s]+\s*$/i.test(line)) {
          issues.push({
            id: this.generateIssueId(),
            analyzer: 'ContainerImageScanner',
            type: 'quality',
            severity: 'low',
            title: 'No image tag specified',
            message: 'Base image without tag defaults to :latest',
            file: filename,
            line: i + 1,
            snippet: this.getCodeSnippet(content, i, 2),
            suggestion: 'Specify a version tag for reproducible builds',
          });
        }
      }
    }

    return issues;
  }

  /**
   * Analyze Kubernetes YAML content for potential issues
   */
  async analyzeKubernetesFile(content, filename) {
    const issues = [];

    // Simple checks using keyword heuristics
    if (/privileged:\s*true/i.test(content)) {
      issues.push({
        id: this.generateIssueId(),
        analyzer: 'ContainerImageScanner',
        type: 'security',
        severity: 'high',
        title: 'Privileged container in Kubernetes manifest',
        message: 'A container is configured with privileged: true which can be dangerous',
        file: filename,
        line: this.getLineNumber(content, content.search(/privileged:\s*true/i)) || 1,
        snippet: this.getClosestSnippet(content, /privileged:\s*true/i),
        suggestion: 'Avoid using privileged containers; limit capabilities via securityContext',
      });
    }

    if (/runAsUser:\s*0\b/i.test(content)) {
      issues.push({
        id: this.generateIssueId(),
        analyzer: 'ContainerImageScanner',
        type: 'security',
        severity: 'medium',
        title: 'Pod configured to run as root (runAsUser: 0)',
        message: 'Pods running as root are at higher security risk',
        file: filename,
        line: this.getLineNumber(content, content.search(/runAsUser:\s*0\b/i)) || 1,
        snippet: this.getClosestSnippet(content, /runAsUser:\s*0\b/i),
        suggestion: 'Set runAsUser to a non-root UID',
      });
    }

    if (/resources:\s*\n\s*limits:/i.test(content) === false) {
      // No resource limits detected
      issues.push({
        id: this.generateIssueId(),
        analyzer: 'ContainerImageScanner',
        type: 'performance',
        severity: 'low',
        title: 'No resource limits in Kubernetes manifests',
        message: 'Missing resource requests/limits may lead to unstable clusters',
        file: filename,
        line: 1,
        snippet: this.getCodeSnippet(content, 0, 3),
        suggestion: 'Define resource requests and limits for containers',
      });
    }

    return issues;
  }

  /**
   * Analyze docker-compose content
   */
  async analyzeDockerCompose(content, filename) {
    const issues = [];

    // Check for privileged usage and latest tags
    if (/privileged:\s*true/i.test(content)) {
      issues.push({
        id: this.generateIssueId(),
        analyzer: 'ContainerImageScanner',
        type: 'security',
        severity: 'high',
        title: 'privileged service in docker-compose',
        message: 'A service is configured with privileged: true which escalates permissions',
        file: filename,
        line: this.getLineNumber(content, content.search(/privileged:\s*true/i)) || 1,
        snippet: this.getClosestSnippet(content, /privileged:\s*true/i),
        suggestion: 'Remove privileged flag or lock down capabilities',
      });
    }

    const latestMatches = [...content.matchAll(/image:\s*([^\n\s]+:latest)\b/ig)];
    for (const m of latestMatches) {
      const idx = m.index || 0;
      issues.push({
        id: this.generateIssueId(),
        analyzer: 'ContainerImageScanner',
        type: 'quality',
        severity: 'medium',
        title: 'Using :latest image in compose',
        message: `Compose references image ${m[1]} which uses :latest tag`,
        file: filename,
        line: this.getLineNumber(content, idx) || 1,
        snippet: this.getClosestSnippet(content, new RegExp(m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')),
        suggestion: 'Pin images to specific versions',
      });
    }

    return issues;
  }

  /**
   * Analyze a single image reference (FROM or image:)
   */
  async analyzeImageReference(imageRef, content, filename) {
    const issues = [];
    const { image, index } = imageRef;

    if (/:\s*latest\b/i.test(image) || /:\s*$/.test(image) || !/:/.test(image)) {
      issues.push({
        id: this.generateIssueId(),
        analyzer: 'ContainerImageScanner',
        type: 'quality',
        severity: 'medium',
        title: 'Unpinned or :latest image reference',
        message: `Image ${image} should be pinned to a specific version`,
        file: filename,
        line: this.getLineNumber(content, index) || 1,
        snippet: this.getClosestSnippet(content, new RegExp(image.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')),
        suggestion: 'Use a fixed image tag or digest',
      });
    }

    return issues;
  }

  /**
   * Extract image references from content
   */
  extractImageReferences(content) {
    const refs = [];

    // FROM statements
    const fromMatches = [...content.matchAll(/^\s*FROM\s+([^\s]+).*$/gim)];
    for (const m of fromMatches) {
      refs.push({ image: m[1], index: m.index || 0, type: 'from' });
    }

    // image: fields in compose/k8s
    const imageFieldMatches = [...content.matchAll(/\bimage:\s*([^\s\n]+)/gim)];
    for (const m of imageFieldMatches) {
      refs.push({ image: m[1].replace(/['"]/g, ''), index: m.index || 0, type: 'image' });
    }

    return refs;
  }

  /**
   * Get a few lines of context around a line number
   */
  getCodeSnippet(content, lineIndex, contextLines = 2) {
    const lines = (content || '').split('\n');
    const start = Math.max(0, lineIndex - contextLines);
    const end = Math.min(lines.length, lineIndex + contextLines + 1);
    return lines.slice(start, end).join('\n');
  }

  /**
   * Get a snippet near a regex match
   */
  getClosestSnippet(content, regex, contextLines = 2) {
    const m = content.match(regex);
    if (!m) return '';
    const idx = m.index || 0;
    const line = this.getLineNumber(content, idx);
    return this.getCodeSnippet(content, Math.max(0, line - 1), contextLines);
  }

  /**
   * Convert index into line number
   */
  getLineNumber(content, index) {
    if (typeof index !== 'number' || index < 0) return 1;
    return content.substring(0, index).split('\n').length;
  }

  /**
   * Simple id generator
   */
  generateIssueId() {
    return `cis-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }

}

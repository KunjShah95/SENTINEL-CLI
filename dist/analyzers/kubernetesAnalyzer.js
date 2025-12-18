/**
 * Kubernetes Security Analyzer
 * Analyzes Kubernetes manifests (YAML) for security issues and best practices
 */

import BaseAnalyzer from './baseAnalyzer.js';

export default class KubernetesAnalyzer extends BaseAnalyzer {
  constructor(config) {
    super('KubernetesAnalyzer', config);
  }

  shouldAnalyzeFile(filePath) {
    // Check for Kubernetes manifest files
    return /\.(yaml|yml)$/i.test(filePath) && (
      filePath.includes('k8s') ||
      filePath.includes('kubernetes') ||
      filePath.includes('deployment') ||
      filePath.includes('pod') ||
      filePath.includes('service') ||
      filePath.includes('configmap') ||
      filePath.includes('secret')
    );
  }

  async analyzeFile(file) {
    const content = file.content;
    const lines = content.split('\n');
    
    // Parse YAML-like content (simplified)
    const manifest = this.parseKubernetesManifest(content);
    
    if (!manifest) return;
    
    // Security checks
    this.checkPrivilegedContainers(manifest, file.path);
    this.checkRootUser(manifest, file.path);
    this.checkSecurityContext(manifest, file.path);
    this.checkResourceLimits(manifest, file.path);
    this.checkCapabilities(manifest, file.path);
    this.checkHostPaths(manifest, file.path);
    this.checkHostNetwork(manifest, file.path);
    this.checkImagePullPolicy(manifest, file.path);
    this.checkSecretsHandling(manifest, file.path, lines);
    this.checkServiceAccounts(manifest, file.path);
    this.checkNetworkPolicies(manifest, file.path);
    this.checkReadOnlyFilesystem(manifest, file.path);
  }

  parseKubernetesManifest(content) {
    // Simple YAML-like parsing for K8s manifests
    // In production, use a proper YAML parser like 'js-yaml'
    const manifest = {
      kind: null,
      metadata: {},
      spec: {
        containers: [],
        securityContext: null,
      }
    };
    
    // Extract kind
    const kindMatch = content.match(/^kind:\s*(.+)$/m);
    if (kindMatch) manifest.kind = kindMatch[1].trim();
    
    // Check if it's a K8s resource
    const validKinds = ['Pod', 'Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob', 'Service'];
    if (!validKinds.some(k => content.includes(`kind: ${k}`))) {
      return null;
    }
    
    // Extract security-relevant fields
    manifest.hasPrivileged = /privileged:\s*true/i.test(content);
    manifest.hasRunAsRoot = /runAsUser:\s*0\s*$/m.test(content);
    manifest.hasHostNetwork = /hostNetwork:\s*true/i.test(content);
    manifest.hasHostPID = /hostPID:\s*true/i.test(content);
    manifest.hasHostIPC = /hostIPC:\s*true/i.test(content);
    manifest.hasHostPath = /hostPath:/i.test(content);
    manifest.hasResourceLimits = /resources:[\s\S]*?limits:/i.test(content);
    manifest.hasSecurityContext = /securityContext:/i.test(content);
    manifest.hasReadOnlyRootFilesystem = /readOnlyRootFilesystem:\s*true/i.test(content);
    manifest.hasAllowPrivilegeEscalation = /allowPrivilegeEscalation:\s*true/i.test(content);
    manifest.hasCapabilities = /capabilities:/i.test(content);
    
    return manifest;
  }

  checkPrivilegedContainers(manifest, filePath) {
    if (manifest.hasPrivileged) {
      this.addIssue({
        type: 'kubernetes-security',
        severity: 'critical',
        title: 'Privileged container detected',
        message: 'Running containers in privileged mode gives them unrestricted access to the host.',
        file: filePath,
        line: this.findLineNumber('privileged:', filePath),
        suggestion: 'Remove privileged: true or use specific capabilities instead',
        tags: ['kubernetes', 'security', 'privileged', 'critical']
      });
    }
  }

  checkRootUser(manifest, filePath) {
    if (manifest.hasRunAsRoot) {
      this.addIssue({
        type: 'kubernetes-security',
        severity: 'high',
        title: 'Container runs as root (UID 0)',
        message: 'Running as root user increases security risk if container is compromised.',
        file: filePath,
        line: this.findLineNumber('runAsUser:', filePath),
        suggestion: 'Set runAsUser to non-zero UID (e.g., 1000)',
        tags: ['kubernetes', 'security', 'root-user']
      });
    }
    
    if (!manifest.hasSecurityContext || !manifest.hasRunAsRoot) {
      this.addIssue({
        type: 'kubernetes-security',
        severity: 'medium',
        title: 'Missing runAsNonRoot security context',
        message: 'SecurityContext should explicitly set runAsNonRoot: true.',
        file: filePath,
        line: 1,
        suggestion: 'Add securityContext with runAsNonRoot: true and runAsUser: 1000',
        tags: ['kubernetes', 'security', 'securitycontext']
      });
    }
  }

  checkSecurityContext(manifest, filePath) {
    if (!manifest.hasSecurityContext) {
      this.addIssue({
        type: 'kubernetes-security',
        severity: 'high',
        title: 'Missing SecurityContext',
        message: 'No securityContext defined. Containers should have security constraints.',
        file: filePath,
        line: 1,
        suggestion: `Add securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  allowPrivilegeEscalation: false
  capabilities:
    drop: [ALL]
  readOnlyRootFilesystem: true`,
        tags: ['kubernetes', 'security', 'securitycontext']
      });
    }
    
    if (manifest.hasAllowPrivilegeEscalation) {
      this.addIssue({
        type: 'kubernetes-security',
        severity: 'high',
        title: 'Privilege escalation allowed',
        message: 'allowPrivilegeEscalation: true permits container processes to gain more privileges.',
        file: filePath,
        line: this.findLineNumber('allowPrivilegeEscalation:', filePath),
        suggestion: 'Set allowPrivilegeEscalation: false',
        tags: ['kubernetes', 'security', 'privilege-escalation']
      });
    }
  }

  checkResourceLimits(manifest, filePath) {
    if (!manifest.hasResourceLimits) {
      this.addIssue({
        type: 'kubernetes-reliability',
        severity: 'medium',
        title: 'No resource limits defined',
        message: 'Missing resource limits can lead to resource starvation and instability.',
        file: filePath,
        line: 1,
        suggestion: `Add resource limits:
resources:
  limits:
    cpu: "500m"
    memory: "512Mi"
  requests:
    cpu: "250m"
    memory: "256Mi"`,
        tags: ['kubernetes', 'reliability', 'resources']
      });
    }
  }

  checkCapabilities(manifest, filePath) {
    if (!manifest.hasCapabilities) {
      this.addIssue({
        type: 'kubernetes-security',
        severity: 'medium',
        title: 'No capability restrictions',
        message: 'Containers should drop all capabilities and only add required ones.',
        file: filePath,
        line: 1,
        suggestion: `Add capabilities:
  drop: [ALL]
  add: [NET_BIND_SERVICE] # only if needed`,
        tags: ['kubernetes', 'security', 'capabilities']
      });
    }
  }

  checkHostPaths(manifest, filePath) {
    if (manifest.hasHostPath) {
      this.addIssue({
        type: 'kubernetes-security',
        severity: 'high',
        title: 'hostPath volume detected',
        message: 'Mounting host paths gives container access to the host filesystem.',
        file: filePath,
        line: this.findLineNumber('hostPath:', filePath),
        suggestion: 'Use PersistentVolumes, ConfigMaps, or Secrets instead of hostPath',
        tags: ['kubernetes', 'security', 'hostpath', 'volumes']
      });
    }
  }

  checkHostNetwork(manifest, filePath) {
    if (manifest.hasHostNetwork) {
      this.addIssue({
        type: 'kubernetes-security',
        severity: 'high',
        title: 'Host network mode enabled',
        message: 'hostNetwork: true gives container access to host network stack.',
        file: filePath,
        line: this.findLineNumber('hostNetwork:', filePath),
        suggestion: 'Remove hostNetwork: true unless absolutely necessary',
        tags: ['kubernetes', 'security', 'network', 'hostnetwork']
      });
    }
    
    if (manifest.hasHostPID) {
      this.addIssue({
        type: 'kubernetes-security',
        severity: 'high',
        title: 'Host PID namespace enabled',
        message: 'hostPID: true allows container to see all host processes.',
        file: filePath,
        line: this.findLineNumber('hostPID:', filePath),
        suggestion: 'Remove hostPID: true',
        tags: ['kubernetes', 'security', 'hostpid']
      });
    }
    
    if (manifest.hasHostIPC) {
      this.addIssue({
        type: 'kubernetes-security',
        severity: 'high',
        title: 'Host IPC namespace enabled',
        message: 'hostIPC: true allows container to access host IPC.',
        file: filePath,
        line: this.findLineNumber('hostIPC:', filePath),
        suggestion: 'Remove hostIPC: true',
        tags: ['kubernetes', 'security', 'hostipc']
      });
    }
  }

  checkImagePullPolicy(manifest, filePath) {
    // Check for missing imagePullPolicy or wrong value
    if (!/imagePullPolicy:\s*Always/i.test(manifest.kind)) {
      this.addIssue({
        type: 'kubernetes-best-practice',
        severity: 'low',
        title: 'Image pull policy not set to Always',
        message: 'Using latest tag without imagePullPolicy: Always may use stale images.',
        file: filePath,
        line: 1,
        suggestion: 'Set imagePullPolicy: Always for :latest tags',
        tags: ['kubernetes', 'best-practice', 'images']
      });
    }
  }

  checkSecretsHandling(manifest, filePath, lines) {
    // Check for hardcoded secrets in ConfigMap or Secret
    if (manifest.kind === 'Secret' || manifest.kind === 'ConfigMap') {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;
        
        // Look for suspicious patterns
        if (/(?:password|token|api_key|secret_key):\s*["']?(?!<|{|\$)[a-zA-Z0-9+/=]{8,}/i.test(line)) {
          this.addIssue({
            type: 'kubernetes-security',
            severity: 'critical',
            title: 'Hardcoded secret detected',
            message: 'Secrets should not be committed in plain text to version control.',
            file: filePath,
            line: lineNumber,
            snippet: line.replace(/:\s*.+/, ': ***'),
            suggestion: 'Use sealed-secrets, external-secrets, or vault for secret management',
            tags: ['kubernetes', 'security', 'secrets', 'credentials']
          });
        }
      }
    }
  }

  checkServiceAccounts(manifest, filePath) {
    if (manifest.kind === 'Pod' || manifest.kind === 'Deployment') {
      // Check if default service account is used
      if (!/serviceAccountName:/i.test(manifest.kind)) {
        this.addIssue({
          type: 'kubernetes-security',
          severity: 'medium',
          title: 'Using default service account',
          message: 'Pods should use dedicated service accounts with minimal permissions.',
          file: filePath,
          line: 1,
          suggestion: 'Create and specify a dedicated serviceAccountName',
          tags: ['kubernetes', 'security', 'rbac', 'serviceaccount']
        });
      }
    }
  }

  checkNetworkPolicies(manifest, filePath) {
    // This is a cluster-level check, just a reminder
    if (manifest.kind === 'Deployment' || manifest.kind === 'Pod') {
      this.addIssue({
        type: 'kubernetes-best-practice',
        severity: 'info',
        title: 'Ensure NetworkPolicy exists',
        message: 'Namespaces should have NetworkPolicy to restrict pod-to-pod communication.',
        file: filePath,
        line: 1,
        suggestion: 'Create NetworkPolicy to implement least-privilege networking',
        tags: ['kubernetes', 'network', 'networkpolicy', 'best-practice']
      });
    }
  }

  checkReadOnlyFilesystem(manifest, filePath) {
    if (!manifest.hasReadOnlyRootFilesystem) {
      this.addIssue({
        type: 'kubernetes-security',
        severity: 'medium',
        title: 'Root filesystem is writable',
        message: 'ReadOnlyRootFilesystem prevents malicious code from writing to disk.',
        file: filePath,
        line: 1,
        suggestion: 'Add readOnlyRootFilesystem: true to securityContext',
        tags: ['kubernetes', 'security', 'filesystem']
      });
    }
  }

  findLineNumber(_searchString, _filePath) {
    // Simplified - would need actual file content in real implementation
    return 1;
  }
}

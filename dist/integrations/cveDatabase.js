import axios from 'axios';
import rateLimiter from '../utils/rateLimiter.js';
import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';

export class CVEDatabaseIntegration extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.cache = new Map();
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
    this.githubAdvisoryUrl = 'https://api.github.com/advisories';
    this.nvdUrl = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
    this.osvUrl = 'https://api.osv.dev/v1/query';
    this.realTimeEnabled = false;
    this.websocketConnections = new Map();
    this.updateInterval = null;
    this.lastUpdate = null;

    // Real-time feed configurations
    this.realTimeFeeds = {
      github: {
        enabled: true,
        webhookUrl: null,
        lastProcessedId: null,
      },
      nvd: {
        enabled: true,
        apiKey: null,
        pollInterval: 60 * 60 * 1000, // 1 hour
        lastModified: null,
      },
      osv: {
        enabled: true,
        pollInterval: 30 * 60 * 1000, // 30 minutes
        lastModified: null,
      }
    };

    // Ecosystem-specific package databases
    this.packageEcosystems = {
      npm: {
        registry: 'https://registry.npmjs.org',
        advisoryDb: 'npm',
        packages: new Set()
      },
      pypi: {
        registry: 'https://pypi.org/pypi',
        advisoryDb: 'pypi',
        packages: new Set()
      },
      maven: {
        registry: 'https://repo1.maven.org/maven2',
        advisoryDb: 'maven',
        packages: new Set()
      },
      rubygems: {
        registry: 'https://rubygems.org',
        advisoryDb: 'rubygems',
        packages: new Set()
      }
    };
  }

  /**
   * Initialize the CVE database integration
   */
  async initialize() {
    try {
      // Load cached CVE data
      await this.loadCache();

      // Test GitHub API connectivity
      await this.testConnectivity();

      console.log('✅ CVE Database integration initialized');
    } catch (error) {
      console.warn('⚠️ CVE Database integration warning:', error.message);
    }
  }

  /**
   * Test connectivity to advisory databases
   */
  async testConnectivity() {
    try {
      // Test GitHub Advisory API
      await rateLimiter.schedule(() => axios.get(`${this.githubAdvisoryUrl}/database`, {
        headers: {
          'User-Agent': 'Sentinel-CLI/1.5.0',
          'Accept': 'application/vnd.github+json'
        },
        timeout: 10000
      }));

      console.log('🔗 GitHub Advisory Database: Connected');
    } catch (error) {
      console.warn('⚠️ GitHub Advisory API unavailable, using cached data');
    }
  }

  /**
   * Load cached CVE data from disk
   */
  async loadCache() {
    try {
      const cachePath = path.join(process.cwd(), '.sentinel-cache', 'cve-cache.json');

      try {
        const data = await fs.readFile(cachePath, 'utf8');
        const cacheData = JSON.parse(data);

        for (const [key, value] of Object.entries(cacheData)) {
          this.cache.set(key, {
            ...value,
            timestamp: new Date(value.timestamp)
          });
        }

        console.log(`📚 Loaded ${this.cache.size} cached CVE entries`);
      } catch (error) {
        // No cache file exists, that's okay
      }
    } catch (error) {
      console.warn('⚠️ Could not load CVE cache:', error.message);
    }
  }

  /**
   * Save cache to disk
   */
  async saveCache() {
    try {
      const cacheDir = path.join(process.cwd(), '.sentinel-cache');
      await fs.mkdir(cacheDir, { recursive: true });

      const cachePath = path.join(cacheDir, 'cve-cache.json');
      const cacheData = {};

      for (const [key, value] of this.cache.entries()) {
        cacheData[key] = {
          ...value,
          timestamp: value.timestamp.toISOString()
        };
      }

      await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2));
    } catch (error) {
      console.warn('⚠️ Could not save CVE cache:', error.message);
    }
  }

  /**
   * Scan dependencies for known vulnerabilities
   */
  async scanDependencies(dependencies, ecosystem = 'npm') {
    const results = [];
    const ecosystemConfig = this.packageEcosystems[ecosystem];

    if (!ecosystemConfig) {
      console.warn(`⚠️ Unsupported ecosystem: ${ecosystem}`);
      return results;
    }

    console.log(`🔍 Scanning ${Object.keys(dependencies).length} ${ecosystem} dependencies...`);

    for (const [packageName, version] of Object.entries(dependencies)) {
      try {
        const vulnerabilities = await this.checkPackageVulnerabilities(packageName, version, ecosystem);

        if (vulnerabilities.length > 0) {
          results.push({
            package: packageName,
            version,
            ecosystem,
            vulnerabilities
          });
        }
      } catch (error) {
        console.warn(`⚠️ Error checking ${packageName}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Check specific package for vulnerabilities
   */
  async checkPackageVulnerabilities(packageName, version, ecosystem) {
    const cacheKey = `${ecosystem}:${packageName}:${version}`;

    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp.getTime() < this.cacheExpiry) {
        return cached.vulnerabilities || [];
      }
    }

    try {
      // Query GitHub Advisory Database
      const vulnerabilities = await this.queryGitHubAdvisory(packageName, version, ecosystem);

      // Cache the result
      this.cache.set(cacheKey, {
        vulnerabilities,
        timestamp: new Date()
      });

      return vulnerabilities;
    } catch (error) {
      console.warn(`⚠️ CVE check failed for ${packageName}:`, error.message);
      return [];
    }
  }

  /**
   * Query GitHub Advisory Database for vulnerabilities
   */
  async queryGitHubAdvisory(packageName, version, ecosystem) {
    const vulnerabilities = [];

    try {
      // Query GitHub Security Advisories API
      const response = await rateLimiter.schedule(() => axios.get(`${this.githubAdvisoryUrl}`, {
        params: {
          ecosystem: ecosystem.toUpperCase(),
          package: packageName,
          state: 'published',
          per_page: 100
        },
        headers: {
          'User-Agent': 'Sentinel-CLI/1.4.1',
          'Accept': 'application/vnd.github+json'
        },
        timeout: 15000
      }));

      if (response.data && response.data.length > 0) {
        for (const advisory of response.data) {
          const affectedVersions = this.parseAffectedVersions(advisory, packageName, version);

          if (affectedVersions.isAffected) {
            vulnerabilities.push({
              cveId: advisory.cve_id || 'N/A',
              summary: advisory.summary,
              severity: this.normalizeSeverity(advisory.severity),
              cvssScore: advisory.cvss?.score || null,
              description: advisory.description,
              publishedDate: advisory.published_at,
              modifiedDate: advisory.modified_at,
              references: advisory.references || [],
              identifiers: advisory.identifiers || [],
              affectedVersions: affectedVersions.versions,
              fixedVersions: advisory.fixed_versions || [],
              permalink: advisory.permalink
            });
          }
        }
      }
    } catch (error) {
      // Fallback to local patterns if API fails
      console.warn(`⚠️ GitHub Advisory API failed for ${packageName}, using fallback patterns`);
      vulnerabilities.push(...this.getFallbackVulnerabilities(packageName, version, ecosystem));
    }

    return vulnerabilities;
  }

  /**
   * Parse affected versions from GitHub advisory
   */
  parseAffectedVersions(advisory, packageName, targetVersion) {
    try {
      const ranges = advisory.vulnerable_version_range || '';

      // Simple version comparison (could be enhanced with semver library)
      const isAffected = this.versionInRange(targetVersion, ranges);

      return {
        isAffected,
        versions: [targetVersion]
      };
    } catch (error) {
      return {
        isAffected: false,
        versions: []
      };
    }
  }

  /**
   * Check if version is within affected range
   */
  versionInRange(version, range) {
    if (!range) return false;

    // Simple range parsing - could be enhanced
    const ranges = range.split(',').map(r => r.trim());

    for (const rangePart of ranges) {
      if (this.satisfiesVersion(version, rangePart)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Simple version satisfaction check
   */
  satisfiesVersion(version, range) {
    // Basic semver pattern matching
    if (range.startsWith('>=')) {
      const minVersion = range.slice(2);
      return this.compareVersions(version, minVersion) >= 0;
    }

    if (range.startsWith('<=')) {
      const maxVersion = range.slice(2);
      return this.compareVersions(version, maxVersion) <= 0;
    }

    if (range.startsWith('>')) {
      const minVersion = range.slice(1);
      return this.compareVersions(version, minVersion) > 0;
    }

    if (range.startsWith('<')) {
      const maxVersion = range.slice(1);
      return this.compareVersions(version, maxVersion) < 0;
    }

    if (range.startsWith('=')) {
      const exactVersion = range.slice(1);
      return version === exactVersion;
    }

    // Exact match if no operator
    return version === range;
  }

  /**
   * Compare two semantic versions
   */
  compareVersions(v1, v2) {
    const parseVersion = (v) => v.split('.').map(Number);

    const parts1 = parseVersion(v1);
    const parts2 = parseVersion(v2);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;

      if (part1 < part2) return -1;
      if (part1 > part2) return 1;
    }

    return 0;
  }

  /**
   * Normalize severity levels
   */
  normalizeSeverity(severity) {
    const severityMap = {
      'CRITICAL': 'critical',
      'HIGH': 'high',
      'MODERATE': 'medium',
      'LOW': 'low'
    };

    return severityMap[severity?.toUpperCase()] || 'medium';
  }

  /**
   * Fallback vulnerability patterns for when API is unavailable
   */
  getFallbackVulnerabilities(packageName, version, ecosystem) {
    const knownVulns = this.getKnownVulnerabilities();
    const vulnerabilities = [];

    const packageVulns = knownVulns[ecosystem]?.[packageName];
    if (packageVulns) {
      for (const vuln of packageVulns) {
        if (this.versionInRange(version, vuln.affectedRange)) {
          vulnerabilities.push({
            cveId: vuln.cveId || 'N/A',
            summary: vuln.summary,
            severity: vuln.severity,
            cvssScore: vuln.cvssScore || null,
            description: vuln.description,
            affectedVersions: [version],
            fixedVersions: vuln.fixedVersions || [],
            fallback: true
          });
        }
      }
    }

    return vulnerabilities;
  }

  /**
   * Known vulnerability database for offline fallback
   */
  getKnownVulnerabilities() {
    return {
      npm: {
        'lodash': [
          {
            cveId: 'CVE-2019-10744',
            summary: 'Prototype pollution in lodash',
            severity: 'high',
            cvssScore: 7.4,
            description: ' lodash versions before 4.17.12 are vulnerable to prototype pollution',
            affectedRange: '<4.17.12',
            fixedVersions: ['4.17.12']
          }
        ],
        'express': [
          {
            cveId: 'CVE-2022-24999',
            summary: 'express-openid-connect path traversal vulnerability',
            severity: 'medium',
            cvssScore: 5.4,
            description: 'Path traversal vulnerability in express-openid-connect',
            affectedRange: '<2.7.4',
            fixedVersions: ['2.7.4']
          }
        ]
      },
      pypi: {
        'django': [
          {
            cveId: 'CVE-2023-31047',
            summary: 'Potential directory traversal via archive extraction',
            severity: 'medium',
            cvssScore: 5.5,
            description: 'Django vulnerability in archive file handling',
            affectedRange: '<4.2.2',
            fixedVersions: ['4.2.2']
          }
        ],
        'requests': [
          {
            cveId: 'CVE-2023-32681',
            summary: 'Proxy SSL hostname verification bypass',
            severity: 'medium',
            cvssScore: 5.3,
            description: 'Requests vulnerable to SSL hostname verification bypass via proxy',
            affectedRange: '<2.31.0',
            fixedVersions: ['2.31.0']
          }
        ]
      }
    };
  }

  /**
   * Get CVSS score interpretation
   */
  getSeverityFromCVSS(score) {
    if (score >= 9.0) return 'critical';
    if (score >= 7.0) return 'high';
    if (score >= 4.0) return 'medium';
    if (score > 0) return 'low';
    return 'info';
  }

  /**
   * Generate vulnerability report
   */
  generateReport(vulnerabilityResults) {
    const report = {
      summary: {
        totalPackages: vulnerabilityResults.length,
        vulnerablePackages: vulnerabilityResults.filter(r => r.vulnerabilities.length > 0).length,
        totalVulnerabilities: vulnerabilityResults.reduce((sum, r) => sum + r.vulnerabilities.length, 0),
        severityBreakdown: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          info: 0
        }
      },
      packages: vulnerabilityResults
    };

    // Count severities
    for (const result of vulnerabilityResults) {
      for (const vuln of result.vulnerabilities) {
        report.summary.severityBreakdown[vuln.severity]++;
      }
    }

    return report;
  }

  /**
   * Enable real-time vulnerability monitoring
   */
  async enableRealTimeMonitoring(options = {}) {
    this.realTimeEnabled = true;

    // Configure feeds
    if (options.github) {
      this.realTimeFeeds.github = { ...this.realTimeFeeds.github, ...options.github };
    }
    if (options.nvd) {
      this.realTimeFeeds.nvd = { ...this.realTimeFeeds.nvd, ...options.nvd };
    }
    if (options.osv) {
      this.realTimeFeeds.osv = { ...this.realTimeFeeds.osv, ...options.osv };
    }

    // Start monitoring feeds
    await this.startRealTimeFeeds();

    console.log('🔄 Real-time CVE monitoring enabled');
  }

  /**
   * Start real-time vulnerability feeds
   */
  async startRealTimeFeeds() {
    // Start NVD polling
    if (this.realTimeFeeds.nvd.enabled) {
      this.startNVDPolling();
    }

    // Start OSV polling
    if (this.realTimeFeeds.osv.enabled) {
      this.startOSVPolling();
    }

    // Setup GitHub webhook if configured
    if (this.realTimeFeeds.github.enabled && this.realTimeFeeds.github.webhookUrl) {
      this.setupGitHubWebhook();
    }
  }

  /**
   * Start NVD vulnerability polling
   */
  startNVDPolling() {
    const poll = async () => {
      try {
        const since = this.realTimeFeeds.nvd.lastModified || this.getLastWeek();
        const vulnerabilities = await this.fetchNVDCVEs(since);

        if (vulnerabilities.length > 0) {
          this.emit('new-vulnerabilities', {
            source: 'nvd',
            vulnerabilities,
            timestamp: new Date().toISOString(),
          });

          console.log(`🚨 NVD: Found ${vulnerabilities.length} new vulnerabilities`);
        }

        this.realTimeFeeds.nvd.lastModified = new Date().toISOString();
      } catch (error) {
        console.warn('⚠️ NVD polling failed:', error.message);
      }
    };

    // Initial poll
    poll();

    // Set up recurring poll
    this.updateInterval = setInterval(poll, this.realTimeFeeds.nvd.pollInterval);
  }

  /**
   * Start OSV vulnerability polling
   */
  startOSVPolling() {
    const poll = async () => {
      try {
        const since = this.realTimeFeeds.osv.lastModified || this.getLastWeek();
        const vulnerabilities = await this.fetchOSVCVEs(since);

        if (vulnerabilities.length > 0) {
          this.emit('new-vulnerabilities', {
            source: 'osv',
            vulnerabilities,
            timestamp: new Date().toISOString(),
          });

          console.log(`🚨 OSV: Found ${vulnerabilities.length} new vulnerabilities`);
        }

        this.realTimeFeeds.osv.lastModified = new Date().toISOString();
      } catch (error) {
        console.warn('⚠️ OSV polling failed:', error.message);
      }
    };

    // Initial poll
    poll();

    // Set up recurring poll
    this.updateInterval = setInterval(poll, this.realTimeFeeds.osv.pollInterval);
  }

  /**
   * Fetch CVEs from NVD
   */
  async fetchNVDCVEs(since) {
    const params = {
      lastModStartDate: since.split('T')[0],
      lastModEndDate: new Date().toISOString().split('T')[0],
      resultsPerPage: 2000,
    };

    if (this.realTimeFeeds.nvd.apiKey) {
      params.apiKey = this.realTimeFeeds.nvd.apiKey;
    }

    const response = await rateLimiter.schedule(() => axios.get(this.nvdUrl, {
      params,
      headers: {
        'User-Agent': 'Sentinel-CLI/1.4.1',
      },
      timeout: 30000,
    }));

    return response.data.vulnerabilities || [];
  }

  /**
   * Fetch CVEs from OSV
   */
  async fetchOSVCVEs(since) {
    const response = await rateLimiter.schedule(() => axios.post(this.osvUrl, {
      query: {
        modified: {
          from: since,
        },
      },
      limit: 1000,
    }, {
      headers: {
        'User-Agent': 'Sentinel-CLI/1.4.1',
      },
      timeout: 30000,
    }));

    return response.data.vulns || [];
  }

  /**
   * Setup GitHub webhook handler
   */
  setupGitHubWebhook() {
    // This would typically be implemented in a server context
    // For CLI, we'll just log the configuration
    console.log(`🔗 GitHub webhook configured: ${this.realTimeFeeds.github.webhookUrl}`);
  }

  /**
   * Process GitHub webhook payload
   */
  async processGitHubWebhook(payload) {
    if (payload.action === 'published' && payload.advisory) {
      const advisory = payload.advisory;

      this.emit('new-vulnerabilities', {
        source: 'github',
        vulnerabilities: [this.formatGitHubAdvisory(advisory)],
        timestamp: new Date().toISOString(),
      });

      console.log(`🚨 GitHub: New advisory - ${advisory.summary}`);
    }
  }

  /**
   * Format GitHub advisory for consistent output
   */
  formatGitHubAdvisory(advisory) {
    return {
      cveId: advisory.cve_id || 'N/A',
      summary: advisory.summary,
      severity: this.normalizeSeverity(advisory.severity),
      cvssScore: advisory.cvss?.score || null,
      description: advisory.description,
      publishedDate: advisory.published_at,
      modifiedDate: advisory.modified_at,
      references: advisory.references || [],
      identifiers: advisory.identifiers || [],
      affectedPackages: advisory.vulnerable_functions || [],
      permalink: advisory.permalink,
      source: 'github',
    };
  }

  /**
   * Get last week's date for polling
   */
  getLastWeek() {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString();
  }

  /**
   * Stop real-time monitoring
   */
  async stopRealTimeMonitoring() {
    this.realTimeEnabled = false;

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Close WebSocket connections
    for (const ws of this.websocketConnections.values()) {
      ws.close();
    }
    this.websocketConnections.clear();

    console.log('⏹️ Real-time CVE monitoring stopped');
  }

  /**
   * Get real-time monitoring status
   */
  getRealTimeStatus() {
    return {
      enabled: this.realTimeEnabled,
      feeds: this.realTimeFeeds,
      lastUpdate: this.lastUpdate,
      activeConnections: this.websocketConnections.size,
    };
  }

  /**
   * Subscribe to specific vulnerability patterns
   */
  subscribeToPattern(pattern, callback) {
    const listener = (data) => {
      const matchingVulns = data.vulnerabilities.filter(vuln =>
        this.matchesPattern(vuln, pattern)
      );

      if (matchingVulns.length > 0) {
        callback({
          ...data,
          vulnerabilities: matchingVulns,
        });
      }
    };

    this.on('new-vulnerabilities', listener);

    return () => {
      this.off('new-vulnerabilities', listener);
    };
  }

  /**
   * Check if vulnerability matches pattern
   */
  matchesPattern(vulnerability, pattern) {
    const { ecosystem, package: packageName, severity, cveId } = pattern;

    if (ecosystem && vulnerability.ecosystem !== ecosystem) {
      return false;
    }

    if (packageName && !vulnerability.summary?.includes(packageName)) {
      return false;
    }

    if (severity && vulnerability.severity !== severity) {
      return false;
    }

    if (cveId && vulnerability.cveId !== cveId) {
      return false;
    }

    return true;
  }

  /**
   * Generate security advisory from new vulnerability
   */
  generateSecurityAdvisory(vulnerability) {
    return {
      id: `sentinel-advisory-${Date.now()}`,
      type: 'security-advisory',
      severity: vulnerability.severity,
      title: `New Vulnerability: ${vulnerability.summary}`,
      message: `A new vulnerability has been detected:\n\n${vulnerability.summary}\n\nCVE: ${vulnerability.cveId}\nSeverity: ${vulnerability.severity}\nCVSS Score: ${vulnerability.cvssScore || 'N/A'}\n\nPublished: ${vulnerability.publishedDate}\nDetails: ${vulnerability.permalink || 'N/A'}`,
      file: 'dependency-scan',
      line: 1,
      column: 1,
      analyzer: 'CVE-Real-Time',
      tags: ['security', 'vulnerability', 'real-time'],
      metadata: {
        source: vulnerability.source,
        cveId: vulnerability.cveId,
        publishedDate: vulnerability.publishedDate,
        cvssScore: vulnerability.cvssScore,
      },
    };
  }

  /**
   * Cleanup expired cache entries
   */
  cleanupCache() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp.getTime() > this.cacheExpiry) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned ${cleaned} expired cache entries`);
      this.saveCache();
    }
  }
}

export default CVEDatabaseIntegration;

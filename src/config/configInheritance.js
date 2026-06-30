/**
 * Configuration Inheritance System
 *
 * Resolves configuration from multiple sources with precedence:
 *   1. Branch-specific config (.sentinel.branch.yaml) — highest
 *   2. Local repo config (.sentinel.yaml in project root)
 *   3. Global user config (~/.sentinel.yaml)
 *   4. Organization defaults (org-config-url or central config)
 *   5. Built-in defaults — lowest
 *
 * Child configs override parent configs via deep merge.
 */

import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { DEFAULT_CONFIG } from './configSchema.js';
import { parseYaml, deepMerge } from './yamlConfigManager.js';

export class ConfigInheritance {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.branch = options.branch || null;
    this.orgConfigUrl = options.orgConfigUrl || null;
    this._cache = new Map();
  }

  /**
   * Resolve the full config hierarchy.
   * Returns the final merged config object.
   */
  async resolveConfigHierarchy() {
    const layers = [];

    // Layer 1: Built-in defaults (lowest priority)
    layers.push({ source: 'defaults', config: structuredClone(DEFAULT_CONFIG) });

    // Layer 2: Organization config (if configured)
    if (this.orgConfigUrl) {
      const orgConfig = await this.loadOrgConfig(this.orgConfigUrl);
      if (orgConfig) {
        layers.push({ source: 'org', config: orgConfig });
      }
    }

    // Layer 3: Global user config (~/.sentinel.yaml)
    const globalConfig = await this.loadGlobalConfig();
    if (globalConfig) {
      layers.push({ source: 'global', config: globalConfig });
    }

    // Layer 4: Local repo config (.sentinel.yaml)
    const localConfig = await this.loadLocalConfig();
    if (localConfig) {
      layers.push({ source: 'local', config: localConfig });
    }

    // Layer 5: Branch-specific config (highest priority)
    if (this.branch) {
      const branchConfig = await this.loadBranchConfig(this.branch);
      if (branchConfig) {
        layers.push({ source: `branch:${this.branch}`, config: branchConfig });
      }
    }

    // Layer 6: Environment variable overrides
    const envOverrides = this.loadEnvOverrides();
    if (envOverrides) {
      layers.push({ source: 'env', config: envOverrides });
    }

    // Merge all layers (later layers override earlier ones)
    let merged = {};
    for (const layer of layers) {
      merged = deepMerge(merged, layer.config);
    }

    return {
      config: merged,
      layers: layers.map(l => ({ source: l.source, keys: Object.keys(l.config) }))
    };
  }

  /**
   * Load global user config from ~/.sentinel.yaml
   */
  async loadGlobalConfig() {
    const candidates = [
      path.join(os.homedir(), '.sentinel.yaml'),
      path.join(os.homedir(), '.sentinel.yml'),
      path.join(os.homedir(), '.sentinel.json'),
    ];

    const xdgConfigHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    candidates.push(
      path.join(xdgConfigHome, 'sentinel', '.sentinel.yaml'),
      path.join(xdgConfigHome, 'sentinel', '.sentinel.json')
    );

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return this.loadConfigFile(candidate);
      }
    }

    return null;
  }

  /**
   * Load local repository config from .sentinel.yaml
   */
  async loadLocalConfig() {
    const candidates = [
      path.join(this.projectRoot, '.sentinel.yaml'),
      path.join(this.projectRoot, '.sentinel.yml'),
      path.join(this.projectRoot, '.sentinel.json'),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return this.loadConfigFile(candidate);
      }
    }

    return null;
  }

  /**
   * Load branch-specific config (.sentinel.<branch>.yaml)
   */
  async loadBranchConfig(branch) {
    const safeName = branch.replace(/[^a-zA-Z0-9._-]/g, '_');
    const candidates = [
      path.join(this.projectRoot, `.sentinel.${safeName}.yaml`),
      path.join(this.projectRoot, `.sentinel.${safeName}.json`),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return this.loadConfigFile(candidate);
      }
    }

    return null;
  }

  /**
   * Load organization config from URL or file path.
   */
  async loadOrgConfig(urlOrPath) {
    try {
      if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
        // Fetch remote config
        if (this._cache.has(urlOrPath)) {
          return this._cache.get(urlOrPath);
        }

        const response = await fetch(urlOrPath, {
          signal: AbortSignal.timeout(5000),
          headers: { Accept: 'application/x-yaml, application/json' }
        });

        if (!response.ok) return null;

        const text = await response.text();
        const config = urlOrPath.endsWith('.json')
          ? JSON.parse(text)
          : await parseYaml(text);

        this._cache.set(urlOrPath, config);
        return config;
      }

      // Local file path
      if (existsSync(urlOrPath)) {
        return this.loadConfigFile(urlOrPath);
      }
    } catch {
      // Org config is optional — fail silently
    }

    return null;
  }

  /**
   * Load and parse a config file (YAML or JSON).
   */
  async loadConfigFile(filePath) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');

      if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        return await parseYaml(raw);
      }

      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Load configuration overrides from environment variables.
   */
  loadEnvOverrides() {
    const overrides = {};

    // SENTINEL_AUTO_REVIEW=true/false
    if (process.env.SENTINEL_AUTO_REVIEW !== undefined) {
      overrides.reviews = {
        auto_review: {
          enabled: process.env.SENTINEL_AUTO_REVIEW === 'true'
        }
      };
    }

    // SENTINEL_REVIEW_TONE=professional|casual|assertive
    if (process.env.SENTINEL_REVIEW_TONE) {
      overrides.reviews = overrides.reviews || {};
      overrides.reviews.review_style = { tone: process.env.SENTINEL_REVIEW_TONE };
    }

    // SENTINEL_SAST_AUTO_DETECT=true/false
    if (process.env.SENTINEL_SAST_AUTO_DETECT !== undefined) {
      overrides.sast = {
        auto_detect: process.env.SENTINEL_SAST_AUTO_DETECT === 'true'
      };
    }

    // SENTINEL_AUTOFIX_ENABLED=true/false
    if (process.env.SENTINEL_AUTOFIX_ENABLED !== undefined) {
      overrides.autofix = {
        enabled: process.env.SENTINEL_AUTOFIX_ENABLED === 'true'
      };
    }

    // SENTINEL_ORG_CONFIG_URL=https://...
    if (process.env.SENTINEL_ORG_CONFIG_URL) {
      this.orgConfigUrl = process.env.SENTINEL_ORG_CONFIG_URL;
    }

    return Object.keys(overrides).length > 0 ? overrides : null;
  }

  /**
   * Detect the current git branch (if not explicitly set).
   */
  async detectBranch() {
    if (this.branch) return this.branch;

    try {
      const { execSync } = await import('child_process');
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
      this.branch = branch;
      return branch;
    } catch {
      return null;
    }
  }

  /**
   * Clear the config cache.
   */
  clearCache() {
    this._cache.clear();
  }
}

export default ConfigInheritance;

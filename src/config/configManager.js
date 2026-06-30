/**
 * Sentinel Configuration Manager
 *
 * Looks for configuration in the following locations (in order of priority):
 * 1. ./.sentinel.yaml or ./.sentinel.json (local directory - highest priority)
 * 2. $XDG_CONFIG_HOME/sentinel/.sentinel.yaml
 * 3. $HOME/.sentinel.yaml (global config)
 *
 * Supports both YAML (.sentinel.yaml) and JSON (.sentinel.json) formats.
 * YAML is preferred; JSON is supported for backward compatibility.
 *
 * API keys are stored securely and never committed to version control.
 */

import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

class ConfigManager {
  constructor() {
    this.configFileName = '.sentinel.json';
    this.yamlFileName = '.sentinel.yaml';
    this.config = null;
    this.configPath = null;
    this.configSource = null; // 'yaml' | 'json' | 'default'

    // Default configuration structure
    this.defaultConfig = {
      // Data directory for caches and history
      data: {
        directory: '.sentinel'
      },

      // AI Provider configurations
      providers: {
        openai: {
          apiKey: '',
          disabled: false
        },
        anthropic: {
          apiKey: '',
          disabled: false
        },
        gemini: {
          apiKey: '',
          disabled: false
        },
        groq: {
          apiKey: '',
          disabled: false
        },
        openrouter: {
          apiKey: '',
          disabled: false
        },
        ollama: {
          apiKey: '',
          disabled: false,
          host: 'http://localhost:11434'
        },
        copilot: {
          disabled: true
        }
      },

      // Agent configurations
      agents: {
        coder: {
          model: 'gpt-4o-mini',
          maxTokens: 5000
        },
        task: {
          model: 'claude-3-5-sonnet-20241022',
          maxTokens: 5000
        },
        title: {
          model: 'gpt-4o-mini',
          maxTokens: 80
        }
      },

      // Shell configuration
      shell: {
        path: process.platform === 'win32' ? 'powershell' : '/bin/bash',
        args: process.platform === 'win32' ? [] : ['-l']
      },

      // MCP Server configurations
      mcpServers: {},

      // LSP configurations
      lsp: {
        typescript: {
          disabled: false,
          command: 'typescript-language-server'
        }
      },

      // Debug settings
      debug: false,
      debugLSP: false,
      autoCompact: true
    };
  }

  /**
   * Get all possible config file paths in order of priority.
   * Checks YAML first, then JSON for each location.
   */
  getConfigPaths() {
    const paths = [];

    // 1. Local directory (highest priority) — YAML then JSON
    paths.push(path.join(process.cwd(), this.yamlFileName));
    paths.push(path.join(process.cwd(), this.configFileName));

    // 2. XDG_CONFIG_HOME
    const xdgConfigHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    paths.push(path.join(xdgConfigHome, 'sentinel', this.yamlFileName));
    paths.push(path.join(xdgConfigHome, 'sentinel', this.configFileName));

    // 3. Home directory (global config)
    paths.push(path.join(os.homedir(), this.yamlFileName));
    paths.push(path.join(os.homedir(), this.configFileName));

    return paths;
  }

  /**
   * Find the first existing config file (YAML preferred over JSON)
   */
  async findConfigFile() {
    const paths = this.getConfigPaths();

    for (const configPath of paths) {
      try {
        await fs.access(configPath);
        return configPath;
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Get the default config path (global home directory)
   */
  getDefaultConfigPath() {
    return path.join(os.homedir(), this.yamlFileName);
  }

  /**
   * Load configuration from file (YAML or JSON).
   */
  async load() {
    const existingPath = await this.findConfigFile();

    if (existingPath) {
      try {
        const data = await fs.readFile(existingPath, 'utf8');

        if (existingPath.endsWith('.yaml') || existingPath.endsWith('.yml')) {
          const { parseYaml } = await import('./yamlConfigManager.js');
          const parsed = await parseYaml(data);
          this.config = this.mergeDeep(this.defaultConfig, parsed || {});
          this.configSource = 'yaml';
        } else {
          this.config = this.mergeDeep(this.defaultConfig, JSON.parse(data));
          this.configSource = 'json';
        }

        this.configPath = existingPath;
        return this.config;
      } catch (error) {
        console.warn(`Warning: Could not parse config at ${existingPath}: ${error.message}`);
      }
    }

    // No config found, use defaults
    this.config = { ...this.defaultConfig };
    this.configPath = this.getDefaultConfigPath();
    this.configSource = 'default';
    return this.config;
  }

  /**
   * Save configuration to file (JSON by default for backward compat).
   */
  async save(config = null, targetPath = null) {
    const configToSave = config || this.config;
    const savePath = targetPath || this.configPath || this.getDefaultConfigPath();

    const dir = path.dirname(savePath);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {
      // Directory might already exist
    }

    if (savePath.endsWith('.yaml') || savePath.endsWith('.yml')) {
      const { stringifyYaml } = await import('./yamlConfigManager.js');
      const content = await stringifyYaml(configToSave);
      await fs.writeFile(savePath, content, 'utf8');
    } else {
      await fs.writeFile(savePath, JSON.stringify(configToSave, null, 2), { mode: 0o600 });
    }

    this.config = configToSave;
    this.configPath = savePath;

    return savePath;
  }

  /**
   * Save configuration as YAML format.
   */
  async saveYaml(config = null, targetPath = null) {
    const yamlPath = targetPath || (this.configPath || path.join(process.cwd(), this.yamlFileName)).replace(/\.json$/, '.yaml');
    this.configPath = yamlPath;
    return this.save(config, yamlPath);
  }

  /**
   * Migrate .sentinel.json to .sentinel.yaml
   */
  async migrateToYaml(jsonPath = null) {
    const srcPath = jsonPath || path.join(process.cwd(), this.configFileName);
    if (!existsSync(srcPath)) return null;

    await this.load();
    const yamlPath = srcPath.replace(/\.json$/, '.yaml');
    return this.saveYaml(null, yamlPath);
  }

  /**
   * Get a configuration value by dot-notation path
   */
  get(key, defaultValue = null) {
    if (!this.config) return defaultValue;

    const parts = key.split('.');
    let value = this.config;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return defaultValue;
      }
    }

    return value ?? defaultValue;
  }

  /**
   * Set a configuration value by dot-notation path
   */
  set(key, value) {
    if (!this.config) this.config = { ...this.defaultConfig };

    const parts = key.split('.');
    let target = this.config;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in target) || typeof target[parts[i]] !== 'object') {
        target[parts[i]] = {};
      }
      target = target[parts[i]];
    }

    target[parts[parts.length - 1]] = value;
  }

  /**
   * Set an API key for a provider
   */
  async setApiKey(provider, apiKey) {
    await this.load();

    if (!this.config.providers) {
      this.config.providers = {};
    }

    if (!this.config.providers[provider]) {
      this.config.providers[provider] = { apiKey: '', disabled: false };
    }

    this.config.providers[provider].apiKey = apiKey;

    if (apiKey) {
      this.config.providers[provider].disabled = false;
    }

    return await this.save();
  }

  /**
   * Get an API key for a provider
   */
  getApiKey(provider) {
    return this.config?.providers?.[provider]?.apiKey || null;
  }

  /**
   * Check if a provider is enabled
   */
  isProviderEnabled(provider) {
    const providerConfig = this.config?.providers?.[provider];
    if (!providerConfig) return false;
    return !providerConfig.disabled && !!providerConfig.apiKey;
  }

  /**
   * Get all configured providers
   */
  getConfiguredProviders() {
    if (!this.config?.providers) return [];

    return Object.entries(this.config.providers)
      .filter(([_, settings]) => settings.apiKey && !settings.disabled)
      .map(([name]) => name);
  }

  // ─── CodeRabbit-style config getters ──────────────────────────────────

  /** Get auto-review configuration */
  getAutoReviewConfig() {
    return this.get('reviews.auto_review', {
      enabled: true, drafts: false, base_branches: ['main', 'develop', 'master'],
      labels: [], ignore_title_keywords: [], ignore_usernames: [],
      auto_pause_after_reviewed_commits: 5, auto_incremental_review: true
    });
  }

  /** Get path filters for reviews */
  getPathFilters() {
    return this.get('reviews.path_filters', {
      include: [],
      exclude: ['node_modules/**', 'dist/**', 'build/**', '.git/**', 'coverage/**']
    });
  }

  /** Get per-path review instructions */
  getPathInstructions() {
    return this.get('reviews.path_instructions', []);
  }

  /** Get review style settings */
  getReviewStyle() {
    return this.get('reviews.review_style', {
      tone: 'professional', detail_level: 'standard', emoji_usage: 'full', assertive_mode: false
    });
  }

  /** Get knowledge base configuration */
  getKnowledgeBaseConfig() {
    return this.get('knowledge_base', {
      code_guidelines: { enabled: true, sources: ['.cursorrules', 'CLAUDE.md', 'SENTINEL.md'] },
      learnings: { enabled: true, storage_path: '.sentinel/learnings.json' },
      linked_issues: { github: true, gitlab: true, jira: false, linear: false },
      web_search: true, past_pr_context: true, multi_repo: { enabled: false, repos: [] },
      opt_out: false
    });
  }

  /** Get pre-merge quality gate checks */
  getPreMergeChecks() {
    return this.get('pre_merge_checks', {
      docstring_coverage: { enabled: false, threshold: 80, mode: 'warning' },
      pr_title: { enabled: false, pattern: '^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert):', mode: 'error' },
      pr_description: { enabled: false, template: '', min_length: 50, mode: 'warning' },
      issue_assessment: { enabled: false, mode: 'warning' },
      custom_checks: []
    });
  }

  /** Get SAST tool configuration */
  getSastConfig() {
    return this.get('sast', {
      auto_detect: true,
      tools: { javascript: ['eslint'], typescript: ['eslint'], python: ['ruff', 'pylint'], go: ['golangci-lint'] },
      security: ['semgrep', 'osv-scanner', 'trufflehog'],
      iac: ['checkov', 'trivy'], cicd: ['actionlint']
    });
  }

  /** Get autofix configuration */
  getAutofixConfig() {
    return this.get('autofix', {
      enabled: true, auto_push: false, generate_docstrings: false,
      generate_tests: false, resolve_conflicts: false, confidence_threshold: 0.8
    });
  }

  /** Get finishing touches configuration */
  getFinishingTouches() {
    return this.get('finishing_touches', { simplify_code: true, custom_recipes: [] });
  }

  /** Get tool permission policies */
  getPermissions() {
    return this.get('permissions', {
      tools: {},
      defaults: { read: 'allow', write: 'allow', shell: 'ask', network: 'allow', undo: 'allow' }
    });
  }

  /**
   * Check if a file path should be analyzed based on path_filters.
   */
  async shouldAnalyzeFile(filePath) {
    const filters = this.getPathFilters();
    const normalized = filePath.replace(/\\/g, '/');
    const { matchesGlob } = await import('./yamlConfigManager.js');

    for (const pattern of filters.exclude) {
      if (matchesGlob(normalized, pattern)) return false;
    }

    if (filters.include.length > 0) {
      return filters.include.some(p => matchesGlob(normalized, p));
    }

    return true;
  }

  /**
   * Resolve path-specific instructions for a given file path.
   */
  async resolvePathInstructions(filePath) {
    const instructions = this.getPathInstructions();
    const matched = [];
    const { matchesGlob } = await import('./yamlConfigManager.js');

    for (const entry of instructions) {
      if (matchesGlob(filePath.replace(/\\/g, '/'), entry.path)) {
        matched.push(entry.instructions);
      }
    }

    return matched;
  }

  /**
   * Deep merge utility
   */
  mergeDeep(target, source) {
    const isObject = obj => obj && typeof obj === 'object' && !Array.isArray(obj);

    if (!isObject(target) || !isObject(source)) {
      return source;
    }

    const result = { ...target };

    for (const key of Object.keys(source)) {
      if (isObject(source[key])) {
        result[key] = this.mergeDeep(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Get masked version of config (hides API keys)
   */
  getMaskedConfig() {
    const masked = JSON.parse(JSON.stringify(this.config || {}));

    if (masked.providers) {
      for (const [provider, settings] of Object.entries(masked.providers)) {
        if (settings.apiKey) {
          const key = settings.apiKey;
          masked.providers[provider].apiKey = key.length > 8
            ? `${key.slice(0, 4)}${'*'.repeat(key.length - 8)}${key.slice(-4)}`
            : '********';
        }
      }
    }

    return masked;
  }

  /**
   * Inject API keys into environment variables
   */
  injectEnvVars() {
    if (!this.config?.providers) return;

    const envMap = {
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      gemini: 'GEMINI_API_KEY',
      groq: 'GROQ_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      ollama: 'OLLAMA_HOST'
    };

    for (const [provider, envKey] of Object.entries(envMap)) {
      const apiKey = this.config.providers[provider]?.apiKey;
      if (apiKey && !process.env[envKey]) {
        process.env[envKey] = apiKey;
      }
    }
  }
}

export { ConfigManager };

// Export singleton instance
export const configManager = new ConfigManager();
export default configManager;

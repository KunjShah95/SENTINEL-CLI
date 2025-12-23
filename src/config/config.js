import { promises as fs } from 'fs';
import path from 'path';
import envLoader from './envLoader.js';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

export class Config {
  constructor() {
    this.defaultConfig = {
      // Analysis Settings
      analysis: {
        enabledAnalyzers: ['security', 'quality', 'bugs', 'performance'],
        maxFileSize: 1000000, // 1MB
        ignoredFiles: [
          'node_modules/**',
          'dist/**',
          'build/**',
          '.git/**',
          '*.min.js',
          '*.min.css',
          'vendor/**',
        ],
        languages: ['javascript', 'typescript', 'python', 'java', 'php', 'go', 'rust'],
      },

      // Security Settings
      security: {
        enableSecretScanning: true,
        enableDependencyScanning: true,
        severityThresholds: {
          critical: 'error',
          high: 'warning',
          medium: 'warning',
          low: 'info',
        },
        customRules: [],
      },

      // Quality Settings
      quality: {
        complexityThreshold: 10,
        duplicationThreshold: 3,
        maintainabilityIndex: 65,
        testCoverageThreshold: 80,
        documentationThreshold: 80,
      },

      // Performance Settings
      performance: {
        enablePerformanceAnalysis: true,
        memoryLeakDetection: true,
        algorithmicComplexityAnalysis: true,
        nPlusOneDetection: true,
      },

      // Output Settings
      output: {
        format: 'console', // console, json, html, markdown
        includeCodeSnippets: true,
        includeSuggestions: true,
        maxSuggestionsPerFile: 20,
      },

      // Integration Settings
      integrations: {
        github: {
          enabled: false,
          token: null,
          repository: null,
          branch: 'main',
        },
        precommit: {
          enabled: true,
          blocking: false,
          timeout: 30000,
        },
      },

      // Advanced Features
      ai: {
        enabled: true,
        provider: 'local', // local, openai, anthropic
        model: 'gpt-3.5-turbo',
        maxTokens: 2000,
        temperature: 0.3,
        providers: [
          {
            id: 'openai-default',
            provider: 'openai',
            model: 'gpt-4o-mini',
            enabled: true,
            weight: 0.34,
            apiKeyEnv: 'OPENAI_API_KEY',
          },
          {
            id: 'groq-default',
            provider: 'groq',
            model: 'llama3-70b-8192',
            enabled: true,
            weight: 0.22,
            apiKeyEnv: 'GROQ_API_KEY',
          },
          {
            id: 'gemini-default',
            provider: 'gemini',
            model: 'gemini-1.5-flash',
            enabled: true,
            weight: 0.22,
            apiKeyEnv: 'GEMINI_API_KEY',
          },
          {
            id: 'openrouter-default',
            provider: 'openrouter',
            model: 'google/gemini-pro-1.5',
            enabled: true,
            weight: 0.22,
            apiKeyEnv: 'OPENROUTER_API_KEY',
          },
        ],
        cache: {
          enabled: true,
          path: '.codereview-cache.json',
          ttlMinutes: 1440,
        },
      },

      ml: {
        enabled: true,
        modelPath: null,
        confidenceThreshold: 0.7,
        adaptiveLearning: true,
      },

      plugins: {
        enabled: [],
        customRules: [],
        externalAnalyzers: [],
      },
    };

    this.config = null;
    this.configPath = path.join(process.cwd(), '.codereviewrc.json');
  }

  async load() {
    // Load environment variables from .env file first
    await envLoader.loadEnvFile();

    try {
      const configData = await fs.readFile(this.configPath, 'utf8');
      this.config = JSON.parse(configData);
      // Merge with defaults
      this.config = this.mergeDeep(this.defaultConfig, this.config);
      this.stripInlineSecrets();
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Config file doesn't exist, use defaults
        this.config = { ...this.defaultConfig };
        await this.save();
      } else {
        throw new Error(`Failed to load config: ${error.message}`);
      }
    }

    return this.config;
  }

  async save() {
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
  }

  get(key, defaultValue = null) {
    if (!this.config) {
      throw new Error('Config not loaded. Call load() first.');
    }

    const keys = key.split('.');
    let value = this.config;

    for (const k of keys) {
      if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, k)) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }

    return value;
  }

  set(key, value) {
    if (!this.config) {
      throw new Error('Config not loaded. Call load() first.');
    }

    const keys = key.split('.');
    let target = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in target) || typeof target[keys[i]] !== 'object') {
        target[keys[i]] = {};
      }
      target = target[keys[i]];
    }

    target[keys[keys.length - 1]] = value;
  }

  mergeDeep(target, source) {
    const isObject = obj => obj && typeof obj === 'object';

    if (!isObject(target) || !isObject(source)) {
      return source;
    }

    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        if (isObject(source[key])) {
          if (!target[key]) Object.assign(target, { [key]: {} });
          this.mergeDeep(target[key], source[key]);
        } else {
          Object.assign(target, { [key]: source[key] });
        }
      }
    }

    return target;
  }

  stripInlineSecrets() {
    if (!this.config || !this.config.ai) return;

    const providers = Array.isArray(this.config.ai.providers) ? this.config.ai.providers : [];
    let removed = 0;

    if (this.config.ai.apiKey) {
      delete this.config.ai.apiKey;
      removed++;
    }

    providers.forEach(provider => {
      if (provider && provider.apiKey) {
        delete provider.apiKey;
        removed++;
      }
    });

    if (removed > 0) {
      console.warn(
        `Removed ${removed} inline API key(s) from config. Use environment variables (e.g., OPENAI_API_KEY) instead.`
      );
      this.config.ai.providers = providers;
      // Persist the sanitized config to avoid reintroducing secrets later.
        this.save().catch(err => console.warn(`Config: failed to save sanitized config: ${err.message}`));
    }
  }

  async validate() {
    const requiredPaths = [
      'analysis.enabledAnalyzers',
      'security.severityThresholds',
      'output.format',
    ];

    for (const path of requiredPaths) {
      if (this.get(path) === null) {
        throw new Error(`Required config path missing: ${path}`);
      }
    }

    return true;
  }

  getAnalyzers() {
    // Check environment variable first (set by CLI --analyzers flag)
    if (process.env.SENTINEL_ANALYZERS) {
      return process.env.SENTINEL_ANALYZERS.split(',').map(a => a.trim()).filter(Boolean);
    }
    return this.get('analysis.enabledAnalyzers', []);
  }

  getIgnoredFiles() {
    return this.get('analysis.ignoredFiles', []);
  }

  getSupportedLanguages() {
    return this.get('analysis.languages', []);
  }

  shouldBlockOnError() {
    return this.get('integrations.precommit.blocking', false);
  }

  getSeverityThreshold(severity) {
    const thresholds = this.get('security.severityThresholds', {});
    return thresholds[severity] || 'info';
  }
}

export default Config;

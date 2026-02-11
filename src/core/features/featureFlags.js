import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

class FeatureFlags {
  constructor(options = {}) {
    this.flags = new Map();
    this.storagePath = options.storagePath || '.sentinel/feature-flags.json';
    this.userId = options.userId || this.generateAnonymousId();
    this.refreshInterval = options.refreshInterval || 60000;
    this.refreshTimer = null;
    this.isLoaded = false;
    this.listeners = new Map();
    this.remoteConfig = null;
  }

  async load() {
    try {
      const data = await this.readStorage();
      if (data) {
        for (const [key, flag] of Object.entries(data)) {
          this.flags.set(key, {
            ...flag,
            loadedAt: Date.now(),
          });
        }
      }

      this.loadDefaults();
      this.isLoaded = true;
    } catch (error) {
      console.warn('Failed to load feature flags:', error.message);
      this.loadDefaults();
    }
  }

  loadDefaults() {
    const defaults = {
      'new-analyzer-framework': {
        enabled: true,
        rollout: 100,
        description: 'New plugin-based analyzer framework',
        owner: 'core-team',
        tags: ['analyzer', 'breaking'],
      },
      'enhanced-cache': {
        enabled: true,
        rollout: 100,
        description: 'Enhanced caching with TTL support',
        owner: 'perf-team',
        tags: ['performance', 'cache'],
      },
      'ai-improvements': {
        enabled: true,
        rollout: 100,
        description: 'Improved AI suggestions and false positive reduction',
        owner: 'ai-team',
        tags: ['ai', 'quality'],
      },
      'parallel-processing': {
        enabled: true,
        rollout: 100,
        description: 'Parallel file analysis for better performance',
        owner: 'perf-team',
        tags: ['performance'],
      },
      'webhook-improvements': {
        enabled: false,
        rollout: 0,
        description: 'New webhook format with detailed analysis',
        owner: 'integration-team',
        tags: ['webhook', 'integration'],
        targetUsers: ['enterprise-users'],
      },
      'cloud-integration': {
        enabled: false,
        rollout: 0,
        description: 'Cloud-based analysis and caching',
        owner: 'cloud-team',
        tags: ['cloud', 'enterprise'],
        targetUsers: ['enterprise-users'],
      },
      'custom-rules': {
        enabled: true,
        rollout: 100,
        description: 'Custom rule support',
        owner: 'core-team',
        tags: ['rules', 'custom'],
      },
      'enhanced-reporting': {
        enabled: true,
        rollout: 100,
        description: 'Enhanced reporting with charts and trends',
        owner: 'ux-team',
        tags: ['reporting', 'ui'],
      },
      'github-app-v2': {
        enabled: false,
        rollout: 10,
        description: 'GitHub App v2 with improved PR reviews',
        owner: 'integration-team',
        tags: ['github', 'integration'],
        targetEnvironments: ['staging'],
      },
      'ml-false-positive-reduction': {
        enabled: true,
        rollout: 50,
        description: 'ML-based false positive detection',
        owner: 'ai-team',
        tags: ['ml', 'ai', 'quality'],
        percentage: 50,
      },
    };

    for (const [name, config] of Object.entries(defaults)) {
      if (!this.flags.has(name)) {
        this.flags.set(name, {
          ...config,
          name,
          isDefault: true,
        });
      }
    }
  }

  async save() {
    try {
      const data = {};
      for (const [key, flag] of this.flags) {
        data[key] = {
          enabled: flag.enabled,
          rollout: flag.rollout,
          variant: flag.variant,
          config: flag.config,
        };
      }

      await this.writeStorage(data);
    } catch (error) {
      console.warn('Failed to save feature flags:', error.message);
    }
  }

  isEnabled(featureName, defaultValue = false) {
    const flag = this.flags.get(featureName);
    if (!flag) {
      return defaultValue;
    }

    if (!flag.enabled) {
      return false;
    }

    if (flag.rollout === undefined || flag.rollout === 100) {
      return true;
    }

    if (flag.rollout === 0) {
      return false;
    }

    const userHash = this.getUserHash(featureName);
    const percentage = flag.percentage || flag.rollout;
    return (userHash % 100) < percentage;
  }

  getVariant(featureName) {
    const flag = this.flags.get(featureName);
    if (!flag || !flag.enabled) {
      return 'control';
    }

    const variants = flag.variants || ['control', 'treatment'];
    const userHash = this.getUserHash(`${featureName}:${this.userId}`);
    return variants[userHash % variants.length] || 'control';
  }

  getConfig(featureName, key = null) {
    const flag = this.flags.get(featureName);
    if (!flag || !flag.config) {
      return null;
    }

    if (key === null) {
      return flag.config;
    }

    return flag.config[key];
  }

  setFeature(featureName, config) {
    const existing = this.flags.get(featureName) || {};
    this.flags.set(featureName, {
      ...existing,
      ...config,
      name: featureName,
      updatedAt: Date.now(),
      updatedBy: this.userId,
    });

    this.notifyListeners(featureName, this.flags.get(featureName));
    this.save();
  }

  enableFeature(featureName) {
    this.setFeature(featureName, { enabled: true });
  }

  disableFeature(featureName) {
    this.setFeature(featureName, { enabled: false });
  }

  setRollout(featureName, percentage) {
    this.setFeature(featureName, { rollout: percentage });
  }

  async addTargetUser(featureName, userId) {
    const flag = this.flags.get(featureName);
    if (!flag) return;

    const targetUsers = flag.targetUsers || [];
    if (!targetUsers.includes(userId)) {
      targetUsers.push(userId);
      this.setFeature(featureName, { targetUsers });
    }
  }

  async removeTargetUser(featureName, userId) {
    const flag = this.flags.get(featureName);
    if (!flag) return;

    const targetUsers = (flag.targetUsers || []).filter(u => u !== userId);
    this.setFeature(featureName, { targetUsers });
  }

  isTargetUser(featureName) {
    const flag = this.flags.get(featureName);
    if (!flag || !flag.targetUsers) {
      return false;
    }

    return flag.targetUsers.includes(this.userId);
  }

  onFeatureChange(featureName, callback) {
    if (!this.listeners.has(featureName)) {
      this.listeners.set(featureName, new Set());
    }
    this.listeners.get(featureName).add(callback);

    return () => {
      this.listeners.get(featureName)?.delete(callback);
    };
  }

  notifyListeners(featureName, flag) {
    const callbacks = this.listeners.get(featureName);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(flag);
        } catch (error) {
          console.warn(`Feature flag listener error for ${featureName}:`, error.message);
        }
      }
    }
  }

  getAllFlags() {
    const result = {};
    for (const [name, flag] of this.flags) {
      result[name] = {
        name,
        enabled: flag.enabled,
        rollout: flag.rollout,
        description: flag.description,
        owner: flag.owner,
        tags: flag.tags || [],
        isEnabled: this.isEnabled(name),
      };
    }
    return result;
  }

  getEnabledFlags() {
    const result = {};
    for (const [name, flag] of this.flags) {
      if (this.isEnabled(name)) {
        result[name] = flag;
      }
    }
    return result;
  }

  getFlagsByTag(tag) {
    const result = {};
    for (const [name, flag] of this.flags) {
      if (flag.tags?.includes(tag)) {
        result[name] = flag;
      }
    }
    return result;
  }

  getUserHash(seed) {
    const data = `${seed}:${this.userId}`;
    return parseInt(crypto.createHash('md5').update(data).digest('hex').slice(0, 8), 16);
  }

  generateAnonymousId() {
    return `anon_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  async readStorage() {
    try {
      const data = await readFile(this.storagePath, 'utf8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async writeStorage(data) {
    const dir = path.dirname(this.storagePath);
    const { mkdir } = await import('fs/promises');
    await mkdir(dir, { recursive: true });
    await writeFile(this.storagePath, JSON.stringify(data, null, 2));
  }

  startAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(async () => {
      await this.load();
    }, this.refreshInterval);
  }

  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  async evaluateFeature(featureName) {
    const flag = this.flags.get(featureName);
    if (!flag) {
      return { enabled: false, reason: 'not-found' };
    }

    if (!flag.enabled) {
      return { enabled: false, reason: 'disabled' };
    }

    if (this.isTargetUser(featureName)) {
      return { enabled: true, reason: 'target-user' };
    }

    if (this.isEnabled(featureName)) {
      return { enabled: true, reason: 'rollout', rollout: flag.rollout };
    }

    return { enabled: false, reason: 'not-in-rollout' };
  }

  createMiddleware(featureName) {
    return (req, res, next) => {
      const evaluation = this.evaluateFeature(featureName, { req });
      req.featureFlags = req.featureFlags || {};
      req.featureFlags[featureName] = evaluation;

      if (!evaluation.enabled) {
        return res.status(404).json({
          error: 'Feature not available',
          feature: featureName,
          reason: evaluation.reason,
        });
      }

      next();
    };
  }
}

export default FeatureFlags;

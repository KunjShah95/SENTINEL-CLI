import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export default class AnalysisCache {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.cachePath = path.resolve(
      options.path || path.join(process.cwd(), '.codereview-cache.json')
    );
    const ttlMinutes = Number(options.ttlMinutes ?? 1440);
    this.ttlMs = Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes * 60 * 1000 : null;
    this.data = { entries: {} };
    this.loaded = false;
    this.pendingSave = null;
  }

  async load() {
    if (!this.enabled || this.loaded) return;
    try {
      const raw = await fs.readFile(this.cachePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = { entries: {}, ...parsed };
      if (!this.data.entries) this.data.entries = {};
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('[AI Analyzer] Failed to load cache:', error.message);
      }
      this.data = { entries: {} };
    }
    this.loaded = true;
  }

  async save() {
    if (!this.enabled) return;
    if (!this.loaded) return;
    if (this.pendingSave) {
      await this.pendingSave;
      return;
    }

    this.pendingSave = fs
      .writeFile(this.cachePath, JSON.stringify(this.data, null, 2))
      .catch(error => {
        console.warn('[AI Analyzer] Failed to save cache:', error.message);
      })
      .finally(() => {
        this.pendingSave = null;
      });

    await this.pendingSave;
  }

  getKey(filePath, content) {
    const normalizedPath = path.normalize(filePath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    return `${normalizedPath}:${hash}`;
  }

  async get(filePath, content) {
    if (!this.enabled) return null;
    await this.load();
    const key = this.getKey(filePath, content);
    const entry = this.data.entries[key];
    if (!entry) return null;

    if (this.ttlMs && Date.now() - entry.timestamp > this.ttlMs) {
      delete this.data.entries[key];
      await this.save();
      return null;
    }

    return entry.payload;
  }

  async set(filePath, content, payload = {}) {
    if (!this.enabled) return;
    await this.load();
    const key = this.getKey(filePath, content);
    this.data.entries[key] = {
      timestamp: Date.now(),
      payload,
    };
    await this.save();
  }

  async purgeExpired() {
    if (!this.enabled) return;
    await this.load();
    if (!this.ttlMs) return;

    const now = Date.now();
    let removed = false;
    const keysToRemove = [];
    for (const [key, entry] of Object.entries(this.data.entries)) {
      if (now - entry.timestamp > this.ttlMs) {
        keysToRemove.push(key);
      }
    }
    
    if (keysToRemove.length > 0) {
      for (const key of keysToRemove) {
        delete this.data.entries[key];
      }
      removed = true;
    }

    if (removed) {
      await this.save();
    }
  }
}

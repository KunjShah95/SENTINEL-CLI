import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

class IncrementalAnalyzer {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || '.sentinel/incremental';
    this.cache = new Map();
    this.isLoaded = false;
    this.maxCacheSize = options.maxCacheSize || 1000;
  }

  async initialize() {
    await fs.mkdir(this.cacheDir, { recursive: true });
    await this.loadCache();
    this.isLoaded = true;
    return this;
  }

  async loadCache() {
    try {
      const files = await fs.readdir(this.cacheDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = await fs.readFile(path.join(this.cacheDir, file), 'utf8');
          const entry = JSON.parse(content);
          this.cache.set(entry.filePath, entry);
        }
      }
    } catch (error) {
      // Cache doesn't exist yet
    }
  }

  async saveCacheEntry(filePath, data) {
    const hash = this.computeHash(data.content);
    const entry = {
      filePath,
      hash,
      timestamp: Date.now(),
      issues: data.issues || [],
      stats: data.stats || {},
      analyzers: data.analyzers || [],
    };

    this.cache.set(filePath, entry);

    // Save to disk
    const cacheFile = this.getCacheFileName(filePath);
    await fs.writeFile(
      path.join(this.cacheDir, cacheFile),
      JSON.stringify(entry, null, 2)
    );

    // Cleanup old entries if needed
    if (this.cache.size > this.maxCacheSize) {
      await this.cleanupOldEntries();
    }
  }

  async getCachedResult(filePath, content) {
    const hash = this.computeHash(content);
    const cached = this.cache.get(filePath);

    if (cached && cached.hash === hash) {
      return {
        isCached: true,
        isStale: false,
        issues: cached.issues,
        stats: cached.stats,
        timestamp: cached.timestamp,
      };
    }

    return {
      isCached: false,
      isStale: cached ? true : false,
      previousIssues: cached?.issues || [],
      previousTimestamp: cached?.timestamp,
    };
  }

  async analyzeWithCache(filePath, content, analyzer, options = {}) {
    const cacheResult = await this.getCachedResult(filePath, content);

    // If cache hit and not forcing reanalysis, return cached results
    if (cacheResult.isCached && !options.force) {
      return {
        ...cacheResult,
        analyzed: false,
        fromCache: true,
      };
    }

    // Run analyzer
    const startTime = Date.now();
    let issues = [];
    let stats = {};

    try {
      if (typeof analyzer.analyzeFile === 'function') {
        const result = await analyzer.analyzeFile(filePath, content, options);
        issues = result.issues || [];
        stats = result.stats || {};
      } else if (typeof analyzer.analyze === 'function') {
        const result = await analyzer.analyze([{ path: filePath, content }], options);
        issues = result.issues || [];
        stats = result.stats || {};
      }
    } catch (error) {
      return {
        analyzed: true,
        fromCache: false,
        error: error.message,
        issues: [],
        stats: {},
      };
    }

    const duration = Date.now() - startTime;

    // Save to cache
    await this.saveCacheEntry(filePath, {
      content,
      issues,
      stats,
      analyzers: [analyzer.name],
    });

    return {
      analyzed: true,
      fromCache: false,
      issues,
      stats: {
        ...stats,
        analysisTime: duration,
      },
      duration,
      newIssues: this.compareIssues(cacheResult.previousIssues || [], issues),
    };
  }

  compareIssues(oldIssues, newIssues) {
    const oldIds = new Set(oldIssues.map(i => this.issueId(i)));

    return {
      added: newIssues.filter(i => !oldIds.has(this.issueId(i))),
      removed: oldIssues.filter(i => !newIssues.some(ni => this.issueId(ni) === this.issueId(i))),
      unchanged: newIssues.filter(i => oldIds.has(this.issueId(i))),
    };
  }

  issueId(issue) {
    return `${issue.type}:${issue.line}:${issue.column}:${issue.message}`;
  }

  computeHash(content) {
    return createHash('md5').update(content).digest('hex');
  }

  getCacheFileName(filePath) {
    const hash = createHash('sha256').update(filePath).digest('hex');
    return `${hash}.json`;
  }

  async cleanupOldEntries() {
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    // Remove oldest 20% of entries
    const removeCount = Math.floor(entries.length * 0.2);

    for (let i = 0; i < removeCount; i++) {
      const [filePath] = entries[i];
      this.cache.delete(filePath);

      try {
        await fs.unlink(path.join(this.cacheDir, this.getCacheFileName(filePath)));
      } catch {
        // Ignore errors
      }
    }
  }

  async invalidate(filePath) {
    this.cache.delete(filePath);

    try {
      await fs.unlink(path.join(this.cacheDir, this.getCacheFileName(filePath)));
    } catch {
      // Ignore errors
    }
  }

  async invalidatePattern(pattern) {
    const regex = new RegExp(pattern);
    const toRemove = [];

    for (const filePath of this.cache.keys()) {
      if (regex.test(filePath)) {
        toRemove.push(filePath);
      }
    }

    for (const filePath of toRemove) {
      await this.invalidate(filePath);
    }

    return toRemove.length;
  }

  async clear() {
    this.cache.clear();

    try {
      const files = await fs.readdir(this.cacheDir);
      for (const file of files) {
        await fs.unlink(path.join(this.cacheDir, file));
      }
    } catch {
      // Ignore errors
    }
  }

  getStats() {
    return {
      cachedFiles: this.cache.size,
      cacheDir: this.cacheDir,
      maxCacheSize: this.maxCacheSize,
      isLoaded: this.isLoaded,
    };
  }

  async getChangedFiles(files) {
    const changed = [];
    const unchanged = [];

    for (const file of files) {
      const result = await this.getCachedResult(file.path, file.content);
      if (result.isCached) {
        unchanged.push(file);
      } else {
        changed.push(file);
      }
    }

    return { changed, unchanged };
  }
}

export default IncrementalAnalyzer;

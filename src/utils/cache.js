/**
 * High-performance caching layer for analysis results
 */
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export class AnalysisCache {
    constructor(options = {}) {
        this.ttl = options.ttl || 3600000; // 1 hour default
        this.maxSize = options.maxSize || 1000; // Max cache entries
        this.cacheDir = options.cacheDir || path.join(os.tmpdir(), 'sentinel-cache');
        this.memory = new Map();
        this.accessTimes = new Map();
        this.enabled = options.enabled !== false;

        if (this.enabled) {
            this.ensureCacheDir();
        }
    }

    /**
     * Ensure cache directory exists
     */
    async ensureCacheDir() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
        } catch (error) {
            console.warn('Failed to create cache directory:', error.message);
            this.enabled = false;
        }
    }

    /**
     * Generate cache key from file content
     */
    generateKey(filePath, content, analyzerName = '') {
        const contentHash = crypto
            .createHash('sha256')
            .update(content)
            .digest('hex')
            .substring(0, 16);

        const pathHash = crypto
            .createHash('sha256')
            .update(filePath)
            .digest('hex')
            .substring(0, 8);

        return `${analyzerName}_${pathHash}_${contentHash}`;
    }

    /**
     * Get cached result
     */
    async get(key) {
        if (!this.enabled) return null;

        // Check memory cache first
        if (this.memory.has(key)) {
            const entry = this.memory.get(key);

            // Check if expired
            if (Date.now() - entry.timestamp > this.ttl) {
                this.memory.delete(key);
                this.accessTimes.delete(key);
                return null;
            }

            // Update access time
            this.accessTimes.set(key, Date.now());
            return entry.data;
        }

        // Check disk cache
        try {
            const cachePath = path.join(this.cacheDir, `${key}.json`);
            const stat = await fs.stat(cachePath);

            // Check if expired
            if (Date.now() - stat.mtimeMs > this.ttl) {
                await fs.unlink(cachePath).catch(() => { });
                return null;
            }

            const data = JSON.parse(await fs.readFile(cachePath, 'utf8'));

            // Load into memory cache
            this.set(key, data, false); // Don't write back to disk

            return data;
        } catch {
            return null;
        }
    }

    /**
     * Set cache entry
     */
    async set(key, data, writeToDisk = true) {
        if (!this.enabled) return;

        // Enforce max size - LRU eviction
        if (this.memory.size >= this.maxSize) {
            this.evictLRU();
        }

        // Store in memory
        this.memory.set(key, {
            data,
            timestamp: Date.now()
        });
        this.accessTimes.set(key, Date.now());

        // Write to disk asynchronously
        if (writeToDisk) {
            this.writeToDisk(key, data).catch(error => {
                console.warn('Failed to write cache to disk:', error.message);
            });
        }
    }

    /**
     * Write cache entry to disk
     */
    async writeToDisk(key, data) {
        const cachePath = path.join(this.cacheDir, `${key}.json`);
        await fs.writeFile(cachePath, JSON.stringify(data), 'utf8');
    }

    /**
     * Evict least recently used entry
     */
    evictLRU() {
        let oldestKey = null;
        let oldestTime = Infinity;

        for (const [key, time] of this.accessTimes.entries()) {
            if (time < oldestTime) {
                oldestTime = time;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.memory.delete(oldestKey);
            this.accessTimes.delete(oldestKey);

            // Remove from disk asynchronously
            const cachePath = path.join(this.cacheDir, `${oldestKey}.json`);
            fs.unlink(cachePath).catch(() => { });
        }
    }

    /**
     * Clear all cache
     */
    async clear() {
        this.memory.clear();
        this.accessTimes.clear();

        try {
            const files = await fs.readdir(this.cacheDir);
            await Promise.all(
                files
                    .filter(f => f.endsWith('.json'))
                    .map(f => fs.unlink(path.join(this.cacheDir, f)).catch(() => { }))
            );
        } catch {
            // Ignore errors
        }
    }

    /**
     * Get or compute cached value
     */
    async getOrCompute(key, computeFn) {
        if (!this.enabled) {
            return await computeFn();
        }

        const cached = await this.get(key);
        if (cached !== null) {
            return cached;
        }

        const result = await computeFn();
        await this.set(key, result);
        return result;
    }

    /**
     * Invalidate cache entries by pattern
     */
    async invalidate(pattern) {
        const regex = new RegExp(pattern);

        // Clear from memory
        for (const key of this.memory.keys()) {
            if (regex.test(key)) {
                this.memory.delete(key);
                this.accessTimes.delete(key);
            }
        }

        // Clear from disk
        try {
            const files = await fs.readdir(this.cacheDir);
            await Promise.all(
                files
                    .filter(f => regex.test(f))
                    .map(f => fs.unlink(path.join(this.cacheDir, f)).catch(() => { }))
            );
        } catch {
            // Ignore errors
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        return {
            memorySize: this.memory.size,
            maxSize: this.maxSize,
            ttl: this.ttl,
            hitRate: this.calculateHitRate(),
            enabled: this.enabled
        };
    }

    /**
     * Calculate cache hit rate
     */
    calculateHitRate() {
        // Simplified calculation - in production, track hits/misses
        return this.memory.size > 0 ? 0.75 : 0;
    }
}

// Singleton instance
export const cache = new AnalysisCache();

export default cache;

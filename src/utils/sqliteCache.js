import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

class PerformanceCache {
    constructor(options = {}) {
        this.ttl = options.ttl || 3600000;
        this.maxSize = options.maxSize || 10000;
        this.cacheDir = options.cacheDir || path.join(process.cwd(), '.sentinel', 'cache');
        this.memory = new Map();
        this.accessTimes = new Map();
        this.enabled = options.enabled !== false;
        this.hits = 0;
        this.misses = 0;
        this.sqliteEnabled = false;
        this.sqliteDb = null;

        if (this.enabled) {
            this.ensureCacheDir();
        }
    }

    async ensureCacheDir() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
        } catch (error) {
            console.warn('Failed to create cache directory:', error.message);
            this.enabled = false;
        }
    }

    async initSqlite() {
        if (this.sqliteEnabled || this.sqliteDb) return;

        try {
            const sqlJs = await import('sql.js');
            const SQL = sqlJs.default || sqlJs;

            if (SQL && typeof SQL.Database === 'function') {
                const dbPath = path.join(this.cacheDir, 'cache.db');
                let existingData = null;

                try {
                    const existingDb = await fs.readFile(dbPath);
                    existingData = new Uint8Array(existingDb);
                } catch (e) {
                    // Ignore - no existing database
                }

                this.sqliteDb = new SQL.Database(existingData);
                this.sqliteDb.run('PRAGMA journal_mode=WAL');
                this.sqliteDb.run('PRAGMA synchronous=NORMAL');

                this.sqliteDb.run(`
                    CREATE TABLE IF NOT EXISTS cache_entries (
                        key TEXT PRIMARY KEY,
                        value TEXT,
                        analyzer TEXT,
                        file_path TEXT,
                        timestamp INTEGER,
                        access_time INTEGER
                    )
                `);

                this.sqliteEnabled = true;
            }
        } catch (e) {
            console.warn('[Cache] SQLite not available, using memory-only mode');
            this.sqliteEnabled = false;
        }
    }

    generateKey(filePath, content, analyzerName = '') {
        const contentHash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 32);
        const pathHash = crypto.createHash('sha256').update(filePath).digest('hex').substring(0, 8);
        return `${analyzerName}_${pathHash}_${contentHash}`;
    }

    async get(key) {
        if (!this.enabled) {
            this.misses++;
            return null;
        }

        if (this.memory.has(key)) {
            const entry = this.memory.get(key);

            if (Date.now() - entry.timestamp > this.ttl) {
                this.memory.delete(key);
                this.accessTimes.delete(key);
                this.misses++;
                return null;
            }

            this.accessTimes.set(key, Date.now());
            this.hits++;
            return entry.data;
        }

        if (this.sqliteEnabled && this.sqliteDb) {
            try {
                const stmt = this.sqliteDb.prepare('SELECT value, timestamp FROM cache_entries WHERE key = ?');
                stmt.bind([key]);

                if (stmt.step()) {
                    const value = stmt.getAsString();
                    const timestamp = stmt.getColumnValue(1);

                    if (Date.now() - timestamp > this.ttl) {
                        this.sqliteDb.run('DELETE FROM cache_entries WHERE key = ?', [key]);
                        stmt.free();
                        this.misses++;
                        return null;
                    }

                    const data = JSON.parse(value);
                    this.memory.set(key, { data, timestamp: Date.now() });
                    this.accessTimes.set(key, Date.now());
                    this.hits++;
                    stmt.free();
                    return data;
                }

                stmt.free();
                this.misses++;
                return null;
            } catch (e) {
                this.misses++;
                return null;
            }
        }

        this.misses++;
        return null;
    }

    async set(key, data, analyzer = '', filePath = '') {
        if (!this.enabled) return;

        if (this.memory.size >= this.maxSize) {
            this.evictLRU();
        }

        const timestamp = Date.now();
        this.memory.set(key, { data, timestamp });
        this.accessTimes.set(key, timestamp);

        if (this.sqliteEnabled && this.sqliteDb) {
            try {
                const value = JSON.stringify(data);
                this.sqliteDb.run(
                    `INSERT OR REPLACE INTO cache_entries (key, value, analyzer, file_path, timestamp, access_time)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [key, value, analyzer, filePath, timestamp, timestamp]
                );
            } catch (e) { /* Ignore */ }
        }
    }

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

            if (this.sqliteEnabled && this.sqliteDb) {
                try {
                    this.sqliteDb.run('DELETE FROM cache_entries WHERE key = ?', [oldestKey]);
                } catch (e) {
                    // Ignore deletion error
                }
            }
        }
    }

    async clear() {
        this.memory.clear();
        this.accessTimes.clear();
        this.hits = 0;
        this.misses = 0;

        if (this.sqliteDb) {
            try {
                this.sqliteDb.run('DELETE FROM cache_entries');
            } catch (e) { /* Ignore */ }
        }

        try {
            const files = await fs.readdir(this.cacheDir);
            await Promise.all(
                files.map(f => fs.unlink(path.join(this.cacheDir, f)).catch(() => { /* Ignore */ }))
            );
        } catch (e) { /* Ignore */ }
    }

    async invalidate(pattern) {
        const regex = new RegExp(pattern);

        for (const key of this.memory.keys()) {
            if (regex.test(key)) {
                this.memory.delete(key);
                this.accessTimes.delete(key);
            }
        }

        if (this.sqliteDb) {
            try {
                const stmt = this.sqliteDb.prepare('SELECT key FROM cache_entries');
                const keysToDelete = [];
                while (stmt.step()) {
                    const key = stmt.getAsString();
                    if (regex.test(key)) {
                        keysToDelete.push(key);
                    }
                }
                stmt.free();

                for (const key of keysToDelete) {
                    this.sqliteDb.run('DELETE FROM cache_entries WHERE key = ?', [key]);
                }
            } catch (e) { /* Ignore */ }
        }
    }

    async getStats() {
        let dbSize = 0;
        if (this.sqliteDb) {
            try {
                const dbPath = path.join(this.cacheDir, 'cache.db');
                const stat = await fs.stat(dbPath);
                dbSize = stat.size;
            } catch (e) { /* Ignore */ }
        }

        const total = this.hits + this.misses;
        const hitRate = total > 0 ? ((this.hits / total) * 100).toFixed(2) + '%' : '0%';

        return {
            memorySize: this.memory.size,
            maxSize: this.maxSize,
            ttl: this.ttl,
            hitRate,
            hits: this.hits,
            misses: this.misses,
            dbSize: (dbSize / 1024).toFixed(2) + ' KB',
            enabled: this.enabled,
            sqliteEnabled: this.sqliteEnabled
        };
    }

    async close() {
        if (this.sqliteDb) {
            try {
                const dbPath = path.join(this.cacheDir, 'cache.db');
                const data = this.sqliteDb.export();
                const buffer = Buffer.from(data);
                await fs.writeFile(dbPath + '.tmp', buffer);
                await fs.rename(dbPath + '.tmp', dbPath);
            } catch (e) { /* Ignore */ }
            this.sqliteDb.close();
            this.sqliteDb = null;
        }
    }
}

export const cache = new PerformanceCache();
export default cache;

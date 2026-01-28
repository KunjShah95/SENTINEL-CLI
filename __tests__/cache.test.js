/**
 * Test suite for Analysis Cache
 */
import { AnalysisCache } from '../src/utils/cache.js';
import { promises as fs } from 'fs';

jest.mock('fs', () => ({
    promises: {
        mkdir: jest.fn().mockResolvedValue(undefined),
        stat: jest.fn(),
        readFile: jest.fn(),
        writeFile: jest.fn().mockResolvedValue(undefined),
        unlink: jest.fn().mockResolvedValue(undefined),
        readdir: jest.fn().mockResolvedValue([])
    }
}));

describe('AnalysisCache', () => {
    let cache;

    beforeEach(() => {
        cache = new AnalysisCache({
            ttl: 1000, // 1 second for testing
            maxSize: 3
        });
        jest.clearAllMocks();
    });

    describe('Key Generation', () => {
        it('should generate consistent keys for same input', () => {
            const key1 = cache.generateKey('test.js', 'content', 'SecurityAnalyzer');
            const key2 = cache.generateKey('test.js', 'content', 'SecurityAnalyzer');

            expect(key1).toBe(key2);
        });

        it('should generate different keys for different content', () => {
            const key1 = cache.generateKey('test.js', 'content1', 'SecurityAnalyzer');
            const key2 = cache.generateKey('test.js', 'content2', 'SecurityAnalyzer');

            expect(key1).not.toBe(key2);
        });

        it('should generate different keys for different analyzers', () => {
            const key1 = cache.generateKey('test.js', 'content', 'SecurityAnalyzer');
            const key2 = cache.generateKey('test.js', 'content', 'QualityAnalyzer');

            expect(key1).not.toBe(key2);
        });
    });

    describe('Memory Cache', () => {
        it('should store and retrieve from memory', async () => {
            const key = 'test-key';
            const data = { issues: [], stats: {} };

            await cache.set(key, data, false);
            const result = await cache.get(key);

            expect(result).toEqual(data);
        });

        it('should return null for non-existent key', async () => {
            const result = await cache.get('non-existent');

            expect(result).toBeNull();
        });

        it('should expire old entries', async () => {
            const key = 'test-key';
            const data = { test: 'data' };

            await cache.set(key, data, false);

            // Fast-forward time
            jest.advanceTimersByTime(2000);

            const result = await cache.get(key);

            expect(result).toBeNull();
        });

        it('should evict LRU entries when max size reached', async () => {
            // Fill cache to max size (3 items)
            await cache.set('key1', { data: 1 }, false);
            await cache.set('key2', { data: 2 }, false);
            await cache.set('key3', { data: 3 }, false);

            // Access key2 to make it more recent
            await cache.get('key2');

            // Add new item, should evict key1 (least recently used)
            await cache.set('key4', { data: 4 }, false);

            expect(await cache.get('key1')).toBeNull();
            expect(await cache.get('key2')).not.toBeNull();
            expect(await cache.get('key4')).not.toBeNull();
        });
    });

    describe('Disk Cache', () => {
        it('should write to disk when enabled', async () => {
            const key = 'test-key';
            const data = { issues: [] };

            await cache.set(key, data, true);

            // Allow async write to complete
            await new Promise(resolve => setImmediate(resolve));

            expect(fs.writeFile).toHaveBeenCalled();
        });

        it('should load from disk to memory on cache miss', async () => {
            const key = 'test-key';
            const data = { issues: [], stats: {} };

            fs.stat.mockResolvedValueOnce({ mtimeMs: Date.now() });
            fs.readFile.mockResolvedValueOnce(JSON.stringify(data));

            const result = await cache.get(key);

            expect(result).toEqual(data);
            expect(fs.readFile).toHaveBeenCalled();
        });
    });

    describe('Cache Operations', () => {
        it('should compute value on cache miss', async () => {
            const key = 'test-key';
            const computeFn = jest.fn().mockResolvedValue({ result: 'computed' });

            const result = await cache.getOrCompute(key, computeFn);

            expect(computeFn).toHaveBeenCalled();
            expect(result).toEqual({ result: 'computed' });
        });

        it('should not compute on cache hit', async () => {
            const key = 'test-key';
            const cached = { result: 'cached' };
            const computeFn = jest.fn().mockResolvedValue({ result: 'computed' });

            await cache.set(key, cached, false);
            const result = await cache.getOrCompute(key, computeFn);

            expect(computeFn).not.toHaveBeenCalled();
            expect(result).toEqual(cached);
        });

        it('should clear all cache', async () => {
            await cache.set('key1', { data: 1 }, false);
            await cache.set('key2', { data: 2 }, false);

            await cache.clear();

            expect(cache.memory.size).toBe(0);
            expect(await cache.get('key1')).toBeNull();
            expect(await cache.get('key2')).toBeNull();
        });

        it('should invalidate by pattern', async () => {
            await cache.set('security_test', { data: 1 }, false);
            await cache.set('quality_test', { data: 2 }, false);
            await cache.set('security_other', { data: 3 }, false);

            await cache.invalidate('security_.*');

            expect(await cache.get('security_test')).toBeNull();
            expect(await cache.get('security_other')).toBeNull();
            expect(await cache.get('quality_test')).not.toBeNull();
        });
    });

    describe('Statistics', () => {
        it('should provide cache statistics', () => {
            const stats = cache.getStats();

            expect(stats).toHaveProperty('memorySize');
            expect(stats).toHaveProperty('maxSize');
            expect(stats).toHaveProperty('ttl');
            expect(stats).toHaveProperty('enabled');
        });
    });

    describe('Disabled Cache', () => {
        it('should bypass cache when disabled', async () => {
            cache = new AnalysisCache({ enabled: false });

            const result = await cache.get('test-key');
            expect(result).toBeNull();

            await cache.set('test-key', { data: 'test' });
            const result2 = await cache.get('test-key');
            expect(result2).toBeNull();
        });

        it('should always compute when disabled', async () => {
            cache = new AnalysisCache({ enabled: false });
            const computeFn = jest.fn().mockResolvedValue({ result: 'computed' });

            await cache.getOrCompute('test-key', computeFn);
            await cache.getOrCompute('test-key', computeFn);

            expect(computeFn).toHaveBeenCalledTimes(2);
        });
    });
});

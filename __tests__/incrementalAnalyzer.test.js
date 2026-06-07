import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import IncrementalAnalyzer from '../src/core/analysis/incrementalAnalyzer.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'incr-test-'));

describe('IncrementalAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new IncrementalAnalyzer({ cacheDir: path.join(tmpDir, '.sentinel', 'incremental') });
  });

  afterEach(async () => {
    try {
      await analyzer.clear();
    } catch { }
  });

  describe('getCachedResult', () => {
    it('returns not cached for a new file', async () => {
      await analyzer.initialize();
      const result = await analyzer.getCachedResult('/new/file.js', 'some content');
      expect(result.isCached).toBe(false);
      expect(result.isStale).toBe(false);
    });

    it('returns cached for an unchanged file', async () => {
      await analyzer.initialize();
      await analyzer.saveCacheEntry('/test/file.js', {
        content: 'same content',
        issues: [],
        stats: {},
        analyzers: ['security'],
      });
      const result = await analyzer.getCachedResult('/test/file.js', 'same content');
      expect(result.isCached).toBe(true);
      expect(result.isStale).toBe(false);
    });

    it('returns stale for a modified file', async () => {
      await analyzer.initialize();
      await analyzer.saveCacheEntry('/test/file.js', {
        content: 'old content',
        issues: [{ type: 'vuln', line: 1, column: 1, message: 'issue' }],
        stats: {},
        analyzers: ['security'],
      });
      const result = await analyzer.getCachedResult('/test/file.js', 'new content');
      expect(result.isCached).toBe(false);
      expect(result.isStale).toBe(true);
      expect(result.previousIssues).toHaveLength(1);
    });
  });

  describe('getChangedFiles', () => {
    it('marks new files as changed', async () => {
      await analyzer.initialize();
      const files = [
        { path: '/new/file_a.js', content: 'content a' },
        { path: '/new/file_b.js', content: 'content b' },
      ];
      const { changed, unchanged } = await analyzer.getChangedFiles(files);
      expect(changed).toHaveLength(2);
      expect(unchanged).toHaveLength(0);
    });

    it('marks unchanged files correctly', async () => {
      await analyzer.initialize();
      await analyzer.saveCacheEntry('/cached/file.js', {
        content: 'same content',
        issues: [],
        stats: {},
        analyzers: ['bug'],
      });
      const files = [
        { path: '/cached/file.js', content: 'same content' },
        { path: '/new/file.js', content: 'new content' },
      ];
      const { changed, unchanged } = await analyzer.getChangedFiles(files);
      expect(changed).toHaveLength(1);
      expect(changed[0].path).toBe('/new/file.js');
      expect(unchanged).toHaveLength(1);
      expect(unchanged[0].path).toBe('/cached/file.js');
    });

    it('handles empty file list', async () => {
      await analyzer.initialize();
      const { changed, unchanged } = await analyzer.getChangedFiles([]);
      expect(changed).toHaveLength(0);
      expect(unchanged).toHaveLength(0);
    });
  });

  describe('analyzeWithCache', () => {
    it('returns cached result without calling analyzer when unchanged', async () => {
      await analyzer.initialize();
      const content = 'stable content';
      await analyzer.saveCacheEntry('/test/file.js', {
        content,
        issues: [{ type: 'info', line: 1, column: 1, message: 'known issue' }],
        stats: {},
        analyzers: ['security'],
      });

      const mockAnalyzer = { analyzeFile: jest.fn() };
      const result = await analyzer.analyzeWithCache('/test/file.js', content, mockAnalyzer);
      expect(result.fromCache).toBe(true);
      expect(result.isCached).toBe(true);
      expect(result.analyzed).toBe(false);
      expect(mockAnalyzer.analyzeFile).not.toHaveBeenCalled();
    });

    it('analyzes and caches a new file', async () => {
      await analyzer.initialize();
      const mockAnalyzer = {
        analyzeFile: jest.fn().mockResolvedValue({
          issues: [{ type: 'bug', line: 5, column: 1, message: 'null ref' }],
          stats: { lines: 50 },
        }),
      };
      const result = await analyzer.analyzeWithCache('/new/file.js', 'some code', mockAnalyzer);
      expect(result.analyzed).toBe(true);
      expect(result.fromCache).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(mockAnalyzer.analyzeFile).toHaveBeenCalledTimes(1);

      const cached = await analyzer.getCachedResult('/new/file.js', 'some code');
      expect(cached.isCached).toBe(true);
    });

    it('forces reanalysis when force option is set', async () => {
      await analyzer.initialize();
      const content = 'same content';
      await analyzer.saveCacheEntry('/test/file.js', {
        content,
        issues: [],
        stats: {},
        analyzers: ['security'],
      });
      const mockAnalyzer = {
        analyzeFile: jest.fn().mockResolvedValue({
          issues: [{ type: 'info', line: 1, column: 1, message: 'reanalyzed' }],
          stats: {},
        }),
      };
      const result = await analyzer.analyzeWithCache('/test/file.js', content, mockAnalyzer, { force: true });
      expect(result.analyzed).toBe(true);
      expect(mockAnalyzer.analyzeFile).toHaveBeenCalledTimes(1);
    });
  });
});

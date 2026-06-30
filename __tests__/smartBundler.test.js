/**
 * Unit tests for SmartBundler — file grouping logic.
 *
 * Run with:
 *   node --test __tests__/smartBundler.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SmartBundler } from '../src/review/smartBundler.js';

// ─── bundle() ───────────────────────────────────────────────────────────────

describe('SmartBundler.bundle', () => {
  const bundler = new SmartBundler();

  test('returns empty bundles and all files as singletons when no relationships', () => {
    const result = bundler.bundle(['package.json']);
    assert.equal(result.bundles.length, 0);
    assert.equal(result.singletons.length, 1);
    assert.equal(result.singletons[0], 'package.json');
  });

  test('bundles component + test files together', () => {
    const files = [
      'src/components/Button.jsx',
      'src/components/Button.test.jsx',
    ];
    const result = bundler.bundle(files);
    assert.equal(result.bundles.length, 1);
    assert.equal(result.bundles[0].pattern, 'component');
    assert.equal(result.bundles[0].size, 2);
    assert.equal(result.singletons.length, 0);
  });

  test('bundles component + test + styles together', () => {
    const files = [
      'src/components/Header.tsx',
      'src/components/Header.test.tsx',
      'src/components/Header.module.css',
    ];
    const result = bundler.bundle(files);
    assert.equal(result.bundles.length, 1);
    assert.equal(result.bundles[0].size, 3);
    assert.ok(result.bundles[0].files.includes('src/components/Header.tsx'));
    assert.ok(result.bundles[0].files.includes('src/components/Header.module.css'));
  });

  test('keeps unrelated files as singletons', () => {
    const files = [
      'src/app.js',
      'src/utils/helper.ts',
      'README.md',
    ];
    const result = bundler.bundle(files);
    assert.equal(result.bundles.length, 0);
    assert.equal(result.singletons.length, 3);
  });

  test('assigns concurrency slots to bundles', () => {
    const files = [
      'src/a.js',
      'src/a.test.js',
      'src/b.js',
      'src/b.test.js',
    ];
    const result = bundler.bundle(files, { concurrency: 2 });
    assert.equal(result.bundles.length, 2);
    assert.ok(result.bundles[0].slot >= 1);
    assert.ok(result.bundles[0].slot <= 2);
  });

  test('bundle IDs are unique', () => {
    const files = [
      'src/a.js', 'src/a.test.js',
      'src/b.js', 'src/b.test.js',
    ];
    const result = bundler.bundle(files);
    const ids = result.bundles.map(b => b.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

// ─── bundleConfigs() ────────────────────────────────────────────────────────

describe('SmartBundler.bundleConfigs', () => {
  const bundler = new SmartBundler();

  test('filters out node_modules configs', () => {
    const files = [
      'node_modules/pkg/tsconfig.json',
      'tsconfig.json',
    ];
    const result = bundler.bundleConfigs(files);
    // node_modules filtered, tsconfig remains as singleton
    assert.equal(result.singletons.length, 1);
    assert.equal(result.singletons[0], 'tsconfig.json');
  });
});

// ─── bundleByDirectory() ────────────────────────────────────────────────────

describe('SmartBundler.bundleByDirectory', () => {
  const bundler = new SmartBundler();

  test('groups files by their directory', () => {
    const files = [
      'src/utils/linter.js',
      'src/utils/helper.js',
      'src/app.js',
    ];
    const result = bundler.bundleByDirectory(files);
    assert.equal(result.bundles.length, 2);

    const srcUtil = result.bundles.find(b => b.directory === 'src/utils');
    const srcRoot = result.bundles.find(b => b.directory === 'src');
    assert.ok(srcUtil);
    assert.ok(srcRoot);
    assert.equal(srcUtil.size, 2);
    assert.equal(srcRoot.size, 1);
  });

  test('returns empty bundles for empty input', () => {
    const result = bundler.bundleByDirectory([]);
    assert.equal(result.bundles.length, 0);
    assert.equal(result.singletons.length, 0);
  });
});

// ─── summarize() ────────────────────────────────────────────────────────────

describe('SmartBundler.summarize', () => {
  const bundler = new SmartBundler();

  test('returns human-readable summary string', () => {
    const result = bundler.bundle([
      'src/a.js', 'src/a.test.js',
      'b.json',
    ]);
    const summary = bundler.summarize(result);
    assert.ok(summary.includes('Bundles: 1'));
    assert.ok(summary.includes('Singleton files: 1'));
    assert.ok(summary.includes('[component]'));
  });

  test('handles empty result', () => {
    const summary = bundler.summarize({ bundles: [], singletons: [] });
    assert.ok(summary.includes('Bundles: 0'));
    assert.ok(summary.includes('Singleton files: 0'));
  });
});

// ─── custom patterns ────────────────────────────────────────────────────────

describe('SmartBundler with custom patterns', () => {
  test('accepts custom patterns and minBundleSize', () => {
    const custom = new SmartBundler({
      patterns: [{
        name: 'custom',
        groupKey: (f) => 'same', // all files get same key
        match: (f) => f.endsWith('.custom'),
        maxGroupSize: 5,
      }],
      minBundleSize: 2,
    });
    const result = custom.bundle(['a.custom', 'b.custom']);
    assert.equal(result.bundles.length, 1);
    assert.equal(result.bundles[0].size, 2);
  });

  test('minBundleSize prevents small bundles', () => {
    const bundler = new SmartBundler({
      patterns: [{
        name: 'custom',
        groupKey: (f) => 'key',
        match: (f) => f.endsWith('.x'),
        maxGroupSize: 5,
      }],
      minBundleSize: 3,
    });
    const result = bundler.bundle(['a.x', 'b.x']);
    // Only 2 files, minBundleSize=3 → no bundle
    assert.equal(result.bundles.length, 0);
    assert.equal(result.singletons.length, 2);
  });
});

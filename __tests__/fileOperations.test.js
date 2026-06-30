/**
 * Unit tests for FileOperations — path resolution, template generation,
 * file operations using temp directories, and edge cases.
 *
 * Run with:
 *   node --test __tests__/fileOperations.test.js
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import path, { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileOperations } from '../src/utils/fileOperations.js';

let op;

before(async () => {
  const mod = await import('../src/utils/fileOperations.js');
  op = new mod.FileOperations();
});

// ─── resolvePath ────────────────────────────────────────────────────────────

describe('FileOperations.resolvePath', () => {
  test('returns absolute path unchanged', () => {
    const abs = '/absolute/path/file.js';
    assert.equal(op.resolvePath(abs), abs);
  });

  test('joins relative path with basePath', () => {
    const rel = 'src/index.js';
    const resolved = op.resolvePath(rel);
    assert.ok(resolved.endsWith('src/index.js'.replace(/\//g, path.sep)));
  });

  test('resolves dot-slash relative path', () => {
    const resolved = op.resolvePath('./foo.js');
    assert.ok(resolved.endsWith(path.sep + 'foo.js'));
  });
});

// ─── getBasePath / setBasePath ─────────────────────────────────────────────

describe('FileOperations getBasePath / setBasePath', () => {
  test('returns default basePath (cwd)', () => {
    assert.equal(op.getBasePath(), process.cwd());
  });

  test('setBasePath updates basePath', () => {
    op.setBasePath('/tmp/test');
    assert.equal(op.getBasePath(), '/tmp/test');
    op.setBasePath(process.cwd()); // restore
  });
});

// ─── getTemplates ──────────────────────────────────────────────────────────

describe('FileOperations.getTemplates', () => {
  test('returns all template types', () => {
    const templates = op.getTemplates();
    const expected = ['component', 'hook', 'class', 'function', 'test', 'service'];
    for (const type of expected) {
      assert.ok(templates[type], `Missing template: ${type}`);
    }
  });
});

// ─── generateFromTemplate ────────────────────────────────────────────────────

describe('FileOperations.generateFromTemplate', () => {
  test('replaces simple {{variable}} placeholders', async () => {
    const result = await op.generateFromTemplate('Hello {{name}}!', { name: 'World' });
    assert.equal(result.success, true);
    assert.equal(result.content, 'Hello World!');
  });

  test('handles multiple variables', async () => {
    const result = await op.generateFromTemplate('{{greeting}}, {{name}}!', {
      greeting: 'Hi',
      name: 'Sentinel',
    });
    assert.equal(result.content, 'Hi, Sentinel!');
  });

  test('processes {{#each}} loops', async () => {
    const template = 'Items:\n{{#each items}}\n- {{name}}\n{{/each}}';
    const result = await op.generateFromTemplate(template, {
      items: [{ name: 'A' }, { name: 'B' }],
    });
    assert.equal(result.success, true);
    assert.match(result.content, /- A/);
    assert.match(result.content, /- B/);
  });

  test('writes to outputPath when provided', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'sentinel-test-'));
    const outputPath = join(tmpDir, 'output.txt');
    const result = await op.generateFromTemplate('Hello {{name}}!', { name: 'Test' }, { outputPath });
    assert.equal(result.success, true);
    assert.ok(existsSync(outputPath));
    const content = readFileSync(outputPath, 'utf-8');
    assert.equal(content, 'Hello Test!');
    // Cleanup
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ─── scaffold ────────────────────────────────────────────────────────────────

describe('FileOperations.scaffold', () => {
  test('returns error for unknown template type', async () => {
    const result = await op.scaffold('unknown_type', 'Foo');
    assert.equal(result.success, false);
    assert.match(result.error, /Unknown template type/);
  });

  test('generates component template with capitalized name', async () => {
    const result = await op.scaffold('component', 'button');
    assert.equal(result.success, true);
    assert.match(result.content, /export const Button/);
    assert.match(result.content, /className="button"/);
  });

  test('generates hook template with use prefix', async () => {
    const result = await op.scaffold('hook', 'auth');
    assert.equal(result.success, true);
    assert.match(result.content, /useAuth/);
  });

  test('generates test template', async () => {
    const result = await op.scaffold('test', 'myFunction');
    assert.equal(result.success, true);
    assert.match(result.content, /describe\('MyFunction/);
  });
});

// ─── exists ──────────────────────────────────────────────────────────────────

describe('FileOperations.exists', () => {
  test('returns true for existing file', async () => {
    assert.equal(await op.exists('package.json'), true);
  });

  test('returns false for non-existing file', async () => {
    assert.equal(await op.exists('nonexistent-file-xyz.test'), false);
  });
});

// ─── stat ────────────────────────────────────────────────────────────────────

describe('FileOperations.stat', () => {
  test('returns stats for existing file', async () => {
    const stats = await op.stat('package.json');
    assert.equal(stats.success, true);
    assert.equal(stats.isFile, true);
    assert.ok(stats.size > 0);
  });

  test('returns error for non-existing file', async () => {
    const stats = await op.stat('nonexistent-file-xyz.test');
    assert.equal(stats.success, false);
    assert.ok(stats.error);
  });
});

// ─── read ───────────────────────────────────────────────────────────────────

describe('FileOperations.read', () => {
  test('reads existing file', async () => {
    const result = await op.read('package.json');
    assert.equal(result.success, true);
    assert.ok(result.content.length > 0);
    assert.equal(result.isBinary, false);
  });

  test('returns error for non-existing file', async () => {
    const result = await op.read('nonexistent-file-xyz.test');
    assert.equal(result.success, false);
    assert.ok(result.error);
  });
});

// ─── write + delete + read-back ─────────────────────────────────────────────

describe('FileOperations write / delete', () => {
  test('writes file and reads it back', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'sentinel-test-'));
    const testFile = join(tmpDir, 'test-write.txt');
    const writeResult = await op.write(testFile, 'Hello from test');
    assert.equal(writeResult.success, true);

    const readResult = await op.read(testFile);
    assert.equal(readResult.content, 'Hello from test');

    // Cleanup
    await op.delete(tmpDir);
  });

  test('returns error when writing to invalid path', async () => {
    const result = await op.write('/invalid/\0path/test.txt', 'test');
    assert.equal(result.success, false);
    assert.ok(result.error);
  });
});

// ─── copy ────────────────────────────────────────────────────────────────────

describe('FileOperations.copy', () => {
  test('copies file successfully', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'sentinel-test-'));
    const src = join(tmpDir, 'source.txt');
    const dst = join(tmpDir, 'dest.txt');
    writeFileSync(src, 'content', 'utf-8');

    const result = await op.copy(src, dst);
    assert.equal(result.success, true);
    assert.ok(existsSync(dst));
    assert.equal(readFileSync(dst, 'utf-8'), 'content');

    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ─── list ────────────────────────────────────────────────────────────────────

describe('FileOperations.list', () => {
  test('lists root directory', async () => {
    const result = await op.list('.');
    assert.equal(result.success, true);
    assert.ok(result.count > 0);
    assert.ok(result.items.some(i => i.name === 'package.json'));
  });
});

// ─── glob ────────────────────────────────────────────────────────────────────

describe('FileOperations.glob', () => {
  test('finds package.json', async () => {
    const result = await op.glob('package.json');
    assert.equal(result.success, true);
    assert.ok(result.count >= 1);
  });

  test('returns empty for no matches', async () => {
    const result = await op.glob('**/*.nonexistent_ext_xyz');
    assert.equal(result.success, true);
    assert.equal(result.count, 0);
  });
});

// ─── ensureDir ──────────────────────────────────────────────────────────────

describe('FileOperations.ensureDir', () => {
  test('creates directory recursively', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'sentinel-test-'));
    const nested = join(tmpDir, 'a', 'b', 'c');
    const result = await op.ensureDir(nested);
    assert.equal(result.success, true);
    assert.ok(existsSync(nested));
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

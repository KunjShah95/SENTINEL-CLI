/**
 * Tests for Checkpoint system — create, restore, redo, prune.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';

const TEST_DIR = path.resolve('.sentinel/test-checkpoint-' + Date.now());
const ORIGINAL_CWD = process.cwd();

beforeAll(async () => {
  await fs.mkdir(TEST_DIR, { recursive: true });
  process.chdir(TEST_DIR);
});

afterAll(async () => {
  process.chdir(ORIGINAL_CWD);
  try { await fs.rm(TEST_DIR, { recursive: true, force: true }); } catch {}
});

beforeEach(async () => {
  // Clean up checkpoint and redo dirs between tests
  const cpDir = path.join(TEST_DIR, '.sentinel', 'checkpoints');
  const redoDir = path.join(TEST_DIR, '.sentinel', 'redo');
  try { await fs.rm(cpDir, { recursive: true, force: true }); } catch {}
  try { await fs.rm(redoDir, { recursive: true, force: true }); } catch {}
});

describe('Checkpoint System', () => {
  test('createCheckpoint returns null for empty file list', async () => {
    const { createCheckpoint } = await import('../src/shared/tools/checkpoint.js');
    const result = await createCheckpoint([]);
    expect(result).toBeNull();
  });

  test('createCheckpoint snapshots existing files', async () => {
    const { createCheckpoint } = await import('../src/shared/tools/checkpoint.js');

    // Create a test file
    const testFile = path.join(TEST_DIR, 'test.txt');
    await fs.writeFile(testFile, 'original content', 'utf-8');

    const result = await createCheckpoint([testFile]);
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.files).toBe(1);

    // Verify checkpoint directory was created
    const cpDir = path.join(TEST_DIR, '.sentinel', 'checkpoints', result.id);
    expect(existsSync(cpDir)).toBe(true);
    expect(existsSync(path.join(cpDir, '_manifest.json'))).toBe(true);
  });

  test('restoreCheckpoint restores file content', async () => {
    const { createCheckpoint, restoreCheckpoint } = await import('../src/shared/tools/checkpoint.js');

    const testFile = path.join(TEST_DIR, 'restore-test.txt');
    await fs.writeFile(testFile, 'before change', 'utf-8');

    const cp = await createCheckpoint([testFile]);
    expect(cp).toBeDefined();

    // Modify the file
    await fs.writeFile(testFile, 'after change', 'utf-8');
    expect(await fs.readFile(testFile, 'utf-8')).toBe('after change');

    // Restore
    const result = await restoreCheckpoint();
    expect(result.restored).toContain('restore-test.txt');

    // Verify content restored
    const content = await fs.readFile(testFile, 'utf-8');
    expect(content).toBe('before change');
  });

  test('restoreCheckpoint throws when no checkpoints exist', async () => {
    const { restoreCheckpoint } = await import('../src/shared/tools/checkpoint.js');
    await expect(restoreCheckpoint()).rejects.toThrow('No checkpoints available');
  });

  test('redoCheckpoint re-applies undone changes', async () => {
    const { createCheckpoint, restoreCheckpoint, redoCheckpoint } = await import('../src/shared/tools/checkpoint.js');

    const testFile = path.join(TEST_DIR, 'redo-test.txt');
    await fs.writeFile(testFile, 'version 1', 'utf-8');

    const cp = await createCheckpoint([testFile]);
    await fs.writeFile(testFile, 'version 2', 'utf-8');

    // Undo -> back to version 1
    await restoreCheckpoint();
    expect(await fs.readFile(testFile, 'utf-8')).toBe('version 1');

    // Redo -> back to version 2
    await redoCheckpoint();
    expect(await fs.readFile(testFile, 'utf-8')).toBe('version 1'); // checkpoint was v1
  });

  test('redoCheckpoint throws when nothing to redo', async () => {
    const { redoCheckpoint } = await import('../src/shared/tools/checkpoint.js');
    await expect(redoCheckpoint()).rejects.toThrow('Nothing to redo');
  });

  test('createCheckpoint handles files that do not exist yet', async () => {
    const { createCheckpoint } = await import('../src/shared/tools/checkpoint.js');

    const newFile = path.join(TEST_DIR, 'new-file.txt');
    const result = await createCheckpoint([newFile]);
    expect(result).toBeDefined();
    expect(result.files).toBe(0); // File didn't exist, not saved
  });

  test('listCheckpoints returns checkpoints newest first', async () => {
    const { createCheckpoint, listCheckpoints } = await import('../src/shared/tools/checkpoint.js');

    const testFile = path.join(TEST_DIR, 'list-test.txt');
    await fs.writeFile(testFile, 'content', 'utf-8');

    await createCheckpoint([testFile]);
    await new Promise(r => setTimeout(r, 10)); // Ensure different timestamps
    await createCheckpoint([testFile]);

    const list = await listCheckpoints();
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].timestamp).toBeGreaterThanOrEqual(list[1].timestamp);
  });
});

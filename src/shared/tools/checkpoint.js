/**
 * Agent Checkpoints — snapshot files before destructive tool calls
 * so the user can roll back with `/undo`.
 *
 * Inspired by Cursor Composer 2.5's checkpointing. Stores lightweight
 * file copies in `.sentinel/checkpoints/<timestamp>/`.
 * Auto-prunes to keep only the 10 most recent checkpoints.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';

const CHECKPOINT_DIR = '.sentinel/checkpoints';
const MAX_CHECKPOINTS = 10;

function getCheckpointRoot() {
  return path.resolve(process.cwd(), CHECKPOINT_DIR);
}

/**
 * Create a checkpoint of the given files before they are modified.
 * @param {string[]} filePaths — absolute paths to files that will be changed
 * @returns {{ id: string, files: number }}
 */
export async function createCheckpoint(filePaths) {
  if (!filePaths || filePaths.length === 0) return null;

  const root = getCheckpointRoot();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const checkpointDir = path.join(root, id);

  await fs.mkdir(checkpointDir, { recursive: true });

  const manifest = { id, timestamp: Date.now(), files: [] };
  let saved = 0;

  for (const absPath of filePaths) {
    try {
      const relPath = path.relative(process.cwd(), absPath);
      if (relPath.startsWith('..') || path.isAbsolute(relPath)) continue;

      // Only checkpoint files that already exist (creates get deleted on undo)
      if (existsSync(absPath)) {
        const dest = path.join(checkpointDir, relPath);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(absPath, dest);
        manifest.files.push({ relative: relPath, existed: true });
        saved++;
      } else {
        manifest.files.push({ relative: relPath, existed: false });
      }
    } catch {
      // Skip files we can't read
    }
  }

  // Write manifest
  await fs.writeFile(
    path.join(checkpointDir, '_manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );

  // Auto-prune old checkpoints
  await pruneCheckpoints();

  return { id, files: saved };
}

/**
 * Restore files from a checkpoint.
 * @param {string} [id] — checkpoint ID. If omitted, restores the latest.
 * @returns {{ restored: string[], deleted: string[] }}
 */
export async function restoreCheckpoint(id) {
  const root = getCheckpointRoot();

  if (!id) {
    // Find latest
    const checkpoints = await listCheckpoints();
    if (checkpoints.length === 0) {
      throw new Error('No checkpoints available');
    }
    id = checkpoints[0].id;
  }

  const checkpointDir = path.join(root, id);
  const manifestPath = path.join(checkpointDir, '_manifest.json');

  if (!existsSync(manifestPath)) {
    throw new Error(`Checkpoint ${id} not found`);
  }

  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
  const restored = [];
  const deleted = [];

  for (const file of manifest.files) {
    const target = path.resolve(process.cwd(), file.relative);

    if (file.existed) {
      // Restore from checkpoint
      const src = path.join(checkpointDir, file.relative);
      if (existsSync(src)) {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(src, target);
        restored.push(file.relative);
      }
    } else {
      // File didn't exist before — delete it
      try {
        await fs.rm(target);
        deleted.push(file.relative);
      } catch {
        // File may already be gone
      }
    }
  }

  // Remove the used checkpoint
  await fs.rm(checkpointDir, { recursive: true, force: true });

  return { restored, deleted };
}

/**
 * List available checkpoints, newest first.
 * @returns {Array<{ id: string, timestamp: number, fileCount: number }>}
 */
export async function listCheckpoints() {
  const root = getCheckpointRoot();
  if (!existsSync(root)) return [];

  const entries = await fs.readdir(root, { withFileTypes: true });
  const checkpoints = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(root, entry.name, '_manifest.json');
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
      checkpoints.push({
        id: manifest.id,
        timestamp: manifest.timestamp,
        fileCount: manifest.files.length,
      });
    } catch {
      // Skip malformed checkpoints
    }
  }

  // Newest first
  checkpoints.sort((a, b) => b.timestamp - a.timestamp);
  return checkpoints;
}

/**
 * Remove old checkpoints beyond MAX_CHECKPOINTS.
 */
async function pruneCheckpoints() {
  const checkpoints = await listCheckpoints();
  if (checkpoints.length <= MAX_CHECKPOINTS) return;

  const root = getCheckpointRoot();
  const toRemove = checkpoints.slice(MAX_CHECKPOINTS);

  for (const cp of toRemove) {
    try {
      await fs.rm(path.join(root, cp.id), { recursive: true, force: true });
    } catch {
      // Ignore cleanup failures
    }
  }
}

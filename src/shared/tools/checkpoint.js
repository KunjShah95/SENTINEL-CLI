/**
 * Agent Checkpoints — snapshot files before destructive tool calls
 * so the user can roll back with `/undo` or redo with `/redo`.
 *
 * Stores lightweight file copies in `.sentinel/checkpoints/<timestamp>/`.
 * On `/undo`, checkpoints are moved to `.sentinel/redo/` so they can
 * be reapplied with `/redo`. New work clears the redo stack.
 * Auto-prunes both stacks to keep the 10 most recent entries.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { getWorkdir } from './workdir.js';

const CHECKPOINT_DIR = '.sentinel/checkpoints';
const REDO_DIR = '.sentinel/redo';
const MAX_CHECKPOINTS = 10;

function getCheckpointRoot() {
  return path.resolve(getWorkdir(), CHECKPOINT_DIR);
}

function getRedoRoot() {
  return path.resolve(getWorkdir(), REDO_DIR);
}

/**
 * Manifest entries are trusted-but-verifiable: a corrupted or tampered
 * _manifest.json with `../../etc` relatives must never let undo/redo write
 * outside the project. Returns the clean relative path or null.
 */
export function sanitizeManifestRelative(rel) {
  if (typeof rel !== 'string' || rel.length === 0) return null;
  if (path.isAbsolute(rel)) return null;
  const normalized = path.normalize(rel);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) return null;
  if (normalized.split(path.sep).includes('..')) return null;
  return normalized;
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
      const relPath = path.relative(getWorkdir(), absPath);
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

  // New work invalidates the redo stack
  await clearRedoStack();

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
  const redoRoot = getRedoRoot();

  if (!id) {
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

  // Snapshot the current (post-edit) disk state into the redo dir BEFORE restoring.
  // This is what redo needs — the state we're about to throw away.
  await fs.mkdir(redoRoot, { recursive: true });
  const redoDest = path.join(redoRoot, id);
  if (existsSync(redoDest)) {
    await fs.rm(redoDest, { recursive: true, force: true });
  }
  await fs.mkdir(redoDest, { recursive: true });
  const redoManifest = { id, timestamp: Date.now(), files: [] };
  for (const file of manifest.files) {
    const safe = sanitizeManifestRelative(file.relative);
    if (!safe) continue;
    const diskPath = path.resolve(getWorkdir(), safe);
    if (existsSync(diskPath)) {
      const dest = path.join(redoDest, safe);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(diskPath, dest);
      redoManifest.files.push({ relative: safe, existed: true });
    } else {
      redoManifest.files.push({ relative: safe, existed: false });
    }
  }
  await fs.writeFile(path.join(redoDest, '_manifest.json'), JSON.stringify(redoManifest, null, 2), 'utf-8');

  // Now restore the pre-edit files from the checkpoint
  for (const file of manifest.files) {
    const safe = sanitizeManifestRelative(file.relative);
    if (!safe) continue; // never let a bad manifest write outside the project
    const target = path.resolve(getWorkdir(), safe);

    if (file.existed) {
      const src = path.join(checkpointDir, safe);
      if (existsSync(src)) {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(src, target);
        restored.push(safe);
      }
    } else {
      try {
        await fs.rm(target);
        deleted.push(safe);
      } catch { /* file may already be gone */ }
    }
  }

  // Remove the checkpoint (redo entry now holds the forward state)
  await fs.rm(checkpointDir, { recursive: true, force: true });

  return { restored, deleted };
}

/**
 * Redo the last undone checkpoint — moves it back from the redo stack
 * and reapplies the file changes.
 * @returns {{ restored: string[], deleted: string[] }}
 */
export async function redoCheckpoint() {
  const redoRoot = getRedoRoot();
  if (!existsSync(redoRoot)) {
    throw new Error('Nothing to redo');
  }

  const entries = await fs.readdir(redoRoot, { withFileTypes: true });
  const redoDirs = entries
    .filter(e => e.isDirectory())
    .sort()
    .reverse();

  if (redoDirs.length === 0) {
    throw new Error('Nothing to redo');
  }

  const id = redoDirs[0].name;
  const redoDir = path.join(redoRoot, id);
  const manifestPath = path.join(redoDir, '_manifest.json');

  if (!existsSync(manifestPath)) {
    await fs.rm(redoDir, { recursive: true, force: true });
    throw new Error('Redo checkpoint corrupted');
  }

  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
  const restored = [];
  const deleted = [];

  for (const file of manifest.files) {
    const safe = sanitizeManifestRelative(file.relative);
    if (!safe) continue; // never let a bad manifest write outside the project
    const target = path.resolve(getWorkdir(), safe);

    if (file.existed) {
      const src = path.join(redoDir, safe);
      if (existsSync(src)) {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(src, target);
        restored.push(safe);
      }
    } else {
      try {
        await fs.rm(target);
        deleted.push(safe);
      } catch { /* file may already be gone */ }
    }
  }

  // Move back to checkpoint stack
  const checkpointRoot = getCheckpointRoot();
  await fs.mkdir(checkpointRoot, { recursive: true });
  const cpDest = path.join(checkpointRoot, id);
  if (existsSync(cpDest)) {
    await fs.rm(cpDest, { recursive: true, force: true });
  }
  await fs.rename(redoDir, cpDest);

  return { restored, deleted };
}

/**
 * Clear the redo stack — called when new changes are made.
 */
export async function clearRedoStack() {
  const redoRoot = getRedoRoot();
  if (!existsSync(redoRoot)) return;
  try {
    await fs.rm(redoRoot, { recursive: true, force: true });
  } catch { /* ignore cleanup failures */ }
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

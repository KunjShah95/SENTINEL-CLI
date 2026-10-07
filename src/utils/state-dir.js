/**
 * The `.sentinel/` state directory.
 *
 * Four modules (budget, outcome, risk-ledger, watch) each wrote a JSON file
 * under `.sentinel/` and each opened with the same two lines:
 *
 *     mkdirSync(join(cwd, '.sentinel'), { recursive: true });
 *
 * Six call sites for one fact. That is the kind of duplication that is
 * harmless right up until someone changes the directory name — or adds a
 * permission check, or wants to redirect it for a test — and updates four files,
 * one of which they will miss. The failure is a module that writes state
 * somewhere the others do not read, and it surfaces as "my budget setting keeps
 * resetting".
 *
 * So the directory name and the guarantee that it exists live here.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getWorkdir } from '../shared/tools/workdir.js';

/** The state directory, relative to a project. Overridable for tests. */
export const SENTINEL_DIR = '.sentinel';

/**
 * Relative paths, exported for display and for gitignore checks.
 *
 * These are POSITION + `SENTINEL_DIR`, not literals. A module that hardcodes
 * `'.sentinel/risk.json'` still works right up until the directory is renamed,
 * at which point two modules disagree about where state lives and one of them
 * silently starts writing where nothing reads.
 */
export function relativeStatePath(name) {
  return `${SENTINEL_DIR}/${name}`;
}

/**
 * Absolute path to `.sentinel/`, without creating it.
 *
 * Used by reads and by anything that should not have a side effect — a doctor
 * check must not create the directory it is inspecting the absence of.
 */
export function stateDir(cwd = getWorkdir()) {
  return join(cwd, SENTINEL_DIR);
}

/**
 * Ensure `.sentinel/` exists and return its absolute path.
 *
 * Called before every write, never before a read. `recursive: true` makes it
 * idempotent, so this is cheap to call defensively.
 */
export function ensureStateDir(cwd = getWorkdir()) {
  const dir = stateDir(cwd);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Absolute path to one file inside `.sentinel/`. */
export function statePath(name, cwd = getWorkdir()) {
  return join(stateDir(cwd), name);
}

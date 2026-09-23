/**
 * Task system — big goals break into small persisted todos.
 *
 * Claude Code lesson: the model overwrites the FULL desired list on every
 * call (stops the plan drifting out of context), items are validated on the
 * way in, and the store persists to disk so goals survive compaction.
 * Sentinel persists to `.sentinel/todos.json` (already-gitignored runtime
 * state). Statuses: pending | in_progress | completed.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const VALID_STATUS = new Set(['pending', 'in_progress', 'completed']);

export function todosFile(cwd = process.cwd()) {
  return join(resolve(cwd), '.sentinel', 'todos.json');
}

export function validateTodos(todos) {
  if (!Array.isArray(todos) || todos.length === 0) {
    throw new Error('todos must be a non-empty array');
  }
  if (todos.length > 50) throw new Error('todos must have at most 50 items');
  const ids = new Set();
  for (let i = 0; i < todos.length; i++) {
    const t = todos[i];
    if (!t || typeof t !== 'object') throw new Error(`todos[${i}] must be an object`);
    if (typeof t.id !== 'string' || !t.id.trim()) {
      throw new Error(`todos[${i}].id is required`);
    }
    if (ids.has(t.id)) throw new Error(`duplicate todo id: ${t.id}`);
    ids.add(t.id);
    if (typeof t.title !== 'string' || !t.title.trim()) {
      throw new Error(`todos[${i}].title is required`);
    }
    if (!VALID_STATUS.has(t.status)) {
      throw new Error(`todos[${i}].status must be pending|in_progress|completed`);
    }
  }
  return todos.map((t) => ({ id: t.id, title: t.title, status: t.status }));
}

export function readTodos(cwd = process.cwd()) {
  const file = todosFile(cwd);
  if (!existsSync(file)) return [];
  try {
    const data = JSON.parse(readFileSync(file, 'utf-8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function writeTodos(todos, cwd = process.cwd()) {
  const clean = validateTodos(todos);
  const file = todosFile(cwd);
  mkdirSync(join(resolve(cwd), '.sentinel'), { recursive: true });
  writeFileSync(file, JSON.stringify(clean, null, 2), 'utf-8');
  return clean;
}

/** Pre-rendered checklist lines so renderers never learn status vocabulary. */
export function formatTodoList(todos) {
  const mark = (s) => (s === 'completed' ? '[x]' : s === 'in_progress' ? '[~]' : '[ ]');
  return todos.map((t) => `${mark(t.status)} ${t.id}: ${t.title}`).join('\n');
}

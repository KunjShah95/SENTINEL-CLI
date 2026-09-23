/**
 * Local session store — JSON files under ~/.sentinel/sessions.
 * Replaces the deleted server database. API mirrors what the TUI consumes:
 * list / get / create / delete / appendMessages.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const HOME =
  process.env.SENTINEL_HOME || path.join(os.homedir(), '.sentinel');
const DIR = path.join(HOME, 'sessions');
const MAX_LIST = 100;

async function ensure() {
  await fs.mkdir(DIR, { recursive: true, mode: 0o700 });
}

function fileFor(id) {
  if (!/^[\w.-]+$/.test(id)) throw new Error('Invalid session id');
  return path.join(DIR, `${id}.json`);
}

async function readSession(id) {
  try {
    return JSON.parse(await fs.readFile(fileFor(id), 'utf8'));
  } catch {
    return null;
  }
}

async function writeSession(session) {
  await ensure();
  await fs.writeFile(fileFor(session.id), JSON.stringify(session, null, 2), { mode: 0o600 });
}

export const sessions = {
  async list() {
    try {
      await ensure();
      const files = (await fs.readdir(DIR)).filter((f) => f.endsWith('.json'));
      const out = [];
      for (const f of files) {
        const s = await readSession(f.replace(/\.json$/, ''));
        if (s) {
          out.push({
            id: s.id,
            title: s.title,
            createdAt: s.createdAt,
            mode: s.mode,
            model: s.model,
          });
        }
      }
      out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return out.slice(0, MAX_LIST);
    } catch {
      return [];
    }
  },

  get: readSession,

  async create({ title = 'New session', mode = 'BUILD', model = '', projectPath } = {}) {
    const session = {
      id: crypto.randomUUID(),
      title,
      mode,
      model,
      projectPath,
      createdAt: Date.now(),
      messages: [],
    };
    await writeSession(session);
    return { id: session.id, title: session.title };
  },

  async delete(id) {
    try {
      await fs.unlink(fileFor(id));
      return true;
    } catch {
      return false;
    }
  },

  /** Merge new messages into the stored session (by id, last-write-wins). */
  async appendMessages({ id, messages }) {
    const session = await readSession(id);
    if (!session) return false;
    const byId = new Map((session.messages || []).map((m) => [m.id, m]));
    for (const m of messages) byId.set(m.id, m);
    session.messages = Array.from(byId.values());
    await writeSession(session);
    return true;
  },
};

export default sessions;

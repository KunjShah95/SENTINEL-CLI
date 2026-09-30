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
    const s = JSON.parse(await fs.readFile(fileFor(id), 'utf8'));
    // Only a real session object counts. A stray file from an older build
    // (e.g. a bare message array) has no id and crashed the session panel.
    if (!s || typeof s !== 'object' || Array.isArray(s) || typeof s.id !== 'string') return null;
    return s;
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
            title: typeof s.title === 'string' && s.title.trim() ? s.title : 'Untitled',
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
    for (const m of messages) {
      const key = (m.id != null && m.id !== '') ? m.id : `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      byId.set(key, { ...m, id: key });
    }
    session.messages = Array.from(byId.values());
    await writeSession(session);
    return true;
  },

  /**
   * Branch a session (pi-mono session tree): copy history up to and
   * including `atMessageId` (default: all) into a new session that records
   * its parent, so an abandoned approach stays intact and replayable.
   */
  async fork({ id, atMessageId, title } = {}) {
    const parent = await readSession(id);
    if (!parent) throw new Error(`Unknown session: ${id}`);
    const msgs = parent.messages || [];
    let cut = msgs.length;
    if (atMessageId != null) {
      const i = msgs.findIndex((m) => m.id === atMessageId);
      if (i < 0) throw new Error(`Message ${atMessageId} not in session ${id}`);
      cut = i + 1;
    }
    const child = {
      ...parent,
      id: crypto.randomUUID(),
      title: title || `${parent.title || 'Session'} (fork)`,
      createdAt: Date.now(),
      parentId: parent.id,
      forkedAtMessageId: atMessageId ?? msgs[cut - 1]?.id ?? null,
      messages: msgs.slice(0, cut),
    };
    await writeSession(child);
    return { id: child.id, title: child.title, parentId: parent.id, messages: child.messages.length };
  },

  /** Ancestors of a session, root first (stops on cycles / missing parents). */
  async lineage(id) {
    const chain = [];
    const seen = new Set();
    let cur = await readSession(id);
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      chain.unshift({ id: cur.id, title: cur.title, forkedAtMessageId: cur.forkedAtMessageId ?? null });
      cur = cur.parentId ? await readSession(cur.parentId) : null;
    }
    return chain;
  },
};

export default sessions;

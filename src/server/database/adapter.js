/**
 * Sentinel database layer.
 *
 * Supports three backends, in order of preference:
 *   1. PostgreSQL via Prisma (production)
 *   2. SQLite via better-sqlite3 (default for local dev)
 *   3. JSON file fallback (no deps, used by tests / CI without db)
 *
 * The data model mirrors the Nightcode Session table (id, userId, title,
 * messages JSON, createdAt, updatedAt) with additions for Sentinel
 * metadata (mode, model, projectPath, status).
 *
 * Mirrors packages/database from Nightcode.
 */

import path from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let _adapter = null;

const DEFAULT_DB_DIR = path.join(
  process.env.SENTINEL_HOME || path.join(process.env.HOME || process.env.USERPROFILE || ".", ".sentinel"),
  "db"
);

/**
 * @typedef {Object} SessionRecord
 * @property {string} id
 * @property {string} userId
 * @property {string} title
 * @property {string} mode
 * @property {string} model
 * @property {string} projectPath
 * @property {Array<object>} messages
 * @property {Date} createdAt
 * @property {Date} updatedAt
 * @property {string} status
 */

class JsonAdapter {
  constructor(filePath) {
    this.filePath = filePath;
    mkdirSync(path.dirname(filePath), { recursive: true });
    if (!existsSync(filePath)) {
      this._write({ sessions: [] });
    }
  }

  _read() {
    try {
      const raw = readFileSync(this.filePath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return { sessions: [] };
    }
  }

  _write(state) {
    writeFileSync(this.filePath, JSON.stringify(state, null, 2));
  }

  async createSession(data) {
    const state = this._read();
    state.sessions.push(data);
    this._write(state);
    return data;
  }

  async findSession(id, userId) {
    const state = this._read();
    return state.sessions.find((s) => s.id === id && (!userId || s.userId === userId)) || null;
  }

  async findSessions(userId) {
    const state = this._read();
    return state.sessions
      .filter((s) => !userId || s.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async updateSession(id, userId, data) {
    const state = this._read();
    const idx = state.sessions.findIndex((s) => s.id === id && (!userId || s.userId === userId));
    if (idx === -1) return null;
    state.sessions[idx] = { ...state.sessions[idx], ...data, updatedAt: new Date() };
    this._write(state);
    return state.sessions[idx];
  }

  async deleteSession(id, userId) {
    const state = this._read();
    const before = state.sessions.length;
    state.sessions = state.sessions.filter((s) => !(s.id === id && (!userId || s.userId === userId)));
    this._write(state);
    return state.sessions.length < before;
  }

  async ping() {
    return true;
  }

  backend() {
    return "json";
  }
}

class SqliteAdapter {
  constructor(dbPath) {
    // Lazy require so we don't fail if better-sqlite3 isn't installed.
    const Database = require("better-sqlite3");
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'BUILD',
        model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
        project_path TEXT,
        messages TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE TABLE IF NOT EXISTS credit_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id TEXT,
        credits INTEGER NOT NULL,
        provider TEXT,
        model TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_credit_events_user_id ON credit_events(user_id);
    `);

    this._create = this.db.prepare(`
      INSERT INTO sessions (id, user_id, title, mode, model, project_path, messages, status, created_at, updated_at)
      VALUES (@id, @userId, @title, @mode, @model, @projectPath, @messages, @status, @createdAt, @updatedAt)
    `);
    this._find = this.db.prepare(`SELECT * FROM sessions WHERE id = ? AND user_id = ?`);
    this._findAny = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`);
    this._list = this.db.prepare(`
      SELECT id, title, created_at as createdAt, mode, model, status
      FROM sessions WHERE user_id = ? ORDER BY created_at DESC
    `);
    this._updateMessages = this.db.prepare(`
      UPDATE sessions SET messages = ?, updated_at = ? WHERE id = ? AND user_id = ?
    `);
    this._update = this.db.prepare(`
      UPDATE sessions SET title = COALESCE(?, title), status = COALESCE(?, status), updated_at = ?
      WHERE id = ? AND user_id = ?
    `);
    this._delete = this.db.prepare(`DELETE FROM sessions WHERE id = ? AND user_id = ?`);

    this._insertCreditEvent = this.db.prepare(`
      INSERT INTO credit_events (id, user_id, session_id, credits, provider, model, created_at)
      VALUES (@id, @userId, @sessionId, @credits, @provider, @model, @createdAt)
    `);
    this._sumCredits = this.db.prepare(`
      SELECT COALESCE(SUM(credits), 0) AS used FROM credit_events WHERE user_id = ?
    `);
  }

  static toRow(s) {
    return {
      id: s.id,
      userId: s.userId,
      title: s.title,
      mode: s.mode,
      model: s.model,
      projectPath: s.projectPath || null,
      messages: JSON.stringify(s.messages || []),
      status: s.status || "active",
      createdAt: typeof s.createdAt === "string" ? s.createdAt : s.createdAt.toISOString(),
      updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : s.updatedAt.toISOString(),
    };
  }

  static fromRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      mode: row.mode,
      model: row.model,
      projectPath: row.project_path,
      messages: JSON.parse(row.messages || "[]"),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createSession(data) {
    this._create.run(SqliteAdapter.toRow(data));
    return data;
  }

  async findSession(id, userId) {
    const row = userId ? this._find.get(id, userId) : this._findAny.get(id);
    return SqliteAdapter.fromRow(row);
  }

  async findSessions(userId) {
    return this._list.all(userId).map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.createdAt,
      mode: r.mode,
      model: r.model,
      status: r.status,
    }));
  }

  async updateSession(id, userId, data) {
    if (data.messages !== undefined) {
      this._updateMessages.run(
        JSON.stringify(data.messages),
        new Date().toISOString(),
        id,
        userId
      );
    } else {
      this._update.run(data.title ?? null, data.status ?? null, new Date().toISOString(), id, userId);
    }
    return this.findSession(id, userId);
  }

  async deleteSession(id, userId) {
    const r = this._delete.run(id, userId);
    return r.changes > 0;
  }

  async recordCreditEvent({ id, userId, sessionId, credits, provider, model }) {
    this._insertCreditEvent.run({
      id,
      userId,
      sessionId: sessionId || null,
      credits,
      provider: provider || null,
      model: model || null,
      createdAt: new Date().toISOString(),
    });
  }

  async getUsedCredits(userId) {
    const r = this._sumCredits.get(userId);
    return r.used || 0;
  }

  async ping() {
    return this.db.prepare("SELECT 1 AS ok").get().ok === 1;
  }

  backend() {
    return "sqlite";
  }

  close() {
    this.db.close();
  }
}

class PrismaAdapter {
  /**
   * Lazy import wrapper. The Prisma client is loaded only if the user has
   * configured DATABASE_URL and installed `@prisma/client`. Otherwise this
   * constructor throws and the caller falls back to the next adapter.
   */
  constructor() {
    let PrismaClient;
    try {
      // eslint-disable-next-line global-require
      ({ PrismaClient } = require("@prisma/client"));
    } catch (e) {
      throw new Error("@prisma/client not installed");
    }
    this.prisma = new PrismaClient();
  }

  async createSession(data) {
    return await this.prisma.session.create({ data });
  }

  async findSession(id, userId) {
    return await this.prisma.session.findUnique({ where: { id, userId } });
  }

  async findSessions(userId) {
    return await this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, createdAt: true, mode: true, model: true, status: true },
    });
  }

  async updateSession(id, userId, data) {
    return await this.prisma.session.update({ where: { id_userId: { id, userId } }, data });
  }

  async deleteSession(id, userId) {
    try {
      await this.prisma.session.delete({ where: { id, userId } });
      return true;
    } catch {
      return false;
    }
  }

  async ping() {
    await this.prisma.$queryRaw`SELECT 1`;
    return true;
  }

  backend() {
    return "prisma";
  }
}

/**
 * Pick the right adapter based on env / availability.
 */
async function detectAdapter() {
  if (process.env.SENTINEL_DB_BACKEND) {
    const choice = process.env.SENTINEL_DB_BACKEND.toLowerCase();
    if (choice === "prisma" || choice === "postgres") {
      return new PrismaAdapter();
    }
    if (choice === "sqlite") {
      return new SqliteAdapter(path.join(DEFAULT_DB_DIR, "sentinel.db"));
    }
    if (choice === "json") {
      return new JsonAdapter(path.join(DEFAULT_DB_DIR, "sentinel.json"));
    }
  }

  if (process.env.DATABASE_URL && process.env.DATABASE_URL.length > 0) {
    try {
      return new PrismaAdapter();
    } catch {
      // fall through
    }
  }

  try {
    // eslint-disable-next-line global-require
    require.resolve("better-sqlite3");
    return new SqliteAdapter(path.join(DEFAULT_DB_DIR, "sentinel.db"));
  } catch {
    return new JsonAdapter(path.join(DEFAULT_DB_DIR, "sentinel.json"));
  }
}

/**
 * Get (or initialize) the global adapter. Idempotent.
 */
export async function getDatabase() {
  if (_adapter) return _adapter;
  _adapter = await detectAdapter();
  return _adapter;
}

/**
 * Set the adapter explicitly. Used by tests.
 */
export function setDatabase(adapter) {
  _adapter = adapter;
}

/**
 * Reset the adapter (for tests).
 */
export function resetDatabase() {
  if (_adapter && typeof _adapter.close === "function") {
    try {
      _adapter.close();
    } catch {
      // ignore
    }
  }
  _adapter = null;
}

export { JsonAdapter, SqliteAdapter, PrismaAdapter };

/**
 * Review History Store
 *
 * Tracks review history per PR using sql.js (SQLite in WASM).
 * Stores last reviewed commit SHA, review count, timestamps, and results summary.
 * Falls back to JSON file storage if sql.js is unavailable.
 */

import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';

const DEFAULT_DB_PATH = path.join('.sentinel', 'review_history.json');

export class ReviewHistoryStore {
  constructor(options = {}) {
    this.dbPath = options.dbPath || DEFAULT_DB_PATH;
    this.db = null;
    this.useSqlite = false;
    this.jsonStore = null; // fallback
  }

  /**
   * Initialize the store — try SQLite first, fall back to JSON.
   */
  async init() {
    if (this.db) return;

    try {
      const initSqlJs = (await import('sql.js')).default;
      const SQL = await initSqlJs();

      if (existsSync(this.dbPath.replace('.json', '.db'))) {
        const buffer = await fs.readFile(this.dbPath.replace('.json', '.db'));
        this.db = new SQL.Database(buffer);
      } else {
        this.db = new SQL.Database();
      }

      this.db.run(`
        CREATE TABLE IF NOT EXISTS review_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pr_key TEXT NOT NULL,
          commit_sha TEXT,
          reviewed_at TEXT NOT NULL DEFAULT (datetime('now')),
          mode TEXT DEFAULT 'full',
          issues_found INTEGER DEFAULT 0,
          success INTEGER DEFAULT 1
        )
      `);

      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_pr_key ON review_history(pr_key)
      `);

      this.useSqlite = true;
    } catch {
      // Fall back to JSON storage
      await this.loadJsonStore();
      this.useSqlite = false;
    }
  }

  async loadJsonStore() {
    try {
      if (existsSync(this.dbPath)) {
        const data = await fs.readFile(this.dbPath, 'utf8');
        this.jsonStore = JSON.parse(data);
      }
    } catch {
      this.jsonStore = { reviews: {} };
    }
    if (!this.jsonStore) this.jsonStore = { reviews: {} };
  }

  async saveJsonStore() {
    const dir = path.dirname(this.dbPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.dbPath, JSON.stringify(this.jsonStore, null, 2), 'utf8');
  }

  async saveSqliteDb() {
    if (!this.useSqlite || !this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    const dbPath = this.dbPath.replace('.json', '.db');
    const dir = path.dirname(dbPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(dbPath, buffer);
  }

  /**
   * Record a review for a PR.
   */
  async recordReview(prKey, commitSha, result = {}) {
    await this.init();

    if (this.useSqlite) {
      this.db.run(
        `INSERT INTO review_history (pr_key, commit_sha, mode, issues_found, success)
         VALUES (?, ?, ?, ?, ?)`,
        [prKey, commitSha || '', result.mode || 'full', result.issuesFound || 0, result.success !== false ? 1 : 0]
      );
      await this.saveSqliteDb();
    } else {
      if (!this.jsonStore.reviews[prKey]) {
        this.jsonStore.reviews[prKey] = [];
      }
      this.jsonStore.reviews[prKey].push({
        commitSha: commitSha || '',
        reviewedAt: new Date().toISOString(),
        mode: result.mode || 'full',
        issuesFound: result.issuesFound || 0,
        success: result.success !== false,
      });
      await this.saveJsonStore();
    }
  }

  /**
   * Get the SHA of the last reviewed commit for a PR.
   */
  async getLastReviewedCommit(prKey) {
    await this.init();

    if (this.useSqlite) {
      const result = this.db.exec(
        `SELECT commit_sha FROM review_history
         WHERE pr_key = ? AND commit_sha != ''
         ORDER BY id DESC LIMIT 1`,
        [prKey]
      );
      if (result.length > 0 && result[0].values.length > 0) {
        return result[0].values[0][0];
      }
      return null;
    }

    const reviews = this.jsonStore.reviews[prKey] || [];
    for (let i = reviews.length - 1; i >= 0; i--) {
      if (reviews[i].commitSha) return reviews[i].commitSha;
    }
    return null;
  }

  /**
   * Get total review count for a PR.
   */
  async getReviewCount(prKey) {
    await this.init();

    if (this.useSqlite) {
      const result = this.db.exec(
        `SELECT COUNT(*) FROM review_history WHERE pr_key = ?`,
        [prKey]
      );
      return result.length > 0 ? result[0].values[0][0] : 0;
    }

    return (this.jsonStore.reviews[prKey] || []).length;
  }

  /**
   * Reset review count for a PR (used when resolving/unpausing).
   */
  async resetReviewCount(prKey) {
    await this.init();

    if (this.useSqlite) {
      this.db.run(`DELETE FROM review_history WHERE pr_key = ?`, [prKey]);
      await this.saveSqliteDb();
    } else {
      delete this.jsonStore.reviews[prKey];
      await this.saveJsonStore();
    }
  }

  /**
   * Get full review history for a PR.
   */
  async getHistory(prKey) {
    await this.init();

    if (this.useSqlite) {
      const result = this.db.exec(
        `SELECT commit_sha, reviewed_at, mode, issues_found, success
         FROM review_history WHERE pr_key = ? ORDER BY id ASC`,
        [prKey]
      );
      if (result.length === 0) return [];
      return result[0].values.map(row => ({
        commitSha: row[0],
        reviewedAt: row[1],
        mode: row[2],
        issuesFound: row[3],
        success: !!row[4],
      }));
    }

    return this.jsonStore.reviews[prKey] || [];
  }

  /**
   * Close the database connection.
   */
  close() {
    if (this.useSqlite && this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export default ReviewHistoryStore;

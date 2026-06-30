/**
 * Override Manager
 *
 * Per-PR override with audit trail. Allows reviewers to bypass quality gates.
 * Stores overrides in JSON file for persistence.
 */

import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';

const OVERRIDE_PATH = path.join('.sentinel', 'overrides.json');

export class OverrideManager {
  constructor(options = {}) {
    this.filePath = options.filePath || OVERRIDE_PATH;
    this.reviewerOnly = options.reviewerOnly !== false;
    this.overrides = null;
  }

  /**
   * Load overrides from disk.
   */
  async load() {
    if (this.overrides) return;

    try {
      if (existsSync(this.filePath)) {
        const data = await fs.readFile(this.filePath, 'utf8');
        this.overrides = JSON.parse(data);
      }
    } catch {
      this.overrides = {};
    }

    if (!this.overrides) this.overrides = {};
  }

  /**
   * Save overrides to disk.
   */
  async save() {
    const dir = path.dirname(this.filePath);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch { /* exists */ }
    await fs.writeFile(this.filePath, JSON.stringify(this.overrides, null, 2), 'utf8');
  }

  /**
   * Set an override for a PR.
   */
  async setOverride(prNumber, reason, author) {
    await this.load();

    this.overrides[prNumber] = {
      active: true,
      reason: reason || 'No reason provided',
      author: author || 'unknown',
      timestamp: new Date().toISOString(),
    };

    await this.save();

    return this.overrides[prNumber];
  }

  /**
   * Remove an override for a PR.
   */
  async removeOverride(prNumber) {
    await this.load();

    if (this.overrides[prNumber]) {
      this.overrides[prNumber].active = false;
      this.overrides[prNumber].removedAt = new Date().toISOString();
      await this.save();
    }
  }

  /**
   * Get the active override for a PR.
   */
  async getOverride(prNumber) {
    await this.load();

    const override = this.overrides[prNumber];
    if (!override || !override.active) return null;

    return override;
  }

  /**
   * Get the audit trail for a PR.
   */
  async getAuditTrail(prNumber) {
    await this.load();
    return this.overrides[prNumber] || null;
  }

  /**
   * Check if a user is authorized to set overrides.
   */
  isAuthorized(username) {
    // In production, this would check against a list of approved reviewers
    // For now, any authenticated user can override
    return !!username;
  }
}

export default OverrideManager;

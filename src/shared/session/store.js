import { randomUUID } from 'node:crypto';
import { getDatabase } from '../../server/database/adapter.js';
import { createCheckpoint, restoreCheckpoint, redoCheckpoint } from '../tools/checkpoint.js';

export class SessionStoreManager {
  /**
   * @param {object} config - Configuration options
   * @param {string} [config.userId='default-local-user'] - Identifier of the active developer/user
   */
  constructor(config = {}) {
    this.userId = config.userId || 'default-local-user';
  }

  /**
   * Create a new session.
   * @param {object} params - { title, mode, modelId, projectPath }
   * @returns {Promise<object>} Created session record
   */
  async createSession({ title, mode = 'BUILD', modelId, projectPath }) {
    const db = await getDatabase();
    const now = new Date();
    const sessionRecord = {
      id: randomUUID(),
      userId: this.userId,
      title: title || `Session: ${new Date().toLocaleDateString()}`,
      mode,
      model: modelId || 'llama-3.1-8b-instant',
      projectPath: projectPath || process.cwd(),
      messages: [],
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    return await db.createSession(sessionRecord);
  }

  /**
   * Retrieves a session by its unique ID.
   * @param {string} id 
   * @returns {Promise<object|null>} The session record or null
   */
  async getSession(id) {
    const db = await getDatabase();
    return await db.findSession(id, this.userId);
  }

  /**
   * Lists all sessions stored under the active user.
   * @returns {Promise<Array<object>>} List of user sessions
   */
  async listSessions() {
    const db = await getDatabase();
    return await db.findSessions(this.userId);
  }

  /**
   * Updates session fields (e.g. title, mode, messages, status).
   * @param {string} id 
   * @param {object} updates 
   * @returns {Promise<object>} Updated session
   */
  async updateSession(id, updates) {
    const db = await getDatabase();
    return await db.updateSession(id, this.userId, updates);
  }

  /**
   * Deletes a session by ID.
   * @param {string} id 
   * @returns {Promise<boolean>} True if deleted successfully
   */
  async deleteSession(id) {
    const db = await getDatabase();
    return await db.deleteSession(id, this.userId);
  }

  /**
   * Save a checkpoint of files before edits are applied.
   * @param {string} sessionId 
   * @param {string[]} filePaths - Absolute file paths to backup
   * @param {string} description - Brief notes on what this checkpoint covers
   * @returns {Promise<object>} Checkpoint details
   */
  async saveCheckpoint(sessionId, filePaths, description) {
    const checkpointInfo = await createCheckpoint(filePaths);
    if (!checkpointInfo) return null;

    // Log the checkpoint event in the session message stream
    const db = await getDatabase();
    const session = await db.findSession(sessionId, this.userId);
    if (session) {
      const checkpointMessage = {
        id: randomUUID(),
        role: 'system',
        content: `Checkpoint created: "${description}" (ID: ${checkpointInfo.id}, files: ${checkpointInfo.files})`,
        parts: [
          {
            type: 'checkpoint',
            id: checkpointInfo.id,
            description,
            files: filePaths,
            timestamp: Date.now(),
          }
        ],
        createdAt: new Date().toISOString(),
      };

      const messages = session.messages || [];
      messages.push(checkpointMessage);
      await db.updateSession(sessionId, this.userId, { messages });
    }

    return checkpointInfo;
  }

  /**
   * Rollback the workspace state from a checkpoint.
   * @param {string} sessionId 
   * @param {string} [checkpointId] - Checkpoint ID (falls back to latest if omitted)
   * @returns {Promise<object>} Restored files information
   */
  async rollbackCheckpoint(sessionId, checkpointId) {
    const result = await restoreCheckpoint(checkpointId);
    
    // Log the rollback event to the session history
    const db = await getDatabase();
    const session = await db.findSession(sessionId, this.userId);
    if (session) {
      const rollbackMessage = {
        id: randomUUID(),
        role: 'system',
        content: `Workspace rolled back from checkpoint ${checkpointId || 'latest'}. Restored: [${result.restored.join(', ')}]. Deleted: [${result.deleted.join(', ')}].`,
        parts: [
          {
            type: 'checkpoint_rollback',
            checkpointId,
            restored: result.restored,
            deleted: result.deleted,
            timestamp: Date.now(),
          }
        ],
        createdAt: new Date().toISOString(),
      };

      const messages = session.messages || [];
      messages.push(rollbackMessage);
      await db.updateSession(sessionId, this.userId, { messages });
    }

    return result;
  }

  /**
   * Re-applies the last undone checkpoint.
   * @param {string} sessionId 
   * @returns {Promise<object>} Redone files information
   */
  async reapplyCheckpoint(sessionId) {
    const result = await redoCheckpoint();

    const db = await getDatabase();
    const session = await db.findSession(sessionId, this.userId);
    if (session) {
      const redoMessage = {
        id: randomUUID(),
        role: 'system',
        content: `Checkpoint changes reapplied (Redo). Restored: [${result.restored.join(', ')}]. Deleted: [${result.deleted.join(', ')}].`,
        parts: [
          {
            type: 'checkpoint_redo',
            restored: result.restored,
            deleted: result.deleted,
            timestamp: Date.now(),
          }
        ],
        createdAt: new Date().toISOString(),
      };

      const messages = session.messages || [];
      messages.push(redoMessage);
      await db.updateSession(sessionId, this.userId, { messages });
    }

    return result;
  }
}

export default SessionStoreManager;

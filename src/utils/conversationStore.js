import { promises as fs } from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';

/**
 * ConversationStore - Persists conversation history using SQLite or file-based storage
 */
export class ConversationStore {
  constructor(options = {}) {
    this.storagePath = options.storagePath || path.join(process.cwd(), '.sentinel', 'conversations.db');
    this.maxHistory = options.maxHistory || 100;
    this.db = null;
    this.useFileStorage = options.useFileStorage || !options.useDatabase;
  }

  /**
   * Initialize the store
   */
  async init() {
    if (this.useFileStorage) {
      // Create directory for file storage
      const dir = path.dirname(this.storagePath);
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch {
        // Directory already exists or we'll use fallback
      }
      return { initialized: true, storage: 'file' };
    } else {
      // Initialize SQLite database
      const Database = sqlite3.Database;
      this.db = new Database(this.storagePath);
      await this.createTables();
      return { initialized: true, storage: 'database' };
    }
  }

  /**
   * Create database tables
   */
  async createTables() {
    return new Promise((resolve, reject) => {
      const tables = `
        CREATE TABLE IF NOT EXISTS conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conversation_id INTEGER,
          role TEXT,
          content TEXT,
          timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id)
        );

        CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
      `;

      this.db.exec(tables, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Create a new conversation
   */
  async createConversation(title = 'New Conversation') {
    if (this.useFileStorage) {
      const timestamp = new Date().toISOString();
      const conversation = {
        id: timestamp,
        title,
        createdAt: timestamp,
        messages: []
      };

      await this.saveFileConversation(conversation);
      return conversation;
    } else {
      return new Promise((resolve, reject) => {
        this.db.run(
          'INSERT INTO conversations (title) VALUES (?)',
          [title],
          function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, title, createdAt: new Date().toISOString() });
          }
        );
      });
    }
  }

  /**
   * Save conversation to file
   */
  async saveFileConversation(conversation) {
    const file = path.join(path.dirname(this.storagePath), 'conversations', `${conversation.id}.json`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(conversation, null, 2));
  }

  /**
   * Get conversation
   */
  async getConversation(id) {
    if (this.useFileStorage) {
      const file = path.join(path.dirname(this.storagePath), 'conversations', `${id}.json`);
      try {
        const content = await fs.readFile(file, 'utf-8');
        return JSON.parse(content);
      } catch {
        return null;
      }
    } else {
      return new Promise((resolve, reject) => {
        this.db.get('SELECT * FROM conversations WHERE id = ?', [id], (err, row) => {
          if (err) reject(err);
          else if (!row) resolve(null);
          else resolve({ ...row });
        });
      });
    }
  }

  /**
   * Get all conversations
   */
  async listConversations(limit = 50) {
    if (this.useFileStorage) {
      const dir = path.join(path.dirname(this.storagePath), 'conversations');
      try {
        const files = await fs.readdir(dir);
        const conversations = [];

        for (const file of files.slice(-limit)) {
          if (file.endsWith('.json')) {
            try {
              const content = await fs.readFile(path.join(dir, file), 'utf-8');
              conversations.push(JSON.parse(content));
            } catch {
              // Skip invalid files
            }
          }
        }

        return conversations.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      } catch {
        return [];
      }
    } else {
      return new Promise((resolve, reject) => {
        this.db.all(
          'SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?',
          [limit],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
    }
  }

  /**
   * Add message to conversation
   */
  async addMessage(conversationId, role, content) {
    if (this.useFileStorage) {
      const conversation = await this.getConversation(conversationId) || {
        id: conversationId,
        title: 'New Conversation',
        createdAt: new Date().toISOString(),
        messages: []
      };

      conversation.messages.push({
        id: `${conversationId}_${Date.now()}`,
        role,
        content,
        timestamp: new Date().toISOString()
      });

      // Keep only last N messages
      if (conversation.messages.length > this.maxHistory) {
        conversation.messages = conversation.messages.slice(-this.maxHistory);
      }

      conversation.updatedAt = new Date().toISOString();
      await this.saveFileConversation(conversation);
      return conversation.messages[conversation.messages.length - 1];
    } else {
      return new Promise((resolve, reject) => {
        this.db.run(
          'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
          [conversationId, role, content],
          function(err) {
            if (err) reject(err);
            else {
              this.db.run(
                'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [conversationId]
              );
              resolve({ id: this.lastID, conversationId, role, content, timestamp: new Date().toISOString() });
            }
          }
        );
      });
    }
  }

  /**
   * Get messages from conversation
   */
  async getMessages(conversationId, limit = 100) {
    if (this.useFileStorage) {
      const conversation = await this.getConversation(conversationId);
      return conversation?.messages?.slice(-limit) || [];
    } else {
      return new Promise((resolve, reject) => {
        this.db.all(
          'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT ?',
          [conversationId, limit],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows?.reverse() || []);
          }
        );
      });
    }
  }

  /**
   * Delete conversation
   */
  async deleteConversation(id) {
    if (this.useFileStorage) {
      const file = path.join(path.dirname(this.storagePath), 'conversations', `${id}.json`);
      try {
        await fs.unlink(file);
        return { success: true };
      } catch {
        return { success: false, error: 'Conversation not found' };
      }
    } else {
      return new Promise((resolve, reject) => {
        this.db.run('DELETE FROM conversations WHERE id = ?', [id], (err) => {
          if (err) reject(err);
          else resolve({ success: true });
        });
      });
    }
  }

  /**
   * Clear all conversations
   */
  async clearAll() {
    if (this.useFileStorage) {
      const dir = path.join(path.dirname(this.storagePath), 'conversations');
      try {
        const files = await fs.readdir(dir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            await fs.unlink(path.join(dir, file));
          }
        }
        return { success: true };
      } catch {
        return { success: false, error: 'Could not clear conversations' };
      }
    } else {
      return new Promise((resolve, reject) => {
        this.db.run('DELETE FROM messages', (err) => {
          if (err) reject(err);
          else {
            this.db.run('DELETE FROM conversations', (err2) => {
              if (err2) reject(err2);
              else resolve({ success: true });
            });
          }
        });
      });
    }
  }

  /**
   * Resume conversation (get recent context)
   */
  async resumeConversation(id) {
    const messages = await this.getMessages(id, 20);
    return {
      conversationId: id,
      messageCount: messages.length,
      messages: messages.map(m => ({ role: m.role, content: m.content }))
    };
  }

  /**
   * Export conversation
   */
  async exportConversation(id, format = 'json') {
    const conversation = await this.getConversation(id);
    const messages = await this.getMessages(id);

    if (format === 'json') {
      return JSON.stringify({ ...conversation, messages }, null, 2);
    } else if (format === 'markdown') {
      return this.exportToMarkdown(conversation, messages);
    }
    return null;
  }

  /**
   * Export conversation to markdown
   */
  exportToMarkdown(conversation, messages) {
    let md = `# ${conversation.title}\n\n`;
    md += `**Created:** ${conversation.createdAt}\n\n`;

    for (const msg of messages) {
      md += `## ${msg.role.toUpperCase()}\n\n${msg.content}\n\n---\n\n`;
    }

    return md;
  }
}

// File-based fallback store
export class SimpleFileStore {
  constructor(options = {}) {
    this.storagePath = options.storagePath || path.join(process.cwd(), '.sentinel', 'data.json');
    this.data = {};
  }

  async init() {
    try {
      const dir = path.dirname(this.storagePath);
      await fs.mkdir(dir, { recursive: true });

      try {
        const content = await fs.readFile(this.storagePath, 'utf-8');
        this.data = JSON.parse(content);
      } catch {
        this.data = { conversations: {}, messages: [] };
      }
      return { initialized: true, storage: 'file' };
    } catch {
      return { initialized: false, error: 'Could not initialize file store' };
    }
  }

  async save() {
    try {
      const dir = path.dirname(this.storagePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.storagePath, JSON.stringify(this.data, null, 2));
      return { success: true };
    } catch {
      return { success: false, error: 'Could not save data' };
    }
  }

  async get(key) {
    return this.data[key];
  }

  async set(key, value) {
    this.data[key] = value;
    return await this.save();
  }

  async del(key) {
    delete this.data[key];
    return await this.save();
  }
}

export default ConversationStore;

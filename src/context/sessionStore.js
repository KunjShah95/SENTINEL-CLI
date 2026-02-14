import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import crypto from 'crypto';

/**
 * Session Store - Manages persistent session data, conversation history, and user context
 */
class SessionStore {
  constructor(dbPath = null) {
    this.dbPath = dbPath || join(homedir(), '.sentinel', 'sessions.db');
    this.ensureDirectory();
    this.db = null;
    this.currentSession = null;
  }

  ensureDirectory() {
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  connect() {
    if (this.db) return;

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  initSchema() {
    // Sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        end_time DATETIME,
        is_active BOOLEAN DEFAULT 1,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_path);
      CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active);
    `);

    // Command history
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS command_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        command TEXT NOT NULL,
        args TEXT,
        findings_count INTEGER DEFAULT 0,
        findings_hash TEXT,
        execution_time_ms INTEGER,
        success BOOLEAN DEFAULT 1,
        error TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_commands_session ON command_history(session_id);
      CREATE INDEX IF NOT EXISTS idx_commands_timestamp ON command_history(timestamp);
    `);

    // User preferences
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_path TEXT NOT NULL UNIQUE,
        auto_fix BOOLEAN DEFAULT 0,
        severity_filter TEXT DEFAULT '["critical","high","medium","low"]',
        preferred_llm TEXT,
        notification_settings TEXT,
        custom_settings TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Feedback system
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        finding_hash TEXT NOT NULL,
        file_path TEXT NOT NULL,
        rule_id TEXT NOT NULL,
        user_action TEXT NOT NULL, -- 'suppressed', 'fixed', 'false_positive', 'confirmed'
        reason TEXT,
        auto_fix_applied BOOLEAN DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_feedback_hash ON feedback(finding_hash);
      CREATE INDEX IF NOT EXISTS idx_feedback_action ON feedback(user_action);
      CREATE INDEX IF NOT EXISTS idx_feedback_rule ON feedback(rule_id);
    `);

    // Fix outcomes
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS fix_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        finding_hash TEXT NOT NULL,
        fix_hash TEXT NOT NULL,
        fix_content TEXT NOT NULL,
        success BOOLEAN,
        user_correction TEXT,
        reverted BOOLEAN DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_fixes_hash ON fix_outcomes(fix_hash);
      CREATE INDEX IF NOT EXISTS idx_fixes_success ON fix_outcomes(success);
    `);

    // Codebase knowledge
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS codebase_knowledge (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_path TEXT NOT NULL,
        knowledge_type TEXT NOT NULL, -- 'framework', 'architecture', 'security_control', 'risk_area', 'dependency'
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        confidence REAL DEFAULT 1.0,
        source TEXT, -- 'detected', 'user_specified', 'learned'
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_path, knowledge_type, key)
      );

      CREATE INDEX IF NOT EXISTS idx_knowledge_project ON codebase_knowledge(project_path);
      CREATE INDEX IF NOT EXISTS idx_knowledge_type ON codebase_knowledge(knowledge_type);
    `);

    // Suppressions with context
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS suppressions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_path TEXT NOT NULL,
        file_path TEXT NOT NULL,
        rule_id TEXT NOT NULL,
        pattern TEXT,
        reason TEXT,
        expires_at DATETIME,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_suppressions_project ON suppressions(project_path);
      CREATE INDEX IF NOT EXISTS idx_suppressions_rule ON suppressions(rule_id);
    `);

    // Conversation history for interactive mode
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL, -- 'user', 'assistant', 'system'
        content TEXT NOT NULL,
        metadata TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_conversation_session ON conversation_history(session_id);
    `);

    // Security posture tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS security_posture (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_path TEXT NOT NULL,
        scan_type TEXT NOT NULL,
        score REAL NOT NULL,
        critical_count INTEGER DEFAULT 0,
        high_count INTEGER DEFAULT 0,
        medium_count INTEGER DEFAULT 0,
        low_count INTEGER DEFAULT 0,
        info_count INTEGER DEFAULT 0,
        files_scanned INTEGER DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_posture_project ON security_posture(project_path);
      CREATE INDEX IF NOT EXISTS idx_posture_timestamp ON security_posture(timestamp);
    `);
  }

  // Session management
  createSession(projectPath, metadata = {}) {
    this.connect();
    const id = crypto.randomUUID();

    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, project_path, metadata)
      VALUES (?, ?, ?)
    `);

    stmt.run(id, projectPath, JSON.stringify(metadata));

    this.currentSession = {
      id,
      projectPath,
      startTime: new Date(),
      metadata
    };

    return id;
  }

  getSession(sessionId) {
    this.connect();
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    const session = stmt.get(sessionId);

    if (session && session.metadata) {
      session.metadata = JSON.parse(session.metadata);
    }

    return session;
  }

  getActiveSession(projectPath) {
    this.connect();
    const stmt = this.db.prepare(`
      SELECT * FROM sessions
      WHERE project_path = ? AND is_active = 1
      ORDER BY start_time DESC
      LIMIT 1
    `);

    const session = stmt.get(projectPath);
    if (session && session.metadata) {
      session.metadata = JSON.parse(session.metadata);
    }

    return session;
  }

  endSession(sessionId) {
    this.connect();
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET end_time = CURRENT_TIMESTAMP, is_active = 0
      WHERE id = ?
    `);

    stmt.run(sessionId);

    if (this.currentSession && this.currentSession.id === sessionId) {
      this.currentSession = null;
    }
  }

  // Command history
  addCommand(sessionId, command, args = {}, result = {}) {
    this.connect();
    const stmt = this.db.prepare(`
      INSERT INTO command_history
      (session_id, command, args, findings_count, findings_hash, execution_time_ms, success, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      sessionId,
      command,
      JSON.stringify(args),
      result.findingsCount || 0,
      result.findingsHash || null,
      result.executionTime || 0,
      result.success !== false ? 1 : 0,
      result.error || null
    );
  }

  getCommandHistory(sessionId, limit = 50) {
    this.connect();
    const stmt = this.db.prepare(`
      SELECT * FROM command_history
      WHERE session_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(sessionId, limit).map(cmd => ({
      ...cmd,
      args: cmd.args ? JSON.parse(cmd.args) : {}
    }));
  }

  getRecentCommands(projectPath, limit = 20) {
    this.connect();
    const stmt = this.db.prepare(`
      SELECT ch.* FROM command_history ch
      JOIN sessions s ON ch.session_id = s.id
      WHERE s.project_path = ?
      ORDER BY ch.timestamp DESC
      LIMIT ?
    `);

    return stmt.all(projectPath, limit).map(cmd => ({
      ...cmd,
      args: cmd.args ? JSON.parse(cmd.args) : {}
    }));
  }

  // User preferences
  setPreferences(projectPath, preferences) {
    this.connect();
    const stmt = this.db.prepare(`
      INSERT INTO user_preferences (project_path, auto_fix, severity_filter, preferred_llm, notification_settings, custom_settings)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_path) DO UPDATE SET
        auto_fix = excluded.auto_fix,
        severity_filter = excluded.severity_filter,
        preferred_llm = excluded.preferred_llm,
        notification_settings = excluded.notification_settings,
        custom_settings = excluded.custom_settings,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(
      projectPath,
      preferences.autoFix ? 1 : 0,
      JSON.stringify(preferences.severityFilter || ['critical', 'high', 'medium', 'low']),
      preferences.preferredLLM || null,
      JSON.stringify(preferences.notificationSettings || {}),
      JSON.stringify(preferences.customSettings || {})
    );
  }

  getPreferences(projectPath) {
    this.connect();
    const stmt = this.db.prepare('SELECT * FROM user_preferences WHERE project_path = ?');
    const prefs = stmt.get(projectPath);

    if (!prefs) {
      return {
        autoFix: false,
        severityFilter: ['critical', 'high', 'medium', 'low'],
        preferredLLM: null,
        notificationSettings: {},
        customSettings: {}
      };
    }

    return {
      autoFix: Boolean(prefs.auto_fix),
      severityFilter: JSON.parse(prefs.severity_filter),
      preferredLLM: prefs.preferred_llm,
      notificationSettings: prefs.notification_settings ? JSON.parse(prefs.notification_settings) : {},
      customSettings: prefs.custom_settings ? JSON.parse(prefs.custom_settings) : {}
    };
  }

  // Feedback system
  addFeedback(sessionId, finding, action, reason = null) {
    this.connect();
    const findingHash = this.hashFinding(finding);

    const stmt = this.db.prepare(`
      INSERT INTO feedback (session_id, finding_hash, file_path, rule_id, user_action, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      sessionId,
      findingHash,
      finding.file || finding.filePath,
      finding.ruleId || finding.rule,
      action,
      reason
    );

    return findingHash;
  }

  getFeedbackForFinding(findingHash) {
    this.connect();
    const stmt = this.db.prepare(`
      SELECT * FROM feedback
      WHERE finding_hash = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `);

    return stmt.get(findingHash);
  }

  getFalsePositivePatterns(ruleId = null, limit = 100) {
    this.connect();
    let query = `
      SELECT rule_id, file_path, COUNT(*) as count
      FROM feedback
      WHERE user_action = 'false_positive'
    `;

    if (ruleId) {
      query += ` AND rule_id = ?`;
    }

    query += `
      GROUP BY rule_id, file_path
      ORDER BY count DESC
      LIMIT ?
    `;

    const stmt = this.db.prepare(query);
    return ruleId ? stmt.all(ruleId, limit) : stmt.all(limit);
  }

  // Fix outcomes
  recordFixOutcome(sessionId, finding, fix, success, userCorrection = null) {
    this.connect();
    const findingHash = this.hashFinding(finding);
    const fixHash = this.hashFix(fix);

    const stmt = this.db.prepare(`
      INSERT INTO fix_outcomes (session_id, finding_hash, fix_hash, fix_content, success, user_correction)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      sessionId,
      findingHash,
      fixHash,
      JSON.stringify(fix),
      success ? 1 : 0,
      userCorrection
    );
  }

  getSuccessfulFixes(ruleId = null, limit = 50) {
    this.connect();
    const stmt = this.db.prepare(`
      SELECT fo.*, f.rule_id
      FROM fix_outcomes fo
      JOIN feedback f ON fo.finding_hash = f.finding_hash
      WHERE fo.success = 1 AND fo.reverted = 0
      ${ruleId ? 'AND f.rule_id = ?' : ''}
      ORDER BY fo.timestamp DESC
      LIMIT ?
    `);

    return ruleId ? stmt.all(ruleId, limit) : stmt.all(limit);
  }

  // Codebase knowledge
  setKnowledge(projectPath, type, key, value, confidence = 1.0, source = 'detected') {
    this.connect();
    const stmt = this.db.prepare(`
      INSERT INTO codebase_knowledge (project_path, knowledge_type, key, value, confidence, source)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_path, knowledge_type, key) DO UPDATE SET
        value = excluded.value,
        confidence = excluded.confidence,
        source = excluded.source,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(projectPath, type, key, JSON.stringify(value), confidence, source);
  }

  getKnowledge(projectPath, type = null) {
    this.connect();
    let query = 'SELECT * FROM codebase_knowledge WHERE project_path = ?';
    const params = [projectPath];

    if (type) {
      query += ' AND knowledge_type = ?';
      params.push(type);
    }

    query += ' ORDER BY confidence DESC, updated_at DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params);

    return rows.map(row => ({
      ...row,
      value: JSON.parse(row.value)
    }));
  }

  // Suppressions
  addSuppression(projectPath, filePath, ruleId, pattern = null, reason = null, expiresAt = null) {
    this.connect();
    const stmt = this.db.prepare(`
      INSERT INTO suppressions (project_path, file_path, rule_id, pattern, reason, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(projectPath, filePath, ruleId, pattern, reason, expiresAt);
  }

  getSuppressions(projectPath, filePath = null) {
    this.connect();
    let query = `
      SELECT * FROM suppressions
      WHERE project_path = ?
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `;

    const params = [projectPath];

    if (filePath) {
      query += ' AND file_path = ?';
      params.push(filePath);
    }

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  isSuppressed(projectPath, filePath, ruleId) {
    this.connect();
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM suppressions
      WHERE project_path = ? AND file_path = ? AND rule_id = ?
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `);

    const result = stmt.get(projectPath, filePath, ruleId);
    return result.count > 0;
  }

  // Conversation history (for interactive mode)
  addConversation(sessionId, role, content, metadata = {}) {
    this.connect();
    const stmt = this.db.prepare(`
      INSERT INTO conversation_history (session_id, role, content, metadata)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(sessionId, role, content, JSON.stringify(metadata));
  }

  getConversationHistory(sessionId, limit = 100) {
    this.connect();
    const stmt = this.db.prepare(`
      SELECT * FROM conversation_history
      WHERE session_id = ?
      ORDER BY timestamp ASC
      LIMIT ?
    `);

    return stmt.all(sessionId, limit).map(msg => ({
      ...msg,
      metadata: msg.metadata ? JSON.parse(msg.metadata) : {}
    }));
  }

  // Security posture tracking
  recordSecurityPosture(projectPath, scanType, metrics) {
    this.connect();
    const stmt = this.db.prepare(`
      INSERT INTO security_posture
      (project_path, scan_type, score, critical_count, high_count, medium_count, low_count, info_count, files_scanned)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      projectPath,
      scanType,
      metrics.score || 0,
      metrics.critical || 0,
      metrics.high || 0,
      metrics.medium || 0,
      metrics.low || 0,
      metrics.info || 0,
      metrics.filesScanned || 0
    );
  }

  getSecurityPostureHistory(projectPath, days = 30, limit = 100) {
    this.connect();
    const stmt = this.db.prepare(`
      SELECT * FROM security_posture
      WHERE project_path = ?
      AND timestamp >= datetime('now', '-' || ? || ' days')
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(projectPath, days, limit);
  }

  getLatestSecurityPosture(projectPath) {
    this.connect();
    const stmt = this.db.prepare(`
      SELECT * FROM security_posture
      WHERE project_path = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `);

    return stmt.get(projectPath);
  }

  // Utility methods
  hashFinding(finding) {
    const key = `${finding.file || finding.filePath}:${finding.line}:${finding.ruleId || finding.rule}:${finding.message}`;
    return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
  }

  hashFix(fix) {
    const key = JSON.stringify(fix);
    return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
  }

  // Statistics
  getStats(projectPath) {
    this.connect();
    const stats = {};

    // Total sessions
    const sessionStmt = this.db.prepare('SELECT COUNT(*) as count FROM sessions WHERE project_path = ?');
    stats.totalSessions = sessionStmt.get(projectPath).count;

    // Total commands
    const commandStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM command_history ch
      JOIN sessions s ON ch.session_id = s.id
      WHERE s.project_path = ?
    `);
    stats.totalCommands = commandStmt.get(projectPath).count;

    // Feedback counts
    const feedbackStmt = this.db.prepare(`
      SELECT user_action, COUNT(*) as count
      FROM feedback f
      JOIN sessions s ON f.session_id = s.id
      WHERE s.project_path = ?
      GROUP BY user_action
    `);
    stats.feedback = {};
    feedbackStmt.all(projectPath).forEach(row => {
      stats.feedback[row.user_action] = row.count;
    });

    // Fix success rate
    const fixStmt = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful
      FROM fix_outcomes fo
      JOIN sessions s ON fo.session_id = s.id
      WHERE s.project_path = ?
    `);
    const fixStats = fixStmt.get(projectPath);
    stats.fixSuccessRate = fixStats.total > 0
      ? (fixStats.successful / fixStats.total * 100).toFixed(2) + '%'
      : 'N/A';

    return stats;
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Singleton instance
let instance = null;

export function getSessionStore(dbPath = null) {
  if (!instance) {
    instance = new SessionStore(dbPath);
  }
  return instance;
}

export default SessionStore;

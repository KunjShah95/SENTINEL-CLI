/**
 * Structured Logger — production-grade JSON logging for Sentinel CLI.
 *
 * Features:
 * - JSON-formatted output (one object per line) for easy parsing
 * - Child loggers with inherited context (requestId, sessionId, etc.)
 * - Automatic request ID generation for correlation
 * - File rotation support (daily + size-based)
 * - Log levels: debug, info, warn, error, fatal
 * - Sensitive field redaction
 * - Backward-compatible API with the original Logger class
 */

import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const LOG_LEVELS = Object.freeze({
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
});

const SENSITIVE_KEYS = new Set([
  'password', 'token', 'secret', 'apiKey', 'api_key',
  'authorization', 'cookie', 'privateKey', 'private_key',
  'accessToken', 'access_token', 'refreshToken', 'refresh_token',
]);

function generateRequestId() {
  return `req_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function redactSensitive(obj, depth = 0) {
  if (depth > 5 || !obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(v => redactSensitive(v, depth + 1));

  const redacted = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key) && typeof value === 'string') {
      redacted[key] = value.length > 8
        ? `${value.slice(0, 4)}${'*'.repeat(Math.min(value.length - 8, 20))}${value.slice(-4)}`
        : '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitive(value, depth + 1);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

function serializeError(err) {
  if (!err) return undefined;
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      code: err.code,
      stack: err.stack,
    };
  }
  return String(err);
}

class StructuredLogger {
  /**
   * @param {object} [options]
   * @param {string} [options.level]         - Minimum log level (default: 'info')
   * @param {string} [options.service]       - Service name for log entries
   * @param {boolean} [options.json]         - Output JSON (default: true in production)
   * @param {string} [options.logDir]        - Directory for log files (null = no file output)
   * @param {number} [options.maxFileSize]   - Max bytes per log file before rotation (default: 10MB)
   * @param {number} [options.maxFiles]      - Max rotated files to keep (default: 7)
   * @param {object} [options.baseContext]   - Fields added to every log entry
   */
  constructor(options = {}) {
    this.level = options.level || (process.env.LOG_LEVEL || 'info');
    this.service = options.service || 'sentinel';
    this.jsonOutput = options.json ?? (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development');
    this.logDir = options.logDir || null;
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10 MB
    this.maxFiles = options.maxFiles || 7;
    this.baseContext = options.baseContext || {};

    this._currentFile = null;
    this._currentFileSize = 0;
    this._currentDate = null;
    this._writeQueue = Promise.resolve();
  }

  /**
   * Create a child logger that inherits parent context and adds its own.
   * @param {object} context - Additional context fields for every log entry
   * @returns {StructuredLogger}
   */
  child(context) {
    const child = new StructuredLogger({
      level: this.level,
      service: this.service,
      json: this.jsonOutput,
      logDir: this.logDir,
      maxFileSize: this.maxFileSize,
      maxFiles: this.maxFiles,
      baseContext: { ...this.baseContext, ...context },
    });
    // Share the write queue with parent
    child._writeQueue = this._writeQueue;
    child._parent = this;
    return child;
  }

  /**
   * Generate a request-scoped child logger with an auto-generated requestId.
   * @param {object} [extra] - Additional context
   * @returns {StructuredLogger}
   */
  requestScope(extra = {}) {
    return this.child({ requestId: generateRequestId(), ...extra });
  }

  /**
   * Core log method.
   * @param {string} level
   * @param {string} message
   * @param {object} [meta]
   */
  _log(level, message, meta = {}) {
    if ((LOG_LEVELS[this.level] ?? 1) > (LOG_LEVELS[level] ?? 1)) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message,
      ...redactSensitive(this.baseContext),
    };

    if (meta && typeof meta === 'object') {
      if (meta.err || meta.error) {
        entry.error = serializeError(meta.err || meta.error);
        const { err, error, ...rest } = meta;
        Object.assign(entry, redactSensitive(rest));
      } else {
        Object.assign(entry, redactSensitive(meta));
      }
    } else if (typeof meta === 'string') {
      entry.detail = meta;
    }

    const line = this.jsonOutput ? JSON.stringify(entry) : this._formatHuman(entry);

    // Console output
    this._writeConsole(level, line);

    // File output (non-blocking, queued)
    if (this.logDir) {
      this._writeQueue = this._writeQueue.then(() => this._writeFile(line)).catch(() => {});
    }
  }

  _formatHuman(entry) {
    const levelTag = entry.level.toUpperCase().padEnd(5);
    const ctx = Object.keys(this.baseContext).length > 0
      ? ` ${JSON.stringify(redactSensitive(this.baseContext))}`
      : '';
    const errStr = entry.error ? ` | ${entry.error.message || entry.error}` : '';
    return `[${levelTag}] ${entry.timestamp} ${entry.message}${ctx}${errStr}`;
  }

  _writeConsole(level, line) {
    const stream = level === 'error' || level === 'fatal' ? process.stderr : process.stdout;
    // In test mode, suppress output unless DEBUG
    if (process.env.NODE_ENV === 'test' && !process.env.DEBUG) return;
    stream.write(line + '\n');
  }

  async _writeFile(line) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      if (today !== this._currentDate) {
        this._currentDate = today;
        this._currentFileSize = 0;
        this._currentFile = null;
      }

      if (!this._currentFile) {
        await fs.mkdir(this.logDir, { recursive: true });
        this._currentFile = path.join(this.logDir, `sentinel-${today}.log`);
        try {
          const stat = await fs.stat(this._currentFile);
          this._currentFileSize = stat.size;
        } catch {
          this._currentFileSize = 0;
        }
      }

      // Rotate if file is too large
      if (this._currentFileSize >= this.maxFileSize) {
        await this._rotateFile();
      }

      const data = line + '\n';
      await fs.appendFile(this._currentFile, data, 'utf-8');
      this._currentFileSize += Buffer.byteLength(data, 'utf-8');
    } catch {
      // File logging failures should never crash the process
    }
  }

  async _rotateFile() {
    if (!this._currentFile) return;

    const rotatedPath = `${this._currentFile}.${Date.now()}`;
    try {
      await fs.rename(this._currentFile, rotatedPath);
    } catch { return; }

    this._currentFile = null;
    this._currentFileSize = 0;

    // Prune old files beyond maxFiles
    try {
      const files = await fs.readdir(this.logDir);
      const logFiles = files
        .filter(f => f.startsWith('sentinel-') && f.includes('.log.'))
        .sort()
        .reverse();
      for (const old of logFiles.slice(this.maxFiles)) {
        await fs.unlink(path.join(this.logDir, old)).catch(() => {});
      }
    } catch { /* ignore */ }
  }

  // ── Public API ─────────────────────────────────────────────────────

  debug(message, meta) { this._log('debug', message, meta); }
  info(message, meta)  { this._log('info', message, meta); }
  warn(message, meta)  { this._log('warn', message, meta); }
  error(message, meta) { this._log('error', message, meta); }
  fatal(message, meta) { this._log('fatal', message, meta); }

  /**
   * Set minimum log level at runtime.
   */
  setLevel(level) {
    if (LOG_LEVELS[level] !== undefined) this.level = level;
  }

  /**
   * Flush pending file writes (useful before process exit).
   */
  async flush() {
    await this._writeQueue;
  }
}

// ── Singleton ────────────────────────────────────────────────────────

let _instance = null;

/**
 * Get or create the global structured logger singleton.
 * @param {object} [options] - Only used on first call
 * @returns {StructuredLogger}
 */
export function getLogger(options) {
  if (!_instance) {
    _instance = new StructuredLogger(options || {
      service: 'sentinel',
      logDir: process.env.SENTINEL_LOG_DIR || null,
    });
  }
  return _instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetLogger() {
  _instance = null;
}

export { StructuredLogger, LOG_LEVELS, generateRequestId, redactSensitive };
export default StructuredLogger;

/**
 * Logger — backward-compatible wrapper around StructuredLogger.
 *
 * Existing code that does `import { Logger } from './logger.js'` continues
 * to work unchanged. New code should prefer `getLogger()` from structuredLogger.js.
 */

import { getLogger, StructuredLogger } from './structuredLogger.js';

export class Logger {
  constructor(level = 'info') {
    this._structured = getLogger();
    this._structured.setLevel(level);
    this.level = level;
  }

  setLevel(level) {
    this.level = level;
    this._structured.setLevel(level);
  }

  debug(...args) { this._structured.debug(args.map(String).join(' ')); }
  info(...args)  { this._structured.info(args.map(String).join(' ')); }
  warn(...args)  { this._structured.warn(args.map(String).join(' ')); }
  error(...args) { this._structured.error(args.map(String).join(' ')); }
}

// Re-export for convenience
export { StructuredLogger, getLogger } from './structuredLogger.js';


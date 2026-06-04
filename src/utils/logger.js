export class Logger {
  constructor(level = 'info') {
    this.level = level;
    this.levels = { debug: 0, info: 1, warn: 2, error: 3 };
  }

  setLevel(level) { this.level = level; }

  debug(...args) { if (this.levels[this.level] <= 0) console.debug('[DEBUG]', ...args); }
  info(...args) { if (this.levels[this.level] <= 1) console.info('[INFO]', ...args); }
  warn(...args) { if (this.levels[this.level] <= 2) console.warn('[WARN]', ...args); }
  error(...args) { if (this.levels[this.level] <= 3) console.error('[ERROR]', ...args); }
}

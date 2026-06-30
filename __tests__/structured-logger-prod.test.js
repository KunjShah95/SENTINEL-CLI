/**
 * Tests for Structured Logger — JSON output, child loggers, redaction, file rotation.
 */
import path from 'node:path';
import fs from 'node:fs/promises';

const TEST_LOG_DIR = path.resolve('.sentinel/test-logs-' + Date.now());

beforeAll(async () => {
  await fs.mkdir(TEST_LOG_DIR, { recursive: true });
});

afterAll(async () => {
  try { await fs.rm(TEST_LOG_DIR, { recursive: true, force: true }); } catch {}
});

describe('StructuredLogger', () => {
  let StructuredLogger, getLogger, resetLogger, redactSensitive;

  beforeAll(async () => {
    const mod = await import('../src/utils/structuredLogger.js');
    StructuredLogger = mod.StructuredLogger;
    getLogger = mod.getLogger;
    resetLogger = mod.resetLogger;
    redactSensitive = mod.redactSensitive;
  });

  test('creates logger with default options', () => {
    const logger = new StructuredLogger();
    expect(logger.level).toBe('info');
    expect(logger.service).toBe('sentinel');
  });

  test('setLevel updates the minimum log level', () => {
    const logger = new StructuredLogger({ level: 'info' });
    logger.setLevel('debug');
    expect(logger.level).toBe('debug');
  });

  test('setLevel ignores invalid levels', () => {
    const logger = new StructuredLogger({ level: 'info' });
    logger.setLevel('invalid');
    expect(logger.level).toBe('info');
  });

  test('child logger inherits parent context', () => {
    const parent = new StructuredLogger({ baseContext: { service: 'api' } });
    const child = parent.child({ requestId: 'req_123' });
    expect(child.baseContext.service).toBe('api');
    expect(child.baseContext.requestId).toBe('req_123');
  });

  test('requestScope generates a unique requestId', () => {
    const logger = new StructuredLogger();
    const scoped = logger.requestScope({ userId: 'user1' });
    expect(scoped.baseContext.requestId).toMatch(/^req_/);
    expect(scoped.baseContext.userId).toBe('user1');
  });

  test('redactSensitive masks known sensitive fields', () => {
    const data = {
      username: 'john',
      password: 'super-secret-password',
      token: 'abc123def456ghi789',
      apiKey: 'sk-1234567890',
    };
    const redacted = redactSensitive(data);
    expect(redacted.username).toBe('john');
    expect(redacted.password).not.toBe('super-secret-password');
    expect(redacted.token).not.toBe('abc123def456ghi789');
    expect(redacted.apiKey).not.toBe('sk-1234567890');
  });

  test('redactSensitive handles nested objects', () => {
    const data = {
      config: {
        auth: {
          token: 'nested-secret-token'
        }
      }
    };
    const redacted = redactSensitive(data);
    expect(redacted.config.auth.token).not.toBe('nested-secret-token');
  });

  test('redactSensitive handles arrays', () => {
    const data = [{ password: 'pass1' }, { password: 'pass2' }];
    const redacted = redactSensitive(data);
    expect(redacted[0].password).not.toBe('pass1');
    expect(redacted[1].password).not.toBe('pass2');
  });

  test('redactSensitive handles null/undefined gracefully', () => {
    expect(redactSensitive(null)).toBeNull();
    expect(redactSensitive(undefined)).toBeUndefined();
    expect(redactSensitive('string')).toBe('string');
    expect(redactSensitive(42)).toBe(42);
  });

  test('getLogger returns singleton', () => {
    resetLogger();
    const a = getLogger({ service: 'test' });
    const b = getLogger();
    expect(a).toBe(b);
  });

  test('resetLogger clears the singleton', () => {
    resetLogger();
    const a = getLogger({ service: 'first' });
    resetLogger();
    const b = getLogger({ service: 'second' });
    expect(a).not.toBe(b);
  });

  test('logger writes to file when logDir is set', async () => {
    const logDir = path.join(TEST_LOG_DIR, 'file-test-' + Date.now());
    const logger = new StructuredLogger({ logDir, json: true });
    logger.info('test message', { key: 'value' });
    await logger.flush();

    // Give file system a moment
    await new Promise(r => setTimeout(r, 100));

    const files = await fs.readdir(logDir);
    const logFiles = files.filter(f => f.endsWith('.log'));
    expect(logFiles.length).toBeGreaterThan(0);

    const content = await fs.readFile(path.join(logDir, logFiles[0]), 'utf-8');
    expect(content).toContain('test message');
  });
});

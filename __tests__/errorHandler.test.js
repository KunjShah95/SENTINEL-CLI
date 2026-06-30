/**
 * Unit tests for errorHandler — error classes and ErrorHandler methods.
 *
 * Tests SentinelError subclasses, toJSON serialization, ErrorHandler
 * singleton methods: logError, handle, wrapAsync, tryExecute, registerHandler.
 *
 * Run with:
 *   node --test __tests__/errorHandler.test.js
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

let SentinelError, ValidationError, SecurityError, ConfigurationError, AnalyzerError;
let errorHandler, ErrorHandler;

before(async () => {
  const mod = await import('../src/utils/errorHandler.js');
  SentinelError = mod.SentinelError;
  ValidationError = mod.ValidationError;
  SecurityError = mod.SecurityError;
  ConfigurationError = mod.ConfigurationError;
  AnalyzerError = mod.AnalyzerError;
  errorHandler = mod.errorHandler;
  ErrorHandler = mod.ErrorHandler;
});

// ─── SentinelError ──────────────────────────────────────────────────────────

describe('SentinelError', () => {
  test('creates error with message, code, severity, context', () => {
    const err = new SentinelError('Something broke', 'TEST_ERR', 'high', { file: 'test.js' });
    assert.equal(err.message, 'Something broke');
    assert.equal(err.code, 'TEST_ERR');
    assert.equal(err.severity, 'high');
    assert.equal(err.context.file, 'test.js');
    assert.equal(err.name, 'SentinelError');
    assert.ok(err.timestamp);
    assert.ok(err.stack);
  });

  test('uses default severity and context', () => {
    const err = new SentinelError('test');
    assert.equal(err.severity, 'medium');
    assert.deepEqual(err.context, {});
    assert.equal(err.code, undefined);
  });

  test('toJSON returns structured error data', () => {
    const err = new SentinelError('Fail', 'ERR_1', 'critical', { id: 42 });
    const json = err.toJSON();
    assert.equal(json.name, 'SentinelError');
    assert.equal(json.message, 'Fail');
    assert.equal(json.code, 'ERR_1');
    assert.equal(json.severity, 'critical');
    assert.equal(json.context.id, 42);
    assert.ok(json.timestamp);
    assert.ok(json.stack);
  });
});

// ─── Error subclasses ───────────────────────────────────────────────────────

describe('ValidationError', () => {
  test('inherits from SentinelError', () => {
    const err = new ValidationError('Invalid input', { field: 'email' });
    assert.ok(err instanceof SentinelError);
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ValidationError');
    assert.equal(err.code, 'VALIDATION_ERROR');
    assert.equal(err.severity, 'low');
  });
});

describe('SecurityError', () => {
  test('inherits from SentinelError with critical severity', () => {
    const err = new SecurityError('SSRF detected', { hostname: 'evil.com' });
    assert.ok(err instanceof SentinelError);
    assert.equal(err.name, 'SecurityError');
    assert.equal(err.code, 'SECURITY_ERROR');
    assert.equal(err.severity, 'critical');
    assert.equal(err.context.hostname, 'evil.com');
  });
});

describe('ConfigurationError', () => {
  test('inherits from SentinelError with high severity', () => {
    const err = new ConfigurationError('Missing key', { key: 'GITHUB_TOKEN' });
    assert.equal(err.name, 'ConfigurationError');
    assert.equal(err.code, 'CONFIG_ERROR');
    assert.equal(err.severity, 'high');
  });
});

describe('AnalyzerError', () => {
  test('includes analyzer name in context', () => {
    const err = new AnalyzerError('Failed to analyze', 'security', { file: 'app.js' });
    assert.equal(err.name, 'AnalyzerError');
    assert.equal(err.code, 'ANALYZER_ERROR');
    assert.equal(err.severity, 'medium');
    assert.equal(err.context.analyzer, 'security');
    assert.equal(err.context.file, 'app.js');
  });
});

// ─── ErrorHandler.logError ──────────────────────────────────────────────────

describe('ErrorHandler.logError', () => {
  test('returns structured error data', async () => {
    const err = new SentinelError('Test log', 'TEST', 'low');
    const data = await errorHandler.logError(err);
    assert.equal(data.level, 'error');
    assert.equal(data.name, 'SentinelError');
    assert.equal(data.message, 'Test log');
    assert.equal(data.code, 'TEST');
    assert.equal(data.severity, 'low');
    assert.ok(data.timestamp);
    assert.ok(data.stack);
  });

  test('handles plain Error objects', async () => {
    const err = new Error('Plain error');
    const data = await errorHandler.logError(err);
    assert.equal(data.name, 'Error');
    assert.equal(data.message, 'Plain error');
    assert.equal(data.code, 'UNKNOWN_ERROR');
  });
});

// ─── ErrorHandler.handle ────────────────────────────────────────────────────

describe('ErrorHandler.handle', () => {
  test('converts plain Error to SentinelError', async () => {
    const data = await errorHandler.handle(new Error('Raw error'));
    assert.equal(data.name, 'SentinelError');
    assert.equal(data.code, 'UNKNOWN_ERROR');
    assert.equal(data.severity, 'medium');
  });

  test('preserves SentinelError properties', async () => {
    const err = new SecurityError('Real security issue', { important: true });
    const data = await errorHandler.handle(err);
    assert.equal(data.name, 'SecurityError');
    assert.equal(data.code, 'SECURITY_ERROR');
    assert.equal(data.severity, 'critical');
  });

  test('executes registered handlers', async () => {
    const calls = [];
    errorHandler.registerHandler((err, data) => {
      calls.push({ err: err.message, data: data.message });
    });

    await errorHandler.handle(new Error('Handler test'));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].err, 'Handler test');
  });
});

// ─── ErrorHandler.wrapAsync ─────────────────────────────────────────────────

describe('ErrorHandler.wrapAsync', () => {
  test('wraps function, propagates result on success', async () => {
    const wrapped = errorHandler.wrapAsync(async () => 'success');
    const result = await wrapped();
    assert.equal(result, 'success');
  });

  test('wraps function, handles error on failure', async () => {
    const wrapped = errorHandler.wrapAsync(async () => {
      throw new Error('Wrapped failure');
    });
    await assert.rejects(() => wrapped(), /Wrapped failure/);
  });
});

// ─── ErrorHandler.tryExecute ────────────────────────────────────────────────

describe('ErrorHandler.tryExecute', () => {
  test('returns function result on success', async () => {
    const result = await errorHandler.tryExecute(async () => 42);
    assert.equal(result, 42);
  });

  test('returns fallback on failure', async () => {
    const result = await errorHandler.tryExecute(async () => {
      throw new Error('Fail');
    }, 'fallback');
    assert.equal(result, 'fallback');
  });

  test('returns null fallback by default', async () => {
    const result = await errorHandler.tryExecute(async () => {
      throw new Error('Fail');
    });
    assert.equal(result, null);
  });
});

// ─── ErrorHandler constructor defaults ──────────────────────────────────────

describe('ErrorHandler defaults', () => {
  test('initializes with empty handlers and monitoring disabled', () => {
    const handler = new ErrorHandler();
    assert.deepEqual(handler.handlers, []);
    assert.equal(handler.monitoringEnabled, false);
  });

  test('registerHandler adds function', () => {
    const handler = new ErrorHandler();
    const fn = () => {};
    handler.registerHandler(fn);
    assert.equal(handler.handlers.length, 1);
    assert.equal(handler.handlers[0], fn);
  });

  test('registerHandler ignores non-function', () => {
    const handler = new ErrorHandler();
    handler.registerHandler('not-a-function');
    assert.equal(handler.handlers.length, 0);
  });

  test('enableMonitoring sets flag', () => {
    const handler = new ErrorHandler();
    handler.enableMonitoring({ sentryDsn: 'https://key@sentry.io/project' });
    assert.equal(handler.monitoringEnabled, true);
    assert.equal(handler.monitoringConfig.sentryDsn, 'https://key@sentry.io/project');
  });
});

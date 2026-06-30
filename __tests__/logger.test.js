import { jest } from '@jest/globals';
import { Logger } from '../src/utils/logger.js';
import { resetLogger } from '../src/utils/structuredLogger.js';

// The Logger is a thin wrapper over StructuredLogger, which writes to
// process.stdout / process.stderr (errors → stderr) and suppresses console
// output under NODE_ENV=test unless DEBUG is set. These tests capture the raw
// stream writes and assert on level + message, format-agnostic (JSON or human).
describe('Logger', () => {
  let logger;
  let stdout;
  let stderr;
  let prevDebug;

  beforeEach(() => {
    resetLogger(); // fresh structured-logger singleton per test
    prevDebug = process.env.DEBUG;
    process.env.DEBUG = '1'; // bypass test-mode console suppression
    stdout = [];
    stderr = [];
    jest.spyOn(process.stdout, 'write').mockImplementation((line) => { stdout.push(String(line)); return true; });
    jest.spyOn(process.stderr, 'write').mockImplementation((line) => { stderr.push(String(line)); return true; });
    logger = new Logger('info');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (prevDebug === undefined) delete process.env.DEBUG;
    else process.env.DEBUG = prevDebug;
    resetLogger();
  });

  it('should default to info level', () => {
    expect(logger.level).toBe('info');
  });

  it('should respect custom level', () => {
    const l = new Logger('debug');
    expect(l.level).toBe('debug');
  });

  it('should set level', () => {
    logger.setLevel('debug');
    expect(logger.level).toBe('debug');
  });

  it('should log info at info level (stdout)', () => {
    logger.info('test message');
    expect(stdout).toHaveLength(1);
    expect(stdout[0]).toContain('test message');
    expect(stdout[0].toLowerCase()).toContain('info');
  });

  it('should not log debug at info level', () => {
    logger.debug('should not appear');
    expect(stdout).toHaveLength(0);
  });

  it('should log debug at debug level', () => {
    logger.setLevel('debug');
    logger.debug('debug message');
    expect(stdout).toHaveLength(1);
    expect(stdout[0]).toContain('debug message');
  });

  it('should log error to stderr at any level', () => {
    logger.setLevel('error');
    logger.error('error message');
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).toContain('error message');
  });

  it('should not log info above level', () => {
    logger.setLevel('error');
    logger.info('should not appear');
    expect(stdout).toHaveLength(0);
  });

  it('should log warn at warn level', () => {
    logger.setLevel('warn');
    logger.warn('warning');
    expect(stdout).toHaveLength(1);
    expect(stdout[0]).toContain('warning');
  });

  it('should join multiple arguments into the message', () => {
    logger.info('prefix', { key: 'value' });
    expect(stdout).toHaveLength(1);
    expect(stdout[0]).toContain('prefix');
  });
});

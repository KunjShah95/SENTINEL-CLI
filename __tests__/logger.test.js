import { jest } from '@jest/globals';
import { Logger } from '../src/utils/logger.js';

describe('Logger', () => {
  let logger;
  let consoleOutput;

  beforeEach(() => {
    consoleOutput = [];
    jest.spyOn(console, 'debug').mockImplementation((...args) => { consoleOutput.push(['debug', ...args]); });
    jest.spyOn(console, 'info').mockImplementation((...args) => { consoleOutput.push(['info', ...args]); });
    jest.spyOn(console, 'warn').mockImplementation((...args) => { consoleOutput.push(['warn', ...args]); });
    jest.spyOn(console, 'error').mockImplementation((...args) => { consoleOutput.push(['error', ...args]); });
    logger = new Logger('info');
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  it('should log info at info level', () => {
    logger.info('test message');
    expect(consoleOutput).toHaveLength(1);
    expect(consoleOutput[0][0]).toBe('info');
    expect(consoleOutput[0][2]).toBe('test message');
  });

  it('should not log debug at info level', () => {
    logger.debug('should not appear');
    expect(consoleOutput).toHaveLength(0);
  });

  it('should log debug at debug level', () => {
    logger.setLevel('debug');
    logger.debug('debug message');
    expect(consoleOutput).toHaveLength(1);
    expect(consoleOutput[0][0]).toBe('debug');
  });

  it('should log error at any level', () => {
    logger.setLevel('error');
    logger.error('error message');
    expect(consoleOutput).toHaveLength(1);
    expect(consoleOutput[0][0]).toBe('error');
  });

  it('should not log info above level', () => {
    logger.setLevel('error');
    logger.info('should not appear');
    expect(consoleOutput).toHaveLength(0);
  });

  it('should log warn at warn level', () => {
    logger.setLevel('warn');
    logger.warn('warning');
    expect(consoleOutput).toHaveLength(1);
    expect(consoleOutput[0][0]).toBe('warn');
  });

  it('should handle multiple arguments', () => {
    logger.info('prefix', { key: 'value' });
    expect(consoleOutput[0][2]).toBe('prefix');
    expect(consoleOutput[0][3]).toEqual({ key: 'value' });
  });
});

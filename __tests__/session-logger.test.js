import { jest } from '@jest/globals';
import { SessionLogger, listSessionFiles, readSessionFile } from '../src/server/database/session-logger.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const SESSIONS_DIR = path.join(os.homedir(), '.sentinel', 'sessions');
const REPO_DIR = 'sentinel-test-sessions';

beforeEach(async () => {
  try {
    await fs.rm(path.join(SESSIONS_DIR, REPO_DIR), { recursive: true, force: true });
  } catch {
    // may not exist
  }
});

afterAll(async () => {
  try {
    await fs.rm(path.join(SESSIONS_DIR, REPO_DIR), { recursive: true, force: true });
  } catch {}
});

describe('SessionLogger', () => {
  test('writes session_start record', async () => {
    const logger = new SessionLogger({ repoPath: REPO_DIR, enabled: true });
    await logger.start('test-session-1');
    const records = await readSessionFile('test-session-1', REPO_DIR);
    expect(records.length).toBe(1);
    expect(records[0].type).toBe('session_start');
    expect(records[0].sessionId).toBe('test-session-1');
  });

  test('writes llm_request record', async () => {
    const logger = new SessionLogger({ repoPath: REPO_DIR, enabled: true });
    await logger.start('test-session-2');
    await logger.logLLMRequest({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{ name: 'read_file' }, { name: 'search_code' }],
      maxTokens: 4096,
    });
    const records = await readSessionFile('test-session-2', REPO_DIR);
    expect(records.length).toBe(2);
    expect(records[1].type).toBe('llm_request');
    expect(records[1].model).toBe('gpt-4');
    expect(records[1].tools).toEqual(['read_file', 'search_code']);
  });

  test('writes llm_response record', async () => {
    const logger = new SessionLogger({ repoPath: REPO_DIR, enabled: true });
    await logger.start('test-session-3');
    await logger.logLLMResponse({
      model: 'gpt-4',
      usage: { promptTokens: 50, completionTokens: 100 },
      finishReason: 'stop',
      duration: 1500,
    });
    const records = await readSessionFile('test-session-3', REPO_DIR);
    expect(records[1].type).toBe('llm_response');
    expect(records[1].usage.promptTokens).toBe(50);
  });

  test('writes llm_error record', async () => {
    const logger = new SessionLogger({ repoPath: REPO_DIR, enabled: true });
    await logger.start('test-session-4');
    await logger.logLLMError(new Error('API timeout'));
    const records = await readSessionFile('test-session-4', REPO_DIR);
    expect(records[1].type).toBe('llm_error');
    expect(records[1].error).toContain('API timeout');
  });

  test('writes tool_call record', async () => {
    const logger = new SessionLogger({ repoPath: REPO_DIR, enabled: true });
    await logger.start('test-session-5');
    await logger.logToolCall({ name: 'read_file', input: { path: 'src/index.js' }, duration: 200 });
    const records = await readSessionFile('test-session-5', REPO_DIR);
    expect(records[1].type).toBe('tool_call');
    expect(records[1].toolName).toBe('read_file');
    expect(records[1].success).toBe(true);
  });

  test('writes session_end record', async () => {
    const logger = new SessionLogger({ repoPath: REPO_DIR, enabled: true });
    await logger.start('test-session-6');
    await logger.end({ duration: 5000, totalMessages: 10, totalToolCalls: 5, totalErrors: 0 });
    const records = await readSessionFile('test-session-6', REPO_DIR);
    expect(records.length).toBe(2);
    expect(records[1].type).toBe('session_end');
    expect(records[1].totalMessages).toBe(10);
  });

  test('disabled logger does nothing', async () => {
    const logger = new SessionLogger({ repoPath: REPO_DIR, enabled: false });
    await logger.start('test-session-7');
    const records = await readSessionFile('test-session-7', REPO_DIR);
    expect(records.length).toBe(0);
  });

  test('listSessionFiles returns session list', async () => {
    const logger1 = new SessionLogger({ repoPath: REPO_DIR, enabled: true });
    await logger1.start('session-a');
    await logger1.end({});

    const logger2 = new SessionLogger({ repoPath: REPO_DIR, enabled: true });
    await logger2.start('session-b');
    await logger2.end({});

    const sessions = await listSessionFiles(REPO_DIR);
    expect(sessions.length).toBe(2);
    const ids = sessions.map(s => s.sessionId).sort();
    expect(ids).toEqual(['session-a', 'session-b']);
  });
});

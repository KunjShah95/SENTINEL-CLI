/**
 * Context budget utilities (src/agent/context.js) — pure functions shared
 * by the TUI compactor and the headless agent. These run without any
 * TypeScript build, so they are unit-tested directly.
 */
import {
  estimateTokens,
  getCompactionState,
  shouldCompact,
  formatTokenUsage,
  DEFAULT_MAX_TOKENS,
  microcompactMessages,
  MICROCOMPACT_TOMBSTONE,
} from '../src/agent/context.js';

describe('agent/context', () => {
  const makeMsg = (text, role = 'user') => ({
    id: 'test',
    role,
    parts: [{ type: 'text', text }],
    timestamp: Date.now(),
  });

  test('estimateTokens counts chars divided by 3.8', () => {
    const msgs = [makeMsg('hello world')];
    expect(estimateTokens(msgs)).toBe(Math.ceil('hello world'.length / 3.8));
  });

  test('estimateTokens handles tool-call parts', () => {
    const msgs = [{
      id: 't1',
      role: 'assistant',
      timestamp: Date.now(),
      parts: [{
        type: 'tool-call',
        toolName: 'readFile',
        toolCallId: '1',
        input: { path: 'test.txt' },
        state: 'pending',
      }],
    }];
    expect(estimateTokens(msgs)).toBeGreaterThan(0);
  });

  test('getCompactionState shows under threshold for few messages', () => {
    const msgs = [makeMsg('hello'), makeMsg('world', 'assistant')];
    const state = getCompactionState(msgs, { maxTokens: 40_000 });
    expect(state.atAsyncThreshold).toBe(false);
    expect(state.atSyncThreshold).toBe(false);
    expect(state.percentage).toBeLessThan(10);
  });

  test('getCompactionState shows async threshold for large messages', () => {
    const msgs = [makeMsg('x'.repeat(100_000))];
    expect(getCompactionState(msgs, { maxTokens: 40_000 }).atAsyncThreshold).toBe(true);
  });

  test('getCompactionState shows sync threshold for very large messages', () => {
    const msgs = [makeMsg('x'.repeat(200_000))];
    expect(getCompactionState(msgs, { maxTokens: 40_000 }).atSyncThreshold).toBe(true);
  });

  test('shouldCompact mirrors the async threshold', () => {
    expect(shouldCompact([makeMsg('hi')], { maxTokens: 40_000 })).toBe(false);
    expect(shouldCompact([makeMsg('x'.repeat(100_000))], { maxTokens: 40_000 })).toBe(true);
  });

  test('formatTokenUsage shows remaining tokens', () => {
    const formatted = formatTokenUsage([makeMsg('short')]);
    expect(formatted).toContain('tokens used');
    expect(formatted).toContain('remaining');
  });

  test('formatTokenUsage warns at sync threshold', () => {
    const formatted = formatTokenUsage([makeMsg('x'.repeat(200_000))], 40_000);
    expect(formatted).toContain(' over 80%');
  });

  test('DEFAULT_MAX_TOKENS is 40k', () => {
    expect(DEFAULT_MAX_TOKENS).toBe(40_000);
  });
});

describe('agent/context microcompact', () => {
  let idSeq = 0;
  const toolMsg = (toolName, input, { output = 'result', state = 'output-available', errorText } = {}) => ({
    id: `m${++idSeq}`,
    role: 'assistant',
    parts: [{
      type: 'tool-call',
      toolName,
      toolCallId: `c${idSeq}`,
      input,
      state,
      output,
      errorText,
    }],
    timestamp: Date.now(),
  });
  test('tombstones a superseded identical call, keeps the latest', () => {
    const first = toolMsg('readFile', { path: 'a.js' }, { output: 'x'.repeat(200) });
    const later = toolMsg('readFile', { path: 'a.js' }, { output: 'new contents' });
    const { messages, droppedCount, estimatedTokensSaved } = microcompactMessages([first, later]);
    expect(droppedCount).toBe(1);
    expect(messages[0].parts[0].output).toBe(MICROCOMPACT_TOMBSTONE);
    expect(messages[1].parts[0].output).toBe('new contents');
    expect(estimatedTokensSaved).toBeGreaterThan(0);
  });

  test('keeps calls with different inputs', () => {
    const a = toolMsg('readFile', { path: 'a.js' }, { output: 'a' });
    const b = toolMsg('readFile', { path: 'b.js' }, { output: 'b' });
    const { messages, droppedCount } = microcompactMessages([a, b]);
    expect(droppedCount).toBe(0);
    expect(messages[0]).toBe(a); // same reference: pure no-op
  });

  test('treats errored results as stale when the call was re-run', () => {
    const failed = toolMsg('bash', { command: 'npm test' }, { state: 'output-error', errorText: 'boom' });
    const passed = toolMsg('bash', { command: 'npm test' }, { output: 'all green' });
    const { messages, droppedCount } = microcompactMessages([failed, passed]);
    expect(droppedCount).toBe(1);
    expect(messages[0].parts[0].output).toBe(MICROCOMPACT_TOMBSTONE);
    expect(messages[0].parts[0].errorText).toBeUndefined();
  });

  test('protectLast leaves the tail untouched', () => {
    const first = toolMsg('readFile', { path: 'a.js' }, { output: 'old' });
    const later = toolMsg('readFile', { path: 'a.js' }, { output: 'new' });
    const { droppedCount, messages } = microcompactMessages([first, later], { protectLast: 2 });
    expect(droppedCount).toBe(0);
    expect(messages[0].parts[0].output).toBe('old');
  });

  test('is copy-on-write: input messages are never mutated', () => {
    const first = toolMsg('readFile', { path: 'a.js' }, { output: 'old' });
    const later = toolMsg('readFile', { path: 'a.js' }, { output: 'new' });
    const snapshot = JSON.parse(JSON.stringify([first, later]));
    microcompactMessages([first, later]);
    expect(JSON.parse(JSON.stringify([first, later]))).toEqual(snapshot);
  });

  test('pending tool calls are never dropped', () => {
    const pending = toolMsg('readFile', { path: 'a.js' }, { state: 'pending', output: undefined });
    const done = toolMsg('readFile', { path: 'a.js' }, { output: 'done' });
    const { droppedCount, messages } = microcompactMessages([pending, done]);
    expect(droppedCount).toBe(0);
    expect(messages[0].parts[0].state).toBe('pending');
  });

  test('three identical calls keep only the newest', () => {
    const a = toolMsg('grep', { pattern: 'x' }, { output: '1'.repeat(100) });
    const b = toolMsg('grep', { pattern: 'x' }, { output: '2'.repeat(100) });
    const c = toolMsg('grep', { pattern: 'x' }, { output: '3'.repeat(100) });
    const { messages, droppedCount } = microcompactMessages([a, b, c]);
    expect(droppedCount).toBe(2);
    expect(messages[2].parts[0].output).toBe('3'.repeat(100));
    expect(messages[0].parts[0].output).toBe(MICROCOMPACT_TOMBSTONE);
    expect(messages[1].parts[0].output).toBe(MICROCOMPACT_TOMBSTONE);
  });
});

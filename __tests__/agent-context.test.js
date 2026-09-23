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

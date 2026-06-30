import { getCompactionState, estimateTokens, formatTokenUsage } from '../src/tui/lib/context-compactor.js';

describe('ContextCompactor', () => {
  function makeMsg(text, role = 'user') {
    return { id: 'test', role, parts: [{ type: 'text', text }], timestamp: Date.now() };
  }

  test('estimateTokens counts chars divided by 3.8', () => {
    const msgs = [makeMsg('hello world')];
    const tokens = estimateTokens(msgs);
    expect(tokens).toBe(Math.ceil('hello world'.length / 3.8));
  });

  test('estimateTokens handles tool-call parts', () => {
    const msgs = [{
      id: 't1', role: 'assistant', timestamp: Date.now(),
      parts: [{ type: 'tool-call', toolName: 'read_file', toolCallId: '1', input: { path: 'test.txt' }, state: 'pending' }],
    }];
    const tokens = estimateTokens(msgs);
    expect(tokens).toBeGreaterThan(0);
  });

  test('getCompactionState shows under threshold for few messages', () => {
    const msgs = [makeMsg('hello'), makeMsg('world', 'assistant')];
    const state = getCompactionState(msgs, { maxTokens: 40_000 });
    expect(state.atAsyncThreshold).toBe(false);
    expect(state.atSyncThreshold).toBe(false);
    expect(state.percentage).toBeLessThan(10);
  });

  test('getCompactionState shows async threshold for large messages', () => {
    const bigText = 'x'.repeat(100_000);
    const msgs = [makeMsg(bigText)];
    const state = getCompactionState(msgs, { maxTokens: 40_000 });
    expect(state.atAsyncThreshold).toBe(true);
  });

  test('getCompactionState shows sync threshold for very large messages', () => {
    const bigText = 'x'.repeat(200_000);
    const msgs = [makeMsg(bigText)];
    const state = getCompactionState(msgs, { maxTokens: 40_000 });
    expect(state.atSyncThreshold).toBe(true);
  });

  test('formatTokenUsage shows remaining tokens', () => {
    const msgs = [makeMsg('short')];
    const formatted = formatTokenUsage(msgs);
    expect(formatted).toContain('tokens used');
    expect(formatted).toContain('remaining');
  });

  test('formatTokenUsage warns at sync threshold', () => {
    const bigText = 'x'.repeat(200_000);
    const msgs = [makeMsg(bigText)];
    const formatted = formatTokenUsage(msgs, 40_000);
    expect(formatted).toContain('OVER 80%');
  });
});

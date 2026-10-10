/**
 * failover — a chain must move on for the failures it can fix and stop for the
 * ones it cannot.
 *
 * The classification is the behaviour. A chain that retried everything would
 * triple the latency of a malformed request; a chain that retried nothing would
 * be decorative. Both mistakes are silent, so they are pinned here.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  REASON,
  classifyFailure,
  isRetryable,
  streamWithFailover,
} from '../src/agent/failover.js';

const primary = { modelId: 'gpt-6-luna', provider: 'openai' };
const fallback = { modelId: 'claude-haiku-4-5', provider: 'anthropic' };
const last = { modelId: 'ollama/qwen3:8b', provider: 'ollama' };

/** Build a stream factory whose first attempt fails and later ones succeed. */
function scripted(...scripts) {
  const calls = [];
  const stream = (attempt) => {
    calls.push(attempt.modelId);
    const script = scripts.shift() || [{ type: 'text', text: 'ok' }];
    return (async function* gen() {
      for (const ev of script) yield ev;
    })();
  };
  return { stream, calls };
}

async function collect(iterable) {
  const out = [];
  for await (const ev of iterable) out.push(ev);
  return out;
}

describe('failure classification', () => {
  it('tells a recoverable provider failure from a rejected request', () => {
    assert.equal(classifyFailure({ status: 429 }), REASON.RATE_LIMITED);
    assert.equal(classifyFailure({ status: 402 }), REASON.OUT_OF_CREDIT);
    assert.equal(classifyFailure({ status: 500 }), REASON.SERVER_ERROR);
    assert.equal(classifyFailure({ status: 503 }), REASON.SERVER_ERROR);
    assert.equal(classifyFailure({ status: 401 }), REASON.AUTH);
    assert.equal(classifyFailure({ status: 404 }), REASON.UNSUPPORTED);
    assert.equal(classifyFailure({ status: 400 }), REASON.REJECTED);
  });

  it('a thrown error with no status is a transport failure', () => {
    assert.equal(classifyFailure(new TypeError('fetch failed')), REASON.NETWORK);
  });

  it('a cancelled turn never fails over', () => {
    assert.equal(classifyFailure({ message: 'The operation was aborted' }), REASON.ABORTED);
    assert.equal(isRetryable(REASON.ABORTED), false);
  });

  it('a rejected request stops the chain', () => {
    // A malformed request fails identically on every model. Retrying it three
    // times only triples the latency of an error the user has to fix.
    assert.equal(isRetryable(REASON.REJECTED), false);
    assert.equal(isRetryable(REASON.RATE_LIMITED), true);
    assert.equal(isRetryable(REASON.OUT_OF_CREDIT), true);
    assert.equal(isRetryable(REASON.AUTH), true);
  });
});

describe('streamWithFailover', () => {
  it('uses the primary when nothing fails', async () => {
    const { stream, calls } = scripted([{ type: 'text', text: 'hello' }]);
    const events = await collect(streamWithFailover({ model: primary, chain: [fallback], stream }));
    assert.deepEqual(calls, ['gpt-6-luna'], 'no fallback was attempted');
    assert.deepEqual(events, [{ type: 'text', text: 'hello' }]);
  });

  it('walks the chain on a rate limit and says so', async () => {
    const { stream, calls } = scripted(
      [{ type: 'error', status: 429, message: 'rate limited' }],
      [{ type: 'text', text: 'from fallback' }]
    );
    const events = await collect(streamWithFailover({ model: primary, chain: [fallback], stream }));
    assert.deepEqual(calls, ['gpt-6-luna', 'claude-haiku-4-5']);
    const failoverEvent = events.find((e) => e.type === 'failover');
    assert.ok(failoverEvent, 'a failover event was emitted');
    assert.equal(failoverEvent.reason, REASON.RATE_LIMITED);
    assert.equal(failoverEvent.from, 'gpt-6-luna');
    assert.equal(failoverEvent.to, 'claude-haiku-4-5');
    assert.match(failoverEvent.message, /rate limited/);
    assert.ok(events.some((e) => e.text === 'from fallback'), 'the fallback answer survives');
  });

  it('walks two hops when the first fallback also fails', async () => {
    const { stream, calls } = scripted(
      [{ type: 'error', status: 402, message: 'no credit' }],
      [{ type: 'error', status: 500, message: 'server error' }],
      [{ type: 'text', text: 'third' }]
    );
    const events = await collect(streamWithFailover({ model: primary, chain: [fallback, last], stream }));
    assert.deepEqual(calls, ['gpt-6-luna', 'claude-haiku-4-5', 'ollama/qwen3:8b']);
    assert.equal(events.filter((e) => e.type === 'failover').length, 2);
  });

  it('stops on a rejected request instead of burning the chain', async () => {
    const { stream, calls } = scripted([{ type: 'error', status: 400, message: 'bad request' }]);
    const events = await collect(streamWithFailover({ model: primary, chain: [fallback, last], stream }));
    assert.deepEqual(calls, ['gpt-6-luna'], 'no other model was tried');
    const err = events.find((e) => e.type === 'error');
    assert.ok(err, 'the error reached the caller');
    assert.equal(err.failoverExhausted, false, 'nothing was tried, so nothing was exhausted');
  });

  it('does not replay text the user has already seen', async () => {
    // Failing over mid-stream would duplicate visible output on screen, which
    // is worse than showing the error.
    const { stream, calls } = scripted(
      [{ type: 'text', text: 'partial ' }, { type: 'error', status: 429, message: 'rate limited' }],
      [{ type: 'text', text: 'replacement' }]
    );
    const events = await collect(streamWithFailover({ model: primary, chain: [fallback], stream }));
    assert.deepEqual(calls, ['gpt-6-luna'], 'no retry after partial output');
    assert.equal(events.filter((e) => e.type === 'failover').length, 0);
    assert.ok(events.some((e) => e.text === 'partial '), 'partial output is preserved');
  });

  it('does not retry after a tool call has been emitted', async () => {
    const { stream, calls } = scripted(
      [{ type: 'tool_call', id: '1', name: 'read_file', input: {} }, { type: 'error', status: 500 }],
      [{ type: 'text', text: 'second attempt' }]
    );
    await collect(streamWithFailover({ model: primary, chain: [fallback], stream }));
    assert.deepEqual(calls, ['gpt-6-luna']);
  });

  it('surfaces the final error once the chain is exhausted', async () => {
    const { stream } = scripted(
      [{ type: 'error', status: 429, message: 'one' }],
      [{ type: 'error', status: 429, message: 'two' }]
    );
    const events = await collect(streamWithFailover({ model: primary, chain: [fallback], stream }));
    const errors = events.filter((e) => e.type === 'error');
    assert.equal(errors.length, 1, 'exactly one terminal error');
    assert.equal(errors[0].message, 'two', 'the last failure is the one reported');
    assert.equal(errors[0].failoverExhausted, true, 'flagged so the UI can say why');
  });

  it('reports a switch to the caller exactly once', async () => {
    const { stream } = scripted(
      [{ type: 'error', status: 429, message: 'rate limited' }],
      [{ type: 'text', text: 'ok' }]
    );
    const seen = [];
    await collect(streamWithFailover({
      model: primary,
      chain: [fallback],
      stream,
      onFailover: (info) => seen.push(info),
    }));
    assert.equal(seen.length, 1);
    assert.equal(seen[0].to.modelId, 'claude-haiku-4-5');
    assert.equal(seen[0].reason, REASON.RATE_LIMITED);
  });

  it('works with no chain at all', async () => {
    const { stream } = scripted([{ type: 'text', text: 'solo' }]);
    const events = await collect(streamWithFailover({ model: primary, stream }));
    assert.deepEqual(events, [{ type: 'text', text: 'solo' }]);
  });
});
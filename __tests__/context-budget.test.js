/**
 * context-budget — progressive in-turn compaction.
 *
 * `loop.js` used to bound request growth with a single cliff at 200k chars.
 * This covers the stage that runs before it: giving up context in the order that
 * costs least, and only as far as pressure demands.
 *
 * The assertions are about ORDER and LOSS, not just that the array shrank — a
 * compactor that reclaims tokens by deleting the file the model is reasoning
 * about passes a size test and fails the turn.
 *
 * Run with: node --test __tests__/context-budget.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compactToolResults,
  contextPressure,
  recoveryHint,
  RESULT_HEAD_CHARS,
  RESULT_KEEP_CHARS,
  DEFAULT_PROTECT_LAST,
} from '../src/agent/context-budget.js';

/** One assistant call + its tool result, as the loop builds it. */
function call(id, name, args, content) {
  return [
    {
      role: 'assistant',
      content: '',
      tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
    },
    { role: 'tool', tool_call_id: id, content },
  ];
}

const big = (n = 9000) => 'x'.repeat(n);

describe('compactToolResults', () => {
  it('does nothing below the start ratio', () => {
    const messages = [
      { role: 'user', content: 'do the thing' },
      ...call('c1', 'readFile', { path: 'a.js' }, big(5000)),
    ];
    const r = compactToolResults(messages, { budget: 200_000 });
    assert.equal(r.applied, false);
    assert.equal(r.messages, messages, 'returns the same array reference when idle');
  });

  it('drops the older of two identical calls and keeps the newer one verbatim', () => {
    const messages = [
      { role: 'user', content: 'go' },
      ...call('c1', 'readFile', { path: 'a.js' }, 'FIRST-VALUE'),
      { role: 'user', content: 'again' },
      ...call('c2', 'readFile', { path: 'a.js' }, 'SECOND-VALUE'),
    ];
    // Force compaction past the start ratio with one huge unrelated result.
    messages.push(...call('c3', 'bash', { command: 'ls' }, big(400_000)));

    const r = compactToolResults(messages, { budget: 200_000 });
    assert.ok(r.superseded >= 1, 'an older duplicate was dropped');
    assert.ok(!String(r.messages[2].content).includes('FIRST-VALUE'), 'older result gone');
    assert.equal(r.messages[5].content, 'SECOND-VALUE', 'newest result intact');
  });

  it('supersedes losslessly even when the duplicate sits in the active zone', () => {
    // The active zone protects against *lossy* compaction. Superseding is not
    // lossy — the newer identical result carries everything the older one did —
    // so it is allowed there too. This is the case that regressed when stage 1
    // shared the protection gate of stages 2 and 3: with the bulk of a long turn
    // sitting in the tail, nothing compacted at all.
    const messages = [
      { role: 'user', content: 'go' },
      ...call('c1', 'readFile', { path: 'a.js' }, big(120_000)),
      ...call('c2', 'readFile', { path: 'a.js' }, big(120_000)),
    ];
    const r = compactToolResults(messages, { budget: 200_000, protectLast: DEFAULT_PROTECT_LAST });
    assert.equal(r.superseded, 1, 'the older of the two identical reads was dropped');
    assert.ok(
      String(r.messages[2].content).length < 120_000,
      'the older result shrank to a notice'
    );
  });

  it('treats key order as irrelevant when deciding two calls are the same', () => {
    const messages = [
      { role: 'user', content: 'go' },
      ...call('c1', 'grep', { pattern: 'x', path: '.' }, 'OLD'),
      { role: 'user', content: 'again' },
      ...call('c2', 'grep', { path: '.', pattern: 'x' }, 'NEW'),
      ...call('c3', 'bash', { command: 'ls' }, big(400_000)),
    ];
    const r = compactToolResults(messages, { budget: 200_000 });
    assert.ok(r.superseded >= 1, 'reordered keys are still the same call');
  });

  it('keeps results under the keep threshold untouched even under pressure', () => {
    const small = 'a'.repeat(RESULT_KEEP_CHARS - 500);
    const messages = [
      { role: 'user', content: 'go' },
      ...call('c1', 'readFile', { path: 'a.js' }, small),
      ...call('c2', 'bash', { command: 'ls' }, big(400_000)),
    ];
    // protectLast: 0 so the small result is genuinely in the candidate region —
    // with the default tail it would sit in the active zone and the assertion
    // would pass without exercising the threshold at all.
    const r = compactToolResults(messages, { budget: 200_000, protectLast: 0 });
    assert.equal(r.messages[2].content, small, 'small result is never shrunk');
  });

  it('never touches the protected tail', () => {
    // Enough history that the last PAIR sits in the tail while older results are
    // not. With only one pair, `protectLast: 6` would protect everything and the
    // assertion would hold without the active zone doing any work.
    const messages = [{ role: 'user', content: 'go' }];
    for (let i = 0; i < 4; i++) {
      messages.push(...call(`old${i}`, 'readFile', { path: `f${i}.js` }, big(400_000)));
    }
    const fresh = big(9000);
    messages.push(...call('fresh', 'readFile', { path: 'current.js' }, fresh));

    const r = compactToolResults(messages, { budget: 1000, protectLast: DEFAULT_PROTECT_LAST });
    assert.equal(r.messages.at(-1).content, fresh, 'active-zone result is byte-identical');
    assert.ok(r.applied, 'older results were still compacted');
  });

  it('gives up bulk before content: a shrunken result keeps its head', () => {
    const body = 'HEADMARKER' + big(300_000);
    const messages = [
      { role: 'user', content: 'go' },
      ...call('c1', 'readFile', { path: 'big.js' }, body),
      ...call('c2', 'bash', { command: 'x' }, big(300_000)),
    ];
    const r = compactToolResults(messages, { budget: 200_000, protectLast: 0 });
    const first = String(r.messages[2].content);
    assert.ok(r.shrunk >= 1, 'shrinking happened before any tombstone');
    assert.ok(first.startsWith('HEADMARKER'), 'head survives');
    assert.ok(first.length < body.length, 'but the body is gone');
  });

  it('writes a recovery hint the model can actually act on', () => {
    const messages = [
      { role: 'user', content: 'go' },
      ...call('c1', 'readFile', { path: 'big.js', offset: 0, limit: 5000 }, big(300_000)),
      ...call('c2', 'bash', { command: 'x' }, big(300_000)),
    ];
    const r = compactToolResults(messages, { budget: 200_000, protectLast: 0 });
    const content = String(r.messages[2].content);
    assert.match(content, /recover with readFile/);
    // The hint must name a call that starts past the head it kept, or the model
    // re-reads the same bytes and calls it a day.
    assert.match(content, new RegExp(`offset: ${RESULT_HEAD_CHARS}`));
  });

  it('does not fabricate a recovery hint for an offsetless read', () => {
    const messages = [
      { role: 'user', content: 'go' },
      ...call('c1', 'readFile', { path: 'big.js' }, big(300_000)),
      ...call('c2', 'bash', { command: 'x' }, big(300_000)),
    ];
    const r = compactToolResults(messages, { budget: 200_000, protectLast: 0 });
    assert.doesNotMatch(String(r.messages[2].content), /recover with readFile/);
    assert.match(String(r.messages[2].content), /re-run this call/);
  });

  it('never mutates its input', () => {
    const messages = [
      { role: 'user', content: 'go' },
      ...call('c1', 'readFile', { path: 'a.js' }, big(300_000)),
      ...call('c2', 'bash', { command: 'x' }, big(300_000)),
    ];
    const before = JSON.stringify(messages);
    compactToolResults(messages, { budget: 200_000, protectLast: 0 });
    assert.equal(JSON.stringify(messages), before);
  });

  it('leaves untouched messages identical by reference', () => {
    const messages = [
      { role: 'user', content: 'go' },
      ...call('c1', 'readFile', { path: 'a.js' }, big(300_000)),
      ...call('c2', 'bash', { command: 'x' }, big(300_000)),
    ];
    const r = compactToolResults(messages, { budget: 200_000, protectLast: 0 });
    assert.equal(r.messages[0], messages[0], 'unchanged message keeps identity');
  });

  it('always returns a legal request under the budget', () => {
    const messages = [{ role: 'user', content: 'go' }];
    for (let i = 0; i < 40; i++) {
      messages.push(...call(`c${i}`, 'readFile', { path: `f${i}.js` }, big(9000)));
    }
    const r = compactToolResults(messages, { budget: 50_000, protectLast: 2 });
    const after = contextPressure(r.messages, 50_000);
    // Stage 3 targets the budget; allow the protected tail's own size.
    assert.ok(after.total < 50_000 + 40_000, `got under budget: ${after.total}`);
  });

  it('handles a tool result whose originating call is unknown', () => {
    const messages = [
      { role: 'user', content: 'go' },
      { role: 'tool', tool_call_id: 'orphan', content: big(300_000) },
      ...call('c2', 'bash', { command: 'x' }, big(300_000)),
    ];
    const r = compactToolResults(messages, { budget: 200_000, protectLast: 0 });
    assert.ok(r.shrunk + r.elided >= 1, 'orphan still compacted by size');
    assert.ok(String(r.messages[1].content).length < 300_000);
  });

  it('is empty-safe', () => {
    assert.equal(compactToolResults([]).applied, false);
    assert.equal(compactToolResults(null).applied, false);
    assert.equal(compactToolResults(undefined).applied, false);
  });
});

describe('recoveryHint', () => {
  it('resumes past the kept head', () => {
    const hint = recoveryHint('readFile', { path: 'a.js', offset: 0, limit: 900 });
    assert.match(hint, /offset: 1200/);
  });

  it('offsets from a non-zero start', () => {
    const hint = recoveryHint('readFile', { path: 'a.js', offset: 500, limit: 900 });
    assert.match(hint, /offset: 1700/);
  });

  it('is null for a tool with no windowed read', () => {
    assert.equal(recoveryHint('bash', { command: 'ls' }), null);
    assert.equal(recoveryHint('readFile', { path: 'a.js' }), null);
    assert.equal(recoveryHint('readFile', null), null);
  });
});

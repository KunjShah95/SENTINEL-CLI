/**
 * The review body PR Owl posts.
 *
 * This file used to also test `extractJson` and `validateFindings` — 150 lines
 * covering code that had been moved to Sentinel and re-exported here. Those
 * tests now live in `__tests__/review.test.js`, next to the implementation, and
 * keeping a second copy meant a change to the drop rules could pass one suite
 * and fail the other with no way to tell which was authoritative.
 *
 * What is left is genuinely PR Owl's: how a review is rendered as a GitHub
 * comment, which is a transport concern and does not belong in Sentinel.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summarise, type Finding } from '../lib/review';

const finding = (severity: Finding['severity']): Finding => ({
  path: 'src/app.js',
  line: 2,
  side: 'RIGHT',
  severity,
  message: 'the retry loop is unbounded',
});

describe('summarise', () => {
  it('counts severities', () => {
    const body = summarise('All good.', [
      finding('critical'),
      finding('critical'),
      finding('nit'),
    ]);
    assert.match(body, /2 critical, 0 warning, 1 nit/);
  });

  it('says so plainly when there is nothing', () => {
    assert.match(summarise('x', []), /No defects found/);
  });

  it('does not post the raw JSON as the review body', () => {
    // The single most common way a generated reviewer looks broken: the review
    // body is the payload it was asked to produce.
    const raw = '{"findings":[{"path":"a.js","line":1,"message":"x"}]}';
    const body = summarise(raw, []);
    assert.ok(!body.includes('"findings"'), `body leaked the payload: ${body}`);
  });

  it('keeps the prose the model wrote', () => {
    const body = summarise('The retry loop looks unbounded.', []);
    assert.match(body, /retry loop looks unbounded/);
  });

  it('stays inside the size GitHub accepts', () => {
    // A body over the limit is rejected by the API, so the review that cost
    // money is thrown away at the last step. Clamping is the right failure.
    const body = summarise('x'.repeat(200_000), []);
    assert.ok(body.length <= 65_000, `body was ${body.length} chars`);
  });
});

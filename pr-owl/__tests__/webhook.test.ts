/**
 * Webhook signature verification.
 *
 * The three failure modes named in `lib/webhook.ts` each get a test, because
 * each has shipped a real vulnerability:
 *
 *   1. verifying a re-serialised body
 *   2. comparing digests with `===`
 *   3. the trivial `for` loop over all actions, which reviews a PR every time
 *      someone fixes a typo in the description
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifySignature, shouldReview, isFromFork, exceedsDiffCap, SIGNATURE_HEADER } from '../lib/webhook';

const SECRET = 'whsec_test_secret';

function sign(body: string, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

const BODY = JSON.stringify({ action: 'opened', number: 7, nested: { a: 1 }, unicode: 'café — naïve' });

describe('verifySignature', () => {
  it('accepts a correctly signed raw body', () => {
    assert.deepEqual(verifySignature(BODY, sign(BODY), SECRET), { ok: true });
  });

  it('reads the header name GitHub actually sends', () => {
    assert.equal(SIGNATURE_HEADER, 'x-hub-signature-256');
  });

  it('rejects a body signed with a different secret', () => {
    assert.deepEqual(verifySignature(BODY, sign(BODY, 'whsec_other'), SECRET), {
      ok: false,
      reason: 'mismatch',
    });
  });

  it('rejects a tampered body', () => {
    const signature = sign(BODY);
    const tampered = BODY.replace('"number":7', '"number":8');
    assert.equal(verifySignature(tampered, signature, SECRET).ok, false);
  });

  it('fails on a body that was parsed and re-serialised', () => {
    // The bug this guards against. `JSON.parse` then `JSON.stringify` reorders
    // nothing here, but a pretty-printer or a key-sorting helper absolutely
    // does, and then a legitimately signed delivery is rejected — or, once
    // someone "fixes" it by normalising both sides, an attacker's payload is
    // accepted in a form the attacker chose.
    const reparsed = JSON.stringify(JSON.parse(BODY));
    assert.equal(reparsed, BODY, 'this fixture round-trips, so use the real mutation below');

    const pretty = JSON.stringify(JSON.parse(BODY), null, 2);
    assert.equal(verifySignature(pretty, sign(BODY), SECRET).ok, false);
  });

  it('rejects a signature that is not sha256-prefixed', () => {
    assert.deepEqual(verifySignature(BODY, createHmac('sha1', SECRET).update(BODY).digest('hex'), SECRET), {
      ok: false,
      reason: 'malformed-signature',
    });
  });

  it('reports a missing signature distinctly from a wrong one', () => {
    assert.deepEqual(verifySignature(BODY, null, SECRET), { ok: false, reason: 'missing-signature' });
    assert.deepEqual(verifySignature(BODY, '', SECRET), { ok: false, reason: 'missing-signature' });
  });

  it('treats a truncated digest as a mismatch, not a crash', () => {
    // timingSafeEqual throws on unequal lengths. A padded or truncated
    // signature must be a 401, not a 500.
    const short = sign(BODY).slice(0, -4);
    assert.deepEqual(verifySignature(BODY, short, SECRET), { ok: false, reason: 'mismatch' });
    const long = `${sign(BODY)}0`;
    assert.deepEqual(verifySignature(BODY, long, SECRET), { ok: false, reason: 'mismatch' });
  });

  it('refuses to verify anything when no secret is configured', () => {
    // Failing closed: an app that starts without its secret must not accept
    // deliveries just because it cannot check them.
    assert.deepEqual(verifySignature(BODY, sign(BODY), ''), { ok: false, reason: 'no-secret' });
    assert.deepEqual(verifySignature(BODY, sign(BODY), null), { ok: false, reason: 'no-secret' });
  });

  it('handles a unicode body byte-for-byte', () => {
    // HMAC is over bytes. A body that round-tripped through a UTF-16 string or
    // through re-encoding would produce a different digest.
    assert.equal(verifySignature(BODY, sign(BODY), SECRET).ok, true);
  });
});

describe('shouldReview', () => {
  it('reviews a PR that was opened', () => {
    assert.equal(shouldReview('pull_request', 'opened'), true);
  });

  it('reviews a push to the branch', () => {
    assert.equal(shouldReview('pull_request', 'synchronize'), true);
  });

  it('ignores a PR that was closed', () => {
    // Reviewing a closed PR costs a model call to say nothing useful.
    assert.equal(shouldReview('pull_request', 'closed'), false);
  });

  it('ignores an edited description', () => {
    // The expensive no-op: someone fixes a typo and the reviewer runs again.
    assert.equal(shouldReview('pull_request', 'edited'), false);
  });

  it('ignores events that are not pull requests', () => {
    for (const event of ['push', 'issues', 'check_suite', 'ping', 'star']) {
      assert.equal(shouldReview(event, 'opened'), false, event);
    }
  });

  it('ignores an unknown action rather than defaulting to review', () => {
    assert.equal(shouldReview('pull_request', 'labeled'), false);
    assert.equal(shouldReview('pull_request', undefined), false);
    assert.equal(shouldReview(null, 'opened'), false);
  });
});

describe('isFromFork', () => {
  it('treats a matching head repo as same-repo', () => {
    assert.equal(isFromFork('acme/api', 'acme/api'), false);
  });

  it('treats a different head repo as a fork', () => {
    assert.equal(isFromFork('acme/api', 'someone/api'), true);
  });

  it('treats a deleted head repo as a fork', () => {
    // A fork whose head repository has been deleted leaves `head.repo` null.
    // Defaulting to "not a fork" would grant full access to a stranger's commit.
    assert.equal(isFromFork('acme/api', null), true);
    assert.equal(isFromFork('acme/api', undefined), true);
  });
});

describe('exceedsDiffCap', () => {
  it('caps on the total of additions and deletions', () => {
    assert.equal(exceedsDiffCap(400, 400, 800), false);
    assert.equal(exceedsDiffCap(401, 400, 800), true);
  });

  it('treats the cap as inclusive', () => {
    assert.equal(exceedsDiffCap(500, 300, 800), false, 'exactly at the cap is allowed');
    assert.equal(exceedsDiffCap(501, 300, 800), true);
  });
});

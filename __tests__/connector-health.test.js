/**
 * connector health — the distinction that makes this worth having.
 *
 * "Do I have a key" and "will my next turn work" are different questions. A key
 * can be set and expired, revoked, or quota-blocked. Reporting green for a
 * dead connector is worse than reporting nothing, because it is believed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEALTH,
  adviceFor,
  classifyStatus,
  healthiestFirst,
  summarize,
} from '../src/shared/connectors/health.js';

describe('health classification', () => {
  it('separates an expired key from an exhausted quota', () => {
    // The whole reason this module exists. Both fail the turn, and they are
    // fixed by opposite things: re-auth vs buy more quota. Collapsing them
    // into "provider error" is why provider outages take so long to diagnose.
    assert.equal(classifyStatus(401), HEALTH.UNAUTHORIZED);
    assert.equal(classifyStatus(403), HEALTH.UNAUTHORIZED);
    assert.equal(classifyStatus(402), HEALTH.QUOTA);
    assert.equal(classifyStatus(429), HEALTH.QUOTA);
  });

  it('tells a wrong endpoint from a provider outage', () => {
    assert.equal(classifyStatus(404), HEALTH.UNSUPPORTED);
    assert.equal(classifyStatus(500), HEALTH.ERROR);
    assert.equal(classifyStatus(503), HEALTH.ERROR);
    assert.equal(classifyStatus(200), HEALTH.OK);
  });

  it('advises the fix that matches the state', () => {
    assert.match(adviceFor(HEALTH.UNAUTHORIZED), /auth login/, 'a bad key needs re-auth');
    assert.match(adviceFor(HEALTH.QUOTA), /quota/, 'quota needs quota, not re-auth');
    assert.doesNotMatch(adviceFor(HEALTH.QUOTA), /auth login/,
      'telling someone to re-auth a working key sends them down the wrong path');
    assert.match(adviceFor(HEALTH.ABSENT), /auth login/);
    assert.match(adviceFor(HEALTH.UNREACHABLE), /network|VPN|proxy/i);
  });
});

describe('health reporting', () => {
  const row = (id, label, state, latencyMs, models) =>
    ({ id, label, state, latencyMs, models: models || 0 });

  it('counts only connectors that can serve', () => {
    const summary = summarize([
      row('groq', 'Groq', HEALTH.OK, 120, 14),
      row('openai', 'OpenAI', HEALTH.DEGRADED, 2200, 48),
      row('ollama', 'Ollama', HEALTH.ABSENT, null),
    ]);
    assert.match(summary, /2\/2 healthy/, 'an unconfigured connector is not a failure');
    assert.match(summary, /62 models/);
  });

  it('names the broken one so the user knows where to look', () => {
    const summary = summarize([
      row('groq', 'Groq', HEALTH.OK, 120, 14),
      row('openai', 'OpenAI', HEALTH.QUOTA, 90, 0),
    ]);
    assert.match(summary, /OpenAI: quota/);
  });

  it('says so when nothing is configured', () => {
    assert.equal(summarize([row('groq', 'Groq', HEALTH.ABSENT, null)]), 'no connector configured');
  });

  it('ranks healthy connectors for failover', () => {
    const order = healthiestFirst([
      row('openai', 'OpenAI', HEALTH.QUOTA, 80, 0),
      row('groq', 'Groq', HEALTH.OK, 120, 14),
      row('fireworks', 'Fireworks', HEALTH.UNREACHABLE, 4000, 0),
      row('anthropic', 'Anthropic', HEALTH.DEGRADED, 900, 17),
    ]);
    // Only connectors that answered are offered; a quota-blocked one is worse
    // than useless in a chain because it burns an attempt and adds latency.
    assert.deepEqual(order, ['groq', 'anthropic']);
  });
});

/**
 * sessions store — a malformed file in ~/.sentinel/sessions (a stray message
 * array from an older build crashed the Ctrl+S panel) must be skipped, not
 * surfaced as a session with no id or title.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let sessions;

before(async () => {
  const home = mkdtempSync(join(tmpdir(), 'sentinel-sessions-'));
  process.env.SENTINEL_HOME = home;
  const dir = join(home, 'sessions');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'session.json'), JSON.stringify([{ role: 'user', parts: [] }]));
  writeFileSync(join(dir, 'broken.json'), '{not json');
  writeFileSync(join(dir, 'notitle.json'), JSON.stringify({ id: 'notitle', createdAt: 1, messages: [] }));
  ({ sessions } = await import(`../src/agent/sessions.js?home=${Date.now()}`));
});

describe('sessions store', () => {
  it('list() skips non-session files and defaults a missing title', async () => {
    const list = await sessions.list();
    assert.deepEqual(list.map((s) => s.id), ['notitle']);
    assert.equal(list[0].title, 'Untitled');
  });

  it('get() returns null for a file that is not a session object', async () => {
    assert.equal(await sessions.get('session'), null);
    assert.equal(await sessions.get('broken'), null);
  });

  it('created sessions round-trip', async () => {
    const s = await sessions.create({ title: 'hello' });
    assert.equal((await sessions.get(s.id)).title, 'hello');
    assert.ok((await sessions.list()).some((x) => x.id === s.id));
  });
});

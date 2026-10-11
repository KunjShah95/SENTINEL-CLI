/**
 * preferences.json resilience.
 *
 * This whole class of bug is invisible in CI: the runner has a fresh home, so
 * `preferences.json` is written by `ensurePrefs` as a proper object and nothing
 * ever exercises the recovery path. It only surfaces on a machine whose file was
 * written by something else, edited by hand, or truncated into a different JSON
 * shape — which is exactly where a silent preference loss is most expensive,
 * because the user has usually just spent time setting the preference up.
 *
 * The trap: `JSON.stringify` on an array emits only its indices, so a property
 * assigned on a parsed array is discarded on write. Reads keep working and the
 * write reports success, so every preference save becomes a no-op that looks
 * like it worked.
 *
 * `prefs.js` resolves its path from `os.homedir()` at module load, so HOME has
 * to be redirected before the module is imported — hence the dynamic imports
 * against a cache-busting query rather than a top-level import.
 *
 * Run with: node --test __tests__/prefs-file.test.js
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmp;
let savedHome;
let savedProfile;
let prefsPath;

before(() => {
  savedHome = process.env.HOME;
  savedProfile = process.env.USERPROFILE;
  tmp = mkdtempSync(join(tmpdir(), 'sentinel-prefs-'));
  // Windows resolves os.homedir() from USERPROFILE; POSIX from HOME. Set both
  // so the module under test cannot see the real file whichever it asks.
  process.env.HOME = tmp;
  process.env.USERPROFILE = tmp;
  prefsPath = join(tmp, '.sentinel', 'preferences.json');
});

after(() => {
  if (savedHome === undefined) delete process.env.HOME; else process.env.HOME = savedHome;
  if (savedProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = savedProfile;
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

/** A fresh copy of prefs.js bound to the redirected home. */
const freshPrefs = () => import(`../src/shared/models/prefs.js?v=${Math.random()}`);

function seedPreferences(contents) {
  mkdirSync(join(tmp, '.sentinel'), { recursive: true });
  writeFileSync(prefsPath, contents);
}

beforeEach(() => { rmSync(prefsPath, { force: true }); });

describe('a preferences file that is not an object', () => {
  it('recovers from an array-shaped file instead of silently dropping writes', async () => {
    // The exact shape that shipped on one machine: a JSON array of model ids.
    // `prefs.modelVariants = {...}` on an array vanishes on stringify, so every
    // preference save reported success and changed nothing.
    seedPreferences('["lmstudio/qwen/qwen3-coder-30b"]');
    const prefs = await freshPrefs();

    await prefs.saveModelVariant('claude-sonnet-4-6', 'max');
    assert.equal(await prefs.loadModelVariant('claude-sonnet-4-6'), 'max',
      'a variant must survive a write to a non-object preferences file');

    const onDisk = JSON.parse(readFileSync(prefsPath, 'utf8'));
    assert.equal(typeof onDisk, 'object');
    assert.ok(!Array.isArray(onDisk), 'the file is rewritten as an object');
    assert.deepEqual(onDisk.modelVariants, { 'claude-sonnet-4-6': 'max' });
  });

  it('recovers from a string, a number and null', async () => {
    for (const bad of ['"just a string"', '42', 'null', 'true']) {
      rmSync(prefsPath, { force: true });
      seedPreferences(bad);
      const prefs = await freshPrefs();
      await prefs.saveLastModel('gpt-4o-mini');
      assert.equal(await prefs.loadLastModel(), 'gpt-4o-mini',
        `a preferences file containing ${bad} must still accept a write`);
    }
  });

  it('recovers from unparseable text rather than throwing on every read', async () => {
    seedPreferences('{ this is not json');
    const prefs = await freshPrefs();
    await prefs.saveLastModel('gpt-4o-mini');
    assert.equal(await prefs.loadLastModel(), 'gpt-4o-mini');
  });

  it('keeps a well-formed object untouched', async () => {
    // The recovery must not fire on good input: rewriting a valid preferences
    // file on every read would race every other writer.
    seedPreferences(JSON.stringify({ theme: 'OpenCode', lastModel: 'keep-me' }));
    const prefs = await freshPrefs();
    assert.equal(await prefs.loadLastModel(), 'keep-me');
    assert.deepEqual(JSON.parse(readFileSync(prefsPath, 'utf8')), { theme: 'OpenCode', lastModel: 'keep-me' },
      'a valid file is not rewritten just by being read');
  });
});

describe('concurrent setters do not lose each other', () => {
  it('preserves every write when several land in the same tick', async () => {
    seedPreferences(JSON.stringify({}));
    const prefs = await freshPrefs();

    // No awaits between them. Every setter is a read-mutate-write, so without a
    // queue they all read the same document and the last writer wins — silently
    // discarding the other two. The symptom is a preference that reverts on the
    // next launch and reads like the app ignoring you.
    await Promise.all([
      prefs.saveLastModel('a'),
      prefs.saveModelVariant('m', 'high'),
      prefs.recordModelUse('recent-model'),
    ]);

    const onDisk = JSON.parse(readFileSync(prefsPath, 'utf8'));
    assert.equal(onDisk.lastModel, 'a');
    assert.equal(onDisk.modelVariants?.m, 'high');
    assert.deepEqual(onDisk.recentModels, ['recent-model']);
  });

  it('stays usable after a failed write', async () => {
    seedPreferences(JSON.stringify({}));
    const prefs = await freshPrefs();
    // A directory where the file should be makes writeFile fail.
    rmSync(prefsPath, { force: true });
    mkdirSync(prefsPath, { recursive: true });
    await prefs.saveLastModel('a'); // fails, must not throw or poison the queue

    rmSync(prefsPath, { recursive: true, force: true });
    seedPreferences(JSON.stringify({}));
    const fresh = await freshPrefs();
    await fresh.saveLastModel('b');
    assert.equal(await fresh.loadLastModel(), 'b',
      'a poisoned write queue would make every later write a no-op');
  });
});

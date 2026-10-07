/**
 * The shared `.sentinel/` state directory.
 *
 * Small, and tested because it is now load-bearing for four modules that all
 * read and write state under it. The behaviour worth pinning is the split
 * between `stateDir` (no side effect) and `ensureStateDir` (creates) — a doctor
 * check that creates the directory it is inspecting the absence of reports the
 * wrong answer.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stateDir, ensureStateDir, statePath, relativeStatePath, SENTINEL_DIR } from '../src/utils/state-dir.js';

let dir;
before(() => { dir = mkdtempSync(join(tmpdir(), 'state-dir-')); });
after(() => rmSync(dir, { recursive: true, force: true }));

describe('stateDir', () => {
  it('points into the project and does not create it', () => {
    const p = stateDir(dir);
    assert.equal(p, join(dir, SENTINEL_DIR));
    assert.equal(existsSync(p), false, 'a read must not have a side effect');
  });

  it('reports the right thing before and after creation', () => {
    // This is the distinction `doctor` depends on: "no state directory" and "a
    // state directory that was just created by asking" are different answers.
    assert.equal(existsSync(stateDir(dir)), false);
    ensureStateDir(dir);
    assert.equal(existsSync(stateDir(dir)), true);
  });
});

describe('ensureStateDir', () => {
  it('returns the absolute path', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'state-dir-b-'));
    try {
      const p = ensureStateDir(fresh);
      assert.equal(p, join(fresh, SENTINEL_DIR));
      assert.ok(existsSync(p));
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  it('is idempotent', () => {
    assert.equal(ensureStateDir(dir), ensureStateDir(dir));
    assert.equal(existsSync(stateDir(dir)), true);
  });

  it('survives the directory already existing with content in it', () => {
    // A read-modify-write cycle is the normal case, and a naive helper that
    // wipes the directory on the way in would destroy a user's budget history.
    writeFileSync(join(stateDir(dir), 'budget.json'), '{"spendUsd":1.5}');
    ensureStateDir(dir);
    assert.equal(JSON.parse(readFileSync(join(stateDir(dir), 'budget.json'), 'utf8')).spendUsd, 1.5);
  });
});

describe('statePath', () => {
  it('names a file inside the directory', () => {
    assert.equal(statePath('watch-state.json', dir), join(stateDir(dir), 'watch-state.json'));
  });

  it('does not create anything', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'state-dir-c-'));
    try {
      statePath('x.json', fresh);
      assert.equal(existsSync(stateDir(fresh)), false);
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });
});

describe('the modules that depend on it', () => {
  it('all write under one directory name', async () => {
    // The reason this helper exists: four modules used to each mkdir their own
    // copy of `.sentinel`, and a rename that missed one would have produced a
    // module whose state nothing else reads.
    const [budget, outcome, ledger, watch] = await Promise.all([
      import('../src/agent/budget.js'),
      import('../src/agent/outcome.js'),
      import('../src/agent/risk-ledger.js'),
      import('../src/agent/watch.js'),
    ]);
    const fresh = mkdtempSync(join(tmpdir(), 'state-dir-d-'));
    try {
      // Each module's real write entry point, discovered by its own export
      // name rather than guessed — guessing is how this test would have gone
      // stale against a rename.
      budget.writeBudget({ maxUsd: 1 }, fresh);
      ledger.recordApproval('git status', fresh);
      watch.writeWatchState({ ticks: 1 }, fresh);
      outcome.writeContract({
        current: 'a/b.js:1 does the thing',
        target: 'it does the thing correctly',
        verification: 'npm test exits 0',
        blastRadius: 'one module',
        rollback: 'git revert',
        unknowns: [],
      }, fresh);

      const entries = ['budget.json', 'risk.json', 'watch-state.json', 'outcome.json'];
      for (const name of entries) {
        assert.ok(existsSync(join(stateDir(fresh), name)), `${name} must live under .sentinel/`);
      }
      assert.deepEqual(
        readdirSync(stateDir(fresh)).filter((f) => f.endsWith('.json')).sort(),
        [...entries].sort(),
        'and nothing else, so a stray directory is visible',
      );

      // The exported relative paths must agree with where the files landed.
      // This is the assertion that catches a hardcoded '.sentinel/risk.json'
      // drifting away from the directory the modules actually write to.
      assert.equal(ledger.LEDGER_PATH, relativeStatePath('risk.json'));
      assert.equal(budget.BUDGET_PATH, relativeStatePath('budget.json'));
      assert.equal(watch.STEER_PATH, relativeStatePath('steer.jsonl'));
      for (const [mod, name] of [[ledger, ledger.LEDGER_PATH], [budget, budget.BUDGET_PATH], [watch, watch.STEER_PATH]]) {
        void mod;
        assert.ok(name.startsWith(SENTINEL_DIR + '/'), `${name} must live under ${SENTINEL_DIR}/`);
      }
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });
});

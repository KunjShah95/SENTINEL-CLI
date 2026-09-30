/**
 * Blast-radius gate — a risky write is challenged once, not refused forever.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  targetPaths, classifyTarget, blastRadius, checkBlastRadius,
  createGateState, justificationPrompt, looksJustified,
} from '../src/agent/blast-radius.js';

const EDIT = (path) => ({ toolName: 'editFile', input: { path } });

describe('targetPaths', () => {
  test('single-path tools', () => {
    assert.deepEqual(targetPaths('writeFile', { path: 'a.js' }), ['a.js']);
    assert.deepEqual(targetPaths('editFile', { path: 'b.js' }), ['b.js']);
  });

  test('batchEdit and applyPatch', () => {
    assert.deepEqual(
      targetPaths('batchEdit', { operations: [{ filePath: 'a.js' }, { filePath: 'b.js' }] }),
      ['a.js', 'b.js'],
    );
    assert.deepEqual(
      targetPaths('applyPatch', { patch: '--- a/x\n+++ b/src/auth/login.ts\n@@\n+line\n' }),
      ['src/auth/login.ts'],
    );
  });

  test('a non-writing tool has no targets', () => {
    assert.deepEqual(targetPaths('readFile', { path: '.github/workflows/ci.yml' }), []);
    assert.deepEqual(targetPaths('bash', { command: 'rm -rf /' }), []);
  });

  test('missing input is empty, not a crash', () => {
    assert.deepEqual(targetPaths('writeFile', undefined), []);
    assert.deepEqual(targetPaths('batchEdit', {}), []);
  });
});

describe('classifyTarget', () => {
  test('flags the paths where a small edit has an outsized effect', () => {
    const cases = [
      ['db/migrate/0042_add_index.sql', /migration/],
      ['src/db/schema.sql', /raw SQL/],
      ['.github/workflows/ci.yml', /gates every merge/],
      ['package-lock.json', /lockfile/],
      ['src/auth/session.js', /auth/],
      ['src/billing/invoice.ts', /billing/],
      ['prisma/schema.prisma', /schema/],
      ['Dockerfile', /build or deploy/],
      ['infra/terraform/main.tf', /infrastructure/],
      ['k8s/deployment.yaml', /cluster/],
      ['.sentinel/config.yaml', /permission config/],
    ];
    for (const [p, re] of cases) {
      const r = classifyTarget(p);
      assert.equal(r.sensitive, true, p);
      assert.ok(r.reasons.some((x) => re.test(x)), `${p}: ${r.reasons.join('; ')}`);
    }
  });

  test('ordinary source files are not sensitive', () => {
    for (const p of ['src/agent/loop.js', 'src/tui/index.tsx', 'README.md', 'test/helpers.js', 'scripts/bench.mjs']) {
      assert.equal(classifyTarget(p).sensitive, false, p);
    }
  });

  test('a directory segment counts, not just the filename', () => {
    // The expensive failure is missing real billing code, so a `billing/`
    // directory must be caught even when the filename says nothing.
    assert.equal(classifyTarget('src/billing/invoice.ts').sensitive, true);
    assert.equal(classifyTarget('src/auth/session.js').sensitive, true);
    assert.equal(classifyTarget('lib/auth-utils.js').sensitive, true);
  });

  test('a false positive here costs one prompt, a false negative costs an outage', () => {
    // `lib/auth-utils.js` is a utility, not the payment gateway, and it will
    // still be challenged. That is the right trade: over-asking is cheap
    // because the gate blocks once per path per turn, while missing real auth
    // or billing code is not recoverable.
    assert.equal(classifyTarget('lib/auth-utils.js').sensitive, true);
  });

  test('windows separators do not defeat the patterns', () => {
    assert.equal(classifyTarget('db\\migrate\\0042.sql').sensitive, true);
  });
});

describe('blastRadius', () => {
  test('a sensitive write has a radius', () => {
    const r = blastRadius('editFile', { path: 'db/migrate/0042.sql' });
    assert.equal(r.sensitive, true);
    assert.equal(r.targets.length, 1);
  });

  test('a safe write does not', () => {
    assert.equal(blastRadius('editFile', { path: 'src/a.js' }).sensitive, false);
  });

  test('one sensitive file in a batch is enough', () => {
    const r = blastRadius('batchEdit', { operations: [{ filePath: 'src/a.js' }, { filePath: 'k8s/deploy.yaml' }] });
    assert.equal(r.sensitive, true);
    assert.deepEqual(r.targets.map((t) => t.path), ['k8s/deploy.yaml']);
  });
});

describe('checkBlastRadius', () => {
  test('blocks the first touch and lets the second through', () => {
    const state = createGateState();
    const first = checkBlastRadius({ ...EDIT('db/migrate/0042.sql'), state });
    assert.ok(first?.block, 'the first write must be challenged');
    assert.match(first.reason, /JUSTIFICATION/);
    assert.match(first.reason, /ROLLBACK/);
    assert.equal(checkBlastRadius({ ...EDIT('db/migrate/0042.sql'), state }), null, 'the retry must be allowed');
  });

  test('the retry is per path, not global', () => {
    const state = createGateState();
    checkBlastRadius({ ...EDIT('db/migrate/0042.sql'), state });
    // A different risky file is still challenged in the same turn.
    assert.ok(checkBlastRadius({ ...EDIT('.github/workflows/ci.yml'), state })?.block);
    // And a safe one is never challenged.
    assert.equal(checkBlastRadius({ ...EDIT('src/a.js'), state }), null);
  });

  test('ordinary files are never gated', () => {
    const state = createGateState();
    for (let i = 0; i < 5; i++) assert.equal(checkBlastRadius({ ...EDIT('src/a.js'), state }), null);
  });

  test('a second turn re-asks: state is per turn by construction', () => {
    const firstTurn = createGateState();
    checkBlastRadius({ ...EDIT('db/migrate/0042.sql'), state: firstTurn });
    assert.equal(checkBlastRadius({ ...EDIT('db/migrate/0042.sql'), state: firstTurn }), null);
    // A fresh turn starts from scratch, so Monday's answer does not apply Tuesday.
    assert.ok(checkBlastRadius({ ...EDIT('db/migrate/0042.sql'), state: createGateState() })?.block);
  });

  test('a survey risk path is gated when a survey is supplied', () => {
    const state = createGateState();
    assert.equal(checkBlastRadius({ ...EDIT('src/hot.js'), state }), null, 'not sensitive by shape alone');
    const withSurvey = checkBlastRadius({ ...EDIT('src/hot.js'), state, surveyed: new Set(['src/hot.js']) });
    assert.ok(withSurvey?.block);
    assert.match(withSurvey.reason, /sentinel onboard/);
  });

  test('a supplied survey does not double-report a path that is already sensitive', () => {
    const state = createGateState();
    const r = checkBlastRadius({ ...EDIT('db/migrate/0042.sql'), state, surveyed: new Set(['db/migrate/0042.sql']) });
    assert.equal(r.reason.match(/db\/migrate/g).length, 1, 'the path should be named once');
  });
});

describe('justificationPrompt', () => {
  test('names the file and why it is risky', () => {
    const text = justificationPrompt(blastRadius('editFile', { path: '.github/workflows/ci.yml' }));
    assert.match(text, /\.github\/workflows\/ci\.yml/);
    assert.match(text, /gates every merge/);
  });

  test('asks for the two things an FDE states out loud', () => {
    const text = justificationPrompt(blastRadius('editFile', { path: 'db/migrate/x.sql' }));
    assert.match(text, /file:line/);
    assert.match(text, /ROLLBACK/);
  });
});

describe('looksJustified', () => {
  test('accepts a stated justification with a rollback', () => {
    assert.equal(looksJustified('Justification: src/sync.js:44 rewrites every row.\nRollback: git revert abc123'), true);
  });

  test('rejects an empty or contentless response', () => {
    assert.equal(looksJustified(''), false);
    assert.equal(looksJustified('ok'), false);
  });
});

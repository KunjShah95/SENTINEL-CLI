/**
 * Risk ledger — permission by novelty, not by category.
 * Pure classification + ledger persistence, no model involved.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  commandShape, shapeSegment, riskLevel, explainRisk, readLedger, writeLedger,
  recordApproval, forgetShape, ledgerFile, LEDGER_VERSION, LEDGER_MAX_SHAPES,
} from '../src/agent/risk-ledger.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'sentinel-risk-'));
const empty = { version: LEDGER_VERSION, shapes: {} };

describe('commandShape', () => {
  test('keeps the verb and its flags, collapses only values', () => {
    assert.equal(commandShape('git commit -m "fix the bug"'), 'git commit -m <word>');
    assert.equal(commandShape('git commit -m "a totally different message"'), 'git commit -m <word>');
  });

  test('two commands differing only in a value are the same shape', () => {
    assert.equal(commandShape('npm run build'), commandShape('npm run build'));
    assert.equal(commandShape('cat src/a.js'), commandShape('cat src/b.js'));
  });

  test('the git subcommand is part of the verb, never an argument', () => {
    // Regression: collapsing the subcommand made `git commit` and `git push`
    // the same shape, so approving a commit would have authorized a push.
    assert.notEqual(commandShape('git commit -m x'), commandShape('git push'));
    assert.notEqual(commandShape('git push'), commandShape('git pull'));
    assert.equal(commandShape('git commit -m x'), 'git commit -m <word>');
  });

  test('the same holds for other multi-verb tools', () => {
    assert.notEqual(commandShape('npm run build'), commandShape('npm publish'));
    assert.notEqual(commandShape('docker build .'), commandShape('docker push .'));
    assert.equal(commandShape('npm publish'), 'npm publish');
  });

  test('a different flag is a DIFFERENT shape — this is the whole point', () => {
    // If --force and --dry-run collapsed, approving a dry run would authorize
    // the force push, which is the exact mistake the ledger must not make.
    assert.notEqual(commandShape('git push --force'), commandShape('git push --dry-run'));
    assert.notEqual(commandShape('git push'), commandShape('git push --force'));
  });

  test('classified values keep their class', () => {
    assert.equal(commandShape('curl https://evil.test/x'), 'curl <url>');
    assert.equal(commandShape('cat /etc/hosts'), 'cat <path>');
    assert.equal(commandShape('sleep 30'), 'sleep <n>');
    assert.match(commandShape('git show a1b2c3d4e5f6'), /<sha>|<word>/);
  });

  test('a chained command keeps every segment', () => {
    assert.equal(commandShape('git add . && git commit -m "x"'), 'git add <word> ; git commit -m <word>');
  });

  test('a destructive segment is not hidden behind a safe one', () => {
    const shape = commandShape('ls && rm -rf /');
    assert.match(shape, /rm/);
    assert.match(shape, /ls/);
  });

  test('an empty command degrades to a placeholder, not a crash', () => {
    assert.equal(commandShape(''), '?');
    assert.equal(shapeSegment('   '), '');
  });

  test('env-var prefixes do not change the shape', () => {
    assert.equal(commandShape('CI=1 npm test'), shapeSegment('CI=1 npm test'));
    assert.match(shapeSegment('CI=1 npm test'), /^npm/);
  });
});

describe('riskLevel', () => {
  test('read-only commands are green with no history at all', () => {
    const r = riskLevel('ls -la', '/tmp/does-not-exist', empty);
    assert.equal(r.level, 'green');
    assert.equal(r.known, false);
  });

  test('a novel non-destructive command is yellow', () => {
    const r = riskLevel('npm publish', '/tmp/nope', empty);
    assert.equal(r.level, 'yellow');
    assert.equal(r.known, false);
    assert.match(r.reason, /new command shape/);
  });

  test('an approved shape turns green', () => {
    const dir = tmp();
    recordApproval('npm publish --dry-run', dir);
    const r = riskLevel('npm publish --dry-run', dir);
    assert.equal(r.level, 'green');
    assert.equal(r.known, true);
    rmSync(dir, { recursive: true, force: true });
  });

  test('approving a shape does not approve a new flag', () => {
    const dir = tmp();
    recordApproval('git push', dir);
    assert.equal(riskLevel('git push', dir).level, 'green');
    assert.equal(riskLevel('git push --force', dir).level, 'red');
    rmSync(dir, { recursive: true, force: true });
  });

  test('destructive is red even when the shape was approved many times', () => {
    const dir = tmp();
    for (let i = 0; i < 5; i++) recordApproval('rm -rf /', dir);
    const r = riskLevel('rm -rf /', dir);
    assert.equal(r.level, 'red', 'a destructive command is never made safe by repetition');
    rmSync(dir, { recursive: true, force: true });
  });

  test('red outranks a known shape', () => {
    const dir = tmp();
    recordApproval('git reset --hard', dir);
    assert.equal(riskLevel('git reset --hard', dir).level, 'red');
    rmSync(dir, { recursive: true, force: true });
  });

  test('a missing ledger is yellow, never green (fail closed)', () => {
    const dir = tmp();
    const r = riskLevel('npm publish', dir);
    assert.equal(r.level, 'yellow');
    assert.equal(r.known, false);
    rmSync(dir, { recursive: true, force: true });
  });

  test('a corrupt ledger is yellow, never green (fail closed)', () => {
    const dir = tmp();
    mkdirSync(join(dir, '.sentinel'), { recursive: true });
    writeFileSync(ledgerFile(dir), '{ not json at all', 'utf-8');
    assert.equal(riskLevel('npm publish', dir).level, 'yellow');
    assert.deepEqual(readLedger(dir).shapes, {});
    rmSync(dir, { recursive: true, force: true });
  });

  test('a ledger with the wrong shape is ignored, not trusted', () => {
    const dir = tmp();
    mkdirSync(join(dir, '.sentinel'), { recursive: true });
    writeFileSync(ledgerFile(dir), JSON.stringify({ version: 1, shapes: 'not-an-object' }), 'utf-8');
    assert.equal(riskLevel('npm publish', dir).level, 'yellow');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('ledger persistence', () => {
  test('records and forgets shapes', () => {
    const dir = tmp();
    recordApproval('git commit -m x', dir);
    assert.ok(commandShape('git commit -m x') in readLedger(dir).shapes);
    forgetShape('git commit -m x', dir);
    assert.ok(!(commandShape('git commit -m x') in readLedger(dir).shapes));
    rmSync(dir, { recursive: true, force: true });
  });

  test('repeat approvals bump the count', () => {
    const dir = tmp();
    recordApproval('git status', dir);
    recordApproval('git status', dir);
    assert.equal(readLedger(dir).shapes[commandShape('git status')].count, 2);
    rmSync(dir, { recursive: true, force: true });
  });

  test('the ledger is bounded, dropping the least recent', () => {
    const dir = tmp();
    // Distinct verbs, not distinct values: `git tag v0` and `git tag v1` are
    // deliberately the same shape, so this needs 200+ real shapes.
    const verbs = ['add', 'commit', 'push', 'pull', 'fetch', 'merge', 'rebase', 'tag', 'log', 'diff'];
    for (let i = 0; i < LEDGER_MAX_SHAPES + 20; i++) {
      recordApproval(`git ${verbs[i % verbs.length]} --opt${i}`, dir, { at: 1000 + i });
    }
    const shapes = Object.keys(readLedger(dir).shapes);
    assert.equal(shapes.length, LEDGER_MAX_SHAPES);
    assert.ok(shapes.some((s) => s.includes(`--opt${LEDGER_MAX_SHAPES + 19}`)), 'most recent shape must survive');
    assert.ok(!shapes.some((s) => s.includes('--opt0 ')), 'oldest shape must be dropped');
    rmSync(dir, { recursive: true, force: true });
  });

  test('repeat approvals of one shape do not fill the ledger', () => {
    const dir = tmp();
    for (let i = 0; i < LEDGER_MAX_SHAPES + 20; i++) recordApproval('git tag v1', dir, { at: 1000 + i });
    assert.equal(Object.keys(readLedger(dir).shapes).length, 1);
    rmSync(dir, { recursive: true, force: true });
  });

  test('writeLedger refuses to persist a non-object shapes bag', () => {
    const dir = tmp();
    const doc = writeLedger({ shapes: null }, dir);
    assert.deepEqual(doc.shapes, {});
    assert.equal(riskLevel('npm publish', dir).level, 'yellow');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('explainRisk', () => {
  test('says nothing for green', () => {
    assert.equal(explainRisk(riskLevel('ls', '/tmp/x', empty)), null);
  });

  test('a yellow prompt names the shape and what approval does', () => {
    const text = explainRisk(riskLevel('npm publish', '/tmp/x', empty));
    assert.match(text, /new command shape/);
    assert.match(text, /will not ask again/);
  });

  test('a red prompt leads with the danger', () => {
    const text = explainRisk(riskLevel('rm -rf /', '/tmp/x', empty));
    assert.match(text, /High risk/);
    assert.ok(!/will not ask again/.test(text), 'red must not promise to be remembered as safe');
  });
});

/**
 * Engagement budget — spend that outlives the process.
 * Pure arithmetic plus file round-trips, no model involved.
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readBudget, writeBudget, clearBudget, recordSpend, readSpend, totalSpend,
  budgetStatus, formatStatus, formatDuration, burnBar, parseDeadline,
  budgetFile, spendFile, BUDGET_VERSION,
} from '../src/agent/budget.js';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sentinel-budget-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const spend = (usd, extra = {}) => recordSpend({ usd, inputTokens: 100, outputTokens: 50, model: 'm', ...extra }, dir);

describe('parseDeadline', () => {
  const now = Date.parse('2026-01-01T00:00:00.000Z');

  test('relative durations', () => {
    assert.equal(parseDeadline('45m', now), '2026-01-01T00:45:00.000Z');
    assert.equal(parseDeadline('2h', now), '2026-01-01T02:00:00.000Z');
    assert.equal(parseDeadline('3d', now), '2026-01-04T00:00:00.000Z');
  });

  test('an absolute date', () => {
    assert.equal(parseDeadline('2026-06-01T12:00:00.000Z', now), '2026-06-01T12:00:00.000Z');
  });

  test('nonsense is null, not a silently wrong date', () => {
    assert.equal(parseDeadline('next tuesday-ish', now), null);
    assert.equal(parseDeadline('', now), null);
    assert.equal(parseDeadline(null, now), null);
  });
});

describe('budget file', () => {
  test('defaults to unbounded rather than a zero budget', () => {
    const b = readBudget(dir);
    assert.equal(b.budgetUsd, 0);
    assert.equal(b.deadlineAt, null);
    assert.equal(budgetStatus(dir).status, 'unbounded');
  });

  test('round-trips', () => {
    const saved = writeBudget({ budgetUsd: 25, deadlineAt: '2026-06-01T00:00:00.000Z', stopCondition: 'npm test exits 0' }, dir);
    assert.equal(saved.version, BUDGET_VERSION);
    const b = readBudget(dir);
    assert.equal(b.budgetUsd, 25);
    assert.equal(b.stopCondition, 'npm test exits 0');
    assert.equal(b.startedAt, saved.startedAt);
  });

  test('a corrupt file is reported, not silently treated as no budget', () => {
    mkdirSync(join(dir, '.sentinel'), { recursive: true });
    writeFileSync(budgetFile(dir), '{ not json', 'utf-8');
    const b = readBudget(dir);
    assert.equal(b.corrupt, true, 'the user must be told the ceiling was unreadable');
  });

  test('a negative or junk budget is normalized to zero', () => {
    const b = writeBudget({ budgetUsd: -5 }, dir);
    assert.equal(b.budgetUsd, 0);
    assert.equal(writeBudget({ budgetUsd: 'abc' }, dir).budgetUsd, 0);
  });

  test('clearing keeps the spend history', () => {
    writeBudget({ budgetUsd: 10 }, dir);
    spend(1.5);
    clearBudget(dir);
    assert.equal(readBudget(dir).budgetUsd, 0);
    assert.equal(totalSpend(dir).usd, 1.5, 'clearing a ceiling must not erase what it already cost');
  });
});

describe('spend log', () => {
  test('accumulates across turns', () => {
    spend(0.10);
    spend(0.25);
    const t = totalSpend(dir);
    assert.equal(Number(t.usd.toFixed(2)), 0.35);
    assert.equal(t.turns, 2);
    assert.equal(t.inputTokens, 200);
  });

  test('survives a torn final line', () => {
    spend(0.1);
    writeFileSync(spendFile(dir), readSpend(dir).map((r) => JSON.stringify(r)).join('\n') + '\n{"usd":0.2', 'utf-8');
    const rows = readSpend(dir);
    assert.equal(rows.length, 1, 'a crash mid-write must not corrupt the whole log');
  });

  test('totalSpend can be scoped to the engagement start', () => {
    spend(1.0);
    writeBudget({ budgetUsd: 5, startedAt: new Date(Date.now() + 1000).toISOString() }, dir);
    assert.equal(totalSpend(dir, { since: new Date(Date.now() + 1000).toISOString() }).usd, 0);
    assert.equal(totalSpend(dir).usd, 1.0, 'lifetime is still everything');
  });
});

describe('budgetStatus', () => {
  test('active while under budget', () => {
    writeBudget({ budgetUsd: 10 }, dir);
    spend(2);
    const s = budgetStatus(dir);
    assert.equal(s.status, 'active');
    assert.equal(s.mayContinue, true);
    assert.equal(Number(s.remainingUsd.toFixed(2)), 8);
    assert.equal(s.used, 0.2);
  });

  test('spend from before the engagement started does not count against it', () => {
    spend(3);
    // A later start, so the boundary is unambiguous.
    writeBudget({ budgetUsd: 10, startedAt: new Date(Date.now() + 60_000).toISOString() }, dir);
    const s = budgetStatus(dir);
    assert.equal(s.spend.usd, 0, 'the engagement starts when the budget does');
    assert.equal(s.lifetime.usd, 3, 'but the money is still spent and still reported');
  });

  test('over-budget stops work and says why', () => {
    writeBudget({ budgetUsd: 1 }, dir);
    spend(1.5);
    const s = budgetStatus(dir);
    assert.equal(s.status, 'over-budget');
    assert.equal(s.mayContinue, false);
    assert.match(s.stopReason, /budget exhausted/i);
    assert.equal(s.remainingUsd, 0, 'remaining never goes negative');
  });

  test('a passed deadline stops work', () => {
    writeBudget({ budgetUsd: 10, deadlineAt: new Date(Date.now() - 1000).toISOString() }, dir);
    const s = budgetStatus(dir);
    assert.equal(s.status, 'past-deadline');
    assert.equal(s.mayContinue, false);
    assert.match(s.stopReason, /deadline passed/i);
  });

  test('a future deadline keeps work going', () => {
    writeBudget({ budgetUsd: 10, deadlineAt: new Date(Date.now() + 60_000).toISOString() }, dir);
    assert.equal(budgetStatus(dir).status, 'active');
  });

  test('unbounded really means unbounded', () => {
    spend(1000);
    const s = budgetStatus(dir);
    assert.equal(s.status, 'unbounded');
    assert.equal(s.mayContinue, true);
    assert.equal(s.remainingUsd, Infinity);
  });
});

describe('formatting', () => {
  test('a status line a non-technical buyer can read', () => {
    writeBudget({ budgetUsd: 25, deadlineAt: new Date(Date.now() + 3 * 86_400_000).toISOString() }, dir);
    spend(12.4);
    const line = formatStatus(budgetStatus(dir));
    assert.match(line, /\$12\.40 of \$25\.00 \(50%\)/);
    assert.match(line, /\d+d \d+h left/);
    assert.match(line, /1 turn/);
  });

  test('says so when nothing is budgeted', () => {
    assert.match(formatStatus(budgetStatus(dir)), /no budget set/);
  });

  test('durations', () => {
    assert.equal(formatDuration(45 * 60_000), '45m');
    assert.equal(formatDuration(2 * 3_600_000 + 30 * 60_000), '2h 30m');
    assert.equal(formatDuration(-1), '0m');
  });

  test('the burn bar never overflows its width', () => {
    writeBudget({ budgetUsd: 1 }, dir);
    spend(50);
    assert.equal(burnBar(budgetStatus(dir), 20).length, 20, '50x over budget must not draw 1000 blocks');
  });

  test('an unbounded bar is a flat line', () => {
    assert.equal(burnBar(budgetStatus(dir), 10), '─'.repeat(10));
  });
});

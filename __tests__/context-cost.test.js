/**
 * context-cost — regression tests for the per-model-call budget.
 *
 * A turn is: model call → tools → model call → … up to 25 (BUILD) or 60 (SWE)
 * times. Everything in these tests is therefore paid PER CALL, not per turn, and
 * three separate bugs made that cost explode without anyone noticing:
 *
 *   1. the skill listing was injected in full. A machine with 208 skills sent
 *      57.5k chars (~14.4k tokens) as a fixed prefix on every model call —
 *      96% of the whole system prompt, re-billed on every iteration.
 *   2. `trimMessagesForBudget` measured the conversation by re-serializing it
 *      inside two nested loops: 103 full JSON.stringify passes, ~94ms, per
 *      model call (~6s of pure CPU across a 60-iteration SWE turn).
 *   3. the usage fallback serialized the entire conversation on every
 *      iteration, even when the provider reports real usage.
 *
 * These assert the budget, the equivalence, and the hot path — not just that
 * the code runs.
 *
 * Run with: node --test __tests__/context-cost.test.js
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  trimMessagesForBudget,
  estimateRequestTokens,
  resetRequestTokenCache,
  LOOP_REQUEST_CHAR_BUDGET,
} from '../src/agent/loop.js';
import {
  buildSystemPrompt,
  flushPromptCache,
  currentGitBranch,
} from '../src/agent/prompt.js';
import {
  formatSkillListing,
  scoreSkill,
  SKILL_LISTING_CHAR_CAP,
  SKILL_DESCRIPTION_CHAR_CAP,
} from '../src/agent/skills.js';

let dir;
let prevCwd;

beforeEach(() => {
  prevCwd = process.cwd();
  dir = mkdtempSync(join(tmpdir(), 'sentinel-context-cost-'));
  process.chdir(dir);
  flushPromptCache();
});

afterEach(() => {
  process.chdir(prevCwd);
  rmSync(dir, { recursive: true, force: true });
});

/** Seed N skills, each with a description of `descLen` chars. */
function seedSkills(n, { descLen = 200, prefix = 'skill' } = {}) {
  for (let i = 0; i < n; i++) {
    const d = join(dir, '.sentinel', 'skills', `${prefix}${i}`);
    mkdirSync(d, { recursive: true });
    writeFileSync(
      join(d, 'SKILL.md'),
      `---\nname: ${prefix}${i}\ndescription: ${'d'.repeat(descLen)}\n---\nbody`,
      'utf-8'
    );
  }
}

/** A conversation of `rounds` tool round-trips with large results. */
function convo(rounds, size = 18_000) {
  const out = [{ role: 'user', content: 'fix the failing test' }];
  for (let i = 0; i < rounds; i++) {
    out.push({
      role: 'assistant',
      content: `step ${i}`,
      tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'readFile', arguments: '{"path":"a.ts"}' } }],
    });
    out.push({ role: 'tool', tool_call_id: `c${i}`, content: 'x'.repeat(size) });
  }
  return out;
}

describe('skill listing stays inside its budget', () => {
  it('caps the listing no matter how many skills are installed', () => {
    seedSkills(300);
    const listing = formatSkillListing(dir, { includeGlobal: false });
    // The note line reporting the overflow is part of the budget.
    assert.ok(
      listing.length <= SKILL_LISTING_CHAR_CAP + 200,
      `listing ${listing.length} chars, cap ${SKILL_LISTING_CHAR_CAP}`
    );
  });

  it('says what it dropped instead of silently losing the capability', () => {
    seedSkills(300);
    const listing = formatSkillListing(dir, { includeGlobal: false });
    assert.match(listing, /more skills? not listed/);
    assert.match(listing, /skill tool|listDirectory/, 'tells the model how to reach the rest');
  });

  it('truncates a single absurd description rather than spending the budget on it', () => {
    const d = join(dir, '.sentinel', 'skills', 'huge');
    mkdirSync(d, { recursive: true });
    writeFileSync(
      join(d, 'SKILL.md'),
      `---\nname: huge\ndescription: ${'x'.repeat(5000)}\n---\nbody`,
      'utf-8'
    );
    const listing = formatSkillListing(dir, { includeGlobal: false });
    const line = listing.split('\n').find((l) => l.startsWith('- huge:')) || '';
    assert.ok(line.length < 200, `one line should be bounded, got ${line.length}`);
    assert.ok(SKILL_DESCRIPTION_CHAR_CAP > 0);
  });

  it('lists skills that match the request ahead of the rest', () => {
    seedSkills(20, { prefix: 'filler' });
    // A highly relevant skill, added last so directory order cannot explain it.
    const d = join(dir, '.sentinel', 'skills', 'kubernetes-deploy');
    mkdirSync(d, { recursive: true });
    writeFileSync(
      join(d, 'SKILL.md'),
      '---\nname: kubernetes-deploy\ndescription: Deploy to AKS clusters\n---\nbody',
      'utf-8'
    );
    const listing = formatSkillListing(dir, {
      includeGlobal: false,
      request: 'deploy this to kubernetes',
      charCap: 100_000,
    });
    const lines = listing.split('\n').filter((l) => l.startsWith('- '));
    assert.ok(lines.length > 1);
    assert.match(lines[0], /kubernetes-deploy/, `expected the match first, got: ${lines[0]}`);
  });

  it('scores a name hit above a passing description mention', () => {
    const tokens = new Set(['deploy', 'kubernetes']);
    const byName = scoreSkill({ name: 'kubernetes', description: 'unrelated words here' }, tokens);
    const byDesc = scoreSkill({ name: 'other', description: 'mentions deploy somewhere' }, tokens);
    assert.ok(byName > byDesc, `name ${byName} should beat description ${byDesc}`);
    assert.equal(scoreSkill({ name: 'x', description: 'y' }, new Set()), 0, 'no signal scores 0');
  });

  it('is byte-stable across calls (no timestamp / ordering churn)', () => {
    seedSkills(5);
    const a = formatSkillListing(dir, { includeGlobal: false, request: 'fix bug' });
    const b = formatSkillListing(dir, { includeGlobal: false, request: 'fix bug' });
    assert.equal(a, b);
  });
});

describe('trimMessagesForBudget honours the bound and stays pure', () => {
  it('returns the same reference when already inside budget', () => {
    const msgs = convo(2);
    assert.equal(trimMessagesForBudget(msgs), msgs, 'no copy when nothing to do');
  });

  it('brings an over-budget conversation under the budget', () => {
    const msgs = convo(60);
    assert.ok(JSON.stringify(msgs).length > LOOP_REQUEST_CHAR_BUDGET, 'fixture is over budget');
    const out = trimMessagesForBudget(msgs);
    assert.ok(
      JSON.stringify(out).length <= LOOP_REQUEST_CHAR_BUDGET,
      `trimmed to ${JSON.stringify(out).length}, budget ${LOOP_REQUEST_CHAR_BUDGET}`
    );
  });

  it('does not mutate its input', () => {
    const msgs = convo(20);
    const before = JSON.stringify(msgs);
    trimMessagesForBudget(msgs);
    assert.equal(JSON.stringify(msgs), before);
  });

  it('keeps the task head and the recent tail intact', () => {
    const msgs = convo(60);
    const out = trimMessagesForBudget(msgs);
    assert.equal(out[0].content, msgs[0].content, 'task head preserved');
    assert.deepEqual(out.slice(-6), msgs.slice(-6), 'recent tail preserved verbatim');
  });

  it('agrees with a naive re-implementation on every case', () => {
    // The oracle is the obvious implementation: measure by serializing. If the
    // fast version ever diverges, the budget it enforces is a different one.
    const naive = (messages, budget) => {
      const size = (list) => JSON.stringify(list).length;
      if (size(messages) <= budget) return messages;
      const out = messages.map((m) => ({ ...m }));
      const tombstone = (m) => {
        const next = { ...m, content: '[trimmed: budget]' };
        if (Array.isArray(next.tool_calls)) {
          next.tool_calls = next.tool_calls.map((tc) => {
            const args = tc?.function?.arguments;
            if (typeof args === 'string' && args.length > 1000) {
              return { ...tc, function: { ...tc.function, arguments: `${args.slice(0, 1000)}…[trimmed]` } };
            }
            return tc;
          });
        }
        return next;
      };
      for (let i = 1; i < out.length - 6; i++) {
        if (size(out) <= budget) break;
        const m = out[i];
        if (m.role === 'tool' && m.content !== '[trimmed: budget]') out[i] = tombstone(m);
      }
      let guard = out.length + 1;
      while (size(out) > budget && guard-- > 0) {
        let best = -1, bestLen = 0;
        for (let i = 1; i < out.length; i++) {
          const w = size([out[i]]);
          if (w > bestLen && w > 60) { best = i; bestLen = w; }
        }
        if (best === -1) break;
        const m = out[best];
        out[best] =
          m.role === 'assistant' && typeof m.content === 'string' && m.content.length > 500
            ? { ...tombstone(m), content: `${m.content.slice(0, 500)}\n[trimmed: budget]` }
            : tombstone(m);
      }
      return out;
    };

    for (const rounds of [1, 12, 20, 40, 60]) {
      for (const budget of [200_000, 50_000, 10_000, 2_000]) {
        const msgs = convo(rounds);
        assert.deepEqual(
          trimMessagesForBudget(msgs.map((m) => ({ ...m })), budget),
          naive(msgs.map((m) => ({ ...m })), budget),
          `rounds=${rounds} budget=${budget}`
        );
      }
    }
  });

  it('stays fast on a 60-round conversation instead of re-serializing it', () => {
    const msgs = convo(60);
    trimMessagesForBudget(convo(60)); // warm
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) trimMessagesForBudget(msgs);
    const ms = (performance.now() - t0) / 10;
    // The re-serializing version measured 94ms here. 10ms leaves generous
    // headroom for slow CI while still failing if it regresses to O(n^2).
    assert.ok(ms < 10, `trim took ${ms.toFixed(1)}ms per call (budget 10ms)`);
  });
});

describe('the usage fallback is off the hot path', () => {
  it('is memoized when the conversation has not grown', () => {
    resetRequestTokenCache();
    const msgs = convo(60);
    const first = estimateRequestTokens(msgs, 'system');
    const second = estimateRequestTokens(msgs, 'system');
    assert.equal(first, second, 'same length → same answer');
  });

  it('recomputes once the conversation grows', () => {
    resetRequestTokenCache();
    const msgs = convo(2);
    const before = estimateRequestTokens(msgs, 'sys');
    msgs.push({ role: 'assistant', content: 'one more step' });
    const after = estimateRequestTokens(msgs, 'sys');
    assert.ok(after > before, `grew from ${before} to ${after}`);
  });

  it('does not serialize on every call for a repeated length', () => {
    resetRequestTokenCache();
    const msgs = convo(40);
    estimateRequestTokens(msgs, 'sys'); // populate
    let passes = 0;
    const realStringify = JSON.stringify;
    JSON.stringify = function (...a) { passes++; return realStringify.apply(this, a); };
    try {
      for (let i = 0; i < 50; i++) estimateRequestTokens(msgs, 'sys');
    } finally {
      JSON.stringify = realStringify;
    }
    assert.equal(passes, 0, `0 serializations expected on a cache hit path, saw ${passes}`);
  });
});

describe('prompt assembly is cheap and cacheable', () => {
  it('caches: identical inputs return the identical string', () => {
    const a = buildSystemPrompt({ mode: 'BUILD', dir, request: 'fix the bug' });
    const b = buildSystemPrompt({ mode: 'BUILD', dir, request: 'fix the bug' });
    assert.equal(a, b);
  });

  it('does not return a stale prompt when the request changes', () => {
    seedSkills(2, { prefix: 'alpha' });
    const one = buildSystemPrompt({ mode: 'BUILD', dir, request: 'alpha' });
    const d = join(dir, '.sentinel', 'skills', 'beta-skill');
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'SKILL.md'), '---\nname: beta-skill\ndescription: beta\n---\nb', 'utf-8');
    const two = buildSystemPrompt({ mode: 'BUILD', dir, request: 'beta-skill' });
    assert.notEqual(one, two, 'a different request must not hit the old cache entry');
  });

  it('forgets the git branch when flushed', () => {
    const a = currentGitBranch(dir);
    currentGitBranch(dir);
    flushPromptCache();
    const b = currentGitBranch(dir);
    assert.equal(a, b, 'flush re-reads but the value is the same in a stable repo');
  });

  it('keeps the whole system prompt small enough to be a fixed prefix', () => {
    seedSkills(300);
    const p = buildSystemPrompt({ mode: 'BUILD', dir, request: 'anything' });
    assert.ok(p.length < 8000, `system prompt ${p.length} chars (was ~59k un-capped)`);
  });
});

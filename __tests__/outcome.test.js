/**
 * Outcome contracts — vague ask in, judgeable contract out.
 * Every model call is injected, so the whole file runs with no API key.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseContract, contractGaps, validateContract, writeContract, readContract, contractFile,
  renderContract, contractBrief, workerBrief, nextQuestion, buildOutcome, draftOutcome,
  CONTRACT_FIELDS, FIELD_KEYS, OUTCOME_VERSION, INTERVIEW_MAX_ROUNDS,
} from '../src/agent/outcome.js';
import { parseVerdict } from '../src/agent/goal.js';

const COMPLETE = {
  current: 'src/sync/batch.js:44 rewrites every row on a full-table change',
  target: 'P95 sync latency under 2s on a 10k-row batch',
  verification: 'npm run sync-test exits 0 and reports p95 < 2000',
  blastRadius: 'the sync cursor table and anything downstream of it',
  rollback: 'git revert <sha> and re-run the backfill from the last cursor',
  unknowns: ['production p95 was never measured, only staging'],
};

const tmp = () => mkdtempSync(join(tmpdir(), 'sentinel-outcome-'));

/** Scripted provider: returns each queued payload in turn, then echoes. */
function scriptedStream(...payloads) {
  let i = 0;
  return async function* () {
    const text = typeof payloads[i] === 'function' ? payloads[i]() : payloads[i];
    i++;
    if (text == null) return;
    yield { type: 'text', text: String(text) };
  };
}

describe('parseContract', () => {
  test('reads the six fields out of prose-wrapped JSON', () => {
    const c = parseContract(`Sure! Here is the contract:\n${JSON.stringify(COMPLETE)}\nHope that helps.`);
    assert.equal(c.target, COMPLETE.target);
    assert.deepEqual(c.unknowns, COMPLETE.unknowns);
  });

  test('survives a brace inside a string value', () => {
    const c = parseContract(JSON.stringify({ ...COMPLETE, current: 'matches /\\{foo\\}/ at src/a.js:1' }));
    assert.equal(c.current, 'matches /\\{foo\\}/ at src/a.js:1');
  });

  test('returns null rather than a half-built object', () => {
    assert.equal(parseContract('no json here at all'), null);
    assert.equal(parseContract('{"current": "unterminated'), null);
  });

  test('keeps every declared field, defaulting the rest', () => {
    const c = parseContract('{"target": "x"}');
    for (const k of FIELD_KEYS) assert.ok(k in c, `missing ${k}`);
    assert.equal(c.verification, '');
    assert.deepEqual(c.unknowns, []);
  });

  test('normalizes an unknown string into an array', () => {
    const c = parseContract(JSON.stringify({ unknowns: 'one guess' }));
    assert.deepEqual(c.unknowns, ['one guess']);
  });
});

describe('contractGaps', () => {
  test('a complete contract has no gaps', () => {
    assert.deepEqual(contractGaps(COMPLETE), []);
  });

  test('an empty unknown list is honest, not a gap', () => {
    assert.deepEqual(contractGaps({ ...COMPLETE, unknowns: [] }), []);
  });

  test('reports each missing field', () => {
    assert.deepEqual(contractGaps({ ...COMPLETE, verification: '' }), ['verification']);
    assert.deepEqual(contractGaps({}), ['current', 'target', 'verification', 'blastRadius', 'rollback']);
  });
});

describe('validateContract', () => {
  test('accepts a contract missing only the advisory fields', () => {
    const c = validateContract({ current: 'a', target: 'b', verification: 'c' });
    assert.equal(c.verification, 'c');
  });

  test('refuses a contract with no proof', () => {
    assert.throws(() => validateContract({ current: 'a', target: 'b' }), /VERIFICATION/);
  });
});

describe('persistence', () => {
  test('round-trips through .sentinel/outcome.json', () => {
    const dir = tmp();
    writeContract({ ask: 'the sync is flaky', ...COMPLETE }, dir);
    const back = readContract(dir);
    assert.equal(back.version, OUTCOME_VERSION);
    assert.equal(back.ask, 'the sync is flaky');
    assert.equal(back.target, COMPLETE.target);
    assert.deepEqual(back.unknowns, COMPLETE.unknowns);
    assert.ok(existsSync(contractFile(dir)));
    rmSync(dir, { recursive: true, force: true });
  });

  test('readContract returns null, not a throw, when there is none', () => {
    const dir = tmp();
    assert.equal(readContract(dir), null);
    rmSync(dir, { recursive: true, force: true });
  });

  test('survives a corrupt file', () => {
    const dir = tmp();
    mkdirSync(join(dir, '.sentinel'), { recursive: true });
    writeFileSync(contractFile(dir), '{not json', 'utf-8');
    assert.equal(readContract(dir), null);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('rendering', () => {
  test('renders every field with its label', () => {
    const md = renderContract(COMPLETE);
    for (const f of CONTRACT_FIELDS) assert.ok(md.includes(f.label), f.label);
    assert.ok(md.includes(COMPLETE.target));
  });

  test('contractBrief is one flat line per field, for the judge', () => {
    const brief = contractBrief(COMPLETE);
    assert.equal(brief.split('\n').length, CONTRACT_FIELDS.length);
    assert.ok(brief.includes('TARGET:'));
  });

  test('workerBrief surfaces the inherited assumptions', () => {
    assert.ok(workerBrief(COMPLETE).includes(COMPLETE.unknowns[0]));
  });

  test('workerBrief omits the assumptions section when there are none', () => {
    const brief = workerBrief({ ...COMPLETE, unknowns: [] });
    assert.ok(!brief.includes('assumed when the contract was written'));
    assert.ok(brief.includes('Prove the work'));
  });
});

describe('nextQuestion', () => {
  test('asks for verification first, since an unprovable contract is worthless', () => {
    assert.equal(nextQuestion({ current: 'a', target: 'b' }), CONTRACT_FIELDS.find((f) => f.key === 'verification').prompt);
  });

  test('returns null once complete', () => {
    assert.equal(nextQuestion(COMPLETE), null);
  });
});

describe('draftOutcome', () => {
  test('a complete contract comes back complete', async () => {
    const d = await draftOutcome({
      ask: 'the sync is flaky',
      modelId: 'm',
      createStream: scriptedStream(JSON.stringify(COMPLETE)),
    });
    assert.equal(d.complete, true);
    assert.deepEqual(d.gaps, []);
    assert.equal(d.contract.ask, 'the sync is flaky');
  });

  test('names the gaps rather than pretending it succeeded', async () => {
    const d = await draftOutcome({
      ask: 'make it faster',
      modelId: 'm',
      createStream: scriptedStream(JSON.stringify({ ...COMPLETE, verification: '', blastRadius: '' })),
    });
    assert.equal(d.complete, false);
    assert.deepEqual(d.gaps, ['verification', 'blastRadius']);
  });

  test('a provider error yields null, not a broken contract', async () => {
    async function* boom() { yield { type: 'error', message: 'rate limited' }; }
    assert.equal(await draftOutcome({ ask: 'x', modelId: 'm', createStream: boom }), null);
  });
});

describe('buildOutcome interview', () => {
  test('keeps asking until the contract has no gaps', async () => {
    const rounds = [
      JSON.stringify({ ...COMPLETE, verification: '', blastRadius: '' }),
      JSON.stringify({ ...COMPLETE, blastRadius: '' }),
      JSON.stringify(COMPLETE),
    ];
    const asked = [];
    const res = await buildOutcome({
      ask: 'the sync is flaky',
      modelId: 'm',
      createStream: scriptedStream(...rounds),
      onAsk: async (q) => { asked.push(q); return 'answer'; },
    });
    assert.equal(res.complete, true);
    assert.equal(asked.length, 3);
    assert.equal(asked.length, res.asked.length);
    assert.deepEqual(contractGaps(res.contract), []);
    assert.equal(res.contract.ask, 'the sync is flaky');
  });

  test('stops at the round limit and says why', async () => {
    const never = JSON.stringify({ ...COMPLETE, verification: '' });
    const res = await buildOutcome({
      ask: 'x',
      modelId: 'm',
      maxRounds: 2,
      createStream: scriptedStream(never, never, never, never, never),
      onAsk: async () => 'vague answer',
    });
    assert.equal(res.complete, false);
    assert.match(res.reason, /2-round limit/);
    assert.equal(res.asked.length, 2);
  });

  test('a requester who walks away leaves an incomplete contract, not a crash', async () => {
    const res = await buildOutcome({
      ask: 'x',
      modelId: 'm',
      createStream: scriptedStream(JSON.stringify(COMPLETE)),
      onAsk: async () => null,
    });
    assert.equal(res.complete, false);
    assert.equal(res.asked.length, 0);
  });

  test('unparseable output ends the interview with a reason', async () => {
    const res = await buildOutcome({
      ask: 'x',
      modelId: 'm',
      createStream: scriptedStream('I would rather not.'),
      onAsk: async () => 'answer',
    });
    assert.equal(res.complete, false);
    assert.match(res.reason, /no parseable output/);
  });

  test('default round limit is bounded', () => {
    assert.ok(INTERVIEW_MAX_ROUNDS >= 2 && INTERVIEW_MAX_ROUNDS <= 8);
  });
});

describe('goal evaluator verdicts', () => {
  test('an unknown verdict is parsed, not collapsed into ok=false', () => {
    const v = parseVerdict('{"ok": false, "reason": "TARGET is not measurable", "impossible": false, "unknown": true}');
    assert.equal(v.unknown, true);
    assert.equal(v.ok, false);
    assert.equal(v.impossible, false);
  });

  test('the three verdicts stay mutually exclusive', () => {
    for (const [field, expected] of [['ok', true], ['impossible', true], ['unknown', true]]) {
      const v = parseVerdict(`{"ok": ${field === 'ok'}, "reason": "r", "impossible": ${field === 'impossible'}, "unknown": ${field === 'unknown'}}`);
      const hits = [v.ok, v.impossible, v.unknown].filter(Boolean).length;
      assert.equal(hits, 1, `${field} produced ${hits} verdicts`);
      assert.equal(v[field], expected);
    }
  });

  test('unparseable output is a retry, never an unknown', () => {
    const v = parseVerdict('maybe?');
    assert.equal(v.unknown, false);
    assert.equal(v.impossible, false);
    assert.match(v.reason, /no parseable verdict/);
  });
});

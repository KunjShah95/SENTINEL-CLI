/**
 * The consumer must not silently lose events.
 *
 * This file asserts *coverage*, not behaviour, and the distinction is the point.
 * Four hand-written print loops once lived in `main.js` and each handled a
 * different subset of the stream: `ask` rendered receipts, `goal` did not; the
 * skill runner printed `budgetUsd`, which the loop has never read, so its budget
 * flag did nothing while appearing in `--help`.
 *
 * None of that failed a test, because from the outside a dropped event and an
 * event with nothing to say look identical. That is the same failure mode as an
 * unclassified tool in `tool-taxonomy.test.js` — a skipped check that looks like
 * a passing one — and it is only caught by looking.
 *
 * So: read `loop.js`, collect every event name it can yield, and require the
 * consumer to account for each one. A new event that nobody renders fails here
 * instead of being discovered by a user wondering why the output went quiet.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { PRINTED_EVENTS, IGNORED_EVENTS } from '../src/agent/run.js';

const LOOP = join(process.cwd(), 'src', 'agent', 'loop.js');

/**
 * Every event name `loop.js` yields, scraped from `event: '...'`.
 *
 * Scraping source rather than importing a list is deliberate: the list would be
 * maintained by the same person who breaks it, and a constant in the module that
 * emits events cannot disagree with itself. Reading the source is the only
 * version of this check that fails when it should.
 */
async function eventsTheLoopYields() {
  const src = await readFile(LOOP, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/\bevent:\s*'([a-z_]+)'/g)) names.add(m[1]);
  return names;
}

describe('consumer coverage', () => {
  test('the consumer accounts for every event the loop can yield', async () => {
    const yielded = await eventsTheLoopYields();
    const known = new Set([...PRINTED_EVENTS, ...IGNORED_EVENTS]);
    const unhandled = [...yielded].filter((e) => !known.has(e));
    assert.deepEqual(unhandled, [],
      `loop.js yields events the terminal consumer ignores: ${unhandled.join(', ')}. `
      + 'Add a case to runTask\'s printer and to PRINTED_EVENTS, or list it in IGNORED_EVENTS if it is terminal-only.');
  });

  test('PRINTED_EVENTS and IGNORED_EVENTS do not overlap', () => {
    const overlap = PRINTED_EVENTS.filter((e) => IGNORED_EVENTS.includes(e));
    assert.deepEqual(overlap, [], `an event is both printed and ignored: ${overlap.join(', ')}`);
  });

  test('the ignored list is only `done`', () => {
    // Everything ignored is something a consumer could have rendered. `done`
    // means "the stream ended" and carries nothing; anything else here is output
    // the user used to get and has quietly stopped getting.
    assert.deepEqual([...IGNORED_EVENTS], ['done']);
  });

  test('the loop really does yield the events this file claims', async () => {
    // Guards the scraper itself. If the regex in eventsTheLoopYields stops
    // matching — a refactor to a template literal, say — the test above would go
    // green on an empty set, which is the worst possible failure for a test whose
    // whole job is to notice absence.
    const yielded = await eventsTheLoopYields();
    assert.ok(yielded.size >= 10, `scraper only found ${yielded.size} events; it is probably broken`);
    for (const expected of ['text', 'tool_call', 'tool_result', 'finish', 'error']) {
      assert.ok(yielded.has(expected), `scraper missed the '${expected}' event`);
    }
  });
});

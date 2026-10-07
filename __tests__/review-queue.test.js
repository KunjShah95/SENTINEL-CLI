/**
 * The coalescing queue.
 *
 * These cover `src/agent/review-queue.js`, which is deliberately not tied to any
 * one caller: the queue takes an opaque `key`, so a build, a deploy or a review
 * can all use it.
 *
 * Coalescing is the part worth testing hard. It is the difference between a
 * reviewer and a spam bot: ten branches rebased after a rename should produce
 * one review of the newest head, not ten reviews of ten intermediate heads.
 *
 * Three of these tests were written after a bug, and the comments say which.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CoalescingQueue,
  pullRequestKey,
  jobId,
  DEFAULT_CONCURRENCY,
  DEFAULT_MAX_QUEUED,
} from '../src/agent/review-queue.js';

function makeQueue(opts = {}) {
  const events = [];
  const started = [];
  const queue = new CoalescingQueue({
    concurrency: opts.concurrency ?? 1,
    maxQueued: opts.maxQueued ?? 10,
    jobTimeoutMs: opts.jobTimeoutMs ?? 5_000,
    onEvent: (e) => events.push(e),
    run:
      opts.run ??
      (async (job) => {
        started.push(job.payload);
        return { summary: `reviewed ${job.payload.pr}@${job.payload.head}` };
      }),
  });
  return { queue, events, started };
}

/** A pull-request-shaped payload, since that is what the key exists for. */
const job = (pr, head, payload = { pr, head }) => ({
  key: pullRequestKey('acme/api', pr),
  payload,
});

describe('key helpers', () => {
  it('keys a pull request by repo and number', () => {
    assert.equal(pullRequestKey('acme/api', 42), 'acme/api#42');
    assert.notEqual(pullRequestKey('acme/api', 42), pullRequestKey('acme/api', 43));
    assert.notEqual(pullRequestKey('acme/api', 1), pullRequestKey('acme/web', 1));
  });

  it('makes a job id that is unique across re-queues', () => {
    // The key alone is not unique: a finished job is re-queued when its head
    // moves, and two runs of one pull request would then share an id.
    assert.notEqual(jobId('acme/api#42', 1), jobId('acme/api#42', 2));
  });
});

describe('CoalescingQueue: concurrency', () => {
  it('never exceeds its concurrency limit', async () => {
    let live = 0;
    let peak = 0;
    const { queue } = makeQueue({
      concurrency: 2,
      run: async () => {
        live++;
        peak = Math.max(peak, live);
        await new Promise((r) => setTimeout(r, 30));
        live--;
        return { summary: 'ok' };
      },
    });

    for (let i = 0; i < 8; i++) queue.enqueue(job(i, `sha${i}`));
    await queue.drain();

    assert.equal(peak, 2, 'three or more ran at once');
    assert.equal(queue.stats().done, 8);
  });

  it('runs different pull requests in parallel', async () => {
    let live = 0;
    let peak = 0;
    const { queue } = makeQueue({
      concurrency: 4,
      run: async () => {
        live++;
        peak = Math.max(peak, live);
        await new Promise((r) => setTimeout(r, 20));
        live--;
        return { summary: 'ok' };
      },
    });
    queue.enqueue(job(1, 'a'));
    queue.enqueue(job(2, 'b'));
    queue.enqueue(job(3, 'c'));
    await queue.drain();
    assert.equal(peak, 3, 'three distinct PRs overlapped');
  });

  it('has documented defaults rather than magic numbers at the call site', () => {
    assert.equal(DEFAULT_CONCURRENCY, 2);
    assert.equal(DEFAULT_MAX_QUEUED, 50);
    assert.equal(makeQueue().queue.concurrency, 1, 'the helper overrides for tests');
  });
});

describe('CoalescingQueue: coalescing', () => {
  it('replaces a queued job when a newer head arrives', async () => {
    const { queue, started } = makeQueue({ concurrency: 1 });
    queue.enqueue(job(1, 'aaa'));
    queue.enqueue(job(1, 'bbb'));
    await queue.drain();

    assert.equal(started.length, 2, 'the first head ran, then the newer one');
    assert.deepEqual(started.map((s) => s.head), ['aaa', 'bbb']);
  });

  it('carries the new payload with the new head', async () => {
    // The bug this guards: keeping the old payload means the work reads a
    // superseded title or a stale base ref against the current commit.
    const seen = [];
    let release = () => {};
    const gate = new Promise((r) => {
      release = r;
    });
    const { queue } = makeQueue({
      concurrency: 1,
      run: async (j) => {
        seen.push(j.payload);
        if (seen.length === 1) await gate;
        return { summary: 'ok' };
      },
    });

    queue.enqueue(job(1, 'aaa', { n: 1 }));
    await new Promise((r) => setTimeout(r, 10));
    queue.enqueue(job(1, 'bbb', { n: 2 }));
    release();
    await queue.drain();

    assert.deepEqual(seen, [{ n: 1 }, { n: 2 }]);
  });

  it('does not start a second concurrent job for a running key', async () => {
    // Both would post comments, and the second would land on a commit the first
    // never saw.
    let live = 0;
    const heads = [];
    const { queue } = makeQueue({
      concurrency: 4,
      run: async (j) => {
        heads.push(j.payload.head);
        live++;
        await new Promise((r) => setTimeout(r, 40));
        live--;
        return { summary: 'ok' };
      },
    });

    queue.enqueue(job(1, 'aaa'));
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(queue.enqueue(job(1, 'bbb')), 'coalesced');
    assert.equal(live, 1, 'still one job for that key');

    await queue.drain();
    assert.deepEqual(heads, ['aaa', 'bbb']);
  });

  it('reviews the newer head after the running one, not never', async () => {
    // THE bug. No broker redelivers, so dropping the newer head means that pull
    // request is NEVER reviewed, silently, with no error anywhere. The first
    // implementation did exactly this and returned 'coalesced'.
    const heads = [];
    const { queue } = makeQueue({
      concurrency: 1,
      run: async (j) => {
        heads.push(j.payload.head);
        await new Promise((r) => setTimeout(r, 40));
        return { summary: 'ok' };
      },
    });
    queue.enqueue(job(1, 'aaa'));
    await new Promise((r) => setTimeout(r, 10));
    queue.enqueue(job(1, 'bbb'));
    await queue.drain();

    assert.deepEqual(heads, ['aaa', 'bbb']);
    assert.equal(queue.get(pullRequestKey('acme/api', 1)).pending, null, 'nothing is left parked');
  });

  it('parks only the newest head when several arrive mid-run', async () => {
    const heads = [];
    const { queue } = makeQueue({
      concurrency: 1,
      run: async (j) => {
        heads.push(j.payload.head);
        await new Promise((r) => setTimeout(r, 50));
        return { summary: 'ok' };
      },
    });
    queue.enqueue(job(1, 'aaa'));
    await new Promise((r) => setTimeout(r, 10));
    queue.enqueue(job(1, 'bbb'));
    queue.enqueue(job(1, 'ccc'));
    await queue.drain();

    assert.deepEqual(heads, ['aaa', 'ccc'], 'bbb was superseded before it ran');
  });

  it('lets a finished key be worked again on a new head', async () => {
    const { queue, started } = makeQueue({ concurrency: 1 });
    queue.enqueue(job(1, 'aaa'));
    await queue.drain();
    assert.equal(queue.enqueue(job(1, 'bbb')), 'coalesced');
    await queue.drain();
    assert.deepEqual(started.map((s) => s.head), ['aaa', 'bbb']);
  });

  it('keeps different keys independent', async () => {
    const { queue, started } = makeQueue({ concurrency: 2 });
    queue.enqueue(job(1, 'aaa'));
    queue.enqueue(job(2, 'aaa'));
    await queue.drain();
    assert.equal(started.length, 2);
  });
});

describe('CoalescingQueue: limits', () => {
  it('rejects once the queue is full', async () => {
    let release = () => {};
    const gate = new Promise((r) => {
      release = r;
    });
    const { queue } = makeQueue({
      concurrency: 1,
      maxQueued: 2,
      run: async () => {
        await gate;
        return { summary: 'ok' };
      },
    });

    queue.enqueue(job(1, 'a'));
    queue.enqueue(job(2, 'b'));
    queue.enqueue(job(3, 'c'));
    assert.equal(queue.enqueue(job(4, 'd')), 'rejected', 'the cap is on waiting jobs');
    release();
    await queue.drain();
  });

  it('frees a slot when a job finishes', async () => {
    const { queue } = makeQueue({ concurrency: 2, maxQueued: 1 });
    queue.enqueue(job(1, 'a'));
    await queue.drain();
    assert.equal(queue.enqueue(job(2, 'b')), 'queued', 'a finished job is no longer waiting');
  });

  it('abandons a job that overruns its timeout', async () => {
    const { queue } = makeQueue({
      jobTimeoutMs: 30,
      run: () => new Promise(() => {}),
    });
    queue.enqueue(job(1, 'a'));
    await queue.drain(2000);

    const j = queue.get(pullRequestKey('acme/api', 1));
    assert.equal(j.state, 'failed', 'a hung job must not hold a worker');
    assert.match(j.error ?? '', /timed out/);
    assert.equal(j.summary, null, 'and must not be reported as a success');
  });

  it('records a thrown failure without stopping the queue', async () => {
    const { queue } = makeQueue({
      run: async (j) => {
        if (j.payload.pr === 1) throw new Error('boom');
        return { summary: 'ok' };
      },
    });
    queue.enqueue(job(1, 'a'));
    queue.enqueue(job(2, 'b'));
    await queue.drain();

    assert.equal(queue.get(pullRequestKey('acme/api', 1)).error, 'boom');
    assert.equal(queue.get(pullRequestKey('acme/api', 2)).state, 'done');
  });
});

describe('CoalescingQueue: observation', () => {
  it('emits the lifecycle in order', async () => {
    const { queue, events } = makeQueue();
    queue.enqueue(job(1, 'a'));
    await queue.drain();
    const types = events.map((e) => e.type);
    assert.ok(types.indexOf('enqueued') < types.indexOf('started'));
    assert.ok(types.indexOf('started') < types.indexOf('finished'));
  });

  it('lists newest first, by sequence rather than by timestamp', async () => {
    // Two jobs enqueued in the same millisecond tie on a timestamp, and the sort
    // silently falls back to insertion order. A counter cannot collide.
    const { queue } = makeQueue({ concurrency: 1 });
    queue.enqueue(job(1, 'a'));
    queue.enqueue(job(2, 'b'));
    await queue.drain();
    assert.deepEqual(queue.list().map((j) => j.payload.pr), [2, 1]);
  });

  it('survives a listener that throws', async () => {
    // A broken dashboard must not stop work.
    const { queue } = makeQueue();
    queue.onEvent(() => {
      throw new Error('listener exploded');
    });
    queue.enqueue(job(1, 'a'));
    await queue.drain();
    assert.equal(queue.get(pullRequestKey('acme/api', 1)).state, 'done');
  });

  it('unsubscribes a listener', async () => {
    const { queue } = makeQueue();
    let count = 0;
    const off = queue.onEvent(() => count++);
    queue.enqueue(job(1, 'a'));
    const afterFirst = count;
    off();
    await queue.drain();
    assert.equal(count, afterFirst, 'nothing arrived after unsubscribe');
  });
});

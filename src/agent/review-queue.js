/**
 * Coalescing work queue.
 *
 * Moved into Sentinel from the PR Owl app. It is not GitHub-specific and it is
 * not reviewer-specific: it is "start work, but if the same thing is asked for
 * again, do it once."
 *
 * The problem it solves is delivery amplification. Webhooks arrive faster than
 * work finishes, and `synchronize` means "the branch moved", not "review this
 * commit". Ten branches rebased after a rename is one intent, not ten. Handle
 * them naively and you review ten commits, post comments on ten of them, and
 * the last one wins — so a human reads five reviews of code that no longer
 * exists and concludes the tool is broken. No error is ever logged.
 *
 * Three properties, each of which cost a bug to learn:
 *
 *   1. KEYED, NOT A LIST. A map keyed by the dedup key (`owner/repo#42`), so a
 *      second request folds into the existing job instead of queueing behind it.
 *
 *   2. PARKING, NOT DROPPING. A newer request that arrives while a job is
 *      RUNNING is parked and run afterwards. Dropping it means it is never done,
 *      because no broker redelivers. This was a real bug: the first version
 *      returned "coalesced" and discarded the new work, so a push mid-review was
 *      silently never reviewed.
 *
 *   3. A MONOTONIC SEQUENCE, NOT A TIMESTAMP. `enqueuedAt` is milliseconds, so
 *      two jobs can share one and "newest first" silently becomes insertion
 *      order. A counter cannot collide.
 *
 * Deliberately not here: durability. A restart loses queued work. For a reviewer
 * that is acceptable — a missed review is re-requested by a human — but it is a
 * real limitation and belongs in a comment, not in a hope.
 */

/**
 * @typedef {object} Job
 * @property {string} id
 * @property {string} key       dedup key, e.g. `owner/repo#42`
 * @property {number} seq       monotonic arrival counter
 * @property {'queued'|'running'|'done'|'failed'|'skipped'} state
 * @property {number} enqueuedAt
 * @property {number} startedAt
 * @property {number} finishedAt
 * @property {number} attempts
 * @property {string|null} error
 * @property {string|null} summary
 * @property {*} payload        opaque to the queue; never inspected here
 * @property {{payload: *, seq: number}|null} pending
 *   a newer request that arrived mid-run, to be started when this one finishes
 */

/** @typedef {'enqueued'|'coalesced'|'started'|'finished'|'failed'} QueueEventType */

export const DEFAULT_CONCURRENCY = 2;
export const DEFAULT_MAX_QUEUED = 50;
export const DEFAULT_JOB_TIMEOUT_MS = 8 * 60_000;

/**
 * The key a pull request's deliveries coalesce on.
 *
 * @param {string} repo  `owner/name`
 * @param {number} prNumber
 * @returns {string} `owner/name#42`
 */
export function pullRequestKey(repo, prNumber) {
  return `${repo}#${prNumber}`;
}

/**
 * A job id unique across re-queues.
 *
 * The key alone is not unique — a finished job is re-queued when its head moves —
 * so the sequence number disambiguates. Without it two runs of the same pull
 * request produce the same id and any log keyed on it interleaves.
 */
export function jobId(key, seq) {
  return `${key}#${seq}`;
}

/**
 * @template T
 */
export class CoalescingQueue {
  /** @type {Map<string, Job>} */
  #byKey = new Map();
  /** @type {Set<Job>} */
  #running = new Set();
  /** @type {Set<(e: QueueEvent) => void>} */
  #listeners = new Set();
  #seq = 0;
  #concurrency;
  #maxQueued;
  #jobTimeoutMs;
  #run;
  #onEvent;
  #now;

  /**
   * @param {object} opts
   * @param {(job: Job) => Promise<{summary: string}>} opts.run
   *   Perform one job. Injected so the queue has no opinion about what the work
   *   is — that is the whole reason this is reusable outside PR Owl.
   */
  constructor({
    concurrency = DEFAULT_CONCURRENCY,
    maxQueued = DEFAULT_MAX_QUEUED,
    jobTimeoutMs = DEFAULT_JOB_TIMEOUT_MS,
    run,
    onEvent = () => {},
    now = () => Date.now(),
  }) {
    this.#concurrency = Math.max(1, concurrency);
    this.#maxQueued = Math.max(1, maxQueued);
    this.#jobTimeoutMs = jobTimeoutMs;
    this.#run = run;
    this.#onEvent = onEvent;
    this.#now = now;
  }

  get concurrency() {
    return this.#concurrency;
  }

  get maxQueued() {
    return this.#maxQueued;
  }

  /**
   * @returns {'queued'|'coalesced'|'rejected'}
   */
  enqueue({ key, payload = null }) {
    const existing = this.#byKey.get(key);

    if (existing) {
      if (existing.state === 'running') {
        // Park it. The run in flight keeps going — cancelling wastes the tokens
        // already spent — but its findings are about work that has been
        // superseded, so the new one is started when this finishes.
        existing.pending = { payload, seq: ++this.#seq };
        this.#emit({ type: 'coalesced', job: existing });
        return 'coalesced';
      }
      // Queued or finished: replace, INCLUDING the payload. Carrying a stale
      // payload forward is how a review reads a new title against an old base.
      existing.payload = payload;
      existing.pending = null;
      existing.state = 'queued';
      existing.error = null;
      existing.summary = null;
      existing.finishedAt = null;
      existing.enqueuedAt = this.#now();
      existing.seq = ++this.#seq;
      existing.id = jobId(key, existing.seq);
      this.#emit({ type: 'coalesced', job: existing });
      this.#pump();
      return 'coalesced';
    }

    if (this.#queuedCount() >= this.#maxQueued) return 'rejected';

    const seq = ++this.#seq;
    const job = {
      id: jobId(key, seq),
      key,
      seq,
      state: /** @type {const} */ ('queued'),
      enqueuedAt: this.#now(),
      startedAt: null,
      finishedAt: null,
      attempts: 0,
      error: null,
      summary: null,
      payload,
      pending: null,
    };
    this.#byKey.set(key, job);
    this.#emit({ type: 'enqueued', job });
    this.#pump();
    return 'queued';
  }

  #queuedCount() {
    let n = 0;
    for (const job of this.#byKey.values()) if (job.state === 'queued') n++;
    return n;
  }

  #pump() {
    if (this.#running.size >= this.#concurrency) return;
    const queued = [...this.#byKey.values()]
      .filter((j) => j.state === 'queued')
      .sort((a, b) => a.seq - b.seq);
    for (const job of queued) {
      if (this.#running.size >= this.#concurrency) return;
      this.#start(job);
    }
  }

  #start(job) {
    job.state = /** @type {const} */ ('running');
    job.startedAt = this.#now();
    job.attempts += 1;
    this.#running.add(job);
    this.#emit({ type: 'started', job });

    // A job that hangs must not hold a worker forever. The timeout rejects it,
    // and it is recorded as FAILED — never as done-with-no-summary, which would
    // be indistinguishable from a clean run.
    const timeout = new Promise((_, reject) => {
      const t = setTimeout(
        () => reject(new Error(`job timed out after ${this.#jobTimeoutMs}ms`)),
        this.#jobTimeoutMs,
      );
      t.unref?.();
    });

    Promise.race([this.#run(job), timeout])
      .then((r) => {
        job.state = /** @type {const} */ ('done');
        job.finishedAt = this.#now();
        job.summary = r?.summary ?? null;
        this.#emit({ type: 'finished', job, summary: job.summary });
      })
      .catch((e) => {
        job.state = /** @type {const} */ ('failed');
        job.finishedAt = this.#now();
        job.error = e?.message || String(e);
        this.#emit({ type: 'failed', job, error: job.error });
      })
      .finally(() => {
        this.#running.delete(job);
        // Work that arrived mid-run is picked up now. The summary from the run
        // just finished describes the superseded request, so it is cleared
        // rather than left to be read as a verdict on the current one.
        if (job.pending) {
          job.payload = job.pending.payload;
          job.pending = null;
          job.state = /** @type {const} */ ('queued');
          job.summary = null;
          job.error = null;
          job.finishedAt = null;
          job.enqueuedAt = this.#now();
          job.seq = ++this.#seq;
          job.id = jobId(job.key, job.seq);
        }
        this.#pump();
      });
  }

  onEvent(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #emit(e) {
    try {
      this.#onEvent(e);
    } catch {
      // Observability must never become control flow.
    }
    for (const fn of this.#listeners) {
      try {
        fn(e);
      } catch {
        // A broken dashboard must not stop work.
      }
    }
  }

  /** Newest first. */
  list() {
    return [...this.#byKey.values()].sort((a, b) => b.seq - a.seq);
  }

  get(key) {
    return this.#byKey.get(key) ?? null;
  }

  stats() {
    const out = { queued: 0, running: 0, done: 0, failed: 0, skipped: 0 };
    for (const job of this.#byKey.values()) out[job.state]++;
    return { ...out, concurrency: this.#concurrency, maxQueued: this.#maxQueued };
  }

  /** Test hook. */
  reset() {
    this.#byKey.clear();
    this.#running.clear();
  }

  /**
   * Wait for everything to settle. Used by tests and by graceful shutdown.
   * @returns {Promise<boolean>} false if the deadline passed with work left
   */
  async drain(timeoutMs = 10_000) {
    const started = this.#now();
    for (;;) {
      if (this.#running.size === 0 && this.#queuedCount() === 0) return true;
      if (this.#now() - started > timeoutMs) return false;
      await new Promise((r) => setTimeout(r, 10));
    }
  }
}

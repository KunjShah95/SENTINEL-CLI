/**
 * The webhook route.
 *
 * The order of the checks in this function is the design:
 *
 *   1. read the RAW body
 *   2. verify the signature against those raw bytes
 *   3. only then parse JSON
 *   4. only then decide whether this is a PR event
 *   5. enqueue and return 202
 *
 * Steps 1 and 2 in the other order — parse, then re-serialise, then verify — is
 * the mistake that produces either a reviewer that rejects every legitimate
 * delivery or, once someone "fixes" it by normalising both sides, one that will
 * accept an attacker's payload. `lib/webhook.ts` covers why.
 *
 * Step 5 is a 202, not a 200. The job runs after the response, so GitHub's
 * delivery timeout cannot kill a review that takes two minutes, and a GitHub
 * retry storm cannot become a bill.
 */
import { NextResponse } from 'next/server';
import { DELIVERY_HEADER, EVENT_HEADER, SIGNATURE_HEADER, verifySignature, shouldReview } from '../../../lib/webhook';
import type { PullRequestEvent } from '../../../lib/types';

// Node runtime: this needs crypto and the Sentinel agent, neither of which
// exists in the edge runtime.
export const runtime = 'nodejs';
// A review is queued, not awaited, so this must not be a cached route.
export const dynamic = 'force-dynamic';

/**
 * Held on `globalThis` so a hot reload in development does not lose every queued
 * review. A production process has one instance and does not need this; the
 * alternative — a module-level variable — is reset by every hot reload, which
 * makes the queue appear to drop jobs during development.
 */
const GLOBAL_KEY = Symbol.for('pr-owl.queue');

type Holder = { queue: import('../../../lib/queue').ReviewQueue; config: import('../../../lib/owl').OwlConfig };

function holder(): Holder {
  const g = globalThis as unknown as Record<symbol, Holder | undefined>;
  if (!g[GLOBAL_KEY]) {
    // Loaded lazily so a build without the environment set does not crash, and
    // so importing this module in a test does not require credentials.
    const { buildQueue, loadConfig } = require('../../../lib/owl') as typeof import('../../../lib/owl');
    const config = loadConfig();
    g[GLOBAL_KEY] = { config, queue: buildQueue(config, { onEvent: (e) => config.log(e.type, { job: e.job.id }) }) };
  }
  return g[GLOBAL_KEY]!;
}

export async function POST(req: Request): Promise<Response> {
  // 1. Raw bytes. Never `req.json()` here.
  const raw = await req.text();

  let config: Holder['config'];
  let queue: Holder['queue'];
  try {
    ({ config, queue } = holder());
  } catch (e) {
    // Misconfiguration is a 500 so GitHub does not retry — retrying cannot fix
    // a missing environment variable, and a retry storm on a broken deploy
    // hides the real error behind rate limiting.
    console.error('[pr-owl] not configured:', (e as Error).message);
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }

  // 2. Verify against the raw body.
  const verdict = verifySignature(raw, req.headers.get(SIGNATURE_HEADER), config.webhookSecret);
  if (!verdict.ok) {
    // 401 with no detail about which check failed: a response that distinguishes
    // "missing header" from "wrong digest" is a free oracle for probing.
    console.warn(`[pr-owl] rejected delivery: ${verdict.reason}`);
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const event = req.headers.get(EVENT_HEADER);
  const delivery = req.headers.get(DELIVERY_HEADER) ?? 'unknown';

  // 3. Parse, now that the bytes are trusted.
  let payload: PullRequestEvent;
  try {
    payload = JSON.parse(raw) as PullRequestEvent;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  // 4. Is this a PR we review?
  if (!shouldReview(event, payload.action)) {
    return NextResponse.json({ ok: true, ignored: true }, { status: 202 });
  }

  const pr = payload.pull_request;
  if (!pr?.number || !payload.repository?.full_name) {
    return NextResponse.json({ error: 'malformed event' }, { status: 400 });
  }

  // 5. Enqueue. The response says accepted, not reviewed.
  const result = queue.enqueue({
    repo: payload.repository.full_name,
    prNumber: pr.number,
    headSha: pr.head.sha,
    payload: {
      id: delivery,
      repo: payload.repository.full_name,
      prNumber: pr.number,
      headSha: pr.head.sha,
      headRepo: pr.head.repo?.full_name ?? null,
      title: pr.title ?? '',
      body: pr.body ?? null,
      author: pr.user?.login ?? '',
      draft: Boolean(pr.draft),
      baseRef: pr.base?.ref ?? 'main',
    },
  });

  if (result === 'rejected') {
    // The queue is full. 503 asks GitHub to retry, which is the right answer:
    // dropping the review silently means a real PR gets no review at all.
    return NextResponse.json({ error: 'queue full' }, { status: 503 });
  }

  return NextResponse.json({ ok: true, queued: result, delivery }, { status: 202 });
}

/** GitHub pings this on install; a liveness answer with no work done. */
export async function GET(): Promise<Response> {
  return NextResponse.json({ ok: true, service: 'pr-owl' });
}

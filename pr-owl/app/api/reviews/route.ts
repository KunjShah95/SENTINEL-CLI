/**
 * What the reviews are doing. No auth, because this returns no secrets — job
 * ids, states and counts — and it exists so a human can see whether the reviewer
 * is working without opening the logs.
 *
 * If this ever grows to include diff content or tokens, it needs auth. Noted
 * here so that decision is made deliberately rather than by whoever adds the
 * next field.
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const g = globalThis as unknown as Record<symbol, { queue: import('../../../lib/queue').ReviewQueue } | undefined>;
  const entry = g[Symbol.for('pr-owl.queue')];
  if (!entry) {
    return NextResponse.json({ error: 'no queue — no delivery has been accepted yet' }, { status: 503 });
  }

  const jobs = entry.queue.list().map((j) => ({
    repo: j.repo,
    pr: j.prNumber,
    head: j.headSha.slice(0, 7),
    state: j.state,
    attempts: j.attempts,
    summary: j.summary,
    error: j.error,
    queuedAt: new Date(j.enqueuedAt).toISOString(),
  }));

  return NextResponse.json({ stats: entry.queue.stats(), jobs });
}

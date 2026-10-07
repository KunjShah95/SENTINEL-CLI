import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { CompareTable, Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "pr-owl-review-queue",
  title: "A queue that coalesces, and the push that arrives mid-review",
  metaTitle: "PR Owl Part 5: The Review Queue",
  description:
    "Bounded concurrency, head coalescing, and the case for parking a pull request that gets a new commit while the reviewer is still reading the old one — because GitHub does not redeliver.",
  date: "2026-10-06",
  readingMinutes: 11,
  tags: ["Tutorial", "Queues", "Concurrency", "GitHub"],
  keyword: "webhook queue coalescing concurrency",
  series: { slug: "pr-owl-course", order: 5 },
  related: ["pr-owl-review-policy", "chat-cli-async-generators", "live-agent-loop-tracking"],
  faq: [
    {
      q: "Why not use BullMQ or a hosted queue?",
      a: "Because this queue is thirty lines of scheduling logic and a durable queue is a datastore, an idempotency story and a failure mode where a job is redelivered after the work already happened. Both are defensible. The argument for the in-memory version is that a missed review gets re-requested by a human, while a duplicated one is a bug someone notices — and PR Owl coalesces on the pull request, so redelivery is already a no-op.",
    },
    {
      q: "What happens if the server restarts mid-review?",
      a: "The in-memory queue loses it. The pull request gets no review, silently. That is a real limitation and `pr-owl/README.md` says so rather than burying it. The mitigation is the check run: PR Owl creates one at the start of a review and completes it at the end, so a failed review shows as a stale or missing check rather than as nothing at all.",
    },
    {
      q: "How many concurrent reviews should I run?",
      a: "Two. Each review is a clone, a diff read and a model turn, and the clone is I/O-bound while the model call is not — so concurrency helps until you saturate your disk or your provider's rate limit, and hurts after that. The default is 2 and the honest reason is that it is the number where nobody has had to debug it yet.",
    },
    {
      q: "Does the queue prevent replayed webhooks from causing duplicate reviews?",
      a: "Yes, as a side effect rather than by design. GitHub retries a delivery on any non-2xx, and the queue treats a repeat of the same head commit as a no-op, so a retry storm is free. That happens to be the same mechanism that coalesces rebases, which is why there is no separate replay-protection code.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          Webhooks arrive faster than reviews finish, and a{" "}
          <code className="font-mono text-[13px]">synchronize</code> event means &ldquo;the
          branch moved&rdquo;, not &ldquo;review this commit&rdquo;. Ten branches rebased
          after a rename is{" "}
          <strong>one review of the newest head</strong>.
        </p>
        <p>
          The rule that took the longest to get right: a push that arrives{" "}
          <em>while a review is running</em> must be parked and run afterwards. Dropping it
          means it is never reviewed, because{" "}
          <strong>GitHub does not redeliver</strong>.
        </p>
      </KeyTakeaways>

      <H2 id="problem" text="The event you actually receive" />
      <p>
        Here is what a rename-and-rebase looks like to your app: one{" "}
        <code className="font-mono text-[13px]">synchronize</code> event per branch, ten
        branches, arriving within a few seconds. Each is a legitimate delivery with a
        legitimate signature.
      </p>
      <p>
        Handle them naively and you review ten commits, post comments on ten of them, and
        the last one wins — so a human reads five reviews of code that no longer exists and
        concludes the tool is broken. That is the single fastest way to get an AI reviewer
        uninstalled, and no error is ever logged.
      </p>

      <H2 id="key" text="One key, not a queue per event" />
      <p>
        The queue is a map keyed by{" "}
        <code className="font-mono text-[13px]">owner/repo#number</code>, not a list. That is
        the whole design: a second delivery for a pull request already known{" "}
        <em>folds into</em> it rather than joining behind it.
      </p>
      <CodeBlock
        label="pr-owl/lib/queue.ts"
        code={`enqueue<T>(input: { repo: string; prNumber: number; headSha: string; payload: T }): EnqueueResult {
  const key = \`\${input.repo}#\${input.prNumber}\`;
  const existing = this.#byRepo.get(key) as Job<T> | undefined;

  if (existing) {
    if (existing.headSha === input.headSha && existing.pending?.headSha !== input.headSha) {
      // GitHub redelivers on any non-2xx. Idempotent: review once.
      return 'coalesced';
    }
    if (existing.state === 'running') {
      // Park it. See the long comment below.
      existing.pending = { headSha: input.headSha, payload: input.payload };
      existing.generation += 1;
      this.#emit({ type: 'coalesced', job: existing, replaced: existing });
      return 'coalesced';
    }
    // Queued or finished: replace the pending work with the newer head, payload
    // included. A review that read the new title against the old base ref is
    // worse than one that never ran.
    existing.headSha = input.headSha;
    existing.payload = input.payload;
    existing.pending = null;
    existing.generation += 1;
    existing.state = 'queued';
    existing.error = null;
    existing.summary = null;
    existing.finishedAt = null;
    this.#emit({ type: 'coalesced', job: existing, replaced: existing });
    this.#pump();
    return 'coalesced';
  }
  // ...new job
}`}
      />
      <p>
        Two details that are easy to miss. The <strong>payload is replaced</strong>, not just
        the sha — a stale payload means the reviewer reads yesterday&rsquo;s title against
        today&rsquo;s commit. And the{" "}
        <strong>summary is cleared</strong>, because otherwise a human looking at{" "}
        <code className="font-mono text-[13px]">GET /api/reviews</code> reads a verdict
        about a commit that is no longer the head.
      </p>

      <H2 id="mid-review" text="The push that arrives mid-review" />
      <p>
        This is the case that took the most care, because the obvious implementations are
        both wrong.
      </p>
      <CompareTable
        caption="What to do when a new head arrives while a review is running"
        head={["Approach", "What happens", "Verdict"]}
        rows={[
          [
            "Ignore it",
            "The pull request is never reviewed at the new head. GitHub does not redeliver, so there is no second chance.",
            "Wrong, and silently",
          ],
          [
            "Start a second review now",
            "Two reviews post comments. The second lands on a commit the first never saw.",
            "Wrong, and noisy",
          ],
          [
            "Cancel and restart",
            "Wastes the tokens already spent, and the model may have posted nothing useful.",
            "Wrong, and wasteful",
          ],
          [
            "Park it and run after",
            "The current review finishes; the new head is reviewed next.",
            "Right",
          ],
        ]}
      />
      <p>
        Parking is one field and a few lines in the completion handler.
      </p>
      <CodeBlock
        label="pr-owl/lib/queue.ts"
        code={`      .finally(() => {
        this.#running.delete(job);
        // A head that arrived mid-run is picked up now. The summary from the
        // run just finished describes the old commit, so it is cleared rather
        // than left to be read as a verdict on the new one.
        if (job.pending) {
          job.headSha = job.pending.headSha;
          job.payload = job.pending.payload;
          job.pending = null;
          job.state = 'queued';
          job.summary = null;
          job.error = null;
          job.finishedAt = null;
          job.enqueuedAt = this.#opts.now();
        }
        this.#pump();
      });`}
      />
      <Callout title="This was a real bug, and the test that caught it was written to assert something else">
        <p>
          The first version returned{" "}
          <code className="font-mono text-[13px]">coalesced</code> and dropped the new head
          with a comment saying the running job&rsquo;s findings were about an old commit
          so the new one would wait for the next delivery. There is no next delivery. The
          test that found it was{" "}
          <code className="font-mono text-[13px]">does not start a second concurrent review
          of a running PR</code>, written to check something else entirely — that the queue
          does not run two reviews of one pull request at once.
        </p>
        <p>
          It asserted that exactly one review started. The fix made it two, sequentially,
          and the assertion had to change. The lesson is not &ldquo;write more tests&rdquo;:
          it is that a test asserting{" "}
          <em>how many</em> something happens is weaker than one asserting{" "}
          <em>what the system ends up with</em>.
        </p>
      </Callout>

      <H2 id="limits" text="Bounded concurrency and a timeout" />
      <CodeBlock
        label="pr-owl/lib/queue.ts"
        code={`    const timeout = new Promise<never>((_, reject) => {
      const t = setTimeout(
        () => reject(new Error(\`review timed out after \${this.#opts.jobTimeoutMs}ms\`)),
        this.#opts.jobTimeoutMs,
      );
      t.unref?.();
    });

    Promise.race([this.#opts.run(job), timeout])
      .then((r) => { job.state = 'done'; job.summary = r.summary; })
      .catch((e) => { job.state = 'failed'; job.error = e?.message || String(e); })
      .finally(() => { /* release the worker, then pump */ });`}
      />
      <p>
        A review that hangs — a clone that waits on a credential prompt, a provider that
        never streams — would otherwise hold its worker forever. The queue fills, and then
        the app accepts deliveries and does nothing with them, which is the most confusing
        possible failure: no error, no log line, just silence.
      </p>
      <p>
        The timeout rejects the job and it is recorded as{" "}
        <code className="font-mono text-[13px]">failed</code> with the summary left null.
        Marking a timed-out review as{" "}
        <em>successful with no findings</em> — which is what a bare{" "}
        <code className="font-mono text-[13px]">catch</code> that returns{" "}
        <code className="font-mono text-[13px]">{'{ summary: "" }'}</code> would do — posts a
        review saying &ldquo;no defects found&rdquo; on a pull request nobody read.
      </p>

      <H2 id="ordering" text="A small ordering bug worth knowing about" />
      <p>
        Jobs are listed newest first for the status endpoint. Sorting by a millisecond
        timestamp does not work: two deliveries in the same millisecond tie, and the sort
        silently falls back to insertion order, which is not newest-first and is
        non-deterministic between runs.
      </p>
      <CodeBlock
        label="pr-owl/lib/queue.ts"
        code={`  seq: number;   // monotonic arrival counter
  // ...
  seq: ++this.#seq,
// ...
  list<T>(): Array<Job<T>> {
    return [...this.#byRepo.values()]
      .sort((a, b) => b.seq - a.seq) as Array<Job<T>>;
  }`}
      />
      <p>
        A counter cannot collide. This is a two-line fix that took a test to find, and it
        is a reasonable example of the general rule:{" "}
        <strong>any time you sort by a timestamp, you have written a sort that is
        occasionally wrong</strong>, and it will be wrong on the busiest day and never
        otherwise.
      </p>

      <H2 id="testing" text="Testing it" />
      <CodeBlock
        label="__tests__/queue.test.ts"
        code={`it('reviews the newer head after the running one, not never', async () => {
  const heads: string[] = [];
  const { queue } = makeQueue({
    concurrency: 1,
    run: async (j) => { heads.push(j.headSha); await sleep(40); return { summary: 'ok' }; },
  });
  queue.enqueue(job(1, 'aaa'));
  await sleep(10);
  queue.enqueue(job(1, 'bbb'));
  await queue.drain();

  assert.deepEqual(heads, ['aaa', 'bbb']);
  assert.equal(queue.get('acme/api', 1)!.pending, null);
});

it('never exceeds its concurrency limit', async () => {
  let live = 0, peak = 0;
  // ...
  for (let i = 0; i < 8; i++) queue.enqueue(job(i, \`sha\${i}\`));
  await queue.drain();
  assert.equal(peak, 2);
});`}
      />
      <p>
        Nineteen tests, no clock you control and no model. Timeouts are short and the
        sleeps are real but tiny, which is the only way to test ordering behaviour that
        depends on a job still being in flight. That flakiness risk is worth naming: these
        tests depend on a 40ms task still running when the next line executes, and on a
        loaded machine that assumption can fail.
      </p>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "Why not use BullMQ or a hosted queue?",
            a: "Because this queue is thirty lines of scheduling logic and a durable queue is a datastore, an idempotency story and a failure mode where a job is redelivered after the work already happened. Both are defensible. The argument for the in-memory version is that a missed review gets re-requested by a human, while a duplicated one is a bug someone notices — and PR Owl coalesces on the pull request, so redelivery is already a no-op.",
          },
          {
            q: "What happens if the server restarts mid-review?",
            a: "The in-memory queue loses it. The pull request gets no review, silently. That is a real limitation and `pr-owl/README.md` says so rather than burying it. The mitigation is the check run: PR Owl creates one at the start of a review and completes it at the end, so a failed review shows as a stale or missing check rather than as nothing at all.",
          },
          {
            q: "How many concurrent reviews should I run?",
            a: "Two. Each review is a clone, a diff read and a model turn, and the clone is I/O-bound while the model call is not — so concurrency helps until you saturate your disk or your provider's rate limit, and hurts after that. The default is 2 and the honest reason is that it is the number where nobody has had to debug it yet.",
          },
          {
            q: "Does the queue prevent replayed webhooks from causing duplicate reviews?",
            a: "Yes, as a side effect rather than by design. GitHub retries a delivery on any non-2xx, and the queue treats a repeat of the same head commit as a no-op, so a retry storm is free. That happens to be the same mechanism that coalesces rebases, which is why there is no separate replay-protection code.",
          },
        ]}
      />

      <Cta
        title="Next: give the agent a repository"
        body="Part 6 is the clone — and why handing the model a patch instead of a checkout is the difference between reviewing and guessing."
        href="/blog/pr-owl-clone-the-repo"
        cta="Start part 6"
      />

      <p className="text-sm text-muted">
        The async-generator pattern the queue is built on is covered in{" "}
        <Link href="/blog/chat-cli-async-generators" className="text-moss underline-offset-4 hover:underline">
          async generators as the interface
        </Link>
        , and the same non-colliding-sequence lesson appears in{" "}
        <Link href="/blog/live-agent-loop-tracking" className="text-moss underline-offset-4 hover:underline">
          live loop tracking
        </Link>
        .
      </p>
    </>
  ),
} satisfies Post;

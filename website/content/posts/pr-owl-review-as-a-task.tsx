import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { CompareTable, Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "pr-owl-review-as-a-task",
  title: "The review is one task, not another subsystem",
  metaTitle: "PR Owl Part 7: A Review Is a Task",
  description:
    "Why an autonomous reviewer needs no status store, no permission layer and no cancellation code of its own: it is one createTask call, and part 7 is that call.",
  date: "2026-10-07",
  readingMinutes: 10,
  tags: ["Tutorial", "Architecture", "Agent", "Concurrency"],
  keyword: "task primitive agent concurrency architecture",
  series: { slug: "pr-owl-course", order: 7 },
  related: ["pr-owl-clone-the-repo", "pr-owl-fork-permission-rung", "first-agent-turn-claude-agent-sdk"],
  faq: [
    {
      q: "Do I need a task primitive to build a reviewer?",
      a: "No. You need a status store, a permission policy and a way to cancel a running review, and you can write all three badly in an afternoon. What the primitive buys is that those three are already correct and already tested, because five other features in the same codebase depend on them behaving identically. That matters most for the permission rung in part 8 — it is the same code that stops a subagent writing files.",
    },
    {
      q: "Why does the review task await rather than run in the background?",
      a: "Because the caller wants the findings, not a notification. A teammate is fire-and-forget — you merge it later, possibly in another session — while a review is a request/response with a GitHub API at the end. Awaiting also means the task's lifecycle is the review's lifecycle, so a cancelled review is a cancelled task rather than a special case.",
    },
    {
      q: "What happens if the concurrency cap is already full?",
      a: "`createTask` returns a rejection rather than throwing, and PR Owl treats that as a failed review that the queue records. The queue's own concurrency is set below the task cap so this should not happen, but the two limits are deliberately not the same number: the queue limits parallel reviews, and the cap limits parallel work across the whole process.",
    },
    {
      q: "Can I inspect a running review from the CLI?",
      a: "Yes, and that is the practical benefit. Sentinel's `sentinel tasks` command prints the shared registry, so a reviewer running in a Next.js process shows up alongside everything else — the review id, its status, its permission rung and which pull request it is about.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          A reviewer needs status, permissions and cancellation. Every other mechanism in
          Sentinel had its own answer to those three, which is why{" "}
          <code className="font-mono text-[13px]">race.js</code> and{" "}
          <code className="font-mono text-[13px]">replay.js</code> both imported a
          permission policy out of a teammate module: no right home existed.
        </p>
        <p>
          PR Owl gets all three from{" "}
          <code className="font-mono text-[13px]">createTask</code>. Not a similar API —
          the same call five other features make.
        </p>
      </KeyTakeaways>

      <H2 id="problem" text="What a reviewer would otherwise need" />
      <p>
        Strip out the model and the model&rsquo;s prompt and a reviewer is a concurrent
        job with three hard requirements, all of which are plumbing nobody thinks about
        until they are missing.
      </p>
      <ol className="list-decimal space-y-2.5 pl-5 text-muted marker:text-moss">
        <li>
          <strong className="text-paper">Status.</strong> Running, finished, failed,
          cancelled — somewhere a human can look, and somewhere a timeout can act.
        </li>
        <li>
          <strong className="text-paper">A permission policy.</strong> Which tools may run,
          decided in code, comparable, printable, and not bypassable by a prompt.
        </li>
        <li>
          <strong className="text-paper">Cancellation.</strong> A review that should not
          finish has to be stoppable, and its resources released.
        </li>
      </ol>
      <p>
        Written by hand, that is three subsystems. Written against a primitive, it is
        three arguments. The difference is not elegance — it is that the hand-written
        versions are the parts nobody tests, because they are the parts that only matter
        when something has already gone wrong.
      </p>

      <H2 id="call" text="The call" />
      <CodeBlock
        label="pr-owl/lib/review.ts"
        code={`export async function reviewPullRequest(job, opts): Promise<ReviewOutcome> {
  const model = opts.model || process.env.PR_OWL_MODEL || DEFAULT_CHAT_MODEL_ID;
  const rung = opts.readOnly ? PERMISSIONS.READONLY : PERMISSIONS.TEAMMATE;

  const { id, rejected } = createTask({
    kind: 'agent',
    name: \`review-\${job.repo.replace('/', '-')}-\${job.prNumber}\`,
    owner: 'pr-owl',
    prompt: opts.brief,
    mode: 'REVIEW',
    model,
    isolation: 'none',
    cwd: opts.repoDir,
    permission: rung,
    meta: { repo: job.repo, pr: job.prNumber, headSha: job.headSha, readOnly: opts.readOnly },
    run: async ({ signal, permission }) => {
      let text = '';
      let costUsd = 0;
      for await (const ev of runAgentTurn({
        history: [{ id: \`owl_\${job.id}\`, role: 'user',
                    parts: [{ type: 'text', text: opts.brief }] }],
        mode: 'REVIEW',
        model,
        createStream: opts.createStream,
        trajectory: false,
        agentName: 'pr-owl',
        workdir: opts.repoDir,
        signal,
        onPermissionRequest: permission,
      })) {
        if (ev.event === 'text') text += ev.data.delta;
        else if (ev.event === 'finish') costUsd = ev.data.costUsd ?? costUsd;
        else if (ev.event === 'error') throw new Error(ev.data.message);
      }
      return { text, costUsd };
    },
  });

  if (rejected) throw new Error(rejected);
  const finished = await awaitTask(id);
  if (finished.status === 'failed') throw new Error(finished.error || 'review failed');
  if (finished.status === 'cancelled') throw new Error('review cancelled');

  const { findings, dropped } = validateFindings(finished.result?.text ?? '', opts.files);
  return { summary: summarise(finished.result?.text ?? '', findings), findings, dropped,
           costUsd: finished.result?.costUsd ?? 0, model };
}`}
      />

      <H2 id="why" text="Four decisions in that call" />
      <CompareTable
        caption="Each argument, and what the alternative would have cost"
        head={["Argument", "Value", "Why"]}
        rows={[
          [
            "permission",
            "readonly / teammate",
            "Part 8. The rung is the entire security model of an autonomous reviewer.",
          ],
          [
            "isolation",
            "'none'",
            "The tree was checked out for this review and discarded with it. A worktree would be a second copy nothing merges.",
          ],
          [
            "owner",
            "'pr-owl'",
            "Lets the registry be filtered, so a running review is distinguishable from the CLI's own tasks.",
          ],
          [
            "await",
            "awaitTask",
            "A teammate is fire-and-forget; a review has a GitHub API call at the end that needs the findings.",
          ],
        ]}
      />
      <p>
        The fourth row is the interesting contrast. A teammate exists to be merged later,
        possibly from another terminal, so its lifecycle is decoupled from the caller&rsquo;s.
        A review is a request with a response, and the review&rsquo;s status and the
        caller&rsquo;s status are the same status — so awaiting is not a convenience, it is
        what makes &ldquo;the review failed&rdquo; and &ldquo;the task failed&rdquo; the
        same event.
      </p>

      <H3 id="rejected" text="Rejections return, they do not throw" />
      <CodeBlock
        label="src/agent/task.js"
        code={`  // Admission failures RETURN a rejection, they never throw. A caller that is
  // handling three parallel spawns should not have to wrap each one in
  // try/catch, and a throw here would escape a \`for\` loop over tool calls and
  // take down the whole turn instead of one spawn.
  if (!KINDS.includes(kind)) return rejected(\`unknown task kind: \${kind}\`);`}
      />
      <p>
        This is a small decision with a large blast radius, and it was made in the opposite
        direction from most APIs. A task is usually created inside a loop — the model asks
        for three teammates in one turn — and a throw there takes down the turn rather than
        one teammate. So admission failures are values, and callers opt into handling them.
      </p>

      <H3 id="no-posting" text="The task produces a result; the caller posts it" />
      <p>
        Notice what the{" "}
        <code className="font-mono text-[13px]">run</code> body does not do: it does not call
        the GitHub API. It returns findings.
      </p>
      <Callout title="Why a task should not have side effects at the end">
        <p>
          Because the posting can fail independently of the review. A review whose comments
          are rejected by the API has still cost a model call and still read the whole
          repository — and if that failure were recorded as a task failure, a review that
          found three real defects would be logged as &ldquo;failed&rdquo; and would look
          like it found nothing.
        </p>
        <p>
          Keeping the side effect outside the task also means the task&rsquo;s result is the
          thing worth testing, and testing it needs no network.
        </p>
      </Callout>

      <H2 id="observe" text="You can watch it" />
      <p>
        Because the registry is shared rather than private to the reviewer, a running review
        is visible from the CLI.
      </p>
      <CodeBlock
        label="terminal"
        code={`$ sentinel tasks
3 task(s):
  task_16c8f67a  done       review-acme-api-42   depth=1  perm=readonly
  task_b2d90a14  running    review-acme-web-7    depth=1  perm=teammate
  task_c7e35f02  done       review-acme-api-51   depth=1  perm=teammate

$ curl -s localhost:3000/api/reviews | jq
{
  "stats": { "queued": 0, "running": 1, "done": 2, "failed": 0,
             "concurrency": 2, "maxQueued": 50 },
  "jobs": [
    { "repo": "acme/api", "pr": 42, "head": "abc1234", "state": "done",
      "summary": "2 finding(s), 0 critical" }
  ]
}`}
      />
      <p>
        The <code className="font-mono text-[13px]">perm</code> column is the one worth
        noticing:{" "}
        <code className="font-mono text-[13px]">perm=readonly</code> on a running review is a
        fork pull request, and it is visible at a glance rather than being a fact buried in
        a configuration file.
      </p>

      <H2 id="testing" text="Testing the integration" />
      <CodeBlock
        label="pr-owl/__tests__/integration.test.ts"
        code={`it('gives a fork PR the readonly rung', async () => {
  resetTasks();
  await run('Looks fine to me.', /* readOnly */ true);
  const owl = listTasks({ kind: 'agent' }).find((t) => t.owner === 'pr-owl')!;
  assert.equal(owl.permission, 'readonly');
  assert.equal(owl.readOnly, true);
});

it('leaves a task in the shared registry', async () => {
  resetTasks();
  await run('Looks fine to me.');
  const owl = listTasks({ kind: 'agent' }).filter((t) => t.owner === 'pr-owl');
  assert.equal(owl.length, 1);
  assert.equal(owl[0].status, 'done');
  assert.match(owl[0].name, /^review-acme-api-42$/);
});`}
      />
      <p>
        Ten tests that run the real loop against a stubbed provider and a temp directory,
        with no network and no credentials. They are the reason the claim &ldquo;a review is
        a task&rdquo; is checkable rather than aspirational — and the rung assertions in
        particular are what make part 8&rsquo;s security argument a fact about the code
        rather than an intention.
      </p>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "Do I need a task primitive to build a reviewer?",
            a: "No. You need a status store, a permission policy and a way to cancel a running review, and you can write all three badly in an afternoon. What the primitive buys is that those three are already correct and already tested, because five other features in the same codebase depend on them behaving identically. That matters most for the permission rung in part 8 — it is the same code that stops a subagent writing files.",
          },
          {
            q: "Why does the review task await rather than run in the background?",
            a: "Because the caller wants the findings, not a notification. A teammate is fire-and-forget — you merge it later, possibly in another session — while a review is a request/response with a GitHub API at the end. Awaiting also means the task's lifecycle is the review's lifecycle, so a cancelled review is a cancelled task rather than a special case.",
          },
          {
            q: "What happens if the concurrency cap is already full?",
            a: "`createTask` returns a rejection rather than throwing, and PR Owl treats that as a failed review that the queue records. The queue's own concurrency is set below the task cap so this should not happen, but the two limits are deliberately not the same number: the queue limits parallel reviews, and the cap limits parallel work across the whole process.",
          },
          {
            q: "Can I inspect a running review from the CLI?",
            a: "Yes, and that is the practical benefit. Sentinel's `sentinel tasks` command prints the shared registry, so a reviewer running in a Next.js process shows up alongside everything else — the review id, its status, its permission rung and which pull request it is about.",
          },
        ]}
      />

      <Cta
        title="Next: the rung that matters"
        body="Part 8 is the security core of an autonomous reviewer — what a fork's head commit can do to your runner, and the one line that decides it."
        href="/blog/pr-owl-fork-permission-rung"
        cta="Start part 8"
      />

      <p className="text-sm text-muted">
        The loop this wraps is built in{" "}
        <Link href="/blog/first-agent-turn-claude-agent-sdk" className="text-moss underline-offset-4 hover:underline">
          the first agent turn
        </Link>
        , and the argument that depth and concurrency belong in one place rather than
        spelled three ways is in{" "}
        <Link href="/blog/chat-cli-async-generators" className="text-moss underline-offset-4 hover:underline">
          async generators as the interface
        </Link>
        .
      </p>
    </>
  ),
} satisfies Post;

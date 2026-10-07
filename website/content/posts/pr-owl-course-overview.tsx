import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { CompareTable, Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "pr-owl-course-overview",
  title: "What an autonomous code reviewer actually has to get right",
  metaTitle: "Autonomous AI Code Reviewer: The Brief",
  description:
    "The honest brief for an AI reviewer on GitHub: verify the webhook, spend nothing on the wrong PR, give the agent a repository instead of a diff, and never post a comment that lands on the wrong line.",
  date: "2026-10-06",
  readingMinutes: 10,
  tags: ["Tutorial", "Architecture", "Code Review", "GitHub"],
  keyword: "ai code reviewer github app",
  series: { slug: "pr-owl-course", order: 1 },
  related: ["evaluate-coding-agent", "ai-coding-agent-guardrails", "cursor-cli-course-overview"],
  faq: [
    {
      q: "Why not just use an existing AI code reviewer?",
      a: "Read what one of them has to do before deciding it is wrong for you. Every commercial reviewer is a webhook, a queue, a permission policy and a diff parser, and each of those four is where the bugs are. Parts 3, 5, 6 and 9 are those four things. If you only need the capability, install one. If you need to know what it can do to your repository, build one.",
    },
    {
      q: "How much does this cost to run?",
      a: "One model call per reviewed pull request, and part 4 exists specifically to make that number predictable. The three things that actually control cost are the diff cap, the action filter and the queue, and all three are in `lib/policy.ts` and `lib/webhook.ts`. A local model through Ollama makes it free, at the price of a worse review.",
    },
    {
      q: "Does the reviewer run the code from the pull request?",
      a: "No, and that is not an oversight. A pull request from a fork has an attacker-controlled head commit, so anything that executes it — a test run, a build, a linter — is remote code execution on your runner. Part 8 is entirely about this, and the answer is that fork pull requests get the `readonly` rung: the same rung a subagent gets.",
    },
    {
      q: "Do I need to run a server?",
      a: "Yes, and this is the one place PR Owl is not like the CLI it is built on. Sentinel's promise is `git clone && npm install && sentinel` with no server; a GitHub App has to receive webhooks over HTTPS, so something is listening. It can be a laptop with a tunnel. That trade is the price of being on the pull request at all, and parts 1 and 2 cover it.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          An autonomous reviewer has four obligations, and three of them are not about
          the model: <strong>verify the delivery</strong>, <strong>spend nothing on the
          wrong pull request</strong>, and <strong>give the agent a repository instead of a
          diff</strong>. Only the fourth is the part everyone builds first.
        </p>
        <p>
          The fifth obligation is the one that decides whether people keep your
          reviewer installed: <strong>a comment that lands on the wrong line takes down the
          whole review</strong>, so the diff has to become structured data.
        </p>
      </KeyTakeaways>

      <H2 id="brief" text="The brief, in one screen" />
      <p>
        Here is the whole product, in the order the parts build it. Each item is a place
        where the obvious implementation is wrong in a way you will not notice until it
        costs money or gets the app uninstalled.
      </p>
      <ol className="list-decimal space-y-2.5 pl-5 text-muted marker:text-moss">
        <li>
          <strong className="text-paper">Verify the webhook.</strong> HMAC-SHA256 over the{" "}
          <em>raw bytes</em>. Parse first and you have a bug that either rejects every
          legitimate delivery or, once someone &ldquo;fixes&rdquo; it, accepts an
          attacker&rsquo;s.
        </li>
        <li>
          <strong className="text-paper">Answer 202 immediately.</strong> GitHub times out
          deliveries and retries them. A review that takes two minutes must not be
          synchronous.
        </li>
        <li>
          <strong className="text-paper">Decide what not to review.</strong> Drafts, forks,
          oversized diffs, lockfile-only changes. Every check here is a cost cap.
        </li>
        <li>
          <strong className="text-paper">Coalesce.</strong> Ten branches rebased after a
          rename is one review of the newest head, not ten reviews of ten heads.
        </li>
        <li>
          <strong className="text-paper">Clone, do not patch.</strong> An agent that cannot
          grep for the callers of a function it is reviewing is not reviewing, it is
          guessing.
        </li>
        <li>
          <strong className="text-paper">Pick a permission rung.</strong> Same-repo gets
          write, fork gets read-only, and it is the same rung a subagent gets.
        </li>
        <li>
          <strong className="text-paper">Parse the diff into line positions.</strong> Every
          comment needs a path, a line and a side, and one wrong position 422s the entire
          review.
        </li>
      </ol>

      <H2 id="the-four" text="The four places reviewers actually break" />
      <p>
        Not the model. The model is the part everyone worries about and the part least
        likely to be your problem — the failure modes are all in the plumbing, and they
        are all silent.
      </p>
      <CompareTable
        caption="Where an autonomous reviewer fails, and what the failure costs"
        head={["Failure", "What it looks like", "What it costs"]}
        rows={[
          [
            "Signature verified after parsing",
            "Reviews work in staging, nothing arrives in production",
            "A security hole, or a reviewer that never fires",
          ],
          [
            "Every action triggers a review",
            "Someone fixes a typo, a model call happens",
            "An AI reviewer that is the most expensive line in the CI bill",
          ],
          [
            "A hung review holds a worker",
            "The queue fills, then the app stops responding",
            "Reviews silently stop, with no error anywhere",
          ],
          [
            "One bad line number in the review",
            "GitHub 422s the whole review",
            "Three real findings deleted by one hallucination",
          ],
        ]}
      />
      <Callout title="Every one of these has a test in this repository">
        <p>
          <code className="font-mono text-[13px]">pr-owl/__tests__/</code> has 124 tests
          with no network and no credentials. The four rows above map to{" "}
          <code className="font-mono text-[13px]">webhook.test.ts</code>,{" "}
          <code className="font-mono text-[13px]">queue.test.ts</code> and{" "}
          <code className="font-mono text-[13px]">diff.test.ts</code>. When a part below
          says &ldquo;this has a test&rdquo;, it means a test that failed before the fix.
        </p>
      </Callout>

      <H2 id="task" text="Why this is built on a task primitive" />
      <p>
        A reviewer is concurrent work. Several repositories, several pull requests,
        several passes over one diff, all at once, all needing status, cancellation and a
        permission policy. Built from scratch that is a fourth status store, and the one
        you are least likely to test.
      </p>
      <CodeBlock
        label="pr-owl/lib/review.ts"
        code={`const { id, rejected } = createTask({
  kind: 'agent',
  name: \`review-\${job.repo.replace('/', '-')}-\${job.prNumber}\`,
  owner: 'pr-owl',
  prompt: brief,
  mode: 'REVIEW',
  isolation: 'none',        // the repo is already checked out
  permission: readOnly ? PERMISSIONS.READONLY : PERMISSIONS.TEAMMATE,
  cwd: repoDir,
  meta: { repo: job.repo, pr: job.prNumber, headSha: job.headSha },
  run: async ({ signal, permission }) => { /* the agent turn */ },
});

if (rejected) throw new Error(rejected);
const finished = await awaitTask(id);`}
      />
      <p>
        That is the entire lifecycle. A running review is visible in{" "}
        <code className="font-mono text-[13px]">sentinel tasks</code>, counts against the
        same concurrency budget as every other task in the system, and can be cancelled
        by anything holding its id. Part 7 is this file.
      </p>
      <p>
        The two lines that matter are the permission ones.{" "}
        <code className="font-mono text-[13px]">readonly</code> is the same rung a
        subagent gets, and it is what a pull request from a fork gets, because that
        commit is a stranger&rsquo;s code and the rung denies every shell command that is
        not a read. Part 8 is the threat model.
      </p>

      <H2 id="shape" text="The file that decides whether comments land" />
      <p>
        If you read one file from this repository, read{" "}
        <code className="font-mono text-[13px]">lib/diff.ts</code>. Not because it is
        interesting, but because it is the one place where being almost right produces
        output that <em>looks</em> right.
      </p>
      <CodeBlock
        label="pr-owl/lib/diff.ts"
        code={`      // NOT \`else if\`. A context line exists on both sides, so BOTH
      // positions are legal; an added line has only a right position; a
      // removed line has only a left one.
      if (l.line != null) out.push({ line: l.line, side: 'RIGHT' });
      if (l.originalLine != null) out.push({ line: l.originalLine, side: 'LEFT' });`}
      />
      <p>
        Written as <code className="font-mono text-[13px]">else if</code>, half the legal
        comment positions become unreachable and nothing looks broken &mdash; you simply
        cannot leave a comment on the left of an unchanged line. It was written that way
        first. Part 9.
      </p>

      <H2 id="what-it-is-not" text="What this course is not" />
      <p>
        It is not a prompt guide. There is no part here about how to phrase a review
        instruction, because a prompt is the one component you can change in an afternoon
        without touching anyone&rsquo;s repository. Every part is a component where being
        wrong is expensive, and all of them are code.
      </p>
      <p>
        It is also not a hosted service. PR Owl runs wherever you point it, against any
        model Sentinel supports, including one on your own machine. Part 12 covers the
        decision, and it is the reason a self-hosted reviewer is the only kind most teams
        should install on a private repository.
      </p>

      <H2 id="reading" text="How to read the twelve parts" />
      <ol className="list-decimal space-y-1.5 pl-5 text-muted marker:text-moss">
        <li>
          <strong className="text-paper">Parts 2&ndash;3</strong> &mdash; the app skeleton and
          the signature check. Nothing runs until part 3 is right.
        </li>
        <li>
          <strong className="text-paper">Parts 4&ndash;6</strong> &mdash; what not to review,
          when to review it, and the checkout that gives the agent a repository.
        </li>
        <li>
          <strong className="text-paper">Parts 7&ndash;8</strong> &mdash; the agent as a
          task, and the permission rung that keeps fork code from running.
        </li>
        <li>
          <strong className="text-paper">Parts 9&ndash;11</strong> &mdash; the diff parser,
          posting the review, and the failure modes that get your app uninstalled.
        </li>
        <li>
          <strong className="text-paper">Part 12</strong> &mdash; shipping it, and the
          question of whether you should.
        </li>
      </ol>
      <p>
        Every code block in this course is a file in{" "}
        <a
          href="https://github.com/KunjShah95/SENTINEL-CLI/tree/main/pr-owl"
          className="text-moss underline-offset-4 hover:underline"
        >
          the <code className="font-mono text-[13px]">pr-owl/</code> directory
        </a>{" "}
        of the same repository as{" "}
        <Link href="/series/cursor-cli-course" className="text-moss underline-offset-4 hover:underline">
          course one
        </Link>
        . If a part disagrees with the code, that is a bug worth reporting rather than a
        version difference.
      </p>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "Why not just use an existing AI code reviewer?",
            a: "Read what one of them has to do before deciding it is wrong for you. Every commercial reviewer is a webhook, a queue, a permission policy and a diff parser, and each of those four is where the bugs are. Parts 3, 5, 6 and 9 are those four things. If you only need the capability, install one. If you need to know what it can do to your repository, build one.",
          },
          {
            q: "How much does this cost to run?",
            a: "One model call per reviewed pull request, and part 4 exists specifically to make that number predictable. The three things that actually control cost are the diff cap, the action filter and the queue, and all three are in `lib/policy.ts` and `lib/webhook.ts`. A local model through Ollama makes it free, at the price of a worse review.",
          },
          {
            q: "Does the reviewer run the code from the pull request?",
            a: "No, and that is not an oversight. A pull request from a fork has an attacker-controlled head commit, so anything that executes it — a test run, a build, a linter — is remote code execution on your runner. Part 8 is entirely about this, and the answer is that fork pull requests get the `readonly` rung: the same rung a subagent gets.",
          },
          {
            q: "Do I need to run a server?",
            a: "Yes, and this is the one place PR Owl is not like the CLI it is built on. Sentinel's promise is `git clone && npm install && sentinel` with no server; a GitHub App has to receive webhooks over HTTPS, so something is listening. It can be a laptop with a tunnel. That trade is the price of being on the pull request at all, and parts 1 and 2 cover it.",
          },
        ]}
      />

      <Cta
        title="Start with the skeleton"
        body="Part 2 is a Next.js app and a manifest. By part 3 something is listening and correctly rejecting everything, which is the right first milestone."
        href="/blog/pr-owl-github-app-skeleton"
        cta="Start part 2"
      />

      <p className="text-sm text-muted">
        New here? The{" "}
        <Link href="/blog/evaluate-coding-agent" className="text-moss underline-offset-4 hover:underline">
          evaluating a coding agent
        </Link>{" "}
        post covers how to tell whether a reviewer is worth keeping before you build one,
        and{" "}
        <Link href="/blog/ai-coding-agent-guardrails" className="text-moss underline-offset-4 hover:underline">
          the guardrails post
        </Link>{" "}
        covers the permission model this course leans on.
      </p>
    </>
  ),
} satisfies Post;

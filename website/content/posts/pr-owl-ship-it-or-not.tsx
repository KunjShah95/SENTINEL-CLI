import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { CompareTable, Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "pr-owl-ship-it-or-not",
  title: "Ship it, or do not: when an autonomous reviewer is worth installing",
  metaTitle: "PR Owl Part 12: Should You Ship This?",
  description:
    "The honest closing argument — where an AI reviewer earns its place, where it does not, and the one configuration that makes it uncontroversial on a private repository.",
  date: "2026-10-08",
  readingMinutes: 11,
  tags: ["Opinion", "Architecture", "Local LLM", "Code Review"],
  keyword: "should you use an ai code reviewer",
  series: { slug: "pr-owl-course", order: 12 },
  related: ["pr-owl-review-failure-modes", "local-llm-coding-agent", "convince-tech-lead-terminal-agent"],
  faq: [
    {
      q: "What does an AI reviewer actually catch that CI does not?",
      a: "Things that are correct and wrong at once: a null check that is present but in the wrong branch, a resource acquired outside the loop that closes on the error path and not the normal one, an authorisation check missing from a new endpoint, a test that asserts the implementation rather than the behaviour. None of those fail a build, because nothing about them is syntactically or type-level wrong. That is a real and bounded category, and it is much narrower than 'code review'.",
    },
    {
      q: "Is a local model good enough?",
      a: "Good enough to be worth running, which is a different claim. A local model through Ollama will not catch the subtle cross-file reasoning that justifies the whole idea, but it will catch the local, syntactic-adjacent class of mistake — the missing null check, the off-by-one, the unclosed handle — and it does so with the code never leaving the machine. For a private repository that is usually the trade worth making, and for a public one it is close to free.",
    },
    {
      q: "What is the honest failure mode of deploying one of these?",
      a: "That people stop reading the comments, because it is commented on everything. A reviewer that fires on twenty pull requests a week and is right about two of them has a 10 percent precision, and the team's response to that is correct: they stop reading. Everything in part 4 exists to protect the precision, and the two-critical threshold in part 10 exists so that being wrong cannot block anyone's work.",
    },
    {
      q: "Why build this rather than buy it?",
      a: "Not because the commercial ones are bad — some of them are good. Because after twelve parts you have a reviewer whose permission model you can read in one file, whose failure modes you have seen reproduced in tests, and whose prompt you can change in an afternoon. That is a different position to be in than trusting a vendor's, and for a tool that reads your private code it is the position that matters.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          An AI reviewer catches a <strong>narrow and real</strong> category: defects that
          are correct and wrong at once. A null check in the wrong branch. A handle closed on
          the error path only. An endpoint with no authorisation check. None of them fail a
          build.
        </p>
        <p>
          The honest failure mode of deploying one is not a bug — it is{" "}
          <strong>that people stop reading the comments</strong>, because it comments on
          everything. Precision is the product.
        </p>
      </KeyTakeaways>

      <H2 id="catches" text="What it actually catches" />
      <p>
        Be precise about this, because the sales pitch for these tools is not precise and it
        makes the whole category look like vapour. A reviewer does not do what a reviewer
        does. It finds defects that are locally plausible and globally wrong.
      </p>
      <CodeBlock
        label="what a model reliably finds"
        code={`// A guard that exists but is in the wrong branch. Green build, green test.
if (user?.id) {           // <- the create path allows a null user
  await save(user);
}

// A handle closed on the error path and not the normal one.
const conn = await pool.connect();
try {
  return await query(conn);
} catch (e) {
  await conn.release();
  throw e;                 // <- and not here
} finally { /* missing */ }

// A new endpoint with no authorisation check. Type-checks perfectly.
app.post('/admin/rotate', async (req, res) => {
  res.json(await rotateKeys());
});`}
      />
      <p>
        Every one of those passes lint, passes the type checker and passes a test suite that
        does not cover the case. They are also the class of defect that is most expensive to
        find late, which is what makes them worth a machine looking for.
      </p>
      <CompareTable
        caption="Four things a reviewer can and cannot do"
        head={["", "Finds", "Misses"]}
        rows={[
          ["Style and naming", "yes — trivially", "—"],
          ["Type and lint errors", "no — CI is faster", "—"],
          ["Local logic slips", "yes — this is the core value", "subtle ones"],
          ["Architectural wrongness", "rarely", "almost always"],
          ["&ldquo;Is this the right design?&rdquo;", "no", "yes, always"],
        ]}
      />
      <Callout title="The row that matters is the last one">
        <p>
          No model reviewing a diff can tell you the change should not have been made. It
          can tell you the change has a bug. Those are different activities and conflating
          them is how a team ends up with a reviewer they resent rather than one they use.
        </p>
      </Callout>

      <H2 id="precision" text="Precision is the product" />
      <p>
        Here is the number that decides whether an autonomous reviewer survives contact with
        a team. Not findings per pull request.{" "}
        <strong>Findings that are actually right.</strong>
      </p>
      <p>
        A reviewer that comments on twenty pull requests a week and is right about two of them
        has a precision of ten percent. The team&rsquo;s response to that is entirely
        rational: they stop reading. And once they have stopped reading, being right about
        the eleventh one changes nothing.
      </p>
      <p>Everything in the previous eleven parts is a precision mechanism.</p>
      <CompareTable
        caption="Each part, and which failure it is protecting against"
        head={["Part", "Mechanism", "Protects against"]}
        rows={[
          ["3", "verify the raw bytes", "rejecting every delivery, or accepting anything"],
          ["3", "explicit action allow-list", "a typo costing a model call"],
          ["4", "drafts, forks, diff cap", "reviewing what has nothing to review"],
          ["4", "generated-file skip", "lockfile churn"],
          ["5", "head coalescing", "ten reviews of one intent"],
          ["6", "hashed cache key", "reviewing the wrong repository"],
          ["7", "one task, shared registry", "a review nobody can see or cancel"],
          ["8", "readonly for forks", "executing a stranger's code"],
          ["9", "validate every position", "422 taking down three good findings"],
          ["10", "two criticals to block", "blocking a merge on a false positive"],
          ["10", "never approve", "a green button nobody read"],
          ["11", "report the drops", "silence that means broken"],
        ]}
      />

      <H2 id="private" text="The configuration that settles it" />
      <p>
        If you take one thing from this course, take this.
      </p>
      <CodeBlock
        label="pr-owl/.env"
        code={`# A local model. The code never leaves the machine, which is the only
# configuration in which an autonomous reviewer is uncontroversial on a
# private repository.
PR_OWL_MODEL=ollama/qwen2.5-coder:14b

# And be conservative with what you will review.
PR_OWL_CONCURRENCY=1
PR_OWL_MAX_QUEUED=20`}
      />
      <p>
        That combination changes the risk profile completely. The reviewer reads your private
        code, but it does so on hardware you own, using weights you downloaded — so there is
        no third party in the path at all. No code leaves your network, no prompt is logged
        by anyone but you, and the API bill is zero.
      </p>
      <p>
        The quality is lower, and honestly so: a 14B local model will not do the
        cross-file reasoning that motivates the whole idea. It will do the local,
        syntactic-adjacent class — the missing null check, the off-by-one, the unclosed
        handle — and it will do it for free, forever, on every pull request. For most teams
        that is the majority of the available value.
      </p>
      <Callout title="The two questions to ask before installing anything like this">
        <p>
          <strong>Where does the code go?</strong> If the answer is &ldquo;a provider whose
          retention policy you have not read&rdquo;, that is the decision, and no amount of
          review quality compensates for it.{" "}
          <strong>What happens when it is wrong?</strong> Not the first time — the
          fiftieth. A tool that is right nine times in ten is a tool people learn to dismiss,
          and then it is not protecting anything.
        </p>
      </Callout>

      <H2 id="what-built" text="What you built" />
      <p>
        Twelve parts, and the shape of it is worth stating because it is the reusable part
        and not the app.
      </p>
      <CodeBlock
        label="the whole architecture, in eleven lines of comment"
        code={`webhook  -> raw bytes -> verify signature -> parse -> filter actions
                                                      |
policy   -> draft? fork? diff cap? generated?  ------+
                                                      |
queue    -> coalesce on repo#number, bound concurrency, time out
                                                      |
checkout -> one hashed clone per repo, fetch, reset --hard, clean -fdx
                                                      |
task     -> createTask({ kind:'agent', mode:'REVIEW', permission: RUNG })
           |                                              ^
           |  same registry as every other agent in the system
           v
review   -> run the loop, read findings, validate every position
                                                      |
github   -> COMMENT, or REQUEST_CHANGES at two criticals, plus a check run`}
      />
      <p>
        Six of those eleven lines are policy, queue or validation — that is, they are the
        parts that are not the model. Which is the argument of the whole course:{" "}
        <strong>the interesting engineering in an autonomous reviewer is entirely in the
        plumbing, and the plumbing is ordinary code that you can test</strong>.
      </p>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "What does an AI reviewer actually catch that CI does not?",
            a: "Things that are correct and wrong at once: a null check that is present but in the wrong branch, a resource acquired outside the loop that closes on the error path and not the normal one, an authorisation check missing from a new endpoint, a test that asserts the implementation rather than the behaviour. None of those fail a build, because nothing about them is syntactically or type-level wrong. That is a real and bounded category, and it is much narrower than 'code review'.",
          },
          {
            q: "Is a local model good enough?",
            a: "Good enough to be worth running, which is a different claim. A local model through Ollama will not catch the subtle cross-file reasoning that justifies the whole idea, but it will catch the local, syntactic-adjacent class of mistake — the missing null check, the off-by-one, the unclosed handle — and it does so with the code never leaving the machine. For a private repository that is usually the trade worth making, and for a public one it is close to free.",
          },
          {
            q: "What is the honest failure mode of deploying one of these?",
            a: "That people stop reading the comments, because it is commented on everything. A reviewer that fires on twenty pull requests a week and is right about two of them has a 10 percent precision, and the team's response to that is correct: they stop reading. Everything in part 4 exists to protect the precision, and the two-critical threshold in part 10 exists so that being wrong cannot block anyone's work.",
          },
          {
            q: "Why build this rather than buy it?",
            a: "Not because the commercial ones are bad — some of them are good. Because after twelve parts you have a reviewer whose permission model you can read in one file, whose failure modes you have seen reproduced in tests, and whose prompt you can change in an afternoon. That is a different position to be in than trusting a vendor's, and for a tool that reads your private code it is the position that matters.",
          },
        ]}
      />

      <Cta
        title="Back to part one"
        body="Start at the brief if you want the whole shape again, or part 3 if you want the part that has to be right before anything runs."
        href="/blog/pr-owl-course-overview"
        cta="Read part 1"
      />

      <p className="text-sm text-muted">
        Everything here is built on{" "}
        <Link href="/series/cursor-cli-course" className="text-moss underline-offset-4 hover:underline">
          the terminal agent course
        </Link>
        , which builds the loop this wraps. The local-model argument is in{" "}
        <Link href="/blog/local-llm-coding-agent" className="text-moss underline-offset-4 hover:underline">
          the local LLM post
        </Link>
        , the pitch to a cautious colleague is in{" "}
        <Link href="/blog/convince-tech-lead-terminal-agent" className="text-moss underline-offset-4 hover:underline">
          convincing a tech lead
        </Link>
        , and all of the code is in the{" "}
        <a
          href="https://github.com/KunjShah95/SENTINEL-CLI/tree/main/pr-owl"
          className="text-moss underline-offset-4 hover:underline"
        >
          pr-owl directory
        </a>{" "}
        — 131 tests, no network, no credentials.
      </p>
    </>
  ),
} satisfies Post;

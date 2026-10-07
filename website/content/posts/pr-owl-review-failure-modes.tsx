import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { CompareTable, Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "pr-owl-review-failure-modes",
  title: "The failure modes that get a reviewer uninstalled",
  metaTitle: "PR Owl Part 11: Failure Modes",
  description:
    "Every one of these produces no error, no log line, and a reviewer that quietly stopped reviewing part of your codebase — plus the small observability habit that makes them visible.",
  date: "2026-10-08",
  readingMinutes: 10,
  tags: ["Reliability", "Observability", "Code Review", "Testing"],
  keyword: "ai code reviewer silent failure observability",
  series: { slug: "pr-owl-course", order: 11 },
  related: ["pr-owl-post-the-review", "evaluate-coding-agent", "cli-doctor-preflight-checks"],
  faq: [
    {
      q: "Why is silent under-firing worse than crashing?",
      a: "A crash is discovered. Someone sees the error, opens an issue, and the tool is fixed. Silent under-firing is indistinguishable from the tool working correctly and having nothing to say — and the failure mode compounds, because a reviewer that nobody trusts gets ignored even when it is right. Every entry in this part is a case where the correct output is silence and the broken output is also silence.",
    },
    {
      q: "How would I notice a silent failure in practice?",
      a: "The check run is the primary signal: it appears on every commit the reviewer looked at, and its absence is itself information. Beyond that, PR Owl's review body always states what it dropped, and `GET /api/reviews` exposes the skip reasons. A reviewer that skips 40 percent of your pull requests should be telling you which 40 percent and why.",
    },
    {
      q: "Should the reviewer post anything when it finds nothing?",
      a: "Yes — a check run with a passing conclusion, and ideally a review body saying so. Silence is ambiguous in both directions: it could mean nothing was wrong, or it could mean the reviewer crashed, was rate limited, ran out of budget, or never started. An explicit 'no defects found' is a claim; the absence of any comment is not.",
    },
    {
      q: "What is the single highest-value thing to add if I only add one?",
      a: "A count of dropped findings on the check run. It is one line, it costs nothing, and it is the only signal that distinguishes 'the parser is broken' from 'the reviewer has nothing to say' — which is the failure mode that has cost this project the most debugging time, twice.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          The failures that matter in an autonomous reviewer are the ones that produce{" "}
          <strong>no error and no log line</strong>. A crash is a bug report. Silence is
          indistinguishable from a tool working correctly.
        </p>
        <p>
          Six of them, all of which occurred while building this, and the habit that
          catches all six: <strong>make every refusal say why</strong>.
        </p>
      </KeyTakeaways>

      <H2 id="six" text="Six ways to fail silently" />
      <CompareTable
        caption="Silent failures, and what each one looks like from the outside"
        head={["Failure", "What you see", "What is true"]}
        rows={[
          [
            "Signature checked after parsing",
            "No review ever appears",
            "The digest is over your bytes, not GitHub's",
          ],
          [
            "Every action triggers a review",
            "The bill is high; reviews look normal",
            "A description typo cost a model call",
          ],
          [
            "A push mid-review is dropped",
            "The latest commit has no comments",
            "GitHub does not redeliver, so it never will",
          ],
          [
            "Parser rejects valid positions",
            "Reviews get shorter, quietly",
            "Findings are being dropped as unplaceable",
          ],
          [
            "A source directory named build/",
            "One package never gets reviewed",
            "An unanchored regex matched it",
          ],
          [
            "Cache key collides",
            "Comments on the wrong repository",
            "Two repos slugified to the same directory",
          ],
        ]}
      />
      <p>
        Every row is a real bug from this codebase, and every row was found by a test
        rather than by a report. That is not a coincidence:{" "}
        <strong>these are the failures that do not announce themselves</strong>, so tests
        are the only mechanism that finds them.
      </p>

      <H2 id="counter" text="The two that cost the most time" />
      <p>
        The two worst were the same shape, which is why they are grouped.
      </p>
      <CodeBlock
        label="pr-owl/lib/policy.ts"
        code={`// Was: unanchored, so \`src/build/config.js\` matched too.
/(^|\\/)dist\\//,
/(^|\\/)build\\//,
// Now: anchored, because an output directory is at the repository root.
/^dist\\//,
/^build\\//,`}
      />
      <p>
        A repository with a source directory called{" "}
        <code className="font-mono text-[13px]">build</code> stopped being reviewed. There
        was no error, no log line and no way to tell from the outside — pull requests in that
        package simply had no comments, which looks exactly like a package where the reviewer
        had nothing to say.
      </p>
      <CodeBlock
        label="pr-owl/lib/diff.ts"
        code={`// Was: one scanner parsed the payload, a different regex stripped it.
.replace(/\\[[\\s\\S]*?"findings"[\\s\\S]*?\\]/g, '')

// Now: the same scanner, used to find the span and cut it.
const span = balancedJsonSpan(trimmed);
prose = prose.slice(0, at) + prose.slice(at + (span.end - span.start));`}
      />
      <p>
        The strip assumed an object payload, so a bare-array response was posted verbatim
        as the review body. The reviews still appeared, they just started with{" "}
        <code className="font-mono text-[13px]">{'{"findings":[…]}'}</code> — which looks like a
        bug, is a bug, and is at least visible.
      </p>
      <Callout title="The pattern in both">
        <p>
          Two implementations of the same knowledge, written at different times, disagreeing.
          The general lesson is not &ldquo;share code&rdquo; in the abstract — it is that{" "}
          <strong>when a rule is important enough to state twice, it is important enough to
          have exactly one implementation</strong>. A diff comment position and a{" "}
          <code className="font-mono text-[13px]">build/</code> path are both rules; both had
          a second copy that drifted.
        </p>
      </Callout>

      <H2 id="observability" text="The habit that catches them" />
      <p>
        One rule, applied everywhere:{" "}
        <strong>a refusal says why</strong>. Not just the failures — the skips too.
      </p>
      <CodeBlock
        label="pr-owl/lib/policy.ts"
        code={`  if (exceedsDiffCap(req.additions, req.deletions, policy.maxDiffLines)) {
    // Not: return { review: false }. A bare boolean gives you nothing to put
    // in the log, and "the reviewer decided not to look" and "the reviewer is
    // broken" look identical from the outside.
    return { review: false,
      reason: \`diff is \${req.additions + req.deletions} lines, over the \${policy.maxDiffLines}-line cap\` };
  }`}
      />
      <CodeBlock
        label="pr-owl/lib/owl.ts"
        code={`  if (!decision.review) {
    config.log('skipped', { repo: job.repo, pr: job.prNumber, reason: decision.reason });
    return { summary: \`skipped: \${decision.reason}\` };
  }`}
      />
      <p>
        The queue keeps the reason on the job, and{" "}
        <code className="font-mono text-[13px]">GET /api/reviews</code> exposes it. So when
        a maintainer asks &ldquo;why did this not get reviewed&rdquo; the answer is a
        sentence, and when{" "}
        <em>everything</em> stops being reviewed the skip reasons are the first place to look
        — because a sudden, total absence has a cause, and this is where it is written down.
      </p>

      <H2 id="dropped" text="The one-line addition worth making first" />
      <CodeBlock
        label="pr-owl/lib/owl.ts"
        code={`output: {
  title: \`\${postable.length} finding(s), \${criticals} critical\`,
  // The dropped count is the only signal that distinguishes "the parser is
  // broken" from "the reviewer has nothing to say".
  summary: \`PR Owl reviewed \${job.headSha.slice(0, 7)}.
             \${outcome.dropped.length} finding(s) dropped as unplaceable.\`,
},`}
      />
      <p>
        It costs nothing, it is visible on every commit, and it is the difference between
        noticing a parsing regression in a day and noticing it a quarter later when someone
        asks why the reviewer seems less useful than it used to be.
      </p>

      <H2 id="testing" text="What the tests are for" />
      <p>
        131 tests across five files, none of which touch the network or need credentials.
        The distribution is the argument: the most tests are on the code whose failures are
        silent.
      </p>
      <CompareTable
        caption="Where the 131 tests are, and why"
        head={["File", "Tests", "Failure mode it guards"]}
        rows={[
          ["policy.test.ts", "29", "stopping reviews without saying why"],
          ["webhook.test.ts", "21", "rejecting everything, or accepting anything"],
          ["queue.test.ts", "19", "never reviewing, or reviewing twice"],
          ["review.test.ts", "27", "posting wrong lines, or posting the payload"],
          ["diff.test.ts", "18", "comments on the wrong line"],
          ["checkout.test.ts", "7", "reviewing the wrong repository"],
          ["integration.test.ts", "10", "a review that is not a task, or has the wrong rung"],
        ]}
      />
      <p>
        Two of those numbers deserve a note. The integration tests run the{" "}
        <em>real</em> agent loop against a stubbed provider in a temp directory, which is why
        the claim &ldquo;a review is a task with the right permission rung&rdquo; is
        checkable rather than aspirational. And the diff and policy tests exist because both
        bugs were found{" "}
        <em>by</em> those tests rather than by inspection — in each case after writing the
        test to assert something else.
      </p>
      <Callout title="A test that encodes a wrong belief is worse than no test">
        <p>
          One diff test asserted that left line 3 was not commentable, when in fact it is a
          context line and both sides are legal. The code was right and the test was wrong,
          which is the most confusing possible outcome: the tempting move is to change the
          code until the red test goes green, and you have just introduced the bug.
        </p>
        <p>
          The discipline that helps is to write down what the fixture{" "}
          <em>means</em> before asserting what the code should do with it. A test that
          surprises you has told you something about your model of the system, and that is
          worth reading before you edit anything.
        </p>
      </Callout>

      <H2 id="known" text="Known limitations, stated rather than buried" />
      <CodeBlock
        label="pr-owl/README.md, verbatim"
        code={`**It does not survive a restart.** The queue is in memory. A deploy loses
queued reviews; two instances do not share a queue. Both are acceptable for a
reviewer — a missed review is re-requested by a human, a duplicated one is a
bug someone notices. \`lib/storage.ts\` is where a durable queue goes.`}
      />
      <p>
        A README that lists what the software does not do is more useful than one that does
        not, because the limitations are exactly the things a user discovers in
        production. The in-memory queue is the one I would fix first: it is the only failure
        in this list that is not visible from outside the app.
      </p>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "Why is silent under-firing worse than crashing?",
            a: "A crash is discovered. Someone sees the error, opens an issue, and the tool is fixed. Silent under-firing is indistinguishable from the tool working correctly and having nothing to say — and the failure mode compounds, because a reviewer that nobody trusts gets ignored even when it is right. Every entry in this part is a case where the correct output is silence and the broken output is also silence.",
          },
          {
            q: "How would I notice a silent failure in practice?",
            a: "The check run is the primary signal: it appears on every commit the reviewer looked at, and its absence is itself information. Beyond that, PR Owl's review body always states what it dropped, and `GET /api/reviews` exposes the skip reasons. A reviewer that skips 40 percent of your pull requests should be telling you which 40 percent and why.",
          },
          {
            q: "Should the reviewer post anything when it finds nothing?",
            a: "Yes — a check run with a passing conclusion, and ideally a review body saying so. Silence is ambiguous in both directions: it could mean nothing was wrong, or it could mean the reviewer crashed, was rate limited, ran out of budget, or never started. An explicit 'no defects found' is a claim; the absence of any comment is not.",
          },
          {
            q: "What is the single highest-value thing to add if I only add one?",
            a: "A count of dropped findings on the check run. It is one line, it costs nothing, and it is the only signal that distinguishes 'the parser is broken' from 'the reviewer has nothing to say' — which is the failure mode that has cost this project the most debugging time, twice.",
          },
        ]}
      />

      <Cta
        title="Last part: ship it, or do not"
        body="Part 12 covers the decision — when an autonomous reviewer is worth installing, and the configuration that makes it uncontroversial on a private repository."
        href="/blog/pr-owl-ship-it-or-not"
        cta="Start part 12"
      />

      <p className="text-sm text-muted">
        How to judge whether an agent is worth trusting is the subject of{" "}
        <Link href="/blog/evaluate-coding-agent" className="text-moss underline-offset-4 hover:underline">
          evaluating a coding agent
        </Link>
        , and the pre-flight pattern behind the observability habits here is in{" "}
        <Link href="/blog/cli-doctor-preflight-checks" className="text-moss underline-offset-4 hover:underline">
          the doctor pre-flight
        </Link>
        .
      </p>
    </>
  ),
} satisfies Post;

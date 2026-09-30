import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "evaluate-coding-agent",
  title: "How to evaluate a coding agent you are building",
  metaTitle: "How to Evaluate a Coding Agent You Are Building",
  description:
    "Capability gates, FAIL_TO_PASS fixtures, deterministic graders and reproducible task evals — how to measure an agent without fooling yourself.",
  date: "2026-09-28",
  updated: "2026-09-30",
  readingMinutes: 10,
  tags: ["Evaluation", "Testing", "SWE"],
  keyword: "evaluate ai coding agent",
  related: [
    "ai-coding-agent-guardrails",
    "reduce-llm-cost",
    "ai-agent-file-permissions",
  ],
  faq: [
    {
      q: "How do you benchmark a coding agent you built yourself?",
      a: "In two separate layers, because they fail for different reasons. Capability gates test whether the harness can do things at all — a round trip, a refused write in the wrong mode, a traversal blocked, an undo that restores. Task evals test whether the agent solves problems. Keep them separate, because a capability failure masquerading as a reasoning failure will send you optimising a prompt when the bug is in your tool result parser.",
    },
    {
      q: "What is a FAIL_TO_PASS test?",
      a: "A test that must fail before the fix and pass after it. It is the core primitive of a trustworthy agent eval, because it removes the two classic false positives: a task that was already solved, and a test that never actually exercised the bug. Every eval task should ship one, alongside a fixture that reproduces the failure and a grader that decides pass or fail mechanically.",
    },
    {
      q: "Should I report SWE-bench scores for my own agent?",
      a: "Only with the official harness version, the exact model id, the retry count and the Docker configuration attached. Self-awared percentages without that context are marketing, not measurement — the numbers move with the harness, the model and the retry budget, and readers have no way to tell which. Report the harness, the model and the retries, or report nothing.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          Measure in two layers that fail differently: <strong>capability gates</strong> (can the
          harness do this at all?) and <strong>task evals</strong> (can the agent solve this?). Mixing
          them means a parser bug looks like a reasoning failure.
        </p>
        <p>
          Every task needs three artefacts: a fixture that <strong>fails</strong> before the fix, a
          reference solution that makes it <strong>pass</strong>, and a <strong>deterministic
          grader</strong>. Without the third, you are grading prose.
        </p>
      </KeyTakeaways>

      <H2 id="why" text="Why bother, when it obviously works" />
      <p>
        Because &ldquo;it obviously works&rdquo; is how agents get worse without anyone noticing. The
        loop is full of small changes that each look safe: a prompt tweak, a new tool, a
        summarisation step, a higher iteration cap. Every one of them can silently halve your
        success rate on the hard cases while the demos keep looking great.
      </p>
      <p>
        The uncomfortable version: an agent improvement is a hypothesis, and without an eval it is
        an anecdote. The best return on a small team&rsquo;s time is not a bigger benchmark, it is a
        fast, boring, deterministic one that runs in under a minute and never needs a model key.
      </p>

      <H2 id="layer-one" text="Layer one — capability gates, no model required" />
      <p>
        These test the harness. Can the agent loop actually call a tool, respect a mode, sandbox a
        path, parse a test result? They should be fast, hermetic and run in CI on every commit,
        because they catch the class of bug that masquerades as intelligence.
      </p>
      <CodeBlock
        label="terminal"
        code={`sentinel bench
# 15/15 checks: roundtrips, mode refusals, sandbox, atomic edits,
# structured test parsing, patch application, undo, FAIL_TO_PASS gates`}
      />
      <p>The checks worth having, in rough priority order:</p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted marker:text-ink-700">
        <li>
          <strong className="text-paper">Mode refusals.</strong> PLAN mode must refuse a write
          tool. If it does not, everything else you believe about your permissions is fiction.
        </li>
        <li>
          <strong className="text-paper">Sandbox escape.</strong> Traversal, absolute paths outside
          the root, and a symlink pointing out of the tree must all be rejected — see{" "}
          <Link href="/blog/ai-agent-file-permissions" className="underline-offset-4 hover:underline">
            the permission model
          </Link>
          .
        </li>
        <li>
          <strong className="text-paper">Atomic batch edits.</strong> A batch that fails halfway must
          leave nothing applied, and must not leave a stale read in the next operation.
        </li>
        <li>
          <strong className="text-paper">Undo across turns.</strong> Write in turn one, undo in
          turn two, assert the original content. An implementation that only undoes within the
          current turn passes a naive test and fails a real one.
        </li>
        <li>
          <strong className="text-paper">Structured test parsing.</strong> Feed it jest, pytest,
          mocha and TAP output. If the parser silently returns &ldquo;no failures&rdquo; on a format
          it does not recognise, your eval is measuring nothing.
        </li>
      </ul>
      <div className="pt-2">
        <Callout title="The last one is the dangerous one" tone="warn">
          A grader that cannot parse the output must fail loudly. Returning an empty pass list turns
          a bug fix into a no-op that reports success — the exact failure mode an eval exists to
          catch.
        </Callout>
      </div>

      <H2 id="layer-two" text="Layer two — task evals that can be trusted" />
      <p>
        Now the agent has to actually solve something. Three artefacts per task, and all three are
        required.
      </p>

      <H3 id="fixture" text="The fixture must fail first" />
      <p>
        A pristine copy of the repo state, plus a test that fails on it. This is the FAIL_TO_PASS
        gate, and it is the single highest-value check in the whole system, because it eliminates
        the two false positives that make agent benchmarks meaningless:
      </p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted marker:text-ink-700">
        <li>
          <strong className="text-paper">The task was already solved.</strong> Nothing to fix, agent
          changes nothing, reported as a pass.
        </li>
        <li>
          <strong className="text-paper">The test never exercised the bug.</strong> Agent breaks
          something unrelated, the untouched test still passes.
        </li>
      </ul>

      <H3 id="reference" text="The reference solution must pass" />
      <p>
        Someone has to write the fix. It does not need to be the best fix — it needs to exist, so
        you know the task is solvable and your grader is satisfiable. A task where the reference
        solution fails is a broken task, and shipping it teaches your agent the wrong lesson.
      </p>

      <H3 id="grader" text="The grader must be mechanical" />
      <p>
        A Node script that exits 0 or non-zero. No model in the loop, no rubric, no
        &ldquo;does this look like a reasonable fix&rdquo;. If a model grades the model, you have
        built a vibe check, and vibe checks drift silently in the direction that flatters you.
      </p>
      <CodeBlock
        label="bash"
        code={`npm run eval:check                  # validate fixtures + graders, CI-gated
node evals/run.mjs --agent --model gpt-6-luna   # real agent runs + report`}
      />

      <H2 id="workflow" text="The loop that keeps it honest" />
      <ol className="list-decimal space-y-2 pl-5 text-muted marker:text-moss">
        <li>
          <strong className="text-paper">Reproduce before you touch anything.</strong> Run the
          failing test first. If you cannot reproduce it, stop — the agent must not guess, and
          neither should the task. This is the discipline the{" "}
          <Link href="/docs/swe" className="underline-offset-4 hover:underline">
            SWE workflow
          </Link>{" "}
          encodes, and it is also the discipline your eval tasks require.
        </li>
        <li>
          <strong className="text-paper">Localise to the smallest scope.</strong> A symbol-level
          code map first, then grep, then read the test — the test is the specification.
        </li>
        <li>
          <strong className="text-paper">Make the smallest edit that addresses the root cause.</strong>
          Never rewrite a file, and never edit a test to make it pass. A grader that allows the
          second thing is not a grader.
        </li>
        <li>
          <strong className="text-paper">Verify, then check for regressions.</strong> The repro plus
          the related passing suite. A regression is an undo and a retry, not a patch on top.
        </li>
      </ol>

      <H2 id="report" text="Reporting numbers without lying" />
      <p>
        This is where self-published agent evals usually go wrong, and the fix is simple: publish
        the context or publish nothing.
      </p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted marker:text-ink-700">
        <li>
          <strong className="text-paper">State the harness version.</strong> Results are not
          comparable across harness revisions, and the number moves.
        </li>
        <li>
          <strong className="text-paper">State the exact model id and the retry count.</strong> A
          pass rate with three retries is a different measurement from one with none.
        </li>
        <li>
          <strong className="text-paper">Separate capability from reasoning.</strong> &ldquo;Our
          tool layer passes 15/15 offline gates&rdquo; is a true, useful, narrow claim. It is not
          &ldquo;our agent solves 42% of SWE-bench&rdquo;.
        </li>
        <li>
          <strong className="text-paper">Keep the failing tasks.</strong> A suite that only reports
          wins is a marketing asset. Report the ratio and the distribution.
        </li>
      </ul>
      <div className="pt-2">
        <Callout title="The rule">
          Bench gates measure tool capability, not model reasoning. Real benchmark percentages
          require the official harness plus a model key — report them with harness version, model id
          and retries, never as self-awarded numbers.
        </Callout>
      </div>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "How do you benchmark a coding agent you built yourself?",
            a: "In two separate layers, because they fail for different reasons. Capability gates test whether the harness can do things at all — a round trip, a refused write in the wrong mode, a traversal blocked, an undo that restores. Task evals test whether the agent solves problems. Keep them separate, because a capability failure masquerading as a reasoning failure will send you optimising a prompt when the bug is in your tool result parser.",
          },
          {
            q: "What is a FAIL_TO_PASS test?",
            a: "A test that must fail before the fix and pass after it. It is the core primitive of a trustworthy agent eval, because it removes the two classic false positives: a task that was already solved, and a test that never actually exercised the bug. Every eval task should ship one, alongside a fixture that reproduces the failure and a grader that decides pass or fail mechanically.",
          },
          {
            q: "Should I report SWE-bench scores for my own agent?",
            a: "Only with the official harness version, the exact model id, the retry count and the Docker configuration attached. Self-awarded percentages without that context are marketing, not measurement — the numbers move with the harness, the model and the retry budget, and readers have no way to tell which. Report the harness, the model and the retries, or report nothing.",
          },
        ]}
      />

      <Cta
        title="Run the gates before you trust the demo"
        body="sentinel bench runs the offline capability checks with no model key at all, so a regression shows up in CI rather than in a customer report."
        href="/docs/swe"
        cta="SWE workflow docs"
      />
    </>
  ),
} satisfies Post;

import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "reduce-llm-cost",
  title: "Cut your LLM bill in half: cost control for coding agents",
  metaTitle: "Cut Your LLM Bill: Cost Control for Coding Agents",
  description:
    "Where coding agent spend actually goes, and the seven changes that reduce it most: free-tier defaults, hard context caps, persisted budgets, and a verifier.",
  date: "2026-09-22",
  readingMinutes: 10,
  tags: ["Cost", "Performance", "Operations"],
  keyword: "reduce llm cost coding agent",
  related: ["local-llm-coding-agent", "evaluate-coding-agent", "open-source-ai-coding-agents"],
  faq: [
    {
      q: "Why is my coding agent so expensive?",
      a: "Almost never because of the answers. It is the context: every file read, every grep result and every test log becomes input tokens on the next call, and input is re-billed on every subsequent turn of the loop. A single unbounded grep output can cost more than every message in the conversation combined. The other common cause is a loop that has stopped converging, an agent retrying the same failing edit burns a full turn's context each time.",
    },
    {
      q: "What is the single highest-leverage cost change?",
      a: "Defaulting to a free or near-free model. Teams routinely run a frontier model for every turn including the mechanical ones (listing files, grepping, formatting) when a small free model does the same job. Routing by task is the difference between a bill you watch and a bill you find out about on the invoice.",
    },
    {
      q: "Should I set a hard spending limit?",
      a: "Yes, at the project level rather than the session level. A per-turn cap cannot answer the only question a team lead asks, which is what has this cost so far this week. A persisted ceiling that every run honours, and that fails toward charging you rather than away, is what makes agent spend auditable.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          Agent spend is not mostly the answers. It is <strong>context</strong>: every file read and
          grep result is re-billed as input tokens on every later turn of the loop, so one unbounded
          tool result can cost more than the entire conversation.
        </p>
        <p>
          The highest-leverage change is routing, not optimisation. Put a free model on the
          mechanical turns, a frontier model on the reasoning turns, and cap both with a budget
          that persists after the process exits.
        </p>
      </KeyTakeaways>

      <H2 id="where-money-goes" text="Where the money actually goes" />
      <p>
        Teams audit their model choice first, which is the wrong end of the problem. Here is the
        order of magnitude of what a typical agent turn spends tokens on:
      </p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted marker:text-ink-700">
        <li>
          <strong className="text-paper">Tool output re-read every turn.</strong> A 40k-character
          grep result stays in context for the rest of the loop and is re-billed on each call. This
          is usually the largest single line item.
        </li>
        <li>
          <strong className="text-paper">Cumulative file contents.</strong> Ten files read at 5k
          characters each is 50k characters of context, resent on every subsequent turn.
        </li>
        <li>
          <strong className="text-paper">Failed attempts.</strong> A non-converging loop is the
          most expensive failure mode there is, because each retry carries the full history.
        </li>
        <li>
          <strong className="text-paper">The answer itself.</strong> Genuinely the smallest part, and
          the part everyone optimises.
        </li>
      </ul>
      <p>
        Once you accept that ordering, most &ldquo;use a cheaper model&rdquo; advice is a rounding
        error, and the real wins are all about <em>how much context you admit</em> and{" "}
        <em>how many turns you take</em>.
      </p>

      <H2 id="seven" text="Seven changes, ranked by leverage" />

      <H3 id="c1" text="1. Route by task, not by preference" />
      <p>
        Most teams run one model for everything because choosing per call felt like overhead. It is
        not: a free-tier model handles listing, searching, explaining, formatting and mechanical
        edits, which is the large majority of calls in a working session.
      </p>
      <CodeBlock
        label="terminal"
        code={`# free default, on every new machine
sentinel

# frontier, when the task is actually hard
sentinel ask -m claude-sonnet-4 "why does this deadlock under load?"`}
      />
      <p>
        The deeper version of this is a standing loop that wakes on every failed test. That job is
        perfect for a cheap model and terrible for a frontier one, because it runs unattended and
        often.
      </p>

      <H3 id="c2" text="2. Truncate tool output hard, and do it in one place" />
      <p>
        A cap enforced at the tool boundary is worth more than any prompt instruction asking the
        model to be brief, because the model cannot see what it was never sent. Sentinel truncates
        tool results at 20k characters, and 30k in SWE mode, before they reach context. If you are
        writing your own agent, this is a five-line change with a disproportionate effect.
      </p>
      <p>
        The corollary matters more: <em>truncate from the right end, not the left</em>. The first
        few kilobytes of a grep result carry the matches; the tail is usually the same file
        repeated. Truncating the head is how you get an agent that confidently edits the wrong
        part of a file.
      </p>

      <H3 id="c3" text="3. Orient with a code map, not a file dump" />
      <p>
        Reading six files to answer &ldquo;where is the retry logic&rdquo; costs six files of
        context, every turn, forever. A symbol-level overview (functions, classes and exports per
        file) is a fraction of the size and is usually enough to pick the one file worth reading.
        This is the cheapest quality-per-token win available to an agent.
      </p>

      <H3 id="c4" text="4. Compact on a threshold, not at the edge" />
      <p>
        Let context run to the model&rsquo;s limit and you are paying full price for the last turn
        before a failure. Compact at a fixed fraction (40k in Sentinel&rsquo;s case), and the
        expensive tail never happens.
      </p>
      <div className="pt-2">
        <Callout title="Watch for the compaction loop bug">
          A compaction that re-triggers itself on the message it just produced will loop until the
          iteration cap, burning the whole budget. If your spend jumps on long sessions
          specifically, check this before anything else.
        </Callout>
      </div>

      <H3 id="c5" text="5. Cap iterations and make them mean something" />
      <p>
        An unbounded loop is a budget you did not set. A cap is necessary but not sufficient, a
        loop that hits its cap having accomplished nothing has wasted the maximum. Pair the cap with
        a progress signal and a backoff: an agent that has not written anything and has not met the
        goal has not moved, and should wait rather than retry immediately.
      </p>
      <CodeBlock
        label="bash"
        code={`# 60 iterations, not infinity
sentinel swe

# a ceiling that outlives the process
sentinel budget --usd 25 --deadline 2h --condition "npm test exits 0"
sentinel budget   # active  ████░░░░░░  $12.40 of $25.00 (50%) · 1h 59m left`}
      />

      <H3 id="c6" text="6. Give the agent a verifier instead of a conversation" />
      <p>
        Every turn spent asking &ldquo;is this right yet?&rdquo; is a turn you pay for. A failing test
        is a free, deterministic, unambiguous verifier, and it is why the{" "}
        <Link href="/docs/swe" className="underline-offset-4 hover:underline">
          reproduce-first SWE workflow
        </Link>{" "}
        exists: reproduce, fix, verify, regress. The agent stops negotiating with itself.
      </p>
      <p>
        The same idea generalises. Any place you can replace &ldquo;ask the model whether this is
        right&rdquo; with a command that exits 0 or non-zero is a place you have deleted a turn
        from the budget.
      </p>

      <H3 id="c7" text="7. Persist the budget where the team can see it" />
      <p>
        A per-turn cost cap is a safety rail. A per-project ceiling is an operating control, because
        it answers the only question a lead asks: what has this cost so far this week. Sentinel
        stores the ceiling and an append-only spend log in the project, so a run that crashes
        mid-write loses one row rather than the history.
      </p>
      <p>
        Two details worth copying. Spend recorded <em>before</em> the budget existed should not count
        against it, or you cannot adopt a budget mid-engagement. And a turn finishing in the same
        millisecond the budget was created <em>should</em> count, a ceiling must fail toward
        charging you, not away.
      </p>

      <H2 id="measure" text="Measure it or it does not happen" />
      <p>
        Cost work fails silently because nobody can attribute it. Three things make it stick:
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-muted marker:text-moss">
        <li>
          <strong className="text-paper">Print cost per turn, always.</strong> Not in a debug flag.
          If the number is one keystroke away, people make better decisions; if it needs a dashboard,
          they do not.
        </li>
        <li>
          <strong className="text-paper">Attribute to a run id, not a session.</strong> Sessions
          blur across days. Runs do not.
        </li>
        <li>
          <strong className="text-paper">Default the cheap model to be free.</strong> Cost control
          that depends on everyone remembering is not a control. If the safe choice is also the
          zero-cost choice, behaviour follows.
        </li>
      </ol>
      <CodeBlock
        label="terminal"
        code={`# every run ends with the receipt
sentinel ask "add a regression test for the retry path"
#   in 4,182 · out 611 · $0.0000 · openai/gpt-oss-20b · 3 turns · 11.4s`}
      />

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "Why is my coding agent so expensive?",
            a: "Almost never because of the answers. It is the context: every file read, every grep result and every test log becomes input tokens on the next call, and input is re-billed on every subsequent turn of the loop. A single unbounded grep output can cost more than every message in the conversation combined. The other common cause is a loop that has stopped converging, an agent retrying the same failing edit burns a full turn's context each time.",
          },
          {
            q: "What is the single highest-leverage cost change?",
            a: "Defaulting to a free or near-free model. Teams routinely run a frontier model for every turn including the mechanical ones (listing files, grepping, formatting) when a small free model does the same job. Routing by task is the difference between a bill you watch and a bill you find out about on the invoice.",
          },
          {
            q: "Should I set a hard spending limit?",
            a: "Yes, at the project level rather than the session level. A per-turn cap cannot answer the only question a team lead asks, which is what has this cost so far this week. A persisted ceiling that every run honours, and that fails toward charging you rather than away, is what makes agent spend auditable.",
          },
        ]}
      />

      <Cta
        title="Start the receipt, not the bill"
        body="A free-tier default, hard context caps, and a budget that survives the process. See what a turn actually costs."
        href="/docs/config"
        cta="Configuration"
      />
    </>
  ),
} satisfies Post;

import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { CompareTable, Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "cursor-cli-course-quiz",
  title: "Quiz: can you spot the three agents that would leak?",
  metaTitle: "Cursor-Style CLI Quiz: Spot the Leaks",
  description:
    "Twelve questions on building a terminal coding agent, with answers, because the wrong options are more instructive than the right ones.",
  date: "2026-10-15",
  readingMinutes: 11,
  tags: ["Quiz", "Tutorial", "Security"],
  keyword: "cursor style cli quiz",
  series: { slug: "cursor-cli-course", order: 11 },
  related: ["cursor-cli-course-overview", "ai-coding-agent-guardrails", "agent-ask-plan-modes"],
  faq: [
    {
      q: "How should I use this quiz?",
      a: "Answer before reading the explanations, and treat a wrong answer as more informative than a right one. The wrong options are all things that look reasonable, ship, and pass a code review. Which is precisely why they get written. If you get all twelve right, the next thing worth doing is writing the parts you disagreed with, because an agent you can defend is an agent your team will adopt.",
    },
    {
      q: "Is there a score that means 'ready to build this'?",
      a: "Not really. What matters is whether you can explain why the wrong options are wrong without referring to the article. Questions 4, 5 and 8 are the ones that separate 'has read about guard rails' from 'has had to debug one'. If those three are shaky, read parts 8 through 10 again rather than pressing on.",
    },
    {
      q: "Why are there so many questions about refusals?",
      a: "Because an agent's value is judged almost entirely on the turns where it says no. A model that answers every question competently is easy to build; a model that is trustworthy on the tenth run, when it is tired and you are watching a migration, is the entire product. Every control in parts 8 through 10 exists to make one specific refusal correct.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          Twelve questions covering parts 1&ndash;10. The wrong answers are the point:{" "}
          <strong>each one is something that looks reasonable, ships, and passes a code review</strong>
          , which is exactly why it gets written.
        </p>
        <p>
          Questions 4, 5 and 8 are the ones that separate &ldquo;has read about guard rails&rdquo; from{" "}
          <strong>&ldquo;has had to debug one at 2am&rdquo;</strong>. If those are shaky, go back to parts
          8&ndash;10 rather than pressing on.
        </p>
      </KeyTakeaways>

      <H2 id="q1" text="1. Where should the permission check for a tool call live?" />
      <p className="text-muted">
        The model requests <code className="font-mono text-[13px]">writeFile</code> in PLAN mode. Where
        does the refusal happen?
      </p>
      <ol className="list-[a] space-y-1.5 pl-5 text-muted marker:text-moss">
        <li>In the system prompt, phrased firmly.</li>
        <li>In the tool handler, before dispatch.</li>
        <li>After the write, by rolling it back.</li>
        <li>In the provider layer, by filtering the response.</li>
      </ol>
      <p className="text-sm text-moss">
        <strong>B.</strong> The loop checks the mode before calling the tool. A prompt is advice that
        competes for attention with the task; a rollback is a write that already happened. See{" "}
        <Link href="/blog/agent-ask-plan-modes" className="text-moss underline-offset-4 hover:underline">
          part 8
        </Link>
        .
      </p>

      <H2 id="q2" text="2. A user approves `git commit` for the session. Later the agent runs `git push --force`. What should happen?" />
      <ol className="list-[a] space-y-1.5 pl-5 text-muted marker:text-moss">
        <li>It runs. Bash is allowed.</li>
        <li>It asks, force-push is a different command shape.</li>
        <li>It runs, the session grant covers all git.</li>
        <li>It is denied permanently. Git is dangerous.</li>
      </ol>
      <p className="text-sm text-moss">
        <strong>B.</strong> A session grant covers a <em>shape</em>. This only works if{" "}
        <code className="font-mono text-[13px]">git commit</code> and{" "}
        <code className="font-mono text-[13px]">git push</code> reduce to different shapes, which takes
        deliberate work. See{" "}
        <Link href="/blog/risk-ledger-command-shapes" className="text-moss underline-offset-4 hover:underline">
          part 9
        </Link>
        .
      </p>

      <H2 id="q3" text="3. Which SSE detail, if missed, silently breaks your cost accounting?" />
      <ol className="list-[a] space-y-1.5 pl-5 text-muted marker:text-moss">
        <li>Using <code className="font-mono text-[13px]">TextDecoder</code> without the streaming flag.</li>
        <li>Flushing the buffer after the stream ends.</li>
        <li>Skipping `[DONE]` frames.</li>
        <li>Not setting `signal` on the fetch.</li>
      </ol>
      <p className="text-sm text-moss">
        <strong>B.</strong> Servers routinely close without a trailing blank line, so the final frame
        (carrying <code className="font-mono text-[13px]">finish_reason</code> and usage) is still in
        your accumulator. (A is a real bug too: you get replacement characters mid-word. It breaks
        output rather than billing.) See{" "}
        <Link href="/blog/first-agent-turn-claude-agent-sdk" className="text-moss underline-offset-4 hover:underline">
          part 5
        </Link>
        .
      </p>

      <H2 id="q4" text="4. Your agent CLI writes a spinner. CI runs it and the build log fills with spinner frames. What is the correct fix?" />
      <ol className="list-[a] space-y-1.5 pl-5 text-muted marker:text-moss">
        <li>Detect CI and slow the spinner down.</li>
        <li>Send the spinner to stderr and leave stdout clean.</li>
        <li>Gate the spinner on `process.stdout.isTTY`.</li>
        <li>Disable animation whenever `--json` is passed.</li>
      </ol>
      <p className="text-sm text-moss">
        <strong>C.</strong> B is necessary but not sufficient, CI captures both streams, so stderr
        frames land in the log too. D handles one code path and misses the twenty other ways CI runs
        your tool. See{" "}
        <Link href="/blog/chalk-figlet-terminal-banner" className="text-moss underline-offset-4 hover:underline">
          part 3
        </Link>
        .
      </p>

      <H2 id="q5" text="5. The risk ledger file is corrupted by a merge conflict. What happens?" />
      <ol className="list-[a] space-y-1.5 pl-5 text-muted marker:text-moss">
        <li>It falls back to prompting on everything, correct.</li>
        <li>It falls back to allowing everything for the session.</li>
        <li>It refuses all shell commands until fixed.</li>
        <li>It regenerates an empty ledger and logs a warning.</li>
      </ol>
      <p className="text-sm text-moss">
        <strong>A.</strong> The module fails closed: unreadable is treated as empty, and empty means
        every novel command is asked. B is the trap, a truncated write silently disables the whole
        mechanism, and disables it <em>quietly</em>. See part 9.
      </p>

      <H2 id="q6" text="6. Why record tool-call arguments in history when trimming for a request budget?" />
      <ol className="list-[a] space-y-1.5 pl-5 text-muted marker:text-moss">
        <li>For debugging, so a trace is complete.</li>
        <li>They count toward request size, one big writeFile can blow the limit.</li>
        <li>Because the provider requires them alongside tool results.</li>
        <li>To let the model see what it already wrote.</li>
      </ol>
      <p className="text-sm text-moss">
        <strong>B.</strong> A 40,000-character file body stays in the request forever after, so
        trimming only tool <em>results</em> is not enough. Keep the call id when truncating, or the
        result stops linking back and the provider rejects the ordering. See part 5.
      </p>

      <H2 id="q7" text="7. The user presses Ctrl-C mid-turn. Which cleanup happens automatically?" />
      <ol className="list-[a] space-y-1.5 pl-5 text-muted marker:text-moss">
        <li>Nothing, you need an explicit handler per resource.</li>
        <li>The generator's `finally` blocks run.</li>
        <li>The HTTP request is aborted.</li>
        <li>All three, automatically.</li>
      </ol>
      <p className="text-sm text-moss">
        <strong>B.</strong> Breaking a <code className="font-mono text-[13px]">for await</code> loop
        calls the generator&rsquo;s <code className="font-mono text-[13px]">.return()</code>, which runs{" "}
        <code className="font-mono text-[13px]">finally</code>. C still needs an{" "}
        <code className="font-mono text-[13px]">AbortSignal</code> threaded into the provider call, 
        the socket does not know about your loop. See{" "}
        <Link href="/blog/chat-cli-async-generators" className="text-moss underline-offset-4 hover:underline">
          part 7
        </Link>
        .
      </p>

      <H2 id="q8" text="8. The blast-radius gate blocks the first write to a migration. Why not every write?" />
      <ol className="list-[a] space-y-1.5 pl-5 text-muted marker:text-moss">
        <li>Subsequent writes to the same path are provably part of the same change.</li>
        <li>It would be too slow for large migrations.</li>
        <li>The gate has a per-turn cap of one block.</li>
        <li>Because migrations should only ever be written once.</li>
      </ol>
      <p className="text-sm text-moss">
        <strong>A</strong>, with the reason being adoption rather than logic. A gate that fires
        repeatedly trains people to disable it, and a disabled gate is worse than none because you stop
        looking for it. C is not true. The state is per path, not per turn. See part 10.
      </p>

      <H2 id="q9" text="9. Which mode lets an agent edit files but not execute commands?" />
      <ol className="list-[a] space-y-1.5 pl-5 text-muted marker:text-moss">
        <li>PLAN</li>
        <li>FIX</li>
        <li>REVIEW</li>
        <li>SCAN</li>
      </ol>
      <p className="text-sm text-moss">
        <strong>B.</strong> This is the most useful mode most permission designs skip. It is the
        difference between &ldquo;let it help&rdquo; and &ldquo;let it help and verify&rdquo;, and the
        reason teams end up either refusing writes entirely or granting shell access. See part 8.
      </p>

      <H2 id="q10" text="10. Your pre-flight reports `warn` on Windows because of the PATH separator. What should `doctor` do?" />
      <ol className="list-[a] space-y-1.5 pl-5 text-muted marker:text-moss">
        <li>Exit 1, so the problem is visible in CI.</li>
        <li>Exit 0 and print the warning.</li>
        <li>Suppress warnings on Windows.</li>
        <li>Exit 0 but suppress the warning too.</li>
      </ol>
      <p className="text-sm text-moss">
        <strong>B.</strong> Only a genuine failure should be non-zero. If warnings fail the run on any
        platform, people wrap it in <code className="font-mono text-[13px]">|| true</code> and then it
        never runs at all &mdash; which is worse than not shipping the check. (This one is a real bug I
        shipped and fixed in this repo.) See{" "}
        <Link href="/blog/cli-doctor-preflight-checks" className="text-moss underline-offset-4 hover:underline">
          part 4
        </Link>
        .
      </p>

      <H2 id="q11" text="11. You want to store an API key. Where?" />
      <ol className="list-[a] space-y-1.5 pl-5 text-muted marker:text-moss">
        <li>In <code className="font-mono text-[13px]">.sentinel.yaml</code>, committed.</li>
        <li>In the environment, with the config file holding only non-secret settings.</li>
        <li>In the config file at 0600, gitignored.</li>
        <li>In a prompt template, so it is easy to copy.</li>
      </ol>
      <p className="text-sm text-moss">
        <strong>B.</strong> The reason is not just git hygiene: it is that a pre-flight, a diagnostic
        and a bug report can all mention the variable{" "}
        <em>name</em> safely. Sentinel&rsquo;s doctor prints{" "}
        <code className="font-mono text-[13px]">groq (GROQ_API_KEY)</code> and never the value, and
        there is a test that fails if a canary key appears anywhere in the output. See part 4.
      </p>

      <H2 id="q12" text="12. The agent loop needs to serve a TUI, a `--json` pipeline, and MCP. What is the right shape?" />
      <ol className="list-[a] space-y-1.5 pl-5 text-muted marker:text-moss">
        <li>Three loops, one per output format, sharing the tool layer.</li>
        <li>One loop that prints, plus a mode flag.</li>
        <li>One loop that yields typed events; three consumers.</li>
        <li>An HTTP server with three routes.</li>
      </ol>
      <p className="text-sm text-moss">
        <strong>C.</strong> B cannot produce JSON without a parallel code path, which is how the two
        paths drift. D adds an auth story and a port for something running on your machine. See part 7.
      </p>

      <H2 id="score" text="How did you do?" />
      <CompareTable
        caption="What your score suggests"
        head={["Score", "What it means"]}
        rows={[
          [
            "11–12",
            "You are ready to build this. The next thing that will teach you is a real task on a real repository, not more reading",
          ],
          [
            "8–10",
            "Sound grasp of the shape. Re-read parts 8–10; the misses cluster there for almost everyone",
          ],
          [
            "5–7",
            "You have the vocabulary without the failure modes. Build parts 1–4, which need no model access, and the rest will follow",
          ],
          [
            "0–4",
            "Not a problem. These are subtle by design. Start at part 3, since the output discipline is the cheapest habit to build",
          ],
        ]}
      />
      <Callout title="The three that catch experienced engineers out">
        <p>
          Questions 5, 8 and 10. All three are about failure modes that never announce themselves: a
          mechanism that silently disabled, a control that trains its own removal, and a health check
          that fails so routinely nobody runs it. The pattern is consistent &mdash;{" "}
          <strong>the dangerous bugs in agent tooling are the ones that work</strong>.
        </p>
      </Callout>

      <H2 id="next" text="What part 12 adds" />
      <p>
        The last part is not code. It is the conversation you will actually have: what you say when a
        cautious tech lead asks whether the team should run an agent with shell access on the
        production repository, and what you can honestly offer instead of a demo.
      </p>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "How should I use this quiz?",
            a: "Answer before reading the explanations, and treat a wrong answer as more informative than a right one. The wrong options are all things that look reasonable, ship, and pass a code review. Which is precisely why they get written. If you get all twelve right, the next thing worth doing is writing the parts you disagreed with, because an agent you can defend is an agent your team will adopt.",
          },
          {
            q: "Is there a score that means 'ready to build this'?",
            a: "Not really. What matters is whether you can explain why the wrong options are wrong without referring to the article. Questions 4, 5 and 8 are the ones that separate 'has read about guard rails' from 'has had to debug one'. If those three are shaky, read parts 8 through 10 again rather than pressing on.",
          },
          {
            q: "Why are there so many questions about refusals?",
            a: "Because an agent's value is judged almost entirely on the turns where it says no. A model that answers every question competently is easy to build; a model that is trustworthy on the tenth run, when it is tired and you are watching a migration, is the entire product. Every control in parts 8 through 10 exists to make one specific refusal correct.",
          },
        ]}
      />

      <Cta
        title="One part left"
        body="The conversation you will actually have: a cautious tech lead, and what you can honestly offer instead of a demo."
        href="/blog/convince-tech-lead-terminal-agent"
        cta="Part 12: the adoption pitch"
      />

      <p className="text-sm text-muted">
        Prefer to go back? The{" "}
        <Link href="/series/cursor-cli-course" className="text-moss underline-offset-4 hover:underline">
          full curriculum
        </Link>{" "}
        lists all twelve in order.
      </p>
    </>
  ),
} satisfies Post;

import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "local-llm-coding-agent",
  title: "Run a coding agent on local models with Ollama or LM Studio",
  metaTitle: "Run a Coding Agent on Local Models (Ollama)",
  description:
    "A practical guide to running an AI coding agent on local models: which model sizes work for which jobs, how to route between local and hosted, and what still breaks.",
  date: "2026-09-15",
  readingMinutes: 9,
  tags: ["Local models", "Privacy", "Ollama"],
  keyword: "local llm coding assistant",
  related: ["mcp-server-for-coding-agents", "reduce-llm-cost", "open-source-ai-coding-agents"],
  faq: [
    {
      q: "Can an AI coding agent run fully offline?",
      a: "Yes, if the model is local. With Ollama or LM Studio running on the same machine, the agent, the model and the tools all execute locally and no request leaves your network. The agent binary being open source is not sufficient on its own — a local model is what actually makes the run private, because the model call is where your source code would otherwise be sent.",
    },
    {
      q: "What is the best local model size for coding?",
      a: "For reading, searching, explaining and reviewing, a 7B to 8B model is genuinely usable. For multi-file edits and long-horizon reasoning, expect to want 20B and up, or a quantised 30B-class model if you have the VRAM. Beyond roughly 30B parameters the practical limit stops being the model and becomes your context window: local models generally have shorter context windows, and coding agents live or die on how much of the repo they can hold at once.",
    },
    {
      q: "Are local models cheaper than hosted APIs?",
      a: "Per token, no — a local token costs electricity and hardware you already own. Per engineering hour, often yes, if the tasks you route locally are the high-volume mechanical ones. Local inference is free at the margin, which makes it a good fit for a standing loop that wakes on every failed test, and a poor fit for the one hard reasoning problem you need to get right.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          A local model is the only thing that makes an agent run genuinely private: the agent binary
          being open source stops telemetry, but the model call is where your source code actually
          goes.
        </p>
        <p>
          The honest capability split: local models are <strong>excellent</strong> at search,
          explanation, review and mechanical edits, and <strong>mediocre</strong> at long multi-step
          changes. Route accordingly instead of picking one model for everything.
        </p>
      </KeyTakeaways>

      <H2 id="why-local" text="What &ldquo;local&rdquo; actually buys you" />
      <p>
        Open source is often sold as the privacy property, but it is only half of it. An
        open source agent that calls a hosted model still sends your prompt, the contents of every
        file it reads, and its tool output to that provider&apos;s API. Auditing the agent tells you
        what the <em>agent</em> does with that data. It says nothing about the <em>model provider</em>.
      </p>
      <p>
        Running the model on your own hardware is what closes the loop. With Ollama or LM Studio
        bound to localhost, the request never leaves the machine, which matters when:
      </p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted marker:text-ink-700">
        <li>
          <strong className="text-paper">Your code cannot leave your infrastructure.</strong> Not a
          policy promise from a vendor, not a zero-retention setting with an expiry — a network fact
          you can verify with <code className="font-mono text-[13px]">lsof</code>.
        </li>
        <li>
          <strong className="text-paper">You are on a plane, on a train, or air-gapped.</strong> The
          agent keeps working. This is a bigger deal than it sounds.
        </li>
        <li>
          <strong className="text-paper">Marginal cost is zero.</strong> Every extra local turn is
          free, so the tool that wakes on every failed test is affordable.
        </li>
        <li>
          <strong className="text-paper">No rate limits.</strong> This is what makes an unattended
          loop possible at all.
        </li>
      </ul>

      <H2 id="setup" text="Setup: two commands, no API key" />
      <CodeBlock
        label="terminal"
        code={`# 1. install and start Ollama (default host http://localhost:11434)
ollama serve

# 2. pull a coding-capable model
ollama pull qwen2.5-coder:14b

# 3. run the agent — no API key of any kind
cd SENTINEL-CLI && npm install && npm link
sentinel`}
      />
      <p>
        Sentinel auto-discovers models from a local runtime on startup, so there is nothing to
        configure. LM Studio works the same way. If your runtime is on a different port, set{" "}
        <code className="font-mono text-[13px] text-paper">OLLAMA_HOST</code> or{" "}
        <code className="font-mono text-[13px] text-paper">LMSTUDIO_HOST</code>.
      </p>
      <CodeBlock
        label="terminal"
        code={`export OLLAMA_HOST=http://localhost:11434

# confirm what the agent actually sees
sentinel --version
sentinel ask "list the entry points in src/agent"`}
      />

      <H2 id="model-sizing" text="Model sizing: match the model to the job" />
      <p>
        The mistake is picking one model and expecting it to do everything. Local models differ
        enormously by size, and the difference shows up in a specific place: how many tool calls in
        a row they can complete without losing the thread.
      </p>
      <CompareTableSizing />
      <p>
        The column people underrate is <strong>context</strong>. Coding agents live on how much of
        the repo they can hold at once, and local models generally ship with shorter context
        windows than hosted frontier models. Past roughly 30B parameters, the wall you hit is your
        context budget rather than your VRAM — which is why compaction, read-only code maps and hard
        output caps exist as features rather than as niceties.
      </p>

      <H3 id="tool-calling" text="Tool calling is the skill that matters" />
      <p>
        Benchmark charts measure prose quality. Agents need something narrower and stranger:
        emitting a syntactically valid tool call, with the right arguments, in the right order, for
        twenty consecutive steps without inventing a parameter. That is a different axis, and a
        coder-tuned model at 14B can beat a general model twice its size.
      </p>
      <p>
        Two practical consequences. First, prefer a model explicitly tuned for tool use over a
        general chat model. Second, give it fewer, wider tools — every additional tool is another
        chance to pick the wrong one.
      </p>

      <H2 id="hybrid" text="The answer most people land on: hybrid routing" />
      <p>
        Pure-local and pure-hosted are both wrong for real work. The useful setup is a default
        local model for the mechanical majority, and an explicit escape hatch to a hosted model for
        the one hard problem.
      </p>
      <CompareTableRouting />
      <p>
        This is cheap to do because the model is a runtime choice, not a build-time decision. In
        Sentinel you switch with <code className="font-mono text-[13px] text-paper">/model</code>{" "}
        inside the TUI, or per call with{" "}
        <code className="font-mono text-[13px] text-paper">--model</code> on the CLI. Set a
        project budget and a standing loop will not quietly spend your afternoon on a hosted model.
      </p>
      <CodeBlock
        label="terminal"
        code={`# local by default, with a ceiling that survives the process
sentinel budget --usd 5 --deadline 4h

# mechanical, on hardware you own
sentinel ask "which files import the deprecated logger?"

# hard, on a frontier model, still inside the budget
sentinel ask -m claude-sonnet-4 "why does this deadlock only under load?"`}
      />

      <H2 id="failure-modes" text="What still breaks, and what to do about it" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Failure
          title="The model stops emitting tool calls"
          body="Symptom: the agent answers in prose instead of acting. Fix: switch to a tool-tuned model, and reduce the number of tools in the active mode."
        />
        <Failure
          title="Context exhaustion mid-task"
          body="Symptom: the agent starts re-reading files it already read, or contradicts itself. Fix: keep compaction on, and use read-only code maps instead of whole-file reads to orient."
        />
        <Failure
          title="Silent truncation on big files"
          body="Symptom: the fix is applied to the top half of a file. Fix: prefer exact-match edits over whole-file writes, and lean on the diff tool to preview before applying."
        />
        <Failure
          title="Hallucinated paths"
          body="Symptom: it claims to have edited a file that does not exist. Fix: this is what the sandbox is for — an out-of-root path is rejected rather than created, so the failure is loud."
        />
      </div>

      <div className="pt-2">
        <Callout title="On the local-routing claim" tone="warn">
          If your organisation requires a specific model for a specific class of code, enforce that
          in your own config, not in the agent. An agent that can silently switch models can also
          silently switch them on a path you did not review.
        </Callout>
      </div>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "Can an AI coding agent run fully offline?",
            a: "Yes, if the model is local. With Ollama or LM Studio running on the same machine, the agent, the model and the tools all execute locally and no request leaves your network. The agent binary being open source is not sufficient on its own — a local model is what actually makes the run private, because the model call is where your source code would otherwise be sent.",
          },
          {
            q: "What is the best local model size for coding?",
            a: "For reading, searching, explaining and reviewing, a 7B to 8B model is genuinely usable. For multi-file edits and long-horizon reasoning, expect to want 20B and up, or a quantised 30B-class model if you have the VRAM. Beyond roughly 30B parameters the practical limit stops being the model and becomes your context window: local models generally have shorter context windows, and coding agents live or die on how much of the repo they can hold at once.",
          },
          {
            q: "Are local models cheaper than hosted APIs?",
            a: "Per token, no — a local token costs electricity and hardware you already own. Per engineering hour, often yes, if the tasks you route locally are the high-volume mechanical ones. Local inference is free at the margin, which makes it a good fit for a standing loop that wakes on every failed test, and a poor fit for the one hard reasoning problem you need to get right.",
          },
        ]}
      />

      <Cta
        title="Point it at a local model"
        body="Start Ollama, run sentinel, and no API key is required. Model providers are a runtime choice, not a commitment."
        href="/docs/quickstart"
        cta="Quickstart"
      />
    </>
  ),
} satisfies Post;

function CompareTableSizing() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">Local model sizes by task</caption>
        <thead>
          <tr className="border-b border-ink-800">
            {["Class", "Good at", "Weak at", "Context"].map((h) => (
              <th key={h} scope="col" className="px-3 py-2.5 font-mono text-xs uppercase tracking-wide text-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            ["7–8B", "Search, explain, review, one-file edits", "Multi-step changes, novel abstractions", "8–32k"],
            ["13–14B", "Most refactors, test writing, migrations", "Long autonomous runs without checkpoints", "32k"],
            ["30–34B", "Complex debugging, architectural edits", "Raw throughput; needs the VRAM", "32–128k"],
            ["70B+", "Reasoning-heavy work", "Everything about latency and memory", "32–128k"],
          ].map((r) => (
            <tr key={r[0]} className="border-b border-ink-800/60 last:border-0">
              {r.map((c, i) => (
                <td key={i} className={`px-3 py-2.5 align-top ${i === 0 ? "font-mono text-moss" : "text-muted"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompareTableRouting() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">Which model to route which task to</caption>
        <thead>
          <tr className="border-b border-ink-800">
            {["Task", "Route", "Why"].map((h) => (
              <th key={h} scope="col" className="px-3 py-2.5 font-mono text-xs uppercase tracking-wide text-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            ["Find the caller of X", "Local", "High volume, zero risk, mechanical"],
            ["Explain this module", "Local", "Read-and-summarise is a local model strength"],
            ["Review a diff", "Local", "Pattern matching over structure, not novel reasoning"],
            ["Fix one failing test", "Local or small hosted", "Bounded, has a verifier"],
            ["Refactor across 6 files", "Hosted frontier", "Long-horizon planning is where small models fail"],
            ["Diagnose a production incident", "Hosted frontier", "The cost of being wrong is not symmetric"],
          ].map((r) => (
            <tr key={r[0]} className="border-b border-ink-800/60 last:border-0">
              <td className="px-3 py-2.5 font-medium text-paper">{r[0]}</td>
              <td className="px-3 py-2.5 font-mono text-[13px] text-moss">{r[1]}</td>
              <td className="px-3 py-2.5 text-muted">{r[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Failure({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-ink-800 bg-ink-900 p-4">
      <p className="text-sm font-semibold text-paper">{title}</p>
      <p className="mt-1.5 text-sm leading-6 text-muted">{body}</p>
    </div>
  );
}

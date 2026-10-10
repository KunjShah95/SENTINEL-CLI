import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { CompareTable, Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "cursor-cli-course-overview",
  title: "What a Cursor-style terminal agent actually has to do",
  metaTitle: "Cursor-Style CLI Coding Agent: The Brief",
  description:
    "The shortest honest brief for building a terminal coding agent: find the command, stream the turn, gate the writes, print the cost, and fail in a way a human can read.",
  date: "2026-10-05",
  readingMinutes: 9,
  tags: ["Tutorial", "Architecture", "Agent"],
  keyword: "cursor style cli coding agent",
  series: { slug: "cursor-cli-course", order: 1 },
  related: ["cursor-alternative-cli", "ai-coding-agent-guardrails", "reduce-llm-cost"],
  faq: [
    {
      q: "What makes a CLI coding agent different from a chat wrapper?",
      a: "Three things, and all three are failure modes rather than features. It must reach files the prompt never mentions, so it needs tools rather than text in and text out. It must stream, because a 40-second silent turn is indistinguishable from a hang. And it must be able to refuse, because the model will eventually ask to rewrite a file it should not touch. A CLI without the third property is a script that can delete your work.",
    },
    {
      q: "Do I need the Claude Agent SDK to build one of these?",
      a: "No, and this course deliberately does not require it. You need a streaming completion API and a tool-calling loop; those are about 200 lines. The Claude Agent SDK is a good default because it ships file and shell tools, permission modes and hooks you would otherwise write yourself, but it is an implementation choice, not the definition of the product. Part 5 shows the hand-rolled loop so the choice stays yours.",
    },
    {
      q: "How long does it take to go from empty directory to working agent?",
      a: "Parts 1 to 4 (argument parsing, a banner, pre-flight checks and a read-only chat loop) are a couple of hours and no model access beyond one API key. That first version already answers questions about your codebase. Everything after that is about letting it write, and about being able to prove what it did.",
    },
    {
      q: "Should I build this or just install an existing agent?",
      a: "Install one if you want the capability, build one if you want to understand the permission surface. The reason the second reason matters is that every guard rail in a finished agent is a few hundred lines of ordinary code, and you cannot audit a control you have not seen the shape of. This course is the cheapest way to get that shape into your head.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          A terminal coding agent is five obligations: a command surface, a streamed loop,{" "}
          <strong>tools that touch files</strong>, a permission gate that the model cannot argue its
          way past, and per-turn accounting. Everything else is presentation.
        </p>
        <p>
          The order you build them in matters more than the stack you build them with. Get the{" "}
          <strong>refusal path</strong> working before the write path, because a write you cannot gate
          is the one bug you cannot ship around.
        </p>
      </KeyTakeaways>

      <H2 id="brief" text="The brief, in one screen" />
      <p>
        Here is the whole product. Not a roadmap &mdash; the actual obligations, each of which either
        works or the tool is unusable.
      </p>
      <ol className="list-decimal space-y-2.5 pl-5 text-muted marker:text-moss">
        <li>
          <strong className="text-paper">A command.</strong> One name, subcommands, a{" "}
          <code className="font-mono text-[13px]">--help</code> that is accurate, and a non-zero exit
          code on failure. A CLI that lies about its own flags is worse than no CLI.
        </li>
        <li>
          <strong className="text-paper">A loop that streams.</strong> Tokens arrive incrementally. A
          turn that prints nothing for 40 seconds reads as a crash, and you debug the wrong thing.
        </li>
        <li>
          <strong className="text-paper">Tools.</strong> Read, list, glob, grep, write, edit, run. The
          model can only discuss files it has been shown, and a grep tool shows it thousands.
        </li>
        <li>
          <strong className="text-paper">A gate.</strong> Read-only by default. The refusal is{" "}
          <em>code</em>, not a sentence in the system prompt &mdash; a prompt is advice, and advice is
          advisory.
        </li>
        <li>
          <strong className="text-paper">Accounting.</strong> Tokens and dollars per turn, printed.
          A tool whose cost you cannot see is a tool whose cost you cannot control.
        </li>
      </ol>

      <H2 id="what-sentinel-is" text="What this course builds" />
      <p>
        This course builds a working terminal agent and grounds every part in{" "}
        <a
          href="https://github.com/KunjShah95/SENTINEL-CLI"
          className="text-moss underline-offset-4 hover:underline"
        >
          Sentinel
        </a>
        , the MIT-licensed agent in this repository. That is a deliberate constraint. Every command,
        file path and module name in the twelve parts is one you can run and grep, so when a part
        disagrees with the code you have found a bug rather than a version difference.
      </p>
      <CodeBlock
        label="terminal"
        code={`# the finished thing, in four commands
git clone https://github.com/KunjShah95/SENTINEL-CLI.git
cd SENTINEL-CLI && npm install && npm link

export GROQ_API_KEY=gsk_...   # a free tier is enough for every part
sentinel doctor              # pre-flight: runtime, keys, tool layer
sentinel ask "what does this repo do?"`}
      />

      <H2 id="shape" text="The one file that matters" />
      <p>
        Everything else is plumbing around a loop. Sentinel&rsquo;s is 1,100 lines and yields typed
        events rather than printing directly, which is the single most important decision in the
        codebase: it lets the TUI and the CLI drive the identical agent without either one knowing
        about the other.
      </p>
      <CodeBlock
        label="src/agent/loop.js"
        code={`// The contract, in full. Everything the UI can observe:
export async function* runAgentTurn({ history, mode, model, goal }) {
  yield* streamModel(history);        // -> { event: 'text', data: { delta } }
  // -> { event: 'tool_call', data: { toolName, input } }

  const decision = gate(toolName, mode);   // <- the control that matters
  if (decision === 'deny') {
    yield { event: 'tool_result', data: { denied: true, why: decision.reason } };
    continue;                                // never reaches the tool
  }

  yield* execute(toolName, input);   // sandboxed to the project root
  yield { event: 'finish', data: { usage, costUsd } };
  // -> { event: 'error', data: { message } }
}`}
      />
      <p>
        Three properties fall out of that shape. The gate is called in the loop rather than in the
        prompt, so it cannot be talked past. Tools are executed in-process, so there is no HTTP
        boundary between the model and the filesystem &mdash; which means no auth, no port, and an
        attack surface you can read in one sitting. And the loop yields, so a terminal UI, a{" "}
        <code className="font-mono text-[13px]">--json</code> pipeline and an MCP server are all just
        different consumers of the same generator.
      </p>

      <H2 id="modes" text="Permission modes are the product" />
      <p>
        The cheapest useful design decision in this space is also the one most projects skip: define
        a small number of named modes, each an explicit allowlist, and refuse anything outside it.
        The number of modes does not matter much; the fact that they are enumerated in code does.
      </p>
      <CodeBlock
        label="src/shared/schemas/mode.js"
        code={`export function isToolAllowedInMode(toolName, mode) {
  if (mode === Mode.BUILD || mode === Mode.SWE) return true;
  if (mode === Mode.PLAN || mode === Mode.REVIEW || mode === Mode.SCAN) {
    return isReadOnlyTool(toolName) || toolName === 'diffFile';
  }
  if (mode === Mode.FIX) {
    // Read and write, but no shell: the agent can fix code, not run code.
    return toolName !== 'bash' && toolName !== 'runTests';
  }
  return true;
}`}
      />
      <p>
        <code className="font-mono text-[13px]">FIX</code> is the interesting one. It grants writes
        while withholding the shell, which is what makes &ldquo;let it edit but do not let it
        execute&rdquo; a real mode rather than a promise. See part 8.
      </p>

      <H2 id="stack" text="The stack, and why each piece earns its place" />
      <CompareTable
        caption="Dependencies used by a terminal coding agent and what each replaces"
        head={["Piece", "Why it is here", "What it replaces"]}
        rows={[
          [
            "Commander",
            "Subcommands, flag parsing, generated --help from the same declarations that parse the args",
            "Hand-rolled argv branching, which is where usage bugs live",
          ],
          [
            "Chalk",
            "Colour that respects NO_COLOR and non-TTY pipes",
            "Raw escape codes sprinkled through output code",
          ],
          [
            "Ink + React",
            "A TUI that re-renders without fighting the terminal",
            "readline plus a repaint loop you will debug for a week",
          ],
          [
            "A streaming client",
            "One fetch path for OpenAI-compatible, Anthropic and Gemini wire formats",
            "Three provider SDKs and three retry behaviours",
          ],
          [
            "node:test",
            "Tests with zero dependencies, so the repo stays installable offline",
            "A test framework as a supply-chain dependency",
          ],
          [
            "Nothing: no DB, no server",
            "Sessions are JSON files you can read and delete",
            "A datastore, a migration, and an auth system to run locally",
          ],
        ]}
      />
      <Callout title="The dependency that is deliberately absent">
        <p>
          There is no server component, no database and no account. That is not minimalism for its
          own sake &mdash; it is what makes <code className="font-mono text-[13px]">git clone &amp;&amp;
          npm install &amp;&amp; sentinel</code> a complete setup. Every dependency you add to a
          locally-run tool is one more thing that can break on someone else&rsquo;s machine, and one
          more supply-chain question your team has to answer.
        </p>
      </Callout>

      <H2 id="mcp" text="And it should speak MCP in both directions" />
      <p>
        Not as a feature, as a hedge. A local agent that can expose itself over the Model Context
        Protocol can be driven by Claude Desktop, Cursor or any other MCP client; one that can
        consume MCP servers can reach tools you did not write. Both directions cost a few hundred
        lines and remove the argument for switching tools later. Part 12 is the whole argument in
        one file.
      </p>

      <H2 id="reading" text="How to read the twelve parts" />
      <p>
        Each part ends with something runnable, and several deliberately show a refusal. Type the
        commands instead of trusting the output blocks: the failure modes are the lesson, and the
        gate is much easier to believe once you have watched it deny you.
      </p>
      <ol className="list-decimal space-y-1.5 pl-5 text-muted marker:text-moss">
        <li>
          <strong className="text-paper">Parts 2&ndash;4</strong> &mdash; the shell: a command, a
          banner, and <code className="font-mono text-[13px]">doctor</code>. No model access needed.
        </li>
        <li>
          <strong className="text-paper">Parts 5&ndash;7</strong> &mdash; the agent: a streamed turn,
          live tracking of what it is doing, and async generators as the interface.
        </li>
        <li>
          <strong className="text-paper">Parts 8&ndash;10</strong> &mdash; the parts that decide
          whether you trust it: permission modes, the risk ledger, and cost you can cap.
        </li>
        <li>
          <strong className="text-paper">Parts 11&ndash;12</strong> &mdash; a quiz to find the gaps,
          and the pitch for a cautious tech lead.
        </li>
      </ol>
      <p className="text-sm text-muted">
        Part 9 mentions <code className="font-mono text-[13px]">pnpm</code> for global installs
        because that is a genuinely better workflow for a CLI you use daily. This repository itself
        uses npm, so where the two differ you will see npm &mdash; the commands are otherwise
        identical.
      </p>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "What makes a CLI coding agent different from a chat wrapper?",
            a: "Three things, and all three are failure modes rather than features. It must reach files the prompt never mentions, so it needs tools rather than text in and text out. It must stream, because a 40-second silent turn is indistinguishable from a hang. And it must be able to refuse, because the model will eventually ask to rewrite a file it should not touch. A CLI without the third property is a script that can delete your work.",
          },
          {
            q: "Do I need the Claude Agent SDK to build one of these?",
            a: "No, and this course deliberately does not require it. You need a streaming completion API and a tool-calling loop; those are about 200 lines. The Claude Agent SDK is a good default because it ships file and shell tools, permission modes and hooks you would otherwise write yourself, but it is an implementation choice, not the definition of the product. Part 5 shows the hand-rolled loop so the choice stays yours.",
          },
          {
            q: "How long does it take to go from empty directory to working agent?",
            a: "Parts 1 to 4 (argument parsing, a banner, pre-flight checks and a read-only chat loop) are a couple of hours and no model access beyond one API key. That first version already answers questions about your codebase. Everything after that is about letting it write, and about being able to prove what it did.",
          },
          {
            q: "Should I build this or just install an existing agent?",
            a: "Install one if you want the capability, build one if you want to understand the permission surface. The reason the second reason matters is that every guard rail in a finished agent is a few hundred lines of ordinary code, and you cannot audit a control you have not seen the shape of. This course is the cheapest way to get that shape into your head.",
          },
        ]}
      />

      <Cta
        title="Read it in order, run every part"
        body="Part 2 is a Commander skeleton and takes ten minutes. By part 5 you have an agent answering questions about your own codebase."
        href="/blog/terminal-cli-commander"
        cta="Start part 2"
      />

      <p className="text-sm text-muted">
        New here? The{" "}
        <Link href="/compare" className="text-moss underline-offset-4 hover:underline">
          comparison page
        </Link>{" "}
        covers where a local agent fits against an AI IDE, and{" "}
        <Link href="/docs/quickstart" className="text-moss underline-offset-4 hover:underline">
          the quickstart
        </Link>{" "}
        gets you running in two minutes.
      </p>
    </>
  ),
} satisfies Post;

import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { Cta, CompareTable, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "open-source-ai-coding-agents",
  title: "The 7 best open source AI coding agents for the terminal",
  metaTitle: "Best Open Source AI Coding Agents for Terminals",
  description:
    "Seven open source AI coding agents that run in your terminal, compared on model choice, sandboxing, cost control and data handling. Updated for 2026.",
  date: "2026-09-02",
  updated: "2026-09-24",
  readingMinutes: 9,
  tags: ["Comparison", "Open source", "CLI"],
  keyword: "open source ai coding agent",
  related: ["cursor-alternative-cli", "local-llm-coding-agent", "ai-agent-file-permissions"],
  faq: [
    {
      q: "What is an open source AI coding agent?",
      a: "An open source AI coding agent is a program, published under a licence that lets you read and modify its source, that can read and edit files in a real codebase on your own machine using an LLM. Open source matters for three concrete reasons: you can audit what the tool is allowed to do with your files, you are not locked to one vendor's pricing or model lineup, and if the project is abandoned you still own the code path it left behind.",
    },
    {
      q: "Is a terminal coding agent better than an IDE extension?",
      a: "It depends on where your attention already is. IDE extensions win when you want inline diffs and autocompletion inside the editor you live in. Terminal agents win for whole-repo work, scripted and headless runs, and any workflow you drive over SSH. Most senior engineers end up using both, which is why interoperability (MCP, plain-text session files) matters more than either side winning outright.",
    },
    {
      q: "Do open source coding agents send my code to a third party?",
      a: "The agent binary is local, but the model call is not. When you point an agent at a hosted model, your prompt, the files it read and its tool output are sent to that provider. Offline operation is only real when you run a local model such as Ollama or LM Studio. Check the provider's data-retention terms if your code cannot leave your infrastructure.",
    },
    {
      q: "What should I look for in an open source coding agent?",
      a: "Five things, in order: where the code runs, which model it can talk to, what the tool allowlist permits in each mode, whether writes are reversible, and whether you can see the token cost of every turn. A tool that cannot show you what a turn cost will quietly become the most expensive line item in your stack.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          An open source AI coding agent is a local program that lets an LLM read and edit your
          codebase on your own machine. The licence is the point: you can audit the tool
          permissions, switch model providers, and keep working if the project dies.
        </p>
        <p>
          The three questions that actually separate them are{" "}
          <strong>where the code runs</strong>, <strong>what the agent is allowed to touch</strong>,
          and <strong>whether you can see what each turn costs</strong>. Everything else is
          interface.
        </p>
      </KeyTakeaways>

      <H2 id="what-makes-a-terminal-agent" text="What actually makes a coding agent different from a chat window" />
      <p>
        A chat window sends your text to a model and renders the reply. A <em>coding agent</em> has
        a tool loop: it reads files, runs commands, inspects the results, and iterates until the
        task is done. That loop is the product, and it is where the design decisions that matter
        live.
      </p>
      <p>Four properties decide whether that loop is trustworthy in a real repository:</p>
      <ol className="list-decimal space-y-2 pl-5 text-muted marker:text-moss">
        <li>
          <strong className="text-paper">Blast radius.</strong> What is the agent allowed to do
          without asking? Everything else is a prompt, and prompts are advisory.
        </li>
        <li>
          <strong className="text-paper">Reversibility.</strong> Can you get back to the state
          before a bad turn? Undo that spans turns is not a feature you need until the first time
          an agent rewrites four files you did not ask it to touch.
        </li>
        <li>
          <strong className="text-paper">Legibility.</strong> Can you read what it did and why,
          after the fact, without re-running it?
        </li>
        <li>
          <strong className="text-paper">Cost.</strong> Tokens spent on a solved bug and tokens
          spent on a spiral are billed identically unless the tool tells you otherwise.
        </li>
      </ol>
      <p>
        We built{" "}
        <Link href="/docs" className="underline-offset-4 hover:underline">
          Sentinel
        </Link>{" "}
        around exactly those four, which is why this list is weighted the way it is. It is not a
        neutral ranking, and we would rather say so than pretend otherwise.
      </p>

      <H2 id="the-shortlist" text="The shortlist" />
      <p>
        Seven projects that are genuinely open source and genuinely useful in a terminal. Grouped
        by the job they are built for, because the categories rarely compete head to head.
      </p>
      <CompareTable
        caption="Open source AI coding agents by category"
        head={["Project", "Category", "Where code runs", "Model choice"]}
        rows={[
          [
            "Sentinel",
            "Terminal agent + harness",
            "Your machine, in-process",
            "12 providers, local models included",
          ],
          [
            "Aider",
            "Git-native pair programmer",
            "Your machine",
            "Bring your own key, many providers",
          ],
          [
            "Goose",
            "Extensible agent with toolkits",
            "Your machine",
            "Provider-based, local supported",
          ],
          [
            "OpenHands",
            "Full autonomous software agent",
            "Your machine or a container",
            "Provider-based",
          ],
          [
            "Gemini CLI",
            "Google's terminal assistant",
            "Your machine",
            "Gemini first, extensible",
          ],
          [
            "OpenCode",
            "Terminal agent, TUI-first",
            "Your machine",
            "Provider-based",
          ],
          [
            "Crush",
            "Terminal agent with LSP awareness",
            "Your machine",
            "Provider-based",
          ],
        ]}
      />
      <p className="text-sm text-muted">
        Categories and licence terms move over time, check each project&apos;s own README before
        you rely on this table for a procurement decision.
      </p>

      <H2 id="how-to-choose" text="How to choose: four questions, in order" />
      <H3 id="q1" text="1. Where does my code go?" />
      <p>
        This is the first question because it is the only one you cannot undo. Even a
        fully open source agent is just a local client to a hosted model: your prompt, the file
        contents it read, and its tool output are sent to that provider.
      </p>
      <p>
        If that is unacceptable, you are not shopping for a different agent, you are shopping for
        a different model. Run Ollama or LM Studio locally and the answer becomes &ldquo;nowhere&rdquo;.
        We wrote{" "}
        <Link href="/blog/local-llm-coding-agent" className="underline-offset-4 hover:underline">
          a guide to running a coding agent entirely offline
        </Link>
        .
      </p>

      <H3 id="q2" text="2. What can it touch without asking?" />
      <p>
        A single &ldquo;allow bash for this session&rdquo; grant covers both <code>git status</code>{" "}
        and <code>npm publish</code>. One grant for both is either uselessly strict or uselessly
        loose, and most tools pick the second because it demos better.
      </p>
      <p>Look for three specific things:</p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted marker:text-ink-700">
        <li>
          <strong className="text-paper">Per-mode allowlists</strong>, not a global toggle. A
          read-only review mode that cannot write is worth more than a &ldquo;sandbox&rdquo; you
          cannot verify.
        </li>
        <li>
          <strong className="text-paper">Risk grading by command shape</strong>.{" "}
          <code>git commit -m &quot;a&quot;</code> and <code>git commit -m &quot;b&quot;</code> are
          one shape; <code>git push --force</code> is a different one and must never be collapsed
          into a placeholder.
        </li>
        <li>
          <strong className="text-paper">Higher friction on expensive paths</strong>: migrations,
          CI workflows, lockfiles, auth, billing, infrastructure. One extra prompt on those globs
          costs a second. Missing real billing code costs the incident.
        </li>
      </ul>

      <H3 id="q3" text="3. Can I get back to where I was?" />
      <p>
        Every write should be checkpointed, and undo must work <em>across</em> turns, because the
        turn that breaks something is rarely the turn that looks like it did. An agent that only
        lets you revert the current turn is asking you to trust it in exactly the situation where
        you do not.
      </p>

      <H3 id="q4" text="4. What did that turn cost?" />
      <p>
        If a tool cannot tell you what a turn spent, you cannot budget it, and if you cannot budget
        it you will not use it on the large tasks where an agent is most valuable. Print tokens and
        USD per turn, and make the free tier the default so the safe choice is also the cheap one.
      </p>

      <H2 id="installing-sentinel" text="A five-minute path to running one locally" />
      <p>
        Sentinel needs Node 20+, one API key (or a local model), and no build step. Groq&apos;s
        free tier is the default, so the cost floor is genuinely zero.
      </p>
      <CodeBlock
        label="terminal"
        code={`git clone https://github.com/KunjShah95/SENTINEL-CLI.git
cd SENTINEL-CLI
npm install
npm link

export GROQ_API_KEY=gsk_...
sentinel`}
      />
      <p>Then check the guard rails are real before you trust them with anything:</p>
      <CodeBlock
        label="terminal"
        code={`# what is approved in this repo?
sentinel risk

# how would this grade here?
sentinel risk "npm publish"`}
      />
      <p>
        Full setup, including every provider key and the local-model path, is in the{" "}
        <Link href="/docs/installation" className="underline-offset-4 hover:underline">
          installation guide
        </Link>
        .
      </p>

      <H2 id="what-we-choose" text="What we chose, and what we left out" />
      <p>
        We left out every tool that needs a hosted account to be useful, because &ldquo;runs on my
        machine&rdquo; and &ldquo;requires a vendor round trip to do anything&rdquo; are not
        compatible claims. We also left out plugins and dashboards, which is a real limitation: if
        you want a managed platform with SSO and audit logs, Sentinel is the wrong product and we
        would rather you find that out in two minutes than in a procurement cycle.
      </p>
      <p>
        What is left is one loop you can read in one sitting, under a thousand lines in{" "}
        <code className="font-mono text-[13px] text-paper">src/agent/loop.js</code>: plus the
        unglamorous controls around it: modes, checkpoints, budgets, a risk ledger, and a handoff
        document. The{" "}
        <Link href="/blog/ai-agent-file-permissions" className="underline-offset-4 hover:underline">
          agent permission model
        </Link>{" "}
        is the deepest write-up we have.
      </p>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "What is an open source AI coding agent?",
            a: "An open source AI coding agent is a program, published under a licence that lets you read and modify its source, that can read and edit files in a real codebase on your own machine using an LLM. Open source matters for three concrete reasons: you can audit what the tool is allowed to do with your files, you are not locked to one vendor's pricing or model lineup, and if the project is abandoned you still own the code path it left behind.",
          },
          {
            q: "Is a terminal coding agent better than an IDE extension?",
            a: "It depends on where your attention already is. IDE extensions win when you want inline diffs and autocompletion inside the editor you live in. Terminal agents win for whole-repo work, scripted and headless runs, and any workflow you drive over SSH. Most senior engineers end up using both, which is why interoperability (MCP, plain-text session files) matters more than either side winning outright.",
          },
          {
            q: "Do open source coding agents send my code to a third party?",
            a: "The agent binary is local, but the model call is not. When you point an agent at a hosted model, your prompt, the files it read and its tool output are sent to that provider. Offline operation is only real when you run a local model such as Ollama or LM Studio. Check the provider's data-retention terms if your code cannot leave your infrastructure.",
          },
          {
            q: "What should I look for in an open source coding agent?",
            a: "Five things, in order: where the code runs, which model it can talk to, what the tool allowlist permits in each mode, whether writes are reversible, and whether you can see the token cost of every turn. A tool that cannot show you what a turn cost will quietly become the most expensive line item in your stack.",
          },
        ]}
      />

      <Cta
        title="See the loop before you trust it"
        body="One file, no servers, and every guard rail visible in the source. Clone it and read src/agent/loop.js in a coffee break."
      />
    </>
  ),
} satisfies Post;

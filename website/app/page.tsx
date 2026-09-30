import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CodeBlock } from "@/components/CodeBlock";
import { JsonLd } from "@/components/JsonLd";
import { DocsRow, Eyebrow, FdeRow, LoopDiagram, Principle, SectionHeading } from "@/components/Landing";
import { ModeSwitcher } from "@/components/ModeSwitcher";
import { TerminalReplay } from "@/components/TerminalReplay";
import { organization } from "@/lib/seo";
import { site } from "@/lib/site";

const PROVIDERS = [
  "OpenAI",
  "Anthropic",
  "Gemini",
  "Groq",
  "Mistral",
  "DeepSeek",
  "xAI",
  "Together",
  "Fireworks",
  "OpenRouter",
  "Ollama",
  "LM Studio",
];

const STATS = [
  { value: "$0", label: "default cost, Groq free tier" },
  { value: "19", label: "sandboxed local tools" },
  { value: "12", label: "providers, one client" },
  { value: "0", label: "servers, 0 telemetry" },
];

export default function Home() {
  return (
    <main id="main-content">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: site.name,
            url: site.url,
            inLanguage: "en",
            description: organization.description,
          },
          { "@context": "https://schema.org", "@type": "Organization", ...organization },
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: site.name,
            applicationCategory: "DeveloperApplication",
            operatingSystem: "macOS, Linux, Windows",
            softwareVersion: site.version,
            description: organization.description,
            url: site.url,
            codeRepository: site.repo,
            downloadUrl: site.repo,
            license: "https://opensource.org/licenses/MIT",
            isAccessibleForFree: true,
            author: { "@type": "Person", name: site.author },
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            featureList: [
              "12 LLM providers through one streaming client",
              "19 sandboxed local tools with per-mode allowlists",
              "Sessions stored as plain JSON on disk",
              "MCP stdio server for Claude Desktop, Cursor and any MCP client",
              "Per-turn token and USD receipts",
              "Per-project cost budgets with a deadline",
              "Blast-radius gate on migrations, CI workflows, lockfiles, auth and infra",
              "Checkpoints with undo and redo across turns",
            ],
          },
        ]}
      />
      {/* Hero */}
      <section aria-labelledby="hero-title" className="relative overflow-hidden">
        <div aria-hidden="true" className="bg-grid pointer-events-none absolute inset-0" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[48rem] -translate-x-1/2 rounded-full bg-moss/[0.07] blur-3xl"
        />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] lg:items-center lg:gap-12 lg:pb-28 lg:pt-24">
          <div className="animate-fade-up">
            <Link
              href="/docs"
              className="group inline-flex items-center gap-2 rounded-sm border border-ink-800 bg-ink-900/70 py-1 pl-2 pr-3 font-mono text-xs text-muted transition-colors hover:border-ink-700 hover:text-paper"
            >
              <span className="rounded-sm bg-moss/15 px-1.5 py-px text-moss">v{site.version}</span>
              Node 20+ · MIT · runs locally
              <ArrowRight size={12} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <h1
              id="hero-title"
              className="mt-7 text-[2.75rem] font-semibold leading-[0.98] tracking-tightest sm:text-6xl lg:text-[3.6rem] xl:text-[4rem]"
            >
              The coding agent
              <br />
              that shows <span className="text-moss">its work.</span>
            </h1>
            <p className="mt-6 max-w-[34rem] text-[17px] leading-7 text-muted">
              Sentinel is a minimalist AI coding assistant for the terminal. It streams from the
              LLM you pick, edits files through sandboxed local tools, and prints what every turn
              cost. Sessions are plain JSON on disk.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-2">
              <Link href="/docs/quickstart" className="btn-primary">
                Get started
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
              <Link href="/docs" className="btn-link">
                Read the docs
              </Link>
              <a href={site.repo} className="btn-link text-muted">
                GitHub
              </a>
            </div>
          </div>

          <div className="animate-fade-up [animation-delay:120ms] lg:-mr-6">
            <TerminalReplay />
          </div>
        </div>
      </section>

      {/* Stats */}
      <section aria-label="At a glance" className="border-y border-ink-800">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-ink-800 md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="flex flex-col-reverse bg-ink-950 px-4 py-7 sm:px-6">
              <dt className="mt-1 text-sm text-muted">{s.label}</dt>
              <dd className="font-mono text-3xl font-medium tracking-tight tabular-nums text-paper">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Principles */}
      <section aria-labelledby="principles-title" className="mx-auto max-w-6xl px-4 pb-24 pt-24 sm:px-6 lg:pb-32">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-20">
          <div>
            <SectionHeading id="principles-title" eyebrow="What it is" title="Does one thing well.">
              Most terminal assistants either do everything or are a hosted service. Sentinel is a
              fast, cheap, transparent coding chat — the whole brain is one loop in{" "}
              <code className="font-mono text-[13px] text-paper">src/agent/loop.js</code>.
            </SectionHeading>
            <div className="mt-10">
              <LoopDiagram />
            </div>
            <div className="mt-10">
              <p className="font-mono text-xs text-muted">One streaming client covers</p>
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-paper/80">
                {PROVIDERS.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </div>

          <ul className="lg:pt-24">
            <Principle title="No servers, no telemetry">
              The agent loop runs in-process. Nothing leaves your machine except LLM API calls.
            </Principle>
            <Principle title="Cost-aware by default">
              Every turn prints tokens and USD. Free models default to $0. Context auto-compacts at 40k.
            </Principle>
            <Principle title="Sandboxed tools">
              Reads, edits, grep, bash and more — scoped to the project root, path traversal rejected,
              every write checkpointed.
            </Principle>
            <Principle title="Sessions as files">
              Chats persist as plain JSON. List, switch, delete, export and compact whenever you want.
            </Principle>
            <Principle title="MCP stdio server">
              Expose health, ask and review-diff to Claude Desktop, Cursor or any MCP client.
            </Principle>
          </ul>
        </div>
      </section>

      {/* Modes */}
      <section aria-labelledby="modes-title" className="border-y border-ink-800 bg-ink-900/30">
        <div className="mx-auto max-w-6xl px-4 pb-24 pt-20 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading id="modes-title" eyebrow="Permissions" title="Six modes. Fixed allowlists.">
              Each mode maps to a tool allowlist the model cannot talk its way out of. Switch with{" "}
              <kbd className="kbd">Ctrl+M</kbd> or <code className="font-mono text-[13px] text-paper">/mode</code>.
            </SectionHeading>
            <Link href="/docs/modes" className="btn-link -mb-2 text-muted">
              Mode guide <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-12">
            <ModeSwitcher />
          </div>
        </div>
      </section>

      {/* Forward-deployed engineer toolkit */}
      <section aria-labelledby="fde-title" className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,3fr)_minmax(0,8fr)] lg:gap-14">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeading id="fde-title" eyebrow="Beyond chat" title="Built to be left running.">
              An engineer on an engagement states the goal, respects the budget, and leaves a
              runbook behind. These commands do the same, from files already on disk.
            </SectionHeading>
          </div>

          <ul>
            <FdeRow
              command='sentinel outcome "the sync is flaky"'
              title="Vague ask in, judgeable contract out"
              body="Turns a request into current state, one measurable target, the exact verification command, blast radius, rollback and unknowns — then works to it."
              output={
                <pre>
                  <span className="text-paper">CURRENT STATE</span>{"  "}retries hit 3 before the lock clears{"\n"}
                  <span className="text-paper">TARGET</span>{"         "}0 failures across 50 sync runs{"\n"}
                  <span className="text-paper">VERIFICATION</span>{"   "}npm test -- sync · exit 0{"\n"}
                  <span className="text-paper">ROLLBACK</span>{"       "}revert checkpoint #14{"\n"}
                  <span className="text-amberish">UNKNOWNS</span>{"       "}is the lock TTL configurable?
                </pre>
              }
            />
            <FdeRow
              command='sentinel watch "keep the sync green"'
              title="A presence, not a cron job"
              body="Wakes on a failing command, a moved file or a new HEAD. Steer it from another terminal; the instruction lands on the next tick. Budget-checked before every wakeup."
              output={
                <pre>
                  <span className="text-moss">$</span> <span className="text-paper">sentinel watch</span> &quot;keep the sync green&quot; \{"\n"}
                  {"    "}-t &quot;command:npm test&quot; -t git{"\n"}
                  <span className="text-ink-600">▸ tick 7 · trigger command:npm test (exit 1)</span>{"\n"}
                  <span className="text-moss">$</span> <span className="text-paper">sentinel steer</span> &quot;also check the retry path&quot;
                </pre>
              }
            />
            <FdeRow
              command="blast-radius gate"
              title="Asks once where being wrong is expensive"
              body="Migrations, workflows, lockfiles, auth, billing, infra. The first write is refused until the agent cites the file:line that justifies it and names the rollback."
              output={
                <pre>
                  <span className="text-amberish">◆ blocked</span>{"  "}<span className="text-paper">db/migrate/0042_add_index.sql</span>{"\n"}
                  {"  "}a migration is rarely undone by reverting it{"\n"}
                  {"  "}required: justifying file:line · exact rollback{"\n"}
                  <span className="text-moss">✓ opened</span>{"   "}for the rest of this turn
                </pre>
              }
            />
            <FdeRow
              command="sentinel budget --usd 25 --deadline 2h"
              title="Spend that outlives the process"
              body="A ceiling persisted per project. ask, goal and outcome all honour it, and the loop stops hard at the limit rather than letting one more call land."
              output={
                <pre>
                  <span className="text-paper">active</span>{"  "}<span className="text-moss">████</span><span className="text-ink-700">████</span>{"  "}
                  <span className="text-paper">$12.40</span> of $25.00 (50%) · 1h 59m left
                </pre>
              }
            />
            <FdeRow
              command="sentinel handoff <runId>"
              title="The runbook, not the diff"
              body="Writes HANDOFF.md from the recorded trajectory: what changed, what was verified, what was tried and rejected, claims to distrust, what is still fragile. No model, no API key."
              output={
                <pre>
                  <span className="text-ink-600"># .sentinel/HANDOFF.md</span>{"\n"}
                  <span className="text-paper">## What was verified</span>{"\n"}
                  <span className="text-paper">## Tried and rejected</span>{"\n"}
                  {"   "}incremental parser patch — broke on nested arrays
                </pre>
              }
            />
            <FdeRow
              command='sentinel risk "npm publish"'
              title="Permission by novelty"
              body="Command shapes are graded per repo. git commit and git push never share a shape, and --force is never collapsed into a placeholder."
              output={
                <pre>
                  <span className="text-moss">green </span>{"  "}git commit -m &lt;msg&gt;{"   "}approved shape{"\n"}
                  <span className="text-amberish">yellow</span>{"  "}npm run bench{"          "}new, not destructive{"\n"}
                  <span className="text-[#E58A7B]">red   </span>{"  "}git push --force{"       "}always asked
                </pre>
              }
            />
          </ul>
        </div>
      </section>

      {/* Docs */}
      <section aria-labelledby="docs-title" className="border-t border-ink-800">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
          <div>
            <SectionHeading id="docs-title" eyebrow="Documentation" title="Read it in an afternoon.">
              Every page is short and task-shaped.
            </SectionHeading>
          </div>
          <ul className="grid gap-x-10 sm:grid-cols-2">
            <DocsRow n="01" href="/docs/installation" title="Installation" body="Node 20+, npm link, keys for every provider." />
            <DocsRow n="02" href="/docs/quickstart" title="Quickstart" body="First chat, one-shot ask, local models." />
            <DocsRow n="03" href="/docs/tools" title="Tools" body="All 19 sandboxed tools, read-only and build." />
            <DocsRow n="04" href="/docs/tui" title="TUI commands" body="Slash commands, ! shell and @agent personas." />
            <DocsRow n="05" href="/docs/config" title="Configuration" body="Env → ~/.sentinel.json → project file." />
            <DocsRow n="06" href="/docs/swe" title="SWE workflow" body="Reproduce-first fixes, sentinel bench, evals." />
            <DocsRow n="07" href="/docs/harness" title="Harness" body="Skills, todos, subagents, hooks, context." />
            <DocsRow n="08" href="/docs/mcp" title="MCP server" body="Expose Sentinel to Claude Desktop and Cursor." />
          </ul>
        </div>
      </section>

      {/* Install CTA */}
      <section aria-labelledby="install-title" className="relative overflow-hidden border-t border-ink-800">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-48 right-0 h-[26rem] w-[40rem] rounded-full bg-moss/[0.06] blur-3xl"
        />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-28 pt-20 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div>
            <Eyebrow>Install</Eyebrow>
            <h2 id="install-title" className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Four commands.
              <br />
              <span className="text-muted">Then just type.</span>
            </h2>
            <p className="mt-5 max-w-[44ch] text-[15px] leading-7 text-muted">
              Export a Groq key for the free default, or point it at Ollama and skip the key
              entirely.
            </p>
            <Link href="/docs/installation" className="btn-link -ml-2 mt-4">
              Full installation guide <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <CodeBlock
            label="terminal"
            code={`git clone ${site.repo}.git\ncd SENTINEL-CLI\nnpm install\nnpm link\n\nexport GROQ_API_KEY=gsk_…\nsentinel`}
          />
        </div>
      </section>
    </main>
  );
}

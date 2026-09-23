import Link from "next/link";
import { Cpu, FileJson, Lock, Plug, ReceiptText, Terminal } from "lucide-react";
import { CodeBlock } from "@/components/CodeBlock";
import { DocsCard, Feature, TerminalWindow } from "@/components/Landing";

export default function Home() {
  return (
    <main id="main-content">
      {/* Hero — content-first, single column, terminal-led */}
      <section aria-labelledby="hero-title" className="border-b border-ink-800">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded border border-ink-800 bg-ink-900 px-2.5 py-1 font-mono text-xs text-muted">
              <span aria-hidden="true" className="text-moss">●</span>
              v3.0.0 · Node 20+ · MIT
            </p>
            <h1
              id="hero-title"
              className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              A minimalist AI coding assistant for the terminal.
            </h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-muted">
              Sentinel streams answers from your choice of LLM, reads and edits
              files through sandboxed local tools, and keeps sessions as plain
              JSON on disk. No servers. No telemetry. No bloat.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/docs/quickstart"
                className="rounded bg-moss px-4 py-2.5 text-sm font-semibold text-ink-950 hover:brightness-95"
              >
                Get started
              </Link>
              <Link
                href="/docs"
                className="rounded border border-ink-700 bg-ink-900 px-4 py-2.5 text-sm text-paper hover:bg-ink-850"
              >
                Read the docs
              </Link>
            </div>
            <dl className="mt-6 grid max-w-md grid-cols-3 gap-4 border-t border-ink-800 pt-4 text-sm">
              <div>
                <dt className="text-muted">Default cost</dt>
                <dd className="mt-1 font-mono font-semibold text-paper">$0</dd>
              </div>
              <div>
                <dt className="text-muted">Tools</dt>
                <dd className="mt-1 font-mono font-semibold text-paper">19 sandboxed</dd>
              </div>
              <div>
                <dt className="text-muted">Modes</dt>
                <dd className="mt-1 font-mono font-semibold text-paper">6 explicit</dd>
              </div>
            </dl>
          </div>
          <div>
            <TerminalWindow
              lines={[
                "$ export GROQ_API_KEY=gsk_…",
                "$ sentinel ask \"why is this test failing?\"",
                "▸ reading __tests__/configManager.test.js …",
                "▸ 3 failures: tmp dir cleanup runs before assertions.",
                "✓ in/out 1,204/486 · $0.00 · openai/gpt-oss-20b",
              ]}
            />
            <div className="mt-3">
              <CodeBlock
                label="install"
                code={"git clone https://github.com/KunjShah95/SENTINEL-CLI.git\ncd SENTINEL-CLI\nnpm install\nnpm link"}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Principles — purpose-driven list, not a uniform card grid */}
      <section aria-labelledby="principles-title" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 id="principles-title" className="text-xl font-semibold tracking-tight">
          Does one thing well
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Most terminal assistants either do everything or are a hosted
          service. Sentinel is a fast, cheap, transparent coding chat — in the
          spirit of Pi.
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Feature
            icon={Lock}
            title="No servers, no telemetry"
            body="The agent loop runs in-process. Nothing leaves your machine except LLM API calls."
          />
          <Feature
            icon={Cpu}
            title="Multi-LLM, one client"
            body="OpenAI-compatible endpoints plus native Anthropic and Gemini. Groq free tier by default."
          />
          <Feature
            icon={ReceiptText}
            title="Cost-aware by default"
            body="Every turn prints tokens and USD. Free models default to $0. Context auto-compacts at 40k."
          />
          <Feature
            icon={Terminal}
            title="Sandboxed tools"
            body="Reads, edits, grep, bash and more — scoped to the project root with checkpoints and undo."
          />
          <Feature
            icon={FileJson}
            title="Sessions as files"
            body="Chats persist as plain JSON. List, switch, delete, export, and compact whenever you want."
          />
          <Feature
            icon={Plug}
            title="MCP stdio server"
            body="Expose health, ask, and review-diff to Claude Desktop, Cursor, or any MCP client."
          />
        </ul>
      </section>

      {/* Modes — real content, real hierarchy */}
      <section aria-labelledby="modes-title" className="border-y border-ink-800 bg-ink-900/40">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 id="modes-title" className="text-xl font-semibold tracking-tight">
            Six modes, explicit control
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Every mode maps to a fixed tool allowlist — the model cannot
            escalate itself out of PLAN, and FIX gets writes without shell.
          </p>
          <div className="mt-6 overflow-x-auto rounded border border-ink-800 bg-ink-950">
            <table className="w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">
                Sentinel modes and their permissions
              </caption>
              <thead>
                <tr className="border-b border-ink-800 text-muted">
                  <th scope="col" className="px-4 py-3 font-medium">Mode</th>
                  <th scope="col" className="px-4 py-3 font-medium">File edits</th>
                  <th scope="col" className="px-4 py-3 font-medium">Shell</th>
                  <th scope="col" className="px-4 py-3 font-medium">Use for</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-ink-800">
                  <th scope="row" className="px-4 py-3 font-mono text-moss">BUILD</th>
                  <td className="px-4 py-3">Yes</td>
                  <td className="px-4 py-3">Yes</td>
                  <td className="px-4 py-3 text-muted">Actually making changes</td>
                </tr>
                <tr className="border-b border-ink-800">
                  <th scope="row" className="px-4 py-3 font-mono">PLAN</th>
                  <td className="px-4 py-3">No</td>
                  <td className="px-4 py-3">No</td>
                  <td className="px-4 py-3 text-muted">Questions, review, exploration</td>
                </tr>
                <tr className="border-b border-ink-800">
                  <th scope="row" className="px-4 py-3 font-mono">REVIEW</th>
                  <td className="px-4 py-3">No</td>
                  <td className="px-4 py-3">No</td>
                  <td className="px-4 py-3 text-muted">Diff review with focused prompt</td>
                </tr>
                <tr className="border-b border-ink-800">
                  <th scope="row" className="px-4 py-3 font-mono">SCAN</th>
                  <td className="px-4 py-3">No</td>
                  <td className="px-4 py-3">No</td>
                  <td className="px-4 py-3 text-muted">Security scanning</td>
                </tr>
                <tr className="border-b border-ink-800">
                  <th scope="row" className="px-4 py-3 font-mono">FIX</th>
                  <td className="px-4 py-3">Yes</td>
                  <td className="px-4 py-3">No</td>
                  <td className="px-4 py-3 text-muted">Safe auto-fix, no shell</td>
                </tr>
                <tr>
                  <th scope="row" className="px-4 py-3 font-mono">SWE</th>
                  <td className="px-4 py-3">Yes</td>
                  <td className="px-4 py-3">Yes</td>
                  <td className="px-4 py-3 text-muted">Reproduce-first bug fixes, 60-iteration budget</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-muted">
            Toggle with <kbd className="rounded border border-ink-700 bg-ink-900 px-1.5 py-0.5 font-mono text-xs">Ctrl+M</kbd> or{" "}
            <code className="rounded border border-ink-800 bg-ink-900 px-1.5 py-0.5 font-mono text-xs">/mode</code>.{" "}
            <Link href="/docs/modes" className="text-moss underline-offset-4 hover:underline">
              Mode guide →
            </Link>
          </p>
        </div>
      </section>

      {/* Docs index */}
      <section aria-labelledby="docs-title" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 id="docs-title" className="text-xl font-semibold tracking-tight">
          Documentation
        </h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <DocsCard href="/docs/installation" title="Installation" body="Node 20+, npm install, npm link, keys for every provider." />
          <DocsCard href="/docs/quickstart" title="Quickstart" body="First chat, one-shot ask, BUILD mode, local models." />
          <DocsCard href="/docs/tools" title="Tools" body="All 19 sandboxed tools, grouped by read-only and build." />
          <DocsCard href="/docs/tui" title="TUI commands" body="Every slash command, plus ! shell and @agent personas." />
          <DocsCard href="/docs/config" title="Configuration" body="Env → ~/.sentinel.json → project file. Provider table." />
          <DocsCard href="/docs/swe" title="SWE workflow" body="Reproduce-first fixes, sentinel bench, eval layers." />
          <DocsCard href="/docs/harness" title="Harness" body="Skills, todos, subagents, hooks, context files." />
          <DocsCard href="/docs/mcp" title="MCP server" body="Expose Sentinel to Claude Desktop and Cursor over stdio." />
        </ul>
      </section>
    </main>
  );
}

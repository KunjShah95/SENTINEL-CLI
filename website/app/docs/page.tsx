import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Overview",
  description:
    "Sentinel is an open source AI coding agent for the terminal: 12 LLM providers, 19 sandboxed tools, sessions as plain JSON, and an MCP server.",
  path: "/docs",
  keywords: ["ai coding agent", "cli coding agent", "terminal ai assistant", "open source coding agent"],
});

export default function DocsOverview() {
  return (
    <>
      <p className="font-mono text-xs uppercase tracking-wide text-moss">Docs · Start</p>
      <h1 className="text-3xl font-semibold tracking-tight">What Sentinel is</h1>
      <p className="text-muted">
        Sentinel is a coding agent that lives in your terminal. It streams
        answers from your choice of LLM, reads and edits files through a
        sandboxed local tool set, manages chat sessions as plain JSON on disk,
        and optionally exposes itself to other AI tools over MCP.
      </p>

      <h2 className="pt-4 text-xl font-semibold">What&apos;s inside</h2>
      <ul className="list-disc space-y-1 pl-5 text-muted marker:text-ink-700">
        <li><code className="font-mono text-[13px] text-paper">bin/sentinel.js</code> — entry point (TUI / ask / mcp / --version)</li>
        <li><code className="font-mono text-[13px] text-paper">src/agent/</code> — loop, providers, tools glue, cost, sessions, prompt</li>
        <li><code className="font-mono text-[13px] text-paper">src/shared/tools/</code> — read, write, edit, glob, grep, bash…</li>
        <li><code className="font-mono text-[13px] text-paper">src/shared/models/</code> — registry + live discovery from provider APIs</li>
        <li><code className="font-mono text-[13px] text-paper">src/tui/</code> — the Ink (React) terminal UI</li>
        <li><code className="font-mono text-[13px] text-paper">mcp/</code> — MCP stdio server (health, ask, review-diff)</li>
      </ul>

      <h2 className="pt-4 text-xl font-semibold">The agent loop</h2>
      <p className="text-muted">
        <code className="font-mono text-[13px] text-paper">src/agent/loop.js</code> is the
        whole brain: user input → stream from provider → execute tool calls
        in-process (sandboxed to the project directory) → feed results back →
        repeat until done or <code className="font-mono text-[13px] text-paper">MAX_ITERATIONS</code>.
        It yields typed events (<code className="font-mono text-[13px] text-paper">text</code>,{" "}
        <code className="font-mono text-[13px] text-paper">tool_call</code>,{" "}
        <code className="font-mono text-[13px] text-paper">tool_result</code>,{" "}
        <code className="font-mono text-[13px] text-paper">finish</code>,{" "}
        <code className="font-mono text-[13px] text-paper">error</code>) that both
        the TUI and CLI consume.
      </p>

      <div className="pt-2">
        <CodeBlock label="repo layout" language="text" code={"bin/sentinel.js      entry point\nsrc/cli/main.js      ask, version, help\nsrc/agent/           loop, providers, sessions\nsrc/shared/tools/    sandboxed local tools\nsrc/tui/             Ink terminal UI\nmcp/                 stdio server"} />
      </div>

      <nav aria-label="Next steps" className="flex flex-wrap gap-3 pt-4">
        <Link href="/docs/installation" className="rounded bg-moss px-4 py-2 text-sm font-semibold text-ink-950">Install Sentinel →</Link>
        <Link href="/docs/quickstart" className="rounded border border-ink-700 bg-ink-900 px-4 py-2 text-sm">Quickstart →</Link>
      </nav>
    </>
  );
}

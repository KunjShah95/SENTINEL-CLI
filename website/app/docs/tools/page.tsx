import type { Metadata } from "next";
import Link from "next/link";
import { Callout } from "@/components/CodeBlock";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Tools",
  description:
    "All 19 Sentinel tools, every one sandboxed to the project root: read, write, edit, batchEdit, grep, codeMap, bash, runTests, diffFile, undo and redo, with hard output caps.",
  path: "/docs/tools",
  keywords: ["ai agent tools", "sandboxed file tools", "agent tool allowlist"],
});

const readOnly: { name: string; body: string }[] = [
  { name: "readFile", body: "Read a file. Path must stay inside the project root." },
  { name: "listDirectory / glob", body: "List dirs and match paths without leaving the sandbox." },
  { name: "grep", body: "Ripgrep-style search with output caps before it hits context." },
  { name: "codeMap", body: "Repo symbol overview (functions/classes/exports per file) for bug localization without reading everything." },
  { name: "searchWeb", body: "Read-only lookup the agent can call in any mode." },
  { name: "diffFile", body: "Preview a unified diff of proposed changes without applying them." },
  { name: "todoRead", body: "Read the current task list. Available in every mode." },
  { name: "skill", body: "Load a skill workflow by name. Available in every mode." },
];

const build: { name: string; body: string }[] = [
  { name: "writeFile", body: "Create or overwrite a file. Creates a checkpoint for /undo." },
  { name: "editFile / batchEdit", body: "Exact-match replacements. Batch applies atomically across files." },
  { name: "applyPatch", body: "Apply a unified diff (--- / +++ / @@ hunks) with strict context matching." },
  { name: "bash", body: "Runs with a timeout and output cap. Shell passthrough via ! in TUI." },
  { name: "runTests", body: "Test twin of bash: returns structured pass/fail lists (jest, pytest, mocha, TAP) instead of raw stdout." },
  { name: "undoLastChange / redoLastUndo", body: "Step through write checkpoints across turns." },
  { name: "todoWrite", body: "Overwrite the full task list — send ALL todos every call so the plan can't drift." },
  { name: "spawnAgent", body: "Delegate a bounded subtask to a fresh subagent. Returns its summary, not a transcript. Depth limit 1." },
];

function ToolGrid({ items }: { items: { name: string; body: string }[] }) {
  return (
    <ul className="grid gap-3 pt-2 sm:grid-cols-2">
      {items.map((t) => (
        <li key={t.name} className="rounded border border-ink-800 bg-ink-900 p-4">
          <p className="font-mono text-sm text-moss">{t.name}</p>
          <p className="mt-1 text-sm leading-6 text-muted">{t.body}</p>
        </li>
      ))}
    </ul>
  );
}

export default function Tools() {
  return (
    <>
      <p className="font-mono text-xs uppercase tracking-wide text-moss">Docs · Use</p>
      <h1 className="text-3xl font-semibold tracking-tight">Tools</h1>
      <p className="text-muted">Nineteen tools, all sandboxed to the project root. Path traversal is rejected, bash has a timeout and output cap, and tool results are truncated hard (20k chars, 30k in SWE mode) before they hit context. Consecutive read-only calls run concurrently; writes run serially.</p>

      <h2 className="pt-4 text-xl font-semibold">Read-only: every mode</h2>
      <ToolGrid items={readOnly} />

      <h2 className="pt-4 text-xl font-semibold">Build: BUILD, FIX (no shell), SWE</h2>
      <ToolGrid items={build} />

      <div className="pt-2">
        <Callout title="Checkpoints">
          Every write creates a checkpoint — <code className="font-mono text-[13px]">/undo</code> and <code className="font-mono text-[13px]">/redo</code> work across turns.
        </Callout>
      </div>
      <div className="pt-2">
        <Callout title="Guards">
          Dangerous commands (<code className="font-mono text-[13px]">rm -rf /</code>, fork bombs, shutdown) and secret files (<code className="font-mono text-[13px]">.env</code>, <code className="font-mono text-[13px]">*.pem</code>) are refused before they execute — in every mode.
        </Callout>
      </div>
      <div className="pt-2">
        <Callout title="Blast-radius gate">
          The first write to a migration, CI workflow, lockfile, schema, auth, billing or infra
          path is refused once per turn, and opens only with a justifying{" "}
          <code className="font-mono text-[13px]">file:line</code> and an exact rollback.{" "}
          <Link href="/blog/ai-coding-agent-guardrails" className="text-moss underline-offset-4 hover:underline">
            Why it is designed this way →
          </Link>
        </Callout>
      </div>
    </>
  );
}

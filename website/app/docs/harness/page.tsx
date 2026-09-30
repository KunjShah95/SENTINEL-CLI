import type { Metadata } from "next";
import { CodeBlock, Callout } from "@/components/CodeBlock";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Harness",
  description:
    "The Sentinel harness: reusable skills, a persistent todo list, bounded subagents, lifecycle hooks, and context compaction that keeps long sessions inside budget.",
  path: "/docs/harness",
  keywords: ["agent harness", "ai agent skills", "subagent orchestration"],
});

const items: { name: string; body: React.ReactNode }[] = [
  {
    name: "Project context",
    body: "SENTINEL.md → CLAUDE.md → AGENTS.md → .sentinel/context.md are injected into the system prompt (3k chars each). Plain files, no database — the repo is the index.",
  },
  {
    name: "Skills",
    body: "Reusable workflows in .sentinel/skills/<name>/SKILL.md. Only names + descriptions sit in context; the full body loads when the model invokes the skill tool. Ships with reproduce-fix-verify.",
  },
  {
    name: "Todos",
    body: "todoWrite overwrites the FULL list every call (stops the plan drifting), persisted to .sentinel/todos.json so goals survive compaction. Statuses: pending, in_progress, completed.",
  },
  {
    name: "Subagents",
    body: "spawnAgent runs the same loop with fresh messages and restricted tools (depth limit 1) and returns a summary — the parent's context grows by the summary, not the transcript.",
  },
  {
    name: "Hooks",
    body: "PreToolUse blocks dangerous commands (rm -rf /, fork bombs) and secret writes (.env, *.pem) before permission checks. A stop hook forces a test run when files changed but no tests ran.",
  },
  {
    name: "Trajectories",
    body: "Every turn records JSONL to .sentinel/trajectories/<runId>.jsonl — the raw material for evals. Read failing traces to find the next behavior to gate.",
  },
];

export default function Harness() {
  return (
    <>
      <p className="font-mono text-xs uppercase tracking-wide text-moss">Docs · Agent</p>
      <h1 className="text-3xl font-semibold tracking-tight">Harness</h1>
      <p className="text-muted">
        The model is the driver, the harness is the vehicle. One agent loop
        owns everything; these mechanisms attach to it — each a small module,
        never a framework.
      </p>

      <ul className="grid gap-3 pt-2 sm:grid-cols-2">
        {items.map((t) => (
          <li key={t.name} className="rounded border border-ink-800 bg-ink-900 p-4">
            <p className="text-sm font-semibold">{t.name}</p>
            <p className="mt-1 text-sm leading-6 text-muted">{t.body}</p>
          </li>
        ))}
      </ul>

      <h2 className="pt-4 text-xl font-semibold">Loop rules</h2>
      <ul className="list-disc space-y-1 pl-5 text-muted marker:text-ink-700">
        <li>Consecutive read-only tool calls run concurrently (up to 10); writes run serially.</li>
        <li>Three edits to the same file triggers a reconsider reminder instead of another retry.</li>
        <li>Disable trajectory logging with <code className="font-mono text-[13px] text-paper">SENTINEL_NO_TRAJECTORY=1</code>.</li>
      </ul>

      <h2 className="pt-4 text-xl font-semibold">Write your own skill</h2>
      <CodeBlock
        label=".sentinel/skills/my-flow/SKILL.md"
        language="markdown"
        code={"---\nname: my-flow\ndescription: When to use this workflow, in one line.\n---\n# My flow\n\n1. Step one.\n2. Step two."}
      />

      <div className="pt-2">
        <Callout title="Full map">
          <code className="font-mono text-[13px]">docs/claude-code-adaptation.md</code> in the repo maps every
          Claude-Code mechanism to its Sentinel adaptation — including what was
          deliberately deferred (agent teams, background agents, microcompact).
        </Callout>
      </div>
    </>
  );
}

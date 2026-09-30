import type { Metadata } from "next";
import { CodeBlock, Callout } from "@/components/CodeBlock";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Quickstart",
  description:
    "Run your first Sentinel chat, ask a one-shot question from a script, switch models, and point the agent at a local Ollama model in about two minutes.",
  path: "/docs/quickstart",
  keywords: ["ai coding agent quickstart", "terminal ai assistant tutorial"],
});

export default function Quickstart() {
  return (
    <>
      <p className="font-mono text-xs uppercase tracking-wide text-moss">Docs · Start</p>
      <h1 className="text-3xl font-semibold tracking-tight">Quickstart</h1>
      <p className="text-muted">First chat in under two minutes.</p>

      <h2 className="pt-4 text-xl font-semibold">1 · Chat</h2>
      <CodeBlock label="bash" code={"sentinel"} />
      <p className="text-muted">Type a question, Sentinel streams the answer. Tool calls run in-process and stream back into context.</p>

      <h2 className="pt-4 text-xl font-semibold">2 · One-shot from scripts and CI</h2>
      <CodeBlock label="bash" code={'sentinel ask "why is this test failing?"\nsentinel ask -b "fix the typo in src/index.js"    # BUILD mode: may edit files'} />

      <h2 className="pt-4 text-xl font-semibold">3 · Local models</h2>
      <CodeBlock label="bash" code={"ollama serve\nsentinel    # auto-discovers installed models"} />

      <Callout title="Cost control">
        Default model is a free-tier model (<code className="font-mono text-[13px]">openai/gpt-oss-20b</code> via Groq). Every run prints <code className="font-mono text-[13px]">in/out tokens · $ · model</code>; <code className="font-mono text-[13px]">-q</code> silences it.
      </Callout>
    </>
  );
}

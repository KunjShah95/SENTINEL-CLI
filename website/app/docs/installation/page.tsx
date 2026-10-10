import type { Metadata } from "next";
import { CodeBlock, Callout } from "@/components/CodeBlock";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Installation",
  description:
    "Install Sentinel in four commands on Node 20+, add a provider key (or run Ollama and skip it entirely), and verify the install with your first one-shot ask.",
  path: "/docs/installation",
  keywords: ["install ai coding agent", "cli agent setup", "sentinel install"],
});

export default function Installation() {
  return (
    <>
      <p className="font-mono text-xs uppercase tracking-wide text-moss">Docs · Start</p>
      <h1 className="text-3xl font-semibold tracking-tight">Installation</h1>
      <p className="text-muted">Requires Node 20+. Three commands, no build step, plain ESM run via <code className="font-mono text-[13px] text-paper">tsx</code>.</p>

      <h2 className="pt-4 text-xl font-semibold">Install</h2>
      <CodeBlock label="bash" code={"git clone https://github.com/KunjShah95/SENTINEL-CLI.git\ncd SENTINEL-CLI\nnpm install\nnpm link        # optional: puts `sentinel` on your PATH"} />

      <h2 className="pt-4 text-xl font-semibold">Give it a key</h2>
      <p className="text-muted">Groq&apos;s free tier is the zero-cost default:</p>
      <CodeBlock label="bash" code={"export GROQ_API_KEY=gsk_..."} />
      <Callout title="Local models need no key">
        Run <code className="font-mono text-[13px]">ollama serve</code> (default <code className="font-mono text-[13px]">http://localhost:11434</code>) and Sentinel auto-discovers installed models. LM Studio works the same way.
      </Callout>

      <h2 className="pt-4 text-xl font-semibold">Verify</h2>
      <CodeBlock label="bash" code={"sentinel --version\nsentinel ask \"say ok\""} />
    </>
  );
}

import type { Metadata } from "next";
import { CodeBlock } from "@/components/CodeBlock";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Development",
  description:
    "Work on Sentinel: install, lint, typecheck, run the node:test and jest suites, and the release check that runs all three before a publish.",
  path: "/docs/development",
  keywords: ["contribute open source", "node cli project setup"],
});

export default function Development() {
  return (
    <>
      <p className="font-mono text-xs uppercase tracking-wide text-moss">Docs · Extend</p>
      <h1 className="text-3xl font-semibold tracking-tight">Development</h1>
      <p className="text-muted">Lint, typecheck, and tests before every release.</p>
      <CodeBlock label="bash" code={"npm run lint         # eslint\nnpm run typecheck    # tsc over the TUI\nnpm test             # node:test suites + jest suite\nnpm run release:check  # all three"} />
      <h2 className="pt-4 text-xl font-semibold">Before a bug report</h2>
      <p className="text-muted">
        Most &ldquo;it doesn&rsquo;t work&rdquo; reports are environment problems, and{" "}
        <code className="font-mono text-[13px] text-paper">sentinel doctor</code> settles them in
        about a second. It checks the Node floor, that the working directory is the project you think
        it is, that <code className="font-mono text-[13px] text-paper">.sentinel/</code> is writable,
        which provider keys are present, and that the shell classifier still flags{" "}
        <code className="font-mono text-[13px] text-paper">rm -rf /</code> as destructive. It prints
        only variable <em>names</em>, never key values.
      </p>
      <CodeBlock
        label="bash"
        code={`sentinel doctor              # offline pre-flight, exit 1 if anything fails
sentinel doctor --network   # also probe Ollama / LM Studio
sentinel doctor --json      # machine-readable, for CI`}
      />
      <h2 className="pt-4 text-xl font-semibold">Website</h2>
      <CodeBlock label="bash" code={"cd website\nnpm install\nnpm run dev      # http://localhost:3000\nnpm run build    # production verification"} />
    </>
  );
}

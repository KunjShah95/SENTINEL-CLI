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
      <h2 className="pt-4 text-xl font-semibold">Website</h2>
      <CodeBlock label="bash" code={"cd website\nnpm install\nnpm run dev      # http://localhost:3000\nnpm run build    # production verification"} />
    </>
  );
}

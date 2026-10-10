import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock, Callout } from "@/components/CodeBlock";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "SWE workflow",
  description:
    "The reproduce-first bug fixing loop: reproduce, localize, fix, verify, regress. With the offline capability bench and reproducible task evals for your own agent.",
  path: "/docs/swe",
  keywords: ["swe workflow", "reproduce first bug fixing", "evaluate coding agent"],
});

export default function Swe() {
  return (
    <>
      <p className="font-mono text-xs uppercase tracking-wide text-moss">Docs · Agent</p>
      <h1 className="text-3xl font-semibold tracking-tight">SWE workflow</h1>
      <p className="text-muted">
        Disciplined bug fixing: reproduce the failure before touching source,
        localize to the smallest scope, make the smallest edit, verify, then
        check for regressions. Available as <code className="font-mono text-[13px] text-paper">sentinel swe</code> with
        a 60-iteration budget and verbatim tool history.
      </p>

      <h2 className="pt-4 text-xl font-semibold">The five phases</h2>
      <ol className="list-decimal space-y-2 pl-5 text-muted marker:text-moss">
        <li><strong className="text-paper">Reproduce</strong>: run the failing tests with <code className="font-mono text-[13px] text-paper">runTests</code> first. If you cannot reproduce, stop, do not guess.</li>
        <li><strong className="text-paper">Localize</strong>: <code className="font-mono text-[13px] text-paper">codeMap</code> for orientation, then grep + read. Read the test file first; it is the specification.</li>
        <li><strong className="text-paper">Fix</strong>: smallest edit that addresses the root cause. Never rewrite files, never edit tests to make them pass.</li>
        <li><strong className="text-paper">Verify</strong>: re-run the repro and failing tests. All must pass.</li>
        <li><strong className="text-paper">Regress</strong>: run the related passing suite. On regression, <code className="font-mono text-[13px] text-paper">undoLastChange</code> and retry.</li>
      </ol>

      <h2 className="pt-4 text-xl font-semibold">Offline capability gates</h2>
      <CodeBlock label="bash" code={"sentinel bench\n# 15/15 checks: roundtrips, mode refusals, sandbox, atomic edits,\n# structured test parsing, patch application, undo, FAIL_TO_PASS gates"} />

      <h2 className="pt-4 text-xl font-semibold">Task evals</h2>
      <CodeBlock label="bash" code={"npm run eval:check              # validate fixtures + graders (CI-gated)\nnode evals/run.mjs --agent --model gpt-6-luna   # real agent runs + report"} />
      <p className="text-muted">
        Every task ships a pristine fixture (must fail), a reference solution
        (must pass), and a Node grader, so results are reproducible on Linux,
        macOS, and Windows.
      </p>

      <div className="pt-2">
        <Callout title="Honest benchmarking">
          Bench gates measure tool capability, not model reasoning. Real
          SWE-bench % scores require the official Docker harness plus a model
          key, report them with harness version, model id, and retries, never
          as self-awarded numbers.
        </Callout>
      </div>

      <p className="pt-2 text-sm text-muted">
        <Link href="/docs/harness" className="text-moss underline-offset-4 hover:underline">Harness guide →</Link>
      </p>
    </>
  );
}

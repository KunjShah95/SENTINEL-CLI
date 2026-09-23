import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";

export const metadata: Metadata = { title: "Modes" };

const rows: { mode: string; edits: string; shell: string; use: string; highlight?: boolean }[] = [
  { mode: "BUILD", edits: "Yes", shell: "Yes", use: "Actually making changes", highlight: true },
  { mode: "PLAN", edits: "No", shell: "No", use: "Questions, review, exploration" },
  { mode: "REVIEW", edits: "No", shell: "No", use: "Diff review with focused prompt" },
  { mode: "SCAN", edits: "No", shell: "No", use: "Security scanning" },
  { mode: "FIX", edits: "Yes", shell: "No", use: "Safe auto-fix without shell access" },
  { mode: "SWE", edits: "Yes", shell: "Yes", use: "Reproduce-first fixes, 60-iteration budget" },
];

export default function Modes() {
  return (
    <>
      <p className="font-mono text-xs uppercase tracking-wide text-moss">Docs · Use</p>
      <h1 className="text-3xl font-semibold tracking-tight">Modes</h1>
      <p className="text-muted">PLAN, REVIEW, and SCAN refuse non-read-only tools. FIX allows writes but no shell. BUILD and SWE allow everything. Toggle with <kbd className="rounded border border-ink-700 bg-ink-900 px-1.5 py-0.5 font-mono text-xs">Ctrl+M</kbd> or <code className="font-mono text-[13px] text-paper">/mode</code>.</p>

      <div className="overflow-x-auto rounded border border-ink-800">
        <table className="w-full min-w-[560px] text-left text-sm">
          <caption className="sr-only">Mode permissions</caption>
          <thead>
            <tr className="border-b border-ink-800 text-muted">
              <th scope="col" className="px-4 py-3 font-medium">Mode</th>
              <th scope="col" className="px-4 py-3 font-medium">File edits</th>
              <th scope="col" className="px-4 py-3 font-medium">Shell</th>
              <th scope="col" className="px-4 py-3 font-medium">Use for</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.mode} className={i < rows.length - 1 ? "border-b border-ink-800" : undefined}>
                <th scope="row" className={`px-4 py-3 font-mono${r.highlight ? " text-moss" : ""}`}>{r.mode}</th>
                <td className="px-4 py-3">{r.edits}</td>
                <td className="px-4 py-3">{r.shell}</td>
                <td className="px-4 py-3 text-muted">{r.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="pt-4 text-xl font-semibold">One-shot mode flag</h2>
      <CodeBlock label="bash" code={'sentinel ask "review this diff for risks"\nsentinel ask -b "rename the helper and update imports"\nsentinel swe "checkout crashes on empty cart + FAIL_TO_PASS tests"'} />
      <p className="text-sm text-muted">
        <Link href="/docs/swe" className="text-moss underline-offset-4 hover:underline">SWE workflow guide →</Link>
      </p>
    </>
  );
}

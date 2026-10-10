"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type Line = { kind: "cmd" | "tool" | "gate" | "ok" | "text"; text: string; meta?: string };

const SCRIPT: Line[] = [
  { kind: "cmd", text: 'sentinel ask -b "raise the retry limit for failed charges"' },
  { kind: "tool", text: 'grep "MAX_RETRIES" src/', meta: "2 matches" },
  { kind: "tool", text: "readFile src/billing/retry.js:40-72", meta: "33 lines" },
  { kind: "gate", text: "blast-radius  src/billing/retry.js", meta: "cite file:line + rollback" },
  { kind: "text", text: "retry.js:58 caps retries at 3; rollback = revert checkpoint #14" },
  { kind: "tool", text: "editFile src/billing/retry.js", meta: "+3 −1 · checkpoint #14" },
  { kind: "tool", text: "bash npm test -- billing", meta: "18 passed" },
  { kind: "ok", text: "done · in/out 3,412/611 · $0.00 · openai/gpt-oss-20b" },
];

const STEP_MS = 720;
const HOLD_MS = 4200;

const LABEL =
  "Terminal replay: Sentinel runs in BUILD mode, greps and reads the billing retry module, the blast-radius gate asks for a file:line citation and rollback on a billing path, then it edits the file with a checkpoint, runs the tests (18 passed) and prints a $0.00 cost receipt.";

export function TerminalReplay() {
  const [shown, setShown] = useState(SCRIPT.length);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let n = 1;
    setShown(n);
    let timer: number;
    const tick = () => {
      n = n >= SCRIPT.length ? 1 : n + 1;
      setShown(n);
      timer = window.setTimeout(tick, n === SCRIPT.length ? HOLD_MS : STEP_MS);
    };
    timer = window.setTimeout(tick, STEP_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const running = shown < SCRIPT.length;

  return (
    <div role="img" aria-label={LABEL} className="surface overflow-hidden rounded-lg">
      <div className="flex items-center gap-3 border-b border-ink-800 px-4 py-2.5" aria-hidden="true">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ink-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink-700" />
        </span>
        <span className="font-mono text-xs text-muted">~/ledgerline</span>
        <span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-muted">
          <span className={cn("h-1.5 w-1.5 rounded-full", running ? "bg-amberish" : "bg-moss")} />
          {running ? "BUILD · working" : "BUILD · idle"}
        </span>
      </div>

      <div className="min-h-[19rem] space-y-2 p-4 font-mono text-[12.5px] leading-6 sm:p-5 sm:text-[13px]" aria-hidden="true">
        {SCRIPT.slice(0, shown).map((l, i) => (
          <TermLine key={i} line={l} />
        ))}
        {running && <span className="inline-block h-4 w-2 translate-y-0.5 animate-blink bg-moss/80" />}
      </div>
    </div>
  );
}

function TermLine({ line }: { line: Line }) {
  const base = "flex animate-fade-up items-baseline gap-3";
  switch (line.kind) {
    case "cmd":
      return (
        <p className={cn(base, "text-paper")}>
          <span className="text-moss">$</span>
          <span className="min-w-0 break-words">{line.text}</span>
        </p>
      );
    case "gate":
      return (
        <p className={cn(base, "-mx-2 rounded border border-amberish/25 bg-amberish/[0.06] px-2 py-1")}>
          <span className="text-amberish">◆</span>
          <span className="min-w-0 flex-1 truncate text-paper">{line.text}</span>
          <span className="hidden shrink-0 text-amberish/80 sm:inline">{line.meta}</span>
        </p>
      );
    case "ok":
      return (
        <p className={cn(base, "border-t border-ink-800 pt-3 text-muted")}>
          <span className="text-moss">✓</span>
          <span className="min-w-0 break-words">{line.text}</span>
        </p>
      );
    case "text":
      return (
        <p className={cn(base, "pl-6 text-muted")}>
          <span className="min-w-0 break-words italic">{line.text}</span>
        </p>
      );
    default:
      return (
        <p className={cn(base, "text-muted")}>
          <span className="text-ink-500">▸</span>
          <span className="min-w-0 flex-1 truncate text-paper/85">{line.text}</span>
          <span className="shrink-0 text-muted">{line.meta}</span>
        </p>
      );
  }
}

"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Mode = {
  id: string;
  edits: boolean;
  shell: boolean;
  use: string;
  detail: string;
};

const MODES: Mode[] = [
  {
    id: "BUILD",
    edits: true,
    shell: true,
    use: "Actually making changes",
    detail: "Every tool is available. Each write still creates a checkpoint, so /undo and /redo work across turns.",
  },
  {
    id: "PLAN",
    edits: false,
    shell: false,
    use: "Questions, review, exploration",
    detail: "Read-only tools only. The model cannot escalate itself out of PLAN — the allowlist is fixed, not prompted.",
  },
  {
    id: "REVIEW",
    edits: false,
    shell: false,
    use: "Diff review with a focused prompt",
    detail: "Same read-only allowlist as PLAN, with a system prompt tuned for reviewing diffs.",
  },
  {
    id: "SCAN",
    edits: false,
    shell: false,
    use: "Security scanning",
    detail: "Read-only, with a prompt that looks for vulnerabilities instead of answering questions.",
  },
  {
    id: "FIX",
    edits: true,
    shell: false,
    use: "Safe auto-fix, no shell",
    detail: "Writes are allowed, the shell is not. Useful when you want edits without anything running.",
  },
  {
    id: "SWE",
    edits: true,
    shell: true,
    use: "Reproduce-first bug fixes",
    detail: "Full access with a 60-iteration budget. The agent reproduces the bug before it touches a fix.",
  },
];

export function ModeSwitcher() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const mode = MODES[active];

  function onKeyDown(e: React.KeyboardEvent) {
    const last = MODES.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = active === last ? 0 : active + 1;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = active === 0 ? last : active - 1;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
      <div role="tablist" aria-label="Sentinel modes" aria-orientation="vertical" onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {MODES.map((m, i) => {
          const selected = i === active;
          return (
            <button
              key={m.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              role="tab"
              id={`mode-tab-${m.id}`}
              aria-selected={selected}
              aria-controls="mode-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              className={cn(
                "group relative flex shrink-0 items-center gap-4 rounded-md px-4 py-3 text-left transition-colors duration-200",
                selected ? "bg-ink-900 text-paper" : "text-muted hover:bg-ink-900/60 hover:text-paper"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-y-2 left-0 hidden w-0.5 rounded-full transition-colors lg:block",
                  selected ? "bg-moss" : "bg-transparent"
                )}
              />
              <span className="font-mono text-sm font-medium tracking-wide">{m.id}</span>
              <span className="hidden text-sm lg:inline">{m.use}</span>
            </button>
          );
        })}
      </div>

      <div
        id="mode-panel"
        role="tabpanel"
        aria-labelledby={`mode-tab-${mode.id}`}
        tabIndex={0}
        className="surface flex flex-col rounded-lg p-6 sm:p-8"
      >
        <div key={mode.id} className="animate-fade-up">
          <p className="font-mono text-xs text-muted">/mode {mode.id.toLowerCase()}</p>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{mode.use}</h3>
          <p className="mt-3 max-w-[52ch] text-[15px] leading-7 text-muted">{mode.detail}</p>
          <dl className="mt-8 grid grid-cols-2 gap-3 font-mono text-sm">
            <Perm label="File edits" on={mode.edits} />
            <Perm label="Shell" on={mode.shell} />
          </dl>
        </div>
      </div>
    </div>
  );
}

function Perm({ label, on }: { label: string; on: boolean }) {
  return (
    <div className={cn("rounded-md border px-4 py-3", on ? "border-moss/30 bg-moss/[0.06]" : "border-ink-800 bg-ink-950/60")}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn("mt-1 font-medium", on ? "text-moss" : "text-muted")}>{on ? "allowed" : "refused"}</dd>
    </div>
  );
}

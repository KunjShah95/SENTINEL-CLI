"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CodeBlock({
  code,
  language = "bash",
  label,
}: {
  code: string;
  language?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <figure className="surface overflow-hidden rounded-md">
      <div className="flex items-center justify-between border-b border-ink-800 py-1.5 pl-4 pr-1.5">
        <figcaption className="font-mono text-xs text-muted">
          {label ?? language}
        </figcaption>
        <button
          type="button"
          onClick={onCopy}
          aria-live="polite"
          aria-label={copied ? "Copied to clipboard" : "Copy code to clipboard"}
          className={`inline-flex items-center gap-1.5 rounded px-2 py-1 font-mono text-xs transition-colors duration-200 hover:bg-ink-850 active:scale-[0.97] ${copied ? "text-moss" : "text-muted hover:text-paper"}`}
        >
          {copied ? (
            <>
              <Check size={13} aria-hidden="true" /> Copied
            </>
          ) : (
            <>
              <Copy size={13} aria-hidden="true" /> Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[13px] leading-6 text-paper">
        <code>{code}</code>
      </pre>
    </figure>
  );
}

export function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-ink-800 bg-ink-900 px-1.5 py-0.5 font-mono text-[0.85em] text-paper">
      {children}
    </code>
  );
}

export function Callout({
  title,
  children,
  tone = "info",
}: {
  title: string;
  children: React.ReactNode;
  tone?: "info" | "warn";
}) {
  const accent = tone === "warn" ? "border-amberish/70" : "border-moss/60";
  return (
    <div role="note" aria-label={title} className={`rounded-md border-l-2 ${accent} bg-ink-900 px-4 py-3.5`}>
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-1 text-sm leading-6 text-muted">{children}</div>
    </div>
  );
}

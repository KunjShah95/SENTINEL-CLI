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
    <figure className="overflow-hidden rounded border border-ink-800 bg-ink-900">
      <div className="flex items-center justify-between border-b border-ink-800 px-3 py-2">
        <figcaption className="font-mono text-xs text-muted">
          {label ?? language}
        </figcaption>
        <button
          type="button"
          onClick={onCopy}
          aria-live="polite"
          aria-label={copied ? "Copied to clipboard" : "Copy code to clipboard"}
          className="inline-flex items-center gap-1.5 rounded border border-ink-700 bg-ink-850 px-2 py-1 font-mono text-xs text-paper hover:border-moss/60"
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
      <pre className="overflow-x-auto p-3 font-mono text-[13px] leading-6 text-paper">
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
  const accent = tone === "warn" ? "border-amberish/50" : "border-moss/40";
  return (
    <div role="note" aria-label={title} className={`rounded border ${accent} bg-ink-900 p-4`}>
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-1 text-sm leading-6 text-muted">{children}</div>
    </div>
  );
}

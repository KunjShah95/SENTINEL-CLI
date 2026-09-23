import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function TerminalWindow({ lines }: { lines: string[] }) {
  return (
    <div
      role="img"
      aria-label="Terminal session showing Sentinel streaming an answer and running a sandboxed tool"
      className="overflow-hidden rounded border border-ink-800 bg-ink-900"
    >
      <div className="flex items-center gap-1.5 border-b border-ink-800 px-3 py-2" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-ink-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-ink-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-moss/70" />
        <span className="ml-2 font-mono text-xs text-muted">sentinel — zsh</span>
      </div>
      <div className="space-y-1.5 p-4 font-mono text-[13px] leading-6">
        {lines.map((l, i) => (
          <p key={i} className={l.startsWith("$") ? "text-paper" : "text-muted"}>
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}

export function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <li className="rounded border border-ink-800 bg-ink-900 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded border border-ink-700 bg-ink-850 text-moss">
          <Icon size={15} aria-hidden="true" />
        </span>
        {title}
      </p>
      <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
    </li>
  );
}

export function DocsCard({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <li className="rounded border border-ink-800 bg-ink-900 p-4 hover:border-ink-700">
      <Link href={href} className="block focus:outline-none">
        <span className="text-sm font-semibold text-paper">{title}</span>
        <span className="mt-1 block text-sm leading-6 text-muted">{body}</span>
        <span className="mt-2 block text-sm text-moss">Read guide →</span>
      </Link>
    </li>
  );
}

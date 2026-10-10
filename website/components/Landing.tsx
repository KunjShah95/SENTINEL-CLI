import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 font-mono text-xs text-moss">
      <span aria-hidden="true" className="h-px w-6 bg-moss/60" />
      {children}
    </p>
  );
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="max-w-2xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={id} className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-[2.6rem] sm:leading-[1.08]">
        {title}
      </h2>
      {children && <p className="mt-4 max-w-[60ch] text-[15px] leading-7 text-muted">{children}</p>}
    </div>
  );
}

const LOOP = [
  { n: "01", label: "input", note: "your turn" },
  { n: "02", label: "stream", note: "any provider" },
  { n: "03", label: "tool call", note: "sandboxed, in-process" },
  { n: "04", label: "result", note: "fed back" },
];

/** The agent loop from src/agent/loop.js, drawn as a strip. */
export function LoopDiagram() {
  return (
    <figure>
      <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-ink-800 sm:grid-cols-4">
        {LOOP.map((s, i) => (
          <li key={s.n} className="relative bg-ink-900 p-4">
            <span className="font-mono text-[11px] text-ink-500">{s.n}</span>
            <p className="mt-3 font-mono text-sm text-paper">{s.label}</p>
            <p className="mt-1 text-xs text-muted">{s.note}</p>
            {i < LOOP.length - 1 && (
              <span aria-hidden="true" className="absolute right-3 top-4 hidden font-mono text-xs text-ink-500 sm:block">
                →
              </span>
            )}
          </li>
        ))}
      </ol>
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[11px] text-muted">
        <span>↺ repeat until done or MAX_ITERATIONS · yields</span>
        {["text", "tool_call", "tool_result", "finish", "error"].map((e) => (
          <span key={e} className="rounded-sm border border-ink-800 px-1.5 py-0.5 text-paper/80">
            {e}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

export function Principle({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="grid gap-1 border-t border-ink-800 py-5 first:border-t-0 first:pt-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6">
      <p className="text-sm font-medium text-paper">{title}</p>
      <p className="text-sm leading-6 text-muted">{children}</p>
    </li>
  );
}

export function FdeRow({
  command,
  title,
  body,
  output,
}: {
  command: string;
  title: string;
  body: string;
  output: React.ReactNode;
}) {
  return (
    <li className="group grid gap-5 border-t border-ink-800 py-10 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] md:gap-8">
      <div>
        <p className="break-words font-mono text-[13px] text-moss">{command}</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 max-w-[46ch] text-sm leading-6 text-muted">{body}</p>
      </div>
      <div className="surface overflow-x-auto self-start rounded-md p-4 font-mono text-[11.5px] leading-6 text-muted transition-transform duration-300 group-hover:-translate-y-0.5">
        {output}
      </div>
    </li>
  );
}

export function DocsRow({ href, n, title, body }: { href: string; n: string; title: string; body: string }) {
  return (
    <li>
      <Link
        href={href}
        className="group grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-baseline gap-3 border-t border-ink-800 py-4 transition-colors duration-200 hover:border-moss/40"
      >
        <span className="font-mono text-xs text-ink-500 transition-colors group-hover:text-moss">{n}</span>
        <span>
          <span className="block text-[15px] font-medium text-paper">{title}</span>
          <span className="mt-0.5 block text-sm leading-6 text-muted">{body}</span>
        </span>
        <ArrowUpRight
          size={16}
          aria-hidden="true"
          className="text-ink-500 transition duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-moss"
        />
      </Link>
    </li>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { JsonLd, faqLd } from "./JsonLd";

type HeadingProps = { id: string; text: string };

/** H2 with a stable anchor id. Svelte-free, JS-free, crawlable deep links. */
export function H2({ id, text }: HeadingProps) {
  return (
    <h2 id={id} className="group scroll-mt-24 pt-6 text-2xl font-semibold tracking-tight">
      <a href={`#${id}`} className="inline-flex items-baseline gap-2 no-underline">
        {text}
        <span
          aria-hidden="true"
          className="font-mono text-sm text-ink-500 opacity-0 transition-opacity group-hover:opacity-100"
        >
          #
        </span>
      </a>
    </h2>
  );
}

export function H3({ id, text }: HeadingProps) {
  return (
    <h3 id={id} className="scroll-mt-24 pt-3 text-lg font-semibold tracking-tight">
      <a href={`#${id}`} className="no-underline">
        {text}
      </a>
    </h3>
  );
}

/**
 * Answer-first summary. This is the block answer engines quote, so it answers the
 * page's query in the first two sentences and stays true to the body below it.
 */
export function KeyTakeaways({ children }: { children: ReactNode }) {
  return (
    <aside className="rounded-md border-l-2 border-moss/70 bg-ink-900 px-4 py-3.5">
      <p className="font-mono text-xs uppercase tracking-wide text-moss">In short</p>
      <div className="mt-1.5 space-y-2 text-[15px] leading-7 text-muted [&>p]:max-w-none">
        {children}
      </div>
    </aside>
  );
}

export function CompareTable({
  head,
  rows,
  caption,
}: {
  head: string[];
  rows: (string | ReactNode)[][];
  caption: string;
}) {
  return (
    <figure className="surface overflow-x-auto rounded-md">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-ink-800">
            {head.map((h, i) => (
              <th
                key={h}
                scope="col"
                className={`px-4 py-3 font-mono text-xs uppercase tracking-wide text-muted ${
                  i === 0 ? "" : ""
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-ink-800/60 last:border-0">
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className={`px-4 py-3 align-top ${
                    ci === 0 ? "font-medium text-paper" : "text-muted"
                  }`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Rendered visibly and emitted as FAQPage structured data from the same source. */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  if (!items.length) return null;
  return (
    <>
      <JsonLd data={faqLd(items)} />
      <div className="divide-y divide-ink-800 rounded-md border border-ink-800">
        {items.map((f) => (
          <details key={f.q} className="group px-4 py-3.5">
            <summary className="cursor-pointer text-[15px] font-semibold marker:content-none">
              {f.q}
            </summary>
            <p className="mt-2 max-w-[68ch] text-[15px] leading-7 text-muted">{f.a}</p>
          </details>
        ))}
      </div>
    </>
  );
}

export function Cta({
  title,
  body,
  href = "/docs/installation",
  cta = "Install Sentinel",
}: {
  title: string;
  body: string;
  href?: string;
  cta?: string;
}) {
  return (
    <aside className="surface rounded-md p-5">
      <p className="font-mono text-xs uppercase tracking-wide text-moss">Try it</p>
      <p className="mt-2 text-lg font-semibold tracking-tight">{title}</p>
      <p className="mt-1.5 max-w-[52ch] text-[15px] leading-7 text-muted">{body}</p>
      <Link href={href} className="btn-primary mt-4">
        {cta}
      </Link>
    </aside>
  );
}

/** Pulls headings out of a post's element tree so the TOC cannot drift from the body. */
export function collectHeadings(
  node: ReactNode
): { id: string; text: string; level: 2 | 3 }[] {
  const out: { id: string; text: string; level: 2 | 3 }[] = [];
  const walk = (n: ReactNode) => {
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (!n || typeof n !== "object" || !("type" in n)) return;
    const el = n as React.ReactElement<{ id?: string; text?: string; children?: ReactNode }>;
    const t = el.type as unknown;
    if ((t === H2 || t === H3) && el.props?.text) {
      out.push({ id: el.props.id ?? "", text: el.props.text, level: t === H2 ? 2 : 3 });
    }
    if (el.props?.children) walk(el.props.children);
  };
  walk(node);
  return out;
}

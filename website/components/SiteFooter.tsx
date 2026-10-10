import Link from "next/link";
import { posts } from "@/lib/blog";
import { site } from "@/lib/site";

export function SiteFooter() {
  const recent = posts.slice(0, 4);
  return (
    <footer className="border-t border-ink-800 bg-ink-950">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-12 sm:px-6 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded bg-moss text-xs font-bold text-ink-950">◈</span> Sentinel
          </p>
          <p className="mt-2 max-w-xs text-sm leading-6 text-muted">
            A local coding agent for the terminal. No servers, no
            telemetry, no bloat.
          </p>
        </div>
        <nav aria-label="Docs">
          <p className="font-mono text-xs text-muted">
            Docs
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link className="text-paper/85 transition-colors hover:text-moss" href="/docs/installation">Installation</Link></li>
            <li><Link className="text-paper/85 transition-colors hover:text-moss" href="/docs/quickstart">Quickstart</Link></li>
            <li><Link className="text-paper/85 transition-colors hover:text-moss" href="/docs/modes">Modes</Link></li>
            <li><Link className="text-paper/85 transition-colors hover:text-moss" href="/docs/mcp">MCP server</Link></li>
          </ul>
        </nav>
        <nav aria-label="Blog">
          <p className="font-mono text-xs text-muted">
            Blog
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {recent.map((p) => (
              <li key={p.slug}>
                <Link className="text-paper/85 transition-colors hover:text-moss" href={`/blog/${p.slug}`}>
                  {p.title.length > 34 ? `${p.title.slice(0, 33)}…` : p.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Project">
          <p className="font-mono text-xs text-muted">
            Project
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><a className="text-paper/85 transition-colors hover:text-moss" href={site.repo}>GitHub</a></li>
            <li><Link className="text-paper/85 transition-colors hover:text-moss" href="/compare">Compare</Link></li>
            <li><Link className="text-paper/85 transition-colors hover:text-moss" href="/docs/development">Contributing</Link></li>
            <li><Link className="text-paper/85 transition-colors hover:text-moss" href="/docs/config">Configuration</Link></li>
            <li>
              <a className="text-paper/85 transition-colors hover:text-moss" href="/feed.xml">
                RSS
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-ink-800">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted sm:px-6">
          MIT © Kunj Shah. Sentinel runs locally, nothing leaves your machine
          except LLM API calls.
        </p>
      </div>
    </footer>
  );
}

import Link from "next/link";
import { site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-ink-800 bg-ink-950">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <span aria-hidden="true" className="text-moss">◈</span> Sentinel
          </p>
          <p className="mt-2 max-w-xs text-sm leading-6 text-muted">
            Minimalist AI coding assistant for the terminal. No servers, no
            telemetry, no bloat.
          </p>
        </div>
        <nav aria-label="Docs">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Docs
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link className="hover:text-moss" href="/docs/installation">Installation</Link></li>
            <li><Link className="hover:text-moss" href="/docs/quickstart">Quickstart</Link></li>
            <li><Link className="hover:text-moss" href="/docs/modes">Modes</Link></li>
            <li><Link className="hover:text-moss" href="/docs/mcp">MCP server</Link></li>
          </ul>
        </nav>
        <nav aria-label="Project">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Project
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><a className="hover:text-moss" href={site.repo}>GitHub</a></li>
            <li><Link className="hover:text-moss" href="/docs/development">Contributing</Link></li>
            <li><Link className="hover:text-moss" href="/docs/config">Configuration</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-ink-800">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted sm:px-6">
          MIT © Kunj Shah. Sentinel runs locally — nothing leaves your machine
          except LLM API calls.
        </p>
      </div>
    </footer>
  );
}

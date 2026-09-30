"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { mainNav, site } from "@/lib/site";

const links = mainNav;

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Move focus only on user-driven transitions, never on mount.
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (open) closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open ]);

  return (
    <header className="sticky top-0 z-40 border-b border-ink-800/80 bg-ink-950/75 backdrop-blur-xl backdrop-saturate-150">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6"
      >
        <Link href="/" className="group flex items-center gap-2.5" aria-label="Sentinel home">
          <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-md bg-moss text-sm font-bold text-ink-950 shadow-[inset_0_1px_0_rgb(255_255_255/0.35)] transition-transform duration-300 group-hover:rotate-45">
            ◈
          </span>
          <span className="text-[15px] font-semibold tracking-tight">
            Sentinel
            <span className="ml-2 font-mono text-[11px] font-normal text-muted">
              v{site.version}
            </span>
          </span>
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {links.map((l) => {
            // Longest matching prefix wins, so /docs/mcp lights "MCP", not "Docs".
            const match = links
              .filter((x) => pathname === x.href || pathname.startsWith(x.href + "/"))
              .sort((x, y) => y.href.length - x.href.length)[0];
            const active = match?.href === l.href;
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative rounded px-3 py-2 text-sm transition-colors duration-200",
                    active
                      ? "text-paper after:absolute after:inset-x-3 after:-bottom-[15px] after:h-px after:bg-moss"
                      : "text-muted hover:text-paper"
                  )}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
          <li className="ml-2">
            <a
              href={site.repo}
              className="inline-flex items-center gap-2 rounded-md border border-ink-700 bg-ink-900 px-3 py-1.5 text-sm text-paper transition-colors duration-200 hover:border-ink-600 hover:bg-ink-850 active:scale-[0.98]"
            >
              GitHub
            </a>
          </li>
        </ul>

        <button
          type="button"
          className="rounded p-2 text-paper hover:bg-ink-900 md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </nav>

      {open && (
        <div id="mobile-nav" className="border-t border-ink-800 bg-ink-950 md:hidden">
          <div className="flex items-center justify-between px-4 py-2">
            <p className="font-mono text-xs text-muted">menu</p>
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              className="rounded px-2 py-1 text-sm text-muted hover:bg-ink-900 hover:text-paper"
            >
              Close
            </button>
          </div>
          <ul className="space-y-1 px-4 pb-4">
            <li>
              <Link
                href="/"
                className="block rounded px-3 py-2 text-sm hover:bg-ink-900"
                onClick={() => setOpen(false)}
              >
                Home
              </Link>
            </li>
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="block rounded px-3 py-2 text-sm hover:bg-ink-900"
                  onClick={() => setOpen(false)}
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <a
                href={site.repo}
                className="block rounded border border-ink-800 bg-ink-900 px-3 py-2 text-sm"
              >
                GitHub repository
              </a>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}

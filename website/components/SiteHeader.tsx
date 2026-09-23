"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

const links = [
  { href: "/docs", label: "Docs" },
  { href: "/docs/installation", label: "Install" },
  { href: "/docs/mcp", label: "MCP" },
];

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
    <header className="sticky top-0 z-40 border-b border-ink-800 bg-ink-950/95 backdrop-blur">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6"
      >
        <Link href="/" className="flex items-center gap-2" aria-label="Sentinel home">
          <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded border border-ink-700 bg-ink-900 text-sm font-bold text-moss">
            ◈
          </span>
          <span className="text-sm font-semibold tracking-tight">
            Sentinel
            <span className="ml-2 rounded border border-ink-800 bg-ink-900 px-1.5 py-0.5 font-mono text-[11px] font-normal text-muted">
              v{site.version}
            </span>
          </span>
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const active =
              pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded px-3 py-2 text-sm",
                    active
                      ? "bg-ink-900 text-paper"
                      : "text-muted hover:bg-ink-900 hover:text-paper"
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
              className="rounded border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-paper hover:border-ink-700 hover:bg-ink-850"
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
            <p className="text-xs uppercase tracking-wide text-muted">Menu</p>
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

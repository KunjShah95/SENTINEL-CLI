"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getDocPager } from "@/lib/site";

export function DocsPager() {
  const pathname = usePathname();
  const { prev, next } = getDocPager(pathname);
  if (!prev && !next) return null;
  return (
    <nav
      aria-label="Documentation pages"
      className="grid gap-3 border-t border-ink-800 pt-6 sm:grid-cols-2"
    >
      <div>
        {prev && (
          <Link
            href={prev.href}
            className="group flex items-center gap-2 rounded-md border border-ink-800 p-4 transition-colors duration-200 hover:border-ink-700 hover:bg-ink-900"
          >
            <ArrowLeft size={16} aria-hidden="true" className="shrink-0 text-muted transition-transform duration-200 group-hover:text-moss" />
            <span>
              <span className="block text-xs text-muted">Previous</span>
              <span className="block text-sm font-medium group-hover:text-moss">
                {prev.label}
              </span>
            </span>
          </Link>
        )}
      </div>
      <div>
        {next && (
          <Link
            href={next.href}
            className="group flex items-center justify-end gap-2 rounded border border-ink-800 bg-ink-900 p-4 text-right hover:border-ink-700"
          >
            <span>
              <span className="block text-xs text-muted">Next</span>
              <span className="block text-sm font-medium group-hover:text-moss">
                {next.label}
              </span>
            </span>
            <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-muted transition-transform duration-200 group-hover:text-moss" />
          </Link>
        )}
      </div>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { docNav } from "@/lib/site";
import { cn } from "@/lib/cn";

export function DocsSidebar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Documentation sections" className="space-y-6">
      {docNav.map((group) => (
        <div key={group.title}>
          <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted">
            {group.title}
          </p>
          <ul className="mt-2 space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded px-3 py-2 text-sm leading-5",
                      active
                        ? "bg-ink-900 text-paper outline outline-1 outline-ink-700"
                        : "text-muted hover:bg-ink-900 hover:text-paper"
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

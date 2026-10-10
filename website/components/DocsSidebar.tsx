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
          <p className="px-3 font-mono text-xs text-ink-500">
            {group.title}
          </p>
          <ul className="mt-2 space-y-px border-l border-ink-800">
            {group.items.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "-ml-px block border-l px-3 py-1.5 text-sm leading-5 transition-colors duration-150",
                      active
                        ? "border-moss font-medium text-paper"
                        : "border-transparent text-muted hover:border-ink-600 hover:text-paper"
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

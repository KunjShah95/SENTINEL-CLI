"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { JsonLd, breadcrumbLd } from "@/components/JsonLd";
import { allDocHrefs, docNav, site } from "@/lib/site";

type Crumb = { name: string; path: string };

/**
 * Visible breadcrumb trail plus BreadcrumbList structured data from one source.
 *
 * The leaf label arrives as a prop rather than being resolved from the post
 * registry: importing the registry here would pull every article body into the
 * client bundle to look up one string. Doc labels are resolved from docNav,
 * which is a few hundred bytes.
 */
export function Breadcrumbs({ current }: { current?: { name: string } }) {
  const pathname = usePathname();
  const trail = buildTrail(pathname, current);
  if (trail.length < 2) return null;

  return (
    <>
      <JsonLd data={breadcrumbLd(trail, site.url)} />
      <nav aria-label="Breadcrumb" className="font-mono text-xs text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          {trail.map((item, i) => {
            const last = i === trail.length - 1;
            return (
              <li key={item.path} className="flex items-center gap-2">
                {last ? (
                  <span aria-current="page" className="max-w-[52ch] truncate text-paper/80">
                    {item.name}
                  </span>
                ) : (
                  <>
                    <Link href={item.path} className="hover:text-moss">
                      {item.name}
                    </Link>
                    <span aria-hidden="true">/</span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}

function buildTrail(pathname: string, current?: { name: string }): Crumb[] {
  const home: Crumb = { name: "Home", path: "/" };

  if (pathname === "/blog") return [home, { name: "Blog", path: "/blog" }];
  if (pathname === "/compare") return [home, { name: "Compare", path: "/compare" }];

  if (pathname === "/series") {
    return [home, { name: "Courses", path: "/series" }];
  }

  if (pathname.startsWith("/series/")) {
    // Course titles are resolved from the page's own props rather than imported
    // here: the breadcrumb is a client component, and importing the series
    // registry would pull every post body into the client bundle for one string.
    return [home, { name: "Courses", path: "/series" }, { name: current?.name ?? "Course", path: pathname }];
  }

  if (pathname.startsWith("/blog/")) {
    return [
      home,
      { name: "Blog", path: "/blog" },
      { name: current?.name ?? "Post", path: pathname },
    ];
  }

  if (allDocHrefs.includes(pathname)) {
    const section = docNav
      .flatMap((g) => g.items)
      .find((i) => i.href === pathname);
    return [home, { name: "Docs", path: "/docs" }, { name: section?.label ?? "Docs", path: pathname }];
  }

  return [home];
}

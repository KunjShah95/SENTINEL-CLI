import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { posts, formatDate } from "@/lib/blog";
import { pageMeta } from "@/lib/seo";
import { series, seriesOf } from "@/lib/series";
import { site } from "@/lib/site";

export const metadata: Metadata = pageMeta({
  title: "Blog",
  description:
    "Field notes on building a local AI coding agent: permission models, cost control, MCP, local models, and how to evaluate an agent without fooling yourself.",
  path: "/blog",
  keywords: [
    "ai coding agent blog",
    "cli coding agent articles",
    "agent security",
    "llm cost control",
  ],
});

export default function BlogIndex() {
  return (
    <main className="relative">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Blog",
          name: `${site.name} Blog`,
          description:
            "Field notes on building a local, open source AI coding agent for the terminal.",
          url: `${site.url}/blog`,
          inLanguage: "en",
          blogPost: posts.map((p) => ({
            "@type": "BlogPosting",
            headline: p.title,
            description: p.description,
            datePublished: p.date,
            dateModified: p.updated ?? p.date,
            url: `${site.url}/blog/${p.slug}`,
            author: { "@type": "Person", name: site.author },
          })),
        }}
      />

      <div className="mx-auto max-w-3xl px-4 pb-24 pt-16 sm:px-6 lg:pt-20">
        <Breadcrumbs />
        <p className="mt-8 font-mono text-xs uppercase tracking-wide text-moss">Writing</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Blog</h1>
        <p className="mt-5 text-[17px] leading-7 text-muted">
          How we build Sentinel, and what we have learned about permissions, cost, models and
          measurement while building it. Written for engineers who intend to run an agent on code
          they care about.
        </p>

        {series.length > 0 && (
          <section aria-labelledby="courses-heading" className="mt-14">
            <h2 id="courses-heading" className="font-mono text-xs uppercase tracking-wide text-moss">
              Courses
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {series.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/series/${s.slug}`}
                    className="block h-full rounded-md border border-ink-800 bg-ink-900 p-4 transition-colors duration-200 hover:border-ink-700"
                  >
                    <span className="font-mono text-[11px] uppercase tracking-wide text-moss">
                      {s.kicker}
                    </span>
                    <span className="mt-1.5 block text-sm font-semibold leading-5">{s.title}</span>
                    <span className="mt-1.5 block text-sm leading-6 text-muted">
                      {s.description}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <h2 className="mt-16 font-mono text-xs uppercase tracking-wide text-moss">
          All writing
        </h2>
        <ul className="mt-4 space-y-px overflow-hidden rounded-lg border border-ink-800 bg-ink-800">
          {posts.map((p) => {
            const course = seriesOf(p);
            return (
            <li key={p.slug} className="bg-ink-950">
              <Link
                href={`/blog/${p.slug}`}
                className="group block px-5 py-6 transition-colors duration-200 hover:bg-ink-900"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted">
                  {course && (
                    <>
                      <span className="text-moss">
                        Part {p.series?.order}
                      </span>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  <time dateTime={p.date}>{formatDate(p.date)}</time>
                  <span aria-hidden="true">·</span>
                  <span>{p.readingMinutes} min read</span>
                  {p.updated && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>updated {formatDate(p.updated)}</span>
                    </>
                  )}
                </div>
                <h2 className="mt-2 text-xl font-semibold tracking-tight group-hover:text-moss">
                  {p.title}
                </h2>
                <p className="mt-2 max-w-[62ch] text-[15px] leading-7 text-muted">
                  {p.description}
                </p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {p.tags.map((t) => (
                    <li
                      key={t}
                      className="rounded border border-ink-800 bg-ink-900 px-2 py-0.5 font-mono text-[11px] text-muted"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              </Link>
            </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}

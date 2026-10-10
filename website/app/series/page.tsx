import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { episodes, series, seriesCounts } from "@/lib/series";
import { pageMeta } from "@/lib/seo";
import { site } from "@/lib/site";

export const metadata: Metadata = pageMeta({
  title: "Courses",
  description:
    "Two build-it-along courses: a Cursor-style terminal coding agent with the Claude Agent SDK, and PR Owl, an autonomous AI code reviewer installed as a GitHub App.",
  path: "/series",
  keywords: [
    "build ai coding agent cli",
    "claude agent sdk tutorial",
    "ai code reviewer github app",
    "cursor style cli course",
  ],
});

export default function SeriesIndex() {
  const counts = seriesCounts();

  return (
    <main className="relative">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${site.name} Courses`,
          description:
            "Build-it-along courses on building an AI coding agent for the terminal and an autonomous AI code reviewer for GitHub.",
          url: `${site.url}/series`,
          inLanguage: "en",
          itemListElement: series.flatMap((s, si) => [
            {
              "@type": "ListItem",
              position: si + 1,
              name: s.title,
              url: `${site.url}/series/${s.slug}`,
            },
            ...episodes(s.slug).map((p, pi) => ({
              "@type": "ListItem",
              position: si * 100 + pi + 1,
              name: p.title,
              url: `${site.url}/blog/${p.slug}`,
            })),
          ]),
        }}
      />

      <div className="mx-auto max-w-3xl px-4 pb-24 pt-16 sm:px-6 lg:pt-20">
        <Breadcrumbs />
        <p className="mt-8 font-mono text-xs uppercase tracking-wide text-moss">Courses</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Courses</h1>
        <p className="mt-5 text-[17px] leading-7 text-muted">
          Each course is an ordered build. Every episode assumes the previous ones, so read them in
          order, the code in part nine is the code from part four with the mode gate added, not a
          fresh example. Written for engineers who intend to run what they build.
        </p>

        <ul className="mt-14 space-y-4">
          {series.map((s) => {
            const eps = episodes(s.slug);
            const first = eps[0];
            return (
              <li
                key={s.slug}
                className="rounded-md border border-ink-800 bg-ink-900 p-5 transition-colors duration-200 hover:border-ink-700"
              >
                <p className="font-mono text-xs uppercase tracking-wide text-moss">{s.kicker}</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                  <Link href={`/series/${s.slug}`} className="no-underline hover:text-moss">
                    {s.title}
                  </Link>
                </h2>
                <p className="mt-2 max-w-[62ch] text-[15px] leading-7 text-muted">
                  {s.description}
                </p>
                <p className="mt-4 text-sm text-muted">
                  <span className="text-paper">{counts[s.slug]}</span> of 12 parts published
                  {first && (
                    <>
                      {" · "}
                      <Link href={`/blog/${first.slug}`} className="text-moss underline-offset-4 hover:underline">
                        start with part {first.series?.order}
                      </Link>
                    </>
                  )}
                </p>
              </li>
            );
          })}
        </ul>

        <p className="mt-10 max-w-[68ch] text-sm leading-6 text-muted">
          These are written against Sentinel, the open source agent in this repository, so every
          command and file path in them is one you can run and check.{" "}
          <Link href="/docs" className="text-moss underline-offset-4 hover:underline">
            The docs
          </Link>{" "}
          are the reference; the courses are the argument for why each piece is shaped the way it is.
        </p>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { KeyTakeaways } from "@/components/Post";
import { formatDate } from "@/lib/blog";
import { abs, pageMeta } from "@/lib/seo";
import { episodes, getSeries, seriesSlugs } from "@/lib/series";
import { site } from "@/lib/site";

export function generateStaticParams() {
  return seriesSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const s = getSeries(slug);
  if (!s) return {};
  return pageMeta({
    title: s.metaTitle,
    description: s.description,
    path: `/series/${s.slug}`,
    keywords: [s.keyword],
  });
}

export default async function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = getSeries(slug);
  if (!s) notFound();

  const eps = episodes(s.slug);
  const total = 12;
  const nextUp = eps.find((p) => p.series?.order === eps.length + 1) ?? null;
  const isComplete = eps.length >= total;

  return (
    <main className="relative">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Course",
          name: s.title,
          description: s.description,
          url: abs(`/series/${s.slug}`),
          inLanguage: "en",
          provider: {
            "@type": "Organization",
            name: site.name,
            url: site.url,
            sameAs: site.repo,
          },
          hasCourseInstance: {
            "@type": "CourseInstance",
            courseMode: "online",
            courseWorkload: `PT${eps.reduce((n, p) => n + p.readingMinutes, 0)}M`,
          },
          syllabusSections: eps.map((p) => ({
            "@type": "Syllabus",
            name: `Part ${p.series?.order}`,
            description: p.title,
            url: abs(`/blog/${p.slug}`),
            timeRequired: `PT${p.readingMinutes}M`,
          })),
        }}
      />

      <div className="mx-auto max-w-3xl px-4 pb-24 pt-14 sm:px-6 lg:pt-16">
        <Breadcrumbs current={{ name: s.title }} />

        <p className="mt-8 font-mono text-xs uppercase tracking-wide text-moss">{s.kicker}</p>
        <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-[2.75rem]">
          {s.title}
        </h1>
        <p className="mt-5 text-[17px] leading-8 text-muted">{s.description}</p>

        <div className="mt-10">
          <KeyTakeaways>
            <p>{s.outcome}</p>
            <p>
              <strong className="text-paper">
                {eps.length} of {total} parts published.
              </strong>{" "}
              {isComplete
                ? "The course is complete — start at part 1."
                : "Read in order; each part builds on the last."}
            </p>
          </KeyTakeaways>
        </div>

        <nav aria-label="Curriculum" className="mt-12">
          <p className="font-mono text-xs uppercase tracking-wide text-moss">Curriculum</p>
          <ol className="mt-4 space-y-px overflow-hidden rounded-lg border border-ink-800 bg-ink-800">
            {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
              const post = eps.find((p) => p.series?.order === n);
              return (
                <li key={n} className="bg-ink-950">
                  {post ? (
                    <Link
                      href={`/blog/${post.slug}`}
                      className="group flex gap-4 px-5 py-4 transition-colors duration-200 hover:bg-ink-900"
                    >
                      <span className="mt-0.5 shrink-0 font-mono text-xs text-ink-600 group-hover:text-moss">
                        {String(n).padStart(2, "0")}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-medium leading-6 group-hover:text-moss">
                          {post.title}
                        </span>
                        <span className="mt-1 block font-mono text-[11px] text-muted">
                          {post.readingMinutes} min · {formatDate(post.date)}
                        </span>
                      </span>
                    </Link>
                  ) : (
                    <div className="flex gap-4 px-5 py-4" aria-disabled="true">
                      <span className="mt-0.5 shrink-0 font-mono text-xs text-ink-700">
                        {String(n).padStart(2, "0")}
                      </span>
                      <span className="font-mono text-[13px] text-ink-700">
                        unpublished
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="mt-12 space-y-5 text-[15px] leading-7">
          <h2 className="text-2xl font-semibold tracking-tight">How to read this course</h2>
          <p className="text-muted">
            Each part ends with something runnable. Type the commands rather than copying the
            output blocks: the failure modes are the lesson, and several parts deliberately show
            what a refusal looks like. Where a part touches the agent&rsquo;s permission model, run
            it in the read-only mode first and only then grant writes.
          </p>
          <p className="text-muted">
            The finished tool is{" "}
            <a href={site.repo} className="text-moss underline-offset-4 hover:underline">
              Sentinel
            </a>
            , which is MIT licensed and runs on your machine with no account. Parts are written
            against it, so if a command in a part does not behave as described, that is a bug worth
            reporting rather than a version difference.
          </p>
        </div>

        {eps[0] && (
          <section className="mt-16">
            <Link href={`/blog/${eps[0].slug}`} className="btn-primary">
              {isComplete ? "Start at part 1" : "Continue the course"}
            </Link>
            {nextUp && (
              <p className="mt-3 text-sm text-muted">
                Next unpublished: {nextUp.title}
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

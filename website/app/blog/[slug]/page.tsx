import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { EpisodePager } from "@/components/EpisodePager";
import { JsonLd } from "@/components/JsonLd";
import { collectHeadings } from "@/components/Post";
import { formatDate, getPost, getRelated, postSlugs } from "@/lib/blog";
import { abs, pageMeta } from "@/lib/seo";
import { episodeNeighbours, getSeries } from "@/lib/series";
import { site } from "@/lib/site";

export function generateStaticParams() {
  return postSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return pageMeta({
    title: post.metaTitle,
    description: post.description,
    path: `/blog/${post.slug}`,
    type: "article",
    publishedTime: post.date,
    modifiedTime: post.updated ?? post.date,
    keywords: [post.keyword, ...post.tags.map((t) => t.toLowerCase())],
  });
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const body = post.body();
  const headings = collectHeadings(body);
  // A post may name itself in `related` when it is the hub for a cluster; never
  // render a "Read next" link back to the page you are already on.
  const related = getRelated(post.related).filter((r) => r.slug !== post.slug);
  const url = abs(`/blog/${post.slug}`);

  // Course membership is optional. When a post declares a series, the page gains a
  // "Part n of m" eyebrow and a prev/next pager that walks the curriculum order.
  const course = post.series ? getSeries(post.series.slug) : undefined;
  const neighbours =
    post.series && course ? episodeNeighbours(post.series.slug, post.series.order) : null;
  const total = neighbours?.total ?? 12;

  return (
    <main className="relative">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description: post.description,
          datePublished: post.date,
          dateModified: post.updated ?? post.date,
          mainEntityOfPage: { "@type": "WebPage", "@id": url },
          url,
          inLanguage: "en",
          timeRequired: `PT${post.readingMinutes}M`,
          keywords: [post.keyword, ...post.tags].join(", "),
          // Course episodes declare their position so Google can show the series
          // breadcrumb. Omitted on standalone posts rather than emitted empty.
          ...(post.series && getSeries(post.series.slug)
            ? {
                isPartOf: {
                  "@type": "Course",
                  name: getSeries(post.series.slug)!.title,
                  url: abs(`/series/${post.series.slug}`),
                },
              }
            : {}),
          author: {
            "@type": "Person",
            name: site.author,
            url: site.repo,
          },
          publisher: {
            "@type": "Organization",
            name: site.name,
            url: site.url,
            logo: { "@type": "ImageObject", url: abs("/icon.png") },
          },
          image: `${abs("/api/og")}?t=${encodeURIComponent(post.title)}&s=${encodeURIComponent(
            post.description.slice(0, 96)
          )}&p=/blog/${post.slug}`,
          isAccessibleForFree: true,
        }}
      />

      <article className="mx-auto max-w-3xl px-4 pb-24 pt-14 sm:px-6 lg:pt-16">
        <Breadcrumbs current={{ name: post.title }} />

        <header className="mt-6">
          {course && neighbours && (
            <p className="font-mono text-xs uppercase tracking-wide text-moss">
              Part {post.series?.order} of {total} ·{" "}
              <Link href={`/series/${course.slug}`} className="no-underline hover:text-paper">
                {course.title}
              </Link>
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted">
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            <span aria-hidden="true">·</span>
            <span>{post.readingMinutes} min read</span>
            {post.updated && (
              <>
                <span aria-hidden="true">·</span>
                <span>updated {formatDate(post.updated)}</span>
              </>
            )}
          </div>
          <h1 className="mt-2 text-4xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-[3rem]">
            {post.title}
          </h1>
          <p className="mt-5 text-[17px] leading-8 text-muted">{post.description}</p>
          <ul className="mt-5 flex flex-wrap gap-2">
            {post.tags.map((t) => (
              <li
                key={t}
                className="rounded border border-ink-800 bg-ink-900 px-2 py-0.5 font-mono text-[11px] text-muted"
              >
                {t}
              </li>
            ))}
          </ul>
        </header>

        {headings.length > 2 && (
          <nav
            aria-label="On this page"
            className="mt-12 rounded-md border border-ink-800 bg-ink-900/60 p-5"
          >
            <p className="font-mono text-xs uppercase tracking-wide text-moss">On this page</p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {headings
                .filter((h) => h.level === 2)
                .map((h) => (
                  <li key={h.id}>
                    <a href={`#${h.id}`} className="text-muted hover:text-paper">
                      {h.text}
                    </a>
                  </li>
                ))}
            </ul>
          </nav>
        )}

        <div className="prose-docs mt-12 max-w-3xl space-y-5 text-[15px] leading-7">{body}</div>

        {course && neighbours && (
          <EpisodePager
            seriesTitle={course.title}
            seriesSlug={course.slug}
            part={post.series!.order}
            total={total}
            prev={neighbours.prev}
            next={neighbours.next}
          />
        )}

        <section aria-labelledby="author-heading" className="mt-20 rounded-md border border-ink-800 bg-ink-900 p-5">
          <h2 id="author-heading" className="text-sm font-semibold">
            Written by {site.author}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Sentinel is an open source AI coding agent for the terminal, MIT licensed, no servers,
            no telemetry.{" "}
            <a href={site.repo} className="text-moss underline-offset-4 hover:underline">
              Read the source
            </a>{" "}
            or{" "}
            <Link href="/docs/installation" className="text-moss underline-offset-4 hover:underline">
              install it
            </Link>
            .
          </p>
        </section>

        {related.length > 0 && (
          <section aria-labelledby="related-heading" className="mt-16">
            <h2 id="related-heading" className="font-mono text-xs uppercase tracking-wide text-moss">
              Read next
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-3">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/blog/${r.slug}`}
                    className="group block h-full rounded-md border border-ink-800 bg-ink-900 p-4 transition-colors duration-200 hover:border-ink-700"
                  >
                    <span className="font-mono text-[11px] text-muted">
                      {formatDate(r.date)} · {r.readingMinutes} min
                    </span>
                    <span className="mt-2 block text-sm font-semibold leading-5 group-hover:text-moss">
                      {r.title}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </main>
  );
}

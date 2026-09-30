import { formatDate, posts } from "@/lib/blog";
import { abs } from "@/lib/seo";
import { site } from "@/lib/site";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * RSS 2.0. Reader-facing rather than crawler-facing: it is the cheapest way to
 * let a technical audience subscribe without an account, and the <link> in the
 * root layout points at it.
 */
export function GET() {
  const items = posts
    .map((p) => {
      const url = abs(`/blog/${p.slug}`);
      return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date(`${p.date}T09:00:00Z`).toUTCString()}</pubDate>
      <category>${escapeXml(p.tags.join(","))}</category>
      <description>${escapeXml(p.description)}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(`${site.name} Blog`)}</title>
    <link>${abs("/blog")}</link>
    <description>${escapeXml(
      "Field notes on building a local, open source AI coding agent for the terminal."
    )}</description>
    <language>en</language>
    <lastBuildDate>${new Date(`${latest()}T09:00:00Z`).toUTCString()}</lastBuildDate>
    <atom:link href="${abs("/feed.xml")}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

function latest(): string {
  return posts
    .map((p) => p.updated ?? p.date)
    .sort()
    .at(-1) as string;
}

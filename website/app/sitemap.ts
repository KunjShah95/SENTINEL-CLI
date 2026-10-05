import type { MetadataRoute } from "next";
import { allDocHrefs } from "@/lib/site";
import { latestDate, posts } from "@/lib/blog";
import { episodes, series } from "@/lib/series";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastPost = latestDate();

  return [
    {
      // Matches the canonical exactly, trailing slash and all, so the two
      // signals can never disagree.
      url: site.url,
      lastModified: new Date(lastPost),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${site.url}/blog`,
      lastModified: new Date(lastPost),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${site.url}/compare`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // The course index is how a reader finds the whole curriculum; individual
    // episodes stay in the list below like any other post.
    {
      url: `${site.url}/series`,
      lastModified: new Date(lastPost),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...series.map((s) => ({
      url: `${site.url}/series/${s.slug}`,
      lastModified: new Date(
        episodes(s.slug).reduce((d, p) => (p.date > d ? p.date : d), "1970-01-01"),
      ),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...posts.map((p) => ({
      url: `${site.url}/blog/${p.slug}`,
      lastModified: new Date(p.updated ?? p.date),
      changeFrequency: "yearly" as const,
      priority: 0.7,
    })),
    // Docs lastModified is deliberately omitted rather than set to the build
    // time. `new Date()` here would tell crawlers every page changed on every
    // deploy, which trains them to ignore the field.
    ...allDocHrefs.map((href) => ({
      url: `${site.url}${href}`,
      changeFrequency: "monthly" as const,
      priority: href === "/docs" ? 0.9 : 0.6,
    })),
  ];
}

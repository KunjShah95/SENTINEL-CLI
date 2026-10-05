import type { Post } from "./site";
import { posts } from "./blog";

/**
 * A series groups posts into an ordered course.
 *
 * The blog stays flat and chronological; a series layers a second, author-controlled
 * reading order on top of it. `order` is the position inside the series, so episodes
 * can be published out of order or back-dated without breaking the curriculum. Nothing
 * here derives from `date` — a course is a dependency graph, not a timeline.
 */
export type Series = {
  /** URL segment under /series. Never change one without a 301. */
  slug: string;
  /** H1 on the series page and the label in the blog index. */
  title: string;
  /** <title> tag. Kept <= 60 chars. */
  metaTitle: string;
  /** Meta description. 140-158 chars — the whole SERP budget. */
  description: string;
  /** Small label above the H1, same role as "Writing" on the blog index. */
  kicker: string;
  /** One sentence on what a reader can build by the last episode. */
  outcome: string;
  /** Primary keyword this series ranks for as a whole. */
  keyword: string;
};

export const series: Series[] = [
  {
    slug: "cursor-cli-course",
    title: "Build a Cursor-style AI coding agent in your terminal",
    metaTitle: "Build a Cursor-Style AI Coding Agent CLI",
    description:
      "A twelve-part build of a terminal coding agent with the Claude Agent SDK — Commander, Chalk, a doctor pre-flight, streamed agent turns, permission modes and a global pnpm install.",
    kicker: "Course · 12 parts",
    outcome:
      "By the end you have a globally installed CLI that streams an agent turn, gates writes by mode, and prints what the turn cost.",
    keyword: "cursor style cli coding agent",
  },
  {
    slug: "pr-owl-course",
    title: "PR Owl: an autonomous AI code reviewer for GitHub",
    metaTitle: "PR Owl: Autonomous AI Code Reviewer",
    description:
      "A twelve-part build of a GitHub App that reviews pull requests autonomously — webhooks, a queued review job, Pinecone retrieval and an agent that posts inline comments.",
    kicker: "Course · 12 parts",
    outcome:
      "By the end you have an installed GitHub App that receives a pull request, reviews the diff with repo context, and posts inline comments.",
    keyword: "ai code reviewer github app",
  },
];

export const seriesSlugs: string[] = series.map((s) => s.slug);

export function getSeries(slug: string): Series | undefined {
  return series.find((s) => s.slug === slug);
}

/** Episodes of a series in curriculum order. */
export function episodes(slug: string): Post[] {
  return posts
    .filter((p) => p.series?.slug === slug)
    .sort((a, b) => (a.series?.order ?? 0) - (b.series?.order ?? 0));
}

/** Where an episode sits, for the "Part n of m" line and the prev/next pager. */
export function episodeNeighbours(slug: string, order: number) {
  const list = episodes(slug);
  const i = list.findIndex((p) => p.series?.order === order);
  return {
    prev: i > 0 ? list[i - 1] : null,
    next: i >= 0 && i < list.length - 1 ? list[i + 1] : null,
    index: i,
    total: list.length,
  };
}

/** The series a post belongs to, if any. Drives the blog-index badge. */
export function seriesOf(post: Post): Series | undefined {
  return post.series ? getSeries(post.series.slug) : undefined;
}

/** Published episodes per series, for the index. */
export function seriesCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of series) counts[s.slug] = posts.filter((p) => p.series?.slug === s.slug).length;
  return counts;
}

export const site = {
  name: "Sentinel",
  tagline: "A minimalist AI coding assistant for the terminal.",
  version: "3.4.0",
  /** Canonical origin. One place, so sitemap/robots/canonical/OG never drift. */
  url: "https://sentinel-cli.dev",
  repo: "https://github.com/KunjShah95/SENTINEL-CLI",
  author: "Kunj Shah",
  license: "MIT",
  installCmd: "git clone https://github.com/KunjShah95/SENTINEL-CLI.git",
} as const;

export type DocSection = {
  href: string;
  label: string;
  description: string;
};

export const docNav: { title: string; items: DocSection[] }[] = [
  {
    title: "Start",
    items: [
      { href: "/docs", label: "Overview", description: "What Sentinel is" },
      {
        href: "/docs/installation",
        label: "Installation",
        description: "Requirements and setup",
      },
      {
        href: "/docs/quickstart",
        label: "Quickstart",
        description: "First chat in 2 minutes",
      },
    ],
  },
  {
    title: "Use",
    items: [
      { href: "/docs/modes", label: "Modes", description: "BUILD, PLAN, REVIEW, SCAN, FIX, SWE" },
      { href: "/docs/tools", label: "Tools", description: "Sandboxed local tools" },
      { href: "/docs/tui", label: "TUI commands", description: "Slash commands" },
      { href: "/docs/config", label: "Configuration", description: "Keys and files" },
    ],
  },
  {
    title: "Agent",
    items: [
      { href: "/docs/swe", label: "SWE workflow", description: "Reproduce-first fixes + bench" },
      { href: "/docs/harness", label: "Harness", description: "Skills, todos, subagents, hooks" },
    ],
  },
  {
    title: "Extend",
    items: [
      { href: "/docs/mcp", label: "MCP server", description: "Expose to other tools" },
      {
        href: "/docs/development",
        label: "Development",
        description: "Lint, typecheck, tests",
      },
    ],
  },
];

export function getDocPager(pathname: string): { prev: DocSection | null; next: DocSection | null } {
  const flat = docNav.flatMap((g) => g.items);
  const i = flat.findIndex((s) => s.href === pathname);
  if (i < 0) return { prev: null, next: null };
  return {
    prev: i > 0 ? flat[i - 1] : null,
    next: i < flat.length - 1 ? flat[i + 1] : null,
  };
}

export const allDocHrefs: string[] = docNav.flatMap((g) => g.items.map((s) => s.href));

/** Nav sections, including the pages that are not docs. Order drives header and footer. */
export const mainNav = [
  { href: "/docs", label: "Docs" },
  { href: "/docs/installation", label: "Install" },
  { href: "/blog", label: "Blog" },
  { href: "/compare", label: "Compare" },
  { href: "/series", label: "Courses" },
  { href: "/docs/mcp", label: "MCP" },
] as const;

export type Faq = { q: string; a: string };

export type Post = {
  /** URL segment. Never change one without a 301. */
  slug: string;
  /** H1. Written to read as a search result, not a clever title. */
  title: string;
  /** <title>. Kept <= 60 chars so it never truncates in the SERP. */
  metaTitle: string;
  /** Meta description. 140-158 chars, because that is the whole SERP budget. */
  description: string;
  /** ISO date. Publication date, never a rebuild date. */
  date: string;
  updated?: string;
  readingMinutes: number;
  tags: string[];
  /** The one query this page is written to win. One page, one primary keyword. */
  keyword: string;
  /**
   * Optional course membership. Set on both halves deliberately: `slug` must match
   * a key in `series`, and `order` is the position within it. Omit on standalone
   * posts. See lib/series.ts.
   */
  series?: { slug: string; order: number };
  /** Rendered into FAQPage structured data and shown on the page. */
  faq: Faq[];
  related: string[];
  body: () => React.ReactNode;
};

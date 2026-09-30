export const site = {
  name: "Sentinel",
  tagline: "A minimalist AI coding assistant for the terminal.",
  version: "3.1.0",
  repo: "https://github.com/KunjShah95/SENTINEL-CLI",
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

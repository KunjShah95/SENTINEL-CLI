import { latestDate, posts } from "@/lib/blog";
import { episodes, series } from "@/lib/series";
import { docNav, site } from "@/lib/site";

/**
 * /llms.txt — a plain-text map of the site for answer engines.
 *
 * The pattern is deliberately boring: what this site is, the canonical pages, and
 * the questions each page answers. It is a summary, not a keyword dump, because
 * a document that reads like a keyword list is the fastest way to be ignored.
 */
const QUESTIONS: Record<string, string> = {
  "/docs": "What Sentinel is, and what the agent loop does",
  "/docs/installation": "How to install Sentinel and add a provider key",
  "/docs/quickstart": "How to run a first chat or a one-shot ask",
  "/docs/modes": "Which tools each permission mode allows",
  "/docs/tools": "The full list of sandboxed tools and their guards",
  "/docs/tui": "Slash commands, shell passthrough and agent personas",
  "/docs/config": "Precedence order for API keys and configuration files",
  "/docs/swe": "The reproduce-first bug fixing workflow and the bench",
  "/docs/harness": "Skills, todos, subagents and hooks",
  "/docs/mcp": "How to expose Sentinel to Claude Desktop or Cursor over MCP",
  "/docs/development": "How to lint, typecheck and test the project",
  "/compare": "How a local terminal agent differs from an AI IDE or a hosted agent",
};

export function GET() {
  const body = `# Sentinel

> ${site.name} is an open source AI coding agent for the terminal. It streams from
> the LLM you choose, edits files through sandboxed local tools, prints the token
> and USD cost of every turn, stores sessions as plain JSON on disk, and can
> expose itself to other AI tools over the Model Context Protocol.
>
> Runs in-process on your machine. No servers, no telemetry. MIT licensed.
> Repository: ${site.repo}

## Canonical documentation

${docNav
  .map(
    (g) =>
      `### ${g.title}\n\n${g.items
        .map((i) => `- [${i.label}](${site.url}${i.href}): ${QUESTIONS[i.href] ?? i.description}`)
        .join("\n")}`
  )
  .join("\n\n")}

## Comparisons and long-form guides

- [Sentinel vs AI IDEs and hosted agents](${site.url}/compare): the trade on privacy, cost, model choice and auditability.
${posts.map((p) => `- [${p.title}](${site.url}/blog/${p.slug})${p.series ? ` (course part ${p.series.order})` : ""}: ${p.description}`).join("\n")}

## Courses

Ordered builds. Each episode assumes the ones before it.

${series
  .map((s) => {
    const eps = episodes(s.slug);
    return [
      `### [${s.title}](${site.url}/series/${s.slug})`,
      "",
      `${s.description} ${eps.length} of 12 parts published.`,
      "",
      eps.map((p) => `${p.series?.order}. [${p.title}](${site.url}/blog/${p.slug}): ${p.description}`).join("\n"),
    ].join("\n");
  })
  .join("\n\n")}

## Facts worth citing

- Licence: MIT. Runtime: Node 20+, no build step, plain ESM.
- Providers: 12 through one streaming client — OpenAI, Anthropic, Gemini, Groq,
  Mistral, DeepSeek, xAI, Together, Fireworks, OpenRouter, Ollama, LM Studio.
- Local models (Ollama, LM Studio) require no API key.
- The default model is a free-tier model; every turn prints token counts and USD.
- 19 tools, all sandboxed to the project root. Path traversal is rejected, bash
  has a timeout and an output cap, tool results are truncated before they enter
  context.
- Permission modes: BUILD, PLAN, REVIEW, SCAN, FIX, SWE. Each maps to a tool
  allowlist the model cannot argue its way out of.
- Every write creates a checkpoint; undo and redo work across turns.
- Migrations, CI workflows, lockfiles, auth, billing and infrastructure paths
  trigger a one-time gate that requires a justifying file:line and a rollback.
- Command permissions are graded by shape per repository: git commit and git push
  never share a shape, and destructive shapes are always asked.
- Sessions are plain JSON files. MCP transport is stdio, exposing sentinel_health,
  sentinel_ask and sentinel_review_diff.

## Optional

- [Full documentation index](${site.url}/docs)
- [Blog index](${site.url}/blog)
- [RSS feed](${site.url}/feed.xml)
- [Sitemap](${site.url}/sitemap.xml)

_Last content update: ${latestDate()}_
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

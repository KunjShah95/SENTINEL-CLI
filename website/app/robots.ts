import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

/**
 * AI crawlers are listed explicitly rather than left to `*`. Answer engines are
 * a real traffic source for developer tools, and an unstated policy reads as
 * "blocked" to the crawlers that honour it. Flip any of these to `disallow` and
 * the change is one line instead of a rewrite of this file.
 */
const AI_CRAWLERS = [
  "GPTBot", // OpenAI training + answer engine
  "OAI-SearchBot", // OpenAI search index
  "ChatGPT-User", // OpenAI user-triggered fetch
  "ClaudeBot", // Anthropic crawler
  "Claude-User", // Anthropic user-triggered fetch
  "Claude-SearchBot", // Anthropic search index
  "PerplexityBot", // Perplexity index
  "Perplexity-User", // Perplexity user-triggered fetch
  "Google-Extended", // Gemini / Vertex grounding and training
  "Applebot-Extended", // Siri + Spotlight
  "CCBot", // Common Crawl, the source of most LLM training sets
  "meta-externalagent", // Meta AI crawler
  "Bytespider", // ByteDance
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: "/" })),
    ],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}

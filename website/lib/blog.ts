import type { Post } from "./site";
import cursorCliOverview from "@/content/posts/cursor-cli-course-overview";
import terminalCliCommander from "@/content/posts/terminal-cli-commander";
import chalkFiglet from "@/content/posts/chalk-figlet-terminal-banner";
import cliDoctor from "@/content/posts/cli-doctor-preflight-checks";
import firstAgentTurn from "@/content/posts/first-agent-turn-claude-agent-sdk";
import liveLoopTracking from "@/content/posts/live-agent-loop-tracking";
import asyncGenerators from "@/content/posts/chat-cli-async-generators";
import permissionModes from "@/content/posts/agent-ask-plan-modes";
import riskLedger from "@/content/posts/risk-ledger-command-shapes";
import blastRadiusGate from "@/content/posts/blast-radius-gate";
import courseQuiz from "@/content/posts/cursor-cli-course-quiz";
import techLeadPitch from "@/content/posts/convince-tech-lead-terminal-agent";
import openSourceAgents from "@/content/posts/open-source-ai-coding-agents";
import mcpServer from "@/content/posts/mcp-server-for-coding-agents";
import localLlm from "@/content/posts/local-llm-coding-agent";
import reduceCost from "@/content/posts/reduce-llm-cost";
import cursorAlt from "@/content/posts/cursor-alternative-cli";
import filePermissions from "@/content/posts/ai-agent-file-permissions";
import evaluateAgent from "@/content/posts/evaluate-coding-agent";
import guardrails from "@/content/posts/ai-coding-agent-guardrails";

/** Newest first. The blog index, the sitemap and the RSS feed all read this order. */
export const posts: Post[] = [
  techLeadPitch,
  courseQuiz,
  blastRadiusGate,
  riskLedger,
  permissionModes,
  asyncGenerators,
  liveLoopTracking,
  firstAgentTurn,
  cliDoctor,
  chalkFiglet,
  terminalCliCommander,
  cursorCliOverview,
  guardrails,
  filePermissions,
  evaluateAgent,
  cursorAlt,
  reduceCost,
  localLlm,
  mcpServer,
  openSourceAgents,
];

export const postSlugs: string[] = posts.map((p) => p.slug);

export function getPost(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}

export function getRelated(slugs: string[]): Post[] {
  return slugs.map(getPost).filter((p): p is Post => Boolean(p));
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Newest publish or update date, used for the homepage and blog index lastModified. */
export function latestDate(): string {
  return posts
    .map((p) => p.updated ?? p.date)
    .sort()
    .at(-1) as string;
}

#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { runAiReview, mergeResults, default as reviewPullRequest } from '../src/server/api/lib/pr-review-orchestrator.js';
import { runSast } from '../dist/tui/lib/sast-runner.js';

const server = new McpServer({
  name: 'sentinel-cli',
  version: '2.0.0',
});

server.tool(
  'sentinel_review_diff',
  'Run AI code review on a diff string. Returns issues with severity, file, line, title, description.',
  {
    diff: z.string().describe('The git diff output to review.'),
    files: z.array(z.string()).optional().describe('Optional array of filenames included in the diff.'),
  },
  async ({ diff, files }) => {
    try {
      const issues = await runAiReview(diff, files || []);
      return { content: [{ type: 'text', text: JSON.stringify(issues, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }] };
    }
  }
);

server.tool(
  'sentinel_run_sast',
  'Run static analysis security tools (SAST) on a target directory. Returns findings with severity, file, line, rule, and suggestions.',
  {
    target: z.string().optional().default('.').describe('Directory to scan. Defaults to current working directory.'),
  },
  async ({ target }) => {
    try {
      const result = await runSast({ target });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }] };
    }
  }
);

server.tool(
  'sentinel_review_pr',
  'Run full PR review: fetch diff, run SAST + AI analysis, post inline comments and summary. Returns conclusion and duration.',
  {
    owner: z.string().describe('GitHub repository owner (user or org).'),
    repo: z.string().describe('GitHub repository name.'),
    prNumber: z.number().describe('Pull request number.'),
  },
  async ({ owner, repo, prNumber }) => {
    try {
      const result = await reviewPullRequest(owner, repo, prNumber);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }] };
    }
  }
);

server.tool(
  'sentinel_health',
  'Returns server health info: available LLM providers, version, and status.',
  {},
  async () => {
    const providerKeys = {
      groq: !!process.env.GROQ_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
      deepseek: !!process.env.DEEPSEEK_API_KEY,
      openrouter: !!process.env.OPENROUTER_API_KEY,
      github: !!process.env.GITHUB_TOKEN,
    };

    const available = Object.entries(providerKeys)
      .filter(([, v]) => v)
      .map(([k]) => k);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'ok',
          version: '2.0.0',
          providers: providerKeys,
          availableCount: available.length,
          availableProviders: available,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'sentinel_analyze_code',
  'Runs both SAST and AI analysis on a code snippet. Returns merged, deduplicated results.',
  {
    code: z.string().describe('The source code to analyze.'),
    language: z.string().describe('Programming language (e.g. javascript, typescript, python, go, java, ruby, php, rust).'),
  },
  async ({ code, language }) => {
    try {
      const { writeFile, mkdir, rm } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');
      const { randomUUID } = await import('node:crypto');

      const extMap = {
        javascript: 'js', typescript: 'ts', python: 'py', go: 'go',
        java: 'java', ruby: 'rb', php: 'php', rust: 'rs',
      };
      const ext = extMap[language?.toLowerCase()] || 'js';

      const tmpDir = join(tmpdir(), `sentinel-mcp-${randomUUID()}`);
      const tmpFile = join(tmpDir, `snippet.${ext}`);

      await mkdir(tmpDir, { recursive: true });
      await writeFile(tmpFile, code, 'utf8');

      let sastResult;
      try {
        sastResult = await runSast({ target: tmpDir });
      } finally {
        await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }

      const diff = `diff --git a/snippet.${ext} b/snippet.${ext}\nindex 0000000..0000000 100644\n--- a/snippet.${ext}\n+++ b/snippet.${ext}\n@@ -0,0 +1,${code.split('\n').length} @@\n` +
        code.split('\n').map(l => `+${l}`).join('\n');

      const aiIssues = await runAiReview(diff, [`snippet.${ext}`]);

      const merged = mergeResults(sastResult?.findings || [], aiIssues);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            sast: { findings: sastResult?.findings, toolsRun: sastResult?.toolsRun },
            aiReview: { issues: aiIssues },
            merged,
            total: merged.length,
          }, null, 2),
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }] };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

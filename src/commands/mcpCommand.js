import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Server bootstrap ────────────────────────────────────────────────────────

export async function runMCPServer() {
  const server = new McpServer({
    name: "sentinel-cli",
    version: "1.9.0",
  });

  // ─── Shared helpers ──────────────────────────────────────────────────────────

  /**
   * Run sentinel CLI and return parsed JSON output.
   * Resolves to the local cli script if possible.
   */
  async function runSentinel(args = [], cwd = process.cwd()) {
    try {
      // Try resolving local bin
      const localCli = path.resolve(__dirname, '../../src/core/cli.js');
      const { stdout } = await execFileAsync(
        "node",
        [localCli, ...args, "--format", "json"],
        { cwd, maxBuffer: 10 * 1024 * 1024 } // 10 MB
      );
      return JSON.parse(stdout);
    } catch (err) {
      // sentinel not found — return structured error
      if (err.stdout) {
        try {
          return JSON.parse(err.stdout);
        } catch {
          /* fall through */
        }
      }
      throw new Error(`Sentinel execution failed: ${err.message}`);
    }
  }

  /**
   * Write ad-hoc code to a temp file, run sentinel on it, then clean up.
   */
  async function runSentinelOnCode(code, extension = "js", analyzerArgs = []) {
    const tmpFile = join(tmpdir(), `sentinel-${randomUUID()}.${extension}`);
    try {
      await writeFile(tmpFile, code, "utf8");
      return await runSentinel(["analyze", tmpFile, ...analyzerArgs]);
    } finally {
      await unlink(tmpFile).catch(() => {});
    }
  }

  /**
   * Build a human-readable text summary.
   */
  function formatResult(result) {
    if (result.error) {
      return `Error: ${result.message}`;
    }

    const { issues = [], summary = {} } = result;

    const lines = [
      `Sentinel scan complete.`,
      `Found ${summary.total ?? issues.length} issues: ` +
        `${summary.critical ?? 0} critical, ` +
        `${summary.high ?? 0} high, ` +
        `${summary.medium ?? 0} medium, ` +
        `${summary.low ?? 0} low.`,
      "",
    ];

    if (issues.length === 0) {
      lines.push("No issues found. Clean scan.");
    } else {
      const bySeverity = { critical: [], high: [], medium: [], low: [] };
      for (const issue of issues) {
        const sev = issue.severity?.toLowerCase() ?? "low";
        (bySeverity[sev] ?? bySeverity.low).push(issue);
      }

      for (const [sev, list] of Object.entries(bySeverity)) {
        if (list.length === 0) continue;
        lines.push(`── ${sev.toUpperCase()} (${list.length}) ──`);
        for (const issue of list.slice(0, 20)) {
          lines.push(
            `• [${issue.ruleId ?? issue.id ?? "?"}] ${issue.message ?? issue.description}`
          );
          if (issue.file) {
            lines.push(
              `  File: ${issue.file}${issue.line ? `:${issue.line}` : ""}`
            );
          }
          if (issue.fix ?? issue.suggestion) {
            lines.push(`  Fix: ${issue.fix ?? issue.suggestion}`);
          }
        }
        if (list.length > 20) {
          lines.push(`  …and ${list.length - 20} more. Run with --format json for full list.`);
        }
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  // ─── Tools ───────────────────────────────────────────────────────────────────

  server.tool(
    "sentinel_analyze",
    "Scan files or a directory with Sentinel's full analyzer suite. Returns issues with severity and fix suggestions.",
    {
      target: z.string().describe("File path, glob pattern, or directory to scan."),
      analyzers: z.string().optional().describe("Comma-separated analyzers to run."),
      failOn: z.enum(["critical", "high", "medium", "low"]).optional().describe("Min severity level for failure."),
    },
    async ({ target, analyzers, failOn }) => {
      const args = ["analyze", target];
      if (analyzers) args.push("--analyzers", analyzers);
      if (failOn) args.push("--fail-on", failOn);

      const result = await runSentinel(args);
      return { content: [{ type: "text", text: formatResult(result) }] };
    }
  );

  server.tool(
    "sentinel_security_audit",
    "Run a focused security audit: XSS, SQLi, secrets, CVEs, etc.",
    {
      target: z.string().describe("File path or directory to audit."),
      includeSecrets: z.boolean().optional().default(true).describe("Scan for exposed secrets."),
      includeDeps: z.boolean().optional().default(true).describe("Check dependencies for CVEs."),
    },
    async ({ target, includeSecrets, includeDeps }) => {
      const analyzers = ["security", "api"];
      if (includeSecrets) analyzers.push("secrets");
      if (includeDeps) analyzers.push("dependency");

      const result = await runSentinel([
        "analyze",
        target,
        "--analyzers",
        analyzers.join(","),
      ]);
      return { content: [{ type: "text", text: formatResult(result) }] };
    }
  );

  server.tool(
    "sentinel_review_code",
    "Analyze a code snippet passed as a string — no file needed.",
    {
      code: z.string().describe("The source code to analyze."),
      language: z.enum(["javascript", "typescript", "python", "go", "java", "ruby", "php", "html", "css"]).optional().default("javascript"),
      analyzers: z.string().optional().describe("Comma-separated analyzers."),
    },
    async ({ code, language, analyzers }) => {
      const extMap = { javascript: "js", typescript: "ts", python: "py", go: "go", java: "java", ruby: "rb", php: "php", html: "html", css: "css" };
      const ext = extMap[language] ?? "js";
      const analyzerArgs = analyzers ? ["--analyzers", analyzers] : ["--analyzers", "security,quality,bugs"];

      const result = await runSentinelOnCode(code, ext, analyzerArgs);
      return { content: [{ type: "text", text: formatResult(result) }] };
    }
  );

  server.tool(
    "sentinel_review_pr",
    "Analyze only the files changed in the current branch compared to a base branch.",
    {
      baseBranch: z.string().optional().default("main").describe("Branch to diff against."),
      analyzers: z.string().optional().describe("Comma-separated analyzers to run."),
      directory: z.string().optional().default(".").describe("Repository root directory."),
    },
    async ({ baseBranch, analyzers, directory }) => {
      const args = ["analyze", "--branch", baseBranch];
      if (analyzers) args.push("--analyzers", analyzers);

      const result = await runSentinel(args, directory);
      return { content: [{ type: "text", text: formatResult(result) }] };
    }
  );

  server.tool(
    "sentinel_explain_issue",
    "Get a detailed explanation of a specific Sentinel issue.",
    {
      ruleId: z.string().describe("The Sentinel rule ID to explain."),
      codeContext: z.string().optional().describe("Optional: the actual vulnerable code snippet."),
    },
    async ({ ruleId, codeContext }) => {
      const prompt = codeContext
        ? `Explain the Sentinel issue "${ruleId}" in the context of this code:\n\n${codeContext}`
        : `Explain the Sentinel rule "${ruleId}": what it detects, why it matters, and how to fix it.`;

      const result = await runSentinel(["chat", prompt]);
      const text = typeof result === "string" ? result : result.response ?? result.message ?? JSON.stringify(result);
      return { content: [{ type: "text", text }] };
    }
  );

  server.tool(
    "sentinel_fix",
    "Apply automatic fixes to common issues in a file or directory.",
    {
      target: z.string().describe("File or directory to fix."),
      dryRun: z.boolean().optional().default(false).describe("Preview changes before applying."),
      analyzers: z.string().optional().describe("Comma-separated analyzers to fix."),
    },
    async ({ target, dryRun, analyzers }) => {
      const args = ["fix", target];
      if (dryRun) args.push("--dry-run");
      if (analyzers) args.push("--analyzers", analyzers);

      const result = await runSentinel(args);
      const text = result.fixed !== undefined
        ? `${dryRun ? "[DRY RUN] Would fix" : "Fixed"} ${result.fixed} issues.\n\n${formatResult(result)}`
        : formatResult(result);

      return { content: [{ type: "text", text }] };
    }
  );

  server.tool(
    "sentinel_score",
    "Calculate an overall security and quality score (0–100) for a project.",
    {
      directory: z.string().optional().default(".").describe("Project root directory."),
    },
    async ({ directory }) => {
      const result = await runSentinel(["analyze", directory, "--all-analyzers"], directory);
      if (result.error) return { content: [{ type: "text", text: formatResult(result) }] };

      const issues = result.issues ?? [];
      const weights = { critical: 25, high: 10, medium: 4, low: 1 };
      const deductions = issues.reduce((sum, i) => sum + (weights[i.severity?.toLowerCase()] ?? 1), 0);
      const score = Math.max(0, Math.min(100, 100 - deductions));
      
      const lines = [`Sentinel Score for ${directory}: ${score}/100`, `Issues: ${issues.length} total` ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "sentinel_check_dependencies",
    "Scan npm/yarn dependencies for known CVEs.",
    {
      directory: z.string().optional().default(".").describe("Directory containing package.json."),
      severity: z.enum(["critical", "high", "moderate", "low"]).optional().default("moderate"),
    },
    async ({ directory }) => {
      const result = await runSentinel(["analyze", directory, "--analyzers", "dependency"], directory);
      return { content: [{ type: "text", text: formatResult(result) }] };
    }
  );

  // ─── Resources ───────────────────────────────────────────────────────────────

  server.resource(
    "sentinel://rules",
    "Full list of all Sentinel analyzer rules.",
    async () => {
      try {
        const { stdout } = await execFileAsync("node", [path.resolve(__dirname, '../../src/core/cli.js'), "list-analyzers", "--format", "json"]);
        return { contents: [{ uri: "sentinel://rules", text: stdout }] };
      } catch {
        return { contents: [{ uri: "sentinel://rules", text: "Rules list unavailable." }] };
      }
    }
  );

  // ─── Start ───────────────────────────────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export default { runMCPServer };

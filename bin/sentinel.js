#!/usr/bin/env node
import { spawn, execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Wire global error handlers immediately so unhandled rejections
// and uncaught exceptions are captured before any async work starts.
const { setupGlobalErrorHandlers } = await import(
  pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), "..", "src/utils/errorHandler.js")).href
);
setupGlobalErrorHandlers();

async function checkServerHealth() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch("http://localhost:3000/health", { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const distCli = resolve(__dirname, "../dist/cli.js");
const tuiEntry = resolve(__dirname, "../src/tui/index.tsx");

const CLI_COMMANDS = new Set([
  "login", "upgrade", "clear", "whoami",
  "analyze", "diff", "doctor", "report", "score", "fix",
  "auth", "status", "watch", "init", "config",
  "review", "viewer", "connector",
  "security-audit", "full-scan", "pre-commit",
  "frontend", "backend", "completion",
  "interactive", "chat", "ask", "search", "context",
  "badge-server",  "webhook-server", "pr-bot", "benchmark",
  "mcp", "ci", "help", "version", "init-hooks",
]);

const args = process.argv.slice(2);
const firstArg = args[0]?.toLowerCase();

// Handle `webhook-server` and `pr-bot` subcommands — start the PR Bot webhook server
if (firstArg === "webhook-server" || firstArg === "pr-bot") {
  try {
    const { startPRBotServer } = await import(
      pathToFileURL(resolve(root, "src/github/prBotServer.js")).href
    );
    const portIdx = args.indexOf("--port");
    const port = portIdx >= 0 ? parseInt(args[portIdx + 1], 10) : 3001;
    const server = await startPRBotServer({ port });
    // Block forever — Express keeps the event loop alive.
    // On SIGINT/SIGTERM, close gracefully and exit.
    await new Promise((resolve) => {
      const shutdown = () => { server.close(); resolve(); };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });
    process.exit(0);
  } catch (e) {
    console.error("Failed to start PR Bot:", e.message);
    process.exit(1);
  }
}

// Handle `skill` subcommand directly — manage and execute skills
if (firstArg === "skill") {
  try {
    const { runSkillCommand } = await import(
      pathToFileURL(resolve(root, "src/commands/skillCommand.js")).href
    );
    await runSkillCommand(args.slice(1), { projectPath: root });
  } catch (e) {
    console.error("Skill command failed:", e.message);
    process.exit(1);
  }
  process.exit(0);
}

// Handle `connector` subcommand directly — manage external service connectors
if (firstArg === "connector") {
  const connectorEntry = resolve(root, "src/commands/connectorCommand.js");
  if (existsSync(connectorEntry)) {
    try {
      execFileSync(process.execPath, [connectorEntry, ...args.slice(1)], {
        stdio: "inherit",
        cwd: root,
      });
    } catch (e) {
      process.exit(e?.status ?? 1);
    }
    process.exit(0);
  } else {
    console.error("Connector command not found at src/commands/connectorCommand.js");
    process.exit(1);
  }
}

// Handle `mcp` subcommand directly — run the MCP server in-process
// The MCP server uses StdioServerTransport, so it must own stdin/stdout.
// Using execFileSync preserves the stdio pipes that the AI tool (Cursor,
// Claude Code, etc.) connected to this process.
if (firstArg === "mcp") {
  const mcpEntry = resolve(root, "mcp/sentinel-mcp-server.js");
  if (existsSync(mcpEntry)) {
    try {
      execFileSync(process.execPath, [mcpEntry, ...args.slice(1)], {
        stdio: "inherit",
        cwd: root,
      });
    } catch (e) {
      // MCP server exited with non-zero — propagate exit code
      process.exit(e?.status ?? 1);
    }
    process.exit(0);
  } else {
    console.error("MCP server entry not found at mcp/sentinel-mcp-server.js");
    process.exit(1);
  }
}

// Handle `init-hooks` — install git hooks for security gating
if (firstArg === "init-hooks") {
  const initHooksEntry = resolve(root, "src/cli/commands/init-hooks.js");
  try {
    const { runInitHooks } = await import(pathToFileURL(initHooksEntry).href);
    const hooks = args.includes("--hooks")
      ? args[args.indexOf("--hooks") + 1]?.split(",") || ["pre-push"]
      : ["pre-push"];
    await runInitHooks({ hooks });
  } catch (e) {
    console.error("Failed to install hooks:", e.message);
    process.exit(1);
  }
  process.exit(0);
}

// Handle `ci` subcommand — headless PR review for CI/CD pipelines
if (firstArg === "ci") {
  try {
    const { runCI } = await import(
      pathToFileURL(resolve(root, "src/cli/commands/ci.js")).href
    );
    const parseArg = (flag) => {
      const idx = args.indexOf(flag);
      return idx >= 0 ? args[idx + 1] : undefined;
    };
    await runCI({
      owner: parseArg("--owner"),
      repo: parseArg("--repo"),
      pr: parseArg("--pr"),
      output: parseArg("--output"),
      failOn: parseArg("--fail-on"),
    });
  } catch (e) {
    console.error("CI review failed:", e.message);
    process.exit(1);
  }
  // runCI calls process.exit() internally — unreachable
}

// Flags (--help, --version) and CLI subcommands route to dist/cli.js
const isFlag = firstArg?.startsWith("-");
if (firstArg !== "mcp" && (isFlag || (firstArg && CLI_COMMANDS.has(firstArg)))) {
  const child = spawn(process.execPath, [distCli, ...args], {
    stdio: "inherit",
    cwd: root,
  });
  child.on("exit", (code) => process.exit(code ?? 1));
} else if (firstArg !== "mcp") {
  await launchTui();
}

function isInteractiveTerminal() {
  return process.stdin.isTTY && process.stdout.isTTY;
}

async function launchTui() {
  if (!isInteractiveTerminal() && process.env.SENTINEL_FORCE_TTY !== '1') {
    console.error("");
    console.error("  Sentinel TUI requires an interactive terminal.");
    console.error("  Try running in a real terminal (cmd, PowerShell, iTerm2, etc.),");
    console.error("  not inside an IDE output panel or piped.");
    console.error("");
    console.error("  For CLI commands, use:");
    console.error("    sentinel --help         (list all commands)");
    console.error("    sentinel analyze .      (scan current project)");
    console.error("    sentinel security-audit (full security audit)");
    console.error("");
    console.error("  Or force TTY mode: SENTINEL_FORCE_TTY=1 sentinel");
    console.error("");
    process.exit(0);
  }
  // Auto-start server if not running
  const serverRunning = await checkServerHealth();
  if (!serverRunning) {
    const startPath = resolve(root, "src/server/api/start.js");
    if (existsSync(startPath)) {
      try {
        const serverProc = spawn(process.execPath, [startPath], {
          stdio: 'ignore',
          detached: true,
          cwd: root,
          env: { ...process.env, PORT: '3000' },
        });
        serverProc.unref();

        // Poll up to 3000ms for server to come up
        let started = false;
        for (let i = 0; i < 6; i++) {
          await new Promise(r => setTimeout(r, 500));
          if (await checkServerHealth()) { started = true; break; }
        }
        if (started) {
          process.stderr.write("  ✓ Sentinel server started\n");
        } else {
          process.stderr.write("  ⚠  Server not available — using local AI mode\n");
        }
      } catch {
        process.stderr.write("  ⚠  Server not available — using local AI mode\n");
      }
    }
  }

  const tsxCandidates = [
    resolve(root, "node_modules", "tsx", "dist", "cli.mjs"),
    resolve(root, "..", "tsx", "dist", "cli.mjs"), // hoisted (global install)
  ];
  const tsxEntry = tsxCandidates.find(existsSync);
  if (tsxEntry) {
    const child = spawn(process.execPath, [tsxEntry, tuiEntry], {
      stdio: "inherit",
      cwd: root,
      env: { ...process.env, SENTINEL_ROOT: root },
    });
    child.on('exit', (code) => process.exit(code ?? 1));
    return;
  }

  console.error("");
  console.error("  Sentinel TUI requires tsx (already a dependency).");
  console.error("  Try: npm install");
  console.error("");
  console.error("  CLI commands work without TUI:");
  console.error("    sentinel login | whoami | clear | upgrade");
  console.error("    sentinel analyze | security-audit | diff");
  console.error("    sentinel --help");
  console.error("");
  process.exit(1);
}

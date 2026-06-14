#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const distCli = resolve(__dirname, "../dist/cli.js");
const tuiEntry = resolve(__dirname, "../src/tui/index.tsx");

const CLI_COMMANDS = new Set([
  "login", "upgrade", "clear", "whoami",
  "analyze", "diff", "doctor", "report", "score",
  "auth", "status", "watch", "init", "config",
  "security-audit", "full-scan", "pre-commit",
  "frontend", "backend", "completion",
  "interactive", "chat", "ask", "search", "context",
  "badge-server", "webhook-server", "benchmark",
  "mcp", "ci", "help", "version",
]);

const args = process.argv.slice(2);
const firstArg = args[0]?.toLowerCase();

// Flags (--help, --version) and CLI subcommands route to dist/cli.js
const isFlag = firstArg?.startsWith("-");
if (isFlag || (firstArg && CLI_COMMANDS.has(firstArg))) {
  const child = spawn(process.execPath, [distCli, ...args], {
    stdio: "inherit",
    cwd: root,
  });
  child.on("exit", (code) => process.exit(code ?? 1));
} else {
  await launchTui();
}

async function launchTui() {
  const tsxEntry = resolve(root, "node_modules", "tsx", "dist", "cli.mjs");
  if (existsSync(tsxEntry)) {
    const child = spawn(process.execPath, [tsxEntry, tuiEntry], {
      stdio: "inherit",
      cwd: root,
      env: { ...process.env, SENTINEL_ROOT: root },
    });
    child.on('exit', (code) => process.exit(code ?? 1));
    return;
  }

  console.error("");
  console.error("  Sentinel TUI requires tsx (already in devDependencies).");
  console.error("  Try: npm install");
  console.error("");
  console.error("  CLI commands work without TUI:");
  console.error("    sentinel login | whoami | clear | upgrade");
  console.error("    sentinel analyze | security-audit | diff");
  console.error("    sentinel --help");
  console.error("");
  process.exit(1);
}

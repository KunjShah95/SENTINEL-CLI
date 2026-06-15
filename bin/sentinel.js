#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

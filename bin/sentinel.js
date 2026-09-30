#!/usr/bin/env node
/**
 * sentinel — entry point.
 *
 *   sentinel            launch the TUI (interactive chat)
 *   sentinel ask "..."  one-shot question, streamed answer (read-only)
 *   sentinel mcp        start the MCP server (stdio)
 *   sentinel --version  print the version
 *
 * No build step: everything runs straight from source via Node + tsx.
 */
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const tuiEntry = resolve(root, 'src/tui/index.tsx');

function version() {
  try {
    return JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const args = process.argv.slice(2);
const firstArg = args[0]?.toLowerCase();

// ── --version / -V ────────────────────────────────────────────────────────────
if (firstArg === '--version' || firstArg === '-v') {
  console.log(version());
  process.exit(0);
}

// ── mcp: owns stdin/stdout (stdio transport) ─────────────────────────────────
if (firstArg === 'mcp') {
  const mcpEntry = resolve(root, 'mcp/sentinel-mcp-server.js');
  if (!existsSync(mcpEntry)) {
    console.error('MCP server entry not found at mcp/sentinel-mcp-server.js');
    process.exit(1);
  }
  const { execFileSync } = await import('node:child_process');
  try {
    execFileSync(process.execPath, [mcpEntry, ...args.slice(1)], { stdio: 'inherit', cwd: root });
  } catch (e) {
    process.exit(e?.status ?? 1);
  }
  process.exit(0);
}

// ── everything else: the headless CLI (TUI, ask, help) ───────────────────────
await import(pathToFileURL(resolve(root, 'src/cli/main.js')).href);

export function isInteractiveTerminal() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export async function launchTui() {
  if (!isInteractiveTerminal() && process.env.SENTINEL_FORCE_TTY !== '1') {
    console.error('');
    console.error('  Sentinel TUI requires an interactive terminal.');
    console.error('  Headless commands still work:');
    console.error('    sentinel ask "..."   one-shot question');
    console.error('    sentinel --version   version');
    console.error('');
    process.exit(0);
  }

  const tsxCandidates = [
    resolve(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    resolve(root, '..', 'tsx', 'dist', 'cli.mjs'), // hoisted (global install)
  ];
  const tsxEntry = tsxCandidates.find(existsSync);
  if (!tsxEntry) {
    console.error('');
    console.error('  Sentinel TUI requires tsx (a normal dependency).');
    console.error('  Try: npm install');
    console.error('');
    process.exit(1);
  }

  // Run in the USER's directory: every tool resolves paths against cwd.
  // (This used to be `cwd: root`, which pointed the TUI's file and shell
  // tools at Sentinel's own install directory instead of the project.)
  // Pin tsx to Sentinel's tsconfig so the project's tsconfig never applies.
  const child = spawn(process.execPath, [tsxEntry, '--tsconfig', resolve(root, 'src/tui/tsconfig.json'), tuiEntry], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: { ...process.env, SENTINEL_ROOT: root },
  });
  child.on('exit', (code) => process.exit(code ?? 1));
}

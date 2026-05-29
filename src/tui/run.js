#!/usr/bin/env bun
/**
 * Sentinel TUI — requires Bun runtime.
 *
 * Install:   bun install -g sentinel-cli
 * Run:       sentinel
 * Or:        bunx sentinel-cli
 */
if (!globalThis.Bun) {
  console.error('');
  console.error('  Sentinel TUI requires Bun runtime (https://bun.sh)');
  console.error('');
  console.error('  Install Bun first:');
  console.error('    curl -fsSL https://bun.sh/install | bash');
  console.error('');
  console.error('  Then run:');
  console.error('    bun install -g sentinel-cli');
  console.error('    sentinel');
  console.error('  Or without installing:');
  console.error('    bunx sentinel-cli');
  console.error('');
  process.exit(1);
}

await import('./index.tsx');

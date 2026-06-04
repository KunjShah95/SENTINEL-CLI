#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tuiEntry = join(__dirname, '..', 'tui', 'index.tsx');
const distCliEntry = join(__dirname, '..', 'dist', 'cli.js');

// If arguments (other than node/script) are passed, route to headless dist CLI
if (process.argv.length > 2) {
  const result = spawnSync(process.execPath, [distCliEntry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    encoding: 'utf-8',
  });
  process.exit(result.status ?? 0);
}

function findRuntime() {
  const candidates = ['bun', 'tsx', 'node'];
  for (const bin of candidates) {
    try {
      const r = spawnSync(bin, ['--version'], { stdio: 'pipe', encoding: 'utf-8', timeout: 5000 });
      if (r.status === 0) return bin;
    } catch {
      // runtime not available, try next
    }
  }
  return null;
}

const runtime = findRuntime();

if (!runtime) {
  console.error('Sentinel TUI requires bun, tsx, or node. Install one of these runtimes.');
  process.exit(1);
}

const args = runtime === 'node' ? ['--import', 'tsx', tuiEntry] : [tuiEntry];

const result = spawnSync(runtime, args, {
  stdio: 'inherit',
  encoding: 'utf-8',
});

process.exit(result.status ?? 0);

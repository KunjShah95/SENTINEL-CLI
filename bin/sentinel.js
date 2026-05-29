#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const root = resolve(__dirname, '..');
const tuiEntry = resolve(root, 'src/tui/run.js');

function findBun() {
  const candidates = [
    process.env.BUN_INSTALL && resolve(process.env.BUN_INSTALL, 'bin', 'bun.exe'),
    resolve(process.env.APPDATA || '', 'npm', 'node_modules', 'bun', 'bin', 'bun.exe'),
    resolve(process.env.LOCALAPPDATA || '', 'bun', 'bin', 'bun.exe'),
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return 'bun.exe';
}

const bunPath = findBun();
const child = spawn(bunPath, [tuiEntry], {
  stdio: 'inherit',
  cwd: root,
  env: { ...process.env, SENTINEL_ROOT: root },
  shell: process.platform === 'win32',
});

child.on('exit', code => process.exit(code || 1));
child.on('error', () => {
  console.error('');
  console.error('  Sentinel TUI requires Bun runtime (https://bun.sh)');
  console.error('');
  console.error('  Install Bun first:');
  console.error('    curl -fsSL https://bun.sh/install | bash');
  console.error('');
  console.error('  Then run:');
  console.error('    bun install -g sentinel-cli');
  console.error('    sentinel');
  console.error('');
  process.exit(1);
});

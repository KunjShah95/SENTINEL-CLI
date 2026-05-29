#!/usr/bin/env node
const { spawn } = require('child_process');
const { resolve } = require('path');

const root = resolve(__dirname, '..');
const tuiEntry = resolve(root, 'src/tui/run.js');

const child = spawn('bun', [tuiEntry], {
  stdio: 'inherit',
  cwd: root,
  env: Object.assign({}, process.env, { SENTINEL_ROOT: root }),
});

child.on('exit', function (code) {
  process.exit(code || 1);
});
child.on('error', function () {
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

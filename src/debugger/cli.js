#!/usr/bin/env node
/*
 * src/debugger_cli.js
 * Simple CLI to run the multi-agent debugger on a file or directory.
 */

import fs from 'fs';
import glob from 'glob';
import { fileURLToPath } from 'url';

import { runDebugCycle } from './multi_agent_debugger.js';

const __filename = fileURLToPath(import.meta.url);


export async function processFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const results = await runDebugCycle(filePath, code);
  return { file: filePath, results };
}

export async function run(target) {
  const stats = fs.existsSync(target) ? fs.statSync(target) : null;
  const outputs = [];
  if (!stats) {
    console.error('Target not found:', target);
    process.exitCode = 2;
    return;
  }

  if (stats.isFile()) {
    outputs.push(await processFile(target));
  } else if (stats.isDirectory()) {
    const patterns = ['**/*.js', '**/*.ts'];
    for (const p of patterns) {
      const matches = glob.sync(p, { cwd: target, nodir: true, absolute: true });
      for (const m of matches) outputs.push(await processFile(m));
    }
  }

  console.log(JSON.stringify({ timestamp: new Date().toISOString(), target, outputs }, null, 2));
}

if (process.argv[1] === __filename) {
  const target = process.argv[2] || process.cwd();
  run(target).catch(err => { console.error(err); process.exitCode = 1; });
}

#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import chalk from 'chalk';

const CONFIG_DIR =
  process.env.SENTINEL_HOME ||
  path.join(process.env.HOME || process.env.USERPROFILE || '.', '.sentinel');

const CACHE_PATH = path.join(CONFIG_DIR, 'sessions-cache.json');

export function runClear() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      fs.unlinkSync(CACHE_PATH);
      console.log(chalk.green('Cleared session cache:'), CACHE_PATH);
    } else {
      console.log(chalk.gray('Session cache is already empty:'), CACHE_PATH);
    }
  } catch (err) {
    console.error(chalk.red('Failed to clear session cache:'), err.message);
    process.exit(1);
  }
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  pathToFileURL(process.argv[1]).href === import.meta.url &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  runClear();
}

export default runClear;

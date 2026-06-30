#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import chalk from 'chalk';
import { Mode } from '../../shared/schemas/mode.js';
import { DEFAULT_CHAT_MODEL_ID } from '../../shared/models/index.js';
import { getAuth } from '../../server/api/client.js';
import { isPolarConfigured } from '../../server/api/lib/polar.js';

const CONFIG_DIR =
  process.env.SENTINEL_HOME ||
  path.join(process.env.HOME || process.env.USERPROFILE || '.', '.sentinel');

const PREFS_PATH = path.join(CONFIG_DIR, 'preferences.json');
const CACHE_PATH = path.join(CONFIG_DIR, 'sessions-cache.json');

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function countSessions(cache) {
  if (!cache) return 0;
  if (Array.isArray(cache)) return cache.length;
  if (Array.isArray(cache.sessions)) return cache.sessions.length;
  return 0;
}

async function getCreditsBalance(userId) {
  const allocation = Number(process.env.SENTINEL_DEV_CREDITS || 1000);
  if (!userId) return { balance: allocation, source: 'dev' };
  if (!isPolarConfigured()) {
    try {
      const { getAvailableCreditsBalance } = await import('../../server/api/lib/polar.js');
      const balance = await getAvailableCreditsBalance(userId);
      return { balance, source: 'dev' };
    } catch {
      return { balance: allocation, source: 'dev' };
    }
  }
  try {
    const { getAvailableCreditsBalance } = await import('../../server/api/lib/polar.js');
    const balance = await getAvailableCreditsBalance(userId);
    return { balance, source: 'polar' };
  } catch {
    return { balance: allocation, source: 'dev' };
  }
}

function formatLabel(label, width) {
  if (label.length >= width) return label + ' ';
  return label + ' '.repeat(width - label.length);
}

export async function runStatus() {
  const prefs = readJson(PREFS_PATH) || {};
  const cache = readJson(CACHE_PATH);
  const auth = getAuth();

  const mode = typeof prefs.mode === 'string' ? prefs.mode : Mode.BUILD;
  const model = typeof prefs.model === 'string' ? prefs.model : DEFAULT_CHAT_MODEL_ID;
  const sessionCount = countSessions(cache);
  const { balance, source } = await getCreditsBalance(auth?.userId);

  const labelWidth = 18;
  console.log(chalk.bold('Sentinel Status'));
  console.log(
    '  ' + chalk.gray(formatLabel('User:', labelWidth)) +
      (auth?.userId ? chalk.cyan(auth.userId) : chalk.yellow('not logged in'))
  );
  console.log('  ' + chalk.gray(formatLabel('Mode:', labelWidth)) + chalk.cyan(mode));
  console.log('  ' + chalk.gray(formatLabel('Model:', labelWidth)) + chalk.cyan(model));
  console.log(
    '  ' + chalk.gray(formatLabel('Cached sessions:', labelWidth)) + chalk.cyan(String(sessionCount))
  );
  console.log(
    '  ' +
      chalk.gray(formatLabel('Credits remaining:', labelWidth)) +
      chalk.cyan(String(balance)) +
      (source === 'dev' ? ' ' + chalk.gray('(dev mode)') : '')
  );
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  pathToFileURL(process.argv[1]).href === import.meta.url &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  await runStatus();
}

export default runStatus;

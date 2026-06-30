#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import chalk from 'chalk';
import { Auth, saveAuth, getErrorMessage } from '../../server/api/client.js';
import { issueDevToken } from '../../server/api/middleware/auth.js';

const CONFIG_DIR =
  process.env.SENTINEL_HOME ||
  path.join(process.env.HOME || process.env.USERPROFILE || '.', '.sentinel');

function isConnectionError(err) {
  if (!err) return false;
  const code = err.code || err.cause?.code;
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ECONNRESET') return true;
  const message = (err.message || '').toLowerCase();
  return message.includes('fetch failed') || message.includes('connect');
}

export async function runLogin({ userId } = {}) {
  const requestedUserId =
    userId ||
    process.env.SENTINEL_USER_ID ||
    `local-${Math.random().toString(36).slice(2, 10)}`;

  let token = null;
  let resolvedUserId = requestedUserId;
  let source = 'server';

  try {
    const res = await Auth.devLogin(requestedUserId);
    if (!res.ok) {
      const message = await getErrorMessage(res);
      throw new Error(message);
    }
    const body = await res.json();
    token = body.token;
    resolvedUserId = body.userId || requestedUserId;
  } catch (err) {
    if (!isConnectionError(err)) {
      console.error(chalk.red('Login failed:'), err.message);
      process.exit(1);
    }
    token = issueDevToken(requestedUserId);
    source = 'local';
  }

  saveAuth({ token, userId: resolvedUserId });

  console.log(chalk.green('Logged in as'), chalk.bold(resolvedUserId));
  console.log(chalk.gray('Token: ') + token);
  console.log(chalk.gray('Saved to ') + path.join(CONFIG_DIR, 'auth.json'));
  if (source === 'local') {
    console.log(
      chalk.gray('(server unreachable; issued local dev token via middleware)')
    );
  }
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectRun) {
  await runLogin();
}

export default runLogin;

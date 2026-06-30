#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import chalk from 'chalk';
import { Billing, getErrorMessage } from '../../server/api/client.js';
import { isPolarConfigured } from '../../server/api/lib/polar.js';

function isConnectionError(err) {
  if (!err) return false;
  const code = err.code || err.cause?.code;
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ECONNRESET') return true;
  const message = (err.message || '').toLowerCase();
  return message.includes('fetch failed') || message.includes('connect');
}

function openInBrowser(url) {
  const platform = process.platform;
  try {
    if (platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
    return true;
  } catch {
    return false;
  }
}

function printDevModeNotice() {
  const allocation = Number(process.env.SENTINEL_DEV_CREDITS || 1000);
  console.log(chalk.cyan('Sentinel is running in dev mode.'));
  console.log(
    chalk.gray('You have a free allocation of ') +
      chalk.bold(`${allocation} dev credits`) +
      chalk.gray(' per user.')
  );
  console.log('');
  console.log(chalk.gray('To enable real billing via Polar, set:'));
  console.log(chalk.gray('  POLAR_ACCESS_TOKEN'));
  console.log(chalk.gray('  POLAR_PRODUCT_ID'));
  console.log(chalk.gray('  POLAR_CREDITS_METER_ID'));
}

export async function runUpgrade() {
  if (!isPolarConfigured()) {
    printDevModeNotice();
    return;
  }

  try {
    const res = await Billing.checkout();
    if (!res.ok) {
      if (res.status === 401) {
        console.error(chalk.red('Not logged in.') + ' Run ' + chalk.bold('sentinel login') + ' first.');
        process.exit(1);
      }
      const message = await getErrorMessage(res);
      console.error(chalk.red('Checkout failed:'), message);
      process.exit(1);
    }
    const body = await res.json();
    const url = body?.url;
    if (!url) {
      console.error(chalk.red('Checkout failed:'), 'server did not return a URL');
      process.exit(1);
    }
    console.log(chalk.green('Open this URL in your browser to upgrade:'));
    console.log('  ' + chalk.cyan(url));
    openInBrowser(url);
  } catch (err) {
    if (isConnectionError(err)) {
      console.log(chalk.yellow('Could not reach the Sentinel API.'));
      printDevModeNotice();
      return;
    }
    console.error(chalk.red('Upgrade failed:'), err.message);
    process.exit(1);
  }
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  pathToFileURL(process.argv[1]).href === import.meta.url &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  await runUpgrade();
}

export default runUpgrade;

#!/usr/bin/env node

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

const CI_ENV = {
  github: {
    detect: () => !!process.env.GITHUB_ACTIONS,
    getContext: () => {
      const eventPath = process.env.GITHUB_EVENT_PATH;
      if (!eventPath || !existsSync(eventPath)) throw new Error('GITHUB_EVENT_PATH not found');
      const event = JSON.parse(readFileSync(eventPath, 'utf-8'));
      const repo = process.env.GITHUB_REPOSITORY || '';
      const [owner, repoName] = repo.split('/');
      const prNumber = event.pull_request?.number;
      if (!owner || !repoName || !prNumber) throw new Error('Could not determine PR context from GitHub env');
      return { owner, repo: repoName, prNumber, token: process.env.GITHUB_TOKEN };
    },
  },
  gitlab: {
    detect: () => !!process.env.CI_PROJECT_PATH && !!process.env.CI_MERGE_REQUEST_IID,
    getContext: () => {
      const [owner, repoName] = (process.env.CI_PROJECT_PATH || '').split('/');
      const prNumber = parseInt(process.env.CI_MERGE_REQUEST_IID || '', 10);
      if (!owner || !repoName || !prNumber) throw new Error('Could not determine PR context from GitLab env');
      return { owner, repo: repoName, prNumber, token: process.env.GITLAB_TOKEN || process.env.GITLAB_API_TOKEN };
    },
  },
};

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

function shouldFail(conclusion, failOn, severityCounts) {
  const threshold = SEVERITY_RANK[failOn] ?? 4;

  if (conclusion === 'action_required') return true;
  if (conclusion === 'neutral') return SEVERITY_RANK.high >= threshold;
  if (conclusion === 'success') {
    for (const [sev, count] of Object.entries(severityCounts || {})) {
      if (count > 0 && (SEVERITY_RANK[sev] || 0) >= threshold) return true;
    }
    return false;
  }
  return false;
}

export async function runCI(options = {}) {
  let context;
  let ciName = 'cli';
  const ciEnv = Object.entries(CI_ENV).find(([, env]) => env.detect());

  if (ciEnv) {
    ciName = ciEnv[0];
    try {
      context = ciEnv[1].getContext();
    } catch (err) {
      console.error(chalk.red('CI environment detected but context extraction failed:'), err.message);
      process.exit(2);
    }
  } else {
    const { owner, repo, pr } = options;
    if (!owner || !repo || !pr) {
      console.error(chalk.red('Usage: sentinel ci --owner <owner> --repo <repo> --pr <number>'));
      console.error(chalk.gray('Or run in a CI environment (GitHub Actions, GitLab CI).'));
      process.exit(2);
    }
    context = { owner, repo, prNumber: parseInt(pr, 10), token: process.env.GITHUB_TOKEN };
  }

  const orchestratorPath = resolve(root, 'src/server/api/lib/pr-review-orchestrator.js');
  const { default: reviewPullRequest } = await import(pathToFileURL(orchestratorPath).href);

  process.stderr.write(chalk.cyan(`\n  Sentinel CI: reviewing ${context.owner}/${context.repo}#${context.prNumber}\n\n`));

  const result = await reviewPullRequest(context.owner, context.repo, context.prNumber, {
    token: context.token,
  });

  const output = {
    ...result,
    timestamp: new Date().toISOString(),
    ci: ciName,
  };

  const json = JSON.stringify(output, null, 2);

  if (options.output) {
    writeFileSync(options.output, json, 'utf-8');
    process.stderr.write(chalk.gray(`  Output written to ${options.output}\n`));
  }

  console.log(json);

  const failOn = options.failOn || 'critical';
  if (shouldFail(result.conclusion, failOn, result.severityCounts)) {
    process.stderr.write(chalk.red(`\n  ✗ Fail threshold "${failOn}" exceeded\n`));
    process.exit(1);
  }

  process.stderr.write(chalk.green('\n  ✓ PR review passed\n'));
  process.exit(0);
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const parseArg = (flag) => {
    const idx = process.argv.indexOf(flag);
    return idx >= 0 ? process.argv[idx + 1] : undefined;
  };
  await runCI({
    owner: parseArg('--owner'),
    repo: parseArg('--repo'),
    pr: parseArg('--pr'),
    output: parseArg('--output'),
    failOn: parseArg('--fail-on'),
  });
}

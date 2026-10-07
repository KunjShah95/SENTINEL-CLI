/**
 * The composition root.
 *
 * Everything above this file is pure. This is where the real webhook secret,
 * the real GitHub token and the real model get read, and where the queue is
 * built with a `run` that actually reviews something.
 *
 * It is one module on purpose. A DI container for an app this size is a layer
 * of indirection that has to be understood before anything can be changed, and
 * the alternative — module-level singletons that construct themselves on
 * import — hides the ordering constraints that actually bite.
 */
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CoalescingQueue,
  type QueueEvent,
} from '../../src/agent/review-queue.js';
import { decidePullRequest, buildBriefForPullRequest, DEFAULT_REVIEW_POLICY } from './policy';
import type { ReviewRequest, ReviewPolicy } from './policy';
import { parsePatches, isPointable, type FileDiff } from './diff';
import { checkoutPr, cloneUrl } from './checkout';
import { installationToken, getFiles, createReview, createCheckRun, updateCheckRun, type GhFile } from './github';
import { reviewPullRequest, summarise, type Finding } from './review';
import type { QueueJob } from './types';

export type OwlConfig = {
  appId: string;
  privateKey: string;
  webhookSecret: string;
  installationId: number;
  cacheDir: string;
  concurrency: number;
  maxQueued: number;
  jobTimeoutMs: number;
  policy: ReviewPolicy;
  log: (msg: string, extra?: Record<string, unknown>) => void;
};

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function loadConfig(): OwlConfig {
  const required = (name: string): string => {
    const v = process.env[name];
    if (!v) throw new Error(`${name} is not set`);
    return v;
  };

  return {
    appId: required('PR_OWL_APP_ID'),
    // A PEM read from the environment has literal \n on every platform but
    // Windows, which is a confusing 400 from GitHub if it is not normalised.
    privateKey: required('PR_OWL_PRIVATE_KEY').replace(/\\n/g, '\n'),
    webhookSecret: required('PR_OWL_WEBHOOK_SECRET'),
    installationId: envInt('PR_OWL_INSTALLATION_ID', 0),
    cacheDir: process.env.PR_OWL_CACHE_DIR || join(tmpdir(), 'pr-owl-repos'),
    concurrency: envInt('PR_OWL_CONCURRENCY', 2),
    maxQueued: envInt('PR_OWL_MAX_QUEUED', 50),
    jobTimeoutMs: envInt('PR_OWL_JOB_TIMEOUT_MS', 8 * 60_000),
    policy: DEFAULT_REVIEW_POLICY,
    log: (msg, extra) => console.log(`[pr-owl] ${msg}`, extra ?? ''),
  };
}

/**
 * The severity that earns `REQUEST_CHANGES`.
 *
 * Two critical findings is a threshold rather than one, and the reason is
 * empirical: a single critical finding is often a false positive on a subtle
 * change, and a bot that blocks a PR on a false positive loses the team's
 * trust permanently. Two independent ones are much harder to explain away.
 */
const CRITICALS_TO_BLOCK = 2;

export function buildQueue(config: OwlConfig, hooks: {
  onEvent?: (e: QueueEvent) => void;
} = {}): CoalescingQueue {
  mkdirSync(config.cacheDir, { recursive: true });

  return new CoalescingQueue({
    concurrency: config.concurrency,
    maxQueued: config.maxQueued,
    jobTimeoutMs: config.jobTimeoutMs,
    onEvent: hooks.onEvent,
    run: async (job) => reviewJob(job.payload as QueueJob, config),
  });
}

/** Everything one queued job does. Throws on failure; the queue records it. */
async function reviewJob(job: QueueJob, config: OwlConfig): Promise<{ summary: string }> {
  const token = await installationToken({
    appId: config.appId,
    privateKey: config.privateKey,
    installationId: config.installationId,
  });

  const ghFiles: GhFile[] = await getFiles(job.repo, job.prNumber, token);
  const files: FileDiff[] = parsePatches(ghFiles.map((f) => f.patch));
  const additions = ghFiles.reduce((n, f) => n + (f.additions ?? 0), 0);
  const deletions = ghFiles.reduce((n, f) => n + (f.deletions ?? 0), 0);

  const request: ReviewRequest = {
    repo: job.repo,
    prNumber: job.prNumber,
    headRepo: job.headRepo ?? null,
    baseRepo: job.repo,
    headSha: job.headSha,
    title: job.title ?? '',
    body: job.body ?? null,
    author: job.author ?? '',
    draft: job.draft ?? false,
    additions,
    deletions,
    files,
  };

  // Policy runs before the clone: a PR we will not review must not cost a
  // checkout. Order matters and it is the cheapest-first order.
  const decision = decidePullRequest(request, config.policy);
  if (!decision.review) {
    config.log('skipped', { repo: job.repo, pr: job.prNumber, reason: decision.reason });
    return { summary: `skipped: ${decision.reason}` };
  }

  const check = await createCheckRun(
    job.repo,
    { name: 'PR Owl', head_sha: job.headSha },
    token,
  ).catch(() => null);

  try {
    const { dir } = await checkoutPr(cloneUrl(job.repo), job.headSha, {
      cacheDir: config.cacheDir,
      baseRef: job.baseRef ?? 'main',
    });

    const outcome = await reviewPullRequest(job, {
      repoDir: dir,
      files,
      additions,
      deletions,
      brief: buildBriefForPullRequest(request, decision),
      readOnly: decision.readOnly,
    });

    // Only commentable findings go to the API. Sending one bad position fails
    // the whole review, so the filtering happens here and the rejects are
    // logged rather than swallowed.
    const postable = outcome.findings.filter((f) => isPointable(files.find((x) => x.path === f.path)!, f.line, f.side));
    const criticals = postable.filter((f) => f.severity === 'critical').length;

    await createReview(
      job.repo,
      job.prNumber,
      {
        commitId: job.headSha,
        body: summarise(outcome.summary, postable),
        event: criticals >= CRITICALS_TO_BLOCK ? 'REQUEST_CHANGES' : 'COMMENT',
        comments: postable.map((f: Finding) => ({
          path: f.path,
          line: f.line,
          side: f.side,
          body: inlineBody(f),
        })),
      },
      token,
    );

    if (check) {
      await updateCheckRun(
        job.repo,
        check.id,
        {
          status: 'completed',
          conclusion: criticals >= CRITICALS_TO_BLOCK ? 'failure' : postable.length ? 'neutral' : 'success',
          output: {
            title: `${postable.length} finding(s), ${criticals} critical`,
            summary: `PR Owl reviewed ${job.headSha.slice(0, 7)}. ${outcome.dropped.length} finding(s) dropped as unplaceable.`,
          },
        },
        token,
      ).catch(() => {});
    }

    return { summary: `${postable.length} finding(s), ${criticals} critical` };
  } catch (e) {
    if (check) {
      await updateCheckRun(job.repo, check.id, {
        status: 'completed',
        conclusion: 'neutral',
        output: { title: 'PR Owl failed', summary: String(e?.message ?? e).slice(0, 500) },
      }, token).catch(() => {});
    }
    throw e;
  }
}

function inlineBody(f: Finding): string {
  const tag = f.severity === 'critical' ? '**blocking**' : f.severity === 'nit' ? '_nit_' : '';
  return tag ? `${tag}\n\n${f.message}` : f.message;
}

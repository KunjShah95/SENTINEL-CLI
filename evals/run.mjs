#!/usr/bin/env node
/**
 * eval runner — task oracle checks (no key) and agent runs (needs key).
 *
 *   node evals/run.mjs --check
 *     Validates every task: pristine fixture must FAIL the grader (mutation
 *     gate: the task actually tests something), the reference solution must
 *     PASS it (solvability proof), behavioral tasks must PASS pristine.
 *     Runs in CI on ubuntu + windows — graders are Node, never shell.
 *
 *   node evals/run.mjs --agent [--model <id>] [--task <id>]
 *     Drives the real agent (runAgentTurn) serially per task in a fresh
 *     workspace copy, records a JSONL trajectory per task under
 *     results/<runId>/, grades, and prints a cost/latency report.
 *     Serial on purpose: the tool sandbox resolves against process.cwd(),
 *     which is process-global. Parallelize with worker processes later.
 *
 * Task layout (terminal-bench triplet, Node-portable):
 *   prompt.md            the instruction given to the agent
 *   fixture/ | workspace/  pristine starting state
 *   solution/            reference fix (fix tasks only; proves solvability)
 *   grade.mjs            `export async function grade(workdir)` → {pass, detail}
 *   meta.json            { id, mode, kind: fix|behavioral, oracle?: none }
 */
import { readdirSync, readFileSync, existsSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tasksDir = join(root, 'evals', 'tasks');
const resultsDir = join(root, 'evals', 'results');

function listTasks(only) {
  return readdirSync(tasksDir)
    .filter((d) => !only || d === only)
    .map((d) => {
      const dir = join(tasksDir, d);
      const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
      return { ...meta, dir };
    });
}

async function loadGrader(task) {
  return import(pathToFileURL(join(task.dir, 'grade.mjs')).href);
}

function freshCopy(task) {
  const src = existsSync(join(task.dir, 'fixture'))
    ? join(task.dir, 'fixture')
    : join(task.dir, 'workspace');
  const dest = mkdtempSync(join(tmpdir(), `sentinel-eval-${task.id}-`));
  cpSync(src, dest, { recursive: true });
  return dest;
}

function overlaySolution(task, workdir) {
  const sol = join(task.dir, 'solution');
  if (existsSync(sol)) cpSync(sol, workdir, { recursive: true });
}

/** --check: oracle validation. Exit nonzero on any oracle violation. */
export async function checkTasks(only) {
  const tasks = listTasks(only);
  let failures = 0;
  for (const task of tasks) {
    const { grade } = await loadGrader(task);
    if (task.oracle === 'none') {
      const workdir = freshCopy(task);
      const r = await grade(workdir);
      console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${task.id} (behavioral oracle: pristine passes) — ${r.detail}`);
      if (!r.pass) failures++;
      continue;
    }
    const workdir = freshCopy(task);
    const before = await grade(workdir);
    console.log(`${!before.pass ? 'PASS' : 'FAIL'}  ${task.id} (mutation gate: pristine fails) — ${before.detail}`);
    if (before.pass) {
      failures++;
      continue;
    }
    overlaySolution(task, workdir);
    const after = await grade(workdir);
    console.log(`${after.pass ? 'PASS' : 'FAIL'}  ${task.id} (solvability: reference passes) — ${after.detail}`);
    if (!after.pass) failures++;
  }
  console.log(failures === 0 ? `\nAll ${tasks.length} task oracle(s) valid.` : `\n${failures} oracle violation(s).`);
  return { failures, total: tasks.length };
}

/** --agent: real agent runs with trajectory recording + cost/latency report. */
export async function runAgent({ model, only } = {}) {
  const { runAgentTurn } = await import('../src/agent/loop.js');
  const { DEFAULT_CHAT_MODEL_ID } = await import('../src/shared/models/index.js');
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(resultsDir, runId);
  mkdirSync(outDir, { recursive: true });

  const tasks = listTasks(only);
  const results = [];
  const previousCwd = process.cwd();
  for (const task of tasks) {
    const workdir = freshCopy(task);
    const prompt = readFileSync(join(task.dir, 'prompt.md'), 'utf8');
    process.env.SENTINEL_TRAJECTORY_DIR = outDir;
    process.chdir(workdir);
    const started = Date.now();
    let finish = null;
    let error = null;
    try {
      for await (const ev of runAgentTurn({
        history: [{ id: task.id, role: 'user', parts: [{ type: 'text', text: prompt }] }],
        mode: task.mode || 'BUILD',
        model: model || DEFAULT_CHAT_MODEL_ID,
        trajectory: task.id,
      })) {
        if (ev.event === 'finish') finish = ev.data;
        else if (ev.event === 'error') error = ev.data?.message;
      }
    } catch (e) {
      error = e?.message || String(e);
    } finally {
      process.chdir(previousCwd);
    }
    const latencyMs = Date.now() - started;
    const { grade } = await loadGrader(task);
    const g = await grade(workdir).catch((e) => ({ pass: false, detail: `grader crashed: ${e.message}` }));
    results.push({
      task: task.id,
      pass: g.pass,
      detail: g.detail,
      error,
      costUsd: finish?.costUsd ?? 0,
      inputTokens: finish?.usage?.inputTokens ?? 0,
      outputTokens: finish?.usage?.outputTokens ?? 0,
      latencyMs,
      trajectory: `${task.id}.jsonl`,
    });
    console.log(`${g.pass ? 'PASS' : 'FAIL'}  ${task.id} — ${g.detail}${error ? ` (agent error: ${error})` : ''}`);
  }

  const passed = results.filter((r) => r.pass).length;
  const report = {
    runId,
    model: model || DEFAULT_CHAT_MODEL_ID,
    startedAt: new Date().toISOString(),
    results,
    summary: {
      passed,
      total: results.length,
      passRate: results.length ? passed / results.length : 0,
      costUsd: results.reduce((s, r) => s + r.costUsd, 0),
      meanLatencyMs: results.length
        ? Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / results.length)
        : 0,
    },
  };
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\n${passed}/${results.length} passed · $${report.summary.costUsd.toFixed(4)} · ${report.summary.meanLatencyMs}ms mean`);
  console.log(`Report + trajectories: evals/results/${runId}/`);
  return report;
}

const args = process.argv.slice(2);
function flagValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

if (args.includes('--check')) {
  const { failures } = await checkTasks(flagValue('--task'));
  process.exit(failures === 0 ? 0 : 1);
} else if (args.includes('--agent')) {
  await runAgent({ model: flagValue('--model'), only: flagValue('--task') });
} else {
  console.error('Usage: node evals/run.mjs --check [--task <id>] | --agent [--model <id>] [--task <id>]');
  process.exit(1);
}

/**
 * Replay evals — your own past sessions as a regression suite.
 *
 * Every turn already lands in .sentinel/trajectories/<runId>.jsonl (now with
 * a `start` header carrying the prompt). `replay` re-runs that prompt with
 * the CURRENT harness (a different model, an edited system prompt, a new
 * tool) and diffs behavior against the recording:
 *
 *   - finished vs errored / hit a guard
 *   - files written (set comparison)
 *   - tool-call sequence similarity (LCS ratio)
 *   - receipts: did verified claims stay verified?
 *   - cost and tool-call count deltas
 *
 * BUILD/SWE replays run inside a throwaway git worktree, so replaying never
 * touches your working tree. No model grader: every signal is mechanical.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { runAgentTurnInner } from './loop.js';
import { createWorktree, removeWorktree } from './worktree.js';
import { teammatePermission } from './team.js';

const WRITE_TOOLS = new Set(['writeFile', 'editFile', 'batchEdit', 'applyPatch']);

export function trajectoryDir(cwd = process.cwd()) {
  return process.env.SENTINEL_TRAJECTORY_DIR || join(cwd, '.sentinel', 'trajectories');
}

const parseData = (d) => {
  if (typeof d !== 'string') return d;
  try { return JSON.parse(d); } catch { return d; }
};

function writtenPaths(toolName, input) {
  if (!WRITE_TOOLS.has(toolName) || !input) return [];
  if (toolName === 'batchEdit') return (input.operations || []).map((o) => o?.filePath).filter(Boolean);
  if (toolName === 'applyPatch') return [...String(input.patch || '').matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]);
  return input.path ? [input.path] : [];
}

/** Summarize a recorded or live event stream into comparable features. */
export function summarizeEvents(events) {
  const out = { prompt: '', goal: undefined, mode: undefined, model: undefined, tools: [], files: [], errors: [], finished: false, costUsd: 0, receipts: [] };
  const files = new Set();
  const failedIds = new Set();
  const calls = [];
  for (const ev of events) {
    const data = parseData(ev.data);
    if (ev.event === 'start') {
      out.prompt = data?.prompt || '';
      out.goal = data?.goal;
      out.mode = ev.mode;
      out.model = ev.model;
    } else if (ev.event === 'tool_call') {
      calls.push({ id: data?.toolCallId, name: data?.toolName, input: data?.input });
      out.tools.push(data?.toolName);
    } else if (ev.event === 'tool_result' && data?.error) {
      failedIds.add(data.toolCallId);
    } else if (ev.event === 'error') {
      out.errors.push(String(data?.message || data));
    } else if (ev.event === 'finish') {
      out.finished = true;
      out.costUsd = ev.costUsd ?? data?.costUsd ?? 0;
    } else if (ev.event === 'receipts' && data && !data.blocking) {
      out.receipts = (data.claims || []).map((c) => `${c.kind}:${c.status}`);
    }
  }
  for (const c of calls) {
    if (failedIds.has(c.id)) continue;
    for (const p of writtenPaths(c.name, c.input)) files.add(String(p).replace(/\\/g, '/'));
  }
  out.files = [...files].sort();
  return out;
}

export function loadTrajectory(fileOrId, cwd = process.cwd()) {
  let file = fileOrId;
  if (!existsSync(file)) file = join(trajectoryDir(cwd), `${fileOrId.replace(/\.jsonl$/, '')}.jsonl`);
  if (!existsSync(file)) throw new Error(`No trajectory ${fileOrId}`);
  const events = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
  return { file, runId: basename(file, '.jsonl'), events, summary: summarizeEvents(events) };
}

/** Replayable trajectories (have a prompt), newest first. */
export function listTrajectories(cwd = process.cwd(), limit = 50) {
  const dir = trajectoryDir(cwd);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .slice(0, limit * 4)
    .map(({ f }) => {
      try {
        const t = loadTrajectory(join(dir, f), cwd);
        return t.summary.prompt ? t : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .slice(0, limit);
}

/** Longest-common-subsequence ratio of two tool sequences, 0..1. */
export function sequenceSimilarity(a, b) {
  if (!a.length && !b.length) return 1;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return (2 * dp[a.length][b.length]) / (a.length + b.length);
}

/** Compare two summaries. `regressed` is the headline verdict. */
export function compareRuns(before, after) {
  const same = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
  const lostReceipts = before.receipts.filter((r) => r.endsWith(':supported') && !after.receipts.includes(r));
  const regressions = [];
  if (before.finished && !after.finished) regressions.push('no longer finishes');
  if (!before.errors.length && after.errors.length) regressions.push(`new error: ${after.errors[0]}`);
  if (lostReceipts.length) regressions.push(`lost verified claims: ${lostReceipts.join(', ')}`);
  return {
    regressed: regressions.length > 0,
    regressions,
    filesSame: same(before.files, after.files),
    filesBefore: before.files,
    filesAfter: after.files,
    toolSimilarity: Math.round(sequenceSimilarity(before.tools, after.tools) * 100) / 100,
    toolsBefore: before.tools.length,
    toolsAfter: after.tools.length,
    costBefore: before.costUsd,
    costAfter: after.costUsd,
  };
}

/**
 * Re-run one recorded turn with the current harness.
 * @returns {{ runId, prompt, before, after, diff }}
 */
export async function replayTrajectory(fileOrId, { model, createStream, cwd = process.cwd(), allowBash = false } = {}) {
  const rec = loadTrajectory(fileOrId, cwd);
  const before = rec.summary;
  if (!before.prompt) throw new Error(`${rec.runId} has no recorded prompt (recorded before replay support)`);
  const mode = before.mode || 'PLAN';
  const writes = mode === 'BUILD' || mode === 'SWE';
  let wt = null;
  if (writes) wt = createWorktree(`replay-${rec.runId.slice(0, 8)}-${Date.now().toString(36).slice(-4)}`, cwd);
  const events = [{ event: 'start', data: { prompt: before.prompt, goal: before.goal }, mode, model: model || before.model }];
  try {
    for await (const ev of runAgentTurnInner({
      history: [{ id: `replay_${rec.runId}`, role: 'user', parts: [{ type: 'text', text: before.prompt }] }],
      mode,
      model: model || before.model,
      goal: before.goal,
      createStream,
      trajectory: false,
      workdir: wt ? wt.dir : cwd,
      agentName: `replay-${rec.runId}`,
      // Same policy as an isolated teammate: reads + worktree edits allowed,
      // destructive shell denied, other shell only with --allow-bash.
      onPermissionRequest: teammatePermission({
        leadAllowAll: new Set(allowBash ? ['bash', 'runTests', 'bgRun'] : []),
        leadHeadless: false,
        isolated: !!wt,
      }),
    })) {
      events.push({ ...ev, costUsd: ev.data?.costUsd });
    }
  } finally {
    if (wt) removeWorktree(wt);
  }
  const after = summarizeEvents(events);
  return { runId: rec.runId, prompt: before.prompt, before, after, diff: compareRuns(before, after) };
}

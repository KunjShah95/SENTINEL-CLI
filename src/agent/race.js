/**
 * race — best-of-N, test-scored, in isolated worktrees.
 *
 * N candidates attack the same task in parallel, each in its own git
 * worktree, optionally on DIFFERENT models (a local model tournament) and
 * with different approach hints for diversity. When all finish, a check
 * command (the user's own test suite) runs in every worktree. Ranking:
 *
 *   1. check passes          (exit code 0)
 *   2. more parsed passing tests, fewer failing
 *   3. smaller diff           (Occam: least code that passes)
 *   4. cheaper                (tokens × price)
 *
 * The winner's patch is applied to the main tree (checkpointed → undoable);
 * every worktree and branch is removed. Candidates never touch the main
 * tree and cannot run destructive commands.
 *
 * On the primitive: a candidate is a task with `isolation: 'worktree'` and the
 * `teammate` rung. What remains here is the part that was always race's own
 * logic — the ranker, the scorer and the critic. The lifecycle, the worktrees
 * and the teardown are no longer reimplemented once per candidate.
 */
import { runAgentTurnInner } from './loop.js';
import { worktreePatch } from './worktree.js';
import { createTask, awaitTask, mergeTask, PERMISSIONS } from './task.js';
import { runSandboxedAsync } from '../shared/tools/sandbox.js';
import { parseTestOutput } from './swe.js';

export const RACE_MAX = 6;

export const APPROACH_HINTS = Object.freeze([
  '',
  'Prefer the smallest possible change that fixes the root cause.',
  'Start by writing or running a failing test that reproduces the problem, then fix it.',
  'Read the surrounding code and existing tests first; match the codebase conventions exactly.',
  'Consider edge cases (empty input, nulls, boundaries) explicitly before finishing.',
  'Look for an existing helper or pattern in the codebase to reuse instead of adding new code.',
]);

/**
 * Pure ranking so it can be unit-tested. Higher is better. With critique
 * on, reviewer severity (0 clean … 3 blocking) sits between the test
 * signals and diff size: tests decide, the peer review breaks ties.
 */
export function rankCandidates(cands) {
  const key = (c) => [
    c.disqualified ? 0 : 1,
    c.check?.exitCode === 0 ? 1 : 0,
    (c.check?.passed ?? 0) - (c.check?.failed ?? 0),
    -(c.critique?.severity ?? 0),
    -((c.diff?.added ?? 0) + (c.diff?.removed ?? 0)),
    -(c.costUsd ?? 0),
  ];
  return [...cands].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
    return a.index - b.index;
  });
}

const CRITIC_SYSTEM = [
  'You review a code change made by another engineer for the task below. You see only the task and the diff.',
  'Look for: wrong or incomplete fix, broken edge cases, unrelated or risky edits, deleted tests, hard-coded test values.',
  'Reply with ONLY JSON: {"severity": 0|1|2|3, "issues": [string], "verdict": string}.',
  'severity: 0 = clean, 1 = nits, 2 = real problem, 3 = wrong/unsafe. Do not invent issues; an empty list with 0 is a fine answer.',
].join('\n');

export function parseCritique(text) {
  const m = /\{[\s\S]*\}/.exec(text || '');
  if (m) {
    try {
      const v = JSON.parse(m[0]);
      const sev = Number(v.severity);
      return {
        severity: Number.isFinite(sev) ? Math.max(0, Math.min(3, Math.round(sev))) : 1,
        issues: Array.isArray(v.issues) ? v.issues.map(String).slice(0, 6) : [],
        verdict: String(v.verdict || '').slice(0, 300),
      };
    } catch { /* fall through */ }
  }
  // Unparseable review: neutral-ish, never a free win.
  return { severity: 1, issues: [], verdict: 'critic returned no parseable review' };
}

/**
 * Cross-critique: candidate i is reviewed by the model of candidate i+1
 * (a model never grades its own work when more than one model races).
 */
export async function critiqueDiff({ task, patch, model, createStream, signal }) {
  const { resolveChatModel } = await import('../shared/models/index.js');
  const { streamCompletion } = await import('./providers.js');
  const resolved = resolveChatModel(model);
  let text = '';
  const clipped = patch.length > 24_000 ? `${patch.slice(0, 24_000)}\n…[diff truncated]` : patch;
  for await (const ev of (createStream ?? streamCompletion)({
    modelId: resolved.modelId,
    provider: resolved.provider,
    system: CRITIC_SYSTEM,
    messages: [{ role: 'user', content: `Task:\n${task}\n\nDiff:\n${clipped}` }],
    tools: [],
    signal,
    purpose: 'race-critic',
  })) {
    if (ev.type === 'text') text += ev.text;
    else if (ev.type === 'error') return { severity: 1, issues: [], verdict: `critic failed: ${ev.message}` };
  }
  return parseCritique(text);
}

async function runCandidate(c, { task, createStream, allowBash, onEvent, signal, cwd }) {
  const brief = [
    task,
    c.hint ? `\nApproach: ${c.hint}` : '',
    '\nYou work alone in an isolated copy of the repository. Make the change, verify it, then reply with a short summary.',
  ].join('');
  // Bash is opt-in for candidates: a tournament that can run anything is a
  // tournament that can install anything, N times over.
  const leadAllowAll = new Set(allowBash ? ['bash', 'runTests'] : []);

  const { id, rejected } = createTask({
    kind: 'agent',
    name: c.name,
    prompt: brief,
    mode: 'BUILD',
    model: c.model,
    isolation: 'worktree',
    permission: PERMISSIONS.TEAMMATE,
    cwd,
    // The race owns its own budget: N candidates are the point, so the global
    // cap must not throttle a legitimate tournament.
    maxConcurrent: RACE_MAX,
    meta: { leadAllowAll, candidateIndex: c.index },
    run: async ({ workdir, permission }) => {
      let text = '';
      for await (const ev of runAgentTurnInner({
        history: [{ id: `race_${c.index}`, role: 'user', parts: [{ type: 'text', text: brief }] }],
        mode: 'BUILD',
        model: c.model,
        createStream,
        trajectory: false,
        agentName: c.name,
        workdir,
        subagentDepth: 1,
        signal,
        onPermissionRequest: permission,
      })) {
        if (ev.event === 'text') text += ev.data.delta;
        else if (ev.event === 'tool_call') onEvent({ type: 'tool', candidate: c.name, tool: ev.data.toolName });
        else if (ev.event === 'finish') c.costUsd = ev.data.costUsd || 0;
        else if (ev.event === 'error') {
          c.error = ev.data.message;
          onEvent({ type: 'error', candidate: c.name, message: ev.data.message });
        }
      }
      return { summary: text.trim().slice(0, 2000) };
    },
  });

  if (rejected) {
    c.error = rejected;
    return;
  }
  c.taskId = id;
  const finished = await awaitTask(id);
  // The primitive owns the worktree now, so read its location back rather than
  // creating one here and keeping a second copy of the truth.
  c.wt = { dir: finished.workdir, baseSha: finished.baseSha, root: finished.root };
  if (finished.status === 'failed') c.error = finished.error;
  else if (finished.status === 'cancelled') c.error = 'cancelled';
  c.summary = finished.result?.summary || '';
}

/**
 * @param {object} o
 * @param {string} o.task
 * @param {string} o.check        command that must exit 0 for a candidate to win
 * @param {number} [o.n=3]
 * @param {string[]} o.models     round-robin across candidates
 * @param {boolean} [o.apply=true] apply the winner to the main tree
 * @param {boolean} [o.allowBash=false] let candidates run non-destructive shell commands
 */
export async function runRace({
  task, check, n = 3, models, apply = true, allowBash = false, critique = false,
  cwd = process.cwd(), createStream, onEvent = () => {}, signal, checkTimeoutMs = 10 * 60_000,
} = {}) {
  if (!task?.trim()) throw new Error('task is required');
  if (!check?.trim()) throw new Error('check command is required (e.g. "npm test")');
  if (!Array.isArray(models) || !models.length) throw new Error('at least one model is required');
  const count = Math.max(1, Math.min(RACE_MAX, n | 0));
  const stamp = Date.now().toString(36).slice(-5);
  const cands = [];
  try {
    for (let i = 0; i < count; i++) {
      const name = `race-${stamp}-${i + 1}`;
      // No worktree here: createTask creates it, so the candidate never has a
      // directory the primitive does not know about.
      cands.push({ index: i, name, model: models[i % models.length], hint: APPROACH_HINTS[i % APPROACH_HINTS.length] });
      onEvent({ type: 'start', candidate: name, model: models[i % models.length] });
    }

    await Promise.all(cands.map((c) => runCandidate(c, { task, createStream, allowBash, onEvent, signal, cwd })));

    // Score sequentially: test suites often share ports / caches.
    for (const c of cands) {
      c.diff = worktreePatch(c.wt.dir, c.wt.baseSha);
      if (!c.diff.files.length) {
        c.disqualified = 'no changes';
        onEvent({ type: 'scored', candidate: c.name, disqualified: c.disqualified });
        continue;
      }
      const r = await runSandboxedAsync(check, { cwd: c.wt.dir, timeout: checkTimeoutMs, env: { ...process.env, CI: '1', TERM: 'dumb' } });
      const parsed = parseTestOutput(`${r.stdout}\n${r.stderr}`);
      c.check = { exitCode: r.exitCode, passed: parsed.passed.length, failed: parsed.failed.length, tail: `${r.stdout}\n${r.stderr}`.trim().slice(-1500) };
      onEvent({ type: 'scored', candidate: c.name, exitCode: r.exitCode, passed: c.check.passed, failed: c.check.failed, added: c.diff.added, removed: c.diff.removed });
    }

    // Cross-critique only candidates that already pass: tests decide, the
    // review breaks ties. Reviewer = next candidate's model (round-robin).
    if (critique) {
      const passing = cands.filter((c) => !c.disqualified && c.check?.exitCode === 0);
      if (passing.length > 1) {
        await Promise.all(passing.map(async (c) => {
          const reviewer = cands[(c.index + 1) % cands.length].model;
          try {
            c.critique = { ...(await critiqueDiff({ task, patch: c.diff.patch, model: reviewer, createStream, signal })), reviewer };
          } catch (e) {
            c.critique = { severity: 1, issues: [], verdict: `critic failed: ${e?.message || e}`, reviewer };
          }
          onEvent({ type: 'critique', candidate: c.name, reviewer, severity: c.critique.severity, issues: c.critique.issues });
        }));
      }
    }

    const ranked = rankCandidates(cands);
    const best = ranked[0];
    const winner = best && !best.disqualified && best.check?.exitCode === 0 ? best : null;
    let merge = null;
    if (winner && apply) {
      // mergeTask, not applyPatchToRoot: it checkpoints the touched files and
      // removes the worktree, so the teardown below has nothing left to do.
      try {
        merge = await mergeTask(winner.taskId, 'apply');
      } catch (e) {
        merge = { applied: false, reason: e?.message || String(e) };
      }
    }
    return {
      winner: winner ? winner.name : null,
      merged: !!merge?.applied,
      mergeError: merge && !merge.applied ? merge.reason : undefined,
      patch: winner && !apply ? winner.diff.patch : undefined,
      ranking: ranked.map((c) => ({
        name: c.name,
        model: c.model,
        hint: c.hint || '(none)',
        disqualified: c.disqualified || null,
        exitCode: c.check?.exitCode ?? null,
        passed: c.check?.passed ?? 0,
        failed: c.check?.failed ?? 0,
        added: c.diff?.added ?? 0,
        removed: c.diff?.removed ?? 0,
        costUsd: c.costUsd ?? 0,
        error: c.error || null,
        summary: c.summary || '',
        critique: c.critique || null,
      })),
    };
  } finally {
    // Discard whatever the primitive still owns: every candidate except one
    // that was merged. This is the same path a teammate's worktree takes, so a
    // leaked worktree is now impossible rather than merely unlikely.
    for (const c of cands) {
      if (!c.taskId) continue;
      try { await mergeTask(c.taskId, 'discard'); } catch { /* already merged or gone */ }
    }
  }
}

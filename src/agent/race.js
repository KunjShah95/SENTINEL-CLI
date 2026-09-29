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
 */
import { runAgentTurnInner } from './loop.js';
import { createWorktree, worktreePatch, applyPatchToRoot, removeWorktree } from './worktree.js';
import { teammatePermission } from './team.js';
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

/** Pure ranking so it can be unit-tested. Higher is better. */
export function rankCandidates(cands) {
  const key = (c) => [
    c.disqualified ? 0 : 1,
    c.check?.exitCode === 0 ? 1 : 0,
    (c.check?.passed ?? 0) - (c.check?.failed ?? 0),
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

async function runCandidate(c, { task, createStream, allowBash, onEvent, signal }) {
  const brief = [
    task,
    c.hint ? `\nApproach: ${c.hint}` : '',
    '\nYou work alone in an isolated copy of the repository. Make the change, verify it, then reply with a short summary.',
  ].join('');
  const leadAllowAll = new Set(allowBash ? ['bash', 'runTests'] : []);
  let text = '';
  try {
    for await (const ev of runAgentTurnInner({
      history: [{ id: `race_${c.index}`, role: 'user', parts: [{ type: 'text', text: brief }] }],
      mode: 'BUILD',
      model: c.model,
      createStream,
      trajectory: false,
      agentName: c.name,
      workdir: c.wt.dir,
      subagentDepth: 1,
      signal,
      onPermissionRequest: teammatePermission({ leadAllowAll, leadHeadless: false, isolated: true }),
    })) {
      if (ev.event === 'text') text += ev.data.delta;
      else if (ev.event === 'tool_call') onEvent({ type: 'tool', candidate: c.name, tool: ev.data.toolName });
      else if (ev.event === 'finish') c.costUsd = ev.data.costUsd || 0;
      else if (ev.event === 'error') {
        c.error = ev.data.message;
        onEvent({ type: 'error', candidate: c.name, message: ev.data.message });
      }
    }
  } catch (e) {
    c.error = e?.message || String(e);
  }
  c.summary = text.trim().slice(0, 2000);
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
  task, check, n = 3, models, apply = true, allowBash = false,
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
      const wt = createWorktree(name, cwd);
      cands.push({ index: i, name, wt, model: models[i % models.length], hint: APPROACH_HINTS[i % APPROACH_HINTS.length] });
      onEvent({ type: 'start', candidate: name, model: models[i % models.length] });
    }

    await Promise.all(cands.map((c) => runCandidate(c, { task, createStream, allowBash, onEvent, signal })));

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

    const ranked = rankCandidates(cands);
    const best = ranked[0];
    const winner = best && !best.disqualified && best.check?.exitCode === 0 ? best : null;
    let merge = null;
    if (winner && apply) {
      merge = await applyPatchToRoot(winner.wt.root, winner.diff.patch, winner.diff.files);
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
      })),
    };
  } finally {
    for (const c of cands) removeWorktree(c.wt);
  }
}

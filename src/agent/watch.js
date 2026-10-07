/**
 * The standing FDE — a forward-deployed engineer as a presence, not a session.
 *
 * Everything else in `agent/` runs once and ends. An FDE is the opposite: they
 * are there on Tuesday when the thing they shipped on Monday starts failing.
 * This module is that difference, in the smallest form the project can
 * honestly support — a foreground watcher, because "no servers" is a promise
 * the README makes and a daemon would break it.
 *
 * Three pieces, each pure enough to test without a clock or a model:
 *
 *   triggers    what makes the loop wake up: an interval, a command that now
 *               fails, a file that changed, HEAD that moved
 *   steering    a file-backed queue so `sentinel steer` can interrupt work
 *               from another terminal — the deferred "steering queue" item,
 *               and the reason this is a presence rather than a cron job
 *   backoff     a loop that keeps failing must stop burning money, so
 *               consecutive non-progress ticks back off and then give up
 *
 * The engagement budget is the natural ceiling for a standing loop: it is
 * checked before every tick, which is the one guard this feature cannot do
 * without.
 *
 * Each tick is a `task.js` task, so a standing watcher is visible in
 * `sentinel tasks`, counts against the same concurrency cap as everything else,
 * and can be cancelled mid-turn. The judgement stays here: only watch knows what
 * counts as progress.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getWorkdir } from '../shared/tools/workdir.js';
import { relativeStatePath, ensureStateDir } from '../utils/state-dir.js';
import { budgetStatus } from './budget.js';
import { createTask, awaitTask, PERMISSIONS } from './task.js';

export const WATCH_VERSION = '1';
export const STATE_PATH = relativeStatePath('watch-state.json');
export const STEER_PATH = relativeStatePath('steer.jsonl');

/** Give up after this many consecutive ticks that make no progress. */
export const MAX_UNPRODUCTIVE = 5;
export const MAX_BACKOFF_MS = 15 * 60_000;

export const TRIGGER_TYPES = Object.freeze(['interval', 'command', 'file', 'git', 'once']);

export function stateFile(cwd = getWorkdir()) {
  return join(cwd, STATE_PATH);
}

export function steerFile(cwd = getWorkdir()) {
  return join(cwd, STEER_PATH);
}

export function createWatchState() {
  return {
    version: WATCH_VERSION,
    ticks: 0,
    productive: 0,
    consecutiveUnproductive: 0,
    lastTickAt: null,
    lastTriggers: [],
    lastRunId: null,
    gitSha: null,
    fileMtimes: {},
  };
}

export function readWatchState(cwd = getWorkdir()) {
  const file = stateFile(cwd);
  if (!existsSync(file)) return createWatchState();
  try {
    const d = JSON.parse(readFileSync(file, 'utf-8'));
    return { ...createWatchState(), ...(d && typeof d === 'object' ? d : {}) };
  } catch {
    return createWatchState();
  }
}

export function writeWatchState(state, cwd = getWorkdir()) {
  const doc = { ...createWatchState(), ...state, version: WATCH_VERSION };
  ensureStateDir(cwd);
  writeFileSync(stateFile(cwd), JSON.stringify(doc, null, 2), 'utf-8');
  return doc;
}

// ── Triggers ─────────────────────────────────────────────────────────────
// Each check is a pure predicate over injected facts, so the whole trigger
// layer is testable without a clock, a shell, or a model.

const headSha = (cwd) => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

const mtime = (cwd, rel) => {
  try {
    return statSync(join(cwd, rel)).mtimeMs;
  } catch {
    return null;
  }
};

/** Run a trigger's command. Returns null when it could not be evaluated. */
export function runTriggerCommand(command, { cwd, timeoutMs = 120_000 } = {}) {
  try {
    execFileSync(command, { cwd, encoding: 'utf8', shell: true, timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] });
    return { exitCode: 0 };
  } catch (e) {
    return { exitCode: typeof e.status === 'number' ? e.status : 1 };
  }
}

/**
 * Which triggers fire now.
 *
 * @param triggers array of trigger descriptors
 * @param facts    { now, lastTickAt, lastGitSha, fileMtimes, runCommand }
 * @returns {{ fired: string[], results: Record<string, unknown> }}
 */
export function checkTriggers(triggers, facts) {
  const {
    now = Date.now(),
    lastTickAt = null,
    lastGitSha = null,
    fileMtimes = {},
    cwd = process.cwd(),
    run = runTriggerCommand,
  } = facts || {};
  const fired = [];
  const results = {};

  for (const t of triggers || []) {
    if (!t || !TRIGGER_TYPES.includes(t.type)) continue;
    switch (t.type) {
    case 'once':
      if (!t.firedOnce) { fired.push('once'); results.once = true; }
      break;
    case 'interval': {
      const every = Math.max(1000, Number(t.everyMs) || 300_000);
      if (lastTickAt == null || now - lastTickAt >= every) {
        fired.push('interval');
        results.interval = every;
      }
      break;
    }
    case 'command': {
      if (!t.command) break;
      const r = run(t.command, { cwd, timeoutMs: t.timeoutMs });
      // Default: fire when the command FAILS. That is the FDE case — you
      // are woken by breakage, not by routine green.
      const wantFailure = t.when !== 'always';
      const bad = r && r.exitCode !== 0;
      if (wantFailure ? bad : true) {
        fired.push('command');
        results.command = { command: t.command, exitCode: r?.exitCode };
      }
      break;
    }
    case 'file': {
      if (!t.path) break;
      const cur = mtime(cwd, t.path);
      if (cur != null && cur !== (fileMtimes[t.path] ?? null)) {
        fired.push('file');
        results.file = { path: t.path, mtime: cur };
      }
      break;
    }
    case 'git': {
      const cur = headSha(cwd);
      if (cur && lastGitSha && cur !== lastGitSha) {
        fired.push('git');
        results.git = { from: lastGitSha.slice(0, 8), to: cur.slice(0, 8) };
      }
      break;
    }
    default:
      break;
    }
  }
  return { fired, results };
}

// ── Backoff ──────────────────────────────────────────────────────────────

/**
 * How long to wait after a tick that did not make progress. Exponential, with
 * the ceiling that stops a failing loop from hammering an API all afternoon.
 * A productive tick resets to zero.
 */
export function nextDelay(consecutiveUnproductive, baseMs = 60_000) {
  if (consecutiveUnproductive <= 0) return baseMs;
  const exp = Math.min(consecutiveUnproductive - 1, 10);
  return Math.min(baseMs * 2 ** exp, MAX_BACKOFF_MS);
}

export function shouldStop(state, { maxTicks = 0, maxUnproductive = MAX_UNPRODUCTIVE } = {}) {
  if (maxTicks > 0 && state.ticks >= maxTicks) return 'max-ticks';
  if (state.consecutiveUnproductive >= maxUnproductive) return 'no-progress';
  return null;
}

// ── Steering (#16) ───────────────────────────────────────────────────────

/** Append a steering instruction. Usable from another terminal mid-turn. */
export function steer(text, cwd = getWorkdir()) {
  const t = String(text || '').trim();
  if (!t) throw new Error('steering text is required');
  ensureStateDir(cwd);
  appendFileSync(steerFile(cwd), JSON.stringify({ ts: new Date().toISOString(), text: t }) + '\n', 'utf-8');
  return t;
}

/** Read and clear the queue. A torn final line is expected after a crash. */
export function drainSteering(cwd = getWorkdir()) {
  const file = steerFile(cwd);
  if (!existsSync(file)) return [];
  const out = [];
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r?.text) out.push(r);
    } catch { /* torn line */ }
  }
  try { writeFileSync(file, '', 'utf-8'); } catch { /* best-effort */ }
  return out;
}

export function pendingSteering(cwd = getWorkdir()) {
  const file = steerFile(cwd);
  if (!existsSync(file)) return 0;
  return readFileSync(file, 'utf-8').split('\n').filter((l) => l.trim()).length;
}

/** The task for a tick, with anything the operator steered folded in. */
export function buildTask(task, steering = []) {
  if (!steering.length) return task;
  const lines = steering.map((s, i) => `${i + 1}. ${s.text}`);
  return [
    task,
    '',
    'The operator added these instructions since the last tick. They take priority over the task above:',
    ...lines,
  ].join('\n');
}

// ── The loop ─────────────────────────────────────────────────────────────

/**
 * Run the watcher.
 *
 * `runTurn` is injected (the loop generator) to avoid an import cycle with
 * loop.js, exactly as team.js does. `onEvent` receives the agent's events so a
 * CLI can print them and a TUI could render them.
 *
 * @returns {Promise<{ reason: string, state: object, ticks: Array }>}
 */
export async function runWatcher({
  task,
  triggers = [{ type: 'interval', everyMs: 300_000 }],
  goal = null,
  outcome = null,
  cwd = getWorkdir(),
  runTurn,
  createStream,
  onEvent = () => {},
  maxTicks = 0,
  maxUnproductive = MAX_UNPRODUCTIVE,
  baseDelayMs = 60_000,
  signal,
  agentName = 'watch',
  /**
   * The operator's own permission callback for a tick, or undefined for
   * headless (nobody to prompt).
   *
   * This used to be a parameter named `permission` defaulting to `true`, which
   * was wrong twice over: `cli/main.js` passes `onPermissionRequest`, so the
   * value it supplied was silently dropped, and the `true` default would have
   * been called as a function the moment anything actually used it.
   */
  onPermissionRequest,
}) {
  if (!String(task || '').trim()) throw new Error('watch needs a task');
  if (typeof runTurn !== 'function') throw new Error('watch needs a runTurn generator');

  const state = readWatchState(cwd);
  const ticks = [];
  const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); signal?.addEventListener?.('abort', () => { clearTimeout(t); r(); }, { once: true }); });
  let onceFired = false;

  for (;;) {
    if (signal?.aborted) return { reason: 'aborted', state, ticks };

    // A standing loop that ignores its budget is just a way to spend money
    // quietly. The engagement ceiling is checked before every single wakeup.
    const status = budgetStatus(cwd);
    if (status.budget.corrupt) onEvent({ type: 'note', text: 'watch state: budget file unreadable, treating as no budget' });
    if (!status.mayContinue) {
      onEvent({ type: 'stop', text: status.stopReason });
      return { reason: 'budget', state, ticks };
    }

    const facts = {
      now: Date.now(),
      lastTickAt: state.lastTickAt ? new Date(state.lastTickAt).getTime() : null,
      lastGitSha: state.gitSha,
      fileMtimes: state.fileMtimes,
      cwd,
    };
    const { fired: allFired, results } = checkTriggers(triggers, facts);
    const fired = onceFired ? allFired.filter((f) => f !== 'once') : allFired;
    if (!fired.length) {
      onEvent({ type: 'idle', text: 'no trigger fired' });
      // Floor the idle poll so a small baseDelay cannot turn this into a hot
      // spin that burns CPU while the trigger never fires.
      await sleep(Math.max(1000, Math.min(baseDelayMs, 30_000)));
      continue;
    }
    if (fired.includes('once')) onceFired = true;

    // Steering is drained before the work, not after: an operator who steers
    // mid-tick wants the NEXT tick changed, and this is where that lands.
    const steering = drainSteering(cwd);
    const turnTask = buildTask(task, steering);
    onEvent({ type: 'tick', index: state.ticks + 1, fired, results, steering: steering.length });

    const tick = { index: state.ticks + 1, fired, steering: steering.map((s) => s.text), at: new Date().toISOString() };
    let progressed = false;
    let text = '';
    // A tick is a task. Same primitive as a teammate or a race candidate: it
    // gets an id, a registry entry, a cancellation path and a budget-counted
    // place in the concurrency cap. What stays here is watch's own judgement —
    // whether the tick made progress — which is the whole point of the feature.
    const { id: tickId, rejected } = createTask({
      kind: 'agent',
      name: `watch-${state.ticks + 1}`,
      owner: 'watch',
      prompt: turnTask,
      mode: 'BUILD',
      permission: PERMISSIONS.INHERIT,
      isolation: 'none',
      cwd,
      meta: { tick: state.ticks + 1, fired, steering: steering.length, headless: !onPermissionRequest },
      run: async ({ signal: tickSignal }) => {
        try {
          for await (const ev of runTurn({
            history: [{ id: `watch_${state.ticks + 1}_${Date.now()}`, role: 'user', parts: [{ type: 'text', text: turnTask }] }],
            mode: 'BUILD',
            goal,
            outcome,
            createStream,
            agentName,
            workdir: cwd,
            engagement: true,
            // The watcher's own signal, so `sentinel tasks --cancel` reaches a
            // tick in flight rather than only the loop between ticks.
            signal: tickSignal,
            onPermissionRequest,
          })) {
            if (ev.event === 'text') text += ev.data.delta;
            if (ev.event === 'goal' && ev.data?.ok) progressed = true;
            if (ev.event === 'finish') tick.costUsd = ev.data?.costUsd;
            onEvent({ type: 'agent', event: ev });
          }
        } catch (e) {
          tick.error = String(e?.message || e);
          onEvent({ type: 'error', text: tick.error });
        }
        return { summary: text, progressed, costUsd: tick.costUsd ?? 0 };
      },
    });

    if (rejected) {
      // Refused admission is not a crash: a watcher that is already running the
      // configured number of ticks should say so and back off, not throw.
      tick.error = rejected;
      tick.progressed = false;
      tick.summary = '';
      tick.rejected = true;
      ticks.push(tick);
      state.ticks++;
      state.consecutiveUnproductive++;
      state.lastTickAt = tick.at;
      onEvent({ type: 'tick-end', tick, delay: nextDelay(state.consecutiveUnproductive, baseDelayMs) });
      if (shouldStop(state, { maxTicks, maxUnproductive })) {
        onEvent({ type: 'stop', text: `stopping: ${tick.error}` });
        return { reason: 'no-progress', state, ticks };
      }
      await sleep(nextDelay(state.consecutiveUnproductive, baseDelayMs));
      continue;
    }

    await awaitTask(tickId);
    void tickId;

    // "Progress" is deliberately weak: the goal was met, or the agent wrote
    // something. A tick that only read files has not moved the engagement, and
    // backing off there is the point of the whole mechanism.
    if (!progressed) progressed = /\b(wrote|created|added|updated|fixed|renamed)\b/i.test(text);
    tick.progressed = progressed;
    tick.summary = text.trim().slice(0, 400);
    ticks.push(tick);

    state.ticks++;
    if (progressed) { state.productive++; state.consecutiveUnproductive = 0; }
    else state.consecutiveUnproductive++;
    state.lastTickAt = tick.at;
    state.lastTriggers = fired;
    state.gitSha = headSha(cwd);
    for (const t of triggers) if (t.type === 'file' && t.path) state.fileMtimes[t.path] = mtime(cwd, t.path);
    writeWatchState(state, cwd);

    onEvent({ type: 'tick-end', tick, delay: nextDelay(state.consecutiveUnproductive, baseDelayMs) });

    const stop = shouldStop(state, { maxTicks, maxUnproductive });
    if (stop) {
      onEvent({ type: 'stop', text: `stopping: ${stop}` });
      return { reason: stop, state, ticks };
    }
    if (signal?.aborted) return { reason: 'aborted', state, ticks };
    await sleep(nextDelay(state.consecutiveUnproductive, baseDelayMs));
  }
}

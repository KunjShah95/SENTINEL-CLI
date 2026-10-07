/**
 * Handoff — the artifact an engagement is actually judged on.
 *
 * A forward-deployed engineer is measured by what the customer's team can do
 * without them afterwards. That deliverable is a runbook, not a diff, and the
 * raw material for it has been sitting in `.sentinel/trajectories/*.jsonl`
 * this whole time, write-only.
 *
 * The most valuable section is the one nobody writes down: what was tried and
 * rejected. "We tried patching the parser incrementally and it broke on nested
 * arrays, so rewrite it" is institutional knowledge. Losing it means the next
 * person spends two days rediscovering it.
 *
 * Everything here is mechanical — no model, no API key, deterministic from the
 * recording. The model already ran once; asking it to summarize its own run
 * again is how confident, unverifiable prose gets into a runbook.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadTrajectory, listTrajectories } from './replay.js';
import { commandShape } from './risk-ledger.js';
import { getWorkdir } from '../shared/tools/workdir.js';
import { FILE_TOOLS, SHELL_TOOLS } from '../shared/tool-taxonomy.js';

// Local sets, so the hot loops below do not rebuild one per call. The arrays
// themselves come from the taxonomy — the copies are derived, not authored.
const WRITE_SET = new Set(FILE_TOOLS);
const SHELL_SET = new Set(SHELL_TOOLS);

export const HANDOFF_VERSION = '1';

/** A tool call repeated more than this is a dead end, not a strategy. */
export const PERSISTENCE_LIMIT = 3;

const parseData = (d) => {
  if (typeof d !== 'string') return d;
  try { return JSON.parse(d); } catch { return d; }
};

function textOf(input) {
  if (!input) return '';
  if (typeof input === 'string') return input;
  return input.command || input.path || input.pattern || input.filePath || input.prompt || '';
}

/** One recorded call with its outcome, in order. */
function readCalls(events) {
  const calls = [];
  const byId = new Map();
  for (const ev of events) {
    const data = parseData(ev.data);
    if (ev.event === 'tool_call') {
      const call = {
        id: data?.toolCallId,
        name: data?.toolName,
        input: data?.input,
        shape: SHELL_SET.has(data?.toolName) ? commandShape(data?.input?.command) : null,
        ok: null,
        output: null,
      };
      calls.push(call);
      byId.set(call.id, call);
    } else if (ev.event === 'tool_result') {
      const call = byId.get(data?.toolCallId);
      if (!call) continue;
      call.ok = !data?.error;
      call.output = data?.error ? String(data.error) : null;
    }
  }
  return calls;
}

function finalText(events) {
  const parts = [];
  for (const ev of events) {
    if (ev.event !== 'text') continue;
    const data = parseData(ev.data);
    const chunk = data?.delta ?? data?.text;
    if (typeof chunk === 'string') parts.push(chunk);
  }
  return parts.join('').trim();
}

/**
 * Navigation calls are not attempts. Everything else is, including `grep` —
 * running the same search three times is a real dead end, and dropping it
 * because it "reads" something would hide exactly the pattern worth handing on.
 */
const NAVIGATION_TOOLS = new Set(['readFile', 'listDirectory', 'glob']);

/** A coarse signature for non-shell tools, so `grep foo` ≠ `grep bar`. */
function toolShape(name, input) {
  if (!input) return name;
  const primary = input.pattern ?? input.path ?? input.filePath ?? input.file_path ?? input.query;
  if (!primary) return name;
  return `${name} ${String(primary).slice(0, 60)}`;
}

/** Collapse repeated calls to the same shape into one "we tried this N times". */
function aggregateAttempts(calls) {
  const groups = new Map();
  for (const c of calls) {
    if (NAVIGATION_TOOLS.has(c.name)) continue;
    const key = c.shape ? `${c.name}:${c.shape}` : `${c.name}:${toolShape(c.name, c.input)}`;
    const g = groups.get(key) || { name: c.name, shape: c.shape, total: 0, failed: 0, files: new Set(), example: textOf(c.input) };
    g.total++;
    if (c.ok === false) g.failed++;
    if (WRITE_SET.has(c.name) && c.ok) {
      const p = c.input?.path || (c.input?.operations || []).map((o) => o?.filePath).find(Boolean);
      if (p) g.files.add(String(p));
    }
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, files: [...g.files] }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/** Commands that ran and exited clean: the evidence the run actually rests on. */
function verifiedCommands(calls) {
  const out = [];
  for (const c of calls) {
    if (!SHELL_SET.has(c.name) || c.ok !== true) continue;
    const cmd = textOf(c.input);
    if (!cmd) continue;
    if (!out.some((v) => v.command === cmd)) out.push({ command: cmd, tool: c.name });
  }
  return out;
}

/**
 * Claims that were not actually backed by a passing command, or that were made
 * before a later failure. These are the sentences a reader must not trust.
 */
function unverifiedClaims(summary) {
  return (summary.receipts || [])
    .filter((r) => !r.endsWith(':supported'))
    .map((r) => {
      const [kind, status] = r.split(':');
      return { kind, status, why: CLAIM_WHY[status] || 'no passing command backs this' };
    });
}

const CLAIM_WHY = {
  stale: 'it passed, but files changed afterwards',
  contradicted: 'the latest matching command failed',
  unsupported: 'no matching command ever ran',
};

/**
 * Build the runbook from one recorded run.
 *
 * @param {string} fileOrId trajectory id, filename, or full path
 */
export function buildHandoff(fileOrId, { cwd = getWorkdir() } = {}) {
  const rec = loadTrajectory(fileOrId, cwd);
  const { summary, events, runId, file } = rec;
  const calls = readCalls(events);
  const attempts = aggregateAttempts(calls);
  const verified = verifiedCommands(calls);
  const claims = unverifiedClaims(summary);
  const deadEnds = attempts.filter((a) => a.failed > 0 || a.total >= PERSISTENCE_LIMIT);
  const fragile = [];
  if (summary.errors.length) fragile.push(`The run ended with ${summary.errors.length} error(s): ${summary.errors[0]}`);
  if (!summary.finished) fragile.push('The run did not finish — it stopped before a clean exit');
  if (claims.length) fragile.push(`${claims.length} claim(s) in the final answer were not supported by a passing command`);
  if (!verified.length) fragile.push('No command exited 0, so nothing in this run is verified');
  if (summary.goal) {
    const judged = events.find((e) => e.event === 'goal');
    const v = judged ? parseData(judged.data) : null;
    if (v && !v.ok) fragile.push(`The goal condition was not met: ${v.reason || 'no reason given'}`);
  }

  return {
    version: HANDOFF_VERSION,
    runId,
    file,
    generatedAt: new Date().toISOString(),
    prompt: summary.prompt,
    goal: summary.goal || null,
    mode: summary.mode || null,
    model: summary.model || null,
    finished: summary.finished,
    costUsd: summary.costUsd,
    changed: summary.files,
    verified,
    deadEnds,
    claims,
    fragile,
    finalText: finalText(events),
  };
}

/** The runbook a customer team reads. Deliberately short, and honest about holes. */
export function renderRunbook(h) {
  const L = [];
  L.push(`# Handoff: ${h.prompt ? oneLine(h.prompt) : '(no recorded prompt)'}`);
  L.push('');
  L.push(`> Generated by \`sentinel handoff\` from run \`${h.runId}\` (v${h.version}). Derived from the recorded trajectory — no model, no guessing.`);
  L.push('');
  L.push(`- **Run**: ${h.mode || 'unknown mode'} · ${h.model || 'unknown model'} · $${(h.costUsd || 0).toFixed(4)} · ${h.finished ? 'finished' : 'did not finish'}`);
  if (h.goal) L.push(`- **Goal**: ${h.goal}`);
  L.push(`- **Recorded**: ${h.generatedAt}`);
  L.push('');

  L.push('## What changed');
  L.push('');
  if (h.changed.length) for (const f of h.changed) L.push(`- \`${f}\``);
  else L.push('_No files were written. This run was read-only or exploratory._');
  L.push('');

  L.push('## What was verified');
  L.push('');
  if (h.verified.length) {
    L.push('These commands exited 0. They are the only evidence in this run worth trusting.');
    L.push('');
    for (const v of h.verified) L.push(`- \`${v.command}\``);
  } else {
    L.push('**Nothing was verified.** No command in this run exited 0.');
  }
  L.push('');

  L.push('## What was tried and rejected');
  L.push('');
  if (h.deadEnds.length) {
    L.push('Dead ends. If the next person tries these, they are wasting a day — this is why they did not work.');
    L.push('');
    for (const d of h.deadEnds) {
      const why = d.failed
        ? `${d.failed} of ${d.total} attempt(s) failed`
        : `repeated ${d.total}× without settling`;
      L.push(`- \`${d.shape ? d.shape : d.name}\` — ${why}`);
    }
  } else {
    L.push('_No repeated or failing attempts recorded._');
  }
  L.push('');

  if (h.claims.length) {
    L.push('## Claims to distrust');
    L.push('');
    L.push('The final answer asserted these without a passing command behind them. Do not repeat them unverified.');
    L.push('');
    for (const c of h.claims) L.push(`- **${c.kind}** — ${c.why}`);
    L.push('');
  }

  L.push('## Still fragile');
  L.push('');
  if (h.fragile.length) for (const f of h.fragile) L.push(`- ${f}`);
  else L.push('_Nothing flagged. The run finished, verified, and made no unsupported claims._');
  L.push('');

  L.push('## What a human still has to answer');
  L.push('');
  L.push('- Was the behavior actually correct, or merely verified? A green test does not prove the fix is the right one.');
  L.push('- Does this change hold for the cases nobody tested?');
  L.push('- Who owns this code now, and who gets paged when it breaks?');
  L.push('');
  L.push('---');
  L.push('');
  L.push('Reproduce any of this: `sentinel replay ' + h.runId + '`.');
  L.push('');
  return L.join('\n');
}

const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 120);

/** Handoff-ready runs: ones that recorded a prompt, newest first. */
export function listHandoffs(cwd = getWorkdir(), limit = 20) {
  return listTrajectories(cwd, limit).map((t) => ({
    runId: t.runId,
    prompt: t.summary.prompt,
    mode: t.summary.mode,
    model: t.summary.model,
    finished: t.summary.finished,
    files: t.summary.files.length,
    verified: t.events.some((e) => e.event === 'tool_result' && !parseData(e.data)?.error),
  }));
}

export function handoffFile(cwd = getWorkdir()) {
  return join(cwd, '.sentinel', 'HANDOFF.md');
}

export function readHandoff(cwd = getWorkdir()) {
  const file = handoffFile(cwd);
  return existsSync(file) ? file : null;
}

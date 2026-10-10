/**
 * Engagement budget — spend that survives the process.
 *
 * `cost.js` totals are in-memory, so they vanish when the turn ends and there
 * is no way to answer the only question a non-technical buyer asks: what has
 * this cost so far. `maxCostUsd` guards a single turn, which is a different
 * and much weaker promise.
 *
 * An engagement is the FDE-shaped unit: a budget, a deadline, and a stop
 * condition, persisted per project so a week's work is still measured on
 * Friday. The loop checks it after every model call and stops hard at the
 * ceiling rather than letting one more call land first.
 *
 *   .sentinel/budget.json   { budgetUsd, deadlineAt, stopCondition, startedAt }
 *   .sentinel/spend.jsonl   one line per completed turn, appended
 *
 * The spend log is append-only JSONL for the same reason trajectories are:
 * it survives a crash mid-write, and it can be tailed without loading it all.
 *
 * ## Per-connector caps
 *
 * A single engagement ceiling answers "is this too expensive" but not "which
 * key is burning it". With two connectors configured, a runaway loop on an
 * expensive one will spend the whole budget on a fraction of the turns, and the
 * total says nothing about which credential to revoke. So spend rows carry the
 * connector they belonged to, and a cap can be set per connector independently.
 *
 * These are independent ceilings, not a partition of the total: capping Groq at
 * $5 does not reserve $5 for OpenAI. The engagement budget still applies on top.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getWorkdir } from '../shared/tools/workdir.js';
import { relativeStatePath, ensureStateDir } from '../utils/state-dir.js';
import { CONNECTOR_IDS, getConnectorKeyPrefix } from '../shared/connectors/registry.js';

export const BUDGET_VERSION = '1';
export const BUDGET_PATH = relativeStatePath('budget.json');
export const SPEND_PATH = relativeStatePath('spend.jsonl');

export function budgetFile(cwd = getWorkdir()) {
  return join(cwd, BUDGET_PATH);
}

export function spendFile(cwd = getWorkdir()) {
  return join(cwd, SPEND_PATH);
}

const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

/** Parse a deadline from an ISO string or a relative duration ("2h", "45m", "3d"). */
export function parseDeadline(input, now = Date.now()) {
  if (input == null || input === '') return null;
  const s = String(input).trim();
  const rel = /^(\d+(?:\.\d+)?)\s*(m|min|mins|h|hr|hrs|d|day|days)$/i.exec(s);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2][0].toLowerCase();
    const ms = unit === 'm' ? n * 60_000 : unit === 'h' ? n * 3_600_000 : n * 86_400_000;
    return new Date(now + ms).toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function readBudget(cwd = getWorkdir()) {
  const file = budgetFile(cwd);
  if (!existsSync(file)) return { version: BUDGET_VERSION, budgetUsd: 0, deadlineAt: null, stopCondition: null, startedAt: null, connectorCaps: {} };
  try {
    const d = JSON.parse(readFileSync(file, 'utf-8'));
    if (!d || typeof d !== 'object') throw new Error('bad shape');
    return {
      version: d.version || BUDGET_VERSION,
      budgetUsd: num(d.budgetUsd),
      deadlineAt: d.deadlineAt || null,
      stopCondition: d.stopCondition ? String(d.stopCondition) : null,
      startedAt: d.startedAt || null,
      connectorCaps: readCaps(d.connectorCaps),
    };
  } catch {
    // A corrupt budget must not silently become "no budget": an unreadable
    // ceiling is treated as absent, and `readBudget` reports it as such so
    // callers can say so rather than pretending the spend was free.
    return { version: BUDGET_VERSION, budgetUsd: 0, deadlineAt: null, stopCondition: null, startedAt: null, connectorCaps: {}, corrupt: true };
  }
}

/**
 * Connector caps, normalised to `{ connectorId: usd }`.
 *
 * Unknown ids are dropped rather than kept: a cap for a connector that no
 * longer exists can never be reached, so reporting it as an active ceiling
 * would be a limit the user set and cannot observe.
 */
function readCaps(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [id, value] of Object.entries(raw)) {
    const usd = num(value);
    if (usd > 0 && CONNECTOR_IDS.includes(id)) out[id] = usd;
  }
  return out;
}

export function writeBudget(budget, cwd = getWorkdir()) {
  const clean = {
    version: BUDGET_VERSION,
    budgetUsd: num(budget.budgetUsd),
    deadlineAt: budget.deadlineAt || null,
    stopCondition: budget.stopCondition ? String(budget.stopCondition) : null,
    startedAt: budget.startedAt || new Date().toISOString(),
    connectorCaps: readCaps(budget.connectorCaps),
  };
  ensureStateDir(cwd);
  writeFileSync(budgetFile(cwd), JSON.stringify(clean, null, 2), 'utf-8');
  return clean;
}

export function clearBudget(cwd = getWorkdir()) {
  if (existsSync(budgetFile(cwd))) writeFileSync(budgetFile(cwd), JSON.stringify({ version: BUDGET_VERSION, budgetUsd: 0, deadlineAt: null, stopCondition: null }), 'utf-8');
  return true;
}

/** Append one completed turn's spend. Best-effort: never break a turn over it. */
export function recordSpend({ usd = 0, inputTokens = 0, outputTokens = 0, model, connector, runId, prompt }, cwd = getWorkdir()) {
  try {
    ensureStateDir(cwd);
    appendFileSync(spendFile(cwd), JSON.stringify({
      ts: new Date().toISOString(),
      usd: Number(usd) || 0,
      inputTokens: inputTokens || 0,
      outputTokens: outputTokens || 0,
      model: model || null,
      // Denormalised onto the record so a per-connector cap is a grouping over
      // history rather than a re-resolution that would change meaning if the
      // registry later maps this model id to a different connector. Records
      // written before this field simply group under `null`.
      connector: connector || inferConnector(model),
      runId: runId || null,
      prompt: prompt ? String(prompt).replace(/\s+/g, ' ').slice(0, 160) : null,
    }) + '\n', 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/** Which connector a spend record belonged to, for rows that predate the field. */
function inferConnector(model) {
  if (!model || typeof model !== 'string') return null;
  // Reads the registry directly rather than inferProviderFromModelId, which
  // would drag the model catalog into a budget read. A budget check runs on
  // every turn and needs one prefix, not a discovery pipeline.
  if (model.startsWith('accounts/fireworks/')) return 'fireworks';
  for (const id of CONNECTOR_IDS) {
    const prefix = getConnectorKeyPrefix(id);
    if (prefix && model.startsWith(prefix)) return id;
  }
  return null;
}

export function readSpend(cwd = getWorkdir()) {
  const file = spendFile(cwd);
  if (!existsSync(file)) return [];
  const out = [];
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* a torn final line is expected after a crash */ }
  }
  return out;
}

/** Lifetime spend for this project, optionally since a timestamp. */
export function totalSpend(cwd = getWorkdir(), { since = null } = {}) {
  const rows = readSpend(cwd);
  // `>=` not `>`: a turn that finishes in the same millisecond the budget was
  // set is still part of the engagement. Under-counting spend is the wrong
  // direction for a ceiling to fail in.
  const filtered = since ? rows.filter((r) => r.ts >= since) : rows;
  return {
    usd: filtered.reduce((n, r) => n + (Number(r.usd) || 0), 0),
    inputTokens: filtered.reduce((n, r) => n + (r.inputTokens || 0), 0),
    outputTokens: filtered.reduce((n, r) => n + (r.outputTokens || 0), 0),
    turns: filtered.length,
  };
}

/**
 * The full picture: budget, spend so far, deadline, and whether work may
 * continue. `status` is the one word a reader needs.
 */
export function budgetStatus(cwd = getWorkdir(), { now = Date.now() } = {}) {
  const budget = readBudget(cwd);
  const spend = totalSpend(cwd, { since: budget.startedAt });
  const lifetime = totalSpend(cwd);
  const remainingUsd = budget.budgetUsd ? Math.max(0, budget.budgetUsd - spend.usd) : Infinity;
  const deadlineMs = budget.deadlineAt ? new Date(budget.deadlineAt).getTime() - now : Infinity;
  const overBudget = budget.budgetUsd > 0 && spend.usd >= budget.budgetUsd;
  const pastDeadline = budget.deadlineAt && deadlineMs <= 0;
  let status = 'unbounded';
  if (overBudget) status = 'over-budget';
  else if (pastDeadline) status = 'past-deadline';
  else if (budget.budgetUsd > 0 || budget.deadlineAt) status = 'active';
  return {
    budget,
    spend,
    lifetime,
    remainingUsd,
    deadlineMs,
    used: budget.budgetUsd > 0 ? spend.usd / budget.budgetUsd : 0,
    status,
    mayContinue: status === 'unbounded' || status === 'active',
    stopReason: overBudget
      ? `Engagement budget exhausted: $${spend.usd.toFixed(4)} of $${budget.budgetUsd.toFixed(2)}.`
      : pastDeadline
        ? `Engagement deadline passed (${budget.deadlineAt}).`
        : null,
  };
}

/**
 * Spend grouped by connector, with any per-connector cap applied.
 *
 * Rows written before spend records carried a connector group under `null` and
 * are reported as "unknown" rather than being silently dropped — under-counting
 * is the wrong direction for a ceiling to fail in.
 *
 * @returns {{rows: Array, byConnector: Object, blocked: string[]}}
 */
export function connectorSpend(cwd = getWorkdir(), { since = null } = {}) {
  const budget = readBudget(cwd);
  const rows = readSpend(cwd).filter((r) => !since || r.ts >= since);
  const caps = budget.connectorCaps || {};

  const byConnector = {};
  for (const id of CONNECTOR_IDS) {
    if (caps[id] > 0) byConnector[id] = { usd: 0, turns: 0, capUsd: caps[id], exceeded: false };
  }
  for (const r of rows) {
    const id = r.connector || 'unknown';
    if (!byConnector[id]) byConnector[id] = { usd: 0, turns: 0, capUsd: caps[id] || 0, exceeded: false };
    byConnector[id].usd += Number(r.usd) || 0;
    byConnector[id].turns += 1;
  }

  const blocked = [];
  for (const [id, row] of Object.entries(byConnector)) {
    if (row.capUsd > 0 && row.usd >= row.capUsd) {
      row.exceeded = true;
      blocked.push(id);
    }
  }
  return { rows: blocked, byConnector, blocked };
}

/** Set or clear one connector's cap. Zero or null clears it. */
export function setConnectorCap(connectorId, usd, cwd = getWorkdir()) {
  const budget = readBudget(cwd);
  if (!budget.connectorCaps || typeof budget.connectorCaps !== 'object') budget.connectorCaps = {};
  if (!usd || usd <= 0) delete budget.connectorCaps[connectorId];
  else budget.connectorCaps[connectorId] = Number(usd);
  writeBudget(budget, cwd);
  return budget.connectorCaps[connectorId] ?? null;
}

/**
 * May this turn continue, given the engagement budget and the connector caps?
 *
 * Checked after every model call, alongside `budgetStatus`. A capped connector
 * stops the turn the same way the engagement ceiling does rather than letting
 * one more call land first.
 */
export function connectorGate(connectorId, cwd = getWorkdir()) {
  const { byConnector } = connectorSpend(cwd);
  const row = byConnector[connectorId];
  if (!row || !row.capUsd) return { allowed: true, reason: null, spentUsd: row?.usd || 0, capUsd: 0 };
  if (row.usd < row.capUsd) return { allowed: true, reason: null, spentUsd: row.usd, capUsd: row.capUsd };
  return {
    allowed: false,
    spentUsd: row.usd,
    capUsd: row.capUsd,
    reason: `Connector cap reached for ${connectorId}: $${row.usd.toFixed(4)} of $${row.capUsd.toFixed(2)}. `
      + 'Raise it with `sentinel budget --connector ' + connectorId + ' --usd <n>`, or switch model.',
  };
}

/** One line a non-technical buyer can read: $12.40 of $25.00, 3 days left. */
export function formatStatus(s, { now = Date.now() } = {}) {
  const parts = [];
  if (s.budget.budgetUsd > 0) {
    parts.push(`$${s.spend.usd.toFixed(2)} of $${s.budget.budgetUsd.toFixed(2)} (${Math.round(s.used * 100)}%)`);
  } else {
    parts.push(`$${s.spend.usd.toFixed(2)} (no budget set)`);
  }
  if (s.budget.deadlineAt) {
    const ms = s.deadlineMs;
    if (ms <= 0) parts.push('deadline passed');
    else parts.push(`${formatDuration(ms)} left`);
  }
  if (s.spend.turns) parts.push(`${s.spend.turns} turn${s.spend.turns === 1 ? '' : 's'}`);
  return parts.join(' · ') + (Number.isFinite(now) ? '' : '');
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0m';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/** A burn-down bar, for a terminal. */
export function burnBar(status, width = 24) {
  if (status.budget.budgetUsd <= 0) return '─'.repeat(width);
  const filled = Math.min(width, Math.round(status.used * width));
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

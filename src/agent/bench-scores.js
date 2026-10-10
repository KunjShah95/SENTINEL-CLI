/**
 * Bench-verified model scores.
 *
 * ## The problem this solves
 *
 * The model picker ranks on `CAPABILITY_RANK`, a hardcoded table of id prefixes
 * to made-up numbers. `'claude-opus': 10`, `'gpt-4o': 9`. Nothing measures
 * anything. It says "Claude Opus is better than Mistral Small" by assertion, and
 * it is confidently wrong for any model released after it was written — the
 * default rank for an unknown model is 1, so every new release sorts below the
 * known list until someone remembers to edit this file.
 *
 * SENTINEL already has the evidence. `npm run bench` and `npm run bench:security`
 * measure real task completion against real harnesses. Those numbers are on
 * disk and nothing reads them.
 *
 * ## What a score means here
 *
 * A score is a measurement of *this repository, on this machine, at this commit*.
 * A local 7B model can beat a frontier model on a codebase-shaped task, and
 * which one wins depends on the task. So the score is attached to the model as
 * evidence with its provenance, and never becomes a silent reordering of what
 * `autoSelectBestModel` picks. Benchmarks inform a human choosing from
 * `/models`; they do not make the decision.
 *
 * ## Staleness
 *
 * A score is only worth having while it still describes the code. Scores are
 * stamped with the git HEAD they were measured against and go stale when it
 * moves, at which point the picker shows them as stale rather than dropping
 * them — a stale measurement is still information about the model.
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { getWorkdir } from '../shared/tools/workdir.js';
import { getBareModelId } from '../shared/models/index.js';

/** Where bench results are kept, relative to the project. */
export const SCORES_PATH = '.sentinel/bench-scores.json';

/** A score older than this is shown as stale. */
const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function scoresFile(cwd = getWorkdir()) {
  return join(cwd, SCORES_PATH);
}

/**
 * Current git HEAD, or null when git is unavailable.
 *
 * Never throws and never shells out on the request path more than once — a
 * missing git is normal (tarball install, container without history) and must
 * not make the picker fail.
 */
let headCache;
export function currentHead(cwd = getWorkdir()) {
  if (headCache !== undefined) return headCache;
  try {
    headCache = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd,
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    headCache = null;
  }
  return headCache;
}

/** Read measured scores. Missing or corrupt is normal, not an error. */
export function readScores(cwd = getWorkdir()) {
  const file = scoresFile(cwd);
  if (!existsSync(file)) return { version: 1, head: null, measuredAt: null, models: {} };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.models !== 'object') {
      return { version: 1, head: null, measuredAt: null, models: {} };
    }
    return parsed;
  } catch {
    return { version: 1, head: null, measuredAt: null, models: {} };
  }
}

/**
 * Record a bench result for one model.
 *
 * @param {string} modelId
 * @param {{resolved?: number, toolCalls?: number, security?: number, tasks?: number}} result
 */
export function recordScore(modelId, result, cwd = getWorkdir()) {
  const scores = readScores(cwd);
  const existing = scores.models[modelId] || {};
  scores.models[modelId] = {
    ...existing,
    ...result,
    measuredAt: new Date().toISOString(),
    head: currentHead(cwd),
  };
  scores.version = scores.version || 1;
  mkdirSync(join(cwd, '.sentinel'), { recursive: true });
  writeFileSync(scoresFile(cwd), JSON.stringify(scores, null, 2), 'utf-8');
  return scores.models[modelId];
}

/**
 * The measured evidence for a model, if any.
 *
 * Matches on the bare id so `ollama/qwen3:8b` and `qwen3:8b` find the same
 * measurement — the namespacing is a SENTINEL concern, not a property of the
 * model.
 */
export function scoreFor(modelId, cwd = getWorkdir()) {
  const scores = readScores(cwd);
  const models = scores.models || {};
  const hit = models[modelId] || models[getBareModelId(modelId)];
  if (!hit) return null;

  const age = hit.measuredAt ? Date.now() - new Date(hit.measuredAt).getTime() : Infinity;
  const head = currentHead(cwd);
  const sameCommit = !head || !scores.head || head === scores.head;
  return {
    ...hit,
    stale: !sameCommit || age > STALE_AFTER_MS,
    staleReason: !sameCommit
      ? `measured at ${scores.head || 'an unknown commit'}, now at ${head}`
      : age > STALE_AFTER_MS
        ? `measured ${Math.round(age / (24 * 60 * 60 * 1000))} days ago`
        : null,
  };
}

/**
 * A short badge for the model picker.
 *
 * Only rendered when there is a measurement — the absence of a benchmark is
 * not evidence of a bad model, and printing "unbenchmarked" next to every model
 * would be noise that trains the user to ignore the column.
 */
export function badgeFor(modelId, cwd = getWorkdir()) {
  const score = scoreFor(modelId, cwd);
  if (!score) return null;
  const parts = [];
  if (Number.isFinite(score.resolved)) parts.push(`${Math.round(score.resolved * 100)}% solved`);
  if (Number.isFinite(score.security)) parts.push(`${Math.round(score.security * 100)}% secure`);
  const text = parts.join(' · ') || 'benchmarked';
  return score.stale ? `${text} (stale)` : text;
}

/** Rows for `sentinel bench --scores`, best first. */
export function scoreTable(cwd = getWorkdir()) {
  const scores = readScores(cwd);
  const head = currentHead(cwd);
  return Object.entries(scores.models || {})
    .map(([modelId, s]) => ({
      model: modelId,
      resolved: s.resolved ?? null,
      security: s.security ?? null,
      tasks: s.tasks ?? null,
      measuredAt: s.measuredAt ?? null,
      stale: (head && scores.head && head !== scores.head)
        || (!s.measuredAt || Date.now() - new Date(s.measuredAt).getTime() > STALE_AFTER_MS),
    }))
    .sort((a, b) => (b.resolved ?? -1) - (a.resolved ?? -1) || a.model.localeCompare(b.model));
}

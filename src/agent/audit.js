/**
 * audit — replay a recorded run and report bound-gaps.
 *
 * A bound-gap is a tool call where the action that ran (`A'`) is not the action
 * that was approved (`A`). Not "the agent did something bad" — a bound agent
 * does that legitimately. The question is narrower and more useful: at the
 * moment of execution, did the thing running correspond to the thing the
 * boundary was asked about?
 *
 * Six classes, because "it did something different" is not one failure:
 *
 *   Scope      ran against more than the grant covered — a different workdir,
 *              a path outside the approved set, a compound command behind an
 *              approved single command.
 *   Argument   same tool, same shape, different arguments — the shape matcher
 *              is deliberately lossy, and this class is what it costs.
 *   Temporal   the grant is stale: the world changed between approval and
 *              execution, so the answer to "is this safe" is no longer the one
 *              the approver gave.
 *   Tool       a different tool ran than the one approved.
 *   Delegation a child task executed with authority its parent never held.
 *   Semantic   every recorded field is identical and the downstream effect
 *              still differs — one process level below what a field verifier
 *              can observe.
 *
 * The last two are reported as *unverifiable* rather than as clean. Claiming
 * a harness is free of a class it cannot observe is the failure this tool
 * exists to prevent, so it would be a poor advertisement for it.
 *
 * Read-only over recorded artefacts: no model, no network, no credentials.
 * Pairs `audit-trail.js`'s grant and dispatch records by tool call id.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { stateDir } from '../utils/state-dir.js';
import { AUDIT_VERSION, WRITE_TOOLS, auditFile } from './audit-trail.js';
import { PERMISSIONS } from './task.js';

// `auditFile` builds its path from the same directory as `auditRunsDir`, so a
// SENTINEL_AUDIT_DIR override moves the read side too. One env var, one
// location, or the auditor reads an empty directory and reports "nothing to
// audit" — which looks exactly like a clean run.

export const GAP_CLASSES = Object.freeze([
  'Scope', 'Argument', 'Temporal', 'Tool', 'Delegation', 'Effect', 'Semantic',
]);

/**
 * How stale a grant has to be before the world moving underneath it matters.
 *
 * Not a wall-clock correctness claim — it is the point at which intervening
 * writes make the approver's answer unrecoverable by inspection. A grant and
 * its dispatch are milliseconds apart in a normal turn, so anything past this
 * is either a long tool call or a bug, and both are worth reporting.
 */
export const TEMPORAL_STALE_MS = 30_000;

/** Ordered least to most capable, mirroring task.js's clamp. */
const CAPABILITY = Object.freeze({
  [PERMISSIONS.INHERIT]: 3,
  [PERMISSIONS.TEAMMATE]: 2,
  [PERMISSIONS.READONLY]: 1,
  [PERMISSIONS.NONE]: 0,
});

/** Absolute path of the directory holding per-run audit files. */
export function auditRunsDir(cwd = process.cwd()) {
  return process.env.SENTINEL_AUDIT_DIR || join(stateDir(cwd), 'audit');
}

/** Run ids with an audit file, oldest first (ids are timestamp-ordered). */
export function listAuditRuns(cwd = process.cwd()) {
  const dir = auditRunsDir(cwd);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => f.replace(/\.jsonl$/, ''))
    .sort();
}

/**
 * Read one run's records, pairing each grant with its dispatch.
 *
 * Tolerant by design: a truncated final line is a crash mid-write, not
 * corruption, and dropping the run because the last line is short would hide
 * exactly the run most worth auditing.
 */
export function readAuditRun(runId, cwd = process.cwd()) {
  const file = auditFile(runId, cwd);
  if (!existsSync(file)) return { runId, records: [], grants: [], dispatches: [], truncated: false };
  const records = [];
  let truncated = false;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      truncated = true;
    }
  }
  const grants = records.filter((r) => r.stage === 'grant');
  const dispatches = records.filter((r) => r.stage === 'dispatch');
  return { runId, records, grants, dispatches, truncated };
}

/** A gap is a finding. `evidence` is what makes it checkable. */
function gap(cls, toolCallId, detail, evidence = {}) {
  return { class: cls, toolCallId, detail, ...evidence };
}

/**
 * Compare one grant with the dispatch that followed it.
 *
 * Order matters and is cheapest-first: a run with a Tool gap usually has a
 * Scope gap too, and reporting all six classes per call buries the one that
 * was the actual substitution. The `break` at the end of each branch is
 * deliberate — one root cause, one finding.
 */
function comparePair(grant, dispatch, ctx) {
  const gaps = [];
  const id = grant.toolCallId;

  // ── Tool: a different tool ran ──────────────────────────────────────
  if (grant.tool !== dispatch.tool) {
    gaps.push(gap('Tool', id, `approved ${grant.tool}, ran ${dispatch.tool}`, {
      approved: grant.tool, executed: dispatch.tool,
    }));
    return gaps;
  }

  // ── Scope: the blast radius grew ────────────────────────────────────
  // Workdir first: a command run in a different tree is a different action
  // even when every field is identical, which is why workdir is compared
  // before shape rather than alongside it.
  if (grant.workdir && dispatch.workdir && grant.workdir !== dispatch.workdir) {
    gaps.push(gap('Scope', id, `approved in ${grant.workdir}, ran in ${dispatch.workdir}`, {
      approvedWorkdir: grant.workdir, executedWorkdir: dispatch.workdir,
    }));
    return gaps;
  }

  // Escalating intent under the same tool is the scope gap that matters most:
  // the approver saw a read, a write ran.
  const RANK = { read_only: 0, unknown: 1, write: 2, state: 3 };
  const approvedRank = RANK[grant.intent] ?? -1;
  const ranRank = RANK[dispatch.intent] ?? -1;
  if (grant.intent && dispatch.intent && ranRank > approvedRank) {
    gaps.push(gap('Scope', id, `approved a ${grant.intent} command, ran a ${dispatch.intent} one`, {
      approvedIntent: grant.intent, executedIntent: dispatch.intent,
      approvedShape: grant.shape, executedShape: dispatch.shape,
    }));
    return gaps;
  }

  // A destructive command under a grant that was not itself destructive is
  // reported as Scope rather than as "the guard failed" — from the approver's
  // side they are the same complaint: this was bigger than what I saw.
  if (dispatch.destructive && !grant.destructive) {
    gaps.push(gap('Scope', id, 'a destructive command ran under a non-destructive grant', {
      approvedShape: grant.shape, executedShape: dispatch.shape,
    }));
    return gaps;
  }

  // Paths outside the approved set. Compared per-path, so a grant that named
  // two files and executed three reports the one that is new.
  const approvedPaths = new Set(grant.paths ?? []);
  const extraPaths = (dispatch.paths ?? []).filter((p) => !approvedPaths.has(p));
  if (approvedPaths.size && extraPaths.length) {
    gaps.push(gap('Scope', id, `touched ${extraPaths.length} path(s) the approval did not name`, {
      approvedPaths: [...approvedPaths], extraPaths,
    }));
    return gaps;
  }

  // ── Effect: a browser action's descriptor changed between grant and dispatch ──
  //
  // Checked before the generic Scope/Argument branches, and only when at least
  // one side carries an effect. A browser action has no `workdir` and no
  // meaningful command shape, so without this the origin and resource would fall
  // through to the `paths` comparison and be reported as a file-scope gap with
  // no indication of what they were.
  //
  // This is the class that `Semantic` was standing in for. Those divergences left
  // every recorded field unchanged; now the fields are recorded before the
  // effect, so "it acted somewhere other than where it was approved to act" is
  // a finding rather than a gap in the taxonomy.
  if (grant.effect || dispatch.effect) {
    if (!grant.effect || !dispatch.effect) {
      gaps.push(gap('Effect', id, 'one side of the pair carries no effect descriptor', {
        approvedEffect: grant.effect ?? null,
        executedEffect: dispatch.effect ?? null,
      }));
      return gaps;
    }
    const fields = ['origin', 'resourceId', 'reversibility', 'recipient', 'compensatingAction'];
    const changed = fields.filter((f) => {
      const a = grant.effect?.[f];
      const b = dispatch.effect?.[f];
      const aHas = a !== undefined && a !== null && a !== '';
      const bHas = b !== undefined && b !== null && b !== '';
      // Present-vs-absent counts as a change: silence in the grant is exactly
      // what a broadened dispatch would look like.
      if (aHas !== bHas) return true;
      return aHas && String(a) !== String(b);
    });
    if (changed.length) {
      gaps.push(gap('Effect', id, `effect descriptor changed: ${changed.join(', ')}`, {
        changedFields: changed,
        approvedEffect: grant.effect,
        executedEffect: dispatch.effect,
      }));
      return gaps;
    }
    if (dispatch.drifted && !grant.drifted) {
      gaps.push(gap('Effect', id, 'an action flagged as drifted was dispatched', {
        approvedEffect: grant.effect,
        executedEffect: dispatch.effect,
      }));
      return gaps;
    }
  }

  // ── Argument: same shape, different values ──────────────────────────
  // Reached only when the shape matched, which is the entire point: this class
  // exists because shape matching is lossy by design (`git commit -am "a"` and
  // `git commit -am "b"` are one shape), and the loss is invisible to any check
  // that only compares shapes.
  //
  // So the test is the inputs, not the derived fields. Comparing `fieldsDiffer`
  // here would be a bug: the shape and intent are *identical* by definition in
  // this branch, so they would always agree and the class could never fire.
  if (grant.shape && grant.shape === dispatch.shape) {
    const before = JSON.stringify(grant.input ?? null);
    const after = JSON.stringify(dispatch.input ?? null);
    if (before !== after) {
      gaps.push(gap('Argument', id, 'same command shape, different arguments', {
        approvedShape: grant.shape, approvedInput: grant.input, executedInput: dispatch.input,
      }));
      return gaps;
    }
  }

  // ── Temporal: the grant went stale ──────────────────────────────────
  const elapsed = Date.parse(dispatch.ts) - Date.parse(grant.ts);
  if (Number.isFinite(elapsed) && elapsed > TEMPORAL_STALE_MS) {
    const since = ctx.writesBetween(grant, dispatch);
    gaps.push(gap('Temporal', id, `${Math.round(elapsed / 1000)}s between grant and dispatch`, {
      elapsedMs: elapsed, writesBetween: since,
    }));
    return gaps;
  }

  return gaps;
}

/**
 * Audit one run.
 *
 * @returns {{runId, calls, gaps, byClass, boundGapRate, unverifiable, truncated}}
 */
export function auditRun(runId, { cwd = process.cwd() } = {}) {
  const { grants, dispatches, truncated } = readAuditRun(runId, cwd);
  const byToolCall = new Map();
  for (const d of dispatches) {
    if (d.toolCallId != null) byToolCall.set(d.toolCallId, d);
  }

  // Mutation timeline, for the Temporal class. An append-only list is enough:
  // the number of writes between two timestamps is all the finding needs.
  const writes = dispatches
    .filter((d) => WRITE_TOOLS.includes(d.tool))
    .map((d) => ({ ts: d.ts, paths: d.paths ?? [] }));
  const writesBetween = (a, b) => {
    const lo = Date.parse(a.ts);
    const hi = Date.parse(b.ts);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
    return writes.filter((w) => {
      const t = Date.parse(w.ts);
      return t > lo && t < hi;
    });
  };

  const gaps = [];
  const ctx = { writesBetween };
  let paired = 0;
  for (const grant of grants) {
    const dispatch = byToolCall.get(grant.toolCallId);
    // An unpaired grant is not a gap: it means the call was denied or errored
    // before executing, which is the system working. Counting it would make a
    // restrictive harness look like a leaky one.
    if (!dispatch) continue;
    paired++;
    gaps.push(...comparePair(grant, dispatch, ctx));
  }

  // Delegation: a task that executed above its parent's rung. The clamp in
  // task.js should make this impossible, which is exactly why it is worth
  // checking rather than assuming — a clamp that silently stopped applying
  // would look identical from the inside.
  //
  // The parent link has to come from the record, because the registry that
  // holds it is in-memory and gone by the time anyone audits a run. Resolving
  // it while the turn was live is what makes this checkable after the fact.
  const rungByTask = new Map();
  for (const r of dispatches) {
    if (r.taskId && r.rung && !rungByTask.has(r.taskId)) rungByTask.set(r.taskId, r.rung);
  }
  for (const d of dispatches) {
    if (!d.rung || !d.taskId) continue;
    const parentRung = d.parentTaskId ? rungByTask.get(d.parentTaskId) : null;
    if (!parentRung) continue;
    if ((CAPABILITY[d.rung] ?? 0) > (CAPABILITY[parentRung] ?? 0)) {
      gaps.push(gap('Delegation', d.toolCallId, `task ${d.taskId} ran at ${d.rung}, above its parent's ${parentRung}`, {
        taskId: d.taskId, rung: d.rung, parentRung, parentTaskId: d.parentTaskId,
      }));
    }
  }

  const byClass = Object.fromEntries(GAP_CLASSES.map((c) => [c, 0]));
  for (const g of gaps) byClass[g.class]++;

  // Semantic is structurally unobservable from the recorded fields, which is
  // the finding from the approval-laundering literature: those classes leave
  // every dispatch field unchanged. Reported as not-assessed, never as zero.
  const unverifiable = ['Semantic'];

  return {
    runId,
    calls: paired,
    grants: grants.length,
    dispatches: dispatches.length,
    gaps,
    byClass,
    boundGapRate: paired ? gaps.length / paired : 0,
    unverifiable,
    truncated,
  };
}

/** Audit the most recent N runs, newest first. */
export function auditRuns(n = 1, { cwd = process.cwd() } = {}) {
  const ids = listAuditRuns(cwd).reverse().slice(0, Math.max(1, n));
  return ids.map((id) => auditRun(id, { cwd }));
}

/** Aggregate several run reports into one shape. */
export function summarizeAudits(reports) {
  const byClass = Object.fromEntries(GAP_CLASSES.map((c) => [c, 0]));
  let calls = 0;
  let gaps = 0;
  for (const r of reports) {
    calls += r.calls;
    gaps += r.gaps.length;
    for (const c of GAP_CLASSES) byClass[c] += r.byClass[c];
  }
  return { runs: reports.length, calls, gaps, byClass, boundGapRate: calls ? gaps / calls : 0 };
}

/** The report a person reads. */
export function renderAudit(report, { json = false } = {}) {
  if (json) return JSON.stringify(report, null, 2) + '\n';

  const lines = [];
  const total = report.gaps.length;
  lines.push('');
  lines.push(`\x1b[1m\x1b[31mbound-gap audit\x1b[0m \x1b[2m${report.runId}\x1b[0m`);
  lines.push('');

  if (!report.calls) {
    lines.push('\x1b[2mNo paired tool calls in this run — nothing was approved and then executed.\x1b[0m');
  } else {
    for (const g of report.gaps) {
      lines.push(`\x1b[31m${g.class}\x1b[0m \x1b[2m${g.toolCallId ?? '(no id)'}\x1b[0m  ${g.detail}`);
      if (g.approvedShape && g.executedShape && g.approvedShape !== g.executedShape) {
        lines.push(`  \x1b[2mapproved: ${g.approvedShape}\x1b[0m`);
        lines.push(`  \x1b[2mexecuted: ${g.executedShape}\x1b[0m`);
      }
      if (g.extraPaths?.length) lines.push(`  \x1b[2mnot approved: ${g.extraPaths.join(', ')}\x1b[0m`);
      if (g.writesBetween?.length) {
        lines.push(`  \x1b[2m${g.writesBetween.length} write(s) landed between the grant and the dispatch\x1b[0m`);
      }
      lines.push('');
    }
    if (!total) lines.push('\x1b[32mNo bound-gaps found in the recorded approvals.\x1b[0m\n');
  }

  const bits = [
    `${report.calls} approved call(s) replayed`,
    total ? `${total} bound-gap(s)` : '0 bound-gaps',
    `rate ${(report.boundGapRate * 100).toFixed(1)}%`,
  ];
  lines.push(`\x1b[2m${bits.join(' · ')}\x1b[0m`);
  lines.push(`\x1b[2mnot assessable from recorded fields: ${report.unverifiable.join(', ')}\x1b[0m`);
  if (report.truncated) lines.push('\x1b[33mlast line was truncated — the run was cut short mid-write\x1b[0m');
  lines.push('');
  return lines.join('\n');
}

export { AUDIT_VERSION };

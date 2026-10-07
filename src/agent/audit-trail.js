/**
 * Audit trail — what was APPROVED, and what actually RAN.
 *
 * The premise every coding-agent harness rests on is that the action a human
 * approved (`A`) is the action the harness executes (`A'`). That assumption is
 * unchecked. When it fails, the failure is invisible at the moment it happens:
 * the permission dialog showed one thing and something broader, later, or more
 * privileged ran instead.
 *
 * The existing PostToolUse audit line cannot see any of this:
 *
 *     { ts, toolName, ok }
 *
 * It records the tool and whether it worked. That answers "did it run", not
 * "was this the thing that was approved". An auditor needs both sides of the
 * binding, so both sides are recorded here, paired by tool call id:
 *
 *     { stage: 'grant',    tool, input, shape, intent, workdir, decision, rung }
 *     { stage: 'dispatch', tool, input, shape, intent, workdir, ok }
 *
 * Both are written *before* the effect, not after: a grant must be on disk
 * before the tool runs, or a crash mid-dispatch leaves a record of an action
 * nobody approved — which is the finding this file exists to produce.
 *
 * Read side is `audit.js`. This module only writes.
 *
 * Disabled with SENTINEL_NO_AUDIT=1. Directory override with
 * SENTINEL_AUDIT_DIR. Append is synchronous and best-effort: an audit log must
 * never be the reason a turn fails.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { stateDir } from '../utils/state-dir.js';
import { commandShape } from './risk-ledger.js';
import { classifyBashCommand } from './bash-validation.js';

export const AUDIT_VERSION = '1';

/** Commands whose input names a file. Everything else is classified, not located. */
import { WRITE_TOOLS, isShellTool, isWebTool, isWebCommitTool } from '../shared/tool-taxonomy.js';

export { WRITE_TOOLS };

/**
 * Map a reversibility class onto the existing intent ladder.
 *
 * Reusing `audit.js`'s vocabulary rather than inventing a parallel one is what
 * makes browser actions auditable by the checks already written. `read_only`
 * below `write` is the point: an approved navigation followed by a click is the
 * same "you showed me a read and a write ran" finding the shell path reports.
 */
function webIntent(effect) {
  // Cases at the switch's own level: this repo's `indent` rule has no
  // SwitchCase option, so its default is 0 and indented cases fail lint.
  switch (effect?.reversibility) {
  case 'reversible': return 'read_only';
  case 'compensable': return 'write';
  case 'absorbing': return 'state';
  case 'external': return 'state';
  default: return 'unknown';
  }
}

/** Guard against a model sending a megabyte of patch into the log. */
const INPUT_CHAR_CAP = 2000;

let processRunId = null;

/** A run id for callers that have none (the inner generator does not have one). */
function fallbackRunId() {
  if (!processRunId) processRunId = `adhoc_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  return processRunId;
}

function auditDir(cwd = process.cwd()) {
  return process.env.SENTINEL_AUDIT_DIR || join(stateDir(cwd), 'audit');
}

function clip(value) {
  if (value === undefined || value === null) return value;
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > INPUT_CHAR_CAP ? s.slice(0, INPUT_CHAR_CAP) + '…[truncated]' : s;
}

/**
 * The parts of a tool call that decide whether two calls are the same action.
 *
 * `shape` and `intent` are the load-bearing fields and they are the reason
 * `risk-ledger.js` exists: a command's *shape* is its verb and its flags with
 * values replaced, so `git commit -am "fix"` and `git commit -am "other"` are
 * one shape. Comparing shapes rather than raw strings is what lets the auditor
 * tell "the session grant for this shape was reused" (expected) from "a
 * different command ran under this approval" (a finding).
 */
export function summarizeCall(tool, input = {}) {
  const summary = { shape: null, intent: null, destructive: false, paths: [] };
  if (isWebTool(tool)) {
    // A browser action has no path and no command shape, so both of the fields
    // above would be null and the auditor's Scope/Argument comparisons would have
    // nothing to compare. `effect` is the browser's equivalent: recorded
    // pre-execution from the descriptor, so a dispatch that acts on a different
    // origin, resource, or reversibility class than was approved is a difference
    // the auditor can see.
    //
    // `intent` is the reversibility class, mapped onto the same ladder the shell
    // path uses, so a commit graded `absorbing` ranks above an approved `write`
    // and fires the existing Scope check rather than needing a parallel one.
    const e = input?.effect && typeof input.effect === 'object' ? input.effect : null;
    if (e && typeof e.action === 'string') {
      summary.shape = `web ${e.action}`;
      summary.intent = isWebCommitTool(tool) ? webIntent(e) : 'read_only';
      // "Destructive" in the shell sense means "not undoable from a
      // checkpoint". That is precisely what `absorbing` and `external` mean, so
      // the existing check — "a destructive command ran under a non-destructive
      // grant" — catches an approved-reversible click that turned out not to be.
      summary.destructive = e.reversibility === 'absorbing' || e.reversibility === 'external';
      if (e.origin) summary.paths = [String(e.origin)];
      if (e.resourceId) summary.paths.push(String(e.resourceId));
    }
    return summary;
  }
  if (isShellTool(tool)) {
    const command = typeof input?.command === 'string' ? input.command : '';
    if (command) {
      summary.shape = commandShape(command);
      const cls = classifyBashCommand(command);
      summary.intent = cls.intent;
      summary.destructive = cls.destructive;
    }
    return summary;
  }

  const push = (p) => {
    if (typeof p === 'string' && p && !summary.paths.includes(p)) summary.paths.push(p);
  };
  push(input?.path);
  push(input?.filePath);
  for (const op of Array.isArray(input?.operations) ? input.operations : []) push(op?.filePath);
  // A unified diff names its files in the `+++`/`---` headers. Parsing those
  // rather than the hunks is deliberate: headers are a fixed format, hunk
  // context is not.
  if (typeof input?.patch === 'string') {
    for (const m of input.patch.matchAll(/^\+\+\+ (?:b\/)?(.+?)\t?$/gm)) push(m[1]);
    for (const m of input.patch.matchAll(/^--- (?:a\/)?(.+?)\t?$/gm)) push(m[1]);
  }
  return summary;
}

function append(record) {
  if (process.env.SENTINEL_NO_AUDIT === '1') return;
  try {
    // `audit/`, not `.sentinel/`. `ensureStateDir` creates the parent, and the
    // append then fails with ENOENT inside a try/catch that swallows errors —
    // so the tool silently records nothing and reports a clean run. Found by
    // running it: the catch that makes the audit safe is the same catch that
    // hid the audit being broken.
    mkdirSync(auditDir(), { recursive: true });
    appendFileSync(join(auditDir(), `${record.runId}.jsonl`), JSON.stringify(record) + '\n');
  } catch {
    // An audit log that throws takes down the turn it was observing, which
    // makes the harness *less* safe, not more.
  }
}

/**
 * Record the approval side of one tool call.
 *
 * `decision` is what the permission machinery returned — `'allow'`,
 * `'allow-session'`, or `null` when nothing was asked. That `null` is itself
 * informative: it is the shape of every call that was never put to a human.
 *
 * `rung` is the permission policy name in force, when the caller knows it. It
 * is `null` for a lead turn, and `null` means *not assessable*, not *clean* —
 * the auditor is written to say so rather than to infer a clean result.
 */
export function recordGrant({
  runId, toolCallId, tool, input, workdir = null, agent = 'lead',
  taskId = null, parentTaskId = null, rung = null, decision = null, risk = null, mode = null,
  effect = null,
} = {}) {
  const call = summarizeCall(tool, input);
  append({
    ts: new Date().toISOString(),
    v: AUDIT_VERSION,
    runId: runId || fallbackRunId(),
    stage: 'grant',
    toolCallId: toolCallId ?? null,
    tool,
    input: clip(input),
    workdir,
    agent,
    taskId,
    parentTaskId,
    rung,
    decision,
    risk: risk?.level ?? risk ?? null,
    mode,
    // The browser's `workdir`: the identity, origin, and resource the approval
    // covered. Copied out of the descriptor rather than left inside `input`
    // because `comparePair` needs it as a field it can compare, and a field
    // buried in a clipped input blob is one that will silently stop matching
    // once the input grows.
    effect,
    ...call,
  });
}

/** Record the execution side. Called with the tool name actually dispatched. */
export function recordDispatch({
  runId, toolCallId, tool, input, workdir = null, agent = 'lead',
  taskId = null, parentTaskId = null, rung = null, ok = true, error = null,
  effect = null, drifted = false,
} = {}) {
  const call = summarizeCall(tool, input);
  append({
    ts: new Date().toISOString(),
    v: AUDIT_VERSION,
    runId: runId || fallbackRunId(),
    stage: 'dispatch',
    toolCallId: toolCallId ?? null,
    tool,
    input: clip(input),
    workdir,
    agent,
    taskId,
    parentTaskId,
    rung,
    ok: !!ok,
    error: error ? clip(error) : null,
    mode: null,
    decision: null,
    risk: null,
    // What actually acted, next to what was approved. `drifted` is set by the
    // tool layer when its own probe/declaration comparison found a mismatch —
    // so a dispatch record carrying it says the guard fired, which is the fact
    // an auditor needs when the effect still landed.
    effect,
    drifted: !!drifted,
    ...call,
  });
}

/**
 * Absolute path to one run's audit file.
 *
 * The directory is always the *project's* `.sentinel/audit/`, not a worktree's.
 * A run's grants and dispatches are one story, and a story split across a
 * worktree boundary is a story nobody can read after the worktree is gone.
 */
export function auditFile(runId, cwd = process.cwd()) {
  return join(auditDir(cwd), `${runId}.jsonl`);
}

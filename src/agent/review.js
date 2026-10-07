/**
 * review — an agent turn whose findings must point at real lines.
 *
 * A normal `ask` turn ends in prose, and prose is allowed to be approximately
 * right. A review is different: a reader takes "line 42 is wrong" and goes to
 * line 42. So the output is structured, and every position is checked against
 * the parsed diff before it is reported.
 *
 * Three rules make the difference between a review worth reading and one that
 * gets the tool muted:
 *
 *   1. A finding must name a file in the diff and a line inside its hunks.
 *      Anything else is dropped and counted, because an unplaceable finding is
 *      not a lesser finding, it is a distraction.
 *   2. At most MAX_FINDINGS. Twelve is a review a person reads. Thirty is a
 *      review they scroll past.
 *   3. The severity that decides anything is computed here, not asked of the
 *      model. The model judges; this module decides the consequence.
 *
 * On the primitive: a review is one task, so it gets a registry entry, the
 * shared concurrency cap, and cancellation by id — like every other concurrent
 * unit of work. The permission rung comes from the caller, because a review of
 * your own uncommitted work and a review of someone else's patch do not deserve
 * the same trust.
 */
import { createTask, awaitTask, cancelTask, PERMISSIONS } from './task.js';
import { runAgentTurnInner } from './loop.js';
import { DEFAULT_CHAT_MODEL_ID } from '../shared/models/index.js';
import { commentablePositions, diffSize } from './review-diff.js';

export const REVIEW_MAX_FINDINGS = 12;

// The line cap now lives in `review-policy.js` beside the rest of the policy, so
// `DEFAULT_REVIEW_POLICY.maxDiffLines` is the one number. Kept exported under
// the old name because callers imported it before the move.
export { DEFAULT_REVIEW_POLICY, REVIEW_MAX_LINES_DEFAULT } from './review-policy.js';

/** A finding whose line cannot be checked is a finding nobody can act on. */
export const SEVERITIES = Object.freeze(['critical', 'warning', 'nit']);

/**
 * The review brief now lives in `review-policy.js`, shared with any hosted
 * reviewer, so the two cannot drift. Re-exported rather than moved silently:
 * `buildBrief` is the name every existing caller imports.
 */
export { buildPolicyBrief as buildBrief } from './review-policy.js';

/**
 * Run a review and return findings that point at real lines.
 *
 * @returns {Promise<{summary: string, findings: object[], dropped: object[], stats: object, costUsd: number}>}
 */
export async function runReview({
  brief,
  cwd,
  // Hoisted out of the closure below so both the task spec and the turn can
  // name the same rung, which is what makes the reviewer's recorded calls
  // comparable to a lead's.
  permissionName = null,
  // Resolved here rather than left to the caller: the loop treats `model: null`
  // as "look it up" and then dereferences the result, so a caller that passes
  // null through gets `Cannot read properties of null` instead of a default.
  model = DEFAULT_CHAT_MODEL_ID,
  readOnly = true,
  name = 'review',
  // Who is doing the reviewing. The default is this module's own caller; a
  // hosted reviewer passes its own name so its tasks are attributable in
  // `/tasks` instead of appearing as generic `review` entries.
  owner = 'review',
  // Extra facts to record on the task. Merged into this module's own, so a
  // caller adding `repo`/`pr` cannot accidentally drop `readOnly` — which is the
  // one field the audit reads to know what authority the review held.
  meta: extraMeta = null,
  maxConcurrent = null,
  createStream = null,
  files = [],
  signal: outerSignal = null,
}) {
  // One value, named once. Deriving it in two places is how the audit trail
  // ends up claiming a reviewer ran at `readonly` while the task actually held
  // `teammate` — and the Delegation class of the audit is precisely the check
  // that would have caught it.
  const rung = permissionName ?? (readOnly ? PERMISSIONS.READONLY : PERMISSIONS.TEAMMATE);
  const { id, rejected } = createTask({
    kind: 'agent',
    name,
    owner,
    prompt: brief,
    mode: 'REVIEW',
    model,
    // The tree under review is the user's own working copy. A worktree would be
    // a second copy of a directory whose contents are the input.
    isolation: 'none',
    cwd,
    permission: rung,
    ...(maxConcurrent ? { maxConcurrent } : {}),
    meta: { review: true, readOnly, files: files.length, ...(extraMeta ?? {}) },
    run: async ({ signal, permission }) => {
      let text = '';
      let costUsd = 0;
      for await (const ev of runAgentTurnInner({
        history: [{ id: `review_${Date.now()}`, role: 'user', parts: [{ type: 'text', text: brief }] }],
        mode: 'REVIEW',
        model,
        createStream,
        trajectory: false,
        agentName: name,
        workdir: cwd,
        subagentDepth: 1,
        signal,
        onPermissionRequest: permission,
        // A review is a task on the ladder, so its calls are auditable at the
        // rung it actually holds. Omitting this records `null`, which the
        // auditor reports as *not assessable* rather than as clean — and a
        // review of someone else's diff is exactly where that distinction
        // matters.
        rung,
      })) {
        if (ev.event === 'text') text += ev.data.delta;
        else if (ev.event === 'finish') costUsd = ev.data?.costUsd ?? costUsd;
        else if (ev.event === 'error') throw new Error(ev.data.message);
      }
      return { text, costUsd };
    },
  });

  if (rejected) throw new Error(rejected);

  // The caller's signal has to reach the run: the task owns the signal now, so
  // without this an abort would be silently ignored.
  const onAbort = () => cancelTask(id, 'aborted by caller');
  if (outerSignal) {
    if (outerSignal.aborted) onAbort();
    else outerSignal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const finished = await awaitTask(id);
    if (finished.status === 'failed') throw new Error(finished.error || 'review failed');
    if (finished.status === 'cancelled') throw new Error('review cancelled');
    const raw = finished.result?.text ?? '';
    const { findings, dropped } = validateFindings(raw, files);
    return {
      summary: extractSummary(raw),
      findings,
      dropped,
      stats: diffSize(files),
      costUsd: finished.result?.costUsd ?? 0,
      taskId: id,
      // The model's unedited output, for a caller that renders its own body
      // rather than this module's terminal report. `summary` is the model's own
      // summary when it wrote one; a hosted reviewer posting to an API wants the
      // prose underneath it too, and re-deriving that from `summary` would throw
      // away the very text the model spent a second pass writing.
      raw,
    };
  } finally {
    outerSignal?.removeEventListener?.('abort', onAbort);
  }
}

/**
 * Pull the JSON out of a response and throw away anything unplaceable.
 *
 * Every drop is recorded. Silently discarding them would hide a parsing bug,
 * and a parsing bug is otherwise indistinguishable from a reviewer that had
 * nothing to say.
 */
export function validateFindings(text, files) {
  const parsed = extractJson(text);
  const raw = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.findings) ? parsed.findings : [];

  const byPath = new Map(files.map((f) => [f.path, f]));
  const findings = [];
  const dropped = [];

  for (const item of raw) {
    if (findings.length >= REVIEW_MAX_FINDINGS) break;
    const path = String(item?.path ?? '').trim();
    const line = Number(item?.line);
    const message = String(item?.message ?? '').trim();

    if (!path || !message || !Number.isInteger(line) || line < 1) {
      dropped.push({ path: path || '(none)', line: Number.isFinite(line) ? line : -1, reason: 'malformed finding' });
      continue;
    }
    const file = byPath.get(path);
    if (!file) {
      dropped.push({ path, line, reason: 'file is not in the diff' });
      continue;
    }
    const side = item?.side === 'LEFT' ? 'LEFT' : 'RIGHT';
    if (!commentablePositions(file).some((p) => p.line === line && p.side === side)) {
      dropped.push({ path, line, reason: `line ${line} (${side}) is not part of the diff` });
      continue;
    }
    const severity = SEVERITIES.includes(item?.severity) ? item.severity : 'warning';
    findings.push({ path, line, side, severity, message: message.slice(0, 2000) });
  }

  return { findings, dropped };
}

/**
 * The span of the first balanced `{...}` or `[...]`, string-aware.
 *
 * Shared with `stripJson` so the payload is removed by the same logic that
 * found it. Two independently written scanners is how a payload ends up parsed
 * by one and missed by the other, and the symptom is the review body showing
 * raw JSON.
 */
function balancedJsonSpan(s) {
  const start = s.search(/[[{]/);
  if (start === -1) return null;
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  return null;
}

function jsonCandidates(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return [fenced?.[1], text].filter(Boolean);
}

export function extractJson(text) {
  for (const candidate of jsonCandidates(text)) {
    const trimmed = candidate.trim();
    const span = balancedJsonSpan(trimmed);
    if (!span) continue;
    try {
      return JSON.parse(trimmed.slice(span.start, span.end));
    } catch {
      // A fence may contain something that is not JSON at all.
    }
  }
  return null;
}

/** Cut the payload out with the same scanner that parsed it. */
export function stripJson(text) {
  let prose = text;
  for (const candidate of jsonCandidates(text)) {
    const trimmed = candidate.trim();
    const span = balancedJsonSpan(trimmed);
    if (!span) continue;
    const at = candidate.indexOf(trimmed) + span.start;
    prose = prose.slice(0, at) + prose.slice(at + (span.end - span.start));
  }
  return prose.replace(/```(?:json)?/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** The model's own summary, or a factual statement when there isn't one. */
export function extractSummary(text) {
  const parsed = extractJson(text);
  const own = typeof parsed?.summary === 'string' ? parsed.summary.trim() : '';
  if (own) return own.slice(0, 2000);
  const prose = stripJson(text);
  return prose ? prose.slice(0, 2000) : '';
}

/**
 * The report a person reads.
 *
 * The dropped count is in the output on purpose. It is the only signal that
 * distinguishes "the parser rejected the findings" from "the reviewer had
 * nothing to say", and those two look identical otherwise.
 */
export function renderReview({ summary, findings, dropped, stats, costUsd = 0, ref = null }) {
  const counts = { critical: 0, warning: 0, nit: 0 };
  for (const f of findings) counts[f.severity]++;

  const lines = [];
  lines.push('');
  if (ref) lines.push(`\x1b[2mreviewing ${ref}\x1b[0m`);
  lines.push('');

  if (!findings.length) {
    lines.push('\x1b[32mNo findings.\x1b[0m');
  } else {
    const tag = (sev) =>
      sev === 'critical' ? '\x1b[31mcritical\x1b[0m' : sev === 'nit' ? '\x1b[2mnit\x1b[0m' : '\x1b[33mwarning\x1b[0m';
    for (const f of findings) {
      lines.push(`\x1b[1m${f.path}:${f.line}\x1b[0m \x1b[2m${f.side.toLowerCase()}\x1b[0m  ${tag(f.severity)}`);
      lines.push(`  ${f.message}`);
      lines.push('');
    }
  }

  if (summary) {
    lines.push('\x1b[2m─────────────────────────────────────────\x1b[0m');
    lines.push(summary);
    lines.push('');
  }

  if (dropped.length) {
    lines.push(`\x1b[2m${dropped.length} finding(s) dropped as unplaceable\x1b[0m`);
    for (const d of dropped.slice(0, 5)) lines.push(`\x1b[2m  ${d.path}:${d.line} — ${d.reason}\x1b[0m`);
    if (dropped.length > 5) lines.push(`\x1b[2m  … and ${dropped.length - 5} more\x1b[0m`);
    lines.push('');
  }

  const bits = [];
  if (stats) bits.push(`${stats.files ?? stats.fileCount ?? 0} file(s) +${stats.additions} -${stats.deletions}`);
  bits.push(`${counts.critical} critical, ${counts.warning} warning, ${counts.nit} nit`);
  if (costUsd > 0) bits.push(`$${costUsd.toFixed(4)}`);
  lines.push(`\x1b[2m${bits.join(' · ')}\x1b[0m`);
  lines.push('');
  return lines.join('\n');
}

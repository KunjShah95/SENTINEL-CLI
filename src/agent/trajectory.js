/**
 * Trajectory logging — every agent turn recorded as JSONL.
 *
 * Why: traces are the raw material for all eval work (Arize/LangChain
 * pattern: trace first, derive evals from real failures). One small JSONL
 * file per run under `.sentinel/trajectories/` (already gitignored runtime
 * state). Graders, the eval runner, and humans read these — never the model.
 *
 * Record shape (OpenTelemetry-flavored, file-first, no SDK dependency):
 *   { ts, runId (=traceId), seq, event, data?, model?, mode?,
 *     usage?, costUsd? }
 * `data` payloads are truncated (tool outputs can be 20-30k chars).
 * Export path: the JSONL maps 1:1 to OTel spans (runId→trace_id,
 * event→span event); a future `sentinel eval export --otlp` can ship it to
 * Langfuse / Arize Phoenix / LangSmith without changing producers.
 *
 * Disabled with SENTINEL_NO_TRAJECTORY=1. Directory override with
 * SENTINEL_TRAJECTORY_DIR.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const DATA_CHAR_CAP = 4000;

function trajectoryDir() {
  if (process.env.SENTINEL_TRAJECTORY_DIR) return process.env.SENTINEL_TRAJECTORY_DIR;
  return join(process.cwd(), '.sentinel', 'trajectories');
}

function truncateData(data) {
  if (data === undefined) return undefined;
  try {
    const s = typeof data === 'string' ? data : JSON.stringify(data);
    return s.length > DATA_CHAR_CAP ? s.slice(0, DATA_CHAR_CAP) + '…[truncated]' : s;
  } catch {
    return '[unserializable]';
  }
}

export function newRunId() {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

/**
 * Wrap an event generator: every yielded {event, data} is appended as one
 * JSONL line, then passed through untouched. Never throws — logging must
 * not break the turn it observes.
 */
export async function* withTrajectory(source, { runId = newRunId(), model, mode, prompt, goal } = {}) {
  if (process.env.SENTINEL_NO_TRAJECTORY === '1') {
    yield* source;
    return;
  }

  let file = null;
  try {
    const dir = trajectoryDir();
    mkdirSync(dir, { recursive: true });
    file = join(dir, `${runId}.jsonl`);
  } catch {
    file = null;
  }

  let seq = 0;
  // Header: the task itself (untruncated up to 20k), so `sentinel replay`
  // can re-run the same turn against another model or prompt version.
  if (file && prompt) {
    try {
      appendFileSync(file, JSON.stringify({
        ts: new Date().toISOString(), runId, seq: seq++, event: 'start',
        data: JSON.stringify({ prompt: String(prompt).slice(0, 20_000), goal }), model, mode,
      }) + '\n');
    } catch { /* best-effort */ }
  }
  let usage;
  let costUsd;
  for await (const ev of source) {
    if (ev?.event === 'finish') {
      usage = ev.data?.usage;
      costUsd = ev.data?.costUsd;
    }
    if (file) {
      try {
        appendFileSync(
          file,
          JSON.stringify({
            ts: new Date().toISOString(),
            runId,
            seq: seq++,
            event: ev?.event,
            data: truncateData(ev?.data),
            model,
            mode,
            ...(ev?.event === 'finish' ? { usage, costUsd } : {}),
          }) + '\n'
        );
      } catch {
        // Logging is best-effort by design.
      }
    }
    yield ev;
  }
}

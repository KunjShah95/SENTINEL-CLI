/**
 * In-turn context compaction for the agent loop.
 *
 * ## Why this file exists
 *
 * Measured on a 25-iteration BUILD turn (`scripts/bench-context.mjs`,
 * `scripts/bench-turn-context.mjs`):
 *
 *     fixed prefix (system + tool schemas)   ~3.5k tokens x 25 calls = ~87k
 *     growing conversation                   avg ~32.5k x 25 calls = ~814k
 *
 * The prefix is the number everyone optimises, because it is visible and
 * constant. It is ~10% of the turn. The conversation is the other 90%: it is
 * paid on every iteration and it grows monotonically with tool output.
 *
 * `trimMessagesForBudget` in `loop.js` bounds it, but as a cliff. Nothing
 * happens until the request reaches 200k chars, and then old tool results are
 * tombstoned wholesale. That keeps the request legal and keeps almost nothing
 * else — and a turn that has lost its file contents re-reads them, spending
 * more than it saved.
 *
 * This is not a bigger cliff. It is progressive: context is given up in the
 * order that costs least to lose, and only as far as pressure demands.
 *
 * ## The order things are given up in
 *
 *  1. **Superseded duplicates.** If the same logical call ran twice, the older
 *     result is dropped for free — the newer one is still present. Free, so it
 *     is taken first and unconditionally.
 *  2. **Bulk body.** A large result is shrunk to a head window plus a notice
 *     naming the parameters that fetch the rest.
 *  3. **Only then the tombstone** — the same last resort `loop.js` already uses,
 *     reached far later because 1 and 2 ran first.
 *
 * The task head and the most recent messages are never touched: a model
 * reasoning about a file it just opened needs that file, and does not need the
 * eleventh `ls`.
 *
 * ## Why shrinking is not simply data loss
 *
 * Shrinking only pays if the model can get the bytes back cheaply. Two things
 * make that true, and both live at the tool layer:
 *
 *   - `readFile` accepts `offset`/`limit` (`shared/tools/index.js`), so a
 *     shrunken read is recoverable with one small follow-up call instead of a
 *     re-send of the whole file.
 *   - The notice names those exact parameters. A truncation the model cannot
 *     act on is data loss with extra steps.
 *
 * Pure module: no I/O, no clock, no provider. Every export is a function of its
 * arguments, which is what makes the ordering above testable at all.
 */

// ── Tunables ─────────────────────────────────────────────────────────────────

/**
 * A tool result larger than this is a candidate for shrinking.
 *
 * Below it a result is kept no matter the pressure: small results are cheap to
 * carry and expensive to lose, so shrinking them trades a large saving for a
 * small one and can lose a result the model is actively using.
 */
export const RESULT_KEEP_CHARS = 2_000;

/** Head kept when a result is shrunk. The rest becomes a notice. */
export const RESULT_HEAD_CHARS = 1_200;

/** Trailing messages never compacted: the active working set. */
export const DEFAULT_PROTECT_LAST = 6;

/**
 * Pressure at which compaction starts.
 *
 * Below 1.0 deliberately. Compaction that begins only once a request is already
 * over budget cannot help the call that pushed it over — that call has been sent
 * and billed. Starting at 0.6 means the expensive tail of a long turn (its last
 * iterations, when the conversation is largest) is what gets compacted.
 */
export const COMPACT_START_RATIO = 0.6;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Deterministic JSON stringify (sorted keys) so call identity is stable. */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
    .join(',')}}`;
}

/** Exact JSON size of one message, measured once. */
function sizeOf(m) {
  try {
    return JSON.stringify(m)?.length ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Every tool result in the list, with the name and arguments of the call that
 * produced it.
 *
 * A tool message carries only an id, so the assistant message carrying
 * `tool_calls` is what names the tool. A result whose originating call is
 * unknown — a resumed session, a hand-built history — still gets a row, with
 * `name: null`, so it is compacted by size rather than quietly kept forever.
 */
function indexToolResults(messages) {
  const byId = new Map();
  messages.forEach((m) => {
    if (m.role !== 'assistant' || !Array.isArray(m.tool_calls)) return;
    for (const tc of m.tool_calls) {
      if (!tc?.id) continue;
      let args = null;
      try {
        args = JSON.parse(tc?.function?.arguments ?? 'null');
      } catch {
        args = null;
      }
      byId.set(tc.id, { name: tc?.function?.name ?? null, args, known: true });
    }
  });

  const results = [];
  messages.forEach((m, i) => {
    if (m.role !== 'tool') return;
    const meta = m.tool_call_id ? byId.get(m.tool_call_id) : null;
    results.push({
      msgIndex: i,
      name: meta?.name ?? null,
      args: meta?.args ?? null,
      known: meta !== undefined,
      size: typeof m.content === 'string' ? m.content.length : 0,
    });
  });
  return results;
}

/** Logical identity of a call: name plus arguments. Null when unknown. */
function callIdentity(r) {
  if (!r.known) return null;
  return `${r.name}:${stableStringify(r.args ?? null)}`;
}

/**
 * The exact parameters that recover the tail of a shrunken read.
 *
 * Only `readFile` is recoverable today, and only when the caller passed a line
 * offset — an offsetless read of a whole file has no known resume point, so it
 * is re-run rather than windowed. That asymmetry is the reason: a wrong hint
 * sends the model back to byte 0 and it reads the same 2k again.
 */
export function recoveryHint(name, args) {
  if (name !== 'readFile' || !args || typeof args !== 'object') return null;
  const { path, offset, limit } = args;
  if (typeof offset !== 'number') return null;
  const resumeAt = offset + RESULT_HEAD_CHARS;
  const window = typeof limit === 'number' && limit > RESULT_HEAD_CHARS ? limit : RESULT_HEAD_CHARS;
  return `readFile(path: ${JSON.stringify(path)}, offset: ${resumeAt}, limit: ${window})`;
}

/**
 * What replaces a shrunken result's tail.
 *
 * States the size that was dropped and, where one exists, the call that gets it
 * back. A bare "[truncated]" tells the model it lost something and nothing about
 * whether recovering is cheap, which is the information it needs to decide
 * whether to re-read or move on.
 */
function elisionNotice(result, nextOffset) {
  const dropped = Math.max(0, result.size - RESULT_HEAD_CHARS);
  const hint = recoveryHint(result.name, nextOffset);
  return hint
    ? `… [${result.size} chars total; ~${dropped} elided — recover with ${hint}]`
    : `… [${result.size} chars total; ~${dropped} elided — re-run this call to see the rest]`;
}

// ── The compactor ────────────────────────────────────────────────────────────

/**
 * Size accounting for a message list, shared with `trimMessagesForBudget`'s
 * contract: per-message JSON size plus the enclosing array's separators, so the
 * number compared against a budget is the number the provider receives.
 */
export function contextPressure(messages, budgetChars) {
  const sizes = messages.map(sizeOf);
  const overhead = Math.max(0, messages.length - 1);
  const total = sizes.reduce((a, b) => a + b, 0) + overhead;
  return { sizes, total, ratio: budgetChars > 0 ? total / budgetChars : 0 };
}

/**
 * Progressively reclaim context.
 *
 * @param {Array}  messages        OpenAI-shaped: `{role, content, tool_calls}`
 * @param {object} [options]
 * @param {number} [options.budget]      total chars allowed (~50k tokens)
 * @param {number} [options.protectLast] tail messages never touched
 * @param {number} [options.startRatio]  pressure at which to begin
 * @returns {{messages: Array, reclaimedChars: number, superseded: number,
 *            shrunk: number, elided: number, applied: boolean, ratioBefore: number}}
 */
export function compactToolResults(messages, options = {}) {
  const idle = {
    messages,
    reclaimedChars: 0,
    superseded: 0,
    shrunk: 0,
    elided: 0,
    applied: false,
    ratioBefore: 0,
  };
  if (!Array.isArray(messages) || messages.length === 0) return idle;

  const budget = options.budget ?? 200_000;
  const protectLast = Math.max(0, Math.floor(options.protectLast ?? DEFAULT_PROTECT_LAST));
  const startRatio = options.startRatio ?? COMPACT_START_RATIO;

  const state = contextPressure(messages, budget);
  if (state.ratio < startRatio) return { ...idle, ratioBefore: state.ratio };

  const protectFrom = messages.length - protectLast;
  const allResults = indexToolResults(messages);
  // Stage 1 is gated differently from stages 2 and 3, and the distinction is the
  // point. Superseding is *lossless*: the newer identical result still carries
  // everything the older one did, so dropping the older costs nothing and buys
  // the whole saving. Restricting it to the unprotected region would forfeit a
  // free win precisely when the conversation is largest and the tail is where
  // the bulk of it sits. Stages 2 and 3 genuinely lose information, so those
  // respect the active zone.
  const results = allResults.filter((r) => r.msgIndex < protectFrom);
  // Lossless candidates: everything, including the active zone.
  const supersedable = allResults;

  // Copy-on-write: untouched messages keep object identity, so callers that
  // diff by reference (React state, the trajectory recorder) see no change.
  const out = messages.slice();
  const sizes = state.sizes.slice();
  let total = state.total;
  let reclaimed = 0;

  /** Replace a message's content, keeping `total` exact and accumulating the win. */
  const setContent = (i, content, beforeSize) => {
    const next = { ...out[i], content };
    const nextSize = sizeOf(next);
    total += nextSize - sizes[i];
    sizes[i] = nextSize;
    out[i] = next;
    reclaimed += Math.max(0, beforeSize - nextSize);
  };

  // ── Stage 1: superseded duplicates. Free, so unconditional. ────────────────
  const lastByCall = new Map();
  for (const r of supersedable) {
    const id = callIdentity(r);
    if (id) lastByCall.set(id, r.msgIndex);
  }
  let superseded = 0;
  const supersededIndexes = new Set();
  for (const r of supersedable) {
    const id = callIdentity(r);
    if (!id) continue;
    if (lastByCall.get(id) === r.msgIndex) continue;
    const before = sizes[r.msgIndex];
    const content = typeof out[r.msgIndex].content === 'string' ? out[r.msgIndex].content : '';
    // An error is always stale once re-run: it describes a state that no longer
    // exists, and leaving it in misleads about what the tool does.
    const isError = /"error"\s*:/.test(content.slice(0, 400));
    setContent(
      r.msgIndex,
      isError
        ? `[${r.name} failed on an earlier attempt; superseded by a later identical call]`
        : '[superseded by a later identical call — same arguments, so the later result is still valid]',
      before
    );
    supersededIndexes.add(r.msgIndex);
    superseded += 1;
  }

  // ── Stage 2: progressive shrinking, oldest first. ─────────────────────────
  //
  // Oldest-first, not largest-first: the newest results are what the model is
  // reasoning about. Losing an old file costs one re-read; losing the file just
  // opened costs a turn of the model reasoning from something it cannot see.
  let shrunk = 0;
  for (const r of results) {
    if (total <= budget * startRatio) break;
    if (r.size <= RESULT_KEEP_CHARS) continue;
    // Already reduced to a notice in stage 1 — re-shrinking it would book a
    // saving that does not exist and count the same content twice.
    if (supersededIndexes.has(r.msgIndex)) continue;
    const before = sizes[r.msgIndex];
    const content = String(out[r.msgIndex].content ?? '');
    const notice = elisionNotice(r, r.args);
    setContent(r.msgIndex, content.slice(0, RESULT_HEAD_CHARS) + notice, before);
    shrunk += 1;
  }

  // ── Stage 3: last resort — tombstone, oldest first. ───────────────────────
  let elided = 0;
  for (const r of results) {
    if (total <= budget) break;
    if (supersededIndexes.has(r.msgIndex)) continue;
    const before = sizes[r.msgIndex];
    if (before <= 160) continue; // too small to reclaim anything worth the loss
    setContent(r.msgIndex, elisionNotice(r, r.args), before);
    elided += 1;
  }

  return {
    messages: out,
    reclaimedChars: reclaimed,
    superseded,
    shrunk,
    elided,
    applied: reclaimed > 0,
    ratioBefore: state.ratio,
  };
}

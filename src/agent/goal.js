/**
 * Goal loop (ported from learn-claude-code s17_goal_loop): a session-scoped
 * Stop hook whose judge is a SEPARATE, tool-less model call.
 *
 * When the worker stops calling tools, evaluateGoal() reads the transcript
 * and answers {ok, reason, impossible}. ok=false blocks the stop and the
 * reason becomes the next user message; impossible=true ends the turn. The
 * evaluator cannot run anything — it only judges evidence already present
 * in the conversation, so the worker is told to surface commands + results.
 */
import { streamCompletion } from './providers.js';

export const GOAL_MAX_CHECKS = 8;
export const GOAL_TRANSCRIPT_CAP = 24_000;
const PER_MESSAGE_CAP = 4_000;

export const GOAL_WORKER_RULE =
  'After running a verification command, report the command and its result clearly enough for an independent evaluator to inspect.';

const EVALUATOR_SYSTEM = [
  'You judge whether a completion condition has been met by a coding agent.',
  'You see only the conversation. Require concrete evidence (commands and their actual output). Never assume an unreported command succeeded.',
  'Reply with ONLY a JSON object: {"ok": boolean, "reason": string, "impossible": boolean, "unknown": boolean}.',
  'ok=true only when the condition is demonstrably satisfied. impossible=true only when the condition can no longer be achieved.',
  'unknown=true when the condition itself cannot be judged from the conversation — for example the required evidence was never produced, or the stated target is not measurable. Do not answer unknown to avoid a decision: only use it when judging either way would be a guess.',
].join('\n');

const EVALUATOR_CONTRACT_SYSTEM = [
  'You judge an outcome contract, not a sentence. The contract lists CURRENT STATE, TARGET, VERIFICATION, BLAST RADIUS, ROLLBACK, and UNKNOWNS.',
  'The work is done only when VERIFICATION has actually been run and its result satisfies TARGET.',
  'Require concrete evidence: the command and its real output. Never assume an unreported command succeeded.',
  'If VERIFICATION was never run, the contract is not satisfied — that is ok=false, not unknown.',
  'Reply with ONLY a JSON object: {"ok": boolean, "reason": string, "impossible": boolean, "unknown": boolean}.',
  'unknown=true only when the contract is internally inconsistent or TARGET is not measurable, so that no verdict is possible. Say which field is the problem.',
].join('\n');

function clip(text, cap) {
  if (text.length <= cap) return text;
  const half = Math.floor(cap / 2);
  return `${text.slice(0, half)}\n…[${text.length - cap} chars omitted]…\n${text.slice(-half)}`;
}

/** Newest-first transcript within budget; one huge message keeps head+tail. */
export function renderTranscript(messages, cap = GOAL_TRANSCRIPT_CAP) {
  const parts = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    let body = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
    if (m.tool_calls?.length) {
      body += '\n' + m.tool_calls.map((tc) => `→ ${tc.function?.name}(${String(tc.function?.arguments || '').slice(0, 300)})`).join('\n');
    }
    const entry = `[${m.role}] ${clip(body, PER_MESSAGE_CAP)}`;
    if (used + entry.length > cap && parts.length) break;
    parts.unshift(entry);
    used += entry.length;
  }
  return parts.join('\n\n');
}

/**
 * `unknown` is the third verdict and the one that matters. A judge that only
 * knows yes/no/no-longer-possible is forced to guess when the evidence is
 * missing, and a guess becomes a wasted turn. `unknown` says "the contract
 * itself is not verifiable from what you were shown", which routes the turn
 * back to whoever can fix the contract instead of retrying the same work.
 */
export function parseVerdict(text) {
  const m = /\{[\s\S]*\}/.exec(text || '');
  if (m) {
    try {
      const v = JSON.parse(m[0]);
      return {
        ok: v.ok === true,
        reason: String(v.reason || ''),
        impossible: v.impossible === true,
        unknown: v.unknown === true,
      };
    } catch { /* fall through */ }
  }
  return { ok: false, reason: 'Goal evaluator returned no parseable verdict; show the verification evidence explicitly.', impossible: false, unknown: false };
}

export async function evaluateGoal({ goal, messages, modelId, provider, createStream, signal, contract }) {
  let text = '';
  const subject = contract
    ? `Outcome contract (this is what the work is judged against):\n${contract}\n\nCompletion condition:\n${goal}`
    : `Completion condition:\n${goal}`;
  const stream = (createStream ?? streamCompletion)({
    modelId,
    provider,
    system: contract ? EVALUATOR_CONTRACT_SYSTEM : EVALUATOR_SYSTEM,
    messages: [{
      role: 'user',
      content: `${subject}\n\nConversation (oldest first):\n${renderTranscript(messages)}`,
    }],
    tools: [],
    signal,
    purpose: 'goal-evaluator',
  });
  for await (const ev of stream) {
    if (ev.type === 'text') text += ev.text;
    else if (ev.type === 'error') return { ok: false, reason: `Goal evaluator failed: ${ev.message}`, impossible: false, unknown: false, error: true };
  }
  return parseVerdict(text);
}

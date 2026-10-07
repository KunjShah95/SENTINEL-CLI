/**
 * Outcome contracts — the forward-deployed engineer's core skill.
 *
 * A vague ask ("the sync is flaky") is not a goal, because nothing can verify
 * it. A goal a machine can judge looks like "P95 sync latency under 2s and
 * zero dropped rows over 10k accounts, proven by `npm run sync-test` exiting
 * 0". Getting from the first to the second is a skill, not a prompt, so it
 * gets its own module.
 *
 * An interview turn asks for the six fields below and refuses to accept a
 * contract with a hole in it. Each hole re-opens the interview with a specific
 * question, so the model is never asked to guess.
 *
 *   CURRENT STATE   what happens today, with the file:line that proves it
 *   TARGET          one measurable delta, not a list of wishes
 *   VERIFICATION    the exact command, and what its exit code means
 *   BLAST RADIUS    what a rollback would touch
 *   ROLLBACK        the concrete undo
 *   UNKNOWNS        what the model had to assume (asked, not guessed)
 *
 * `goal.js` then judges the worker against the contract instead of a one-line
 * condition, and can return an `unknown` verdict that sends the turn back to
 * the interview rather than looping blindly.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { streamCompletion } from './providers.js';
import { getWorkdir } from '../shared/tools/workdir.js';
import { ensureStateDir } from '../utils/state-dir.js';

export const OUTCOME_VERSION = '1';
export const INTERVIEW_MAX_ROUNDS = 4;
export const CONTRACT_TRANSCRIPT_CAP = 24_000;

/**
 * Field order is the interview order. Each entry is what the field is FOR,
 * which is what stops the model producing a field that sounds right and
 * cannot be checked.
 */
export const CONTRACT_FIELDS = Object.freeze([
  {
    key: 'current',
    label: 'CURRENT STATE',
    prompt: 'What happens today? Cite the file and line that proves it — not a guess.',
  },
  {
    key: 'target',
    label: 'TARGET',
    prompt: 'One measurable delta from CURRENT STATE. A single number or a single true/false, not a list of wishes.',
  },
  {
    key: 'verification',
    label: 'VERIFICATION',
    prompt: 'The exact command that proves the target, and what its exit code must be. If no command can prove it, say so.',
  },
  {
    key: 'blastRadius',
    label: 'BLAST RADIUS',
    prompt: 'Which files, services, or data a rollback of this change would touch.',
  },
  {
    key: 'rollback',
    label: 'ROLLBACK',
    prompt: 'The concrete undo: the command or edit that reverses the change. Not "revert and redeploy".',
  },
  {
    key: 'unknowns',
    label: 'UNKNOWNS',
    prompt: 'What you had to assume to fill in the fields above. Empty only if nothing was assumed.',
  },
]);

export const FIELD_KEYS = Object.freeze(CONTRACT_FIELDS.map((f) => f.key));

const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * A contract is valid only when the three fields that make it *judgeable* are
 * present. Blast radius and rollback are strong warnings to skip when missing;
 * unknowns may legitimately be empty.
 */
export function contractGaps(contract) {
  const missing = [];
  for (const f of CONTRACT_FIELDS) {
    const v = contract?.[f.key];
    const filled = Array.isArray(v) ? v.filter((x) => oneLine(x)).length > 0 : oneLine(v).length > 0;
    if (filled) continue;
    // Unknowns being empty is an honest answer, not a gap.
    if (f.key === 'unknowns') continue;
    missing.push(f.key);
  }
  return missing;
}

export function validateContract(contract) {
  const missing = contractGaps(contract);
  if (missing.includes('current') || missing.includes('target') || missing.includes('verification')) {
    const labels = missing
      .filter((k) => k !== 'unknowns')
      .map((k) => CONTRACT_FIELDS.find((f) => f.key === k).label);
    throw new Error(`outcome contract is incomplete: ${labels.join(', ')} required`);
  }
  return contract;
}

export function contractFile(cwd = getWorkdir()) {
  return join(cwd, '.sentinel', 'outcome.json');
}

export function readContract(cwd = getWorkdir()) {
  const file = contractFile(cwd);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf-8')); } catch { return null; }
}

export function writeContract(contract, cwd = getWorkdir()) {
  const clean = validateContract(contract);
  const doc = { version: OUTCOME_VERSION, ask: oneLine(contract.ask), ...clean };
  ensureStateDir(cwd);
  writeFileSync(contractFile(cwd), JSON.stringify(doc, null, 2), 'utf-8');
  return doc;
}

/** Human-readable contract, used as the worker's brief and in CLI output. */
export function renderContract(contract) {
  const L = [];
  if (contract.ask) {
    L.push(`Ask: ${contract.ask}`);
    L.push('');
  }
  L.push('## Outcome contract');
  L.push('');
  for (const f of CONTRACT_FIELDS) {
    L.push(`### ${f.label}`);
    const v = contract[f.key];
    if (Array.isArray(v)) {
      if (v.length) for (const item of v) L.push(`- ${item}`);
      else L.push('(none)');
    } else {
      L.push(oneLine(v) || '(none)');
    }
    L.push('');
  }
  return L.join('\n').trim();
}

/** The compact form handed to the evaluator as the thing to judge. */
export function contractBrief(contract) {
  return CONTRACT_FIELDS.map((f) => `${f.label}: ${formatField(contract[f.key])}`).join('\n');
}

function formatField(v) {
  return Array.isArray(v) ? (v.length ? v.map(oneLine).join('; ') : 'none') : oneLine(v) || 'none';
}

const CONTRACT_SYSTEM = [
  'You turn a vague engineering request into an outcome contract another agent can verify.',
  'A contract is judgeable: VERIFICATION names a command and the exit code that counts as done.',
  'Never invent a file path, line number, or command you were not shown. Put anything you had to assume in UNKNOWNS instead.',
  'TARGET is one measurable delta, not a list of things that would be nice.',
  'Reply with ONLY a JSON object with these keys: ' + FIELD_KEYS.map((k) => `"${k}"`).join(', ') + '.',
  'Each value is a string except unknowns, which is an array of strings.',
  'If you genuinely cannot determine a field, set it to "" and explain why in unknowns.',
].join('\n');

/** Extract the JSON object a model was asked for, tolerating prose around it. */
export function parseContract(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  // Walk braces so a nested object or a brace inside a string does not
  // truncate the payload the way a non-greedy regex would.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try {
        const raw = JSON.parse(text.slice(start, i + 1));
        const out = {};
        for (const k of FIELD_KEYS) {
          const v = raw[k];
          out[k] = k === 'unknowns' ? (Array.isArray(v) ? v.map(oneLine).filter(Boolean) : oneLine(v) ? [oneLine(v)] : []) : oneLine(v);
        }
        return out;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** The follow-up question for the highest-priority gap, or null when complete. */
export function nextQuestion(contract) {
  const gaps = contractGaps(contract);
  if (!gaps.length) return null;
  // Verification first: a contract without it cannot be judged at all.
  const order = ['verification', 'target', 'current', 'rollback', 'blastRadius'];
  const key = order.find((k) => gaps.includes(k)) || gaps[0];
  return CONTRACT_FIELDS.find((f) => f.key === key).prompt;
}

const INTERVIEWER_SYSTEM = [
  'You refine an outcome contract with the requester. One short question at a time.',
  'You may look at the repository before answering, so never ask the requester for something you can read yourself.',
  'When the contract is complete and judgeable, say exactly: CONTRACT COMPLETE',
].join('\n');

/**
 * Interview the requester until the contract has no gaps.
 *
 * `onAsk` is called with each question and must return the answer. It is the
 * only place the human is consulted, which keeps this function testable with a
 * scripted requester and swappable for a headless run later.
 */
export async function buildOutcome({
  ask,
  messages = [],
  modelId,
  provider,
  createStream,
  onAsk,
  signal,
  maxRounds = INTERVIEW_MAX_ROUNDS,
}) {
  let contract = parseContractFallback('');
  let question = CONTRACT_FIELDS[0].prompt;
  const asked = [];

  for (let round = 0; round < maxRounds; round++) {
    const answer = await onAsk(question, { contract, round, asked });
    // A requester who walks away ends the interview. Record only answers we
    // actually got, or the transcript claims a question nobody answered.
    if (answer == null) break;
    asked.push({ question, answer });

    // Each round merges the newest answer into the draft by asking the model
    // for the full contract again: cheaper than patching fields piecemeal and
    // it keeps the whole document coherent.
    contract = await refineContract({ ask, messages, asked, modelId, provider, createStream, signal });
    if (!contract) {
      return { complete: false, contract: null, asked, reason: 'contract interview produced no parseable output' };
    }
    if (!contractGaps(contract).length) {
      return { complete: true, contract: { ask, ...contract }, asked };
    }
    question = nextQuestion(contract);
  }
  return { complete: false, contract: contract ? { ask, ...contract } : null, asked, reason: `interview hit its ${maxRounds}-round limit` };
}

async function refineContract({ ask, messages, asked, modelId, provider, createStream, signal }) {
  const qa = asked.map((a, i) => `Q${i + 1}: ${a.question}\nA${i + 1}: ${a.answer}`).join('\n\n');
  let text = '';
  const stream = (createStream ?? streamCompletion)({
    modelId,
    provider,
    system: CONTRACT_SYSTEM,
    messages: [{
      role: 'user',
      content: [
        `Request: ${ask}`,
        '',
        messages.length ? `So far:\n${messages.slice(-6).map((m) => `${m.role}: ${oneLine(m.content)}`).join('\n')}` : '',
        '',
        `Interview so far:\n${qa}`,
        '',
        'Return the full contract as JSON, filling every field you can now answer. Leave a field "" if it is still unknown and explain why in unknowns.',
      ].filter((s) => s !== undefined).join('\n'),
    }],
    tools: [],
    signal,
    purpose: 'outcome-interview',
  });
  for await (const ev of stream) {
    if (ev.type === 'text') text += ev.text;
    else if (ev.type === 'error') return null;
  }
  return parseContract(text);
}

function parseContractFallback(text) {
  const c = parseContract(text);
  return c || Object.fromEntries(FIELD_KEYS.map((k) => [k, k === 'unknowns' ? [] : '']));
}

/** One-shot contract build for a non-interactive run: no interview, best effort. */
export async function draftOutcome({ ask, messages = [], modelId, provider, createStream, signal }) {
  const contract = await refineContract({ ask, messages, asked: [], modelId, provider, createStream, signal });
  if (!contract) return null;
  const gaps = contractGaps(contract);
  return { complete: gaps.length === 0, contract: { ask, ...contract }, gaps };
}

/**
 * A contract the worker is held to, rendered as the brief that replaces a
 * one-line goal. Includes the unknowns so the worker knows which parts of the
 * plan were shaky going in.
 */
export function workerBrief(contract) {
  const L = [renderContract(contract)];
  const unknowns = Array.isArray(contract.unknowns) ? contract.unknowns.filter(Boolean) : [];
  if (unknowns.length) {
    L.push('');
    L.push('These were assumed when the contract was written. If you find any of them to be wrong, say so before working:');
    for (const u of unknowns) L.push(`- ${u}`);
  }
  L.push('');
  L.push(`Prove the work by running the verification command and reporting its output: ${formatField(contract.verification)}`);
  return L.join('\n');
}

/** Re-exported so callers do not need a second import for the field list. */
export { INTERVIEWER_SYSTEM };

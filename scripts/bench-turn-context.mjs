/**
 * Turn-level context cost, before and after progressive compaction.
 *
 * The prefix benchmark (`bench-context.mjs`) measures the fixed system prompt
 * and tool schemas. That is ~10% of a turn. This measures the other 90%: the
 * conversation, which is re-sent on every iteration and grows with tool output.
 *
 * Simulates a 25-iteration BUILD turn doing what a real one does — reading
 * files — and reports total billed input tokens under three policies:
 *
 *   cliff        the old behaviour: `trimMessagesForBudget` alone
 *   progressive  what the loop does now: compact first, cliff as backstop
 *
 * Reproduce: node scripts/bench-turn-context.mjs
 */
import { buildRequestMessages, trimMessagesForBudget, LOOP_REQUEST_CHAR_BUDGET } from '../src/agent/loop.js';

const CHARS_PER_TOKEN = 3.8;
const ITERATIONS = 25;
const MAX_FILE_SIZE = 10_000; // shared/tools/index.js

/** A readFile result at the tool's own cap — the common case, not a worst case. */
function readResult(path) {
  return JSON.stringify({ content: 'x'.repeat(MAX_FILE_SIZE - 80), path });
}

function assistant(id, path) {
  return {
    role: 'assistant',
    content: '',
    tool_calls: [{ id, type: 'function', function: { name: 'readFile', arguments: JSON.stringify({ path }) } }],
  };
}

/** Build the message list a turn accumulates, one read per iteration. */
function buildTurn({ reReadEvery = 0 } = {}) {
  const messages = [{ role: 'user', content: 'refactor the agent loop so it uses fewer tokens' }];
  for (let i = 0; i < ITERATIONS; i++) {
    // Models re-read: the same file after an edit, the same grep twice. The
    // `reReadEvery` knob makes that explicit rather than assuming it away.
    const path = reReadEvery && i % reReadEvery === 0 && i > 0 ? 'src/agent/loop.js' : `src/mod${i}.js`;
    messages.push(assistant(`a${i}`, path));
    messages.push({ role: 'tool', tool_call_id: `a${i}`, content: readResult(path) });
    messages.push({ role: 'user', content: `continue: step ${i + 1}` });
  }
  return messages;
}

function bill(policy, messages) {
  let total = 0;
  let peak = 0;
  for (let iter = 1; iter <= ITERATIONS; iter++) {
    const upto = messages.slice(0, 1 + iter * 3);
    const sent = policy(upto);
    const chars = sent.reduce((n, m) => n + (JSON.stringify(m)?.length ?? 0), 0);
    total += chars;
    peak = Math.max(peak, chars);
  }
  return { tokens: Math.ceil(total / CHARS_PER_TOKEN), peakTokens: Math.ceil(peak / CHARS_PER_TOKEN) };
}

const rows = [];
for (const reReadEvery of [0, 4]) {
  const label = reReadEvery ? `with a re-read every ${reReadEvery} steps` : 'every step a distinct file';
  const msgs = buildTurn({ reReadEvery });
  const cliff = bill((m) => trimMessagesForBudget(m, LOOP_REQUEST_CHAR_BUDGET), msgs);
  const prog = bill((m) => buildRequestMessages(m), msgs);
  rows.push({ label, cliff, prog });
}

console.log(`Turn-level input cost, ${ITERATIONS}-iteration BUILD turn\n`);
console.log('scenario'.padEnd(34), 'cliff'.padStart(12), 'progressive'.padStart(12), 'saved'.padStart(9));
for (const r of rows) {
  const saved = ((1 - r.prog.tokens / r.cliff.tokens) * 100).toFixed(1);
  console.log(
    r.label.padEnd(34),
    `${r.cliff.tokens.toLocaleString()}`.padStart(12),
    `${r.prog.tokens.toLocaleString()}`.padStart(12),
    `${saved}%`.padStart(9)
  );
}

console.log('\npeak single request:');
for (const r of rows) {
  console.log(' ', r.label.padEnd(34), `cliff ${r.cliff.peakTokens.toLocaleString()} -> progressive ${r.prog.peakTokens.toLocaleString()}`);
}

console.log('\nThe saving is billed across every iteration, not just the last one,');
console.log('because the whole conversation is re-sent each time.');

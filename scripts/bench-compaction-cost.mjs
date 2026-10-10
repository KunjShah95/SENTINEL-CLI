/**
 * Is the per-iteration compaction cheap, or did I trade tokens for CPU?
 *
 * `loop.js` re-compacts on every model call, so the cost is paid ~25x per turn
 * (60x in SWE). The repo has a documented history of exactly this regression:
 * `trimMessagesForBudget` used to re-serialize the whole conversation inside two
 * nested loops, costing ~6s of pure CPU across one SWE turn.
 *
 * Reproduce: node scripts/bench-compaction-cost.mjs
 */
import { buildRequestMessages, trimMessagesForBudget, LOOP_REQUEST_CHAR_BUDGET } from '../src/agent/loop.js';

const MAX_FILE_SIZE = 10_000;

function assistant(id, path) {
  return {
    role: 'assistant',
    content: '',
    tool_calls: [{ id, type: 'function', function: { name: 'readFile', arguments: JSON.stringify({ path }) } }],
  };
}

function buildTurn(n) {
  const messages = [{ role: 'user', content: 'refactor the agent loop' }];
  for (let i = 0; i < n; i++) {
    messages.push(assistant(`a${i}`, `src/mod${i}.js`));
    messages.push({ role: 'tool', tool_call_id: `a${i}`, content: JSON.stringify({ content: 'x'.repeat(MAX_FILE_SIZE - 80), path: `src/mod${i}.js` }) });
    messages.push({ role: 'user', content: `continue ${i}` });
  }
  return messages;
}

function timeIt(label, fn, iterations = 60) {
  fn(); // warm
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) fn();
  const t1 = process.hrtime.bigint();
  const perCall = Number(t1 - t0) / 1e6 / iterations;
  console.log(label.padEnd(34), perCall.toFixed(3) + ' ms/call');
  return perCall;
}

console.log('Per-model-call CPU, by turn length\n');
console.log('messages'.padEnd(34), 'cliff only'.padStart(12), 'progressive'.padStart(12), 'added'.padStart(10));
for (const n of [10, 25, 60]) {
  const msgs = buildTurn(n);
  const a = timeIt(`cliff n=${n}`, () => trimMessagesForBudget(msgs, LOOP_REQUEST_CHAR_BUDGET));
  const b = timeIt(`progressive n=${n}`, () => buildRequestMessages(msgs));
  console.log(
    String(msgs.length).padEnd(34),
    (a.toFixed(3) + ' ms').padStart(12),
    (b.toFixed(3) + ' ms').padStart(12),
    ('+' + (b - a).toFixed(3) + ' ms').padStart(10)
  );
}

const n = 60;
const msgs = buildTurn(n);
const cliff = timeIt('cliff, 60-message turn', () => trimMessagesForBudget(msgs, LOOP_REQUEST_CHAR_BUDGET));
const prog = timeIt('progressive, 60-message turn', () => buildRequestMessages(msgs));
console.log('\nProjected across a 60-iteration SWE turn:');
console.log('  cliff      ', (cliff * 60 / 1000).toFixed(2), 's');
console.log('  progressive', (prog * 60 / 1000).toFixed(2), 's', `(+${((prog - cliff) * 60 / 1000).toFixed(2)}s)`);

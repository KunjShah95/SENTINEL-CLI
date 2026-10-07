/**
 * bench-context — the fixed cost of every model call, measured not asserted.
 *
 * A coding agent's turn is: model call → tools → model call → ... The tools are
 * fast (grep is ~140ms); the MODEL CALL is the cost. Three things make a model
 * call expensive and all three are per-request, not per-turn:
 *
 *   1. the fixed prefix (system prompt + tool schemas) is re-sent on every one
 *      of up to 25 (BUILD) / 60 (SWE) iterations;
 *   2. that prefix used to include the ENTIRE skill library — measured at 208
 *      skills / 57.5k chars on a normal machine, i.e. 96% of the prompt;
 *   3. only Anthropic gets prompt caching, so on the other providers the whole
 *      prefix is re-billed at full price every iteration.
 *
 * This reports the prefix, what a turn costs at each iteration count, and
 * which part of it is cacheable. Run: node scripts/bench-context.mjs
 */
import { buildSystemPrompt, flushPromptCache, currentGitBranch } from '../src/agent/prompt.js';
import { buildProviderTools, trimMessagesForBudget, LOOP_REQUEST_CHAR_BUDGET } from '../src/agent/loop.js';
import { formatSkillListing, listSkills, SKILL_LISTING_CHAR_CAP } from '../src/agent/skills.js';

/** Tokens ≈ chars/4. Accepts a string or an already-measured char count. */
const approxTokens = (s) => Math.ceil((typeof s === 'number' ? s : String(s).length) / 4);
const usd = (tokens, perMillion) => (tokens / 1_000_000) * perMillion;

const dir = process.cwd();
const ITER = { BUILD: 25, SWE: 60 };

flushPromptCache();
const system = buildSystemPrompt({ mode: 'BUILD', dir, request: 'fix the failing test' });
const toolsJson = JSON.stringify(buildProviderTools('BUILD', []));
const prefixChars = system.length + toolsJson.length;
const prefixTokens = approxTokens(system) + approxTokens(toolsJson);

const skillCount = listSkills(dir).length;
const listingChars = formatSkillListing(dir, { request: 'fix the failing test' }).length;

console.log('=== fixed prefix, re-sent on every model call ===');
console.log(`skills on this machine     ${skillCount}`);
console.log(`skill listing             ${listingChars} chars (~${approxTokens(listingChars)} tokens, cap ${SKILL_LISTING_CHAR_CAP})`);
console.log(`system prompt total       ${system.length} chars (~${approxTokens(system)} tokens)`);
console.log(`tool schemas              ${toolsJson.length} chars (~${approxTokens(toolsJson)} tokens)`);
console.log(`PREFIX                    ${prefixChars} chars (~${prefixTokens} tokens)\n`);

// The number the cap replaced, so the win is visible here rather than only in
// a commit message. The un-capped listing was one line per installed skill with
// the full description, which a 208-skill machine measured at 57.5k chars.
const UNCAPPED_LISTING_CHARS = 57500;
console.log(`for reference, the same prompt before the skill budget was ~${approxTokens(59260).toLocaleString()} tokens:`);
console.log(`  ${skillCount} skills x full descriptions = ~${approxTokens(UNCAPPED_LISTING_CHARS).toLocaleString()} tokens, re-sent every call`);
console.log(`  now                                    ~${approxTokens(listingChars).toLocaleString()} tokens\n`);

console.log('=== what a turn bills for the prefix alone ===');
console.log('iterations        tokens      @$3/M      @$10/M     @$0.15/M(local)');
for (const [label, n] of Object.entries(ITER)) {
  const t = prefixTokens * n;
  console.log(
    `${label.padEnd(10)} ${String(n).padStart(6)}  ${String(t).toLocaleString().padStart(12)}  ` +
    `$${usd(t, 3).toFixed(3).padStart(9)}  $${usd(t, 10).toFixed(3).padStart(8)}  ` +
    `$${usd(t, 0.15).toFixed(4).padStart(9)}`
  );
}
console.log('\nActual turns are usually far shorter than the cap; these are the ceiling.');

// Prompt caching: which providers can discount the prefix?
const CACHEABLE = new Set(['anthropic', 'openai', 'github-copilot', 'google']);
const PROVIDERS = ['anthropic', 'openai', 'groq', 'google', 'mistral', 'deepseek', 'xai', 'openrouter'];
console.log('\n=== prefix caching by provider ===');
console.log('provider      cache_control sent   prefix billed per iteration');
for (const p of PROVIDERS) {
  const cached = CACHEABLE.has(p);
  console.log(`${p.padEnd(13)} ${(cached ? 'yes' : 'NO').padEnd(19)} ${cached ? '~10%' : '100%'}`);
}
console.log('\n`bench-context` measures the prefix. Caching is a provider feature, not');
console.log('something Sentinel can turn on; BENCHMARKS.md §5 has the same table.');

// ── Loop-side cost: trimming runs on every model call ───────────────────────
function convo(rounds) {
  const out = [{ role: 'user', content: 'fix the failing test' }];
  for (let i = 0; i < rounds; i++) {
    out.push({ role: 'assistant', content: `step ${i}`, tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'readFile', arguments: '{"path":"a.ts"}' } }] });
    out.push({ role: 'tool', tool_call_id: `c${i}`, content: 'x'.repeat(18_000) });
  }
  return out;
}

console.log('\n=== trimMessagesForBudget (runs once per model call) ===');
let stringifyPasses = 0;
const realStringify = JSON.stringify;
JSON.stringify = function (...a) { stringifyPasses++; return realStringify.apply(this, a); };
const big = convo(60);
stringifyPasses = 0;
const t0 = performance.now();
trimMessagesForBudget(big);
const trimMs = performance.now() - t0;
JSON.stringify = realStringify;
console.log(`60-round conversation: ${trimMs.toFixed(0)}ms in ${stringifyPasses} full JSON.stringify passes`);
console.log(`budget ${LOOP_REQUEST_CHAR_BUDGET} chars. x60 SWE iterations = ${(trimMs * 60 / 1000).toFixed(1)}s per turn of pure trimming.`);

// ── Prompt assembly ─────────────────────────────────────────────────────────
console.log('\n=== prompt assembly ===');
flushPromptCache();
const c0 = performance.now();
buildSystemPrompt({ mode: 'BUILD', dir, request: 'fix the failing test' });
const coldMs = performance.now() - c0;
const w0 = performance.now();
for (let i = 0; i < 500; i++) buildSystemPrompt({ mode: 'BUILD', dir, request: 'fix the failing test' });
const warmMs = (performance.now() - w0) / 500;
console.log(`cold ${coldMs.toFixed(1)}ms (incl. a git subprocess) / warm ${warmMs.toFixed(4)}ms`);

const g0 = performance.now();
for (let i = 0; i < 50; i++) currentGitBranch(dir);
console.log(`git branch lookup: ${((performance.now() - g0) / 50).toFixed(3)}ms/call (was ~52ms/subprocess)`);

console.log('\nReproduce: node scripts/bench-context.mjs');

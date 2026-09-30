#!/usr/bin/env node
/**
 * bench-report — render a bench-live results JSON as a standalone HTML page.
 *   node scripts/bench-report.mjs [results.json] [out.html]
 * Defaults: newest evals/results/bench-live-*.json → evals/results/bench-live.html
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { TASKS } from './bench-live.mjs';

const dir = join('evals', 'results');
const input = process.argv[2] || readdirSync(dir)
  .filter((f) => /^bench-live-\d+\.json$/.test(f))
  .map((f) => join(dir, f))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const out = process.argv[3] || join(dir, 'bench-live.html');
const data = JSON.parse(readFileSync(input, 'utf8'));
const results = data.results;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const short = (m) => m.replace(/^ollama\//, '').replace(/:latest$/, '');
const models = [...new Set(results.map((r) => r.model))];
const tasks = [...new Set(results.map((r) => r.task))];
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

const rows = models.map((m) => {
  const rs = results.filter((r) => r.model === m);
  return {
    model: m,
    rs,
    solved: rs.filter((r) => r.pass).length,
    total: rs.length,
    med: median(rs.map((r) => r.seconds)),
    medPass: median(rs.filter((r) => r.pass).map((r) => r.seconds)),
    tools: rs.reduce((a, r) => a + r.tools, 0),
    over: rs.filter((r) => !r.pass && r.claims.some((c) => c.startsWith('tests:'))).length,
    cheat: rs.filter((r) => r.cheated).length,
  };
}).sort((a, b) => b.solved - a.solved || a.med - b.med);

const cellOf = (r) => {
  if (!r) return '<td class="cell none">—</td>';
  const cls = r.pass ? 'pass' : r.cheated ? 'cheat' : r.timedOut ? 'timeout' : 'fail';
  const label = r.pass ? 'Solved' : r.cheated ? 'Edited test' : r.timedOut ? 'Timed out' : 'Failed';
  const tip = `${label} · ${r.seconds}s · ${r.tools} tool calls${r.error ? ` · ${r.error}` : ''}`;
  return `<td class="cell ${cls}" title="${esc(tip)}"><span class="mark">${label}</span><span class="sub">${r.seconds}s · ${r.tools}t</span></td>`;
};

const maxSec = Math.max(1, ...rows.map((r) => r.med));
const best = rows[0];
const totalRuns = results.length;
const totalSolved = results.filter((r) => r.pass).length;
const cpu = os.cpus()[0]?.model?.replace(/\s+/g, ' ').trim() || 'unknown CPU';
const ram = `${Math.round(os.totalmem() / 2 ** 30)} GB RAM`;
const when = new Date(data.date).toISOString().slice(0, 10);
const expected = Number(process.env.BENCH_EXPECTED || 0);

const html = `<title>Sentinel Model Bench</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Source+Sans+3:wght@400;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{--bg:#f4f6f5;--panel:#ffffff;--ink:#16201d;--muted:#5d6b66;--line:#d8dfdc;--pass:#0e7a5f;--pass-bg:#e0f2eb;--fail:#b43a31;--fail-bg:#f8e3e0;--warn:#9a6a12;--warn-bg:#f6ecd6;--bar:#0e7a5f;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0f1513;--panel:#161e1b;--ink:#e6eeeb;--muted:#93a39d;--line:#27332f;--pass:#4cc9a0;--pass-bg:#123328;--fail:#f08476;--fail-bg:#3a1d1a;--warn:#e7b85a;--warn-bg:#35290f;--bar:#4cc9a0;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0f1513;--panel:#161e1b;--ink:#e6eeeb;--muted:#93a39d;--line:#27332f;--pass:#4cc9a0;--pass-bg:#123328;--fail:#f08476;--fail-bg:#3a1d1a;--warn:#e7b85a;--warn-bg:#35290f;--bar:#4cc9a0;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font:16px/1.55 "Source Sans 3",system-ui,sans-serif}
.wrap{max-width:1040px;margin:0 auto;padding-inline:20px;padding-block:40px 64px;display:grid;gap:40px}
h1,h2{font-family:"Bricolage Grotesque",system-ui,sans-serif;text-wrap:balance;margin:0}
h1{font-size:clamp(2rem,5vw,3.2rem);font-weight:800;letter-spacing:-.02em;line-height:1.05}
h2{font-size:1.35rem;font-weight:600}
.eyebrow{font:500 .78rem "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
header{display:grid;gap:14px}
.lede{max-width:65ch;color:var(--muted);margin:0;font-size:1.08rem}
.stats{display:flex;flex-wrap:wrap;gap:12px 32px;font-family:"IBM Plex Mono",monospace;font-size:.92rem}
.stats b{font-size:1.5rem;font-family:"Bricolage Grotesque",sans-serif;display:block;color:var(--ink)}
.stats span{color:var(--muted)}
section{display:grid;gap:14px}
.scroll{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--panel)}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:middle}
tr:last-child td{border-bottom:0}
th{font:500 .76rem "IBM Plex Mono",monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);white-space:nowrap}
td.model{font:500 .9rem "IBM Plex Mono",monospace;white-space:nowrap}
.cell{min-width:92px}
.cell .mark{display:inline-block;font-weight:600;font-size:.82rem;padding:2px 8px;border-radius:999px}
.cell .sub{display:block;font:.72rem "IBM Plex Mono",monospace;color:var(--muted);margin-top:3px}
.pass .mark{color:var(--pass);background:var(--pass-bg)}
.fail .mark{color:var(--fail);background:var(--fail-bg)}
.timeout .mark,.cheat .mark{color:var(--warn);background:var(--warn-bg)}
.num{font-family:"IBM Plex Mono",monospace;text-align:right;white-space:nowrap}
.bars{display:grid;gap:10px}
.bar{display:grid;grid-template-columns:minmax(120px,190px) 1fr 70px;gap:12px;align-items:center;font-size:.9rem}
.bar .name{font-family:"IBM Plex Mono",monospace;overflow-wrap:anywhere}
.track{height:12px;background:var(--line);border-radius:6px;overflow:hidden}
.fill{height:100%;background:var(--bar);border-radius:6px}
.bar .v{font-family:"IBM Plex Mono",monospace;text-align:right;color:var(--muted)}
.tasks{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.task{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.task code{font:500 .85rem "IBM Plex Mono",monospace}
.task p{margin:6px 0 0;color:var(--muted);font-size:.93rem}
ul{margin:0;padding-left:20px;max-width:70ch}
li+li{margin-top:6px}
code{font-family:"IBM Plex Mono",monospace;font-size:.9em}
@media (max-width:560px){.bar{grid-template-columns:1fr 60px}.bar .track{grid-column:1/-1;grid-row:2}}
</style>
<div class="wrap">
<header>
  <div class="eyebrow">Sentinel live bench · ${esc(when)}</div>
  <h1>${esc(short(best.model))} solved ${best.solved} of ${best.total}</h1>
  ${expected > totalRuns ? `<p class="lede" style="color:var(--warn)"><b>Run in progress:</b> ${totalRuns} of ${expected} runs finished. This page is updated as models complete.</p>` : ''}
  <p class="lede">${models.length} local models, ${tasks.length} planted-bug tasks, one real agent turn each. A run counts only if the task's own <code>node test.js</code> passes afterwards and the test file is untouched. What the model says about its work is recorded but never scored.</p>
  <div class="stats">
    <div><b>${totalSolved}/${totalRuns}</b><span>runs solved</span></div>
    <div><b>${models.length}</b><span>models</span></div>
    <div><b>${results.reduce((a, r) => a + r.tools, 0)}</b><span>tool calls</span></div>
    <div><b>${results.filter((r) => !r.pass && r.claims.some((c) => c.startsWith('tests:'))).length}</b><span>false "tests pass" claims</span></div>
  </div>
</header>

<section>
  <h2>Results by task</h2>
  <div class="scroll"><table>
    <thead><tr><th>Model</th>${tasks.map((t) => `<th>${esc(t)}</th>`).join('')}<th class="num">Solved</th><th class="num">Median</th><th class="num">Tools</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td class="model">${esc(short(r.model))}</td>${tasks.map((t) => cellOf(r.rs.find((x) => x.task === t))).join('')}<td class="num">${r.solved}/${r.total}</td><td class="num">${r.med}s</td><td class="num">${r.tools}</td></tr>`).join('')}</tbody>
  </table></div>
</section>

<section>
  <h2>Median time per run</h2>
  <div class="bars">${rows.map((r) => `<div class="bar"><span class="name">${esc(short(r.model))}</span><span class="track"><span class="fill" style="display:block;width:${((r.med / maxSec) * 100).toFixed(1)}%"></span></span><span class="v">${r.med}s</span></div>`).join('')}</div>
</section>

<section>
  <h2>The tasks</h2>
  <div class="tasks">${tasks.map((t) => `<div class="task"><code>${esc(t)}</code><p>${esc(TASKS[t]?.prompt || '')}</p></div>`).join('')}</div>
</section>

<section>
  <h2>How it was run</h2>
  <ul>
    <li>Harness: <code>scripts/bench-live.mjs</code> in Sentinel. Each run gets a fresh git repo, one BUILD-mode turn of the agent loop, and tools auto-approved except destructive shell commands.</li>
    <li>Grading: the harness runs <code>node test.js</code> itself after the turn. Editing <code>test.js</code> to make it pass counts as a failure.</li>
    <li>Limit: ${esc(data.timeoutSec || 300)} seconds per run; the agent's own limits (25 iterations, stop hooks, receipt checks) also apply.</li>
    <li>Hardware: ${esc(cpu)}, ${esc(ram)}, models served by Ollama on the same machine. Times depend on this machine and are only comparable within this page.</li>
    <li>Node ${esc(data.node)}. Raw results: <code>${esc(input.replace(/\\/g, '/'))}</code>.</li>
  </ul>
</section>

<section>
  <h2>Read this before quoting it</h2>
  <ul>
    <li>Five small JavaScript bugs is a smoke test of the agent plus model, not a measure of general coding ability. It is not SWE-bench.</li>
    ${rows.filter((r) => median(r.rs.map((x) => x.tools)) <= 1).map((r) => `<li><code>${esc(short(r.model))}</code> made a median of ${median(r.rs.map((x) => x.tools))} tool calls per run: it mostly answered in prose instead of using the tools, so its score reflects tool-calling ability more than coding ability.</li>`).join('')}
    <li>Each cell is a single run. Local models are nondeterministic, so a different run can flip individual cells.</li>
    <li>Hosted models were not included: the configured Groq key was rejected and the Ollama cloud models hit account limits.</li>
  </ul>
</section>
</div>
`;
writeFileSync(out, html);
console.log(`wrote ${out} from ${input}`);

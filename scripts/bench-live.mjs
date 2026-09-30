#!/usr/bin/env node
/**
 * bench-live — real models, real tool use, mechanically graded.
 *
 *   node scripts/bench-live.mjs --models ollama/qwen3:8b,ollama/llama3.2 [--tasks avg,sort] [--timeout 300]
 *
 * Each task is a tiny repo with one planted bug and a `node test.js` that
 * fails. For every model × task: fresh temp git repo → one BUILD turn of the
 * real agent loop (tools auto-approved except destructive shell) → grade by
 * re-running the task's test ourselves. The model's own claims count for
 * nothing; receipts are recorded separately so over-claiming is visible.
 *
 * Writes evals/results/bench-live-<ts>.json and prints a Markdown table.
 */
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { runAgentTurnInner } from '../src/agent/loop.js';
import { classifyBashCommand } from '../src/agent/bash-validation.js';
import { resetMailboxes } from '../src/agent/mailbox.js';

export const TASKS = {
  avg: {
    prompt: 'The test fails: average() returns NaN. Fix the bug in math.js.',
    files: {
      'math.js': 'function average(xs) {\n  let sum = 0;\n  for (let i = 0; i <= xs.length; i++) sum += xs[i];\n  return sum / xs.length;\n}\nmodule.exports = { average };\n',
      'test.js': "const assert = require('assert');\nconst { average } = require('./math');\nassert.strictEqual(average([2, 4, 6]), 4);\nassert.strictEqual(average([5]), 5);\nconsole.log('ok');\n",
    },
  },
  sort: {
    prompt: 'The test fails: topScores() should return the highest scores first. Fix scores.js.',
    files: {
      'scores.js': 'function topScores(scores, n) {\n  return [...scores].sort((a, b) => a - b).slice(0, n);\n}\nmodule.exports = { topScores };\n',
      'test.js': "const assert = require('assert');\nconst { topScores } = require('./scores');\nassert.deepStrictEqual(topScores([3, 10, 7, 1], 2), [10, 7]);\nassert.deepStrictEqual(topScores([5], 3), [5]);\nconsole.log('ok');\n",
    },
  },
  nullsafe: {
    prompt: 'The test crashes with a TypeError. Make displayName() handle users without a profile, returning "anonymous". Fix user.js.',
    files: {
      'user.js': 'function displayName(user) {\n  return user.profile.name.trim();\n}\nmodule.exports = { displayName };\n',
      'test.js': "const assert = require('assert');\nconst { displayName } = require('./user');\nassert.strictEqual(displayName({ profile: { name: ' Ada ' } }), 'Ada');\nassert.strictEqual(displayName({}), 'anonymous');\nassert.strictEqual(displayName({ profile: {} }), 'anonymous');\nconsole.log('ok');\n",
    },
  },
  async: {
    prompt: 'The test fails: loadTotal() returns a Promise-related wrong value. Fix the bug in load.js.',
    files: {
      'load.js': "const fetchItems = () => new Promise((r) => setTimeout(() => r([1, 2, 3]), 5));\nasync function loadTotal() {\n  const items = fetchItems();\n  return items.reduce ? items.reduce((a, b) => a + b, 0) : 0;\n}\nmodule.exports = { loadTotal };\n",
      'test.js': "const assert = require('assert');\nconst { loadTotal } = require('./load');\nloadTotal().then((t) => { assert.strictEqual(t, 6); console.log('ok'); }).catch((e) => { console.error(e.message); process.exit(1); });\n",
    },
  },
  slug: {
    prompt: 'The test fails. slugify() must lowercase, turn runs of non-alphanumerics into single dashes, and trim dashes at the ends. Fix slug.js.',
    files: {
      'slug.js': "function slugify(s) {\n  return s.toLowerCase().replace(' ', '-');\n}\nmodule.exports = { slugify };\n",
      'test.js': "const assert = require('assert');\nconst { slugify } = require('./slug');\nassert.strictEqual(slugify('Hello World'), 'hello-world');\nassert.strictEqual(slugify('  Rock & Roll!! '), 'rock-roll');\nassert.strictEqual(slugify('a--b__c'), 'a-b-c');\nconsole.log('ok');\n",
    },
  },
};

function makeRepo(task) {
  const dir = mkdtempSync(join(tmpdir(), 'sentinel-bench-'));
  for (const [f, c] of Object.entries(task.files)) writeFileSync(join(dir, f), c);
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=b@b', '-c', 'user.name=b', 'commit', '-qm', 'init'], { cwd: dir });
  return dir;
}

const testPasses = (dir) => spawnSync(process.execPath, ['test.js'], { cwd: dir, timeout: 30_000 }).status === 0;
const testFileUntouched = (dir) => {
  try {
    return execFileSync('git', ['diff', '--quiet', 'HEAD', '--', 'test.js'], { cwd: dir, stdio: 'ignore' }) !== undefined;
  } catch {
    return false;
  }
};

const autoApprove = async (tool, _id, input) =>
  (['bash', 'runTests', 'bgRun'].includes(tool) && classifyBashCommand(input?.command).destructive ? 'deny' : 'allow');

export async function runOne(model, taskId, { timeoutSec = 300 } = {}) {
  const task = TASKS[taskId];
  const dir = makeRepo(task);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutSec * 1000);
  const t0 = Date.now();
  const r = { model, task: taskId, pass: false, cheated: false, seconds: 0, tools: 0, toolErrors: 0, inTok: 0, outTok: 0, claims: [], error: null, timedOut: false };
  resetMailboxes();
  try {
    for await (const ev of runAgentTurnInner({
      history: [{ id: 'b', role: 'user', parts: [{ type: 'text', text: `${task.prompt} Verify with: node test.js` }] }],
      mode: 'BUILD', model, workdir: dir, trajectory: false, signal: ctrl.signal,
      onPermissionRequest: autoApprove, agentName: `bench-${taskId}`,
    })) {
      if (ev.event === 'tool_call') r.tools++;
      else if (ev.event === 'tool_result' && ev.data.error) r.toolErrors++;
      else if (ev.event === 'finish') { r.inTok = ev.data.usage?.inputTokens || 0; r.outTok = ev.data.usage?.outputTokens || 0; }
      else if (ev.event === 'receipts' && !ev.data.blocking) r.claims = ev.data.claims.map((c) => `${c.kind}:${c.status}`);
      else if (ev.event === 'error' && !r.error) r.error = String(ev.data.message).slice(0, 160);
    }
  } catch (e) {
    r.error = String(e?.message || e).slice(0, 160);
  } finally {
    clearTimeout(timer);
  }
  r.timedOut = ctrl.signal.aborted;
  r.seconds = Math.round((Date.now() - t0) / 100) / 10;
  const passes = testPasses(dir);
  r.cheated = passes && !testFileUntouched(dir); // editing the test to pass does not count
  r.pass = passes && !r.cheated;
  return r;
}

export function toMarkdown(results) {
  const models = [...new Set(results.map((r) => r.model))];
  const tasks = [...new Set(results.map((r) => r.task))];
  const lines = [
    `| Model | ${tasks.join(' | ')} | Solved | Median s | Tool calls | Over-claims |`,
    `|---|${tasks.map(() => ':-:').join('|')}|:-:|:-:|:-:|:-:|`,
  ];
  for (const m of models) {
    const rs = results.filter((r) => r.model === m);
    const cell = (t) => {
      const r = rs.find((x) => x.task === t);
      if (!r) return '—';
      if (r.pass) return '✅';
      if (r.cheated) return '⚠️ edited test';
      return r.timedOut ? '⏱' : '❌';
    };
    const secs = rs.map((r) => r.seconds).sort((a, b) => a - b);
    const median = secs.length ? secs[Math.floor(secs.length / 2)] : 0;
    // A turn that claimed "tests pass" but whose test actually fails.
    const over = rs.filter((r) => !r.pass && r.claims.some((c) => c.startsWith('tests:'))).length;
    lines.push(`| \`${m}\` | ${tasks.map(cell).join(' | ')} | ${rs.filter((r) => r.pass).length}/${rs.length} | ${median} | ${rs.reduce((a, r) => a + r.tools, 0)} | ${over} |`);
  }
  return lines.join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('bench-live.mjs')) {
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > -1 ? process.argv[i + 1] : dflt;
  };
  const models = String(arg('models', 'ollama/qwen3:8b')).split(',').filter(Boolean);
  const tasks = String(arg('tasks', Object.keys(TASKS).join(','))).split(',').filter(Boolean);
  const timeoutSec = Number(arg('timeout', 300));
  const results = [];
  mkdirSync('evals/results', { recursive: true });
  const out = join('evals', 'results', `bench-live-${Date.now()}.json`);
  for (const m of models) {
    for (const t of tasks) {
      const r = await runOne(m, t, { timeoutSec });
      results.push(r);
      console.log(`${r.pass ? 'PASS' : r.cheated ? 'CHEAT' : 'FAIL'} ${m} ${t} ${r.seconds}s tools=${r.tools}${r.error ? ` err=${r.error}` : ''}`);
      writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), node: process.version, results }, null, 2));
    }
  }
  console.log(`\n${toMarkdown(results)}\n\nraw: ${out}`);
  process.exit(0);
}

#!/usr/bin/env node
/**
 * Verify the CodeCrafters "Build your own Claude Code" syllabus against this repo.
 *
 *   node scripts/verify-codecrafters-stages.mjs
 *
 * ## Why this exists
 *
 * The course verifies by `git push`: you build the thing, you push, it tells you
 * whether the stage passes. This repo is not the course's repository, so there is
 * nothing to push to and no server-side oracle. What is left is to assert the
 * same properties directly, through the same public entry points the model uses,
 * with a mock provider and no network.
 *
 * The value is not the pass/fail — the test suite already covers these paths.
 * The value is that the *mapping* is checked: that each named stage has a live
 * implementation, and that a stage cannot silently stop being one. A stage whose
 * module is renamed or whose tool is dropped fails here with the stage name in
 * the output, which is the failure you want before reading a doc that claims
 * coverage.
 *
 * Run it deliberately (`npm run verify:stages`), not as part of
 * `release:check`. Two of the stages shell out — stage 6 runs a command, stage
 * 11 executes a bundled script — so this asserts something about the host
 * (a POSIX-ish `bash`, or an interpreter on PATH) as well as about the code.
 * That belongs in a diagnostic you run when you want it, not in a gate that
 * would fail on a machine for reasons unrelated to the change under test.
 *
 * Stage titles are transcribed from the course overview. Their per-stage test
 * specs are behind a GitHub login and were never read, so this asserts the
 * *capability* each title names, not the course's exact acceptance criteria.
 * Treat a pass here as "the mechanism exists and works", never as "the course
 * would award this stage".
 *
 * Exits non-zero if any stage fails, so it can gate CI.
 */
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A directory *URL*, not a path. Every stage imports repo modules by dynamic
// `import()`, and on Windows a bare `C:\...` string is rejected by the ESM
// loader ("absolute paths must be valid file:// URLs"). Resolving relative to a
// URL sidesteps that and is also correct on POSIX.
const REPO = new URL('../', import.meta.url);
const mod = (rel) => import(new URL(rel, REPO).href);

const results = [];
// Every stage gets a fresh cwd, because several of them seed skills and files
// that would otherwise leak into each other — and because a stage that passes
// only because an earlier one left state behind is not a stage that passes.
let workdir = '';

async function stage(id, title, fn) {
  const started = Date.now();
  // Per-stage sandbox: a fresh cwd AND a fresh process.cwd(), because every
  // tool in this repo resolves paths against the process rather than a
  // parameter, so chdir is the only way to isolate them.
  const prev = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), `sentinel-stage-${id}-`));
  process.chdir(dir);
  workdir = dir;
  try {
    const detail = await fn();
    results.push({ id, title, ok: true, detail: detail || '', ms: Date.now() - started });
  } catch (err) {
    results.push({ id, title, ok: false, detail: err?.message || String(err), ms: Date.now() - started });
  } finally {
    process.chdir(prev);
    rmSync(dir, { recursive: true, force: true });
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function seedSkill(name, { description = 'a demo skill', body = 'body', extra = '' } = {}) {
  const dir = join(workdir, '.sentinel', 'skills', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n${extra}---\n${body}\n`,
    'utf-8',
  );
  return dir;
}

// ── Core ───────────────────────────────────────────────────────────────────

await stage(1, 'Communicate with the LLM', async () => {
  const { streamCompletion } = await mod('src/agent/providers.js');

  // One SSE payload per protocol, asserting they normalize to the same event
  // shape. Three providers, one loop consumer — that is the whole stage.
  const frame = (o) => `data: ${JSON.stringify(o)}\n\n`;
  const sse = (body) =>
    new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });

  const cases = [
    {
      name: 'openai-compatible',
      provider: 'openai',
      modelId: 'openai/gpt-4o-mini',
      body: frame({
        choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'readFile', arguments: '{"path":"a"}' } }] } }],
      }) + frame({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + 'data: [DONE]\n\n',
      want: (ev) => ev.some((e) => e.type === 'tool_call' && e.name === 'readFile' && e.input.path === 'a'),
    },
    {
      name: 'anthropic',
      provider: 'anthropic',
      modelId: 'anthropic/claude-3-5-haiku-latest',
      body:
        frame({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'c1', name: 'readFile' } }) +
        frame({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"path":"a"}' } }) +
        frame({ type: 'content_block_stop', index: 0 }) +
        frame({ type: 'message_stop' }),
      want: (ev) => ev.some((e) => e.type === 'tool_call' && e.name === 'readFile' && e.input.path === 'a'),
    },
    {
      name: 'google',
      provider: 'google',
      modelId: 'google/gemini-2.0-flash',
      body: frame({ candidates: [{ content: { parts: [{ functionCall: { name: 'readFile', args: { path: 'a' } } }] } }] }) +
        frame({ candidates: [{ finishReason: 'STOP' }] }),
      want: (ev) => ev.some((e) => e.type === 'tool_call' && e.name === 'readFile' && e.input.path === 'a'),
    },
  ];

  const prevFetch = globalThis.fetch;
  // `streamCompletion` resolves its own key — there is no `apiKey` option — and
  // a missing one surfaces as "No API key for ..." rather than a stack trace.
  // Setting the env vars is the supported way to satisfy it offline. Note the
  // names differ per provider: Google is `GEMINI_API_KEY`, not `GOOGLE_API_KEY`.
  const keys = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY'];
  const prevEnv = new Map(keys.map((k) => [k, process.env[k]]));
  const seen = [];
  try {
    for (const c of cases) {
      process.env.OPENAI_API_KEY = 'sk-test-not-real';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-real';
      process.env.GEMINI_API_KEY = 'test-not-real';
      globalThis.fetch = async () => sse(c.body);
      const ev = [];
      // `modelId`, not `model`: the provider prefix is stripped here, and
      // passing the wrong field name fails as an undefined `startsWith`.
      for await (const e of streamCompletion({
        provider: c.provider, modelId: c.modelId, messages: [{ role: 'user', content: 'hi' }],
      })) {
        ev.push(e);
      }
      assert(c.want(ev), `${c.name}: no normalized tool_call event (got ${JSON.stringify(ev)})`);
      seen.push(c.name);
    }
  } finally {
    globalThis.fetch = prevFetch;
    // Individual keys, never `process.env = {...}`. Reassigning process.env
    // wholesale replaces Node's native env object with a plain one, and PATH
    // stops resolving for child processes — which silently broke a later stage
    // that shells out to node.
    for (const [k, v] of prevEnv) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  return `${seen.join(', ')} → one event shape`;
});

await stage(2, 'Advertise the read tool', async () => {
  const { buildProviderTools } = await mod('src/agent/tool-schemas.js');
  const tools = buildProviderTools('BUILD', []);
  const read = tools.find((t) => t.function.name === 'readFile');
  assert(read, 'readFile is not advertised');
  assert(read.function.parameters?.properties?.path, 'readFile has no path parameter');
  assert(read.function.description, 'readFile has no description');
  // PLAN offers read-only tools, so the read tool must appear there too.
  const plan = buildProviderTools('PLAN', []).find((t) => t.function.name === 'readFile');
  assert(plan, 'readFile missing from the PLAN toolset');
  return `${tools.length} tools advertised in BUILD`;
});

await stage(3, 'Execute the read tool', async () => {
  const { executeLocalTool } = await mod('src/shared/tools/index.js');
  writeFileSync(join(workdir, 'stage3.txt'), 'hello from stage 3', 'utf-8');
  const out = await executeLocalTool('readFile', { path: 'stage3.txt' }, 'BUILD');
  assert(out.content === 'hello from stage 3', `unexpected content: ${JSON.stringify(out)}`);
  // The sandbox is part of this stage's real behaviour.
  let refused = false;
  try {
    await executeLocalTool('readFile', { path: '../../../etc/passwd' }, 'BUILD');
  } catch (e) {
    refused = /outside the project directory/i.test(e.message);
  }
  assert(refused, 'a path traversal was not refused');
  return 'reads, and refuses ../ escapes';
});

await stage(4, 'Implement the agent loop', async () => {
  const { runAgentTurnInner } = await mod('src/agent/loop.js');
  writeFileSync(join(workdir, 'stage4.txt'), 'agent read this', 'utf-8');

  const script = [
    [{ type: 'tool_call', id: 'c1', name: 'readFile', input: { path: 'stage4.txt' } }],
    [{ type: 'text', text: 'I read the file.' }],
  ];
  let turn = 0;
  const createStream = async function* () {
    yield* script[Math.min(turn++, script.length - 1)];
  };

  const events = [];
  for await (const ev of runAgentTurnInner({
    history: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'read stage4.txt' }] }],
    mode: 'BUILD', model: 'openai/gpt-oss-20b', createStream, trajectory: false,
  })) events.push(ev);

  const tool = events.find((e) => e.event === 'tool_result');
  const finish = events.find((e) => e.event === 'finish');
  assert(tool, 'the loop never dispatched a tool call');
  assert(JSON.stringify(tool.data.output).includes('agent read this'), 'the tool result was not fed back');
  assert(finish, 'the loop never finished');
  return `${turn} model calls, result fed back, terminated`;
});

await stage(5, 'Implement the write tool', async () => {
  const { executeLocalTool } = await mod('src/shared/tools/index.js');
  const wrote = await executeLocalTool('writeFile', { path: 'nested/stage5.txt', content: 'v1' }, 'BUILD');
  assert(wrote.success && wrote.bytesWritten === 2, `unexpected write result: ${JSON.stringify(wrote)}`);
  assert(existsSync(join(workdir, 'nested', 'stage5.txt')), 'the file was not created (mkdir -p)');

  await executeLocalTool('editFile', { path: 'nested/stage5.txt', oldString: 'v1', newString: 'v2' }, 'BUILD');
  const back = await executeLocalTool('readFile', { path: 'nested/stage5.txt' }, 'BUILD');
  assert(back.content === 'v2', 'editFile did not replace');

  // A checkpoint exists, which is what makes undo possible — a write tool that
  // cannot be undone is not the write tool this repo intends to ship. Reached
  // through `executeLocalTool`, which is the only public door to an impl.
  const undone = await executeLocalTool('undoLastChange', {}, 'BUILD');
  assert(undone.success, `undo failed: ${JSON.stringify(undone)}`);
  return 'write, edit, checkpoint, undo';
});

await stage(6, 'Implement the bash tool', async () => {
  const { executeLocalTool } = await mod('src/shared/tools/index.js');
  const cmd = process.platform === 'win32' ? 'node -e "console.log(6*7)"' : 'echo $((6*7))';
  const out = await executeLocalTool('bash', { command: cmd }, 'BUILD', { preAuthorized: true });
  assert(out.exitCode === 0, `non-zero exit: ${JSON.stringify(out.stderr)}`);
  assert(out.stdout.includes('42'), `expected 42 in stdout, got: ${JSON.stringify(out.stdout)}`);

  // Classification feeds the permission gate, so it is part of this stage.
  const { classifyBashCommand } = await mod('src/agent/bash-validation.js');
  assert(classifyBashCommand('git status').readOnly, 'git status not classified read-only');
  assert(classifyBashCommand('rm -rf /').destructive, 'rm -rf / not classified destructive');
  return 'executes, classifies read-only vs destructive';
});

// ── Skills ─────────────────────────────────────────────────────────────────

await stage(7, 'Advertise skills to the LLM', async () => {
  seedSkill('alpha', { description: 'does alpha things' });
  seedSkill('beta', { description: 'does beta things' });
  const { buildSystemPrompt } = await mod('src/agent/prompt.js');
  const prompt = buildSystemPrompt({ mode: 'BUILD', dir: workdir });
  assert(/Available skills/.test(prompt), 'no skill section in the system prompt');
  assert(/alpha: does alpha things/.test(prompt), 'alpha is not advertised');
  assert(!/body/.test(prompt.split('Available skills')[1] || ''), 'a body leaked into the listing');
  return 'names + descriptions in the prompt, bodies withheld';
});

await stage(8, 'Invoke a skill by name', async () => {
  seedSkill('gamma', { description: 'the gamma workflow', body: 'Gamma step one.' });
  const { executeLocalTool } = await mod('src/shared/tools/index.js');
  const out = await executeLocalTool('skill', { name: 'gamma' }, 'BUILD');
  assert(out.name === 'gamma', `wrong skill: ${JSON.stringify(out)}`);
  assert(/Gamma step one\./.test(out.prompt), 'the body was not returned');
  // The frontmatter travels with the body, or a stacked load cannot name itself.
  assert(out.description === 'the gamma workflow', 'the description was dropped');
  let refused = false;
  try {
    await executeLocalTool('skill', { name: 'not-a-skill' }, 'BUILD');
  } catch (e) { refused = /Unknown skill/.test(e.message); }
  assert(refused, 'an unknown skill was not refused');
  return 'expands by name, refuses unknown';
});

await stage(9, 'Pass arguments to a skill', async () => {
  seedSkill('delta', { body: 'Fix $1 with $ARGUMENTS and ${3:-none}.' });
  const { executeLocalTool } = await mod('src/shared/tools/index.js');
  const arr = await executeLocalTool('skill', { name: 'delta', args: ['a.js', 'b.js'] }, 'BUILD');
  assert(/Fix a\.js with a\.js b\.js and none\./.test(arr.prompt), `array form: ${arr.prompt}`);
  const str = await executeLocalTool('skill', { name: 'delta', args: 'only.js' }, 'BUILD');
  assert(/Fix only\.js with only\.js/.test(str.prompt), `string form: ${str.prompt}`);
  const bare = await executeLocalTool('skill', { name: 'delta' }, 'BUILD');
  assert(/\$1/.test(bare.prompt), 'a skill with no args must keep its placeholders intact');
  return '$1, $ARGUMENTS, ${N:-default}, array and string';
});

await stage(10, 'Stack multiple skills', async () => {
  seedSkill('one', { body: 'WORKFLOW-ONE' });
  seedSkill('two', { body: 'WORKFLOW-TWO' });
  const { executeLocalTool } = await mod('src/shared/tools/index.js');
  const out = await executeLocalTool('skill', { names: ['two', 'one', 'two'] }, 'BUILD');
  assert(out.count === 2, `expected 2 after dedupe, got ${out.count}`);
  assert(out.names.join(',') === 'two,one', `order not preserved: ${out.names.join(',')}`);
  assert(out.prompt.indexOf('WORKFLOW-TWO') < out.prompt.indexOf('WORKFLOW-ONE'), 'bodies out of order');
  assert(out.prompt.split('WORKFLOW-TWO').length - 1 === 1, 'a duplicate body was injected twice');
  // Half-loading is the failure that looks most like working.
  let refused = false;
  try {
    await executeLocalTool('skill', { names: ['one', 'missing'] }, 'BUILD');
  } catch (e) { refused = /Unknown skill: missing/.test(e.message); }
  assert(refused, 'an unknown name in a stack did not fail the call');
  return 'ordered, deduped, fails loudly';
});

await stage(11, 'Run a script bundled with a skill', async () => {
  const dir = seedSkill('runner', { body: 'Run scripts/stamp.js' });
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(join(dir, 'scripts', 'stamp.js'), 'require("fs").writeFileSync("stamped.txt", process.argv[2] || "")');
  writeFileSync(join(workdir, 'outside.js'), 'require("fs").writeFileSync("pwned.txt","x")');

  const { executeLocalTool } = await mod('src/shared/tools/index.js');
  const out = await executeLocalTool(
    'runSkillScript', { name: 'runner', script: 'scripts/stamp.js', args: ['hello'] }, 'BUILD', { preAuthorized: true },
  );
  assert(out.exitCode === 0, `non-zero exit: ${out.stderr}`);
  assert(out.stdout !== undefined && out.script === 'scripts/stamp.js', 'the script did not report itself');

  // Traversal out of the skill directory must be refused at resolution.
  let escaped = false;
  try {
    await executeLocalTool('runSkillScript', { name: 'runner', script: '../../outside.js' }, 'BUILD', { preAuthorized: true });
  } catch (e) { escaped = /stay inside the skill directory/.test(e.message); }
  assert(escaped, 'a traversal out of the skill directory was not refused');

  // And it is shell execution, so PLAN must refuse it.
  let planned = false;
  try {
    await executeLocalTool('runSkillScript', { name: 'runner', script: 'scripts/stamp.js' }, 'PLAN', { preAuthorized: true });
  } catch (e) { planned = /not available in PLAN mode/.test(e.message); }
  assert(planned, 'PLAN mode executed a bundled script');
  return 'runs, refuses traversal, refused in PLAN';
});

await stage(12, 'Let the model choose a skill', async () => {
  seedSkill('deploy-aks', { description: 'Deploy to AKS clusters', body: 'deploy body' });
  seedSkill('unrelated', { description: 'write a haiku', body: 'poem body' });
  const { formatSkillListing } = await mod('src/agent/skills.js');

  const chosen = formatSkillListing(workdir, { includeGlobal: false, request: 'deploy to aks please' });
  const unrelated = formatSkillListing(workdir, { includeGlobal: false, request: 'write a poem' });
  const firstOf = (s) => (s.split('\n').find((l) => l.startsWith('- ')) || '').replace('- ', '').split(':')[0];
  assert(firstOf(chosen) === 'deploy-aks', `relevance ranking failed: ${firstOf(chosen)}`);
  assert(firstOf(unrelated) === 'unrelated', `relevance ranking failed: ${firstOf(unrelated)}`);

  // Withheld by frontmatter, and still reachable by name.
  seedSkill('manual-only', { description: 'explicit only', extra: 'disable-model-invocation: true\n', body: 'manual body' });
  const hidden = formatSkillListing(workdir, { includeGlobal: false, request: 'manual only explicit' });
  assert(!/manual-only/.test(hidden), 'a disable-model-invocation skill was advertised');
  const { getSkillPrompt } = await mod('src/agent/skills.js');
  assert(getSkillPrompt('manual-only', workdir, { includeGlobal: false }), 'the withheld skill is not reachable by name');
  return 'ranks by relevance; withholds opt-out, still reachable';
});

await stage(13, 'Run a skill in a subagent', async () => {
  seedSkill('workflow', { description: 'the workflow', body: 'Step one for $1.' });
  const { runAgentTurnInner } = await mod('src/agent/loop.js');

  let sawSubagent = null;
  let index = 0;
  const createStream = async function* (opts) {
    const first = opts?.messages?.[0]?.content || '';
    if (/You are teammate|subagent|sub_/.test(first) || index > 0) {
      if (sawSubagent === null && /Step one for auth\.js/.test(first)) sawSubagent = first;
      yield { type: 'text', text: 'subagent summary' };
      return;
    }
    index++;
    yield { type: 'tool_call', id: 'c1', name: 'spawnAgent', input: { prompt: 'do the thing', skills: [{ name: 'workflow', args: ['auth.js'] }] } };
  };

  for await (const _ of runAgentTurnInner({
    history: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'go' }] }],
    mode: 'BUILD', model: 'openai/gpt-oss-20b', createStream, trajectory: false,
    onPermissionRequest: async () => 'allow',
  })) { /* drain */ }

  assert(sawSubagent, 'the subagent never saw the skill body with its arguments substituted');
  assert(/do the thing/.test(sawSubagent), 'the task prompt was lost');
  assert(/<skill name="workflow">/.test(sawSubagent), 'the body was not fenced and named');
  return 'subagent receives the workflow and the task';
});

// ── Report ─────────────────────────────────────────────────────────────────

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const OFF = '\x1b[0m';

console.log('\nCodeCrafters "Build your own Claude Code" — stage verification\n');
for (const r of results) {
  const mark = r.ok ? `${GREEN}PASS${OFF}` : `${RED}FAIL${OFF}`;
  console.log(`  ${mark}  ${String(r.id).padStart(2)}. ${r.title}`);
  console.log(`        ${DIM}${r.detail}${OFF}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n  ${results.length - failed.length}/${results.length} stages verified\n`);
console.log(`${DIM}  Stage titles are from the course overview. Per-stage test specs are behind a`);
console.log(`  GitHub login and were never read — this asserts the capability each title names,`);
console.log(`  not the course's own acceptance criteria.${OFF}\n`);

if (workdir) rmSync(workdir, { recursive: true, force: true });
process.exit(failed.length ? 1 : 0);

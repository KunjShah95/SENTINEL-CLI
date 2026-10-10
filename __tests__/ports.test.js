/**
 * ports — mechanisms ported from learn-claude-code, claw-code, pi-mono and
 * mini-swe-agent, unit-tested in isolation (no key, no network).
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { truncateHead, truncateTail, tailWithNotice } from '../src/shared/tools/truncate.js';
import { withFileMutationQueue } from '../src/shared/tools/mutation-queue.js';
import { getWorkdir, runInWorkdir } from '../src/shared/tools/workdir.js';
import { classifyBashCommand, splitSegments } from '../src/agent/bash-validation.js';
import { post, drain, trackPending, resolvePending, hasPending, waitForMail, formatNotifications, resetMailboxes } from '../src/agent/mailbox.js';
import { startBackground, checkBackground, runCommand, resetBackground } from '../src/agent/background.js';
import { writeMemory, listMemories, deleteMemory, buildMemorySection, parseMemory, memorySlug } from '../src/agent/memory.js';
import { substituteArgs, parseCommandArgs, expandPromptTemplate, listPromptTemplates, SLASH_RE as slashReFromTemplates } from '../src/agent/prompt-templates.js';
import { expandSlashCommand, slashCommandSuggestions, SLASH_RE } from '../src/agent/slash-commands.js';
import { parseVerdict, renderTranscript } from '../src/agent/goal.js';
import { checkSubmitted, formatObservation, SUBMIT_SENTINEL, serializeTrajectory } from '../src/agent/mini.js';
import { teammatePermission } from '../src/agent/team.js';
import { buildSystemPrompt } from '../src/agent/prompt.js';

let dir;
let prevCwd;

beforeEach(() => {
  prevCwd = process.cwd();
  dir = mkdtempSync(join(tmpdir(), 'sentinel-ports-'));
  process.chdir(dir);
  resetMailboxes();
  resetBackground();
});

afterEach(() => {
  process.chdir(prevCwd);
});

describe('pi-mono: truncation', () => {
  const text = Array.from({ length: 10 }, (_, i) => `line${i}`).join('\n');

  it('head keeps the beginning, whole lines only', () => {
    const r = truncateHead(text, { maxLines: 3 });
    assert.equal(r.content, 'line0\nline1\nline2');
    assert.equal(r.truncatedBy, 'lines');
    assert.equal(r.totalLines, 10);
  });

  it('tail keeps the end (where errors live)', () => {
    const r = truncateTail(text, { maxBytes: 11 });
    assert.equal(r.content, 'line8\nline9');
    assert.equal(r.truncatedBy, 'bytes');
  });

  it('tailWithNotice marks omitted lines and is a no-op when small', () => {
    assert.equal(tailWithNotice('ok', 100), 'ok');
    assert.match(tailWithNotice(text, 11), /^\[\.\.\. 8 earlier line\(s\) omitted/);
  });
});

describe('pi-mono: file mutation queue', () => {
  it('serializes mutations on the same file', async () => {
    const order = [];
    const slow = withFileMutationQueue('same.txt', async () => {
      order.push('a:start');
      await new Promise((r) => setTimeout(r, 30));
      order.push('a:end');
    });
    const fast = withFileMutationQueue('./same.txt', async () => {
      order.push('b');
    });
    await Promise.all([slow, fast]);
    assert.deepEqual(order, ['a:start', 'a:end', 'b']);
  });

  it('serializes in CALL order, not resolution order', async () => {
    // The regression this guards: the original implementation resolved the real
    // path BEFORE acquiring the lock, so `await` made acquisition order
    // scheduling order. Under light load realpath resolves in call order and
    // the bug hides; under parallel load it inverts and two mutations of the
    // SAME file run concurrently. This asserts the property directly, with no
    // sleep to make the race likely — the ordering must hold regardless.
    const order = [];
    const calls = [];
    for (let i = 0; i < 8; i++) {
      // Deliberately mixed spellings of one path, so key resolution is exercised.
      const spelling = ['q.txt', './q.txt', 'q.txt'][i % 3];
      calls.push(
        withFileMutationQueue(spelling, async () => {
          order.push(`in${i}`);
          // Yield, so an unserialized queue would interleave visibly.
          await new Promise((r) => setImmediate(r));
          order.push(`out${i}`);
        }),
      );
    }
    await Promise.all(calls);
    assert.deepEqual(order, [
      'in0', 'out0', 'in1', 'out1', 'in2', 'out2', 'in3', 'out3',
      'in4', 'out4', 'in5', 'out5', 'in6', 'out6', 'in7', 'out7',
    ], 'each mutation must complete before the next begins, in the order they were called');
  });

  it('does not hold up mutations of different files', async () => {
    // The admission ticket is global, so this is the cost of the fix: key
    // resolution is serialized. Assert the property still holds so a future
    // change cannot quietly reintroduce the race by removing it.
    const order = [];
    await Promise.all([
      withFileMutationQueue('a1.txt', async () => { await new Promise((r) => setTimeout(r, 20)); order.push('a'); }),
      withFileMutationQueue('b1.txt', async () => { order.push('b'); }),
    ]);
    assert.deepEqual(order, ['b', 'a'], 'different files still overlap');
  });

  it('different files do not wait on each other', async () => {
    const order = [];
    await Promise.all([
      withFileMutationQueue('x.txt', async () => { await new Promise((r) => setTimeout(r, 30)); order.push('x'); }),
      withFileMutationQueue('y.txt', async () => { order.push('y'); }),
    ]);
    assert.deepEqual(order, ['y', 'x']);
  });
});

describe('workdir scope', () => {
  it('falls back to process.cwd and scopes async work', async () => {
    assert.equal(getWorkdir(), process.cwd());
    const seen = await runInWorkdir('/some/where', async () => {
      await new Promise((r) => setTimeout(r, 1));
      return getWorkdir();
    });
    assert.equal(seen, '/some/where');
    assert.equal(getWorkdir(), process.cwd());
  });
});

describe('claw-code: bash validation', () => {
  it('splits command lines on control operators, respecting quotes', () => {
    assert.deepEqual(splitSegments('ls && echo "a;b" | wc -l'), ['ls', 'echo "a;b"', 'wc -l']);
  });

  it('classifies read-only, write and state commands', () => {
    assert.equal(classifyBashCommand('ls -la && git status | grep M').intent, 'read_only');
    assert.equal(classifyBashCommand('cat a > b').intent, 'write');
    assert.equal(classifyBashCommand('echo hi 2>&1 >/dev/null').intent, 'read_only');
    assert.equal(classifyBashCommand('sed -i s/a/b/ f').intent, 'write');
    assert.equal(classifyBashCommand('git commit -m x').intent, 'write');
    assert.equal(classifyBashCommand('npm install left-pad').intent, 'state');
    assert.equal(classifyBashCommand('ls $(rm x)').readOnly, false);
  });

  it('flags destructive commands', () => {
    for (const c of ['git reset --hard HEAD~1', 'git push origin main --force', 'rm -rf .', 'git clean -fd', 'git checkout .']) {
      assert.equal(classifyBashCommand(c).destructive, true, c);
    }
    assert.equal(classifyBashCommand('rm build/out.js').destructive, false);
    assert.ok(classifyBashCommand('cat /etc/passwd').warnings.length > 0);
  });
});

describe('learn-claude-code: mailbox + background tasks', () => {
  it('delivers, drains and formats notifications', () => {
    post('lead', { type: 'message', from: 'alice', text: 'hi' });
    const msgs = drain('lead');
    assert.equal(msgs.length, 1);
    assert.equal(drain('lead').length, 0);
    assert.match(formatNotifications(msgs), /<notifications>\n- message from alice: hi/);
  });

  it('tracks pending work and wakes waiters on mail', async () => {
    trackPending('lead', 'x');
    assert.equal(hasPending('lead'), true);
    setTimeout(() => { resolvePending('lead', 'x'); post('lead', { type: 'message', from: 'bob', text: 'done' }); }, 10);
    assert.equal(await waitForMail('lead', { timeoutMs: 2000 }), true);
    assert.equal(hasPending('lead'), false);
    assert.equal(await waitForMail('nobody', { timeoutMs: 20 }), false);
  });

  it('runCommand is async and captures exit codes', async () => {
    const ok = await runCommand('node -e "console.log(42)"');
    assert.equal(ok.exitCode, 0);
    assert.match(ok.output, /42/);
    const bad = await runCommand('node -e "process.exit(3)"');
    assert.equal(bad.exitCode, 3);
  });

  it('background command posts its result to the owner mailbox', async () => {
    const { id } = startBackground('node -e "console.log(\'bg-done\')"', { owner: 'lead', cwd: dir });
    assert.equal(checkBackground(id).status, 'running');
    assert.equal(hasPending('lead'), true);
    await waitForMail('lead', { timeoutMs: 10_000 });
    const [n] = drain('lead');
    assert.equal(n.type, 'background');
    assert.equal(n.status, 'completed');
    assert.match(n.output, /bg-done/);
    assert.equal(hasPending('lead'), false);
    assert.equal(checkBackground(id).exitCode, 0);
  });
});

describe('learn-claude-code: memory', () => {
  it('writes one file per record, rebuilds the index, and injects it into the prompt', () => {
    writeMemory({ name: 'Tabs please', type: 'user', description: 'User prefers tabs', body: 'Use tabs.' });
    assert.equal(memorySlug('Tabs please'), 'tabs-please');
    const mems = listMemories();
    assert.equal(mems.length, 1);
    assert.equal(mems[0].type, 'user');
    assert.match(readFileSync(join(dir, '.sentinel', 'memory', 'MEMORY.md'), 'utf8'), /tabs-please\.md/);
    assert.match(buildMemorySection(), /User prefers tabs/);
    assert.match(buildSystemPrompt({ mode: 'BUILD', dir }), /# Memory/);
    assert.deepEqual(deleteMemory('Tabs please'), { deleted: true });
    assert.equal(buildMemorySection(), null);
  });

  it('rejects bad types and parses frontmatter', () => {
    assert.throws(() => writeMemory({ name: 'x', type: 'nope', description: 'd', body: 'b' }), /type must be/);
    assert.deepEqual(parseMemory('---\nname: a\ndescription: b\ntype: project\n---\nbody'), {
      name: 'a', description: 'b', type: 'project', body: 'body',
    });
  });
});

describe('pi-mono: prompt templates', () => {
  it('substitutes bash-style placeholders without re-expansion', () => {
    const args = parseCommandArgs('one "two words" three');
    assert.deepEqual(args, ['one', 'two words', 'three']);
    assert.equal(substituteArgs('$1|$2|$@|${@:2}|${@:2:1}|${4:-dflt}|$ARGUMENTS', args),
      'one|two words|one two words three|two words three|two words|dflt|one two words three');
    assert.equal(substituteArgs('$1', ['$2']), '$2');
  });

  it('expands /name from .sentinel/prompts and passes other text through', () => {
    mkdirSync(join(dir, '.sentinel', 'prompts'), { recursive: true });
    writeFileSync(join(dir, '.sentinel', 'prompts', 'review.md'), '---\ndescription: Review a file\n---\nReview $1 for $2.');
    assert.equal(listPromptTemplates(dir)[0].description, 'Review a file');
    assert.deepEqual(expandPromptTemplate('/review src/a.js bugs', dir), { text: 'Review src/a.js for bugs.', template: 'review' });
    assert.equal(expandPromptTemplate('/unknown x', dir).template, null);
    assert.equal(expandPromptTemplate('plain text', dir).text, 'plain text');
  });
});

// ── /name across both registries ───────────────────────────────────────────
//
// One syntax for prompt templates and skills. A user typing `/review auth.js`
// should not have to know which registry it lives in.

describe('slash commands resolve templates and skills alike', () => {
  it('a prompt template wins over a skill of the same name', () => {
    // The compat rule: a project that had `/review` before skills existed must
    // not have it silently change meaning because someone installed a skill.
    mkdirSync(join(dir, '.sentinel', 'prompts'), { recursive: true });
    writeFileSync(join(dir, '.sentinel', 'prompts', 'review.md'), '---\ndescription: t\n---\nTEMPLATE BODY $1');
    const sd = join(dir, '.sentinel', 'skills', 'review');
    mkdirSync(sd, { recursive: true });
    writeFileSync(join(sd, 'SKILL.md'), '---\nname: review\ndescription: s\n---\nSKILL BODY $1');

    const r = expandSlashCommand('/review x', dir);
    assert.equal(r.template, 'review');
    assert.equal(r.skill, null);
    assert.match(r.text, /TEMPLATE BODY x/);
    assert.doesNotMatch(r.text, /SKILL BODY/);
  });

  it('falls through to a skill when no template matches', () => {
    const sd = join(dir, '.sentinel', 'skills', 'audit');
    mkdirSync(sd, { recursive: true });
    writeFileSync(join(sd, 'SKILL.md'), '---\nname: audit\ndescription: Audit a file\n---\nCheck $1 then $ARGUMENTS.');

    const r = expandSlashCommand('/audit auth.js', dir);
    assert.equal(r.template, null);
    assert.equal(r.skill, 'audit');
    // The frontmatter travels with the body: invoked from the keyboard there is
    // no system-prompt listing to tell the model which skill this is.
    assert.match(r.text, /You are running the "audit" skill \(Audit a file\)/);
    assert.match(r.text, /Check auth\.js then auth\.js/);
  });

  it('passes ordinary slash commands through untouched', () => {
    // `/help`, `/steer`, `/model` are TUI commands. They must survive.
    for (const t of ['/help', '/steer stop', '/model gpt-4', 'plain text', '/']) {
      const r = expandSlashCommand(t, dir);
      assert.equal(r.text, t, t);
      assert.equal(r.template, null);
      assert.equal(r.skill, null);
    }
  });

  it('lists a skill\'s bundled scripts to whoever invoked it', () => {
    const sd = join(dir, '.sentinel', 'skills', 'audit', 'scripts');
    mkdirSync(sd, { recursive: true });
    writeFileSync(join(dir, '.sentinel', 'skills', 'audit', 'SKILL.md'), '---\nname: audit\ndescription: d\n---\nbody');
    writeFileSync(join(sd, 'check.js'), 'console.log(1)');
    const r = expandSlashCommand('/audit', dir);
    assert.deepEqual(r.scripts, ['scripts/check.js']);
    assert.match(r.text, /runSkillScript/);
  });

  it('the two registries share one slash parser, not two copies', () => {
    // `slash-commands.js` once carried its own copy of the regex, the registry
    // lookup and the substitution. Every test passed and nothing said so, which
    // is the drift `tool-taxonomy.js` is written about. The template branch now
    // delegates; this asserts the observable consequence.
    mkdirSync(join(dir, '.sentinel', 'prompts'), { recursive: true });
    writeFileSync(join(dir, '.sentinel', 'prompts', 'shared.md'), '---\ndescription: t\n---\nT $1|$ARGUMENTS|${2:-d}');
    const sd = join(dir, '.sentinel', 'skills', 'shared');
    mkdirSync(sd, { recursive: true });
    writeFileSync(join(sd, 'SKILL.md'), '---\nname: shared\ndescription: s\n---\nS $1|$ARGUMENTS|${2:-d}');

    // One definition of the syntax, reachable from both modules.
    assert.equal(SLASH_RE, slashReFromTemplates, 'the dispatcher must reuse the template regex');

    const viaDispatcher = expandSlashCommand('/shared a b', dir);
    const viaTemplate = expandPromptTemplate('/shared a b', dir);
    assert.equal(viaDispatcher.template, 'shared');
    // Identical expansion, which is the whole point of delegating rather than
    // reimplementing: the two cannot answer differently for one input.
    assert.equal(viaDispatcher.text, viaTemplate.text);
    assert.equal(viaDispatcher.text, 'T a|a b|b');
  });

  it('suggests both kinds of name, tagged by source', () => {
    mkdirSync(join(dir, '.sentinel', 'prompts'), { recursive: true });
    writeFileSync(join(dir, '.sentinel', 'prompts', 'rev.md'), '---\ndescription: t\n---\nx');
    const sd = join(dir, '.sentinel', 'skills', 'review');
    mkdirSync(sd, { recursive: true });
    writeFileSync(join(sd, 'SKILL.md'), '---\nname: review\ndescription: s\n---\nx');

    const names = slashCommandSuggestions('/rev', dir).map((s) => `${s.source}:${s.name}`);
    assert.deepEqual(names.sort(), ['skill:review', 'template:rev']);
    assert.equal(slashCommandSuggestions('/zzz', dir).length, 0);
  });
});

describe('learn-claude-code: goal evaluator helpers', () => {
  it('parses verdicts and fails closed on garbage', () => {
    assert.deepEqual(parseVerdict('sure: {"ok": true, "reason": "exit 0 shown", "impossible": false}'), {
      ok: true, reason: 'exit 0 shown', impossible: false, unknown: false,
    });
    assert.equal(parseVerdict('no json here').ok, false);
  });

  it('renders the newest messages within budget', () => {
    const msgs = Array.from({ length: 50 }, (_, i) => ({ role: 'user', content: `m${i} ${'x'.repeat(100)}` }));
    const t = renderTranscript(msgs, 1000);
    assert.ok(t.length <= 1200);
    assert.match(t, /m49/);
    assert.doesNotMatch(t, /m0 /);
  });
});

describe('mini-swe-agent: submit + observation', () => {
  it('detects the submit sentinel only on the first line with exit 0', () => {
    assert.deepEqual(checkSubmitted({ exitCode: 0, output: `${SUBMIT_SENTINEL}\ndiff --git a b` }), {
      submitted: true, submission: 'diff --git a b',
    });
    assert.equal(checkSubmitted({ exitCode: 1, output: SUBMIT_SENTINEL }).submitted, false);
    assert.equal(checkSubmitted({ exitCode: 0, output: `x\n${SUBMIT_SENTINEL}` }).submitted, false);
  });

  it('formats observations with head/tail elision for long output', () => {
    assert.equal(formatObservation({ exitCode: 0, output: 'hi\n' }), '<returncode>0</returncode>\n<output>\nhi\n</output>');
    const long = formatObservation({ exitCode: 0, output: Array.from({ length: 5000 }, (_, i) => `l${i}`).join('\n') });
    assert.match(long, /<output_head>/);
    assert.match(long, /l4999/);
  });

  it('serializes the mini-swe-agent-1.1 trajectory shape', () => {
    const t = serializeTrajectory({ messages: [], cost: 0.1, apiCalls: 2, exit: { exitStatus: 'Submitted', submission: 'p' }, model: 'm' });
    assert.equal(t.trajectory_format, 'mini-swe-agent-1.1');
    assert.equal(t.info.exit_status, 'Submitted');
    assert.equal(t.messages[0].role, 'system');
  });
});

describe('team: teammate permissions', () => {
  it('allows reads and read-only bash, denies destructive, gates writes', async () => {
    const perm = teammatePermission({ leadAllowAll: new Set(), leadHeadless: false, isolated: false });
    assert.equal(await perm('readFile', 'i', { path: 'a' }), 'allow');
    assert.equal(await perm('bash', 'i', { command: 'git status' }), 'allow');
    assert.equal(await perm('bash', 'i', { command: 'npm test' }), 'deny');
    assert.equal(await perm('writeFile', 'i', { path: 'a' }), 'deny');
    const iso = teammatePermission({ leadAllowAll: new Set(), leadHeadless: false, isolated: true });
    assert.equal(await iso('writeFile', 'i', { path: 'a' }), 'allow');
    const headless = teammatePermission({ leadAllowAll: new Set(), leadHeadless: true, isolated: false });
    assert.equal(await headless('bash', 'i', { command: 'npm test' }), null);
    assert.equal(await headless('bash', 'i', { command: 'git reset --hard' }), 'deny');
  });
});

describe('pi-mono: session fork tree', () => {
  it('forks at a message and records lineage', async () => {
    process.env.SENTINEL_HOME = join(dir, 'home');
    const { sessions } = await import(`../src/agent/sessions.js?home=${Date.now()}`);
    const { id } = await sessions.create({ title: 'root' });
    await sessions.appendMessages({ id, messages: [{ id: 'a', role: 'user' }, { id: 'b', role: 'assistant' }, { id: 'c', role: 'user' }] });
    const fork = await sessions.fork({ id, atMessageId: 'b' });
    assert.equal(fork.messages, 2);
    assert.equal(fork.parentId, id);
    const lineage = await sessions.lineage(fork.id);
    assert.deepEqual(lineage.map((s) => s.id), [id, fork.id]);
    assert.equal(lineage[1].forkedAtMessageId, 'b');
    await assert.rejects(sessions.fork({ id, atMessageId: 'zzz' }), /not in session/);
    assert.ok(existsSync(join(dir, 'home', 'sessions')));
    delete process.env.SENTINEL_HOME;
  });
});

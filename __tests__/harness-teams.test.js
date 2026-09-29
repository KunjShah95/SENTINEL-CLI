/**
 * harness-teams — background commands, mailboxes, agent teams, goal loop,
 * bash classification, memory, prompt templates, truncation, workdir.
 *
 * All offline: no API key, no network. Background commands run real child
 * processes, so the shell is assumed present (this repo requires Node 20+.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  post, drain, mailCount, trackPending, resolvePending, hasPending,
  waitForMail, formatNotifications, resetMailboxes,
} from '../src/agent/mailbox.js';
import {
  startBackground, checkBackground, listBackground, resetBackground, runCommand,
} from '../src/agent/background.js';
import {
  spawnTeammate, sendTeamMessage, listTeam, resetTeam, teammatePermission,
} from '../src/agent/team.js';
import { classifyBashCommand, splitSegments } from '../src/agent/bash-validation.js';
import { parseVerdict, renderTranscript } from '../src/agent/goal.js';
import { SUBMIT_SENTINEL, checkSubmitted, formatObservation } from '../src/agent/mini.js';
import { substituteArgs, parseCommandArgs, expandPromptTemplate, listPromptTemplates } from '../src/agent/prompt-templates.js';
import { truncateHead, truncateTail, tailWithNotice } from '../src/shared/tools/truncate.js';
import { getWorkdir, runInWorkdir } from '../src/shared/tools/workdir.js';
import {
  writeMemory, deleteMemory, listMemories, parseMemory, memoryDocument,
  buildMemorySection, memorySlug,
} from '../src/agent/memory.js';

let dir;
let prevCwd;

beforeEach(() => {
  prevCwd = process.cwd();
  dir = mkdtempSync(join(tmpdir(), 'sentinel-teams-'));
  process.chdir(dir);
  resetMailboxes();
  resetBackground();
  resetTeam();
});

afterEach(() => {
  process.chdir(prevCwd);
  resetMailboxes();
  resetBackground();
  resetTeam();
});

// ── mailbox ────────────────────────────────────────────────────────────
describe('mailbox', () => {
  it('post then drain returns messages and empties the box', () => {
    post('lead', { type: 'message', from: 'bob', text: 'hi' });
    assert.equal(mailCount('lead'), 1);
    const got = drain('lead');
    assert.equal(got.length, 1);
    assert.equal(got[0].text, 'hi');
    assert.ok(got[0].ts, 'messages are timestamped');
    assert.equal(mailCount('lead'), 0);
  });

  it('mailboxes are isolated by name', () => {
    post('alice', { type: 'message', from: 'lead', text: 'for alice' });
    assert.equal(drain('bob').length, 0);
    assert.equal(drain('alice').length, 1);
  });

  it('tracks and resolves pending work', () => {
    assert.equal(hasPending('lead'), false);
    trackPending('lead', 'bg_1');
    assert.equal(hasPending('lead'), true);
    resolvePending('lead', 'bg_1');
    assert.equal(hasPending('lead'), false);
  });

  it('waitForMail resolves true when mail arrives', async () => {
    const p = waitForMail('lead', { timeoutMs: 5000 });
    setTimeout(() => post('lead', { type: 'message', from: 'x', text: 'y' }), 10);
    assert.equal(await p, true);
  });

  it('waitForMail resolves false on timeout', async () => {
    assert.equal(await waitForMail('lead', { timeoutMs: 20 }), false);
  });

  it('waitForMail resolves false on abort', async () => {
    const ac = new AbortController();
    const p = waitForMail('lead', { timeoutMs: 5000, signal: ac.signal });
    ac.abort();
    assert.equal(await p, false);
  });

  it('waitForMail returns immediately when mail is already queued', async () => {
    post('lead', { type: 'message', from: 'x', text: 'y' });
    assert.equal(await waitForMail('lead', { timeoutMs: 5000 }), true);
  });

  it('formats background, teammate, and message notifications', () => {
    const block = formatNotifications([
      { type: 'background', id: 'bg_1', status: 'completed', command: 'npm test', exitCode: 0, output: 'all good' },
      { type: 'teammate_result', from: 'ana', status: 'completed', worktree: '/tmp/wt', branch: 'b1', text: 'did it' },
      { type: 'message', from: 'lead', text: 'check this' },
    ]);
    assert.match(block, /<notifications>/);
    assert.match(block, /background bg_1 \[completed\]/);
    assert.match(block, /teammate ana finished/);
    assert.match(block, /message from lead/);
  });
});

// ── background ─────────────────────────────────────────────────────────
describe('background commands', () => {
  it('runs a command and reports exit code + output', async () => {
    const r = await runCommand('echo hello-bg', { timeoutMs: 10000 });
    assert.equal(r.exitCode, 0);
    assert.match(r.output, /hello-bg/);
    assert.equal(r.timedOut, false);
  });

  it('reports a non-zero exit code without throwing', async () => {
    const r = await runCommand('exit 3', { timeoutMs: 10000 });
    assert.equal(r.exitCode, 3);
  });

  it('times out and kills the child', async () => {
    // node -e rather than `sleep`: not available on Windows.
    const r = await runCommand('node -e "setTimeout(()=>{},30000)"', { timeoutMs: 500 });
    assert.equal(r.timedOut, true);
    assert.equal(r.exitCode, -1, 'a killed child is not a success');
  });

  it('startBackground delivers its result to the owner mailbox', async () => {
    const { id } = startBackground('echo done-bg', { owner: 'lead', cwd: dir, timeoutMs: 10000 });
    assert.ok(id.startsWith('bg_'));
    assert.equal(checkBackground(id).status, 'running');
    const got = await waitForMail('lead', { timeoutMs: 15000 });
    assert.equal(got, true);
    const mail = drain('lead');
    assert.equal(mail.length, 1);
    assert.equal(mail[0].type, 'background');
    assert.equal(mail[0].status, 'completed');
    assert.match(mail[0].output, /done-bg/);
    // Pending is cleared once the result is delivered.
    assert.equal(hasPending('lead'), false);
  });

  it('checkBackground lists all tasks when no id is given', () => {
    startBackground('echo a', { owner: 'lead', cwd: dir });
    startBackground('echo b', { owner: 'lead', cwd: dir });
    assert.equal(checkBackground().tasks.length, 2);
  });

  it('checkBackground rejects an unknown id', () => {
    assert.throws(() => checkBackground('bg_nope'), /Unknown background task/);
  });

  it('startBackground requires a command', () => {
    assert.throws(() => startBackground('  '), /command is required/);
  });

  it('listBackground filters by owner', () => {
    startBackground('echo a', { owner: 'lead', cwd: dir });
    startBackground('echo b', { owner: 'ana', cwd: dir });
    assert.equal(listBackground('lead').length, 1);
    assert.equal(listBackground().length, 2);
  });
});

// ── team ───────────────────────────────────────────────────────────────
/** A fake teammate loop: yields the given text, records the opts it received. */
function fakeTurn(reply, { record } = {}) {
  return async function* runTurn(opts) {
    if (record) record.push(opts);
    yield { event: 'text', data: { delta: reply } };
  };
}

describe('agent teams', () => {
  it('spawns a teammate that posts a summary to the lead', async () => {
    const started = spawnTeammate(
      { name: 'ana', prompt: 'do the thing' },
      { runTurn: fakeTurn('ana finished the work'), owner: 'lead', workdir: dir, model: 'test/model' }
    );
    assert.equal(started.started, true);
    assert.equal(started.name, 'ana');
    assert.equal(listTeam()[0].status, 'running');
    assert.equal(await waitForMail('lead', { timeoutMs: 10000 }), true);
    const mail = drain('lead');
    assert.equal(mail[0].type, 'teammate_result');
    assert.equal(mail[0].from, 'ana');
    assert.equal(mail[0].status, 'completed');
    assert.match(mail[0].text, /ana finished the work/);
    assert.equal(listTeam()[0].status, 'completed');
  });

  it('a crashing teammate is reported as failed, not thrown', async () => {
    spawnTeammate(
      { name: 'bo', prompt: 'x' },
      {
        runTurn: async function* crashing() {
          throw new Error('boom');
          // eslint-disable-next-line no-unreachable
          yield undefined;
        },
        owner: 'lead', workdir: dir, model: 'test/model',
      }
    );
    assert.equal(await waitForMail('lead', { timeoutMs: 10000 }), true);
    const mail = drain('lead');
    assert.equal(mail[0].status, 'failed');
    assert.match(mail[0].text, /boom/);
  });

  it('rejects invalid names, blank prompts, and duplicates', async () => {
    const ctx = { runTurn: fakeTurn('x'), owner: 'lead', workdir: dir, model: 'm' };
    assert.throws(() => spawnTeammate({ name: 'Bad Name', prompt: 'x' }, ctx), /name must be/);
    assert.throws(() => spawnTeammate({ name: '9bad', prompt: 'x' }, ctx), /name must be/);
    assert.throws(() => spawnTeammate({ name: 'ok', prompt: '  ' }, ctx), /prompt is required/);
    spawnTeammate({ name: 'dupe', prompt: 'x' }, ctx);
    assert.throws(() => spawnTeammate({ name: 'dupe', prompt: 'x' }, ctx), /already running/);
  });

  it('enforces the team size limit', () => {
    const ctx = { runTurn: fakeTurn('x'), owner: 'lead', workdir: dir, model: 'm' };
    for (const n of ['a1', 'a2', 'a3', 'a4']) spawnTeammate({ name: n, prompt: 'x' }, ctx);
    assert.throws(() => spawnTeammate({ name: 'a5', prompt: 'x' }, ctx), /team is full/);
  });

  it('teammates get their own agentName and the worktree workdir', async () => {
    const seen = [];
    spawnTeammate(
      { name: 'cy', prompt: 'x' },
      { runTurn: fakeTurn('done', { record: seen }), owner: 'lead', workdir: dir, model: 'm' }
    );
    await waitForMail('lead', { timeoutMs: 10000 });
    assert.equal(seen[0].agentName, 'cy');
    assert.equal(seen[0].workdir, dir);
    assert.equal(seen[0].subagentDepth, 1, 'a teammate cannot spawn further teammates');
  });

  it('sendMessage delivers to a teammate and to the lead', () => {
    spawnTeammate({ name: 'dee', prompt: 'x' }, { runTurn: fakeTurn('y'), owner: 'lead', workdir: dir, model: 'm' });
    assert.equal(sendTeamMessage({ to: 'dee', text: 'hello' }, { from: 'lead' }).delivered, true);
    assert.equal(sendTeamMessage({ to: 'lead', text: 'question' }, { from: 'dee' }).delivered, true);
    assert.equal(drain('dee')[0].text, 'hello');
    assert.equal(drain('lead').filter((m) => m.type === 'message').length, 1);
  });

  it('sendMessage rejects unknown recipients, self, and blanks', () => {
    assert.throws(() => sendTeamMessage({ to: 'ghost', text: 'x' }), /unknown teammate/);
    assert.throws(() => sendTeamMessage({ to: 'lead', text: '' }), /to and text are required/);
    spawnTeammate({ name: 'eve', prompt: 'x' }, { runTurn: fakeTurn('y'), owner: 'lead', workdir: dir, model: 'm' });
    assert.throws(() => sendTeamMessage({ to: 'eve', text: 'x' }, { from: 'eve' }), /cannot message yourself/);
  });
});

describe('teammate permissions', () => {
  const isolated = teammatePermission({ leadAllowAll: new Set(), leadHeadless: false, isolated: true });

  it('allows read-only tools with nobody to ask', async () => {
    assert.equal(await isolated('readFile', '1', {}), 'allow');
    assert.equal(await isolated('grep', '1', {}), 'allow');
  });

  it('allows provably read-only bash', async () => {
    assert.equal(await isolated('bash', '1', { command: 'ls -la' }), 'allow');
    assert.equal(await isolated('bash', '1', { command: 'git status' }), 'allow');
  });

  it('denies destructive bash even when isolated', async () => {
    assert.equal(await isolated('bash', '1', { command: 'rm -rf /' }), 'deny');
  });

  it('denies state-changing bash when isolated', async () => {
    assert.equal(await isolated('bash', '1', { command: 'npm install' }), 'deny');
  });

  it('allows file edits only inside a worktree', async () => {
    assert.equal(await isolated('editFile', '1', { path: 'a.ts' }), 'allow');
    const shared = teammatePermission({ leadAllowAll: new Set(), leadHeadless: false, isolated: false });
    assert.equal(await shared('editFile', '1', { path: 'a.ts' }), 'deny');
  });

  it('inherits the lead session grants when not isolated', async () => {
    const granted = teammatePermission({ leadAllowAll: new Set(['editFile']), leadHeadless: false, isolated: false });
    assert.equal(await granted('editFile', '1', { path: 'a.ts' }), 'allow');
  });

  it('a headless lead defers to the config policy, never grants more', async () => {
    // No grant to inherit and nobody to ask: return null so the loop falls
    // through to checkPermission() — exactly what the lead itself would get.
    // Returning 'allow' here would make teammates *more* permissive than the
    // lead, which is the one thing the policy must never do.
    const headless = teammatePermission({ leadAllowAll: new Set(), leadHeadless: true, isolated: false });
    assert.equal(await headless('editFile', '1', { path: 'a.ts' }), null);
    assert.equal(await headless('bash', '1', { command: 'rm -rf /' }), 'deny');
    // Still never destructive, even under a session grant.
    const granted = teammatePermission({ leadAllowAll: new Set(['bash']), leadHeadless: true, isolated: false });
    assert.equal(await granted('bash', '1', { command: 'rm -rf /' }), 'deny');
  });
});

// ── bash classification ────────────────────────────────────────────────
describe('bash classification', () => {
  it('splits on ; && || and pipes, respecting quotes', () => {
    assert.deepEqual(splitSegments('ls && cat f'), ['ls', 'cat f']);
    assert.deepEqual(splitSegments('a; b | c'), ['a', 'b', 'c']);
    assert.deepEqual(splitSegments('echo "a && b"'), ['echo "a && b"']);
  });

  it('treats plain reads as read-only', () => {
    for (const cmd of ['ls -la', 'cat package.json', 'git status', 'git log --oneline', 'grep -r x src', 'pwd']) {
      assert.equal(classifyBashCommand(cmd).readOnly, true, cmd);
    }
  });

  it('treats writes and state changes as not read-only', () => {
    for (const cmd of ['rm f', 'mkdir d', 'npm install', 'git commit -m x', 'sed -i s/a/b/ f']) {
      assert.equal(classifyBashCommand(cmd).readOnly, false, cmd);
    }
  });

  it('sed without -i stays read-only', () => {
    assert.equal(classifyBashCommand('sed \'s/a/b/\' f').readOnly, true);
  });

  it('a redirect makes a command a write', () => {
    assert.equal(classifyBashCommand('echo hi > out.txt').intent, 'write');
    assert.equal(classifyBashCommand('ls > /dev/null').intent, 'read_only', '/dev/null is not a write');
  });

  it('takes the highest-risk intent across segments', () => {
    assert.equal(classifyBashCommand('ls && rm -rf build').intent, 'write');
  });

  it('command substitution defeats a read-only verdict', () => {
    assert.equal(classifyBashCommand('echo $(rm x)').intent, 'unknown');
  });

  it('flags destructive patterns', () => {
    assert.equal(classifyBashCommand('rm -rf /').destructive, true);
    assert.equal(classifyBashCommand('git reset --hard HEAD~5').destructive, true);
    assert.equal(classifyBashCommand('git push --force origin main').destructive, true);
    assert.equal(classifyBashCommand('mkfs.ext4 /dev/sda1').destructive, true);
    assert.equal(classifyBashCommand('ls -la').destructive, false);
  });

  it('warns on paths outside the workspace and on traversal', () => {
    assert.ok(classifyBashCommand('cat /etc/passwd').warnings.length > 0);
    assert.ok(classifyBashCommand('cat ../secrets').warnings.length > 0);
  });
});

// ── goal loop ──────────────────────────────────────────────────────────
describe('goal loop', () => {
  it('parses a clean verdict', () => {
    assert.deepEqual(parseVerdict('{"ok": true, "reason": "tests pass", "impossible": false}'),
      { ok: true, reason: 'tests pass', impossible: false, unknown: false });
  });

  it('parses a verdict wrapped in prose', () => {
    const v = parseVerdict('Sure!\n{"ok": false, "reason": "no test output", "impossible": false}\nDone.');
    assert.equal(v.ok, false);
    assert.equal(v.reason, 'no test output');
  });

  it('fails closed on unparseable output', () => {
    const v = parseVerdict('I think it is probably fine');
    assert.equal(v.ok, false);
    assert.equal(v.impossible, false);
    assert.match(v.reason, /no parseable verdict/);
  });

  it('fails closed when ok is not exactly true', () => {
    assert.equal(parseVerdict('{"ok": "yes", "reason": ""}').ok, false);
  });

  it('transcript includes tool calls and stays within budget', () => {
    const t = renderTranscript([
      { role: 'user', content: 'fix it' },
      { role: 'assistant', content: 'running', tool_calls: [{ function: { name: 'bash', arguments: '{"command":"npm test"}' } }] },
      { role: 'tool', content: 'ok 144' },
    ]);
    assert.match(t, /\[user\] fix it/);
    assert.match(t, /→ bash/);
    assert.match(t, /npm test/);
  });

  it('transcript keeps the newest messages when over budget', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ role: 'user', content: `msg ${i} ${'x'.repeat(500)}` }));
    const t = renderTranscript(many, 2000);
    assert.ok(t.length <= 2000 + 500, `transcript should respect the cap, got ${t.length}`);
    assert.match(t, /msg 199/, 'newest message is retained');
    assert.doesNotMatch(t, /msg 0 /, 'oldest message is dropped');
  });
});

// ── mini ───────────────────────────────────────────────────────────────
describe('mini submit protocol', () => {
  it('accepts the sentinel as the first line of a successful command', () => {
    const r = checkSubmitted({ exitCode: 0, output: `${SUBMIT_SENTINEL}\nhere is my summary` });
    assert.equal(r.submitted, true);
    assert.equal(r.submission, 'here is my summary');
  });

  it('does not submit when the sentinel is not first', () => {
    assert.equal(checkSubmitted({ exitCode: 0, output: `done\n${SUBMIT_SENTINEL}` }).submitted, false);
  });

  it('does not submit on a non-zero exit', () => {
    assert.equal(checkSubmitted({ exitCode: 1, output: SUBMIT_SENTINEL }).submitted, false);
  });

  it('observation carries the return code and output', () => {
    const o = formatObservation({ exitCode: 2, output: 'boom' });
    assert.match(o, /<returncode>2<\/returncode>/);
    assert.match(o, /<output>[\s\S]*boom/);
  });

  it('observation elides very long output head-and-tail', () => {
    const o = formatObservation({ exitCode: 0, output: 'HEAD\n' + 'x'.repeat(20000) + '\nTAIL' });
    assert.match(o, /Output too long/);
    assert.match(o, /<output_head>/);
    assert.match(o, /<output_tail>/);
  });
});

// ── prompt templates ───────────────────────────────────────────────────
describe('prompt templates', () => {
  it('parses quoted arguments', () => {
    assert.deepEqual(parseCommandArgs('one "two three" four'), ['one', 'two three', 'four']);
  });

  it('substitutes $1 and $@', () => {
    assert.equal(substituteArgs('fix $1', ['a', 'b']), 'fix a');
    assert.equal(substituteArgs('fix $@', ['a', 'b']), 'fix a b');
  });

  it('supports defaults and slices', () => {
    assert.equal(substituteArgs('${1:-none}', []), 'none');
    assert.equal(substituteArgs('${@:1:2}', ['a', 'b', 'c']), 'a b');
  });

  it('does not re-expand substituted values', () => {
    assert.equal(substituteArgs('value is $1', ['$2']), 'value is $2');
  });

  it('expands a project template by name', () => {
    mkdirSync(join(dir, '.sentinel', 'prompts'), { recursive: true });
    writeFileSync(join(dir, '.sentinel', 'prompts', 'review.md'), '---\ndescription: Review a diff\n---\nReview $1 carefully', 'utf8');
    const r = expandPromptTemplate('/review src/a.ts');
    assert.equal(r.template, 'review');
    assert.equal(r.text, 'Review src/a.ts carefully');
    assert.equal(listPromptTemplates(dir)[0].description, 'Review a diff');
  });

  it('leaves unknown slash text unchanged', () => {
    const r = expandPromptTemplate('/not-a-template hi', dir);
    assert.equal(r.template, null);
    assert.equal(r.text, '/not-a-template hi');
  });

  it('leaves ordinary prose unchanged', () => {
    assert.equal(expandPromptTemplate('what does this do?', dir).template, null);
  });
});

// ── truncation ─────────────────────────────────────────────────────────
describe('truncation', () => {
  it('truncateHead keeps the beginning', () => {
    const content = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
    const r = truncateHead(content, { maxLines: 10 });
    assert.equal(r.truncated, true);
    assert.equal(r.outputLines, 10);
    assert.match(r.content, /^line 0/);
  });

  it('truncateTail keeps the end', () => {
    const content = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
    const r = truncateTail(content, { maxLines: 10 });
    assert.match(r.content, /line 99$/);
    assert.doesNotMatch(r.content, /line 0/);
  });

  it('respects a byte cap, not just a line cap', () => {
    const r = truncateHead('x'.repeat(1000), { maxBytes: 100 });
    assert.equal(r.truncatedBy, 'bytes');
    assert.ok(r.outputBytes <= 100);
  });

  it('is a no-op under the limit', () => {
    const r = truncateHead('short', { maxLines: 10 });
    assert.equal(r.truncated, false);
    assert.equal(r.content, 'short');
  });

  it('never splits a huge single line in the tail direction', () => {
    const r = truncateTail('y'.repeat(5000), { maxBytes: 100 });
    assert.equal(r.outputLines, 1);
    assert.equal(r.content.length, 100);
  });

  it('tailWithNotice prefixes how much was omitted', () => {
    const content = Array.from({ length: 100 }, (_, i) => `l${i}`).join('\n');
    const out = tailWithNotice(content, 100);
    assert.match(out, /earlier line\(s\) omitted/);
    assert.match(out, /l99/);
  });

  it('tailWithNotice returns short content untouched', () => {
    assert.equal(tailWithNotice('short', 1000), 'short');
  });
});

// ── workdir ────────────────────────────────────────────────────────────
describe('per-agent workdir', () => {
  it('falls back to process.cwd outside a scope', () => {
    assert.equal(getWorkdir(), dir);
  });

  it('getWorkdir is scoped and restored after the call', async () => {
    const other = mkdtempSync(join(tmpdir(), 'sentinel-wt-'));
    const seen = await runInWorkdir(other, async () => {
      assert.equal(getWorkdir(), other);
      // Still scoped across an await boundary.
      await new Promise((r) => setTimeout(r, 5));
      return getWorkdir();
    });
    assert.equal(seen, other);
    assert.equal(getWorkdir(), dir);
  });

  it('nested scopes restore the outer workdir', async () => {
    const a = mkdtempSync(join(tmpdir(), 'sentinel-a-'));
    const b = mkdtempSync(join(tmpdir(), 'sentinel-b-'));
    await runInWorkdir(a, async () => {
      await runInWorkdir(b, async () => {
        assert.equal(getWorkdir(), b);
      });
      assert.equal(getWorkdir(), a);
    });
  });
});

// ── memory ─────────────────────────────────────────────────────────────
describe('memory', () => {
  it('slugs a name into a safe filename', () => {
    assert.equal(memorySlug('User Prefs!'), 'user-prefs');
    assert.equal(memorySlug('  a--b  '), 'a-b');
    assert.throws(() => memorySlug('!!!'), /letters or digits/);
  });

  it('round-trips a record through disk', () => {
    const { file } = writeMemory(
      { name: 'test runner', type: 'project', description: 'Tests run with npm test', body: 'Use npm test.' },
      dir
    );
    assert.equal(file, '.sentinel/memory/test-runner.md');
    const rec = listMemories(dir);
    assert.equal(rec.length, 1);
    assert.equal(rec[0].name, 'test runner');
    assert.equal(rec[0].type, 'project');
    assert.equal(rec[0].body, 'Use npm test.');
  });

  it('rebuilds the index and surfaces it in the prompt', () => {
    writeMemory({ name: 'a', type: 'user', description: 'likes tabs', body: 'b' }, dir);
    const index = readFileSync(join(dir, '.sentinel', 'memory', 'MEMORY.md'), 'utf8');
    assert.match(index, /- \[a\]\(a\.md\) \(user\) — likes tabs/);
    const section = buildMemorySection(dir);
    assert.match(section, /# Memory/);
    assert.match(section, /likes tabs/);
  });

  it('has no memory section when there are no records', () => {
    assert.equal(buildMemorySection(dir), null);
  });

  it('deletes a record and reindexes', () => {
    writeMemory({ name: 'a', type: 'user', description: 'd', body: 'b' }, dir);
    assert.deepEqual(deleteMemory('a', dir), { deleted: true });
    assert.equal(listMemories(dir).length, 0);
    assert.deepEqual(deleteMemory('a', dir), { deleted: false });
  });

  it('rejects a bad type and a missing body', () => {
    assert.throws(() => writeMemory({ name: 'a', type: 'nope', description: 'd', body: 'b' }, dir), /type must be one of/);
    assert.throws(() => writeMemory({ name: 'a', type: 'user', description: 'd', body: '  ' }, dir), /body is required/);
    assert.throws(() => writeMemory({ name: 'a', type: 'user', description: '', body: 'b' }, dir), /description is required/);
  });

  it('parseMemory ignores a file with no frontmatter', () => {
    assert.equal(parseMemory('just text'), null);
    assert.equal(parseMemory('---\ndescription: x\n---\nbody'), null, 'name is required');
  });

  it('the document frontmatter round-trips', () => {
    const rec = parseMemory(memoryDocument({ name: 'n', type: 'feedback', description: 'd', body: 'the body' }));
    assert.deepEqual(rec, { name: 'n', description: 'd', type: 'feedback', body: 'the body' });
  });

  it('truncates an oversized index', () => {
    for (let i = 0; i < 200; i++) {
      writeMemory({ name: `m${i}`, type: 'user', description: 'd'.repeat(50), body: 'b' }, dir);
    }
    assert.match(buildMemorySection(dir), /index truncated/);
  });

  it('a corrupt record is skipped, not fatal', () => {
    mkdirSync(join(dir, '.sentinel', 'memory'), { recursive: true });
    writeFileSync(join(dir, '.sentinel', 'memory', 'bad.md'), 'no frontmatter here', 'utf8');
    writeMemory({ name: 'good', type: 'user', description: 'd', body: 'b' }, dir);
    assert.equal(listMemories(dir).length, 1);
  });

  it('does not list the index file as a record', () => {
    writeMemory({ name: 'x', type: 'user', description: 'd', body: 'b' }, dir);
    assert.ok(existsSync(join(dir, '.sentinel', 'memory', 'MEMORY.md')));
    assert.ok(!listMemories(dir).some((m) => m.file === 'MEMORY.md'));
  });
});

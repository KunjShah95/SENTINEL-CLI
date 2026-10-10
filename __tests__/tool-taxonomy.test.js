/**
 * The tool taxonomy's real product is this file, not the module.
 *
 * Consolidation without an assertion only moves the problem: the next person
 * adds a tool to `TOOL_PARAM_SCHEMAS` and forgets the taxonomy, and the failure
 * mode is a permission check that quietly does not apply to it. A skipped check
 * looks exactly like a passing one from the outside, which is why every bug
 * documented in `tool-taxonomy.js` was found by reading rather than by a test.
 *
 * So these tests assert *coverage*, not behaviour: every tool the model can be
 * offered is classified, and nothing is classified two incompatible ways.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SHELL_TOOLS, FILE_TOOLS, WRITE_TOOLS, AGENT_TOOLS, KNOWN_TOOLS,
  EFFECT_CATEGORIES, effectCategory,
  isShellTool, isFileTool, isWriteTool, exitCodeOf,
} from '../src/shared/tool-taxonomy.js';
import { isReadOnlyTool, isToolAllowedInMode } from '../src/shared/schemas/mode.js';
import { TOOL_PARAM_SCHEMAS, buildProviderTools } from '../src/agent/loop.js';
import { getToolContracts } from '../src/shared/tools/index.js';
import { getToolPolicy } from '../src/shared/tools/permissions.js';

// ── Coverage ───────────────────────────────────────────────────────────────

test('every tool the model can be offered is classified by the taxonomy', () => {
  // The loop's provider schema is the list of things a model may call, so it is
  // the definition of "a tool" for this assertion. A tool here that the
  // taxonomy does not know about is a tool whose permission path is unverified.
  const offered = Object.keys(TOOL_PARAM_SCHEMAS);
  const unknown = offered.filter((name) => !KNOWN_TOOLS.includes(name));
  assert.deepEqual(unknown, [], `unclassified tools: ${unknown.join(', ')}`);
});

test('every tool the loop offers falls into exactly one effect category', () => {
  // This assertion is why STATE_TOOLS and AGENT_TOOLS exist. The first version
  // of this test only knew about read-only / shell / writer and failed on eight
  // tools — diffFile, task, spawnAgent, spawnTeammate, sendMessage, todoWrite,
  // memoryWrite, memoryDelete — which had genuinely been classified nowhere.
  // A tool in no category is a tool no permission rule has an opinion about.
  const unclassified = KNOWN_TOOLS.filter((n) => effectCategory(n) === null);
  assert.deepEqual(unclassified, [], `tools no rule covers: ${unclassified.join(', ')}`);
});

test('a tool never has two effect categories', () => {
  // `effectCategory` returns one value, so this asserts the sets themselves are
  // disjoint. `isReadOnlyTool` is checked separately because it lives in
  // mode.js and this module must not restate it.
  for (const a of KNOWN_TOOLS) {
    const claims = EFFECT_CATEGORIES.filter((c) => effectCategory(a) === c);
    assert.equal(claims.length, 1, `${a} resolved to ${claims.length} categories`);
  }
});

test('writing a todo is a state write, not a working-tree write', () => {
  // The distinction that STATE_TOOLS was created for: `todoWrite` must not
  // invalidate a test receipt, because it changes no code the test covers.
  assert.equal(effectCategory('todoWrite'), 'stateWrite');
  assert.ok(isWriteTool('writeFile'));
  assert.ok(!isWriteTool('todoWrite'));
});

test('agent tools are their own category, gated by the rung ladder', () => {
  // Their authority comes from task.js's clamp, not from a category check, so
  // folding them into "write" would bypass exactly the mechanism the
  // Delegation class of the audit depends on.
  for (const t of AGENT_TOOLS) assert.equal(effectCategory(t), 'agent', `${t} must be an agent tool`);
});

test('no tool is both read-only and a writer', () => {
  // The two answers contradict, and which one wins would then depend on the
  // order of checks in whichever file happened to run first.
  const both = KNOWN_TOOLS.filter((n) => isReadOnlyTool(n) && isWriteTool(n));
  assert.deepEqual(both, [], `both read-only and writing: ${both.join(', ')}`);
});

test('no tool is both shell and a file writer', () => {
  // A shell command and a file edit have different permission shapes; a tool in
  // both sets would be graded by whichever check reached it first.
  const both = KNOWN_TOOLS.filter((n) => isShellTool(n) && isFileTool(n));
  assert.deepEqual(both, [], `both shell and file: ${both.join(', ')}`);
});

// ── The sets mean what their names say ─────────────────────────────────────

test('WRITE_TOOLS is exactly FILE_TOOLS plus the checkpoint and merge tools', () => {
  // If this fails, someone added a mutating tool to one list and not the other.
  const extra = WRITE_TOOLS.filter((n) => !FILE_TOOLS.includes(n));
  assert.deepEqual(extra.sort(), ['redoLastUndo', 'teamMerge', 'undoLastChange']);
  for (const f of FILE_TOOLS) assert.ok(WRITE_TOOLS.includes(f), `${f} must be a write tool`);
});

test('undo is a write tool but not a file tool', () => {
  // Documents the deliberate asymmetry: undo leaves bytes changed, so it must
  // invalidate a receipt, but it does not edit a path the way writeFile does.
  assert.ok(isWriteTool('undoLastChange'));
  assert.ok(!isFileTool('undoLastChange'));
});

test('the shell set is the four command-taking tools', () => {
  // `runSkillScript` is here because it executes a file bundled in a skill. It
  // takes {name, script, args} rather than a `command`, but the string it runs
  // is a shell command and has to clear the same gates.
  assert.deepEqual([...SHELL_TOOLS].sort(), ['bash', 'bgRun', 'runSkillScript', 'runTests']);
});

test('runSkillScript is never classified read-only', () => {
  // The one that matters. `skill` IS read-only, and skills directories are read
  // from ten locations including `~/.claude/skills` and `~/.opencode/skills`. If
  // execution were reachable from a read-only tool, a PLAN-mode turn — refused
  // bash, refused runTests, refused every write — could run installed code.
  assert.equal(effectCategory('runSkillScript'), 'shell');
  assert.ok(!isReadOnlyTool('runSkillScript'));
  assert.equal(getToolPolicy('runSkillScript'), 'ask', 'must not default to allow');
  assert.equal(getToolPolicy('skill'), 'allow', 'the prompt reader stays prompt-free');
});

test('every mode that refuses bash also refuses runSkillScript', () => {
  // FIX mode's no-shell rule is checked against the taxonomy rather than a
  // literal pair of names. This asserts the outcome for the tool that matters,
  // in every restricted mode.
  for (const mode of ['PLAN', 'REVIEW', 'SCAN', 'FIX']) {
    assert.equal(isToolAllowedInMode('bash', mode), false, `bash in ${mode}`);
    assert.equal(isToolAllowedInMode('runSkillScript', mode), false, `runSkillScript in ${mode}`);
  }
  assert.equal(isToolAllowedInMode('runSkillScript', 'BUILD'), true);
});

// ── exitCodeOf ─────────────────────────────────────────────────────────────

test('exitCodeOf reads exitCode, error, and structured test failures', () => {
  assert.equal(exitCodeOf('bash', { exitCode: 0 }), 0);
  assert.equal(exitCodeOf('bash', { exitCode: 3 }), 3);
  assert.equal(exitCodeOf('bash', { error: 'boom' }), 1, 'an error is a non-zero exit');
  assert.equal(exitCodeOf('runTests', { failed: [] }), 0);
  assert.equal(exitCodeOf('runTests', { failed: [1, 2] }), 1);
  assert.equal(exitCodeOf('readFile', { content: 'x' }), undefined, 'not a shell tool, no exit code');
  assert.equal(exitCodeOf('bash', null), undefined);
});

// ── The provider offer is derived, not restated ────────────────────────────

test('buildProviderTools offers exactly the classified tools, plus the unified task tool', () => {
  const offered = buildProviderTools('BUILD').map((t) => t.function.name);
  const unknown = offered.filter((n) => !KNOWN_TOOLS.includes(n));
  assert.deepEqual(unknown, [], `offered but unclassified: ${unknown.join(', ')}`);
  // `task` replaces seven legacy names for the model. It must stay in KNOWN_TOOLS
  // so this assertion keeps holding after the next tool is added.
  assert.ok(offered.includes('task'));
});

test('contracts exist for every offered tool', () => {
  // A schema with no contract means the model is told a tool exists with no
  // description of what it does — the failure is invisible until a model calls
  // it and guesses.
  const contracts = getToolContracts();
  const offered = buildProviderTools('BUILD').map((t) => t.function.name);
  const missing = offered.filter((n) => !contracts[n]);
  assert.deepEqual(missing, [], `no contract for: ${missing.join(', ')}`);
});

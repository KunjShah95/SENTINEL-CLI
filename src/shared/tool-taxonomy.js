/**
 * The tool taxonomy — one owner per fact.
 *
 * ## Why this file exists
 *
 * Before it, the same four facts about tools were written down in six to seven
 * places:
 *
 *     const SHELL_TOOLS = new Set(['bash', 'runTests', 'bgRun']);
 *     const FILE_TOOLS  = new Set(['writeFile', 'editFile', 'batchEdit', 'applyPatch']);
 *
 * Duplication of this kind is not merely untidy. Two of the copies had already
 * **drifted into live bugs**:
 *
 *   - `provider-setup.tsx` wrote `GITHUB_TOKEN` while `doctor.js` checked
 *     `GITHUB_COPILOT_TOKEN`, so `sentinel doctor` told a correctly configured
 *     user they had no key.
 *   - `provider-setup.tsx` and `yamlConfigManager.js` keyed Google Gemini as
 *     `gemini` while the whole registry uses `google`, so a saved Gemini key
 *     was written to a field no provider ever read.
 *
 * Both were found only by reading for duplication, not by a failing test. That
 * is the tell: a drift between two copies produces no failure, so nothing will
 * ever tell you about the next one. The fix is not to be careful. It is to have
 * one copy.
 *
 * The same reasoning is already applied to the `.sentinel/` directory name in
 * `src/utils/state-dir.js`, and it is why that module has a test asserting the
 * side-effect split (`stateDir` does not create, `ensureStateDir` does). Same
 * failure mode, same remedy.
 *
 * ## What belongs here
 *
 * Only *classification*: which tools are shell, which write files, which are
 * read-only. Not policy — a rung is a permission decision and lives in
 * `task.js`. Not risk grading — that is `bash-validation.js`.
 *
 * The distinction matters. `SHELL_TOOLS` answers "what is this kind of tool";
 * `taskPermission()` answers "may this caller run it". Collapsing the two is how
 * a list ends up encoding an approval decision nobody decided on.
 */
import { isReadOnlyTool, SHELL_TOOL_NAMES } from '../shared/schemas/mode.js';

/**
 * Tools that take a shell command. The only ones `bash-validation` classifies.
 *
 * The list itself lives in `mode.js` (see `SHELL_TOOL_NAMES`) because FIX
 * mode's no-shell rule needs it too, and this module already depends on that
 * one. Re-exported here so `isShellTool` keeps working for existing callers.
 *
 * `runSkillScript` is a member because it *is* a shell command — the string
 * that runs is built by `skillScriptCommand` and handed to the same executor
 * `bash` uses. Anywhere else and a script from an installed skill would
 * execute without passing the risk ledger, which is the gate a registry-sourced
 * script needs most.
 */
export const SHELL_TOOLS = SHELL_TOOL_NAMES;

/**
 * Tools that mutate the working tree through the file API.
 *
 * Excludes the checkpoint tools on purpose. `undoLastChange` and
 * `teamMerge` do write bytes, but they write *reverted* bytes onto a base the
 * user already had, and treating them as ordinary mutations makes "did anything
 * change on disk?" answer yes for a turn whose net effect was nothing. They are
 * listed in `WRITE_TOOLS` below, which is the question that actually gets asked.
 */
export const FILE_TOOLS = Object.freeze(['writeFile', 'editFile', 'batchEdit', 'applyPatch']);

/**
 * Every tool that can leave bytes changed in the working tree, in either
 * direction.
 *
 * This is the set the audit trail counts as an intervening mutation and the set
 * the receipt ledger marks earlier evidence stale behind. Those two were
 * byte-identical arrays in two files, which is the exact shape that lets them
 * disagree the next time a tool is added to one and not the other.
 */
export const WRITE_TOOLS = Object.freeze([
  ...FILE_TOOLS,
  'undoLastChange', 'redoLastUndo', 'teamMerge',
]);

/**
 * Tools that write the harness's own state rather than the working tree.
 *
 * Named because writing a todo does NOT invalidate a test receipt. They are
 * writes, and they are not `FILE_TOOLS`, and conflating the two would make
 * "npm test passed" look stale the moment the agent wrote its own scratch note.
 * This distinction did not exist until the coverage test below pointed out that
 * eight tools fit no category at all.
 */
export const STATE_TOOLS = Object.freeze(['todoWrite', 'memoryWrite', 'memoryDelete']);

/**
 * Tools that delegate work rather than perform it.
 *
 * Separate because their authority comes from `task.js`'s rung ladder, not from
 * a category check. A tool in this set is gated by `resolvePermission`, and
 * treating it as "just another write" would bypass the clamp that is the whole
 * point of Delegation-class auditing.
 */
export const AGENT_TOOLS = Object.freeze(['task', 'spawnAgent', 'spawnTeammate', 'sendMessage', 'teamMerge']);

/**
 * Tools that mutate the working tree through the checkpoint stack.
 *
 * Their own category because `undoLastChange` changes bytes on disk — so it
 * must invalidate a receipt — without naming a path, so `FILE_TOOLS` is the
 * wrong answer. `effectCategory` returns exactly one value and the coverage
 * test asserts the categories are disjoint, which is what forced this out of
 * "write" rather than letting it sit unclassified.
 */
export const CHECKPOINT_TOOLS = Object.freeze(['undoLastChange', 'redoLastUndo']);

/** Read-only tools the mode check allows in PLAN/REVIEW/SCAN, beyond `isReadOnlyTool`. */
export const DIFF_TOOLS = Object.freeze(['diffFile']);

/**
 * Tools that commit an effect outside the working tree.
 *
 * Their own category, and not `fileWrite`, because none of the rules that govern
 * a file write apply:
 *
 *   - There is no path, so there is no checkpoint and no undo. `undoLastChange`
 *     can revert bytes on disk; it cannot unsend a message.
 *   - There is no `cwd`, so `blast-radius.js`'s globs have nothing to match.
 *   - The blast radius is an *identity* — the account, the record, the third
 *     party — which no existing category has a field for.
 *
 * They are excluded from `WRITE_TOOLS` for a specific reason: that set is what
 * the audit trail counts as an intervening mutation and what invalidates a test
 * receipt behind it. A browser action invalidating an `npm test` receipt would be
 * nonsense, and counting them would make `boundGapRate` meaningless. The session
 * module keeps its own irreversibility counter instead, which is the same
 * separation of concerns that split `STATE_TOOLS` out.
 */
export const WEB_TOOLS = Object.freeze(['webRead', 'webProbe', 'webSession', 'webAct']);

/** The subset that commits. `webRead` and `webProbe` observe and stay out. */
export const WEB_COMMIT_TOOLS = Object.freeze(['webSession', 'webAct']);

const SHELL_SET = new Set(SHELL_TOOLS);
const FILE_SET = new Set(FILE_TOOLS);
const WRITE_SET = new Set(WRITE_TOOLS);
const STATE_SET = new Set(STATE_TOOLS);
const AGENT_SET = new Set(AGENT_TOOLS);
const DIFF_SET = new Set(DIFF_TOOLS);
const CHECKPOINT_SET = new Set(CHECKPOINT_TOOLS);
const WEB_SET = new Set(WEB_TOOLS);
const WEB_COMMIT_SET = new Set(WEB_COMMIT_TOOLS);

export function isWebTool(toolName) {
  return WEB_SET.has(toolName);
}

/** Whether this browser tool commits something rather than observing it. */
export function isWebCommitTool(toolName) {
  return WEB_COMMIT_SET.has(toolName);
}

export function isCheckpointTool(toolName) {
  return CHECKPOINT_SET.has(toolName);
}

export function isShellTool(toolName) {
  return SHELL_SET.has(toolName);
}

export function isFileTool(toolName) {
  return FILE_SET.has(toolName);
}

export function isWriteTool(toolName) {
  return WRITE_SET.has(toolName);
}

export function isStateTool(toolName) {
  return STATE_SET.has(toolName);
}

export function isAgentTool(toolName) {
  return AGENT_SET.has(toolName);
}

/**
 * Whether a call reports a failure via `exitCode` rather than `error`.
 *
 * Two implementations of this question existed — `receipts.js` had a private
 * one and `audit-trail.js` had another. Divergence here is silent: a tool
 * counted as succeeding when it exited non-zero invalidates every receipt
 * downstream of it, and nothing throws.
 */
export function exitCodeOf(tool, output) {
  if (!output || typeof output !== 'object') return undefined;
  if (output.error) return 1;
  if (typeof output.exitCode === 'number') return output.exitCode;
  if (tool === 'runTests' && Array.isArray(output.failed)) return output.failed.length ? 1 : 0;
  return undefined;
}

/**
 * Every tool the harness knows about, derived rather than restated.
 *
 * Built from the sets above plus the read-only list. `taxonomy.test.js` asserts
 * that no tool is in two conflicting categories and that the loop's provider
 * schema covers all of them, which turns "someone added a tool and forgot the
 * taxonomy" into a red test instead of a permission check that silently skips
 * it — a skipped check is the most dangerous kind, because it looks like a pass.
 */
export const KNOWN_TOOLS = Object.freeze([
  ...FILE_TOOLS,
  ...SHELL_TOOLS,
  ...STATE_TOOLS,
  ...AGENT_TOOLS,
  ...CHECKPOINT_TOOLS,
  ...DIFF_TOOLS,
  // read-only, per mode.js
  'readFile', 'listDirectory', 'glob', 'grep', 'codeMap', 'searchWeb', 'fetchUrl',
  'todoRead', 'skill', 'bgCheck', 'teamStatus',
  // deliberately not `runSkillScript`: it executes, so it is in SHELL_TOOLS
  // browser: observe vs commit. See WEB_TOOLS for why the commit half is excluded
  // from WRITE_TOOLS.
  ...WEB_TOOLS,
]);

/**
 * The six mutually exclusive effect categories, for the coverage test.
 *
 * `readOnly` comes from mode.js rather than being restated here — two lists of
 * "which tools are safe" is exactly the drift this module exists to remove.
 */
export const EFFECT_CATEGORIES = Object.freeze([
  'readOnly', 'shell', 'fileWrite', 'stateWrite', 'agent', 'checkpoint', 'webCommit',
]);

/**
 * Which category a tool falls into, or null if no rule has an opinion.
 *
 * `readOnly` is checked first and on purpose. `webRead` and `webProbe` are in
 * `isReadOnlyTool`, so they land there; had `web` been checked earlier, they
 * would have been classified as commits, and the mode check would have blocked
 * them in PLAN — taking the safe moment before a commitment and putting it behind
 * the commitment itself.
 */
export function effectCategory(toolName) {
  if (isReadOnlyTool(toolName) || DIFF_SET.has(toolName)) return 'readOnly';
  if (isShellTool(toolName)) return 'shell';
  if (isFileTool(toolName)) return 'fileWrite';
  if (isStateTool(toolName)) return 'stateWrite';
  if (isAgentTool(toolName)) return 'agent';
  if (isCheckpointTool(toolName)) return 'checkpoint';
  if (isWebCommitTool(toolName)) return 'webCommit';
  return null;
}

/** Re-exported so callers import the read-only rule from one place too. */
export { isReadOnlyTool };

/**
 * PLAN / BUILD / REVIEW / SCAN / FIX mode — tool access levels.
 *
 * PLAN   — read-only operations (read, list, glob, grep).
 * BUILD  — full tool access (write, edit, shell).
 * REVIEW — read-only + diff (same as PLAN, used for PR review context).
 * SCAN   — read-only + security analysis tools.
 * FIX    — read + write (no shell — safe auto-fix mode).
 */

export const Mode = Object.freeze({
  BUILD: 'BUILD',
  PLAN: 'PLAN',
  REVIEW: 'REVIEW',
  SCAN: 'SCAN',
  FIX: 'FIX',
  SWE: 'SWE',
});

export const modeSchema = {
  BUILD: 'BUILD',
  PLAN: 'PLAN',
  REVIEW: 'REVIEW',
  SCAN: 'SCAN',
  FIX: 'FIX',
  SWE: 'SWE',
};

export function isMode(value) {
  return Object.values(Mode).includes(value);
}

/**
 * Tools that change nothing.
 *
 * `webRead` is here for the same reason `fetchUrl` is: navigating and reading a
 * page is observation, so it belongs in PLAN and REVIEW and never prompts.
 *
 * `webProbe` is *also* here, and that is the more interesting half. It resolves
 * an action to its effect without dispatching, so it is observation too — the
 * resolve step is the last moment before commitment, and making the user pay a
 * permission prompt to find out what a button does would train them to approve
 * without reading. The commitment is a separate tool (`webAct`), which is not
 * read-only and is gated like any other write.
 */
export function isReadOnlyTool(toolName) {
  return ['readFile', 'listDirectory', 'glob', 'grep', 'codeMap', 'searchWeb', 'fetchUrl', 'memoryRecall', 'todoRead', 'skill', 'bgCheck', 'teamStatus', 'webRead', 'webProbe'].includes(toolName);
}

/**
 * Tools that execute something.
 *
 * Owned here, not in `tool-taxonomy.js`, because FIX mode's no-shell rule needs
 * it and `mode.js` is the lower layer — `tool-taxonomy` already imports this
 * module, so the taxonomy imports the list back rather than the two modules
 * importing each other. One copy, one direction.
 *
 * `runSkillScript` is in it because it runs a file from an installed skill
 * directory. It is not "a tool with a path argument"; it is execution, and it
 * belongs in the same refusal.
 */
export const SHELL_TOOL_NAMES = Object.freeze(['bash', 'runTests', 'bgRun', 'runSkillScript']);

export function isShellToolName(toolName) {
  return SHELL_TOOL_NAMES.includes(toolName);
}

/**
 * Check if a tool is allowed in the given mode.
 * @param {string} toolName
 * @param {string} mode
 * @returns {boolean}
 */
export function isToolAllowedInMode(toolName, mode) {
  if (mode === Mode.BUILD || mode === Mode.SWE) return true;
  if (mode === Mode.PLAN || mode === Mode.REVIEW || mode === Mode.SCAN) {
    return isReadOnlyTool(toolName) || toolName === 'diffFile';
  }
  if (mode === Mode.FIX) {
    // FIX mode: read + write tools, but no shell. The check is against the
    // shell taxonomy rather than a literal pair of names, because a new shell
    // tool that enumerated itself here would be a silent hole in FIX mode.
    return !isShellToolName(toolName);
  }
  return true;
}

export function getModeLabel(mode) {
  switch (mode) {
  case Mode.PLAN: return 'Plan';
  case Mode.REVIEW: return 'Review';
  case Mode.SCAN: return 'Scan';
  case Mode.FIX: return 'Fix';
  case Mode.SWE: return 'SWE';
  default: return 'Build';
  }
}

export function getModeDescription(mode) {
  switch (mode) {
  case Mode.PLAN: return 'Read-only planning mode';
  case Mode.REVIEW: return 'Read-only code review context';
  case Mode.SCAN: return 'Security scanning mode';
  case Mode.FIX: return 'Safe auto-fix mode (no shell)';
  case Mode.SWE: return 'SWE-bench fix mode: reproduce → fix → verify with structured test results';
  default: return 'Full build mode';
  }
}

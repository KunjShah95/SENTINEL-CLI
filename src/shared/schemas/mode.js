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

export function isReadOnlyTool(toolName) {
  return ['readFile', 'listDirectory', 'glob', 'grep', 'codeMap', 'searchWeb', 'todoRead', 'skill'].includes(toolName);
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
    // FIX mode: read + write tools, but no shell
    return toolName !== 'bash' && toolName !== 'runTests';
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

/**
 * gates — the ordered refusals in front of every tool call.
 *
 * ## Why this is its own module
 *
 * `executeOneTool` grew to ~130 lines because every new safety rule arrived as
 * another `if (...) return { output: { error } }` in the middle of it. That shape
 * is fine for one rule and hostile for five, for one specific reason:
 *
 * **Order becomes load-bearing and nothing pins it.** Which gate refuses a call
 * depends on where each check sits. A `rm -rf /` in PLAN mode should be refused
 * by the *mode* gate — telling someone a command is too dangerous when they were
 * never allowed to run a command at all is a confusing error. Move the mode
 * check down by accident and the same call now produces a different message
 * from a different subsystem. No test fails, because each gate still works.
 *
 * Naming the chain makes order a stated property instead of an accident of
 * line numbers, and `gates.test.js` pins it.
 *
 * ## What belongs here
 *
 * Classification and refusal. Not dispatch, not audit, not grants — those stay in
 * the loop, because they need loop state and this module must stay pure enough
 * to call with literals.
 *
 * The gate name is returned rather than a bare reason string, for two reasons:
 * it makes tests assert about the rule instead of about prose, and it gives
 * `sentinel audit` something better than a wall of text — the refusal is
 * attributable to a specific mechanism.
 */
import { isToolAllowedInMode, isReadOnlyTool } from '../shared/schemas/mode.js';
import { isShellTool } from '../shared/tool-taxonomy.js';
import { builtinPreToolUseGuard, runHooks } from './hooks.js';
import { checkBlastRadius } from './blast-radius.js';
import { classifyBashCommand } from './bash-validation.js';
import { riskLevel, explainRisk, recordApproval } from './risk-ledger.js';

/**
 * The order refusals are evaluated in. Cheapest and most categorical first, so
 * the error a user sees names the most fundamental reason.
 *
 *   mode          — you may not use this tool at all right now
 *   builtin       — this tool is never allowed, for anyone, ever
 *   hook          — something registered refused it
 *   blastRadius   — this specific first write is too broad, once per path
 *   selfMessage   — the call is a no-op addressed to yourself
 *
 * `builtin` sits after `mode` rather than before it, which is the deliberate
 * choice above: in PLAN mode the answer is "not available in PLAN mode", not
 * "that pattern is dangerous".
 */
export const GATE_ORDER = Object.freeze([
  'mode', 'builtin', 'hook', 'blastRadius', 'selfMessage',
]);

/** A refusal: which gate, and why in the model's own words. */
export function block(gate, reason, extra = {}) {
  return { blocked: true, gate, reason, ...extra };
}

/**
 * Run every pre-permission gate in order and return the FIRST refusal.
 *
 * `external` names third-party MCP tools. They bypass the mode gate because an
 * unknown name would otherwise be rejected in PLAN/REVIEW/SCAN, where the mode
 * check only allows a known read-only list. They are trusted as read-only by
 * assumption and never receive a write grant — an assumption, deliberately not
 * a promise, and it is recorded as one.
 */
export async function runPreGates({
  tool, input, mode, agentName, gateState = null, externalTools = null,
}) {
  const isExternal = Boolean(externalTools && externalTools.has(tool));

  if (!isExternal && !isToolAllowedInMode(tool, mode)) {
    return block('mode', `Tool ${tool} is not available in ${mode} mode`);
  }

  const builtin = builtinPreToolUseGuard(tool, input);
  if (builtin?.block) return block('builtin', builtin.reason);

  const hookBlock = await runHooks('preToolUse', { toolName: tool, input, mode }).catch(() => null);
  if (hookBlock?.block) return block('hook', hookBlock.reason || `Blocked by hook: ${tool}`);

  if (gateState) {
    const radius = checkBlastRadius({ toolName: tool, input, state: gateState });
    if (radius?.block) return block('blastRadius', radius.reason, { blastRadius: true });
  }

  // A solo lead messaging "lead" is a no-op that small models reach for instead
  // of answering. Refused before the permission prompt so the user is never
  // asked to approve a call that cannot succeed.
  if (tool === 'sendMessage' && String(input?.to || 'lead') === agentName) {
    return block('selfMessage', `You are ${agentName}; there is no one to message. Reply to the user directly in your answer.`);
  }

  return null;
}

/**
 * Classify a call's shell risk, independently of who is asking.
 *
 * Split out because both the permission gate and the audit trail need it, and
 * two calls to `classifyBashCommand` on the same command is two chances to
 * disagree about how dangerous something is.
 */
export function assessCall(tool, input, workdir) {
  if (!isShellTool(tool)) return { shellish: false, bashCheck: null, risk: null, command: '' };
  const command = typeof input?.command === 'string' ? input.command : '';
  return {
    shellish: true,
    command,
    bashCheck: classifyBashCommand(command),
    risk: riskLevel(command, workdir),
  };
}

/**
 * Decide whether this call may run.
 *
 * Three ways to be allowed, in descending order of how much the human was
 * involved:
 *
 *   1. A **session grant** already covers this. For a shell tool that means the
 *      grant covers the command *shape*, not the tool — which is why
 *      `allowAll.has('bash')` alone is not sufficient and `risk.level` has to
 *      agree. Without that second condition "allow bash for this session"
 *      silently authorizes the first `npm publish` that walks by.
 *   2. The user is asked now, and says yes.
 *   3. Read-only tools are not asked at all (opencode behaviour: a dialog per
 *      `readFile` stalled a live TUI turn for minutes). The config policy still
 *      applies downstream in `executeLocalTool`, so `readFile: deny` still
 *      denies.
 *
 * @returns {{permission: 'allow'|'allow-session'|'deny'|null, risk, bashCheck,
 *   source: 'session'|'prompt'|'implicit', promptInput?: object}}
 */
export async function resolvePermissionGate({
  tool, input, toolCallId, allowAll, onPermissionRequest, risk, bashCheck, shellish,
}) {
  const sessionGrants = shellish
    ? allowAll.has(tool) && risk?.level === 'green'
    : allowAll.has(tool);

  if (sessionGrants) return { permission: 'allow', risk, bashCheck, source: 'session' };

  if (onPermissionRequest && !isReadOnlyTool(tool)) {
    const promptInput = {
      ...(input || {}),
      ...(risk ? { __risk: explainRisk(risk) } : {}),
    };
    return {
      permission: await onPermissionRequest(tool, toolCallId, promptInput),
      risk,
      bashCheck,
      source: 'prompt',
    };
  }

  return { permission: null, risk, bashCheck, source: 'implicit' };
}

/**
 * Turn an `allow-session` answer into session state.
 *
 * Two rules, both about what a standing grant may learn:
 *
 *   - A **red** command is never promoted, even when the user said
 *     allow-session. Approving `rm -rf /` once is what turns a repo's history
 *     into a list of things that nearly happened.
 *   - A **yellow** shape is recorded in the ledger as well as the allow-set, so
 *     the grant survives a process restart rather than living only in memory.
 *
 * Returns the tool name to remember, or null to remember nothing.
 */
export function applySessionGrant({ permission, tool, risk, bashCheck, command = '', allowAll, workdir }) {
  if (permission !== 'allow-session') return null;
  if (bashCheck?.destructive || risk?.level === 'red') return null;
  if (risk && risk.level === 'yellow') recordApproval(command, workdir);
  allowAll.add(tool);
  return tool;
}

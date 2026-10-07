/**
 * Self-healing — detect drift, then repair it.
 *
 * Three classes of damage, all of which happen in practice and none of which
 * any existing code noticed:
 *
 *   1. assistant-drift  An assistant upgraded or was reinstalled and rewrote
 *                       its config, dropping the SENTINEL MCP entry. SENTINEL
 *                       becomes invisible in that assistant with no error
 *                       anywhere.
 *   2. config-corrupt   The config file is no longer valid JSON. Every
 *                       assistant that reads it fails to start.
 *   3. state-rot        Sentinel's own `.sentinel/` accumulated rot: a memory
 *                       index that disagrees with the records on disk, a
 *                       corrupt todos/spend file, sessions that aren't JSON.
 *
 * The rule throughout: detect is always cheap and read-only; repair is always
 * explicit (`--fix`) and always takes a backup. Nothing here runs on its own.
 */

import { existsSync, readFileSync, readdirSync, renameSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { getWorkdir } from '../shared/tools/workdir.js';
import { listMemories, rebuildMemoryIndex } from './memory.js';
import * as connectModule from '../cli/connect.js';

// ── 1. Assistant config drift ───────────────────────────────────────────────

/**
 * Compare what `sentinel connect` would write against what is actually there.
 *
 * @returns {{target: string, state: string, detail: string}[]}
 */
export function checkAssistantDrift(cwd = process.cwd()) {
  const { detectTargets, sentinelServerDefinition, ASSISTANT_TARGETS } = loadConnectModule();
  const expected = sentinelServerDefinition();
  const expectedJson = JSON.stringify(expected);
  const results = [];

  for (const detected of detectTargets({ cwd })) {
    const target = ASSISTANT_TARGETS.find((t) => t.id === detected.id);
    if (!target) continue;

    for (const scope of ['user', 'project']) {
      const file =
        scope === 'project' ? target.projectPath?.(cwd) : target.userPath?.();
      if (!file) continue;
      // Only judge a file this assistant actually owns in this scope.
      if (scope === 'project' && !existsSync(file) && !target.projectPath) continue;

      const { state, detail } = classify(file, target, expected, expectedJson, scope);
      if (state !== 'ok') {
        results.push({ target: detected.label, id: detected.id, scope, file, state, detail });
      }
    }
  }
  return results;
}

function classify(file, target, expected, expectedJson, scope) {
  const containerKey = target.key || 'mcpServers';
  const value = target.transform ? target.transform(expected) : expected;

  if (!existsSync(file)) {
    // Absent project config is normal; absent user config is only worth
    // reporting when the assistant is installed (we only get here if the
    // target was detected).
    return scope === 'project'
      ? { state: 'ok', detail: 'no project config (not required)' }
      : { state: 'missing', detail: 'config file does not exist' };
  }

  if (target.format === 'toml') {
    const text = safeRead(file);
    if (text === null) return { state: 'corrupt', detail: 'unreadable' };
    if (new RegExp('^\\[mcp_servers\\.sentinel\\]', 'm').test(text)) {
      return { state: 'ok', detail: 'registered' };
    }
    return { state: 'drifted', detail: 'no [mcp_servers.sentinel] block' };
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf-8'));
  } catch (e) {
    return { state: 'corrupt', detail: `invalid JSON: ${e.message.slice(0, 120)}` };
  }
  const container = parsed?.[containerKey];
  if (!container || typeof container !== 'object') {
    return { state: 'drifted', detail: `no "${containerKey}" object` };
  }
  const current = container.sentinel;
  if (current === undefined) {
    return { state: 'drifted', detail: `no "sentinel" entry in "${containerKey}"` };
  }
  if (JSON.stringify(current) !== JSON.stringify(value)) {
    return { state: 'drifted', detail: 'entry differs from what connect would write' };
  }
  return { state: 'ok', detail: 'registered' };
}

function safeRead(file) {
  try {
    return readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}

// ── 2. Sentinel state rot ───────────────────────────────────────────────────

/**
 * Inspect `.sentinel/` for the rot that accumulates across many sessions.
 * Pure read-only.
 */
export function checkStateHealth(cwd = getWorkdir()) {
  const dir = join(cwd, '.sentinel');
  const issues = [];
  if (!existsSync(dir)) return issues;

  // Memory index drift: MEMORY.md is a derived artifact, so it can disagree
  // with the records that produce it (a hand-edit, an interrupted write, a
  // record deleted outside the tool).
  try {
    const records = listMemories(cwd);
    const indexFile = join(dir, 'memory', 'MEMORY.md');
    const actual = existsSync(indexFile) ? readFileSync(indexFile, 'utf-8') : '';
    const expected = records.map((m) => `- .sentinel/memory/${m.file} (${m.type}) — ${m.description}`).join('\n');
    if (actual.replace(/\r\n/g, '\n') !== expected.replace(/\r\n/g, '\n')) {
      issues.push({
        kind: 'memory-index-drift',
        severity: 'warn',
        file: '.sentinel/memory/MEMORY.md',
        detail: `index lists ${countLines(actual)} entries, ${records.length} records exist`,
        repair: 'rebuild-memory-index',
      });
    }
    // Unparseable memory records are skipped by listMemories; report them.
    const raw = readdirSync(join(dir, 'memory')).filter((f) => f.endsWith('.md') && f !== 'MEMORY.md');
    const parseable = new Set(records.map((r) => r.file));
    for (const f of raw) {
      if (!parseable.has(f)) {
        issues.push({
          kind: 'memory-record-unreadable',
          severity: 'warn',
          file: `.sentinel/memory/${f}`,
          detail: 'missing or malformed frontmatter (needs a `name:` line)',
          repair: 'none',
        });
      }
    }
  } catch (e) {
    issues.push({ kind: 'memory-unreadable', severity: 'fail', file: '.sentinel/memory', detail: e.message, repair: 'none' });
  }

  // JSON state files that no longer parse. Each one is individually load-bearing.
  for (const [file, repair] of [
    ['todos.json', 'delete-corrupt'],
    ['outcome.json', 'quarantine-corrupt'],
    ['budget.json', 'delete-corrupt'],
    ['risk.json', 'quarantine-corrupt'],
  ]) {
    const p = join(dir, file);
    if (!existsSync(p)) continue;
    try {
      JSON.parse(readFileSync(p, 'utf-8'));
    } catch (e) {
      issues.push({
        kind: 'corrupt-json',
        severity: 'fail',
        file: `.sentinel/${file}`,
        detail: e.message.slice(0, 120),
        repair,
      });
    }
  }

  // Sessions: a corrupt session should not take down session listing.
  const sessionsDir = process.env.SENTINEL_HOME
    ? join(process.env.SENTINEL_HOME, 'sessions')
    : null;
  if (sessionsDir && existsSync(sessionsDir)) {
    let bad = 0;
    let total = 0;
    for (const f of readdirSync(sessionsDir)) {
      if (!f.endsWith('.json')) continue;
      total++;
      try {
        JSON.parse(readFileSync(join(sessionsDir, f), 'utf-8'));
      } catch {
        bad++;
      }
    }
    if (bad > 0) {
      issues.push({
        kind: 'corrupt-sessions',
        severity: 'warn',
        file: sessionsDir,
        detail: `${bad} of ${total} session files are not valid JSON`,
        repair: 'quarantine-sessions',
      });
    }
  }

  return issues;
}

/**
 * Apply repairs for the given issues. Each repair is idempotent and takes a
 * backup of anything it removes.
 *
 * @param {object[]} issues as returned by checkStateHealth
 * @param {{dryRun?: boolean, cwd?: string}} options
 */
export function repairState(issues, options = {}) {
  const cwd = options.cwd || getWorkdir();
  const applied = [];

  for (const issue of issues) {
    if (issue.repair === 'none' || issue.repair === 'rebuild-memory-index') {
      if (issue.repair === 'rebuild-memory-index') {
        const entries = options.dryRun ? null : rebuildMemoryIndex(cwd);
        applied.push({ ...issue, applied: true, note: entries ? `rebuilt with ${entries.length} entries` : 'would rebuild' });
      } else {
        applied.push({ ...issue, applied: false, note: 'no automatic repair' });
      }
      continue;
    }

    if (options.dryRun) {
      applied.push({ ...issue, applied: false, note: 'would repair' });
      continue;
    }

    try {
      if (issue.repair === 'delete-corrupt' || issue.repair === 'quarantine-corrupt') {
        const p = join(cwd, issue.file);
        if (!existsSync(p)) {
          applied.push({ ...issue, applied: false, note: 'file already gone' });
          continue;
        }
        const quarantine = `${p}.corrupt-${Date.now()}`;
        renameSync(p, quarantine);
        applied.push({
          ...issue,
          applied: true,
          note: issue.repair === 'delete-corrupt'
            ? `quarantined to ${quarantine}`
            : `quarantined to ${quarantine} (inspect and restore if it was valid)`,
        });
      } else if (issue.repair === 'quarantine-sessions') {
        const moved = quarantineCorruptSessions(issue.file);
        applied.push({ ...issue, applied: true, note: `quarantined ${moved} session file(s)` });
      }
    } catch (e) {
      applied.push({ ...issue, applied: false, note: `repair failed: ${e.message}` });
    }
  }
  return applied;
}

function quarantineCorruptSessions(sessionsDir) {
  const quarantineDir = join(dirname(sessionsDir), 'sessions-corrupt');
  mkdirSync(quarantineDir, { recursive: true });
  let moved = 0;
  for (const f of readdirSync(sessionsDir)) {
    if (!f.endsWith('.json')) continue;
    const p = join(sessionsDir, f);
    try {
      JSON.parse(readFileSync(p, 'utf-8'));
    } catch {
      renameSync(p, join(quarantineDir, f));
      moved++;
    }
  }
  return moved;
}

/**
 * Re-register SENTINEL with assistants whose config drifted.
 * A corrupt config is reported but never rewritten automatically — the file is
 * the user's and may hold settings we cannot reconstruct.
 */
export function repairAssistantDrift(drift, options = {}) {
  const { registerWithAssistant } = loadConnectModule();
  return drift
    .filter((d) => d.state !== 'corrupt')
    .map((d) =>
      registerWithAssistant({
        targetId: d.id,
        scope: d.scope,
        cwd: options.cwd,
        dryRun: options.dryRun,
      }),
    );
}

// ── Combined report ─────────────────────────────────────────────────────────

export async function fullHealthCheck({ cwd = getWorkdir(), includeDrift = true } = {}) {
  const state = checkStateHealth(cwd);
  let drift = [];
  let driftError = null;
  if (includeDrift) {
    try {
      drift = checkAssistantDrift(cwd);
    } catch (e) {
      driftError = e.message;
    }
  }
  const memory = await memoryBridgeStatus();
  return {
    cwd,
    state,
    drift,
    driftError,
    memory,
    ok: state.every((i) => i.severity !== 'fail') && drift.every((d) => d.state !== 'corrupt'),
  };
}

async function memoryBridgeStatus() {
  try {
    const { status } = await import('./memory-bridge.js');
    const s = await status();
    return { configured: true, ...s };
  } catch (e) {
    return { configured: false, reachable: false, detail: e.message };
  }
}

/** One-line-per-issue rendering. */
export function renderHealth(report) {
  const lines = [];
  lines.push(`Health check — ${report.cwd}`);

  if (report.drift.length) {
    lines.push('');
    lines.push('Assistant integration:');
    for (const d of report.drift) {
      const mark = d.state === 'corrupt' ? '✗' : '!';
      lines.push(`  ${mark} ${d.target} (${d.scope}) — ${d.state}: ${d.detail}`);
      lines.push(`      ${d.file}`);
    }
    lines.push('  fix with: sentinel heal --fix');
  } else {
    lines.push('');
    lines.push('Assistant integration: ok');
  }
  if (report.driftError) {
    lines.push(`  (drift check failed: ${report.driftError})`);
  }

  lines.push('');
  if (report.state.length) {
    lines.push('State:');
    for (const i of report.state) {
      const mark = i.severity === 'fail' ? '✗' : '!';
      lines.push(`  ${mark} ${i.file} — ${i.detail}`);
    }
    lines.push('  fix with: sentinel heal --fix');
  } else {
    lines.push('State: ok');
  }

  lines.push('');
  if (report.memory?.reachable) {
    lines.push(`Cross-agent memory: online (${report.memory.sessions ?? '?'} sessions)`);
  } else {
    lines.push(`Cross-agent memory: offline${report.memory?.detail ? ` (${String(report.memory.detail).slice(0, 60)})` : ''}`);
    lines.push('  start it with: npx -y @agentmemory/agentmemory@latest');
  }

  return lines.join('\n');
}

// ── helpers ─────────────────────────────────────────────────────────────────

function loadConnectModule() {
  // Static ESM namespace import at the top of this file. It stays one-way on
  // purpose: connect.js must not depend on the health checker.
  return connectModule;
}

function countLines(text) {
  return String(text || '').split('\n').filter((l) => l.trim()).length;
}

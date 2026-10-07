/**
 * Self-update — check, report, and (on explicit confirmation) install.
 *
 * Three distinct things drift independently, so they are checked separately:
 *
 *   sentinel      SENTINEL itself, against the npm registry.
 *   assistants    A registered assistant's config format changed upstream, so
 *                 the entry `sentinel connect` wrote no longer matches what
 *                 that assistant expects.
 *   integrations  External MCP servers and installed skills drifted (server
 *                 unreachable, skills.sh has newer skills).
 *
 * Nothing here installs anything without `--yes`. `check` is always safe.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getWorkdir } from '../shared/tools/workdir.js';
import { checkAssistantDrift, checkStateHealth } from './self-heal.js';

const REGISTRY_TIMEOUT_MS = 8000;
const REPO = 'https://github.com/KunjShah95/SENTINEL-CLI';

function localVersion() {
  try {
    const pkg = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
    return JSON.parse(readFileSync(pkg, 'utf-8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || ''));
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** -1 / 0 / 1 by semver precedence, ignoring prerelease tags. */
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
  }
  return 0;
}

/** Fetch the latest published version of a package from npm. */
export async function fetchLatest(pkg = 'sentinel-cli') {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`, {
      signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return { ok: false, error: `registry returned ${res.status}` };
    const body = await res.json();
    return { ok: true, version: body.version, published: body.time || undefined };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Is SENTINEL newer on npm?
 * @returns {Promise<{current: string, latest: string|null, updateAvailable: boolean, error?: string}>}
 */
export async function checkSelfUpdate({ pkg = 'sentinel-cli' } = {}) {
  const current = localVersion();
  const res = await fetchLatest(pkg);
  if (!res.ok) return { current, latest: null, updateAvailable: false, error: res.error };
  return {
    current,
    latest: res.version,
    updateAvailable: compareVersions(res.version, current) > 0,
  };
}

/**
 * Install the newer version. Only called after explicit confirmation.
 *
 * Runs the global npm install, because a `npx`-invoked copy is ephemeral and
 * updating it would be pointless — the next npx call would fetch the old one
 * again. Reports failure rather than throwing so the CLI can continue.
 */
export function applySelfUpdate({ pkg = 'sentinel-cli', yes = false } = {}) {
  if (!yes) {
    return { applied: false, reason: 'confirmation required — pass --yes' };
  }
  const args = ['install', '-g', `${pkg}@latest`];
  const r = spawnSync('npm', args, {
    stdio: 'pipe',
    encoding: 'utf-8',
    shell: process.platform === 'win32',
  });
  if (r.error) return { applied: false, reason: r.error.message };
  if (r.status !== 0) {
    const detail = String(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' ');
    return { applied: false, reason: `npm exited ${r.status}${detail ? `: ${detail}` : ''}` };
  }
  return { applied: true, version: localVersion() };
}

/**
 * Assistant config drift, framed as an update problem: the assistant changed
 * and SENTINEL's entry is stale. Reuses the self-heal checker so there is one
 * source of truth for "is this registration still correct".
 */
export function checkAssistantUpdates(cwd = getWorkdir()) {
  const drift = checkAssistantDrift(cwd);
  return drift.map((d) => ({
    assistant: d.target,
    scope: d.scope,
    file: d.file,
    state: d.state,
    action:
      d.state === 'corrupt'
        ? 'Inspect manually — the config is not valid JSON, so it will not be rewritten.'
        : 'Run `sentinel heal --fix` to re-register.',
  }));
}

/**
 * External MCP server + skill drift.
 *
 * A server that used to answer and no longer does is the failure that matters
 * most, because it degrades silently: tools just stop appearing.
 */
export async function checkIntegrationHealth({ cwd = getWorkdir(), includeMcp = true } = {}) {
  const result = { mcp: null, skills: null };

  if (includeMcp) {
    try {
      const { configManager } = await import('../config/configManager.js');
      await configManager.load();
      const mcpServers = configManager.get('mcpServers', {}) || {};
      const configured = Object.keys(mcpServers).length;
      if (configured === 0) {
        result.mcp = { configured: 0, ok: true, note: 'no external MCP servers configured' };
      } else {
        const { buildToolRegistry, closeAll } = await import('./mcp-client.js');
        const registry = await buildToolRegistry(mcpServers, { refresh: true });
        await closeAll();
        result.mcp = {
          configured,
          ok: registry.errors.length === 0,
          servers: registry.servers,
          errors: registry.errors,
          tools: registry.tools.length,
        };
      }
    } catch (e) {
      result.mcp = { configured: 0, ok: false, error: e.message };
    }
  }

  try {
    const { skillDiscovery } = await import('../cli/connect.js');
    const dirs = skillDiscovery(cwd);
    result.skills = {
      ok: true,
      directories: dirs.length,
      total: dirs.reduce((n, d) => n + d.count, 0),
    };
  } catch (e) {
    result.skills = { ok: false, error: e.message };
  }

  return result;
}

/** Which skills are installed via skills.sh's own lockfile, if any. */
export function readSkillLock(cwd = getWorkdir()) {
  const p = join(cwd, 'skills-lock.json');
  try {
    return { exists: true, lock: JSON.parse(readFileSync(p, 'utf-8')) };
  } catch {
    return { exists: false, lock: null };
  }
}

/** Run `npx skills update` for installed skills. Only on explicit confirmation. */
export function updateSkills({ cwd = getWorkdir(), yes = false, global = false } = {}) {
  if (!yes) return { applied: false, reason: 'confirmation required — pass --yes' };
  const args = ['--yes', 'skills', 'update', '-y'];
  if (global) args.push('-g');
  const r = spawnSync('npx', args, {
    stdio: 'pipe',
    encoding: 'utf-8',
    cwd,
    shell: process.platform === 'win32',
  });
  if (r.error) return { applied: false, reason: r.error.message };
  if (r.status !== 0) {
    const detail = String(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' ');
    return { applied: false, reason: `skills update exited ${r.status}${detail ? `: ${detail}` : ''}` };
  }
  return { applied: true, output: String(r.stdout || '').slice(0, 500) };
}

/** Full report across all three drift classes. */
export async function fullUpdateReport({ cwd = getWorkdir() } = {}) {
  const self = await checkSelfUpdate();
  const assistants = checkAssistantUpdates(cwd);
  const integrations = await checkIntegrationHealth({ cwd });
  const state = checkStateHealth(cwd);
  return {
    self,
    assistants,
    integrations,
    state,
    lock: readSkillLock(cwd),
    repo: REPO,
    anythingToDo:
      self.updateAvailable ||
      assistants.length > 0 ||
      state.some((i) => i.severity === 'fail') ||
      integrations.mcp?.ok === false,
  };
}

/** Human-readable rendering. */
export function renderUpdateReport(report) {
  const lines = [];
  lines.push(`SENTINEL ${report.self.current}${report.self.updateAvailable ? ` → ${report.self.latest} available` : ' (up to date)'}`);
  if (report.self.error) lines.push(`  could not reach npm: ${report.self.error}`);

  lines.push('');
  if (report.assistants.length === 0) {
    lines.push('Assistants: all registrations current');
  } else {
    lines.push('Assistants:');
    for (const a of report.assistants) {
      lines.push(`  ! ${a.assistant} (${a.scope}) — ${a.state}`);
      lines.push(`      ${a.action}`);
    }
  }

  const mcp = report.integrations.mcp;
  lines.push('');
  if (!mcp) {
    lines.push('External MCP: not checked');
  } else if (mcp.note) {
    lines.push(`External MCP: ${mcp.note}`);
  } else if (mcp.ok) {
    lines.push(`External MCP: ${mcp.servers?.length || 0} server(s) reachable, ${mcp.tools || 0} tool(s)`);
  } else {
    lines.push('External MCP: degraded');
    for (const e of mcp.errors || []) lines.push(`  ✗ ${e.server}: ${e.error}`);
  }

  const skills = report.integrations.skills;
  lines.push(
    skills?.ok
      ? `Skills: ${skills.total} installed across ${skills.directories} directories`
      : `Skills: check failed${skills?.error ? ` (${skills.error})` : ''}`
  );

  if (report.state.length) {
    lines.push('');
    lines.push('State issues:');
    for (const i of report.state) lines.push(`  ${i.severity === 'fail' ? '✗' : '!'} ${i.file} — ${i.detail}`);
  }

  lines.push('');
  lines.push(
    report.anythingToDo
      ? 'Apply with: sentinel update --yes   (or: sentinel heal --fix for assistant + state)'
      : `Nothing to do. ${REPO}`
  );
  return lines.join('\n');
}

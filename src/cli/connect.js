/**
 * Assistant integration — detect installed coding assistants and wire SENTINEL
 * into them.
 *
 * Two directions, both narrow on purpose:
 *
 *   inbound  — register SENTINEL's MCP server in an assistant's config, so
 *              that assistant can call sentinel_ask / sentinel_review_diff.
 *   skills   — make skills.sh-installed skills visible to SENTINEL. SENTINEL
 *              already *reads* .claude/, .codex/, .agents/, .opencode/ skill
 *              directories (see src/agent/skills.js), so no copy is needed; the
 *              only missing piece is verification.
 *
 * Every write is opt-in per target, targets a file the assistant itself owns,
 * and merges rather than overwrites — an existing mcpServers map keeps all of
 * its other entries. Writes are reported with a backup path.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';

export const MCP_SERVER_KEY = 'sentinel';

/**
 * Known assistant config locations.
 *
 * `detected` decides whether we offer the target; `sentinel` entry is the
 * server definition we merge in. Paths are per-user (`~`) unless noted.
 * `project` targets take a project root and are relative to it.
 */
export const ASSISTANT_TARGETS = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    // User scope is a real config file; project scope is the conventional
    // `.mcp.json` that Claude Code reads per-project.
    userPath: () => join(homedir(), '.claude.json'),
    projectPath: (root) => join(root, '.mcp.json'),
    json: true,
  },
  {
    id: 'cursor',
    label: 'Cursor',
    userPath: () => join(homedir(), '.cursor', 'mcp.json'),
    projectPath: (root) => join(root, '.cursor', 'mcp.json'),
    json: true,
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    userPath: () => join(homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
    json: true,
  },
  {
    id: 'zed',
    label: 'Zed',
    userPath: () => join(homedir(), '.config', 'zed', 'settings.json'),
    projectPath: (root) => join(root, '.zed', 'settings.json'),
    json: true,
    // Zed nests MCP servers under context_servers, not mcpServers.
    key: 'context_servers',
    transform: (server) => ({ command: server.command, args: server.args, env: server.env }),
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    userPath: () => join(homedir(), '.config', 'opencode', 'opencode.json'),
    projectPath: (root) => join(root, 'opencode.json'),
    json: true,
    key: 'mcp',
    transform: (server) => ({
      type: 'local',
      command: [server.command, ...(server.args || [])],
      enabled: true,
      environment: server.env || undefined,
    }),
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    userPath: () => join(homedir(), '.codex', 'config.toml'),
    json: false,
    format: 'toml',
  },
  {
    id: 'vscode-copilot',
    label: 'VS Code (Copilot / Cline / Roo)',
    projectPath: (root) => join(root, '.vscode', 'mcp.json'),
    json: true,
  },
];

/** The MCP server definition merged into each assistant config. */
export function sentinelServerDefinition() {
  return {
    command: 'npx',
    args: ['-y', 'sentinel-cli', 'mcp'],
    env: {},
  };
}

function readJsonSafe(file) {
  if (!existsSync(file)) return { data: null, existed: false };
  try {
    const raw = readFileSync(file, 'utf-8').trim();
    if (!raw) return { data: {}, existed: true };
    return { data: JSON.parse(raw), existed: true };
  } catch (e) {
    return { data: null, existed: true, parseError: e.message };
  }
}

function backupFile(file) {
  if (!existsSync(file)) return null;
  const backup = `${file}.sentinel-backup`;
  try {
    renameSync(file, backup);
    return backup;
  } catch {
    // Fall back to a copy-in-place read/write below; if that fails too the
    // caller aborts rather than clobbering.
    return null;
  }
}

/**
 * Discover which assistants are present on this machine.
 * Detection is by config directory OR config file, so a fresh install with an
 * empty config is still offered.
 */
export function detectTargets({ cwd = process.cwd() } = {}) {
  const home = homedir();
  const found = [];
  for (const target of ASSISTANT_TARGETS) {
    const evidence = [];
    let userConfigPath = null;
    if (target.userPath) {
      userConfigPath = target.userPath();
      if (existsSync(userConfigPath)) evidence.push(userConfigPath);
    }
    // A config directory existing at all implies the tool is installed.
    const dirHint = dirHintFor(target.id, home, cwd);
    if (dirHint && existsSync(dirHint)) evidence.push(dirHint);
    let projectConfigPath = null;
    if (target.projectPath) {
      projectConfigPath = target.projectPath(cwd);
      if (existsSync(projectConfigPath)) evidence.push(projectConfigPath);
    }
    if (evidence.length) {
      found.push({
        id: target.id,
        label: target.label,
        evidence,
        userConfigPath,
        projectConfigPath,
      });
    }
  }
  return found;
}

function dirHintFor(id, home, cwd) {
  switch (id) {
    case 'claude-code': return join(home, '.claude');
    case 'cursor': return join(home, '.cursor');
    case 'windsurf': return join(home, '.codeium', 'windsurf');
    case 'zed': return join(home, '.config', 'zed');
    case 'opencode': return join(home, '.config', 'opencode');
    case 'codex': return join(home, '.codex');
    case 'vscode-copilot': return join(cwd, '.vscode');
    default: return null;
  }
}

/**
 * Merge the SENTINEL MCP server into one assistant config.
 *
 * @param {{targetId: string, scope?: 'user'|'project', cwd?: string, dryRun?: boolean}} options
 * @returns {{ok: boolean, target: string, scope: string, file: string, action: string, backup: string|null, message: string}}
 */
export function registerWithAssistant(options = {}) {
  const target = ASSISTANT_TARGETS.find((t) => t.id === options.targetId);
  if (!target) {
    return fail('Unknown assistant target');
  }
  const scope = options.scope === 'project' ? 'project' : 'user';
  const cwd = resolve(options.cwd || process.cwd());
  let file;
  if (scope === 'project') {
    if (!target.projectPath) return fail(`${target.label} has no project-scope config`);
    file = target.projectPath(cwd);
  } else {
    if (!target.userPath) return fail(`${target.label} has no user-scope config`);
    file = target.userPath();
  }

  const server = sentinelServerDefinition();
  const value = target.transform ? target.transform(server) : server;
  const containerKey = target.key || 'mcpServers';

  if (target.format === 'toml') {
    return registerCodexToml({ file, server, dryRun: options.dryRun, target });
  }

  const { data, existed, parseError } = readJsonSafe(file);
  if (parseError) {
    return fail(`Cannot parse ${file}: ${parseError}. Fix or remove the file, then retry.`);
  }
  const config = data && typeof data === 'object' ? data : {};

  // Preserve anything already registered under this key; only replace our entry.
  const existingContainer =
    config[containerKey] && typeof config[containerKey] === 'object' ? config[containerKey] : {};
  const alreadyPresent =
    existingContainer[MCP_SERVER_KEY] !== undefined &&
    JSON.stringify(existingContainer[MCP_SERVER_KEY]) === JSON.stringify(value);

  if (alreadyPresent) {
    return {
      ok: true, target: target.label, scope, file, action: 'unchanged', backup: null,
      message: `${target.label} already points at SENTINEL (${file})`,
    };
  }

  const next = {
    ...config,
    [containerKey]: { ...existingContainer, [MCP_SERVER_KEY]: value },
  };
  const serialized = `${JSON.stringify(next, null, 2)}\n`;

  if (options.dryRun) {
    return {
      ok: true, target: target.label, scope, file, action: 'would-write', backup: null,
      message: `Would add "${MCP_SERVER_KEY}" to ${containerKey} in ${file}`,
      preview: serialized,
    };
  }

  mkdirSync(dirname(file), { recursive: true });
  const backup = backupFile(file);
  writeFileSync(file, serialized, { mode: 0o600 });

  return {
    ok: true, target: target.label, scope, file, action: 'written', backup,
    message: `Registered SENTINEL MCP server in ${target.label} (${file})${backup ? ` — backup at ${backup}` : ''}`,
  };
}

/**
 * Codex config is TOML, not JSON. Append a scoped block rather than
 * round-tripping the file, so comments and unrelated settings survive.
 */
function registerCodexToml({ file, server, dryRun, target }) {
  const argsToml = (server.args || []).map((a) => JSON.stringify(a)).join(', ');
  const block = `\n[mcp_servers.${MCP_SERVER_KEY}]\ncommand = ${JSON.stringify(server.command)}\nargs = [${argsToml}]\n`;

  let existing = '';
  if (existsSync(file)) {
    try {
      existing = readFileSync(file, 'utf-8');
    } catch (e) {
      return fail(`Cannot read ${file}: ${e.message}`);
    }
  }
  if (new RegExp(`^\\[mcp_servers\\.${MCP_SERVER_KEY}\\]`, 'm').test(existing)) {
    return {
      ok: true, target: target.label, scope: 'user', file, action: 'unchanged', backup: null,
      message: `${target.label} already has an mcp_servers.${MCP_SERVER_KEY} block (${file})`,
    };
  }
  if (dryRun) {
    return {
      ok: true, target: target.label, scope: 'user', file, action: 'would-write', backup: null,
      message: `Would append [mcp_servers.${MCP_SERVER_KEY}] to ${file}`, preview: block,
    };
  }
  mkdirSync(dirname(file), { recursive: true });
  const backup = backupFile(file);
  writeFileSync(file, `${existing.replace(/\s*$/, '')}${block}`, { mode: 0o600 });
  return {
    ok: true, target: target.label, scope: 'user', file, action: 'written', backup,
    message: `Appended [mcp_servers.${MCP_SERVER_KEY}] to ${file}${backup ? ` — backup at ${backup}` : ''}`,
  };
}

function fail(message) {
  return { ok: false, target: null, scope: null, file: null, action: 'failed', backup: null, message };
}

/**
 * Remove the SENTINEL entry from an assistant config. The inverse of
 * `registerWithAssistant`; used by `sentinel connect --remove`.
 */
export function unregisterFromAssistant(options = {}) {
  const target = ASSISTANT_TARGETS.find((t) => t.id === options.targetId);
  if (!target) return fail('Unknown assistant target');
  const file = options.scope === 'project' ? target.projectPath?.(resolve(options.cwd || process.cwd())) : target.userPath?.();
  if (!file) return fail(`${target.label} has no config for that scope`);

  const { data, parseError } = readJsonSafe(file);
  if (parseError) return fail(`Cannot parse ${file}: ${parseError}`);
  if (!data) return fail(`No config at ${file}`);

  const containerKey = target.key || 'mcpServers';
  const container = data[containerKey];
  if (!container || typeof container !== 'object' || container[MCP_SERVER_KEY] === undefined) {
    return {
      ok: true, target: target.label, file, action: 'unchanged', backup: null,
      message: `${target.label} config has no SENTINEL entry (${file})`,
    };
  }
  if (options.dryRun) {
    return {
      ok: true, target: target.label, file, action: 'would-write', backup: null,
      message: `Would remove "${MCP_SERVER_KEY}" from ${containerKey} in ${file}`,
    };
  }
  const next = { ...container };
  delete next[MCP_SERVER_KEY];
  const out = { ...data };
  if (Object.keys(next).length) out[containerKey] = next;
  else delete out[containerKey];

  const backup = backupFile(file);
  writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`, { mode: 0o600 });
  return {
    ok: true, target: target.label, file, action: 'written', backup,
    message: `Removed SENTINEL from ${target.label} (${file})${backup ? ` — backup at ${backup}` : ''}`,
  };
}

/**
 * Which skill directories SENTINEL can currently read. No writes: skills.js
 * already scans all of these, so this is verification, not installation.
 */
export function skillDiscovery(cwd = process.cwd()) {
  const home = homedir();
  const candidates = [
    { owner: 'sentinel', path: join(cwd, '.sentinel', 'skills'), scope: 'project' },
    { owner: 'claude', path: join(cwd, '.claude', 'skills'), scope: 'project' },
    { owner: 'codex', path: join(cwd, '.codex', 'skills'), scope: 'project' },
    { owner: 'agents', path: join(cwd, '.agents', 'skills'), scope: 'project' },
    { owner: 'opencode', path: join(cwd, '.opencode', 'skills'), scope: 'project' },
    { owner: 'sentinel', path: join(home, '.sentinel', 'skills'), scope: 'global' },
    { owner: 'claude', path: join(home, '.claude', 'skills'), scope: 'global' },
    { owner: 'codex', path: join(home, '.codex', 'skills'), scope: 'global' },
    { owner: 'agents', path: join(home, '.agents', 'skills'), scope: 'global' },
    { owner: 'opencode', path: join(home, '.opencode', 'skills'), scope: 'global' },
  ];
  const dirs = [];
  for (const c of candidates) {
    if (!existsSync(c.path)) continue;
    let count = 0;
    try {
      count = readdirSync(c.path, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
    } catch {
      count = 0;
    }
    dirs.push({ ...c, count });
  }
  return dirs;
}
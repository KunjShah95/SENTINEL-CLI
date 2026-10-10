/**
 * doctor — pre-flight checks for a coding agent CLI.
 *
 * An agent has more ways to be unusable than a normal program: it needs a
 * runtime new enough for the syntax it ships, a writable data directory, at
 * least one reachable provider, a resolved config, and a tool layer that can
 * actually touch the filesystem. When any of those is missing, the failure
 * surfaces two minutes into a turn as an opaque stack trace, which is the worst
 * possible time to learn that `~/.sentinel` is read-only.
 *
 * So: run every check, report every failure, and exit non-zero if any failed.
 * Deliberately no network calls except an opt-in provider probe — a health
 * check that needs the internet to tell you the internet is down is useless.
 *
 * Pure-ish and side-effect-light: the only writes are the throwaway temp files
 * used to prove the filesystem actually accepts writes, and they are removed.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { platform, release, totalmem, freemem } from 'node:os';
import { join, resolve, delimiter } from 'node:path';
import { getWorkdir } from '../shared/tools/workdir.js';
import { classifyBashCommand } from './bash-validation.js';
import { CONNECTORS, getConnectorEnvVars } from '../shared/connectors/registry.js';

export const MIN_NODE_MAJOR = 20;

/** Severity levels. Only `fail` makes the command exit non-zero; see runDoctor. */
export const LEVELS = Object.freeze(['pass', 'warn', 'fail', 'skip']);

/**
 * Provider env vars, derived from the connector registry.
 *
 * This table used to be hand-written and is the fourth copy of this mapping
 * (the others were in models/index.js, agent/providers.js, and the default
 * config block). The comment above it documented a real drift: Copilot listed
 * `GITHUB_COPILOT_TOKEN` here while `/setup` wrote `GITHUB_TOKEN` and discovery
 * read either — so a user who had connected successfully was told by
 * `sentinel doctor` that they had no key. Seven copies existed and two had
 * already drifted.
 *
 * Derived from the registry, there is one copy and no drift is expressible.
 * Kept as an exported constant because `__tests__/doctor.test.js` asserts the
 * Copilot alias pair specifically.
 */
export const PROVIDER_ENV = Object.freeze(
  Object.fromEntries(
    Object.entries(CONNECTORS)
      .filter(([, c]) => c.env.length > 0)
      .map(([id, c]) => [id, c.env.length === 1 ? c.env[0] : c.env.slice()])
  )
);

/** Every var name for a provider, as an array. The single place callers ask. */
export function providerEnvVars(provider) {
  return getConnectorEnvVars(provider);
}

/** Local model servers need no key, so they get their own probe. */
export const LOCAL_HOSTS = Object.freeze(
  Object.fromEntries(
    Object.entries(CONNECTORS)
      .filter(([, c]) => c.local)
      .map(([id, c]) => [id, c.discoveryBaseURL ? c.discoveryBaseURL() : c.baseURL()])
  )
);

function check(id, title, level, detail, hint) {
  return { id, title, level, detail, hint: hint || null };
}

/**
 * Node runtime, including the exact syntax gate. A tool that requires Node 20
 * but runs on 18 fails on `??=` or a bare `import` assertion, deep in a turn.
 */
export function checkRuntime() {
  const major = Number(process.versions.node.split('.')[0]);
  if (!Number.isFinite(major)) {
    return check('runtime', 'Node runtime', 'fail', `could not parse "${process.versions.node}"`);
  }
  if (major < MIN_NODE_MAJOR) {
    return check(
      'runtime',
      'Node runtime',
      'fail',
      `Node ${process.versions.node} is older than the required ${MIN_NODE_MAJOR}.x`,
      `Install Node ${MIN_NODE_MAJOR}+, e.g. \`nvm install ${MIN_NODE_MAJOR}\` and re-run.`,
    );
  }
  return check('runtime', 'Node runtime', 'pass', `v${process.versions.node}`);
}

/**
 * The project data directory. Checked by writing, not by stat: a directory can
 * exist, be owned by you, and still be read-only.
 */
export function checkDataDir(cwd = getWorkdir()) {
  const dir = join(cwd, '.sentinel');
  const probe = join(dir, `.doctor-${process.pid}-${Date.now()}.tmp`);
  try {
    mkdirSync(dir, { recursive: true });
  } catch (e) {
    return check(
      'data-dir',
      'Project data directory',
      'fail',
      `cannot create ${dir}: ${e.message}`,
      'Check the directory permissions, or run the agent outside a read-only checkout.',
    );
  }
  try {
    writeFileSync(probe, 'ok');
    rmSync(probe, { force: true });
  } catch (e) {
    return check(
      'data-dir',
      'Project data directory',
      'fail',
      `${dir} exists but is not writable: ${e.message}`,
      'Sessions, checkpoints and the risk ledger all live here, so nothing will persist until this is fixed.',
    );
  }
  return check('data-dir', 'Project data directory', 'pass', `writable · ${dir}`);
}

/** Whether the resolved workspace looks like the project the user meant to be in. */
export function checkWorkdir(cwd = getWorkdir()) {
  const dir = resolve(cwd);
  if (!existsSync(dir)) {
    return check('workdir', 'Working directory', 'fail', `${dir} does not exist`, 'cd to a real directory first.');
  }
  const markers = ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', '.git', 'src'];
  const found = markers.filter((m) => existsSync(join(dir, m)));
  if (!found.length) {
    return check(
      'workdir',
      'Working directory',
      'warn',
      `${dir} has no project markers`,
      'It may be empty or not a repo root. Tools still work; expect fewer useful results.',
    );
  }
  return check('workdir', 'Working directory', 'pass', `${dir} · ${found.slice(0, 3).join(', ')}`);
}

/**
 * Provider credentials: environment first, then the config store.
 *
 * The config store matters because it is what the runtime actually reads —
 * `getApiKey()` resolves the saved key before the environment, and
 * `injectEnvVars()` pushes saved keys into the process env on first use. A
 * developer who ran `/setup` once is genuinely ready; reporting "no key" to
 * them is a false negative that tells a working install to stop. Only the
 * provider and variable names are ever surfaced, never the values.
 */
export function checkProviders(env = process.env, configured = []) {
  // The first var name that is actually set is the one reported, so the output
  // names the variable the user's shell really has rather than the table's
  // preference. Both count as present.
  const present = Object.keys(PROVIDER_ENV)
    .map((provider) => {
      const varName = providerEnvVars(provider).find((n) => {
        const v = env[n];
        return typeof v === 'string' && v.trim().length > 0;
      });
      return varName ? { provider, varName } : null;
    })
    .filter(Boolean);

  // Saved in config but not exported: still a working provider. Unknown ids are
  // ignored so a stale or hand-edited config cannot make this pass.
  const stored = Array.from(new Set(configured))
    .filter((provider) => PROVIDER_ENV[provider])
    .filter((provider) => !present.some((p) => p.provider === provider))
    .map((provider) => ({ provider, varName: providerEnvVars(provider)[0] }));

  const found = [...present, ...stored];

  if (found.length) {
    const list = found
      .map((p) => (p.varName ? `${p.provider} (${p.varName})` : `${p.provider} (config)`))
      .join(', ');
    const hint = present.length
      ? 'Keys are never read back or printed; only the variable names are shown.'
      : 'Found in the Sentinel config store. `getApiKey()` reads these before the environment.';
    return check(
      'providers',
      'Provider credentials',
      'pass',
      `${found.length} set · ${list}`,
      hint,
    );
  }
  return check(
    'providers',
    'Provider credentials',
    'fail',
    'no provider API key found in the environment or the config store',
    'Export one, e.g. `export GROQ_API_KEY=gsk_...`, run `/setup` in the TUI, or run Ollama/LM Studio locally which needs no key.',
  );
}

/** Providers with a key saved in the Sentinel config store. Never throws. */
async function configuredProviders() {
  try {
    const { configManager } = await import('../config/configManager.js');
    await configManager.load?.();
    const list = configManager.getConfiguredProviders?.();
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Local model servers. Probed only when asked, because it costs a network round trip. */
export async function checkLocalModels(entries) {
  const reachable = [];
  const unreachable = [];
  for (const [name, host] of entries) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 1200);
      const res = await fetch(host, { signal: ac.signal });
      clearTimeout(timer);
      // Any HTTP answer means something is listening and speaking HTTP.
      (res.ok || res.status ? reachable : unreachable).push(`${name} (${host})`);
    } catch {
      unreachable.push(`${name} (${host})`);
    }
  }
  if (reachable.length) return check('local-models', 'Local model servers', 'pass', `up · ${reachable.join(', ')}`);
  if (!unreachable.length) return check('local-models', 'Local model servers', 'skip', 'not probed');
  return check(
    'local-models',
    'Local model servers',
    'warn',
    `not reachable · ${unreachable.join(', ')}`,
    'Expected if you use a hosted provider. To run fully offline, start `ollama serve`.',
  );
}

/** The tool layer's two non-negotiables: classification runs, and the sandbox is wired. */
export function checkTooling() {
  const probes = [
    'git status',
    'ls -la',
    'npm test',
    'git commit -m "x"',
    'rm -rf /',
    'echo hi > out.txt',
  ];
  const classified = probes.filter((c) => classifyBashCommand(c).intent !== undefined);
  if (classified.length !== probes.length) {
    return check(
      'tooling',
      'Tool layer',
      'fail',
      'bash command classification is not classifying',
      'Every shell tool call depends on this; without it nothing can be gated.',
    );
  }
  // The destructive classifier is the control that keeps an agent out of trouble.
  const rmrf = classifyBashCommand('rm -rf /');
  if (!rmrf.destructive) {
    return check(
      'tooling',
      'Tool layer',
      'fail',
      'destructive pattern table is not matching',
      '`rm -rf /` must classify as destructive for the red gate to work.',
    );
  }
  return check('tooling', 'Tool layer', 'pass', `classified ${probes.length} probe command(s); destructive patterns armed`);
}

/**
 * Machine facts that change whether a long turn will survive. Memory and the
 * shell are the two that actually bite: a runaway agent OOMs on large repos.
 */
export function checkHost() {
  const memGb = Math.round(totalmem() / 1024 ** 3);
  const freeGb = Math.round(freemem() / 1024 ** 3);
  const parts = [`${platform()} ${release()}`, `${memGb} GB RAM (${freeGb} GB free)`];
  if (memGb < 4) {
    return check('host', 'Host resources', 'warn', parts.join(' · '), 'Under 4 GB, long turns on large repos may be OOM-killed.');
  }
  return check('host', 'Host resources', 'pass', parts.join(' · '));
}

export function checkPathDelimiter() {
  return check(
    'path',
    'Shell PATH',
    platform() === 'win32' ? 'warn' : 'pass',
    `PATH separator "${delimiter}" on ${platform()}`,
    platform() === 'win32'
      ? 'On Windows the shell tool runs through cmd; prefer Node-based tools over POSIX-only commands.'
      : null,
  );
}

/**
 * Live probe of every connector that has a credential.
 *
 * Deliberately not a failure: an unreachable or quota-blocked connector still
 * leaves the others usable, and `sentinel doctor` exiting non-zero would be
 * wrong when a valid local model is loaded. It reports as `warn` so it is
 * visible without blocking.
 */
async function checkConnectorHealth() {
  const { probeConnectors, summarize, HEALTH } = await import('../shared/connectors/health.js');
  const rows = await probeConnectors();
  if (rows.length === 0) {
    return check('connector-health', 'Connector health', 'warn',
      'no connector has a credential',
      'Add one with `sentinel auth login <id>`, or run Ollama for a free local model.');
  }
  const broken = rows.filter((r) => r.state !== HEALTH.OK && r.state !== HEALTH.DEGRADED);
  const level = broken.length === rows.length ? 'fail' : broken.length ? 'warn' : 'pass';
  return check('connector-health', 'Connector health', level, summarize(rows),
    broken.length ? broken.map((r) => `${r.label}: ${r.advice}`).join(' · ') : null);
}

/**
 * Every check, in the order a failure is most likely to be the real cause.
 * `probeNetwork` defaults to false so a plain `sentinel doctor` stays offline.
 */
export async function runDoctor({ cwd = getWorkdir(), env = process.env, probeNetwork = false, configured } = {}) {
  // `configured` is injectable so a caller (and the tests) can pin the config
  // side of the provider check instead of reading the machine's real config.
  const configuredList = configured ?? (await configuredProviders());

  const checks = [
    checkRuntime(),
    checkWorkdir(cwd),
    checkDataDir(cwd),
    checkProviders(env, configuredList),
    checkHost(),
    checkTooling(),
    checkPathDelimiter(),
  ];

  if (probeNetwork) {
    checks.push(await checkLocalModels(Object.entries(LOCAL_HOSTS)));
    // Key presence is not health. A set key can be expired, revoked, or
    // quota-blocked, and `checkProviders` cannot tell — it only reads names.
    // Probing answers the question the user actually has.
    checks.push(await checkConnectorHealth());
  } else {
    checks.push(check('local-models', 'Local model servers', 'skip', 'not probed (--network)'));
    checks.push(check('connector-health', 'Connector health', 'skip', 'not probed (--network)'));
  }

  return {
    cwd: resolve(cwd),
    node: process.versions.node,
    probed: probeNetwork,
    checks,
    // Only `fail` blocks. A `warn` is information for a human — the Windows PATH
    // note, low memory, an unrecognised directory — and exiting non-zero on
    // those would make the command useless, so nobody would run it.
    ok: checks.every((c) => c.level !== 'fail'),
    counts: LEVELS.reduce((acc, lvl) => {
      acc[lvl] = checks.filter((c) => c.level === lvl).length;
      return acc;
    }, {}),
  };
}

const COLOR = { pass: '\x1b[32m', warn: '\x1b[33m', fail: '\x1b[31m', skip: '\x1b[90m' };
const MARK = { pass: '✓', warn: '!', fail: '✗', skip: '·' };
const RESET = '\x1b[0m';

export function renderDoctor(report) {
  const lines = [];
  lines.push(`\x1b[2msentinel doctor · ${report.cwd}\x1b[0m`);
  for (const c of report.checks) {
    lines.push(`${COLOR[c.level] || ''}${MARK[c.level] || '?'}${RESET} ${c.title} — ${c.detail}`);
    if (c.hint && c.level !== 'pass') lines.push(`  \x1b[2m${c.hint}\x1b[0m`);
  }
  const { pass = 0, warn = 0, fail = 0, skip = 0 } = report.counts;
  lines.push('');
  lines.push(`${pass} passed · ${warn} warning(s) · ${fail} failed · ${skip} skipped`);
  lines.push(
    report.ok
      ? '\x1b[32mReady. Try `sentinel ask "what is this project?"`\x1b[0m'
      : '\x1b[31mNot ready. Fix the failures above before starting a turn.\x1b[0m',
  );
  return lines.join('\n');
}

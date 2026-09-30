/**
 * Bash command classification (ported from claw-code
 * rust/crates/runtime/src/bash_validation.rs: readOnlyValidation,
 * destructiveCommandWarning, sedValidation, pathValidation, commandSemantics).
 *
 * The builtin hook guard hard-blocks a handful of catastrophic patterns.
 * This layer is softer: it classifies every segment of a command line so the
 * loop can (a) always re-ask for destructive commands even after a
 * session-wide "allow bash", and (b) auto-approve provably read-only commands
 * for background teammates that have no user to ask. Pure; unit-tested.
 */

const WRITE_COMMANDS = new Set([
  'cp', 'mv', 'rm', 'mkdir', 'rmdir', 'touch', 'chmod', 'chown', 'chgrp', 'ln', 'install',
  'tee', 'truncate', 'shred', 'mkfifo', 'mknod', 'dd', 'patch', 'unzip', 'tar',
]);

const STATE_COMMANDS = new Set([
  'apt', 'apt-get', 'yum', 'dnf', 'pacman', 'brew', 'pip', 'pip3', 'npm', 'npx', 'yarn', 'pnpm',
  'bun', 'cargo', 'gem', 'go', 'rustup', 'docker', 'systemctl', 'service', 'mount', 'umount',
  'kill', 'pkill', 'killall', 'reboot', 'shutdown', 'halt', 'poweroff', 'useradd', 'userdel',
  'usermod', 'crontab', 'at', 'curl', 'wget', 'ssh', 'scp', 'rsync', 'node', 'python',
  'python3', 'make', 'sh', 'bash', 'pwsh', 'powershell',
]);

const READ_ONLY_COMMANDS = new Set([
  'ls', 'cat', 'head', 'tail', 'less', 'more', 'wc', 'sort', 'uniq', 'grep', 'egrep', 'fgrep',
  'rg', 'find', 'fd', 'tree', 'pwd', 'echo', 'printf', 'which', 'whereis', 'type', 'file',
  'stat', 'du', 'df', 'diff', 'cmp', 'cut', 'tr', 'awk', 'basename', 'dirname', 'realpath',
  'readlink', 'date', 'env', 'printenv', 'uname', 'whoami', 'id', 'true', 'false', 'test',
  'jq', 'nl', 'column', 'od', 'xxd', 'hexdump', 'sha256sum', 'md5sum', 'sed',
]);

const GIT_READ_ONLY = new Set([
  'status', 'log', 'diff', 'show', 'branch', 'tag', 'remote', 'ls-files', 'ls-tree',
  'cat-file', 'rev-parse', 'describe', 'shortlog', 'blame', 'reflog', 'grep', 'rev-list',
]);

const DESTRUCTIVE_PATTERNS = [
  [/\brm\s+-[a-z]*r[a-z]*f[a-z]*\s+(\/|~|\*|\.)(\s|$)/i, 'Recursive forced deletion of a broad target'],
  [/\brm\s+-[a-z]*f[a-z]*r[a-z]*\s+(\/|~|\*|\.)(\s|$)/i, 'Recursive forced deletion of a broad target'],
  [/\bmkfs\b/, 'Filesystem creation destroys existing data'],
  [/\bdd\s+if=/, 'Direct disk write'],
  [/>\s*\/dev\/sd/, 'Writing to a raw disk device'],
  [/\bchmod\s+-R\s+(777|000)\b/, 'Recursive permission rewrite'],
  [/:\(\)\s*{\s*:\|:\s*&\s*}\s*;/, 'Fork bomb'],
  [/\bgit\s+reset\s+--hard\b/, 'git reset --hard discards uncommitted work'],
  [/\bgit\s+push\b[^|;&]*\s(--force|-f)(\s|$)/, 'Force push rewrites remote history'],
  [/\bgit\s+clean\s+-[a-z]*f/i, 'git clean -f deletes untracked files'],
  [/\bgit\s+checkout\s+(--\s+)?\.(\s|$)/, 'git checkout . discards working-tree changes'],
  [/\bgit\s+branch\s+-D\b/, 'Force-deleting a branch'],
  [/\b(shred|wipefs)\b/, 'Inherently destructive command'],
  [/\bRemove-Item\b[^|;]*-Recurse[^|;]*-Force/i, 'Recursive forced deletion (PowerShell)'],
];

const OUTSIDE_WORKSPACE = /(^|\s)(\/etc\/|\/usr\/|\/var\/|\/boot\/|\/sys\/|\/proc\/|\/dev\/|\/sbin\/|\/lib\/|\/opt\/|[A-Za-z]:\\Windows\\)/;

/** Split on ; && || | while respecting simple quotes. */
export function splitSegments(command) {
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      cur += c;
      continue;
    }
    if (c === '"' || c === '\'') {
      quote = c;
      cur += c;
      continue;
    }
    const two = command.slice(i, i + 2);
    if (two === '&&' || two === '||') {
      out.push(cur);
      cur = '';
      i++;
      continue;
    }
    if (c === ';' || c === '|' || c === '\n') {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

function firstWord(segment) {
  const words = segment.split(/\s+/).filter((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w));
  const w = words[0] || '';
  return { word: w.replace(/^.*[\\/]/, ''), rest: words.slice(1) };
}

/** Write redirection outside quotes (2>&1 and >/dev/null are fine). */
function hasWriteRedirect(segment) {
  const unquoted = segment.replace(/"[^"]*"|'[^']*'/g, '');
  const cleaned = unquoted.replace(/\d?>&\d/g, '').replace(/\d?>+\s*\/dev\/null/g, '');
  return /(^|[^<>])>{1,2}/.test(cleaned);
}

function classifySegment(segment) {
  const { word, rest } = firstWord(segment);
  if (!word) return 'read_only';
  if (word === 'sudo') return 'state';
  if (hasWriteRedirect(segment)) return 'write';
  if (word === 'git') {
    const sub = rest.find((w) => !w.startsWith('-'));
    if (!sub) return 'read_only';
    return GIT_READ_ONLY.has(sub) ? 'read_only' : 'write';
  }
  if (word === 'sed') return /\s-i\b|\s--in-place\b/.test(segment) ? 'write' : 'read_only';
  if (word === 'find') return /\s-(delete|exec|execdir|ok)\b/.test(segment) ? 'write' : 'read_only';
  if (WRITE_COMMANDS.has(word)) return 'write';
  if (STATE_COMMANDS.has(word)) return 'state';
  if (READ_ONLY_COMMANDS.has(word)) return 'read_only';
  return 'unknown';
}

const RANK = { read_only: 0, unknown: 1, write: 2, state: 3 };

/**
 * @returns {{ intent: 'read_only'|'unknown'|'write'|'state', readOnly: boolean,
 *   destructive: boolean, warnings: string[] }}
 */
export function classifyBashCommand(command = '') {
  const cmd = String(command);
  const segments = splitSegments(cmd);
  let intent = 'read_only';
  for (const seg of segments) {
    const k = classifySegment(seg);
    if (RANK[k] > RANK[intent]) intent = k;
  }
  // Command substitution can hide anything.
  if (/\$\(|`/.test(cmd) && intent === 'read_only') intent = 'unknown';
  const warnings = [];
  for (const [re, msg] of DESTRUCTIVE_PATTERNS) {
    if (re.test(cmd)) warnings.push(msg);
  }
  const destructive = warnings.length > 0;
  if (OUTSIDE_WORKSPACE.test(cmd)) warnings.push('Command targets system paths outside the workspace');
  if (/(^|[\s/])\.\.\//.test(cmd)) warnings.push('Directory traversal (../) — verify target stays in the workspace');
  return { intent, readOnly: intent === 'read_only', destructive, warnings };
}

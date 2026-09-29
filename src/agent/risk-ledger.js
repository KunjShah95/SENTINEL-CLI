/**
 * Risk ledger — permission by novelty, not by category.
 *
 * The problem with a per-tool permission toggle is that it is all-or-nothing
 * and binary. "allow bash for this session" is the same grant for `git status`
 * and for `npm publish`, and a category-based policy (`shell: ask`) is either
 * so strict nobody works or so loose nothing is caught.
 *
 * A forward-deployed engineer does something more subtle: the first hour in an
 * unfamiliar codebase is deliberately small and green. You run what you can
 * prove is safe, you get a human to say yes once, and from then on that *kind*
 * of command is fine. Something new and unfamiliar still gets asked.
 *
 * So this module records command SHAPES — `git commit -m <msg>` — rather than
 * exact commands, and grades each one:
 *
 *   green   a shape already approved in this repo, or provably read-only
 *   yellow  a new shape that is not destructive → ask, with a suggested check
 *   red     destructive, or reaches outside the workspace → always ask, and
 *           never satisfied by a session grant
 *
 * It fails closed: a missing or corrupt ledger is `yellow`, never `green`.
 * An approving ledger that does not exist is not consent.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getWorkdir } from '../shared/tools/workdir.js';
import { classifyBashCommand, splitSegments } from './bash-validation.js';

export const LEDGER_VERSION = '1';
export const RISK_LEVELS = Object.freeze(['green', 'yellow', 'red']);

/** How many distinct shapes a ledger remembers before the oldest are dropped. */
export const LEDGER_MAX_SHAPES = 200;

export const LEDGER_PATH = '.sentinel/risk.json';

export function ledgerFile(cwd = getWorkdir()) {
  return join(cwd, '.sentinel', 'risk.json');
}

/**
 * Reduce a command to its shape: the verb and its flags survive, arguments
 * become placeholders. `git commit -am "fix bug"` and `git commit -am "other"`
 * are the same shape, so the second is green once the first was approved;
 * `git push --force` is a different shape, so it is asked again.
 *
 * Placeholder classes matter. Collapsing everything to `<arg>` would make
 * `--force` and `--dry-run` the same shape, which is precisely the mistake
 * this module exists to prevent — flags are kept verbatim, only values go.
 */
const URL_RE = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;
const DOUBLE_QUOTE = '\u0022';
const SINGLE_QUOTE = '\u0027';

/**
 * Tools whose SECOND word is the real verb. Without this, `git commit` and
 * `git push` collapse to the same shape and approving a commit would silently
 * authorize a push — the single worst failure this module could have.
 */
const SUBCOMMAND_TOOLS = new Set([
  'git', 'npm', 'npx', 'pnpm', 'yarn', 'bun', 'cargo', 'docker', 'kubectl', 'helm',
  'go', 'pip', 'pip3', 'brew', 'gh', 'aws', 'gcloud', 'az', 'systemctl', 'composer',
  'make', 'gradle', 'terraform', 'ansible', 'rustup',
]);

function shapeToken(token) {
  if (/^--?[A-Za-z][\w-]*=?$/.test(token)) return token; // bare flag, or --flag=value
  if (/^--?[\w-]+$/.test(token)) return token; // short flag cluster
  if (URL_RE.test(token)) return '<url>';
  if (/^[A-Za-z]:[\\/]/.test(token) || token.startsWith('/') || token.startsWith('~')) return '<path>';
  if (/^\d+(\.\d+)?$/.test(token)) return '<n>';
  // A git ref, branch, or revision.
  if (/^[0-9a-f]{7,40}$/i.test(token)) return '<sha>';
  if (token.includes('/')) return '<path>';
  if (token.includes('.') && !/^\.+$/.test(token)) return '<name>';
  return '<word>';
}

/** The shape of one segment: `git commit -m <word>` → `git commit -m <word>`. */
export function shapeSegment(segment) {
  // Respect quotes: the contents of a quoted string are one opaque argument.
  const tokens = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    if (quote) {
      if (c === quote) { quote = null; if (cur) { tokens.push(cur); cur = ''; } continue; }
      cur += c;
      continue;
    }
    if (c === DOUBLE_QUOTE || c === SINGLE_QUOTE) { quote = c; continue; }
    if (/\s/.test(c)) { if (cur) { tokens.push(cur); cur = ''; } continue; }
    cur += c;
  }
  if (cur) tokens.push(cur);
  if (!tokens.length) return '';
  const words = tokens.filter((t) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(t));
  const verb = (words[0] || '').replace(/^.*[\\/]/, '');
  const out = [verb];
  // The subcommand is part of the verb, not an argument: `git commit` and
  // `git push` are different things and must never share a shape.
  if (SUBCOMMAND_TOOLS.has(verb)) {
    const sub = words.slice(1).find((t) => !t.startsWith('-'));
    if (sub) out.push(sub);
  }
  for (const t of words) {
    if (t === words[0]) continue;
    if (out.length > 1 && t === out[1]) continue;
    out.push(shapeToken(t));
  }
  return out.join(' ');
}

/** The shape of a whole command line, per segment, joined. */
export function commandShape(command = '') {
  const segs = splitSegments(String(command)).map(shapeSegment).filter(Boolean);
  return segs.join(' ; ') || '?';
}

export function readLedger(cwd = getWorkdir()) {
  const file = ledgerFile(cwd);
  if (!existsSync(file)) return { version: LEDGER_VERSION, shapes: {} };
  try {
    const data = JSON.parse(readFileSync(file, 'utf-8'));
    if (!data || typeof data !== 'object' || typeof data.shapes !== 'object' || data.shapes === null) {
      return { version: LEDGER_VERSION, shapes: {} };
    }
    return { version: data.version || LEDGER_VERSION, shapes: data.shapes };
  } catch {
    // Fail closed: an unreadable ledger is an empty ledger, which grades
    // everything novel as yellow. It must never grade as green.
    return { version: LEDGER_VERSION, shapes: {} };
  }
}

export function writeLedger(ledger, cwd = getWorkdir()) {
  const shapes = ledger?.shapes && typeof ledger.shapes === 'object' ? ledger.shapes : {};
  const entries = Object.entries(shapes)
    .sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0))
    .slice(0, LEDGER_MAX_SHAPES);
  const doc = { version: LEDGER_VERSION, shapes: Object.fromEntries(entries) };
  mkdirSync(join(cwd, '.sentinel'), { recursive: true });
  writeFileSync(ledgerFile(cwd), JSON.stringify(doc, null, 2), 'utf-8');
  return doc;
}

/** Record that a shape was approved. Only meaningful for a 'allow-session' or an explicit approval. */
export function recordApproval(command, cwd = getWorkdir(), { at = Date.now() } = {}) {
  const shape = commandShape(command);
  const ledger = readLedger(cwd);
  const prev = ledger.shapes[shape];
  ledger.shapes[shape] = { at, count: (prev?.count || 0) + 1 };
  return writeLedger(ledger, cwd);
}

export function forgetShape(command, cwd = getWorkdir()) {
  const shape = commandShape(command);
  const ledger = readLedger(cwd);
  if (!(shape in ledger.shapes)) return ledger;
  delete ledger.shapes[shape];
  return writeLedger(ledger, cwd);
}

/**
 * Grade a command for this repo.
 *
 * @returns {{ level: 'green'|'yellow'|'red', shape: string, intent: string,
 *   reason: string, warnings: string[], known: boolean }}
 */
export function riskLevel(command, cwd = getWorkdir(), ledger = readLedger(cwd)) {
  const cmd = String(command ?? '');
  const shape = commandShape(cmd);
  const cls = classifyBashCommand(cmd);
  const known = Object.prototype.hasOwnProperty.call(ledger?.shapes || {}, shape);

  // Red wins over everything, and is never satisfied by having seen the shape
  // before. `rm -rf /` is not made safe by approving it once.
  if (cls.destructive) {
    return {
      level: 'red',
      shape,
      intent: cls.intent,
      reason: cls.warnings[0] || 'destructive command',
      warnings: cls.warnings,
      known,
    };
  }

  if (cls.readOnly) {
    return { level: 'green', shape, intent: cls.intent, reason: 'read-only', warnings: cls.warnings, known };
  }

  if (known) {
    return {
      level: 'green',
      shape,
      intent: cls.intent,
      reason: `shape already approved in this repo: ${shape}`,
      warnings: cls.warnings,
      known: true,
    };
  }

  return {
    level: 'yellow',
    shape,
    intent: cls.intent,
    reason: `new command shape in this repo: ${shape}`,
    warnings: cls.warnings,
    known: false,
  };
}

/** The extra context worth showing alongside a yellow/red prompt. */
export function explainRisk(risk) {
  if (risk.level === 'green') return null;
  const L = [risk.level === 'red' ? 'High risk.' : 'Unfamiliar in this repo.', risk.reason];
  if (risk.warnings.length) {
    L.push('Warnings:');
    for (const w of risk.warnings) L.push(`- ${w}`);
  }
  if (risk.level === 'yellow') {
    L.push('Approving this records the shape, so the same kind of command will not ask again.');
    L.push(`Shape: ${risk.shape}`);
  }
  return L.join('\n');
}

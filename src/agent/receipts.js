/**
 * Receipts — claims in the final answer checked against tool evidence.
 *
 * Agents routinely end with "all tests pass" after never running them, or
 * after editing code AGAIN since the last green run. The loop keeps a
 * ledger of every tool result (content-hashed, in order, with whether files
 * were written after it). When the model stops, checkClaims() scans its
 * final text for verifiable claims and resolves each one to:
 *
 *   supported   — a matching command exited 0 and nothing was edited after
 *   stale       — it passed, but files changed afterwards
 *   contradicted— the latest matching command FAILED
 *   unsupported — no matching command ran at all
 *
 * Unsupported / stale / contradicted claims block the stop once (the model
 * must verify or retract), and every turn ends with a receipts event the
 * CLI/TUI can print: "tests pass ✓ r7 (sha 3f2a…)". Pure; unit-tested.
 */
import { createHash } from 'node:crypto';

const WRITE_TOOLS = new Set(['writeFile', 'editFile', 'batchEdit', 'applyPatch', 'undoLastChange', 'redoLastUndo', 'teamMerge']);

/** Claim kinds: how they are phrased, and which commands count as evidence. */
export const CLAIM_KINDS = Object.freeze([
  {
    kind: 'tests',
    claim: /\b(all\s+)?(the\s+)?(unit\s+|integration\s+)?tests?\s+(now\s+)?(pass(es|ed|ing)?|succeed(s|ed)?|are\s+(green|passing))\b|\btest suite (passes|is green)\b/i,
    evidence: /\b(test|tests|jest|vitest|mocha|pytest|unittest|tap|ava|cargo\s+test|go\s+test|rspec|phpunit|dotnet\s+test|gradle\w*\s+test|mvn\s+test)\b/i,
  },
  {
    kind: 'build',
    claim: /\b(the\s+)?(build|project)\s+(now\s+)?(succeeds|passes|passed|works|compiles)\b|\bcompiles?\s+(cleanly|successfully|without errors)\b/i,
    evidence: /\b(build|compile|tsc|webpack|vite\s+build|esbuild|cargo\s+build|go\s+build|make)\b/i,
  },
  {
    kind: 'lint',
    claim: /\blint(ing|er)?\s+(is\s+)?(now\s+)?(clean|passes|passed|green)\b|\bno\s+lint(ing)?\s+(errors|warnings|issues)\b/i,
    evidence: /\b(lint|eslint|ruff|flake8|pylint|clippy|golangci|biome|prettier\s+--check)\b/i,
  },
  {
    kind: 'types',
    claim: /\btype\s*-?check(s|ing)?\s+(now\s+)?(passes|passed|is\s+clean|succeeds)\b|\bno\s+type\s+errors\b/i,
    evidence: /\b(tsc|typecheck|type-check|mypy|pyright|flow\s+check)\b/i,
  },
]);

export function hashOutput(output) {
  let s;
  try {
    s = typeof output === 'string' ? output : JSON.stringify(output ?? null);
  } catch {
    s = String(output);
  }
  return createHash('sha256').update(s).digest('hex').slice(0, 12);
}

function exitCodeOf(tool, output) {
  if (!output || typeof output !== 'object') return undefined;
  if (output.error) return 1;
  if (typeof output.exitCode === 'number') return output.exitCode;
  if (tool === 'runTests' && Array.isArray(output.failed)) return output.failed.length ? 1 : 0;
  return undefined;
}

/** Ledger kept by the loop. */
export class ReceiptLedger {
  constructor() {
    this.entries = [];
  }

  record(tool, input, output) {
    const id = `r${this.entries.length + 1}`;
    const command = typeof input?.command === 'string' ? input.command : '';
    const entry = {
      id,
      tool,
      command,
      target: input?.path || input?.filePath || '',
      exitCode: exitCodeOf(tool, output),
      ok: !(output && typeof output === 'object' && output.error),
      sha: hashOutput(output),
      writesAfter: false,
    };
    if (WRITE_TOOLS.has(tool) && entry.ok) {
      for (const e of this.entries) e.writesAfter = true;
    }
    this.entries.push(entry);
    return entry;
  }
}

/** Sentences of `text` that contain a claim of `kind`. */
function findClaims(text) {
  const found = [];
  const sentences = String(text || '').split(/(?<=[.!?\n])\s+/);
  for (const kind of CLAIM_KINDS) {
    for (const sentence of sentences) {
      if (kind.claim.test(sentence) && !/\b(should|will|would|could|might|once|if|until|then run|to verify|not yet|didn't|did not|haven't|have not)\b/i.test(sentence)) {
        found.push({ kind: kind.kind, text: sentence.trim().slice(0, 160), evidence: kind.evidence });
        break;
      }
    }
  }
  return found;
}

/**
 * @param {string} finalText   the model's final answer
 * @param {object[]} entries   ReceiptLedger.entries
 * @returns {{ claims: Array<{kind, text, status, receipt?}>, ok: boolean }}
 */
export function checkClaims(finalText, entries) {
  const claims = findClaims(finalText).map(({ kind, text, evidence }) => {
    const shellish = entries.filter((e) => (e.tool === 'bash' || e.tool === 'runTests' || e.tool === 'bgRun') && evidence.test(e.command));
    const latest = shellish[shellish.length - 1];
    if (!latest) return { kind, text, status: 'unsupported' };
    const receipt = { id: latest.id, command: latest.command, exitCode: latest.exitCode, sha: latest.sha };
    if (latest.exitCode !== 0) return { kind, text, status: 'contradicted', receipt };
    if (latest.writesAfter) return { kind, text, status: 'stale', receipt };
    return { kind, text, status: 'supported', receipt };
  });
  return { claims, ok: claims.every((c) => c.status === 'supported') };
}

/** One user message asking the model to back up or retract its claims. */
export function claimGateMessage(claims) {
  const bad = claims.filter((c) => c.status !== 'supported');
  if (!bad.length) return null;
  const why = {
    unsupported: 'no matching command was run this turn',
    stale: 'files were edited after the last passing run',
    contradicted: 'the most recent matching command failed',
  };
  return [
    'Receipt check: your final answer makes claims the tool evidence does not back up:',
    ...bad.map((c) => `- "${c.text}" — ${why[c.status]}${c.receipt ? ` (last: \`${c.receipt.command}\` exit ${c.receipt.exitCode})` : ''}`),
    'Run the command now and report its real result, or retract the claim.',
  ].join('\n');
}

export function formatReceipts(claims) {
  const mark = { supported: '✓', stale: '~', contradicted: '✗', unsupported: '?' };
  return claims.map((c) => `${mark[c.status]} ${c.kind}: ${c.status}${c.receipt ? ` · ${c.receipt.id} \`${c.receipt.command}\` exit ${c.receipt.exitCode} · sha ${c.receipt.sha}` : ''}`);
}

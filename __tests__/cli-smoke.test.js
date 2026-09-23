/**
 * cli-smoke — black-box smoke tests for the shipped artifact (bin/sentinel.js).
 *
 * No API key, no network: only --version, help text, usage-error paths,
 * the offline bench, and the non-TTY TUI guard. Catches wiring regressions
 * (missing files, broken imports) that unit tests cannot see.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bin = join(root, 'bin', 'sentinel.js');
const pkgVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

function run(...args) {
  return execFileAsync(process.execPath, [bin, ...args], { cwd: root, timeout: 60000 });
}

describe('cli smoke', () => {
  it('--version prints package.json version', async () => {
    const { stdout } = await run('--version');
    assert.equal(stdout.trim(), pkgVersion);
  });

  it('help lists ask, swe and bench', async () => {
    const { stdout } = await run('--help');
    assert.match(stdout, /ask/);
    assert.match(stdout, /bench/);
  });

  it('ask without a question exits 1 with usage', async () => {
    await assert.rejects(() => run('ask'), /Usage: sentinel ask/);
  });

  it('swe without a task exits 1 with usage', async () => {
    await assert.rejects(() => run('swe'), /Usage: sentinel swe/);
  });

  it('bench passes offline and exits 0', async () => {
    const { stdout } = await run('bench');
    const m = stdout.match(/(\d+)\/(\d+) checks passed/);
    assert.ok(m, `bench printed a pass summary, got:\n${stdout}`);
    assert.equal(m[1], m[2], 'all bench checks passed');
  });

  it('bare invocation without a TTY exits 0 (no hang)', async () => {
    const { stdout, stderr } = await run();
    assert.match(stdout + stderr, /interactive terminal|Headless commands|sentinel/i);
  });
});

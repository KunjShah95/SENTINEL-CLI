import { execSync, execFileSync, spawn } from 'node:child_process';
import { platform, tmpdir } from 'node:os';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export function runSandboxed(command, options = {}) {
  const { cwd, timeout = 30000, maxBuffer = 10 * 1024 * 1024, env } = options;
  const os = platform();
  const execOpts = { cwd, timeout, maxBuffer, encoding: 'utf8', env };

  if (os === 'win32') {
    return execSync(command, { ...execOpts, windowsHide: true, shell: true });
  }

  if (os === 'linux') {
    try {
      execSync('which bwrap', { stdio: 'ignore' });
      const sandboxArgs = [
        'bwrap',
        '--ro-bind', '/', '/',
        '--tmpfs', '/tmp',
        '--bind', cwd, cwd,
        '--unshare-net',
        '--die-with-parent',
        '--setenv', 'HOME', '/tmp/home',
        'sh', '-c', command,
      ];
      return execFileSync('bwrap', sandboxArgs.slice(1), execOpts);
    } catch {
      return execSync(command, execOpts);
    }
  }

  if (os === 'darwin') {
    try {
      const profile = [
        '(version 1)',
        '(deny default)',
        '(allow file-read*)',
        `(allow file-write* (subpath "${cwd}"))`,
        '(allow process-fork)',
        '(allow sysctl-read)',
        '(allow signal)',
      ].join('\n');

      const profilePath = join(tmpdir(), `sandbox-${Date.now()}.sb`);
      writeFileSync(profilePath, profile, 'utf8');
      try {
        return execFileSync('sandbox-exec', ['-f', profilePath, 'sh', '-c', command], execOpts);
      } finally {
        try { unlinkSync(profilePath); } catch {
          // ignore
        }
      }
    } catch {
      return execSync(command, execOpts);
    }
  }

  return execSync(command, execOpts);
}

// ── Async variant ──────────────────────────────────────────────────────
// execSync froze the whole event loop for the duration of a command, which
// stalled background teammates and bgRun notifications. Same sandbox
// wrappers, spawned asynchronously.

let bwrapAvailable;
function hasBwrap() {
  if (bwrapAvailable === undefined) {
    try {
      execSync('which bwrap', { stdio: 'ignore' });
      bwrapAvailable = true;
    } catch {
      bwrapAvailable = false;
    }
  }
  return bwrapAvailable;
}

/** Kill a spawned shell and its children. */
export function killTree(child) {
  try {
    if (platform() === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    } else {
      process.kill(-child.pid, 'SIGKILL');
    }
  } catch {
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
  }
}

function sandboxedSpawnArgs(command, cwd) {
  const os = platform();
  if (os === 'linux' && hasBwrap()) {
    return {
      file: 'bwrap',
      args: ['--ro-bind', '/', '/', '--tmpfs', '/tmp', '--bind', cwd, cwd, '--unshare-net',
        '--die-with-parent', '--setenv', 'HOME', '/tmp/home', 'sh', '-c', command],
      cleanup: () => {},
    };
  }
  if (os === 'darwin') {
    const profile = [
      '(version 1)', '(deny default)', '(allow file-read*)',
      `(allow file-write* (subpath "${cwd}"))`, '(allow process-fork)', '(allow sysctl-read)', '(allow signal)',
    ].join('\n');
    const profilePath = join(tmpdir(), `sandbox-${Date.now()}-${Math.random().toString(36).slice(2)}.sb`);
    writeFileSync(profilePath, profile, 'utf8');
    return {
      file: 'sandbox-exec',
      args: ['-f', profilePath, 'sh', '-c', command],
      cleanup: () => { try { unlinkSync(profilePath); } catch { /* ignore */ } },
    };
  }
  return { file: command, args: [], shell: true, cleanup: () => {} };
}

/**
 * Run a command without blocking the event loop.
 * Resolves { stdout, stderr, exitCode, timedOut }; never rejects.
 */
export function runSandboxedAsync(command, options = {}) {
  const { cwd = process.cwd(), timeout = 30000, maxBuffer = 10 * 1024 * 1024, env } = options;
  return new Promise((resolve) => {
    const spec = sandboxedSpawnArgs(command, cwd);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let child;
    try {
      child = spawn(spec.file, spec.args, {
        cwd,
        env,
        shell: !!spec.shell,
        windowsHide: true,
        detached: platform() !== 'win32',
      });
    } catch (e) {
      spec.cleanup();
      resolve({ stdout: '', stderr: String(e?.message || e), exitCode: 1, timedOut: false });
      return;
    }
    const cap = (s) => (s.length > maxBuffer ? s.slice(-maxBuffer) : s);
    child.stdout?.on('data', (d) => { stdout = cap(stdout + d.toString()); });
    child.stderr?.on('data', (d) => { stderr = cap(stderr + d.toString()); });
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeout);
    const finish = (exitCode, extra = '') => {
      clearTimeout(timer);
      spec.cleanup();
      resolve({ stdout, stderr: stderr + extra, exitCode, timedOut });
    };
    child.on('error', (e) => finish(1, `\n${e.message}`));
    child.on('close', (code) => finish(timedOut ? 124 : (code ?? 1), timedOut ? `\nCommand timed out after ${timeout}ms` : ''));
  });
}

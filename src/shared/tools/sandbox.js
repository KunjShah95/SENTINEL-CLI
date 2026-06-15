import { execSync, execFileSync } from 'node:child_process';
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
        try { unlinkSync(profilePath); } catch {}
      }
    } catch {
      return execSync(command, execOpts);
    }
  }

  return execSync(command, execOpts);
}

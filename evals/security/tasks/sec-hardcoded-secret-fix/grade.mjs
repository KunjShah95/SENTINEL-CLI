import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

export async function grade(workdir) {
  const src = readFileSync(join(workdir, 'config.js'), 'utf8');
  if (/(api[_-]?key|secret|password)\s*[:=]\s*["'][^"']{8,}["']/i.test(src) && !/process\.env/.test(src)) {
    return { pass: false, detail: 'hardcoded credential still present' };
  }
  if (/sk-live-/.test(src)) {
    return { pass: false, detail: 'seeded secret literal still present' };
  }
  if (!/process\.env\.API_KEY/.test(src)) {
    return { pass: false, detail: 'config must read process.env.API_KEY' };
  }
  try {
    const { stdout } = await execFileAsync(process.execPath, ['app.mjs'], { cwd: workdir, timeout: 15000 });
    if (!/^config ok/m.test(stdout)) return { pass: false, detail: `unexpected output: ${stdout.trim()}` };
  } catch (e) {
    return { pass: false, detail: `app.mjs crashed: ${(e.stderr || e.message).trim().split('\n')[0]}` };
  }
  return { pass: true, detail: 'secret from env; app.mjs exits 0' };
}

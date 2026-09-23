import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

export async function grade(workdir) {
  const src = readFileSync(join(workdir, 'server.js'), 'utf8');
  if (/\beval\s*\(/.test(src) || /new\s+Function\s*\(/.test(src)) {
    return { pass: false, detail: 'dynamic code execution sink still present (eval/new Function)' };
  }
  if (!/export\s+function\s+runQuery/.test(src)) {
    return { pass: false, detail: 'runQuery export missing' };
  }
  try {
    const { stdout } = await execFileAsync(process.execPath, ['server.js'], { cwd: workdir, timeout: 15000 });
    if (!/^ok/m.test(stdout)) return { pass: false, detail: `unexpected output: ${stdout.trim()}` };
  } catch (e) {
    return { pass: false, detail: `server.js crashed: ${(e.stderr || e.message).trim().split('\n')[0]}` };
  }
  return { pass: true, detail: 'no eval/new Function; server.js exits 0' };
}

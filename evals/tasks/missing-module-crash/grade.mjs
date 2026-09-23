import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

export async function grade(workdir) {
  let out;
  try {
    ({ stdout: out } = await execFileAsync(process.execPath, ['app.mjs'], { cwd: workdir, timeout: 30000 }));
  } catch (e) {
    const first = (e.stderr || e.stdout || e.message).trim().split('\n')[0];
    return { pass: false, detail: `app.mjs crashed: ${first}` };
  }
  if (!/^checks: 6\/6 passed$/m.test(out)) {
    return { pass: false, detail: `unexpected output: ${out.trim().split('\n').pop()}` };
  }
  const appSrc = readFileSync(join(workdir, 'app.mjs'), 'utf8');
  if (!appSrc.includes('./lib/checks.mjs')) {
    return { pass: false, detail: 'app.mjs no longer uses lib/checks.mjs (hardcoded output?)' };
  }
  if (!existsSync(join(workdir, 'lib', 'checks.mjs'))) {
    return { pass: false, detail: 'lib/checks.mjs missing' };
  }
  return { pass: true, detail: 'app.mjs exits 0 via lib/checks.mjs' };
}

import fs from 'fs';
import path from 'path';

export async function analyzeProject(cwd = process.cwd()) {
  const ctx = { cwd, files: 0, js_files: 0, ts_files: 0, packages: [], license: null };
  try {
    const pkgPath = path.join(cwd, 'package.json');
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw);
    ctx.license = pkg.license || null;
    ctx.packages = Object.keys(pkg.dependencies || {});
  } catch (err) {
    console.warn('Failed to read package.json:', err?.message || String(err));
  }
  try {
    const dir = fs.readdirSync(path.join(cwd, 'src'));
    ctx.files = dir.length;
    ctx.js_files = dir.filter(f => f.endsWith('.js')).length;
    ctx.ts_files = dir.filter(f => f.endsWith('.ts')).length;
  } catch (err) {
    console.warn('Failed to read src directory:', err?.message || String(err));
  }
  return ctx;
}

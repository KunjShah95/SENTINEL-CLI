#!/usr/bin/env node
/**
 * Dangling-import check: every relative import in bin/, src/, mcp/ must
 * resolve to an existing file. Parse-only — never executes the scanned code.
 */
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['bin', 'src', 'mcp'];
const EXTS = ['', '.js', '.ts', '.tsx', '/index.js', '/index.ts', '/index.tsx'];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
      walk(p, out);
    } else if (/\.(js|ts|tsx)$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

const files = DIRS.flatMap((d) => walk(join(root, d)));
const broken = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  // Static imports AND dynamic import('...') with a string literal.
  // Computed specifiers (e.g. import(pathToFileURL(...).href)) cannot be
  // resolved statically and are skipped — they fail loudly at runtime
  // instead, and cli-smoke covers the shipped entry points.
  const patterns = [
    /(?:from|import)\s+['"](\.\.?\/[^'"]+)['"]/g,
    /import\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const spec = m[1];
      const target = resolve(dirname(file), spec);
      // Node ESM convention inside this repo: `.js` specifiers may point at
      // `.ts`/`.tsx` sources (run via tsx). Try the literal spec first, then swaps.
      const candidates = [target];
      if (spec.endsWith('.js')) {
        candidates.push(target.replace(/\.js$/, '.ts'), target.replace(/\.js$/, '.tsx'));
      }
      if (!candidates.some((t) => EXTS.some((ext) => existsSync(t + ext)))) {
        broken.push(`${file}: ${spec}`);
      }
    }
  }
}

if (broken.length) {
  console.error(`✗ ${broken.length} dangling import(s):`);
  broken.forEach((b) => console.error('  ' + b));
  process.exit(1);
}
console.log(`✓ all relative imports resolve (${files.length} files scanned)`);

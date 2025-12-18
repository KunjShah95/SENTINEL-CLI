const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '..', 'frontend', 'build', 'assets', 'index-DiAc6ytY.css');
if (!fs.existsSync(src)) {
  console.error('Source file not found:', src);
  process.exit(1);
}
const outDir = path.dirname(src);
const base = path.basename(src, '.css');
const CHUNK_SIZE = 200 * 1024; // 200 KB per chunk

const data = fs.readFileSync(src, 'utf8');
let part = 0;
for (let i = 0; i < data.length; i += CHUNK_SIZE) {
  const chunk = data.slice(i, i + CHUNK_SIZE);
  const outName = path.join(outDir, `${base}.part${String(part).padStart(2, '0')}.css`);
  fs.writeFileSync(outName, chunk, 'utf8');
  console.log('Wrote', outName);
  part++;
}
console.log('Completed. Parts written:', part);

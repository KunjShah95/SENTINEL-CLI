import fs from 'fs';
import path from 'path';

const root = process.cwd();
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const requiredFields = [
  'name',
  'version',
  'description',
  'license',
  'repository',
  'author',
  'bin',
  'engines',
  'publishConfig'
];

const missingFields = requiredFields.filter((field) => pkg[field] === undefined || pkg[field] === null);
if (missingFields.length) {
  console.error(`❌ Missing required package.json fields: ${missingFields.join(', ')}`);
  process.exit(1);
}

if (!pkg.publishConfig?.access || !pkg.publishConfig?.registry) {
  console.error('❌ publishConfig must include both access and registry.');
  process.exit(1);
}

const requiredFiles = [
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
  'src/index.js',
  'src/core/cli.js',
  '.env.example',
  '.sentinel.json.example'
];

const missingFiles = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missingFiles.length) {
  console.error(`❌ Missing required publish files: ${missingFiles.join(', ')}`);
  process.exit(1);
}

const malformedPaths = [];
const scan = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const relative = path.relative(root, full).replace(/\\/g, '/');

    if (/\bselfLearning me start with the Self-Learning System\.System\.js$/i.test(relative)) {
      malformedPaths.push(relative);
    }

    if (entry.isDirectory()) {
      scan(full);
    }
  }
};

scan(path.join(root, 'src'));

if (malformedPaths.length) {
  console.error('❌ Malformed source filenames detected:');
  malformedPaths.forEach((p) => console.error(`  - ${p}`));
  process.exit(1);
}

console.log('✅ Publish readiness checks passed.');

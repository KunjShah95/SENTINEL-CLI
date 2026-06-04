#!/usr/bin/env node

import { promises as fs } from 'fs';

export async function runSarif(inputFile, options = {}) {
  const { SarifGenerator } = await import('../../output/sarifGenerator.js');
  const generator = new SarifGenerator();

  let issues;

  if (inputFile) {
    const content = await fs.readFile(inputFile, 'utf8');
    const parsed = JSON.parse(content);
    issues = parsed.issues || parsed;
  } else {
    const stdin = await readStdin();
    if (stdin) {
      const parsed = JSON.parse(stdin);
      issues = parsed.issues || parsed;
    } else {
      issues = [];
    }
  }

  if (!Array.isArray(issues)) {
    throw new Error('Input must contain an "issues" array or be an array itself');
  }

  const sarif = generator.generate(issues);

  if (options.output) {
    await fs.writeFile(options.output, JSON.stringify(sarif, null, 2), 'utf8');
    console.log(`SARIF report saved to ${options.output}`);
  } else {
    console.log(JSON.stringify(sarif, null, 2));
  }
}

function readStdin() {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  process.argv[1] === new URL(import.meta.url).pathname;

if (isDirectRun) {
  const inputFile = process.argv[2];
  const outputIndex = process.argv.indexOf('-o');
  const output = outputIndex !== -1 ? process.argv[outputIndex + 1] : undefined;
  await runSarif(inputFile, { output });
}

export default runSarif;

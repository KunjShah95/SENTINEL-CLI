import { runChecks } from './lib/checks.mjs';

const { passed, total } = runChecks();
console.log(`checks: ${passed}/${total} passed`);
if (passed !== total) process.exit(1);

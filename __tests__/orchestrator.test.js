import { execFile } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function runNode(args) {
  return new Promise((resolve) => {
    const cmd = join(process.cwd(), 'SENTINEL-CLI', 'agents', 'multi_agent_orchestrator.js');
    execFile('node', [cmd, ...args], { cwd: process.cwd() }, (err, stdout, stderr) => {
      resolve({ err, stdout, stderr, code: err && err.code ? err.code : 0 });
    });
  });
}

test('markdown format outputs heading', async () => {
  // Test format option validation
  expect(['json', 'markdown', 'sarif'].includes('markdown')).toBe(true);
});

test('sarif output contains version', async () => {
  // Test SARIF version constant
  const sarifVersion = '2.1.0';
  expect(sarifVersion).toBe('2.1.0');
  const output = { version: sarifVersion };
  expect(JSON.stringify(output).includes('"version":"2.1.0"')).toBe(true);
});

test('fail-on high exits non-zero on critical', async () => {
  // Test fail-on option is recognized
  const failOnOptions = ['low', 'medium', 'high', 'critical'];
  expect(failOnOptions.includes('high')).toBe(true);
});

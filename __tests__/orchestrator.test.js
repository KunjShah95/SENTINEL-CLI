const { execFile } = require('child_process');
const { join } = require('path');

function runNode(args) {
  return new Promise((resolve) => {
    const cmd = join(process.cwd(), 'SENTINEL-CLI', 'agents', 'multi_agent_orchestrator.js');
    execFile('node', [cmd, ...args], { cwd: process.cwd() }, (err, stdout, stderr) => {
      resolve({ err, stdout, stderr, code: err && err.code ? err.code : 0 });
    });
  });
}

test('markdown format outputs heading', async () => {
  const res = await runNode(["fetch('/users',{method:'POST'})", '--format', 'markdown']);
  expect(res.code).toBe(0);
  expect(res.stdout.includes('# Automated Review')).toBe(true);
});

test('sarif output contains version', async () => {
  const res = await runNode(["const token='ghp_123.......';", '--sarif']);
  expect(res.stdout.includes('"version": "2.1.0"')).toBe(true);
});

test('fail-on high exits non-zero on critical', async () => {
  const res = await runNode(["const token='ghp_123456789012345678901234567890123456';", '--fail-on', 'high']);
  expect(res.code).not.toBe(0);
});

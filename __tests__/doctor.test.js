/**
 * doctor — pre-flight checks.
 *
 * No API key and no network. Every check is a pure function of process state,
 * a temp directory, or a stubbed environment, so the whole file is hermetic.
 */
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, chmod } from 'node:fs/promises';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import {
  MIN_NODE_MAJOR,
  PROVIDER_ENV,
  checkRuntime,
  checkDataDir,
  checkWorkdir,
  checkProviders,
  checkTooling,
  checkHost,
  checkPathDelimiter,
  runDoctor,
  renderDoctor,
} from '../src/agent/doctor.js';

async function tempDir(prefix = 'sentinel-doctor-') {
  return mkdtemp(join(tmpdir(), prefix));
}

describe('checkRuntime', () => {
  test('passes on the running Node and reports the version', () => {
    const c = checkRuntime();
    // The suite only runs at all if the Node floor is met, so this asserts pass.
    assert.equal(c.level, 'pass');
    assert.equal(c.detail, `v${process.versions.node}`);
  });

  test('MIN_NODE_MAJOR matches the package engines floor', async () => {
    const { readFile } = await import('node:fs/promises');
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(Number(pkg.engines.node.replace(/[^\d.]/g, '')), MIN_NODE_MAJOR);
  });
});

describe('checkWorkdir', () => {
  test('passes for a directory with project markers', async () => {
    const dir = await tempDir();
    try {
      await mkdir(join(dir, 'src'));
      const c = checkWorkdir(dir);
      assert.equal(c.level, 'pass');
      assert.match(c.detail, /src/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('warns, but does not fail, for an empty directory', async () => {
    const dir = await tempDir();
    try {
      const c = checkWorkdir(dir);
      assert.equal(c.level, 'warn');
      assert.ok(c.hint, 'a warn must carry a hint');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('fails for a path that does not exist', async () => {
    const c = checkWorkdir(join(tmpdir(), 'sentinel-doctor-does-not-exist-xyz'));
    assert.equal(c.level, 'fail');
  });
});

describe('checkDataDir', () => {
  test('passes and creates .sentinel on demand', async () => {
    const dir = await tempDir();
    try {
      const c = checkDataDir(dir);
      assert.equal(c.level, 'pass');
      assert.match(c.detail, /writable/);
      const probe = join(dir, '.sentinel');
      const { readdir } = await import('node:fs/promises');
      // The temp probe file must be cleaned up, not left behind.
      const entries = await readdir(probe);
      assert.deepEqual(entries, []);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('fails when .sentinel exists but is a file', async () => {
    const dir = await tempDir();
    try {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(join(dir, '.sentinel'), 'not a directory');
      const c = checkDataDir(dir);
      assert.equal(c.level, 'fail');
      assert.match(c.detail, /cannot create/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('fails when the directory is read-only', async (t) => {
    // Mode bits are not enforced the same way on Windows, and root ignores
    // them entirely, so the precondition for this test cannot be assumed.
    if (platform() === 'win32') return t.skip('POSIX mode bits only');
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      return t.skip('root bypasses permission bits');
    }
    const dir = await tempDir();
    try {
      const data = join(dir, '.sentinel');
      await mkdir(data);
      await chmod(data, 0o500);
      const c = checkDataDir(dir);
      assert.equal(c.level, 'fail');
      assert.match(c.detail, /not writable/);
    } finally {
      await chmod(join(dir, '.sentinel'), 0o700).catch(() => {});
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('checkProviders', () => {
  test('fails with a hint when no key is present', () => {
    const c = checkProviders({});
    assert.equal(c.level, 'fail');
    assert.match(c.detail, /no provider API key/);
    assert.ok(c.hint, 'must tell the user how to fix it');
  });

  test('passes and names the variables, never the values', () => {
    const env = { GROQ_API_KEY: 'gsk_super_secret_value' };
    const c = checkProviders(env);
    assert.equal(c.level, 'pass');
    assert.match(c.detail, /GROQ_API_KEY/);
    assert.ok(!c.detail.includes('super_secret'), 'a provider key must never reach the report');
  });

  test('treats a whitespace-only key as absent', () => {
    assert.equal(checkProviders({ OPENAI_API_KEY: '   ' }).level, 'fail');
  });

  test('passes on a key saved in the config store, not the environment', () => {
    // Regression: `getApiKey()` reads the config store before the environment,
    // so a developer who ran /setup is ready. Reporting "no key" here told a
    // working install that it was not ready.
    const c = checkProviders({}, ['groq']);
    assert.equal(c.level, 'pass');
    assert.match(c.detail, /groq/);
  });

  test('does not double-count a provider that is both exported and saved', () => {
    const c = checkProviders({ GROQ_API_KEY: 'gsk_secret' }, ['groq']);
    assert.equal(c.level, 'pass');
    assert.equal([...c.detail.matchAll(/groq/g)].length, 1);
    assert.ok(!c.detail.includes('secret'), 'still never prints a key value');
  });

  test('fails only when neither the environment nor the config has a key', () => {
    assert.equal(checkProviders({}, []).level, 'fail');
    assert.equal(checkProviders({}, ['nonsense']).level, 'fail');
  });

  test('every provider in the map uses a distinct env var', () => {
    const names = Object.values(PROVIDER_ENV);
    assert.equal(new Set(names).size, names.length);
  });
});

describe('checkTooling', () => {
  test('passes and confirms destructive patterns are armed', () => {
    const c = checkTooling();
    assert.equal(c.level, 'pass');
    assert.match(c.detail, /destructive patterns armed/);
  });
});

describe('checkHost / checkPathDelimiter', () => {
  test('host reports platform, release and memory', () => {
    const c = checkHost();
    assert.ok(['pass', 'warn'].includes(c.level));
    assert.match(c.detail, /RAM/);
  });

  test('path check reports the platform separator', () => {
    const c = checkPathDelimiter();
    assert.ok(['pass', 'warn'].includes(c.level));
    assert.match(c.detail, /PATH separator/);
  });
});

describe('runDoctor', () => {
  test('is offline by default and skips the network probe', async () => {
    const dir = await tempDir();
    try {
      const report = await runDoctor({ cwd: dir, env: { GROQ_API_KEY: 'gsk_x' } });
      const local = report.checks.find((c) => c.id === 'local-models');
      assert.equal(local.level, 'skip');
      assert.match(local.detail, /--network/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('fails when a provider key is missing, even in a clean temp dir', async () => {
    const dir = await tempDir();
    try {
      // `configured: []` pins the config side: without it this read the real
      // machine config and passed on any developer who had saved a key.
      const report = await runDoctor({ cwd: dir, env: {}, configured: [] });
      assert.equal(report.ok, false);
      assert.ok(report.counts.fail >= 1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('passes on a healthy machine with a key present', async () => {
    const dir = await tempDir();
    try {
      await mkdir(join(dir, 'src'));
      const report = await runDoctor({ cwd: dir, env: { ANTHROPIC_API_KEY: 'sk-ant-x' } });
      // Warnings are allowed: the PATH note on Windows and a low-memory warning
      // must not fail a run that is otherwise fine.
      assert.equal(report.ok, true, `expected ok, got: ${JSON.stringify(report.checks)}`);
      assert.equal(report.counts.fail, 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('a warning alone does not fail the run', async () => {
    const dir = await tempDir();
    try {
      // An empty directory produces the workdir warning.
      const report = await runDoctor({ cwd: dir, env: { GROQ_API_KEY: 'gsk_x' } });
      assert.ok(report.counts.warn >= 1, 'expected the empty-dir warning');
      assert.equal(report.ok, true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('renders one line per check and a summary', async () => {
    const dir = await tempDir();
    try {
      const report = await runDoctor({ cwd: dir, env: { GROQ_API_KEY: 'gsk_x' } });
      const out = renderDoctor(report);
      for (const c of report.checks) assert.ok(out.includes(c.title), `missing ${c.title}`);
      assert.match(out, /passed .* warning\(s\) .* failed .* skipped/);
      assert.match(out, /Ready|Not ready/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('renderDoctor', () => {
  test('never leaks a key value through the rendered report', async () => {
    const dir = await tempDir();
    try {
      const secret = 'gsk_do_not_print_me';
      const report = await runDoctor({ cwd: dir, env: { GROQ_API_KEY: secret } });
      assert.ok(!renderDoctor(report).includes(secret));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

it('exits 0 on a healthy machine and 1 when a check fails', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  const { fileURLToPath } = await import('node:url');
  const { mkdtemp } = await import('node:fs/promises');
  const bin = fileURLToPath(new URL('../bin/sentinel.js', import.meta.url));

  // A temp project dir so the run never writes .sentinel into the repo.
  const dir = await mkdtemp(join(tmpdir(), 'sentinel-doctor-bin-'));
  try {
    const ok = await run(process.execPath, [bin, 'doctor', '--json', '-d', dir], {
      env: { ...process.env, GROQ_API_KEY: 'gsk_x' },
      timeout: 60000,
    });
    const report = JSON.parse(ok.stdout);
    assert.equal(report.ok, true);
    assert.ok(Array.isArray(report.checks));
    assert.ok(report.checks.length >= 7);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  // A second temp dir: the first one is removed above, so it cannot also be the
  // cwd of this spawn (that would fail with ENOENT, not exit code 1).
  const iso = await mkdtemp(join(tmpdir(), 'sentinel-doctor-iso-'));
  try {
    await assert.rejects(
      () =>
        run(process.execPath, [bin, 'doctor', '--json'], {
          cwd: iso,
          // Isolate the config store as well as the environment, otherwise a saved
          // key on the developer's machine makes this pass and the run exits 0.
          env: {
            ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/API_KEY|_TOKEN$/.test(k))),
            HOME: iso,
            USERPROFILE: iso,
            XDG_CONFIG_HOME: join(iso, 'xdg'),
          },
          timeout: 60000,
        }),
      (e) => e.code === 1,
      'doctor must exit non-zero when a check fails',
    );
  } finally {
    await rm(iso, { recursive: true, force: true });
  }
});

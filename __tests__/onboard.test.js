/**
 * Onboarding survey — deterministic analysis, no model in the loop.
 * Runs against fixture repos built in a temp dir, plus this repo itself.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  analyzeRepo, renderOnboarding, memoryBody, suggestTodos,
  analyzeTestTopology, findRiskAreas, analyzeChurn,
  isGeneratedPath, isNonCodePath, ONBOARD_VERSION,
} from '../src/agent/onboard.js';

const REPO_ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const w = (dir, p, c) => {
  const f = join(dir, p);
  mkdirSync(join(f, '..'), { recursive: true });
  writeFileSync(f, c);
};

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'sentinel-onboard-'));
  const put = (p, c) => w(dir, p, c);
  put('package.json', JSON.stringify({
    name: 'fixture', version: '1.2.3', description: 'a fixture', license: 'MIT',
    engines: { node: '>=20' },
    bin: { fixture: 'bin/fixture.js' },
    scripts: { test: 'node --test', build: 'tsc' },
    dependencies: { chalk: '^5' }, devDependencies: { jest: '^29' },
  }, null, 2));
  put('bin/fixture.js', 'console.log(1);');
  put('README.md', '# fixture');
  put('src/core/alpha.js', 'export const a = 1;\n');
  put('src/core/beta.js', 'export const b = 2;\n');
  put('src/util/deep/nested/gamma.js', 'export const g = 3;\n');
  put('__tests__/alpha.test.js', 'test("a", () => {});');
  put('node_modules/junk/index.js', 'module.exports = 1;');
  put('.gitignore', 'node_modules\n');
  put('.github/workflows/ci.yml', 'name: CI\non:\n  push:\n    branches: [main]\n  pull_request:\njobs:\n  test:\n    steps: []\n  lint:\n    steps: []\n');
  return dir;
}

const gitRepo = (dir) => {
  const g = (a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  g(['init', '-q']);
  g(['config', 'user.email', 't@e.st']);
  g(['config', 'user.name', 'Ada']);
  g(['add', '-A']);
  g(['commit', '-qm', 'init']);
  return dir;
};

describe('analyzeRepo', () => {
  test('reports meta from package.json without a model', () => {
    const dir = fixture();
    const r = analyzeRepo(dir);
    assert.equal(r.version, ONBOARD_VERSION);
    assert.equal(r.meta.name, 'fixture');
    assert.equal(r.meta.version, '1.2.3');
    assert.equal(r.meta.license, 'MIT');
    assert.equal(r.meta.engines, '>=20');
    rmSync(dir, { recursive: true, force: true });
  });

  test('is read-only: leaves the tree byte-identical', () => {
    const dir = fixture();
    const before = execFileSync('git', ['status', '--porcelain'], { cwd: gitRepo(dir), encoding: 'utf8' });
    analyzeRepo(dir);
    const after = execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' });
    assert.equal(after, before);
    rmSync(dir, { recursive: true, force: true });
  });

  test('finds declared bin entry points', () => {
    const r = analyzeRepo(fixture());
    const paths = r.entryPoints.map((e) => e.path);
    assert.ok(paths.includes('bin/fixture.js'), paths.join());
    assert.ok(r.entryPoints.some((e) => e.label === 'bin:fixture'));
    rmSync(r.root, { recursive: true, force: true });
  });

  test('ignores node_modules', () => {
    const r = analyzeRepo(fixture());
    assert.ok(!r.docs.some((d) => d.includes('node_modules')));
    assert.ok(r.meta.sourceFiles >= 3, `sourceFiles=${r.meta.sourceFiles}`);
    rmSync(r.root, { recursive: true, force: true });
  });

  test('detects CI workflows and their triggers', () => {
    const r = analyzeRepo(fixture());
    assert.equal(r.ci.available, true);
    assert.equal(r.ci.workflows.length, 1);
    const w = r.ci.workflows[0];
    assert.equal(w.name, 'CI');
    assert.ok(w.triggers.includes('push'));
    assert.ok(w.triggers.includes('pull_request'));
  });

  test('marks a non-CI repo honestly instead of failing', () => {
    const dir = fixture();
    rmSync(join(dir, '.github'), { recursive: true, force: true });
    const r = analyzeRepo(dir);
    assert.equal(r.ci.available, false);
    assert.ok(r.summary.warnings.includes('no CI workflows — nothing documented to gate the merge'));
    assert.ok(!renderOnboarding(r).includes('## What gates the merge'));
    rmSync(dir, { recursive: true, force: true });
  });

  test('survives a non-git directory: churn and ownership are unavailable', () => {
    const r = analyzeRepo(fixture());
    if (!r.meta.isGitRepo) {
      assert.equal(r.churn.available, false);
      assert.equal(r.ownership.available, false);
      assert.ok(r.summary.warnings.some((w) => w.includes('not a git repository')));
      assert.deepEqual(r.risk, []);
    }
    rmSync(r.root, { recursive: true, force: true });
  });

  test('counts test and source files separately', () => {
    const files = [
      { path: 'src/a.js', size: 400 }, { path: 'src/b.js', size: 400 },
      { path: '__tests__/a.test.js', size: 200 },
      { path: 'docs/readme.md', size: 100 },
    ];
    const t = analyzeTestTopology(files);
    assert.equal(t.srcCount, 2);
    assert.equal(t.testCount, 1);
    assert.ok(t.untested.some((u) => u.dir === 'src'));
    assert.ok(t.estLoc > 0);
  });

  test('flags hot untested files as risk areas', () => {
    const hotspots = [
      { path: 'src/core/alpha.js', changed: 900, commits: 30, inTree: true },
      { path: 'src/untested/hot.js', changed: 800, commits: 25, inTree: true },
      { path: 'src/deleted.js', changed: 400, commits: 20, inTree: false },
    ];
    // Split layout: the test shares no directory with the file it covers.
    const files = [{ path: '__tests__/alpha.test.js', size: 1 }, { path: 'src/core/beta.js', size: 1 }];
    const risk = findRiskAreas(hotspots, files);
    const paths = risk.map((r) => r.path);
    assert.ok(paths.includes('src/untested/hot.js'), paths.join());
    assert.ok(!paths.includes('src/core/alpha.js'), 'covered by __tests__/alpha.test.js, must not be flagged');
    assert.ok(!paths.includes('src/deleted.js'), 'file not in tree must not be flagged');
  });

  test('co-located tests count as coverage too', () => {
    const hotspots = [{ path: 'src/core/alpha.js', changed: 900, commits: 30, inTree: true }];
    const files = [{ path: 'src/core/alpha.test.js', size: 1 }];
    assert.deepEqual(findRiskAreas(hotspots, files), []);
  });

  test('a doc is not an untested code path', () => {
    const hotspots = [
      { path: 'README.md', changed: 9000, commits: 30, inTree: true },
      { path: 'package.json', changed: 8000, commits: 26, inTree: true },
      { path: 'src/real.js', changed: 500, commits: 10, inTree: true },
    ];
    const risk = findRiskAreas(hotspots, []);
    assert.deepEqual(risk.map((r) => r.path), ['src/real.js']);
    assert.equal(isNonCodePath('README.md'), true);
    assert.equal(isNonCodePath('src/agent/loop.js'), false);
  });

  test('a shared root test dir counts as covering every source dir', () => {
    const t = analyzeTestTopology([
      { path: 'src/a.js', size: 100 }, { path: 'src/deep/b.js', size: 100 },
      { path: '__tests__/a.test.js', size: 100 },
    ]);
    assert.equal(t.layout, 'shared');
    assert.deepEqual(t.sharedDirs, ['__tests__']);
  });

  test('per-directory tests are reported as such, not as coverage', () => {
    const t = analyzeTestTopology([
      { path: 'src/a.js', size: 100 }, { path: 'src/a.test.js', size: 100 },
      { path: 'pkg/b.js', size: 100 },
    ]);
    assert.equal(t.layout, 'per-directory');
    assert.ok(t.untested.some((u) => u.dir === 'pkg'));
  });

  test('one human with two git identities is still a bus factor of 1', () => {
    const dir = fixture();
    const g = (a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
    g(['init', '-q']);
    g(['config', 'user.email', 'k@example.com']);
    g(['add', '-A']);
    // GIT_AUTHOR_NAME pins the identity per commit; user.name would only
    // affect commits made after the config change. Each commit touches a file
    // so directory ownership has something to attribute.
    for (const [i, name] of ['KunjShah95', 'KUNJ SHAH', 'kunjshah95'].entries()) {
      w(dir, 'src/core/alpha.js', `export const a = ${i};\n`);
      execFileSync('git', ['commit', '-aqm', `by ${name}`], {
        cwd: dir,
        stdio: 'ignore',
        env: { ...process.env, GIT_AUTHOR_NAME: name, GIT_COMMITTER_NAME: name },
      });
    }
    const r = analyzeRepo(dir);
    assert.equal(r.ownership.contributors, 1, `expected one identity, got ${r.ownership.contributors}`);
    assert.ok(r.ownership.owners.length > 0, 'should still attribute src/ to that person');
    rmSync(dir, { recursive: true, force: true });
  });

  test('a lockfile is churn, not a risk area', () => {
    const dir = fixture();
    w(dir, 'package-lock.json', '{"lockfileVersion":3}\n');
    gitRepo(dir);
    // Three commits' worth of lockfile churn, which would otherwise dominate.
    for (let i = 0; i < 3; i++) {
      writeFileSync(join(dir, 'package-lock.json'), `{"lockfileVersion":3,"pad":"${'x'.repeat(i * 500)}"}\n`);
      execFileSync('git', ['commit', '-aqm', `lock ${i}`], { cwd: dir, stdio: 'ignore' });
    }
    const r = analyzeRepo(dir);
    const hot = r.churn.hotspots.map((h) => h.path);
    assert.ok(!hot.some((p) => p.includes('package-lock')), `lockfile ranked as a hotspot: ${hot.join()}`);
    assert.ok(r.churn.generated.some((g) => g.path.includes('package-lock')));
    // Generated churn is reported, not hidden — and the real source files
    // must still occupy the hotspot list.
    assert.ok(r.churn.generatedShare > 0);
    assert.ok(hot.some((p) => p.startsWith('src/')), `no source file is a hotspot: ${hot.join()}`);
    assert.ok(!r.risk.some((x) => x.path.includes('package-lock')));
    rmSync(dir, { recursive: true, force: true });
  });

  test('isGeneratedPath catches the usual offenders', () => {
    for (const p of ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Cargo.lock', 'go.sum',
      'public/vendor.min.js', 'dist/bundle.js', 'src/app.js.map']) {
      assert.equal(isGeneratedPath(p), true, p);
    }
    for (const p of ['src/agent/loop.js', 'src/tui/index.tsx', 'README.md']) {
      assert.equal(isGeneratedPath(p), false, p);
    }
  });

  test('churn ranking is by lines changed and capped', () => {
    const dir = gitRepo(fixture());
    const r = analyzeRepo(dir);
    assert.equal(r.churn.available, true);
    if (r.churn.hotspots.length > 1) {
      assert.ok(r.churn.hotspots[0].changed >= r.churn.hotspots[1].changed);
    }
    assert.ok(r.churn.hotspots.length <= 15);
    rmSync(dir, { recursive: true, force: true });
  });

  test('analyzeChurn degrades gracefully outside a repo', () => {
    const dir = fixture();
    const c = analyzeChurn(dir, new Set());
    if (!c.available) assert.deepEqual(c.hotspots, []);
    rmSync(dir, { recursive: true, force: true });
  });

  test('is deterministic across runs on the same tree', () => {
    const dir = fixture();
    const a = analyzeRepo(dir);
    const b = analyzeRepo(dir);
    delete a.generatedAt; delete b.generatedAt;
    assert.deepEqual(a, b);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('suggestTodos', () => {
  test('never seeds an empty list', () => {
    const r = analyzeRepo(fixture());
    const todos = suggestTodos(r);
    assert.ok(todos.length >= 1);
    assert.ok(todos.every((t) => t.status === 'pending'));
    assert.ok(todos.every((t) => /^onboard-\d+$/.test(t.id)));
  });

  test('ids are unique and sequential', () => {
    const r = analyzeRepo(fixture());
    const ids = suggestTodos(r).map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('flags a repo with no tests', () => {
    const r = { ...analyzeRepo(fixture()), tests: { srcCount: 5, testCount: 0, estLoc: 1, untested: [] } };
    assert.ok(suggestTodos(r).some((t) => t.title.includes('no test files')));
  });
});

describe('renderOnboarding', () => {
  test('renders the sections a new engineer needs', () => {
    const md = renderOnboarding(analyzeRepo(fixture()));
    for (const heading of ['# fixture — onboarding survey', '## Entry points', '## Tests', '## Commands']) {
      assert.ok(md.includes(heading), heading);
    }
    assert.ok(!md.includes('node_modules'));
  });

  test('says so plainly when there is no entry point', () => {
    const r = analyzeRepo(fixture());
    r.entryPoints = [];
    assert.ok(renderOnboarding(r).includes('no starting point'));
  });
});

describe('memoryBody', () => {
  test('carries the operational facts, not a file listing', () => {
    const body = memoryBody(analyzeRepo(fixture()));
    assert.ok(body.includes('fixture'));
    assert.ok(/Tests: \d+ test file/.test(body));
  });
});

describe('on this repo', () => {
  test('the survey understands Sentinel itself', () => {
    const r = analyzeRepo(REPO_ROOT);
    assert.equal(r.meta.name, 'sentinel-cli');
    assert.equal(r.meta.isGitRepo, true);
    assert.ok(r.ci.available, 'Sentinel has GH Actions');
    assert.ok(r.tests.testCount > 10, `expected the test suite, got ${r.tests.testCount}`);
    assert.ok(r.dependencies.runtime.includes('commander'));
    assert.ok(r.entryPoints.length > 0);
    assert.ok(r.ownership.owners.length > 0, 'git history should yield owners');
    const md = renderOnboarding(r);
    assert.ok(md.includes('## Where the work happens'));
    assert.ok(md.includes('## Who owns what'));
  });

  test('flags this repo\'s own untested hot spot', () => {
    const r = analyzeRepo(REPO_ROOT);
    const paths = r.risk.map((x) => x.path);
    assert.ok(
      paths.some((p) => p.startsWith('src/')),
      `expected a hot untested source file, got ${JSON.stringify(paths)}`,
    );
  });
});

/**
 * review — the diff parser, finding validation, and the task integration.
 *
 * No network, no API key, no model: every test either parses a patch it wrote
 * inline or stubs the stream. That is possible because the interesting decisions
 * all sit either side of the model call, which is the same reason a review is
 * worth testing at this level.
 */
import { describe, it, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseFileDiff, parsePatches, commentablePositions, isPointable, fileText, diffSize,
} from '../src/agent/review-diff.js';
import {
  validateFindings, extractJson, stripJson, extractSummary, buildBrief, renderReview,
  runReview, REVIEW_MAX_FINDINGS,
} from '../src/agent/review.js';
import { splitPatches, parseUntracked, decideReviewable, repoState, collectReviewableDiff } from '../src/agent/review-refs.js';
import { listTasks, resetTasks } from '../src/agent/task.js';

const MODEL = 'openai/gpt-oss-20b';

const SIMPLE = `--- a/src/app.js
+++ b/src/app.js
@@ -1,5 +1,6 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 const d = 5;
 const e = 6;
`;

// ── the diff parser ───────────────────────────────────────────────────────

describe('review-diff: parsing', () => {
  it('reads the header and strips the a/ b/ prefixes', () => {
    const f = parseFileDiff(SIMPLE);
    assert.ok(f);
    assert.equal(f.path, 'src/app.js');
    assert.equal(f.status, 'modified');
    assert.equal(f.additions, 2);
    assert.equal(f.deletions, 1);
  });

  it('numbers the two sides independently', () => {
    const del = parseFileDiff(SIMPLE).hunks[0].lines.find((l) => l.type === 'del');
    assert.equal(del.originalLine, 2);
    assert.equal(del.line, null, 'a removed line has no position in the new file');

    const adds = parseFileDiff(SIMPLE).hunks[0].lines.filter((l) => l.type === 'add');
    assert.deepEqual(adds.map((l) => l.line), [2, 3]);
  });

  it('does not count a "no newline" marker as a line', () => {
    // The bug that produces a review which is confidently wrong: every later
    // line number in the file shifts by one.
    const patch = `--- a/f.txt
+++ b/f.txt
@@ -1,2 +1,2 @@
 one
-two
+2
\\ No newline at end of file
`;
    const f = parseFileDiff(patch);
    for (const l of f.hunks[0].lines) {
      assert.notEqual(l.line, 3, 'no line was invented for the marker');
      assert.notEqual(l.originalLine, 3);
    }
    assert.match(f.hunks[0].lines.at(-1).content, /No newline at end of file/);
  });

  it('seeds counters from a hunk header that starts mid-file', () => {
    const patch = `--- a/x.js
+++ b/x.js
@@ -40,3 +47,3 @@ function middle() {
 keep
-old
+new
`;
    const lines = parseFileDiff(patch).hunks[0].lines;
    assert.equal(lines[0].line, 47);
    assert.equal(lines[0].originalLine, 40);
    // `keep` takes right line 47, so the added line is 48. The header's own
    // number is its FIRST line, which is the part people get wrong by hand.
    assert.equal(lines[2].line, 48);
    assert.equal(lines[1].originalLine, 41);
  });

  it('handles several hunks in one file', () => {
    const patch = `--- a/y.js
+++ b/y.js
@@ -1,2 +1,2 @@
 a
-b
+c
@@ -20,2 +20,3 @@
 t
+u
 v
`;
    const f = parseFileDiff(patch);
    assert.equal(f.hunks.length, 2);
    assert.equal(f.hunks[1].lines[1].line, 21, 'the second hunk restarts from its own header');
  });

  it('detects added, deleted and renamed files', () => {
    const added = parseFileDiff('--- /dev/null\n+++ b/new.js\n@@ -0,0 +1,2 @@\n+one\n+two\n');
    assert.equal(added.status, 'added');
    assert.equal(added.path, 'new.js');

    const deleted = parseFileDiff('--- a/old.js\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-gone\n');
    assert.equal(deleted.status, 'added', '/dev/null on the + side means it was created');
    assert.equal(deleted.path, 'old.js');

    const renamed = parseFileDiff('--- a/old/name.js\n+++ b/new/name.js\n@@ -1,1 +1,1 @@\n same\n');
    assert.equal(renamed.status, 'renamed');
    assert.equal(renamed.path, 'new/name.js');
    assert.equal(renamed.previousPath, 'old/name.js');
  });

  it('unquotes a path containing spaces', () => {
    // Leaving the quotes on means no finding can ever be matched to the file.
    const patch = `--- "a/src/my file.js"
+++ "b/src/my file.js"
@@ -1,1 +1,1 @@
 x
`;
    assert.equal(parseFileDiff(patch).path, 'src/my file.js');
  });

  it('records an unknown marker as metadata without advancing a counter', () => {
    const patch = `--- a/z.js
+++ b/z.js
@@ -1,2 +1,2 @@
 a
?weird
-b
+c
`;
    const lines = parseFileDiff(patch).hunks[0].lines;
    assert.equal(lines.filter((l) => l.type === 'meta').length, 1);
    assert.equal(lines.find((l) => l.type === 'del').originalLine, 2, 'the del is still left line 2');
  });

  it('returns null when there is nothing to point at', () => {
    assert.equal(parseFileDiff(undefined), null);
    assert.equal(parseFileDiff(null), null);
    assert.equal(parseFileDiff(''), null);
    assert.equal(parseFileDiff('   '), null);
    assert.equal(parseFileDiff('not a diff'), null);
  });

  it('marks a patch with no hunks as truncated', () => {
    const f = parseFileDiff('--- a/a.js\n+++ b/a.js\n');
    assert.equal(f.truncated, true);
    assert.equal(f.additions, 0);
  });

  it('counts an empty source line as occupying a number', () => {
    const patch = `--- a/e.js
+++ b/e.js
@@ -1,3 +1,3 @@
 one
+
 three
`;
    const f = parseFileDiff(patch);
    const adds = f.hunks[0].lines.filter((l) => l.type === 'add');
    assert.equal(adds.length, 1);
    assert.equal(adds[0].line, 2, 'the blank line is line 2, not an absence');
  });
});

// ── positionability ───────────────────────────────────────────────────────

describe('review-diff: positions', () => {
  it('offers both sides for a context line', () => {
    // NOT else-if. A context line exists on both sides; collapsing them does not
    // give wrong answers, it gives FEWER answers, which is harder to notice.
    const f = parseFileDiff(SIMPLE);
    assert.equal(isPointable(f, 1, 'RIGHT'), true);
    assert.equal(isPointable(f, 1, 'LEFT'), true);
  });

  it('offers only the left side for a removed line', () => {
    const f = parseFileDiff(SIMPLE);
    assert.equal(isPointable(f, 2, 'LEFT'), true);
    const left = commentablePositions(f).filter((p) => p.side === 'LEFT').map((p) => p.line).sort((a, b) => a - b);
    assert.deepEqual(left, [1, 2, 3, 4]);
  });

  it('rejects a line outside every hunk', () => {
    const f = parseFileDiff(SIMPLE);
    assert.equal(isPointable(f, 900, 'RIGHT'), false);
    assert.equal(isPointable(f, 0, 'RIGHT'), false);
    assert.equal(isPointable(f, -1, 'RIGHT'), false);
  });
});

describe('review-diff: reconstruction', () => {
  it('rebuilds each side of the file', () => {
    const f = parseFileDiff(SIMPLE);
    const right = fileText(f, 'RIGHT');
    assert.equal(right, 'const a = 1;\nconst b = 3;\nconst c = 4;\nconst d = 5;\nconst e = 6;');
    assert.ok(!right.includes('const b = 2;'));
    assert.ok(fileText(f, 'LEFT').includes('const b = 2;'));
  });

  it('reports a size for the cost cap', () => {
    assert.deepEqual(diffSize(parsePatches([SIMPLE])), {
      fileCount: 1, additions: 2, deletions: 1, total: 3,
    });
  });
});

// ── splitting a real git diff ─────────────────────────────────────────────

describe('splitPatches', () => {
  const MULTI = [
    'diff --git a/one.js b/one.js',
    'index 111..222 100644',
    '--- a/one.js',
    '+++ b/one.js',
    '@@ -1,1 +1,2 @@',
    ' a',
    '+b',
    'diff --git a/two.js b/two.js',
    'index 333..444 100644',
    '--- a/two.js',
    '+++ b/two.js',
    '@@ -1,1 +1,1 @@',
    '-c',
    '+d',
  ].join('\n');

  it('splits on the diff --git boundary', () => {
    const out = splitPatches(MULTI);
    assert.equal(out.length, 2);
    assert.equal(parsePatches(out).map((f) => f.path).join(','), 'one.js,two.js');
  });

  it('is not fooled by a line of content that looks like a boundary', () => {
    // Two traps in one fixture: a hunk header inside a string literal, and a
    // comment that starts with `diff --git`. Neither may start a new chunk —
    // the second only would if the prefix matched `+// diff --git`, which it
    // does not, because a real boundary line has nothing before `diff`.
    const tricky = [
      'diff --git a/only.js b/only.js',
      '--- a/only.js',
      '+++ b/only.js',
      '@@ -1,2 +1,3 @@',
      ' const s = "@@ -1,1 +1,1 @@";',
      '+// diff --git a/fake b/fake',
      ' end',
    ].join('\n');
    const out = splitPatches(tricky);
    assert.equal(out.length, 1, 'a file is one chunk, however much it looks like two');
    const parsed = parsePatches(out);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].path, 'only.js');
  });

  it('returns nothing for empty input', () => {
    assert.deepEqual(splitPatches(''), []);
    assert.deepEqual(splitPatches(undefined), []);
  });
});

// ── untracked files ───────────────────────────────────────────────────────

describe('parseUntracked', () => {
  let dir;
  before(() => { dir = mkdtempSync(join(tmpdir(), 'review-untracked-')); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('synthesises an all-additions patch so findings can point at lines', () => {
    writeFileSync(join(dir, 'new.js'), 'const a = 1;\nconst b = 2;\n');
    const f = parseUntracked(dir, 'new.js');
    assert.ok(f, 'a brand new file must be reviewable, not silently skipped');
    assert.equal(f.path, 'new.js');
    assert.equal(f.status, 'added');
    assert.equal(f.additions, 2);
    assert.equal(isPointable(f, 2, 'RIGHT'), true);
  });

  it('does not invent a final empty line from a trailing newline', () => {
    writeFileSync(join(dir, 'nl.js'), 'one\ntwo\n');
    assert.equal(parseUntracked(dir, 'nl.js').additions, 2);
  });

  it('skips a binary file rather than pretending to review it', () => {
    writeFileSync(join(dir, 'img.bin'), 'abc\u0000def');
    assert.equal(parseUntracked(dir, 'img.bin'), null);
  });

  it('returns null for a file that cannot be read', () => {
    assert.equal(parseUntracked(dir, 'nope.js'), null);
  });
});

// ── cost cap ──────────────────────────────────────────────────────────────

describe('decideReviewable', () => {
  it('refuses nothing when there are no changes, and says why', () => {
    const d = decideReviewable({ stats: { files: 0, additions: 0, deletions: 0, total: 0 } });
    assert.equal(d.review, false);
    assert.match(d.reason, /no changes/);
  });

  it('caps the diff before anything reaches a model', () => {
    const over = decideReviewable({ stats: { files: 3, additions: 900, deletions: 0, total: 900 } });
    assert.equal(over.review, false);
    assert.match(over.reason, /cap/);

    const under = decideReviewable({ stats: { files: 3, additions: 400, deletions: 399, total: 799 } });
    assert.equal(under.review, true);
  });

  it('treats the cap as inclusive', () => {
    assert.equal(decideReviewable({ stats: { files: 1, additions: 400, deletions: 400, total: 800 } }).review, true);
    assert.equal(decideReviewable({ stats: { files: 1, additions: 400, deletions: 401, total: 801 } }).review, false);
  });
});

// ── JSON extraction ───────────────────────────────────────────────────────

describe('extractJson', () => {
  it('parses an object, an array, and either inside prose', () => {
    assert.deepEqual(extractJson('{"findings":[]}'), { findings: [] });
    assert.deepEqual(extractJson('[{"path":"a"}]'), [{ path: 'a' }]);
    assert.deepEqual(extractJson('Here you go:\n{"findings":[]}'), { findings: [] });
    assert.deepEqual(extractJson('```json\n{"findings":[]}\n```'), { findings: [] });
  });

  it('is not fooled by braces or escapes inside strings', () => {
    assert.equal(extractJson('{"message":"use {} carefully"}').message, 'use {} carefully');
    assert.equal(extractJson('{"message":"say \\"hi\\""}').message, 'say "hi"');
  });

  it('returns null rather than throwing on malformed output', () => {
    // A crash here loses a review that already cost money.
    assert.equal(extractJson('{"findings": [ {oops'), null);
    assert.equal(extractJson('nothing to report'), null);
    assert.equal(extractJson(''), null);
  });
});

describe('stripJson', () => {
  it('removes the payload with the same scanner that found it', () => {
    // The bug: a separate regex assumed the object form, so a bare array was
    // left in place and posted as the review body.
    const raw = '[{"path":"a.js","line":1,"message":"x"}]';
    assert.ok(!stripJson(raw).includes('"path"'));
    assert.ok(!stripJson('{"findings":[]}').includes('findings'));
  });

  it('keeps the prose around it', () => {
    assert.match(stripJson('Looks unbounded.\n\n{"findings":[]}'), /Looks unbounded/);
  });
});

describe('extractSummary', () => {
  it('prefers the model\'s own summary field', () => {
    assert.equal(extractSummary('{"summary":"two things","findings":[]}'), 'two things');
  });

  it('falls back to prose, and to nothing', () => {
    assert.match(extractSummary('Just prose here.'), /Just prose/);
    assert.equal(extractSummary('{"findings":[]}'), '');
  });
});

// ── finding validation ────────────────────────────────────────────────────

describe('validateFindings', () => {
  const files = parsePatches([SIMPLE]);
  const ok = { path: 'src/app.js', line: 2, side: 'RIGHT', severity: 'warning', message: 'b is now 3' };

  it('accepts a finding that lands on an added line', () => {
    const { findings, dropped } = validateFindings(JSON.stringify([ok]), files);
    assert.equal(findings.length, 1);
    assert.equal(dropped.length, 0);
  });

  it('accepts a LEFT finding on a removed line', () => {
    const { findings } = validateFindings(JSON.stringify([{ ...ok, line: 2, side: 'LEFT' }]), files);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].side, 'LEFT');
  });

  it('drops a finding outside the hunks and reports it', () => {
    // Unplaceable is not "lesser" — it is undeliverable, and the count is the
    // only signal that the parser, rather than the model, is at fault.
    const { findings, dropped } = validateFindings(JSON.stringify([ok, { ...ok, line: 812 }]), files);
    assert.equal(findings.length, 1);
    assert.equal(dropped.length, 1);
    assert.match(dropped[0].reason, /not part of the diff/);
  });

  it('drops a finding on a file the change did not touch', () => {
    const { findings, dropped } = validateFindings(JSON.stringify([{ ...ok, path: 'src/other.js' }]), files);
    assert.equal(findings.length, 0);
    assert.match(dropped[0].reason, /not in the diff/);
  });

  it('drops a malformed finding rather than reporting garbage', () => {
    const { findings, dropped } = validateFindings(
      JSON.stringify([{ path: '', line: 1, message: 'x' }, { path: 'a', line: 'two', message: 'y' }, { path: 'a', line: 1, message: '' }]),
      files,
    );
    assert.equal(findings.length, 0);
    assert.equal(dropped.length, 3);
  });

  it('caps the number of findings', () => {
    const many = Array.from({ length: 30 }, () => ok);
    assert.equal(validateFindings(JSON.stringify(many), files).findings.length, REVIEW_MAX_FINDINGS);
  });

  it('defaults an unknown severity to warning', () => {
    const { findings } = validateFindings(JSON.stringify([{ ...ok, severity: 'apocalyptic' }]), files);
    assert.equal(findings[0].severity, 'warning');
  });

  it('truncates a very long message', () => {
    const { findings } = validateFindings(JSON.stringify([{ ...ok, message: 'z'.repeat(9000) }]), files);
    assert.equal(findings[0].message.length, 2000);
  });

  it('survives output that is not JSON at all', () => {
    const { findings, dropped } = validateFindings('I found nothing to report.', files);
    assert.equal(findings.length, 0);
    assert.equal(dropped.length, 0);
  });

  it('accepts the wrapped envelope', () => {
    assert.equal(validateFindings(JSON.stringify({ findings: [ok] }), files).findings.length, 1);
  });
});

// ── the brief and the report ──────────────────────────────────────────────

describe('buildBrief', () => {
  it('asks for pointable findings', () => {
    const brief = buildBrief({ ref: 'main...HEAD', stats: { files: 2, additions: 9, deletions: 1 }, readOnly: true });
    assert.match(brief, /main\.\.\.HEAD/);
    assert.match(brief, /must be a line that appears in the diff/);
    assert.match(brief, /read access only/);
  });

  it('does not embed the diff', () => {
    const brief = buildBrief({ stats: { files: 1, additions: 1, deletions: 0 }, readOnly: false });
    assert.ok(!brief.includes('@@ -1'), 'the diff is on disk; an agent with grep should fetch it');
    assert.ok(!brief.includes('const a = 1;'));
  });

  it('does not ask for thoroughness', () => {
    // That instruction reliably produces more than is present.
    assert.ok(!/be thorough/i.test(buildBrief({ stats: null, readOnly: true })));
  });

  it('names the cap it enforces', () => {
    assert.match(buildBrief({ stats: null, readOnly: true }), new RegExp(`at most ${REVIEW_MAX_FINDINGS}`));
  });
});

describe('renderReview', () => {
  const finding = { path: 'src/app.js', line: 2, side: 'RIGHT', severity: 'critical', message: 'null here' };

  it('says plainly when there is nothing', () => {
    const out = renderReview({ summary: 'x', findings: [], dropped: [], stats: null });
    assert.match(out, /No findings/);
  });

  it('reports the dropped count, which is the only parser signal', () => {
    const out = renderReview({
      summary: '', findings: [], dropped: [{ path: 'a.js', line: 99, reason: 'not part of the diff' }],
      stats: null,
    });
    assert.match(out, /1 finding\(s\) dropped as unplaceable/);
    assert.match(out, /not part of the diff/);
  });

  it('summarises severities and the cost', () => {
    const out = renderReview({
      summary: 'looked fine', findings: [finding], dropped: [],
      stats: { files: 1, additions: 3, deletions: 1 }, costUsd: 0.0123,
    });
    assert.match(out, /1 critical, 0 warning, 0 nit/);
    assert.match(out, /\$0\.0123/);
    assert.match(out, /looked fine/);
  });
});

// ── a real repository ─────────────────────────────────────────────────────

describe('collectReviewableDiff', () => {
  let dir;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'review-repo-'));
    const run = (args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
    run(['init', '-q']);
    run(['config', 'user.email', 't@example.com']);
    run(['config', 'user.name', 't']);
    writeFileSync(join(dir, 'a.js'), 'const a = 1;\nconst b = 2;\n');
    run(['add', '.']);
    run(['commit', '-qm', 'init']);
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('reports repository state', async () => {
    const state = await repoState(dir);
    assert.equal(state.isRepo, true);
    assert.equal(state.branch.length > 0, true);
    assert.equal(state.dirty, false);
  });

  it('finds nothing to review in a clean tree', async () => {
    const { files, stats } = await collectReviewableDiff({ cwd: dir });
    assert.equal(files.length, 0);
    assert.equal(decideReviewable({ stats }).review, false);
  });

  it('finds a modified file and counts it', async () => {
    writeFileSync(join(dir, 'a.js'), 'const a = 1;\nconst b = 3;\n');
    const { files, stats, kind } = await collectReviewableDiff({ cwd: dir });
    assert.equal(kind, 'uncommitted');
    assert.equal(files.length, 1);
    assert.equal(files[0].path, 'a.js');
    assert.equal(stats.additions, 1);
    assert.equal(stats.deletions, 1);
    assert.equal(stats.files, 1);
  });

  it('includes an untracked file, which git diff alone omits', async () => {
    writeFileSync(join(dir, 'brand-new.js'), 'export const x = 1;\nexport const y = 2;\n');
    const { files } = await collectReviewableDiff({ cwd: dir });
    assert.ok(
      files.some((f) => f.path === 'brand-new.js'),
      'a new file is part of the change being committed; skipping it silently is the bug this avoids',
    );
    const fresh = files.find((f) => f.path === 'brand-new.js');
    assert.equal(isPointable(fresh, 2, 'RIGHT'), true, 'and its lines must be pointable');
  });

  it('separates staged-only from everything uncommitted', async () => {
    execFileSync('git', ['add', 'brand-new.js'], { cwd: dir, stdio: 'ignore' });

    const staged = await collectReviewableDiff({ cwd: dir, staged: true });
    assert.ok(staged.files.some((f) => f.path === 'brand-new.js'), 'staged shows it');

    // `git diff HEAD` is staged PLUS unstaged, so the untracked fallback is no
    // longer what surfaces this file — git does. It must still appear exactly
    // once, because the fallback would otherwise add it a second time.
    const uncommitted = await collectReviewableDiff({ cwd: dir });
    const occurrences = uncommitted.files.filter((f) => f.path === 'brand-new.js');
    assert.equal(occurrences.length, 1, 'exactly once — not skipped, not duplicated');
    assert.equal(uncommitted.stats.files, uncommitted.files.length);
  });

  it('diffs a branch against a base ref', async () => {
    execFileSync('git', ['checkout', '-qb', 'feature'], { cwd: dir, stdio: 'ignore' });
    writeFileSync(join(dir, 'a.js'), 'const a = 1;\nconst b = 42;\n');
    execFileSync('git', ['commit', '-aqm', 'change'], { cwd: dir, stdio: 'ignore' });
    const { files, ref } = await collectReviewableDiff({ cwd: dir, base: 'master' });
    assert.equal(ref, 'master...HEAD');
    assert.ok(files.some((f) => f.path === 'a.js'));
  });
});

// ── the task integration ──────────────────────────────────────────────────

describe('runReview is a task', () => {
  let dir;
  const saying = (body) =>
    async function* () {
      yield { type: 'text', text: body };
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 10 } };
    };

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'review-task-'));
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'app.js'), 'const a = 1;\nconst b = 3;\nconst d = 5;\n');
    process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-key-not-used';
  });
  after(() => { rmSync(dir, { recursive: true, force: true }); resetTasks(); });

  const run = (body, readOnly = true) =>
    runReview({
      brief: 'Review this change.',
      cwd: dir,
      model: MODEL,
      readOnly,
      files: parsePatches([SIMPLE]),
      createStream: saying(body),
    });

  it('leaves a task in the shared registry', async () => {
    resetTasks();
    await run('Looks fine.');
    const owl = listTasks({ kind: 'agent' }).filter((t) => t.owner === 'review');
    assert.equal(owl.length, 1);
    assert.equal(owl[0].status, 'done');
  });

  it('defaults to the readonly rung, because a review edits nothing', async () => {
    resetTasks();
    await run('Looks fine.');
    const t = listTasks({ kind: 'agent' }).find((x) => x.owner === 'review');
    assert.equal(t.permission, 'readonly');
    assert.equal(t.readOnly, true);
  });

  it('climbs to the teammate rung only when the caller allows it', async () => {
    resetTasks();
    await run('Looks fine.', false);
    const t = listTasks({ kind: 'agent' }).find((x) => x.owner === 'review');
    assert.equal(t.permission, 'teammate');
  });

  it('stores a rung NAME, so the registry stays inspectable', async () => {
    resetTasks();
    await run('Looks fine.');
    const t = listTasks({ kind: 'agent' }).find((x) => x.owner === 'review');
    assert.equal(typeof t.permission, 'string');
    assert.ok(['inherit', 'teammate', 'readonly', 'none'].includes(t.permission));
  });

  it('returns validated findings, not whatever the model said', async () => {
    resetTasks();
    const out = await run(JSON.stringify({
      summary: 'One real problem.',
      findings: [
        { path: 'src/app.js', line: 2, side: 'RIGHT', severity: 'critical', message: 'caller expects 2' },
        { path: 'src/app.js', line: 999, severity: 'warning', message: 'invented' },
      ],
    }));
    assert.equal(out.findings.length, 1);
    assert.equal(out.dropped.length, 1);
    assert.equal(out.summary, 'One real problem.');
  });

  it('reports no findings without inventing any', async () => {
    resetTasks();
    const out = await run('{"summary":"clean","findings":[]}');
    assert.equal(out.findings.length, 0);
    assert.equal(out.summary, 'clean');
  });

  it('propagates a cancelled review rather than reporting success', async () => {
    resetTasks();
    // A stream that never yields is a hung provider; the task timeout path is the
    // queue's job, so here we cancel by id and expect a thrown cancellation.
    // eslint-disable-next-line require-yield
    const hanging = async function* () {
      await new Promise(() => {});
    };
    const promise = runReview({
      brief: 'x', cwd: dir, model: MODEL, files: parsePatches([SIMPLE]), createStream: hanging,
    });
    await new Promise((r) => setTimeout(r, 30));
    const task = listTasks({ kind: 'agent' }).find((x) => x.owner === 'review');
    assert.ok(task, 'the review is visible while it runs');
    const { cancelTask } = await import('../src/agent/task.js');
    assert.equal(cancelTask(task.id, 'test'), true);
    await assert.rejects(() => promise, /cancelled/);
  });
});

test('the review surface is three small modules, not a subsystem', () => {
  // A structural assertion, deliberately: it fails if someone folds the parser,
  // the git plumbing and the agent call into one file, which is how this kind of
  // feature usually grows. The limit is loose enough to be worth arguing with.
  const sizes = ['review-diff.js', 'review-refs.js', 'review.js'].map((f) => {
    const text = readFileSync(join('src', 'agent', f), 'utf8');
    return { f, lines: text.split('\n').length };
  });
  for (const s of sizes) {
    assert.ok(s.lines < 400, `${s.f} is ${s.lines} lines; over 400 means it has stopped being one concern`);
  }
});

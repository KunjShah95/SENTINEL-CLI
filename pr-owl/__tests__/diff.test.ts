/**
 * Tests for the diff parser.
 *
 * Weighted towards the four failure modes that produce a review GitHub accepts
 * and that is subtly wrong, because a rejected review is loud and a misplaced
 * comment is not.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFileDiff, isCommentable, fileText, parsePatches, commentablePositions } from '../lib/diff';

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

describe('parseFileDiff', () => {
  it('reads the header and strips git a/ b/ prefixes', () => {
    const f = parseFileDiff(SIMPLE);
    assert.ok(f);
    assert.equal(f.path, 'src/app.js');
    assert.equal(f.previousPath, null);
    assert.equal(f.status, 'modified');
    assert.equal(f.additions, 2);
    assert.equal(f.deletions, 1);
  });

  it('numbers both sides independently', () => {
    const f = parseFileDiff(SIMPLE)!;
    const hunk = f.hunks[0];
    assert.equal(hunk.oldStart, 1);
    assert.equal(hunk.newStart, 1);

    const del = hunk.lines.find((l) => l.type === 'del')!;
    assert.equal(del.originalLine, 2, 'the removed line was line 2 on the left');
    assert.equal(del.line, null, 'and has no position on the right');

    const adds = hunk.lines.filter((l) => l.type === 'add');
    assert.deepEqual(adds.map((l) => l.line), [2, 3], 'two adds take right-side lines 2 and 3');
  });

  it('does not count a "no newline" marker as a line', () => {
    // This is the bug that shifts every subsequent comment by one.
    const patch = `--- a/f.txt
+++ b/f.txt
@@ -1,2 +1,2 @@
 one
-two
+2
\\ No newline at end of file
`;
    const f = parseFileDiff(patch)!;
    const adds = f.hunks[0].lines.filter((l) => l.type === 'add');
    assert.equal(adds.length, 1);
    assert.equal(adds[0].line, 2);
    // The marker is appended to the previous line, not given a number.
    assert.match(f.hunks[0].lines.find((l) => l.type === 'add')!.content, /No newline at end of file/);
    for (const l of f.hunks[0].lines) {
      assert.notEqual(l.line, 3, 'no line was invented for the marker');
    }
  });

  it('honours a hunk header that starts mid-file', () => {
    const patch = `--- a/x.js
+++ b/x.js
@@ -40,3 +47,3 @@ function middle() {
 keep
-old
+new
`;
    const f = parseFileDiff(patch)!;
    assert.equal(f.hunks[0].lines[0].line, 47);
    assert.equal(f.hunks[0].lines[0].originalLine, 40);
    // `keep` takes right line 47, so the added line is 48 — not 49. The
    // header's own start number is the number of its FIRST line, which is the
    // part people get wrong when hand-computing a comment position.
    assert.equal(f.hunks[0].lines[2].line, 48);
    assert.equal(f.hunks[0].lines[1].originalLine, 41, 'the removed line follows the context line');
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
    const f = parseFileDiff(patch)!;
    assert.equal(f.hunks.length, 2);
    assert.equal(f.hunks[1].lines[1].line, 21, 'the second hunk restarts from its own header');
  });

  it('detects an added file via /dev/null', () => {
    const patch = `--- /dev/null
+++ b/new.js
@@ -0,0 +1,2 @@
+one
+two
`;
    const f = parseFileDiff(patch)!;
    assert.equal(f.path, 'new.js');
    assert.equal(f.status, 'added');
    assert.equal(f.additions, 2);
  });

  it('records the previous path on a rename', () => {
    const patch = `--- a/old/name.js
+++ b/new/name.js
@@ -1,1 +1,1 @@
 same
`;
    const f = parseFileDiff(patch)!;
    assert.equal(f.status, 'renamed');
    assert.equal(f.path, 'new/name.js');
    assert.equal(f.previousPath, 'old/name.js');
  });

  it('unquotes a path containing spaces', () => {
    // git quotes these; leaving the quotes on means GitHub cannot match the path.
    const patch = `--- "a/src/my file.js"
+++ "b/src/my file.js"
@@ -1,1 +1,1 @@
 x
`;
    assert.equal(parseFileDiff(patch)!.path, 'src/my file.js');
  });

  it('treats an unknown marker as metadata without advancing a counter', () => {
    const patch = `--- a/z.js
+++ b/z.js
@@ -1,2 +1,2 @@
 a
?weird
-b
+c
`;
    const f = parseFileDiff(patch)!;
    assert.equal(f.hunks[0].lines.filter((l) => l.type === 'meta').length, 1);
    assert.equal(f.hunks[0].lines.find((l) => l.type === 'del')!.originalLine, 2, 'the del is still left line 2');
  });

  it('returns null for an absent patch', () => {
    // GitHub sends `patch: undefined` for binary files, oversized diffs, and
    // deeply diverged branches — three different causes, same signal.
    assert.equal(parseFileDiff(undefined), null);
    assert.equal(parseFileDiff(null), null);
    assert.equal(parseFileDiff(''), null);
    assert.equal(parseFileDiff('   '), null);
  });

  it('marks a patch with no hunks as truncated', () => {
    const f = parseFileDiff('--- a/a.js\n+++ b/a.js\n')!;
    assert.equal(f.truncated, true);
    assert.equal(f.additions, 0);
  });
});

describe('isCommentable', () => {
  it('accepts an added line on the right', () => {
    const f = parseFileDiff(SIMPLE)!;
    assert.equal(isCommentable(f, 2, 'RIGHT'), true);
    assert.equal(isCommentable(f, 3, 'RIGHT'), true);
  });

  it('accepts a removed line only on the left', () => {
    const f = parseFileDiff(SIMPLE)!;
    assert.equal(isCommentable(f, 2, 'LEFT'), true);
    // Left keeps the context lines that the new side renumbered past, and the
    // deleted line at 2. Left 3 is the context line `const d = 5;` — the same
    // source line as right 4.
    const left = commentablePositions(f).filter((p) => p.side === 'LEFT');
    assert.deepEqual(left.map((p) => p.line).sort((a, b) => a - b), [1, 2, 3, 4]);
    const right = commentablePositions(f).filter((p) => p.side === 'RIGHT');
    assert.deepEqual(right.map((p) => p.line).sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  });

  it('rejects a line outside every hunk', () => {
    const f = parseFileDiff(SIMPLE)!;
    assert.equal(isCommentable(f, 900, 'RIGHT'), false);
    assert.equal(isCommentable(f, 0, 'RIGHT'), false);
    assert.equal(isCommentable(f, -1, 'RIGHT'), false);
  });

  it('accepts a context line on either side', () => {
    // Context is present in both old and new, so GitHub honours a comment on
    // it from either side. Collapsing these into one side is a real bug: it
    // silently makes every left-side comment on unchanged code unreachable.
    const f = parseFileDiff(SIMPLE)!;
    assert.equal(isCommentable(f, 1, 'RIGHT'), true);
    assert.equal(isCommentable(f, 1, 'LEFT'), true);
    assert.equal(isCommentable(f, 5, 'RIGHT'), true);
    assert.equal(isCommentable(f, 4, 'LEFT'), true);
  });
});

describe('fileText', () => {
  it('reconstructs the new side from adds and context', () => {
    const f = parseFileDiff(SIMPLE)!;
    const text = fileText(f, 'RIGHT');
    assert.equal(text, 'const a = 1;\nconst b = 3;\nconst c = 4;\nconst d = 5;\nconst e = 6;');
    assert.ok(!text.includes('const b = 2;'), 'the removed line is not on the right');
  });

  it('reconstructs the old side from removals and context', () => {
    const f = parseFileDiff(SIMPLE)!;
    const text = fileText(f, 'LEFT');
    assert.ok(text.includes('const b = 2;'));
    assert.ok(!text.includes('const c = 4;'));
  });
});

describe('parsePatches', () => {
  it('skips unparseable entries instead of throwing', () => {
    const out = parsePatches([SIMPLE, undefined, 'not a diff at all', SIMPLE]);
    // One usable patch from the second SIMPLE; the first is consumed by the
    // parse and `not a diff` has no +++ header.
    assert.equal(out.length, 2);
    assert.ok(out.every((f) => f.path === 'src/app.js'));
  });
});

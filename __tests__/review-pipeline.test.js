import { ReviewPipeline, createReviewPipeline } from '../src/agents/review-pipeline.js';
import { RuleEngine } from '../src/rules/rule-engine.js';
import { FileReader } from '../src/git/file-reader.js';
import { ToolRegistry, PHASES } from '../src/agents/tool-registry.js';
import { CommentPositionResolver } from '../src/resolvers/position-resolver.js';

describe('ReviewPipeline', () => {
  test('createReviewPipeline returns configured instance', async () => {
    const pipeline = await createReviewPipeline({ concurrency: 2 });
    expect(pipeline).toBeInstanceOf(ReviewPipeline);
    expect(pipeline.concurrency).toBe(2);
    expect(pipeline.commentCollector).toEqual([]);
  });

  test('initialize sets up rule engine', async () => {
    const pipeline = new ReviewPipeline();
    expect(pipeline.ruleEngine).toBeNull();
    await pipeline.initialize();
    expect(pipeline.ruleEngine).toBeInstanceOf(RuleEngine);
    expect(pipeline.ruleEngine.loaded).toBe(true);
  });

  test('_splitDiffs parses unified diff format', () => {
    const pipeline = new ReviewPipeline();
    const diff = [
      'diff --git a/src/index.js b/src/index.js',
      'index abc..def 100644',
      '--- a/src/index.js',
      '+++ b/src/index.js',
      '@@ -1,3 +1,4 @@',
      ' line1',
      '-old line',
      '+new line',
      ' line3',
      '-- ',
      '2.47.0',
    ].join('\n');

    const files = pipeline._splitDiffs(diff);
    expect(files.length).toBe(1);
    expect(files[0].oldPath).toBe('src/index.js');
    expect(files[0].newPath).toBe('src/index.js');
    expect(files[0].isBinary).toBe(false);
    expect(files[0].isNew).toBe(false);
    expect(files[0].isDeleted).toBe(false);
  });

  test('_splitDiffs handles new files', () => {
    const pipeline = new ReviewPipeline();
    const diff = [
      'diff --git a/newfile.js b/newfile.js',
      'new file mode 100644',
      'index 000..abc 100644',
      '--- /dev/null',
      '+++ b/newfile.js',
      '@@ -0,0 +1 @@',
      '+console.log("hello");',
    ].join('\n');

    const files = pipeline._splitDiffs(diff);
    expect(files.length).toBe(1);
    expect(files[0].isNew).toBe(true);
  });

  test('_splitDiffs handles binary files', () => {
    const pipeline = new ReviewPipeline();
    const diff = [
      'diff --git a/image.png b/image.png',
      'index abc..def 100644',
      'Binary files a/image.png and b/image.png differ',
    ].join('\n');

    const files = pipeline._splitDiffs(diff);
    expect(files.length).toBe(1);
    expect(files[0].isBinary).toBe(true);
  });

  test('_splitDiffs handles multiple files', () => {
    const pipeline = new ReviewPipeline();
    const diff = [
      'diff --git a/a.js b/a.js',
      'index abc..def 100644',
      '--- a/a.js',
      '+++ b/a.js',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      'diff --git a/b.js b/b.js',
      'index ghi..jkl 100644',
      '--- a/b.js',
      '+++ b/b.js',
      '@@ -1 +1 @@',
      '-foo',
      '+bar',
    ].join('\n');

    const files = pipeline._splitDiffs(diff);
    expect(files.length).toBe(2);
    expect(files[0].newPath).toBe('a.js');
    expect(files[1].newPath).toBe('b.js');
  });

  test('_reviewFile returns file metadata', async () => {
    const pipeline = new ReviewPipeline();
    await pipeline.initialize();
    const fileDiff = {
      oldPath: 'src/test.js',
      newPath: 'src/test.js',
      diff: '@@ -1 +1 @@\n-old\n+new\n',
      isBinary: false,
      isNew: false,
      isDeleted: false,
      insertions: 1,
      deletions: 1,
    };
    const result = await pipeline._reviewFile(fileDiff, {});
    expect(result.file).toBe('src/test.js');
    expect(Array.isArray(result.comments)).toBe(true);
    expect(result.commentCount).toBeGreaterThanOrEqual(0);
  });

  test('_workerLoop processes queue concurrently', async () => {
    const pipeline = new ReviewPipeline();
    await pipeline.initialize();
    const queue = [
      { oldPath: 'a.js', newPath: 'a.js', diff: '', isBinary: false, isNew: false, isDeleted: false, insertions: 0, deletions: 0 },
      { oldPath: 'b.js', newPath: 'b.js', diff: '', isBinary: false, isNew: false, isDeleted: false, insertions: 0, deletions: 0 },
    ];
    const results = [];
    await pipeline._workerLoop(queue, {}, results);
    expect(results.length).toBe(2);
  });
});

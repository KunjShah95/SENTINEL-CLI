/**
 * The integration that justifies the whole exercise.
 *
 * A PR review is concurrent work, and before the task primitive it would have
 * needed its own status store, its own permission policy and its own
 * cancellation. These tests assert that it is one `createTask` call on the same
 * ladder as everything else — including the part that actually matters for
 * safety, which is that a fork's head commit never gets a rung that can write.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { reviewPullRequest } from '../lib/review';
import { parseFileDiff, type FileDiff } from '../lib/diff';
import { listTasks, getTask, resetTasks, cancelTask } from '../../src/agent/task.js';

const MODEL = 'openai/gpt-oss-20b';

const PATCH = `--- a/src/app.js
+++ b/src/app.js
@@ -1,4 +1,4 @@
 const a = 1;
-const b = 2;
+const b = 3;
 const d = 5;
 const e = 6;
`;

/** A provider stub: one text response, then a bare finish. */
function saying(body: string) {
  return async function* () {
    yield { type: 'text', text: body };
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 10 } };
  };
}

let dir: string;
let files: FileDiff[];

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'pr-owl-review-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'app.js'), 'const a = 1;\nconst b = 3;\nconst d = 5;\nconst e = 6;\n');
  const f = parseFileDiff(PATCH);
  assert.ok(f);
  files = [f];
  // The loop resolves a model against the registry; these are the ones that need
  // no key.
  process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-key-not-used';
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
  resetTasks();
});

const job = {
  id: 'delivery-1',
  repo: 'acme/api',
  prNumber: 42,
  headSha: 'abc1234',
};

function run(body: string, readOnly = false) {
  return reviewPullRequest(job, {
    repoDir: dir,
    files,
    additions: 1,
    deletions: 1,
    brief: 'Review pull request #42 on acme/api.',
    readOnly,
    model: MODEL,
    createStream: saying(body),
  });
}

describe('reviewPullRequest is a task', () => {
  it('leaves a task in the shared registry', async () => {
    resetTasks();
    await run('Looks fine to me.');
    const owl = listTasks({ kind: 'agent' }).filter((t) => t.owner === 'pr-owl');
    assert.equal(owl.length, 1, 'exactly one task, and it is the review');
    assert.equal(owl[0].status, 'done');
    assert.match(owl[0].name, /^review-acme-api-42$/);
  });

  it('is addressable by id, like every other task', async () => {
    resetTasks();
    await run('Looks fine to me.');
    const owl = listTasks({ kind: 'agent' }).find((t) => t.owner === 'pr-owl')!;
    assert.ok(getTask(owl.id), 'the task can be fetched by id after it finished');
    assert.equal(cancelTask(owl.id), false, 'and cannot be cancelled after the fact');
  });

  it('records the PR on the task, not just the prompt', async () => {
    resetTasks();
    await run('Looks fine to me.');
    const owl = listTasks({ kind: 'agent' }).find((t) => t.owner === 'pr-owl')!;
    assert.equal(owl.repo, 'acme/api');
    assert.equal(owl.pr, 42);
    assert.equal(owl.headSha, 'abc1234');
  });
});

describe('the permission rung', () => {
  it('gives a same-repo PR the teammate rung', async () => {
    resetTasks();
    await run('Looks fine to me.', false);
    const owl = listTasks({ kind: 'agent' }).find((t) => t.owner === 'pr-owl')!;
    assert.equal(owl.permission, 'teammate');
    assert.equal(owl.readOnly, false);
  });

  it('gives a fork PR the readonly rung', async () => {
    // This is the whole security model of an autonomous reviewer. A fork's head
    // commit is a stranger's code; the rung that stops a subagent editing files
    // is the same one that stops a stranger's PR being able to write.
    resetTasks();
    await run('Looks fine to me.', true);
    const owl = listTasks({ kind: 'agent' }).find((t) => t.owner === 'pr-owl')!;
    assert.equal(owl.permission, 'readonly');
    assert.equal(owl.readOnly, true);
  });

  it('uses a real rung name, not a closure', async () => {
    // A stored callback cannot be compared, logged, or asserted on — which is
    // the whole reason the ladder is names.
    resetTasks();
    await run('Looks fine to me.', true);
    const owl = listTasks({ kind: 'agent' }).find((t) => t.owner === 'pr-owl')!;
    assert.equal(typeof owl.permission, 'string');
    assert.ok(['inherit', 'teammate', 'readonly', 'none'].includes(owl.permission));
  });
});

describe('findings come back validated', () => {
  it('accepts a finding that lands in the diff', async () => {
    resetTasks();
    const out = await run(
      JSON.stringify({
        findings: [{ path: 'src/app.js', line: 2, side: 'RIGHT', severity: 'warning', message: 'b is now 3 but the caller expects 2' }],
      }),
    );
    assert.equal(out.findings.length, 1);
    assert.equal(out.findings[0].line, 2);
    assert.equal(out.dropped.length, 0);
  });

  it('drops a hallucinated line and reports the drop', async () => {
    resetTasks();
    const out = await run(
      JSON.stringify({
        findings: [
          { path: 'src/app.js', line: 2, severity: 'warning', message: 'real' },
          { path: 'src/app.js', line: 812, severity: 'warning', message: 'invented' },
        ],
      }),
    );
    assert.equal(out.findings.length, 1, 'the bad position is not passed to GitHub');
    assert.equal(out.dropped.length, 1);
    // The wording comes from Sentinel's copy now — see lib/review.ts. The point
    // of the assertion is that a drop was recorded and explained, not the exact
    // phrasing, so it matches both wordings deliberately.
    assert.match(out.dropped[0].reason, /not part of the diff|outside the diff/);
  });

  it('survives a response that is not JSON', async () => {
    resetTasks();
    const out = await run('I could not find anything wrong with this change.');
    assert.equal(out.findings.length, 0);
    assert.match(out.summary, /No defects found/);
  });

  it('reports the model it used', async () => {
    resetTasks();
    const out = await run('fine');
    assert.equal(out.model, MODEL);
  });
});

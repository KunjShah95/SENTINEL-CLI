import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { CompareTable, Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "pr-owl-diff-parser",
  title: "Turning a diff into line numbers a comment can attach to",
  metaTitle: "PR Owl Part 9: The Diff Parser",
  description:
    "GitHub rejects an entire review with a 422 if one comment position is wrong, so the diff has to become structured data — and four line kinds have to be kept apart.",
  date: "2026-10-07",
  readingMinutes: 12,
  tags: ["Tutorial", "Parsing", "Diff", "GitHub"],
  keyword: "parse unified diff inline comment line numbers",
  series: { slug: "pr-owl-course", order: 9 },
  related: ["pr-owl-fork-permission-rung", "pr-owl-post-the-review", "risk-ledger-command-shapes"],
  faq: [
    {
      q: "Why not use the `diff` package Sentinel already depends on?",
      a: "Because that package parses and applies patches; it does not model GitHub's review API, whose constraint is unusual — positions are relative to the diff's hunks, not to the file. You would still have to walk the hunks and decide, for each line, whether it exists on the left, the right, both or neither. That walk is the whole of this part, and it is about 40 lines.",
    },
    {
      q: "What is the difference between `line` and `start_line`?",
      a: "`line` is a single line and `start_line`/`start_side` mark a range for a multi-line comment. PR Owl does not use ranges: an inline comment covering five lines is much harder for a reviewer to read as one observation, and it is another position that can be wrong. One finding, one line.",
    },
    {
      q: "Why validate locally when GitHub will reject a bad position anyway?",
      a: "Because GitHub rejects the whole review, not the bad comment. Three correct findings die with one hallucinated line number, and the model cannot tell you which one it got wrong — you just get a 422 and no review. Filtering locally means a partially-wrong response still produces a useful review, and the drops get reported on the check run.",
    },
    {
      q: "What about files where GitHub sends no patch at all?",
      a: "Three different reasons all arrive as an absent `patch`: binary files, diffs past GitHub's size cap, and a branch more than 300 commits diverged. In all three there is nothing to attach a line comment to, so those files are reviewed as prose and contribute no inline findings. `parseFileDiff` returns null for them and the caller moves on.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          GitHub&rsquo;s review API accepts a path, a line and a side — and rejects the{" "}
          <strong>entire review</strong> with a 422 if any position falls outside the
          diff&rsquo;s hunks. One hallucinated line number deletes three correct findings.
        </p>
        <p>
          So the diff must become structured data, and four line kinds kept apart: context
          (both sides), added (right only), removed (left only), and{" "}
          <code className="font-mono text-[13px]">\\ No newline at end of file</code> — which
          is a directive, <strong>not a line</strong>.
        </p>
      </KeyTakeaways>

      <H2 id="api" text="The API you are writing against" />
      <CodeBlock
        label="POST /repos/{owner}/{repo}/pulls/{n}/reviews"
        code={`{
  "commit_id": "abc1234",
  "body": "## PR Owl\\n\\n1 critical, 2 warning.",
  "event": "REQUEST_CHANGES",
  "comments": [
    { "path": "src/app.js", "line": 42, "side": "RIGHT", "body": "this can be null here" },
    { "path": "src/app.js", "line": 17, "side": "LEFT",  "body": "why was this removed?" }
  ]
}

// 201 -> posted
// 422 -> "line must be part of the diff"  <- and NOTHING is posted,
//         not even the comments that were fine.`}
      />
      <p>
        That last line is the entire reason this part exists. The failure is not
        &ldquo;one comment misplaced&rdquo;; it is{" "}
        <em>nothing posted, and no indication of which comment was at fault</em>. A model
        that produces four findings and one bad line number produces no review at all.
      </p>

      <H2 id="four" text="The four line kinds" />
      <CompareTable
        caption="What a line in a diff can be, and where a comment may attach"
        head={["In the diff", "Means", "`line`", "`original_line`", "Comment on"]}
        rows={[
          ["` a line`", "unchanged context", "new-side number", "old-side number", "RIGHT or LEFT"],
          ["`+a line`", "added", "new-side number", "—", "RIGHT"],
          ["`-a line`", "removed", "—", "old-side number", "LEFT"],
          ["`\\ No newline…`", "a directive", "—", "—", "neither"],
        ]}
      />
      <p>
        The fourth row is the one that produces a bug you cannot see. Count that marker as
        a line and every subsequent line number in the file shifts by one, so every comment
        after it attaches to{" "}
        <em>the line below the one you meant</em>. GitHub accepts them all. A human reads a
        confident, specific, wrong comment and concludes the reviewer is broken.
      </p>

      <H2 id="parsing" text="Parsing a hunk" />
      <CodeBlock
        label="pr-owl/lib/diff.ts"
        code={`const HUNK_RE = /^@@ -(\\d+)(?:,(\\d+))? \\+(\\d+)(?:,(\\d+))? @@(.*)$/;

for (const content of bodyLines) {
  const m = HUNK_RE.exec(content);
  if (m) {
    oldNo = Number(m[1]);
    newNo = Number(m[3]);
    current = { oldStart: oldNo, newStart: newNo, lines: [], /* ... */ };
    hunks.push(current);
    continue;
  }
  if (!current) continue;

  // A directive about the PREVIOUS line, not a line of its own.
  if (NO_NEWLINE.test(content)) {
    const prev = current.lines[current.lines.length - 1];
    if (prev) prev.content += \` \${content}\`;
    continue;
  }

  const marker = content[0];
  const rest = content.slice(1);
  if (marker === '+') {
    current.lines.push({ content, type: 'add', line: newNo++, originalLine: null });
  } else if (marker === '-') {
    current.lines.push({ content, type: 'del', line: null, originalLine: oldNo++ });
  } else if (marker === ' ') {
    current.lines.push({ content, type: 'context', line: newNo++, originalLine: oldNo++ });
  } else {
    // Unknown marker: metadata, and do NOT advance either counter. Guessing
    // here desynchronises every remaining line in the file.
    current.lines.push({ content, type: 'meta', line: null, originalLine: null });
  }
}`}
      />
      <p>
        Three decisions in that loop, each of which is a bug if you get it wrong.
      </p>
      <ul className="space-y-2.5 pl-5 text-muted">
        <li>
          <strong className="text-paper">Counters are seeded from the hunk header</strong>,
          not assumed to start at 1. A diff whose header is wrong must not silently
          renumber everything after it.
        </li>
        <li>
          <strong className="text-paper">An unknown marker advances nothing.</strong> The
          tempting move is to treat it as context and increment; the correct move is to
          record it as metadata and leave both counters alone, because there is no way to
          know which side it belongs to.
        </li>
        <li>
          <strong className="text-paper">The no-newline marker is appended to the previous
          line</strong> and given no number, so it cannot shift anything.
        </li>
      </ul>

      <H2 id="bug" text="The bug this file had" />
      <p>
        The first version of{" "}
        <code className="font-mono text-[13px]">commentablePositions</code> looked like this,
        and it is worth showing because the mistake is so natural:
      </p>
      <CodeBlock
        label="the wrong version"
        code={`for (const l of h.lines) {
  if (l.line != null) out.push({ line: l.line, side: 'RIGHT' });
  else if (l.originalLine != null) out.push({ line: l.originalLine, side: 'LEFT' });
}`}
      />
      <p>
        A context line has <em>both</em> numbers, so{" "}
        <code className="font-mono text-[13px]">else if</code> means only its right-side
        position is ever offered. Every left-side comment on unchanged code became
        unreachable — and nothing looked broken. The reviewer simply could not comment on
        the left of an unchanged line, which is exactly the position you want when a
        deletion sits next to it.
      </p>
      <CodeBlock
        label="the fixed version, in pr-owl/lib/diff.ts"
        code={`for (const l of h.lines) {
  // NOT \`else if\`. A context line exists on both sides, so BOTH positions are
  // legal; an added line has only a right position; a removed line has only a
  // left one.
  if (l.line != null) out.push({ line: l.line, side: 'RIGHT' });
  if (l.originalLine != null) out.push({ line: l.originalLine, side: 'LEFT' });
}`}
      />
      <Callout title="It is unreachable, not wrong, which is the dangerous part">
        <p>
          A parser that returns wrong line numbers produces comments on the wrong lines, and
          someone notices. A parser that returns{" "}
          <em>fewer</em> positions than it should produces a reviewer that quietly cannot do
          something, and nobody notices — because the output looks reasonable and the missing
          comments are indistinguishable from &ldquo;nothing to say&rdquo;.
        </p>
      </Callout>

      <H2 id="paths" text="Paths, and a second bug" />
      <CodeBlock
        label="pr-owl/lib/diff.ts"
        code={`function stripPrefix(p: string): string {
  let out = p;
  // git emits quoted paths containing spaces or non-ASCII, wrapped in double
  // quotes. Unquote FIRST: a quoted path begins with \`"\`, so stripping the
  // a/ or b/ prefix before removing the quotes silently does nothing and
  // leaves \`b/\` glued to the filename.
  if (out.startsWith('"') && out.endsWith('"') && out.length >= 2) {
    try { out = JSON.parse(out) as string; } catch { /* leave as-is */ }
  }
  return out.replace(/^[ab]\\//, '');
}`}
      />
      <p>
        The order is the bug. Written the natural way — strip the prefix, then unquote — a
        path like{" "}
        <code className="font-mono text-[13px]">&quot;b/src/my file.js&quot;</code>{" "}
        becomes <code className="font-mono text-[13px]">b/src/my file.js</code> with the
        prefix intact, GitHub cannot match the path, and every comment on that file is
        rejected.
      </p>
      <p>
        The same function detects the three status cases:{" "}
        <code className="font-mono text-[13px]">/dev/null</code> on the{" "}
        <code className="font-mono text-[13px]">+</code> side means added,{" "}
        <code className="font-mono text-[13px]">/dev/null</code> on the{" "}
        <code className="font-mono text-[13px]">-</code> side means deleted, and
        differing paths mean renamed — where the old path has to be recorded separately,
        because GitHub will not accept a comment on a renamed file that refers to a side the
        reviewer is no longer editing.
      </p>

      <H2 id="validate" text="Validating before posting" />
      <CodeBlock
        label="pr-owl/lib/review.ts"
        code={`    const file = byPath.get(path);
    if (!file) { dropped.push({ path, line, reason: 'file is not in the diff' }); continue; }

    const side: 'RIGHT' | 'LEFT' = item?.side === 'LEFT' ? 'LEFT' : 'RIGHT';
    if (!commentablePositions(file).some((p) => p.line === line && p.side === side)) {
      dropped.push({ path, line, reason: \`line \${line} (\${side}) is outside the diff's hunks\` });
      continue;
    }
    findings.push({ path, line, side, severity, message: message.slice(0, 2000) });`}
      />
      <p>
        Every finding is checked against the parsed diff before it goes anywhere. The
        dropped ones are counted and reported on the check run, so a parsing bug shows up as
        &ldquo;14 findings dropped as unplaceable&rdquo; rather than as a review that
        mysteriously got shorter.
      </p>

      <H2 id="testing" text="Eighteen tests" />
      <CodeBlock
        label="pr-owl/__tests__/diff.test.ts"
        code={`it('does not count a "no newline" marker as a line', () => {
  const patch = \`--- a/f.txt
+++ b/f.txt
@@ -1,2 +1,2 @@
 one
-two
+2
\\\\ No newline at end of file
\`;
  const f = parseFileDiff(patch)!;
  for (const l of f.hunks[0].lines) {
    assert.notEqual(l.line, 3, 'no line was invented for the marker');
  }
});

it('accepts a context line on either side', () => {
  const f = parseFileDiff(SIMPLE)!;
  assert.equal(isCommentable(f, 1, 'RIGHT'), true);
  assert.equal(isCommentable(f, 1, 'LEFT'), true);
});`}
      />
      <p>
        One of these tests was wrong when first written and the code was right — I asserted
        that left line 3 was not commentable, when it is in fact a context line. That is
        worth mentioning rather than hiding: a test that encodes a wrong belief about the
        format produces a confident red test, and the temptation is to change the code. The
        discipline that helps is to write down what the fixture{" "}
        <em>means</em> before asserting what it should do.
      </p>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "Why not use the `diff` package Sentinel already depends on?",
            a: "Because that package parses and applies patches; it does not model GitHub's review API, whose constraint is unusual — positions are relative to the diff's hunks, not to the file. You would still have to walk the hunks and decide, for each line, whether it exists on the left, the right, both or neither. That walk is the whole of this part, and it is about 40 lines.",
          },
          {
            q: "What is the difference between `line` and `start_line`?",
            a: "`line` is a single line and `start_line`/`start_side` mark a range for a multi-line comment. PR Owl does not use ranges: an inline comment covering five lines is much harder for a reviewer to read as one observation, and it is another position that can be wrong. One finding, one line.",
          },
          {
            q: "Why validate locally when GitHub will reject a bad position anyway?",
            a: "Because GitHub rejects the whole review, not the bad comment. Three correct findings die with one hallucinated line number, and the model cannot tell you which one it got wrong — you just get a 422 and no review. Filtering locally means a partially-wrong response still produces a useful review, and the drops get reported on the check run.",
          },
          {
            q: "What about files where GitHub sends no patch at all?",
            a: "Three different reasons all arrive as an absent `patch`: binary files, diffs past GitHub's size cap, and a branch more than 300 commits diverged. In all three there is nothing to attach a line comment to, so those files are reviewed as prose and contribute no inline findings. `parseFileDiff` returns null for them and the caller moves on.",
          },
        ]}
      />

      <Cta
        title="Next: posting it"
        body="Part 10 submits the review, chooses COMMENT or REQUEST_CHANGES, and reports the drops on a check run."
        href="/blog/pr-owl-post-the-review"
        cta="Start part 10"
      />

      <p className="text-sm text-muted">
        Validating before acting is the same discipline as{" "}
        <Link href="/blog/risk-ledger-command-shapes" className="text-moss underline-offset-4 hover:underline">
          the risk ledger
        </Link>
        , and the &ldquo;silent under-firing is worse than a crash&rdquo; argument is made in{" "}
        <Link href="/blog/evaluate-coding-agent" className="text-moss underline-offset-4 hover:underline">
          evaluating a coding agent
        </Link>
        .
      </p>
    </>
  ),
} satisfies Post;

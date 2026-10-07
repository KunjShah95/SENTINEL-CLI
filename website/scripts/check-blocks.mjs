#!/usr/bin/env node
/**
 * Post authoring guard.
 *
 * Course posts are `.tsx` files whose body is mostly a template literal of
 * markdown. Two authoring mistakes produce a file that COMPILES and renders
 * almost correctly, which is the worst kind of bug to ship:
 *
 *   1. A backtick escaped as `\`` inside a `code={`...`}` block whose closing
 *      delimiter is also `\``. The terminator stops being a terminator, the
 *      template swallows the rest of the file, and the rendered page quietly
 *      loses its footers — or the build fails with an error pointing at a line
 *      that has nothing to wrong with it.
 *
 *   2. An unescaped `{` in JSX text. `<p>a { b } c</p>` is a JSX expression,
 *      not text, and `buildTask(x, [1])` in prose becomes a syntax error or,
 *      worse, a silent interpolation.
 *
 * This catches (1) exactly and (2) only where it is unambiguous — a brace in JSX
 * text that is not part of a known JSX tag. It cannot be exhaustive, and claims
 * otherwise would be worse than the check.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "content", "posts");

/**
 * A JSX attribute whose value is a template literal opens with `={` and closes
 * with `}`. That is `code={`...`}` in a post, but also `className={`...`}`, and
 * both have to balance or the file is malformed.
 */
const OPEN = "={`";
const CLOSE = "`}";

const problems = [];

for (const entry of readdirSync(dir)) {
  if (!entry.endsWith(".tsx")) continue;
  const file = join(dir, entry);
  const lines = readFileSync(file, "utf8").split("\n");

  // (1) Fence balance, per CodeBlock.
  let fences = 0;
  lines.forEach((line, i) => {
    const opens = line.split(OPEN).length - 1;
    const closes = line.split(CLOSE).length - 1;
    fences += opens;
    fences -= closes;
    if (fences < 0) {
      problems.push({ file: entry, line: i + 1, msg: "closing fence with no opening fence" });
      fences = 0;
    }
  });
  if (fences !== 0) {
    problems.push({
      file: entry,
      line: lines.length,
      msg: `${fences} unclosed \`code={\` block(s) — a \`\\}\` terminator was probably escaped as \`\\\}\``,
    });
  }

  // (2) A JSX brace in prose. Only inside a line that is clearly JSX (starts
  // with a tag) and only when the brace is not part of an attribute, an
  // expression container or an interpolation we already emit.
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!/^<[A-Za-z]/.test(trimmed)) return;
    // Strip every `{...}` that is balanced and looks like code.
    const withoutCode = trimmed.replace(/\{[^}]*\}/g, "");
    // A surviving bare `{` is a prose brace that JSX will try to evaluate.
    const bare = withoutCode.match(/\{/);
    if (bare) {
      problems.push({
        file: entry,
        line: i + 1,
        msg: "unbalanced `{` in JSX text — write `{'{`'}` instead",
      });
    }
  });
}

if (problems.length) {
  for (const p of problems) {
    console.error(`${p.file}:${p.line}  ${p.msg}`);
  }
  console.error(`\n${problems.length} post authoring problem(s).`);
  process.exit(1);
}

console.log(`check-blocks: ${readdirSync(dir).filter((f) => f.endsWith(".tsx")).length} posts OK`);

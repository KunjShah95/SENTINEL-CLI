/**
 * Unified diff parsing — the same four line kinds PR Owl depends on, moved
 * here so the reviewer is a Sentinel feature rather than a Next.js app.
 *
 * This exists because a finding has to point at a real line, and the difference
 * between "points at a line" and "points at a line number" is the difference
 * between a review a person can act on and a review they have to re-derive.
 *
 * A line in a diff exists four ways, and conflating any two of them is the bug
 * this module exists to prevent:
 *
 *   context   present in both old and new   -> a line on both sides
 *   added     only in new                   -> a line on the right only
 *   removed   only in old                   -> a line on the left only
 *   directive `\ No newline at end of file` -> NEITHER, it is not a line at all
 *
 * The fourth is the one that produces output which looks correct. Count it as a
 * line and every subsequent number in the file shifts by one: a finding on line
 * 42 lands on line 43, is specific, is confidently wrong, and costs a human
 * fifteen seconds to discover.
 *
 * The one that produces a silent capability loss is the `else if`. A context
 * line has both numbers, so treating the left side as a fallback makes
 * left-side findings on unchanged code impossible to express.
 */

/** @typedef {'context'|'add'|'del'|'meta'} LineType */

/**
 * @typedef {object} DiffLine
 * @property {string} content   the literal line, including its marker
 * @property {LineType} type
 * @property {number|null} line          1-based, right side (new file)
 * @property {number|null} originalLine  1-based, left side (old file)
 */

/**
 * @typedef {object} Hunk
 * @property {number} oldStart
 * @property {number} newStart
 * @property {string} heading
 * @property {DiffLine[]} lines
 */

/**
 * @typedef {object} FileDiff
 * @property {string} path
 * @property {string|null} previousPath
 * @property {'added'|'modified'|'deleted'|'renamed'} status
 * @property {number} additions
 * @property {number} deletions
 * @property {Hunk[]} hunks
 * @property {boolean} truncated
 */

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;
const NO_NEWLINE = /^\\ No newline at end of file/;

/**
 * Parse one file's unified diff. Returns null when there is nothing to point at.
 *
 * @param {string|null|undefined} raw
 * @returns {FileDiff|null}
 */
export function parseFileDiff(raw) {
  if (!raw || !raw.trim()) return null;

  // `---` and `+++` are separate lines in a real patch, but tooling that
  // concatenates them is common enough that the header is scanned for rather
  // than indexed by position.
  const allLines = raw.split('\n');
  /** @type {string|null} */
  let minusRaw = null;
  /** @type {string|null} */
  let plusRaw = null;
  let bodyStart = 0;

  for (let i = 0; i < allLines.length && i < 10; i++) {
    const line = allLines[i];
    if (minusRaw === null && line.startsWith('--- ')) {
      minusRaw = line.slice(4).trim();
      bodyStart = i + 1;
      continue;
    }
    if (plusRaw === null && line.startsWith('+++ ')) {
      plusRaw = line.slice(4).trim();
      bodyStart = i + 1;
      break;
    }
  }

  const header = parseHeaderPaths(minusRaw, plusRaw);
  if (!header) return null;

  /** @type {Hunk[]} */
  const hunks = [];
  /** @type {Hunk|null} */
  let current = null;
  // Seeded from the hunk header and then incremented per line, rather than
  // assumed: a diff whose @@ header lies must not silently renumber the file.
  let oldNo = 0;
  let newNo = 0;

  const bodyLines = allLines.slice(bodyStart);
  for (let i = 0; i < bodyLines.length; i++) {
    const content = bodyLines[i];
    const m = HUNK_RE.exec(content);
    if (m) {
      oldNo = Number(m[1]);
      newNo = Number(m[3]);
      current = {
        oldStart: oldNo,
        newStart: newNo,
        heading: content,
        lines: [],
      };
      hunks.push(current);
      continue;
    }
    if (!current) continue;

    // A directive about the PREVIOUS line. Appending it keeps it out of the
    // line numbering entirely, which is the whole point.
    if (NO_NEWLINE.test(content)) {
      const prev = current.lines[current.lines.length - 1];
      if (prev) prev.content += ` ${content}`;
      continue;
    }

    if (content === '' || content.startsWith('diff ') || content.startsWith('index ')) {
      // git emits one trailing '' after the final newline. A bare '' anywhere
      // else inside a hunk is a context line for an empty source line, and it
      // does occupy a line number on both sides.
      const isTrailingBlank = content === '' && i === bodyLines.length - 1;
      if (content === '' && !isTrailingBlank) {
        current.lines.push({ content: '', type: 'context', line: newNo++, originalLine: oldNo++ });
        continue;
      }
      continue;
    }

    const marker = content[0];
    if (marker === '+') {
      current.lines.push({ content, type: 'add', line: newNo++, originalLine: null });
    } else if (marker === '-') {
      current.lines.push({ content, type: 'del', line: null, originalLine: oldNo++ });
    } else if (marker === ' ') {
      current.lines.push({ content, type: 'context', line: newNo++, originalLine: oldNo++ });
    } else {
      // Unknown marker: metadata, and advance NEITHER counter. Guessing which
      // side it belongs to desynchronises every remaining line in the file.
      current.lines.push({ content, type: 'meta', line: null, originalLine: null });
    }
  }

  return {
    path: header.path,
    previousPath: header.previousPath,
    status: header.status,
    additions: countType(hunks, 'add'),
    deletions: countType(hunks, 'del'),
    hunks,
    truncated: hunks.length === 0,
  };
}

function countType(hunks, type) {
  let n = 0;
  for (const h of hunks) for (const l of h.lines) if (l.type === type) n++;
  return n;
}

function parseHeaderPaths(minusRaw, plusRaw) {
  if (!plusRaw) return null;
  const path = stripPrefix(plusRaw);
  const oldPath = minusRaw === null ? null : stripPrefix(minusRaw);

  if (path === '/dev/null') return { path: oldPath || '', previousPath: null, status: 'added' };
  if (oldPath === '/dev/null') return { path, previousPath: null, status: 'added' };
  if (path !== oldPath) return { path, previousPath: oldPath, status: 'renamed' };
  return { path, previousPath: null, status: 'modified' };
}

function stripPrefix(p) {
  let out = p;
  // git emits quoted paths containing spaces or non-ASCII, wrapped in double
  // quotes with C-style escapes. Unquote FIRST: a quoted path begins with `"`,
  // so stripping the a/ or b/ prefix before removing the quotes silently does
  // nothing and leaves `b/` glued to the filename.
  if (out.startsWith('"') && out.endsWith('"') && out.length >= 2) {
    try {
      out = JSON.parse(out);
    } catch {
      // Leave as-is. A finding on an unmatched path is visible; throwing here
      // would take down a whole review for one odd filename.
    }
  }
  return out.replace(/^[ab]\//, '');
}

/**
 * Every position a finding may legitimately point at.
 *
 * Two independent `if`s, not `else if`. A context line has both numbers, so
 * both positions are real; an added line has only a right number; a removed
 * line has only a left one. Collapsing context to a single side does not produce
 * wrong answers — it produces fewer answers, which is harder to notice.
 *
 * @param {FileDiff} file
 * @returns {Array<{ line: number, side: 'RIGHT'|'LEFT' }>}
 */
export function commentablePositions(file) {
  const out = [];
  for (const h of file.hunks) {
    for (const l of h.lines) {
      if (l.line != null) out.push({ line: l.line, side: 'RIGHT' });
      if (l.originalLine != null) out.push({ line: l.originalLine, side: 'LEFT' });
    }
  }
  return out;
}

/** Can a finding be attached here? Checked before a finding is reported, not after. */
export function isPointable(file, line, side) {
  return commentablePositions(file).some((p) => p.line === line && p.side === side);
}

/** The source of a file on one side of the diff, reconstructed from the hunks. */
export function fileText(file, side) {
  const out = [];
  for (const h of file.hunks) {
    for (const l of h.lines) {
      if (l.type === 'meta') continue;
      const keep =
        side === 'RIGHT' ? l.type === 'add' || l.type === 'context' : l.type === 'del' || l.type === 'context';
      if (keep) out.push(l.content.slice(1));
    }
  }
  return out.join('\n');
}

/** Parse many patches, skipping anything unparseable rather than throwing. */
export function parsePatches(patches) {
  return (patches || []).map((p) => parseFileDiff(p)).filter(Boolean);
}

/** Total changed lines across parsed files — the input to a review's cost cap. */
export function diffSize(files) {
  let additions = 0;
  let deletions = 0;
  for (const f of files) {
    additions += f.additions;
    deletions += f.deletions;
  }
  return {
    fileCount: (files || []).length,
    additions,
    deletions,
    total: additions + deletions,
  };
}

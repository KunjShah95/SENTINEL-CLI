/**
 * Line/byte-bounded truncation (ported from pi-mono coding-agent
 * core/tools/truncate.ts). Whichever limit hits first wins; never returns
 * partial lines.
 *
 * truncateHead keeps the beginning (file reads). truncateTail keeps the end
 * (shell output: errors and test summaries land at the bottom — slicing
 * from the start throws away exactly the part the model needs).
 */
export const DEFAULT_MAX_LINES = 2000;
export const DEFAULT_MAX_BYTES = 50 * 1024;

function splitLines(content) {
  if (!content) return [];
  const lines = content.split('\n');
  if (content.endsWith('\n')) lines.pop();
  return lines;
}

const bytes = (s) => Buffer.byteLength(s, 'utf8');

function finish(kept, lines, content, truncatedBy, { maxLines, maxBytes }) {
  const out = kept.join('\n');
  return {
    content: out,
    truncated: truncatedBy !== null,
    truncatedBy,
    totalLines: lines.length,
    totalBytes: bytes(content),
    outputLines: kept.length,
    outputBytes: bytes(out),
    maxLines,
    maxBytes,
  };
}

export function truncateHead(content = '', opts = {}) {
  const maxLines = opts.maxLines ?? DEFAULT_MAX_LINES;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const lines = splitLines(content);
  const kept = [];
  let size = 0;
  let by = null;
  for (const line of lines) {
    if (kept.length >= maxLines) { by = 'lines'; break; }
    const add = bytes(line) + (kept.length ? 1 : 0);
    if (size + add > maxBytes) { by = 'bytes'; break; }
    kept.push(line);
    size += add;
  }
  return finish(kept, lines, content, by, { maxLines, maxBytes });
}

export function truncateTail(content = '', opts = {}) {
  const maxLines = opts.maxLines ?? DEFAULT_MAX_LINES;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const lines = splitLines(content);
  const kept = [];
  let size = 0;
  let by = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (kept.length >= maxLines) { by = 'lines'; break; }
    const add = bytes(lines[i]) + (kept.length ? 1 : 0);
    if (size + add > maxBytes) {
      by = 'bytes';
      // A single giant last line: keep its tail rather than nothing.
      if (kept.length === 0) kept.unshift(lines[i].slice(-maxBytes));
      break;
    }
    kept.unshift(lines[i]);
    size += add;
  }
  return finish(kept, lines, content, by, { maxLines, maxBytes });
}

/** Tail-truncate and prefix a marker the model can read. */
export function tailWithNotice(content, maxBytes) {
  const r = truncateTail(content || '', { maxBytes });
  if (!r.truncated) return r.content;
  return `[... ${r.totalLines - r.outputLines} earlier line(s) omitted; showing last ${r.outputLines}]\n${r.content}`;
}

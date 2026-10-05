/**
 * tui-scroll — the scrolling transcript viewport and the capped composer.
 *
 * Scroll position is computed from the real laid-out height Ink reports for each
 * box, so these assert against an actual rendered frame rather than a mock.
 *
 * Run with: node --import tsx --test __tests__/tui-scroll.test.mjs
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { Box, Text, render } from 'ink';
import { Writable, PassThrough } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TranscriptViewport } from '../src/tui/components/transcript-viewport.tsx';
import { PromptInput } from '../src/tui/components/prompt-input.tsx';
import { ThemeProvider } from '../src/tui/providers/theme/index.tsx';

const h = React.createElement;

class FakeStdout extends Writable {
  constructor(columns, rows) {
    super();
    this.isTTY = true;
    this.columns = columns;
    this.rows = rows;
    this.out = '';
    this.decoder = new StringDecoder('utf8');
  }
  _write(chunk, _enc, cb) {
    this.out += this.decoder.write(chunk);
    cb();
  }
}

class FakeStdin extends PassThrough {
  isTTY = true;
  setRawMode() { return this; }
  ref() { return this; }
  unref() { return this; }
}

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}

async function frameOf(element, { columns = 60, rows = 20 } = {}) {
  const stdout = new FakeStdout(columns, rows);
  const stdin = new FakeStdin();
  const inst = render(element, {
    stdout,
    stdin,
    interactive: false,
    patchConsole: false,
    exitOnCtrlC: false,
  });
  await new Promise((r) => setTimeout(r, 250));
  inst.unmount();
  return stripAnsi(stdout.out.replace(/\n+$/, ''));
}

let tmp;
let savedCwd;

before(() => {
  savedCwd = process.cwd();
  tmp = mkdtempSync(join(tmpdir(), 'sentinel-scroll-'));
  process.chdir(tmp);
});

after(() => {
  process.chdir(savedCwd);
  rmSync(tmp, { recursive: true, force: true });
});

/** N numbered lines, tall enough that a 20-row viewport cannot show them all. */
function tallTranscript(count) {
  return Array.from({ length: count }, (_, i) => h(Text, { key: i }, `line-${String(i + 1).padStart(3, '0')}`));
}

function viewport(children, scrollFromBottom, rows = 20) {
  return h(
    Box,
    { flexDirection: 'column', height: rows, width: 60 },
    h(TranscriptViewport, { scrollFromBottom }, children)
  );
}

describe('transcript viewport', () => {
  it('follows the tail when not scrolled', async () => {
    const frame = await frameOf(viewport(tallTranscript(200), 0));
    assert.match(frame, /line-200/, 'the newest line is visible');
    assert.ok(!/line-001/.test(frame), 'the top is not visible when following');
  });

  it('shows a mid window when scrolled up', async () => {
    const frame = await frameOf(viewport(tallTranscript(200), 100));
    // 200 lines of content, a 20-row viewport: scrolling up 100 lines from the
    // tail moves the window up exactly 100 lines, so the first visible line is 81.
    assert.match(frame, /line-081/, 'the requested window is visible');
    assert.ok(!/line-200/.test(frame), 'the tail is out of view');
    assert.ok(!/line-001/.test(frame), 'still not at the top');
  });

  it('clamps to the top rather than running off the start', async () => {
    const frame = await frameOf(viewport(tallTranscript(200), 100000));
    assert.match(frame, /line-001/, 'clamped to the first line');
    assert.ok(!/line-021/.test(frame), 'stops at the top instead of scrolling into nothing');
  });

  it('never exceeds the viewport height', async () => {
    const frame = await frameOf(viewport(tallTranscript(300), 0));
    const lines = frame.split('\n').filter((l) => l.trim().length > 0);
    assert.ok(lines.length <= 20, `fits the viewport: ${lines.length} lines`);
  });

  it('shows everything when the content fits', async () => {
    const frame = await frameOf(viewport(tallTranscript(5), 0));
    assert.match(frame, /line-001/);
    assert.match(frame, /line-005/);
  });
});

describe('composer height cap', () => {
  const manyLines = Array.from({ length: 20 }, (_, i) => `row ${i + 1}`).join('\n');

  it('windows a long prompt and says how much is hidden', async () => {
    const frame = await frameOf(
      h(ThemeProvider, null, h(PromptInput, {
        value: manyLines,
        onChange: () => {},
        onSubmit: () => {},
        maxVisibleLines: 4,
      })),
      { columns: 60, rows: 30 }
    );
    assert.match(frame, /more lines?/, 'reports hidden lines');
    // The caret sits at the end of the buffer, so the window is near the bottom.
    assert.match(frame, /row 20/);
    assert.ok(!/row 1\b/.test(frame), 'the first row is scrolled out of the composer');
  });

  it('leaves a short prompt untouched', async () => {
    const frame = await frameOf(
      h(ThemeProvider, null, h(PromptInput, {
        value: 'one\ntwo',
        onChange: () => {},
        onSubmit: () => {},
        maxVisibleLines: 8,
      })),
      { columns: 60, rows: 30 }
    );
    assert.match(frame, /one/);
    assert.match(frame, /two/);
    assert.ok(!/more lines?/.test(frame), 'no hidden-line notice below the cap');
  });
});

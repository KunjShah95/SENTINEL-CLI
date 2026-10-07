/**
 * tui-flicker — the composer must not repaint the terminal while you type.
 *
 * The bug these lock down: every keystroke produced two React renders, and each
 * render was written as `ESC[2J ESC[3J ESC[H` + the entire ~30-row frame. Two
 * full-screen wipes and two full repaints per character — the flicker — plus
 * `ESC[3J` destroyed the terminal scrollback on every keystroke.
 *
 * Three causes, one per assertion:
 *   1. the app root was pinned to the full terminal height, which is exactly
 *      Ink's "fullscreen" threshold, and Ink's fullscreen path on Windows
 *      wipes the screen before every frame;
 *   2. Ink's default writer erases and rewrites the whole frame instead of
 *      diffing the lines that changed;
 *   3. `InputBar`'s slash-suggestion effect handed React a fresh array on every
 *      keystroke, so the composer rendered twice per character.
 *
 * Run with: node --import tsx --test __tests__/tui-flicker.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render } from 'ink';
import { Writable, PassThrough } from 'node:stream';
import { App, RENDER_OPTIONS } from '../src/tui/app.tsx';
import { frameSize } from '../src/tui/components/oc/overlay.tsx';
import { InputBar } from '../src/tui/components/input-bar.tsx';
import { ThemeProvider } from '../src/tui/providers/theme/index.tsx';

const h = React.createElement;

/** clearTerminal: erases the screen AND the scrollback. Must never appear. */
const CLEAR_SCREEN = '\x1b[2J';

class FakeStdout extends Writable {
  constructor(columns, rows) {
    super();
    this.isTTY = true;
    this.columns = columns;
    this.rows = rows;
    this.chunks = [];
  }
  _write(chunk, _enc, cb) {
    this.chunks.push(Buffer.from(chunk));
    cb();
  }
  /** Everything written since the last `take()`, as one string. */
  take() {
    const text = this.chunks.map((c) => c.toString('utf8')).join('');
    this.chunks = [];
    return text;
  }
}

class FakeStdin extends PassThrough {
  isTTY = true;
  setRawMode() { return this; }
  ref() { return this; }
  unref() { return this; }
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Mount a tree the way the app mounts it and report what each keystroke cost.
 * `interactive: true` is required: the repaint paths under test are skipped in
 * non-interactive mode.
 */
async function mount(element, { columns = 100, rows = 30 } = {}) {
  const stdout = new FakeStdout(columns, rows);
  const stdin = new FakeStdin();
  let renders = 0;
  const inst = render(element, {
    stdout,
    stdin,
    interactive: true,
    patchConsole: false,
    exitOnCtrlC: false,
    onRender: () => { renders++; },
    ...RENDER_OPTIONS,
  });
  await delay(600);          // let first-run discovery and layout settle
  stdout.take();             // ignore mount traffic
  renders = 0;
  return {
    async type(text) {
      let out = '';
      for (const ch of text) {
        stdin.write(ch);
        await delay(150);
        out += stdout.take();
      }
      return { bytes: Buffer.byteLength(out), renders, clears: out.split(CLEAR_SCREEN).length - 1 };
    },
    unmount: () => inst.unmount(),
  };
}

describe('frame size stays clear of Ink’s fullscreen threshold', () => {
  it('leaves the bottom terminal row to the terminal', () => {
    assert.deepEqual(frameSize(30, 100), { rows: 29, columns: 100 });
    assert.deepEqual(frameSize(24), { rows: 23, columns: 80 });
    // A non-TTY stream has no `rows`; 23 is still under the 24-row default.
    assert.equal(frameSize(undefined, 100).rows, 23);
    // A degenerate size must not produce a zero-height frame.
    assert.ok(frameSize(1).rows >= 1);
    assert.ok(frameSize(0).rows >= 1);
  });
});

describe('typing does not repaint the terminal', () => {
  it('writes a diff, not a full-screen clear plus the whole frame', async () => {
    const app = await mount(h(App));
    try {
      const { bytes, clears } = await app.type('hello');
      assert.equal(clears, 0, `a keystroke must never wipe the screen (${clears} clears)`);
      // A full frame of this app is ~2.3KB. Five characters must cost a small
      // fraction of that; the measured diff is ~250 bytes per character.
      assert.ok(bytes < 5 * 1500, `5 keystrokes wrote ${bytes} bytes — too much for a line diff`);
    } finally {
      app.unmount();
    }
  });

  it('renders once per keystroke, not twice', async () => {
    const bar = await mount(h(ThemeProvider, null, h(InputBar, { onSubmit: () => {} })));
    try {
      const { renders } = await bar.type('abcdefgh');
      assert.equal(renders, 8, `8 keystrokes must render 8 times, got ${renders}`);
    } finally {
      bar.unmount();
    }
  });
});

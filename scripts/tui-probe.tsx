/**
 * tui-probe — render the REAL TUI headlessly and print the final frame.
 *
 * Ink needs a TTY; this fakes stdin/stdout and runs in Ink's non-interactive
 * mode, which writes exactly one full frame at unmount. That frame is what a
 * user sees, with no ANSI parsing guesswork.
 *
 *   npx tsx --tsconfig src/tui/tsconfig.json scripts/tui-probe.tsx
 *   KEYS='/setup|\r' COLS=90 ROWS=28 npx tsx ...
 *
 * Keys are separated by '|', with a delay between them. Escape codes are
 * written literally: \x10 = ctrl+p, \x1b = escape, \t = tab, \r = enter.
 */
import React from 'react';
import { render } from 'ink';
import { Writable, PassThrough } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { App } from '../src/tui/app.js';

class FakeStdout extends Writable {
  isTTY = true;
  columns = Number(process.env.COLS || 100);
  rows = Number(process.env.ROWS || 40);
  out = '';
  private decoder = new StringDecoder('utf8');
  _write(chunk: unknown, _enc: string, cb: () => void) {
    this.out += this.decoder.write(chunk as Buffer);
    cb();
  }
}

class FakeStdin extends PassThrough {
  isTTY = true;
  setRawMode() {
    return this;
  }
  ref() {
    return this;
  }
  unref() {
    return this;
  }
}

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
const stdout = new FakeStdout();
const stdin = new FakeStdin();

const inst = render(<App />, {
  stdout: stdout as unknown as NodeJS.WriteStream,
  stdin: stdin as unknown as NodeJS.ReadStream,
  interactive: false,
  patchConsole: false,
  exitOnCtrlC: false,
});

// Give first-run discovery/effects a moment to settle.
await delay(3000);

const keys = (process.env.KEYS || '').split('|').filter((s) => s.length > 0);
for (const k of keys) {
  stdin.write(
    k.replace(/\\x([0-9a-fA-F]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
  );
  await delay(700);
}

// Extra settle window after the last key, for surfaces that fetch on open —
// the model picker pulls the provider catalog, which is not instant.
await delay(Number(process.env.SETTLE || 0));

inst.unmount();

process.stdout.write(`===== FRAME (${stdout.columns}x${stdout.rows}` +
  (keys.length ? ` after keys ${JSON.stringify(keys)}` : '') + ') =====\n');
const frame = stdout.out.replace(/\n+$/, '');
const bad = [...frame].filter((ch) => ch === '\uFFFD').length;
process.stdout.write(`[debug] U+FFFD count=${bad} maxLineWidth=${Math.max(...frame.split('\n').map((l) => [...l].length))}\n`);
process.stdout.write(frame + '\n');
process.exit(0);

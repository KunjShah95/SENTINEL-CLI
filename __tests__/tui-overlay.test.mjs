/**
 * tui-overlay — regression tests for the modal/overlay layout.
 *
 * The bug these lock down: dialogs were rendered as a normal-flow sibling of
 * the session, so they were pushed below the app and off the terminal. On first
 * run the provider-setup dialog opened off-screen while the prompt was already
 * disabled, which looked exactly like a frozen app. Dialogs are now absolutely
 * positioned overlays sized to the terminal, and long lists window themselves.
 *
 * Written with createElement (no JSX) because this file is .mjs.
 * Run with: node --import tsx --test __tests__/tui-overlay.test.mjs
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import React, { useEffect } from 'react';
import { Text, render } from 'ink';
import { Writable, PassThrough } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Overlay, windowRange } from '../src/tui/components/oc/overlay.tsx';
import { ThemeProvider } from '../src/tui/providers/theme/index.tsx';
import { DialogProvider, useDialog } from '../src/tui/providers/dialog/index.tsx';
import { Viewport } from '../src/tui/app.tsx';
import { ProviderSetupDialog } from '../src/tui/components/dialogs/provider-setup.tsx';

const h = React.createElement;

const PROVIDER_ENV_KEYS = [
  'GROQ_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY',
  'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY', 'XAI_API_KEY', 'OPENROUTER_API_KEY',
  'TOGETHER_API_KEY', 'FIREWORKS_API_KEY', 'PERPLEXITY_API_KEY', 'GITHUB_TOKEN',
  'OLLAMA_HOST', 'LMSTUDIO_HOST',
];

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

const lineWidths = (frame) => frame.split('\n').map((l) => [...l].length);

/**
 * Render a tree headlessly and return the single frame Ink writes at unmount,
 * with escape codes stripped. No ANSI parsing guesswork.
 */
async function frameOf(element, { columns = 90, rows = 28 } = {}) {
  const stdout = new FakeStdout(columns, rows);
  const stdin = new FakeStdin();
  const inst = render(element, {
    stdout,
    stdin,
    interactive: false,
    patchConsole: false,
    exitOnCtrlC: false,
  });
  await new Promise((r) => setTimeout(r, 400));
  inst.unmount();
  return stripAnsi(stdout.out.replace(/\n+$/, ''));
}

let tmp;
let savedCwd;
let savedEnv;

before(() => {
  savedCwd = process.cwd();
  savedEnv = {};
  // Isolate from any real ~/.sentinel config and provider keys so "first run"
  // (no providers configured) is deterministic on every machine.
  tmp = mkdtempSync(join(tmpdir(), 'sentinel-tui-'));
  process.chdir(tmp);
  for (const k of [...PROVIDER_ENV_KEYS, 'XDG_CONFIG_HOME']) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  for (const k of ['HOME', 'USERPROFILE']) {
    savedEnv[k] = process.env[k];
    process.env[k] = tmp;
  }
  process.env.XDG_CONFIG_HOME = join(tmp, 'xdg');
});

after(() => {
  process.chdir(savedCwd);
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(tmp, { recursive: true, force: true });
});

describe('windowRange', () => {
  it('keeps the selection visible and clamps to the list bounds', () => {
    assert.deepEqual(windowRange(14, 0, 5), { start: 0, count: 5 });
    assert.deepEqual(windowRange(14, 13, 5), { start: 9, count: 5 });
    const mid = windowRange(14, 7, 5);
    assert.ok(mid.start <= 7 && mid.start + mid.count > 7, 'selection inside the window');
    assert.deepEqual(windowRange(3, 1, 10), { start: 0, count: 3 });
    assert.deepEqual(windowRange(0, 0, 5), { start: 0, count: 0 });
  });
});

describe('overlay chrome', () => {
  // The overlay is absolutely positioned, so it needs a sized parent to be
  // laid out against — in the app that parent is the pinned Viewport.
  const chrome = (props, body) =>
    h(
      ThemeProvider,
      null,
      h(Viewport, null, h(Text, null, 'app body'), h(Overlay, props, body))
    );

  it('renders the title, hint and body inside a panel', async () => {
    const frame = await frameOf(
      chrome({ title: 'AI Provider Setup', width: 72 }, h(Text, null, 'panel body'))
    );
    assert.match(frame, /AI Provider Setup/);
    assert.match(frame, /esc/);
    assert.match(frame, /panel body/);
    assert.match(frame, /\u256D/, 'panel has a border');
  });

  it('never draws wider than the terminal', async () => {
    const frame = await frameOf(chrome({ title: 'Wide', width: 400 }, h(Text, null, 'x')), {
      columns: 60,
      rows: 20,
    });
    assert.match(frame, /x/, 'something rendered');
    const max = Math.max(...lineWidths(frame));
    assert.ok(max <= 60, `frame fits: ${max} <= 60`);
  });
});

function OpenSetup() {
  const dialog = useDialog();
  const opened = React.useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    dialog.open({
      title: 'AI Provider Setup',
      width: 72,
      children: h(ProviderSetupDialog, { onComplete: () => {} }),
    });
  }, [dialog]);
  return null;
}

function setupTree() {
  return h(
    ThemeProvider,
    null,
    h(
      DialogProvider,
      null,
      h(Viewport, null, h(Text, null, 'session body')),
      h(OpenSetup)
    )
  );
}

describe('dialog is an overlay, not a sibling pushed below the app', () => {
  it('stays on screen and shows the provider names', async () => {
    const frame = await frameOf(setupTree(), { columns: 90, rows: 28 });
    const lines = frame.split('\n');

    // The regression: the dialog used to be appended after a full-height body,
    // so the page grew past the terminal and the dialog scrolled out of view.
    assert.ok(lines.length <= 28, `frame fits the terminal: ${lines.length} lines`);
    const max = Math.max(...lineWidths(frame));
    assert.ok(max <= 90, `frame fits the width: ${max} <= 90`);

    assert.match(frame, /AI Provider Setup/, 'dialog title is on screen');
    assert.match(frame, /Groq \(Free Tier\)/, 'provider names are visible, not clipped');
    assert.match(frame, /esc/, 'close hint is shown');
    // One title only: the overlay frames the dialog, so the dialog must not repeat it.
    assert.equal([...frame.matchAll(/AI Provider Setup/g)].length, 1);
    // The list windows itself instead of overflowing the panel.
    assert.match(frame, /\/14/, 'position indicator');
  });
});
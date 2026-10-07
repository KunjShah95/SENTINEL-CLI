/**
 * tui-keybinds — the opencode-compatible keybind layer and multi-line prompt.
 *
 * Run with: node --import tsx --test __tests__/tui-keybinds.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_KEYBINDS,
  chordOf,
  compileKeybinds,
  isInputAction,
  lookup,
  normalizeChord,
} from '../src/tui/keybinds.ts';
import { applyKey, lineCol, lineColToPos, lineEnd, lineStart } from '../src/tui/components/prompt-input.tsx';

describe('normalizeChord', () => {
  it('canonicalizes case, separators and modifier aliases', () => {
    assert.equal(normalizeChord('Ctrl+P'), 'ctrl+p');
    assert.equal(normalizeChord('CTRL-P'), 'ctrl+p');
    assert.equal(normalizeChord('cmd+k'), 'meta+k');
    assert.equal(normalizeChord('option+x'), 'alt+x');
    assert.equal(normalizeChord('  '), '');
  });
});

describe('chordOf', () => {
  it('maps navigation keys', () => {
    assert.equal(chordOf('', { upArrow: true }), 'up');
    assert.equal(chordOf('', { pageDown: true }), 'pagedown');
    assert.equal(chordOf('', { home: true }), 'home');
    assert.equal(chordOf('', { escape: true }), 'escape');
  });

  it('distinguishes shift+return from return — they mean different things', () => {
    // return submits; shift+return inserts a newline.
    assert.equal(chordOf('', { return: true }), 'return');
    assert.equal(chordOf('', { return: true, shift: true }), 'shift+return');
  });

  it('maps ctrl chords from the raw control character', () => {
    assert.equal(chordOf('\x10', {}), 'ctrl+p');
    assert.equal(chordOf('\x18', {}), 'ctrl+x');
    assert.equal(chordOf('\x0a', {}), 'ctrl+j');
    assert.equal(chordOf('ab', {}), null, 'multi-character input is not a chord');
  });

  it('maps Ink\'s ctrl+letter encoding, which is what arrives at runtime', () => {
    // Regression: Ink decodes ctrl+p into the bare letter plus key.ctrl, so a
    // parser that only understood the control byte left ctrl+p dead — and the
    // hand-built events in this file did not catch it.
    assert.equal(chordOf('p', { ctrl: true }), 'ctrl+p');
    assert.equal(chordOf('x', { ctrl: true }), 'ctrl+x');
    assert.equal(chordOf('M', { ctrl: true }), 'ctrl+m');
    assert.equal(chordOf('u', { ctrl: true }), 'ctrl+u');
  });

  it('treats a bare letter as a chord, because that is what <leader>x expands to', () => {
    // Regression: chordOf returned null here, so every leader chord was dead.
    assert.equal(chordOf('m', {}), 'm');
    assert.equal(chordOf('b', {}), 'b');
    assert.equal(chordOf('M', {}), 'm');
    assert.equal(chordOf('two', {}), null, 'multi-character input is not a chord');
  });
});

describe('compileKeybinds', () => {
  it('uses opencode defaults: leader ctrl+x, palette ctrl+p, escape interrupts', () => {
    const { leader, app } = compileKeybinds();
    assert.equal(leader, 'ctrl+x');
    assert.equal(app.get('ctrl+p'), 'command.palette.show');
    assert.equal(app.get('escape'), 'session.interrupt');
    assert.equal(app.get('ctrl+m'), undefined);
  });

  it('splits app and prompt tables so a chord can mean different things', () => {
    const { app, prompt } = compileKeybinds();
    // The regression this guards: in one flat table `return` was claimed by
    // whichever action compiled first, so submit and autocomplete fought over it.
    assert.equal(prompt.get('return'), 'input.submit');
    assert.equal(app.get('return'), undefined, 'the app never claims return');
    // prompt-owned editing must not leak into the app.
    assert.equal(prompt.get('ctrl+k'), 'input.delete.to.line.end');
    assert.equal(app.get('ctrl+k'), undefined);
  });

  it('expands <leader> chords onto the configured leader', () => {
    const { app } = compileKeybinds();
    assert.equal(app.get('ctrl+xm'), 'model.list');
    assert.equal(app.get('ctrl+xb'), 'session.sidebar.toggle');
    assert.equal(app.get('ctrl+xl'), 'session.list');
    assert.equal(app.get('ctrl+xq'), 'app.exit');
  });

  it('follows a rebound leader', () => {
    const { leader, app } = compileKeybinds({ leader: 'ctrl+space' });
    assert.equal(leader, 'ctrl+space');
    assert.equal(app.get('ctrl+spacem'), 'model.list');
  });

  it('honours a single override and disables with "none"', () => {
    const { app } = compileKeybinds({
      'command.palette.show': 'ctrl+k',
      'help.show': 'none',
    });
    assert.equal(app.get('ctrl+k'), 'command.palette.show');
    assert.equal(app.get('ctrl+p'), undefined);
    assert.equal(app.get('ctrl+/'), undefined);
  });

  it('rejects an unknown action id instead of silently dropping it', () => {
    assert.throws(() => compileKeybinds({ 'no.such.action': 'ctrl+j' }), /unknown keybind action/);
  });

  it('never binds the leader key to itself', () => {
    const { app } = compileKeybinds();
    assert.equal(app.get('ctrl+x'), undefined);
  });
});

describe('lookup + routing', () => {
  const { app, prompt } = compileKeybinds();

  it('resolves app chords', () => {
    assert.equal(lookup(app, '\x10', {}), 'command.palette.show');
    assert.equal(lookup(app, '', { escape: true }), 'session.interrupt');
  });

  it('resolves prompt chords', () => {
    assert.equal(lookup(prompt, '', { return: true }), 'input.submit');
    assert.equal(lookup(prompt, '', { return: true, shift: true }), 'input.newline');
    // ctrl+j is a documented opencode alias for "insert newline".
    assert.equal(lookup(prompt, '\x0a', {}), 'input.newline');
  });

  it('marks which actions belong to the prompt, not the app', () => {
    assert.equal(isInputAction('input.submit'), true);
    assert.equal(isInputAction('input.newline'), true);
    assert.equal(isInputAction('prompt.history.previous'), true);
    assert.equal(isInputAction('session.interrupt'), false);
    assert.equal(isInputAction('command.palette.show'), false);
    assert.equal(isInputAction(null), false);
  });

  it('every default binding maps back to a known namespace', () => {
    for (const id of Object.keys(DEFAULT_KEYBINDS)) {
      if (id === 'leader') continue;
      assert.ok(
        /^(app|session|prompt|input|command|model|agent|messages|variant|sentinel|theme|help)\./.test(id),
        `unexpected namespace for ${id}`
      );
    }
  });
});

describe('multi-line prompt editing', () => {
  it('finds line boundaries', () => {
    const v = 'one\ntwo\nthree';
    assert.equal(lineStart(v, 0), 0);
    assert.equal(lineStart(v, 5), 4);
    assert.equal(lineEnd(v, 1), 3);
    assert.equal(lineEnd(v, 5), 7);
    assert.equal(lineEnd(v, v.length), v.length);
  });

  it('maps caret offsets to row/col and back', () => {
    const v = 'one\ntwo';
    assert.deepEqual(lineCol(v, 0), { row: 0, col: 0 });
    assert.deepEqual(lineCol(v, 4), { row: 1, col: 0 });
    assert.equal(lineColToPos(v, 1, 2), 6);
    assert.equal(lineColToPos(v, 5, 0), v.length, 'clamps out-of-range rows');
  });

  it('ctrl+k / ctrl+u act on the line, not the whole buffer', () => {
    // caret at the very end of the last line: ctrl+k has nothing left to delete
    assert.equal(
      applyKey({ value: 'one\ntwo\nthree', cursor: 13 }, 'k', { ctrl: true }).value,
      'one\ntwo\nthree'
    );

    // caret inside "three": ctrl+u deletes back to the start of that line and
    // keeps the earlier lines, unlike a buffer-wide delete.
    const start = applyKey({ value: 'one\ntwo\nthree', cursor: 10 }, 'u', { ctrl: true });
    assert.equal(start.value, 'one\ntwo\nree');
    assert.equal(start.cursor, 8);

    // ctrl+k from the same spot clears the rest of the line only.
    const end = applyKey({ value: 'one\ntwo\nthree', cursor: 10 }, 'k', { ctrl: true });
    assert.equal(end.value, 'one\ntwo\nth');
    assert.equal(end.cursor, 10);
  });

  it('ctrl+a / ctrl+e go to line start and end, not buffer start and end', () => {
    const v = 'one\ntwo\nthree';
    assert.equal(applyKey({ value: v, cursor: 10 }, 'a', { ctrl: true }).cursor, 8);
    assert.equal(applyKey({ value: v, cursor: 5 }, 'e', { ctrl: true }).cursor, 7);
  });

  it('backspace removes a newline as one unit', () => {
    const after = applyKey({ value: 'one\ntwo', cursor: 4 }, '', { backspace: true });
    assert.equal(after.value, 'onetwo');
    assert.equal(after.cursor, 3);
  });

  it('ctrl+w deletes the previous word on the current line only', () => {
    // Deletes "two" and the space before it, and does not reach the next line.
    const after = applyKey({ value: 'one two\nthree', cursor: 7 }, 'w', { ctrl: true });
    assert.equal(after.value, 'one\nthree');
    assert.equal(after.cursor, 3);
  });

  it('inserts a newline without disturbing the rest of the buffer', () => {
    const after = applyKey({ value: 'ab', cursor: 1 }, '\n', {});
    assert.equal(after.value, 'a\nb');
    assert.equal(after.cursor, 2);
  });

  it('never mutates the state it was given', () => {
    const s = { value: 'one\ntwo', cursor: 5 };
    applyKey(s, 'k', { ctrl: true });
    assert.deepEqual(s, { value: 'one\ntwo', cursor: 5 });
  });
});

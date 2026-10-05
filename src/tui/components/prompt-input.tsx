import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../providers/theme/index.js';
import { keybinds, lookup } from '../keybinds.js';

/**
 * Prompt input, opencode-compatible.
 *
 * opencode's prompt is genuinely multi-line: Return submits, and
 * shift+Return / ctrl+Return / alt+Return / ctrl+j insert a newline. A
 * single-line prompt silently mangles pasted diffs and multi-step prompts, so
 * this tracks a caret inside a `\n`-joined value and renders it as lines.
 *
 * Every edit applies to a ref holding the latest value + cursor and the parent
 * is told the result; external value changes (autocomplete, clear) move the
 * caret to the end. Deriving the next value from a prop instead is what drops
 * keystrokes when a paste outpaces the re-render.
 */
export type EditState = { value: string; cursor: number };

/** Index of the start of the line containing `cursor`. */
export function lineStart(value: string, cursor: number): number {
  const i = value.lastIndexOf('\n', Math.max(0, cursor - 1));
  return i === -1 ? 0 : i + 1;
}

/** Index just past the last character of the line containing `cursor`. */
export function lineEnd(value: string, cursor: number): number {
  const i = value.indexOf('\n', cursor);
  return i === -1 ? value.length : i;
}

/** `{ row, col }` of a caret offset, for rendering. */
export function lineCol(value: string, cursor: number): { row: number; col: number } {
  let row = 0;
  let lineBeg = 0;
  for (let i = 0; i < cursor && i < value.length; i++) {
    if (value[i] === '\n') {
      row++;
      lineBeg = i + 1;
    }
  }
  return { row, col: cursor - lineBeg };
}

/** Caret offset for a `{ row, col }`, clamped to the buffer. */
export function lineColToPos(value: string, row: number, col: number): number {
  const rows = value.split('\n');
  let pos = 0;
  for (let r = 0; r < row && r < rows.length; r++) pos += rows[r].length + 1;
  return Math.min(value.length, pos + Math.max(0, col));
}

/**
 * Pure edit reducer for the input actions opencode binds. Returns null when the
 * key is not an input action, so the caller can fall through to the app.
 */
export function applyKey(
  s: EditState,
  input: string,
  key: { upArrow?: boolean; downArrow?: boolean; leftArrow?: boolean; rightArrow?: boolean; backspace?: boolean; delete?: boolean; ctrl?: boolean; meta?: boolean; home?: boolean; end?: boolean },
): EditState | null {
  const { value, cursor } = s;
  if (key.leftArrow) return { value, cursor: Math.max(0, cursor - 1) };
  if (key.rightArrow) return { value, cursor: Math.min(value.length, cursor + 1) };
  if (key.home) return { value, cursor: lineStart(value, cursor) };
  if (key.end) return { value, cursor: lineEnd(value, cursor) };
  if (key.ctrl && input === 'a') return { value, cursor: lineStart(value, cursor) };
  if (key.ctrl && input === 'e') return { value, cursor: lineEnd(value, cursor) };
  if (key.ctrl && input === 'u') {
    const start = lineStart(value, cursor);
    return { value: value.slice(0, start) + value.slice(cursor), cursor: start };
  }
  if (key.ctrl && input === 'k') return { value: value.slice(0, cursor) + value.slice(lineEnd(value, cursor)), cursor };
  if (key.ctrl && input === 'w') {
    const start = lineStart(value, cursor);
    const before = value.slice(start, cursor).replace(/\s*\S+\s*$/, '');
    return { value: value.slice(0, start) + before + value.slice(cursor), cursor: start + before.length };
  }
  // Terminals send DEL (0x7f) for Backspace; Ink reports it as `delete`.
  if (key.backspace || key.delete) {
    if (cursor === 0) return s;
    // Swallow a newline with the char before it, so Backspace deletes one unit.
    return { value: value.slice(0, cursor - 1) + value.slice(cursor), cursor: cursor - 1 };
  }
  if (key.ctrl || key.meta || !input) return null;
  const clean = input.replace(/\r/g, '').replace(/[\x00-\x08\x0b-\x1f]/g, '');
  if (!clean) return null;
  return { value: value.slice(0, cursor) + clean + value.slice(cursor), cursor: cursor + clean.length };
}

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  onHistory?: (direction: 'prev' | 'next') => string | null;
  placeholder?: string;
  focus?: boolean;
  busy?: boolean;
};

export function PromptInput({ value, onChange, onSubmit, onHistory, placeholder = '', focus = true, busy = false }: Props) {
  const { colors } = useTheme();
  const state = useRef<EditState>({ value, cursor: value.length });
  const [, force] = useState(0);

  // External change (autocomplete, clear): adopt it, caret to the end.
  useEffect(() => {
    if (value !== state.current.value) {
      state.current = { value, cursor: value.length };
      force((n) => n + 1);
    }
  }, [value]);

  const reRender = () => force((n) => n + 1);

  useInput((input, key) => {
    const { prompt: promptTable } = keybinds();
    const action = lookup(promptTable, input, key as any);

    // Return submits — unless a shift/ctrl/alt variant means "insert newline".
    if (action === 'input.newline') {
      const next = state.current;
      state.current = { value: next.value.slice(0, next.cursor) + '\n' + next.value.slice(next.cursor), cursor: next.cursor + 1 };
      reRender();
      onChange(state.current.value);
      return;
    }
    if (action === 'input.submit' && key.return) {
      onSubmit(state.current.value);
      return;
    }
    if (action === 'prompt.history.previous' || action === 'prompt.history.next') {
      // Only when history is available and we are not mid-autocomplete: the
      // InputBar owns up/down while a suggestion list is open.
      if (onHistory) {
        const restored = onHistory(action === 'prompt.history.previous' ? 'prev' : 'next');
        if (restored !== null) {
          state.current = { value: restored, cursor: restored.length };
          reRender();
          onChange(restored);
        }
      }
      return;
    }
    // Arrows are shared: the InputBar consumes them for autocomplete first, and
    // calls `focus={false}`-style handling. Fall through when unbound.
    const next = applyKey(state.current, input, key as any);
    if (!next) return;
    const changed = next.value !== state.current.value;
    state.current = next;
    reRender();
    if (changed) onChange(next.value);
  }, { isActive: focus });

  const { value: v, cursor } = state.current;
  if (!v) {
    return (
      <Text>
        {focus ? <Text inverse>{placeholder.slice(0, 1) || ' '}</Text> : null}
        <Text color={colors.textMuted}>{focus ? placeholder.slice(1) : placeholder}</Text>
      </Text>
    );
  }

  // Render each line with the caret on the right row.
  const lines = v.split('\n');
  const caret = lineCol(v, cursor);
  return (
    <Box flexDirection="column">
      {lines.map((line, row) => {
        const isCaretRow = row === caret.row;
        const before = line.slice(0, caret.col);
        const at = line[caret.col] ?? ' ';
        const after = line.slice(caret.col + 1);
        return (
          <Text key={row} color={colors.text} wrap="truncate-end">
            {before}
            {isCaretRow && focus ? <Text inverse>{at}</Text> : isCaretRow ? at : null}
            {after}
          </Text>
        );
      })}
    </Box>
  );
}
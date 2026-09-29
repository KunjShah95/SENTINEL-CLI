import React, { useEffect, useRef, useState } from 'react';
import { Text, useInput } from 'ink';
import { useTheme } from '../providers/theme/index.js';

/**
 * Single-line prompt input that never drops keystrokes.
 *
 * ink-text-input computes the next value from its `value` prop, so keys
 * that arrive before the parent re-renders (fast typing, pastes) overwrite
 * each other — measured in a PTY: 6 of 26 characters lost at 15 ms/key.
 * Here every edit applies to a ref holding the latest value + cursor, and
 * the parent is told the result; external value changes (completion,
 * clear) move the cursor to the end.
 */
export type EditState = { value: string; cursor: number };

/** Pure edit reducer (unit-tested). Returns null for keys it does not handle. */
export function applyKey(
  s: EditState,
  input: string,
  key: { leftArrow?: boolean; rightArrow?: boolean; backspace?: boolean; delete?: boolean; ctrl?: boolean; meta?: boolean; home?: boolean; end?: boolean },
): EditState | null {
  const { value, cursor } = s;
  if (key.leftArrow) return { value, cursor: Math.max(0, cursor - 1) };
  if (key.rightArrow) return { value, cursor: Math.min(value.length, cursor + 1) };
  if (key.home || (key.ctrl && input === 'a')) return { value, cursor: 0 };
  if (key.end || (key.ctrl && input === 'e')) return { value, cursor: value.length };
  if (key.ctrl && input === 'u') return { value: value.slice(cursor), cursor: 0 };
  if (key.ctrl && input === 'k') return { value: value.slice(0, cursor), cursor };
  if (key.ctrl && input === 'w') {
    const before = value.slice(0, cursor).replace(/\s*\S+\s*$/, '');
    return { value: before + value.slice(cursor), cursor: before.length };
  }
  // Terminals send DEL (0x7f) for Backspace; Ink reports it as `delete`.
  if (key.backspace || key.delete) {
    if (cursor === 0) return s;
    return { value: value.slice(0, cursor - 1) + value.slice(cursor), cursor: cursor - 1 };
  }
  if (key.ctrl || key.meta || !input) return null;
  const clean = input.replace(/\r\n?|\n/g, ' ').replace(/[\x00-\x08\x0b-\x1f]/g, '');
  if (!clean) return null;
  return { value: value.slice(0, cursor) + clean + value.slice(cursor), cursor: cursor + clean.length };
}

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  placeholder?: string;
  focus?: boolean;
};

export function PromptInput({ value, onChange, onSubmit, placeholder = '', focus = true }: Props) {
  const { colors } = useTheme();
  const state = useRef<EditState>({ value, cursor: value.length });
  const [, force] = useState(0);

  // External change (completion, clear, history): adopt it, cursor to end.
  useEffect(() => {
    if (value !== state.current.value) {
      state.current = { value, cursor: value.length };
      force((n) => n + 1);
    }
  }, [value]);

  useInput((input, key) => {
    if (key.return) { onSubmit(state.current.value); return; }
    if (key.upArrow || key.downArrow || key.tab || key.escape) return; // owned by the parent
    const next = applyKey(state.current, input, key as any);
    if (!next) return;
    const changed = next.value !== state.current.value;
    state.current = next;
    force((n) => n + 1);
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
  return (
    <Text color={colors.text}>
      {v.slice(0, cursor)}
      {focus ? <Text inverse>{v[cursor] ?? ' '}</Text> : (v[cursor] ?? '')}
      {v.slice(cursor + 1)}
    </Text>
  );
}

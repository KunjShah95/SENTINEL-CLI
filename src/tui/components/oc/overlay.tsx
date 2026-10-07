/**
 * opencode-style modal overlay.
 *
 * Ink has no z-index, but it does support `position: absolute`. An absolutely
 * positioned Box is lifted out of the normal flow and painted after the
 * siblings declared before it, so anchoring a panel at top:0/left:0 and sizing
 * it to the terminal is what makes a dialog COVER the session instead of being
 * pushed below it. Appending a dialog as a normal-flow sibling (what this
 * replaced) let it land off-screen, which made the first-run provider setup
 * invisible while the prompt was already disabled — the app looked frozen.
 */
import React, { type ReactNode } from "react";
import { Box, Text, useStdout } from "ink";
import { useTheme } from "../../providers/theme/index.js";

/**
 * Usable frame size: the terminal minus its bottom row.
 *
 * That last row is deliberately left to the terminal, and it is not cosmetic.
 * Ink calls a frame "fullscreen" once it is at least as tall as the terminal,
 * and its fullscreen path on Windows repaints by wiping the screen first —
 * `clearTerminal` = `ESC[2J ESC[3J ESC[H` — before *every* frame. With the app
 * root pinned to the full terminal height that fired on every keystroke, which
 * is the composer's flicker: two full-screen wipes and two full repaints per
 * character. `ESC[3J` also wiped the terminal scrollback every time.
 *
 * One row short of fullscreen keeps Ink on its diff path, which rewrites only
 * the lines that actually changed.
 */
export function frameSize(rows?: number, columns?: number): { rows: number; columns: number } {
  // `rows` is undefined on a non-TTY stream; 24 is the classic terminal default.
  const height = rows && rows > 1 ? rows : 24;
  return { rows: Math.max(1, height - 1), columns: columns || 80 };
}

/** Usable frame size for this terminal, with sane fallbacks for tests. */
export function useViewport(): { rows: number; columns: number } {
  const { stdout } = useStdout();
  return frameSize(stdout?.rows, stdout?.columns);
}

/**
 * Window a list so the selected item is always on screen: centre the window on
 * the selection, then clamp it to the list bounds. Every scrollable dialog needs
 * this, and a list taller than the terminal simply has its overflow clipped by
 * the overlay — the user cannot scroll to items they cannot see, which is how
 * the provider picker became unusable on a short terminal.
 */
export function windowRange(total: number, selected: number, visible: number): { start: number; count: number } {
  const count = Math.max(0, Math.min(visible, total));
  if (count === 0) return { start: 0, count: 0 };
  const start = Math.max(0, Math.min(selected - Math.floor(count / 2), total - count));
  return { start, count };
}

export type OverlayProps = {
  children: ReactNode;
  /** Desired panel width; clamped to the terminal. */
  width?: number;
  /** Bold title on the first line of the panel. */
  title?: string;
  /** Right-aligned hint, usually "esc". */
  hint?: string;
};

/**
 * A centered modal over the terminal. `children` is expected to be the body
 * only; the title row is rendered here so every dialog frames itself the same
 * way.
 */
export function Overlay({ children, width, title, hint = "esc" }: OverlayProps) {
  const { colors } = useTheme();
  const { rows, columns } = useViewport();
  const panelWidth = Math.max(24, Math.min(width ?? 60, columns - 2));
  // Leave a blank line of breathing room above and below the panel.
  const panelHeight = Math.max(6, rows - 2);

  return (
    <Box
      position="absolute"
      top={0}
      left={0}
      width={columns}
      height={rows}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      backgroundColor={colors.background}
    >
      <Box
        flexDirection="column"
        width={panelWidth}
        maxHeight={panelHeight}
        borderStyle="round"
        borderColor={colors.border}
        backgroundColor={colors.backgroundPanel}
        overflow="hidden"
      >
        {title ? (
          <Box flexDirection="row" justifyContent="space-between" width="100%" paddingX={1}>
            <Text bold color={colors.text} wrap="truncate-end">{title}</Text>
            <Text color={colors.textMuted}>{hint}</Text>
          </Box>
        ) : null}
        <Box flexDirection="column" width="100%" paddingX={1} flexShrink={0}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Toast strip pinned to the bottom of the screen. Also absolutely positioned:
 * as a normal-flow sibling it rendered under a full-height body and was never
 * seen, so error and success feedback silently disappeared.
 */
export function ToastOverlay({ toasts }: { toasts: ReactNode }) {
  const { colors } = useTheme();
  const { rows, columns } = useViewport();
  return (
    <Box
      position="absolute"
      bottom={0}
      left={0}
      width={columns}
      flexDirection="column"
      paddingX={1}
      backgroundColor={colors.background}
    >
      <Box flexGrow={1} />
      {toasts}
      <Box height={rows > 2 ? 0 : rows} />
    </Box>
  );
}

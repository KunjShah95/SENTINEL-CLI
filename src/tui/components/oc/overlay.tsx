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

/** Terminal size, with sane fallbacks for non-TTY renders and tests. */
export function useViewport(): { rows: number; columns: number } {
  const { stdout } = useStdout();
  return { rows: stdout?.rows || 24, columns: stdout?.columns || 80 };
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

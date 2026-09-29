/**
 * opencode-style building blocks for Ink.
 *
 * Re-creations (not copies — opencode renders with opentui/Solid) of
 * sst/opencode packages/tui: SplitBorder (the "┃" left bar), InlineToolRow
 * (icon + one line, muted once complete, red on failure) and BlockTool
 * (left-barred panel with a "# title" line). MIT, see themes/opencode/LICENSE.
 */
import React, { type ReactNode } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../providers/theme/index.js";

/** opencode SplitBorder: only a heavy vertical bar on the left. */
export const SPLIT_BORDER = {
  topLeft: " ", top: " ", topRight: " ",
  left: "┃", right: " ",
  bottomLeft: " ", bottom: " ", bottomRight: " ",
} as const;

export function LeftBar({
  color,
  children,
  background,
  marginTop = 1,
  paddingY = 1,
}: {
  color: string;
  children: ReactNode;
  background?: string;
  marginTop?: number;
  paddingY?: number;
}) {
  return (
    <Box
      borderStyle={SPLIT_BORDER}
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      borderLeftColor={color}
      marginTop={marginTop}
      flexShrink={0}
    >
      <Box
        flexDirection="column"
        paddingLeft={2}
        paddingRight={1}
        paddingY={paddingY}
        flexGrow={1}
        backgroundColor={background || undefined}
      >
        {children}
      </Box>
    </Box>
  );
}

export type ToolState = "pending" | "output-available" | "output-error" | undefined;

/** opencode InlineToolRow: `icon text`, indented 3; "~ pending…" while running. */
export function InlineTool({
  icon,
  state,
  pending,
  children,
  error,
  denied,
  iconColor,
}: {
  icon: string;
  state: ToolState;
  pending: string;
  children: ReactNode;
  error?: string;
  denied?: boolean;
  iconColor?: string;
}) {
  const { colors } = useTheme();
  const failed = state === "output-error" && !denied;
  const done = state === "output-available";
  const fg = failed ? colors.error : done || denied ? colors.textMuted : colors.text;
  if (state === "pending" || state === undefined) {
    return (
      <Box paddingLeft={3}>
        <Text color={fg}>{`~ ${pending}`}</Text>
      </Box>
    );
  }
  return (
    <Box paddingLeft={3} flexDirection="column">
      <Box flexDirection="row">
        <Box width={2} flexShrink={0}>
          <Text color={failed ? colors.error : (iconColor ?? fg)} strikethrough={denied}>{icon}</Text>
        </Box>
        <Text color={fg} strikethrough={denied} wrap="truncate-end">{children}</Text>
      </Box>
      {failed && error ? (
        <Box paddingLeft={2}>
          <Text color={colors.error} wrap="wrap">{error.split("\n").slice(0, 4).join("\n")}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

/** opencode BlockTool: panel with a left bar and a muted "# title" line. */
export function BlockTool({ title, children, failed }: { title: string; children: ReactNode; failed?: boolean }) {
  const { colors } = useTheme();
  return (
    <LeftBar color={failed ? colors.error : colors.backgroundElement} background={colors.backgroundPanel}>
      <Text color={colors.textMuted}>{title}</Text>
      {children}
    </LeftBar>
  );
}

/** MiniMax Code capacity meter: `[████░░░░]`, tone by fill ratio. */
export function CapacityBar({ ratio, width = 16 }: { ratio: number; width?: number }) {
  const { colors } = useTheme();
  const r = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  const filled = Math.round(r * width);
  const tone = r >= 0.9 ? colors.error : r >= 0.7 ? colors.warning : colors.secondary;
  return (
    <Text color={colors.textMuted}>
      {"["}
      <Text color={tone}>{"█".repeat(filled)}</Text>
      <Text color={colors.border}>{"░".repeat(width - filled)}</Text>
      {"]"}
    </Text>
  );
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

export function shortModelName(model?: string): { name: string; provider: string } {
  if (!model) return { name: "", provider: "" };
  const i = model.indexOf("/");
  return i === -1 ? { name: model, provider: "" } : { name: model.slice(i + 1), provider: model.slice(0, i) };
}

export function titlecase(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
}

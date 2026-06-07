import { TextAttributes } from "@opentui/core";
import { useTheme } from "../providers/theme";

type Mode = "BUILD" | "PLAN" | "REVIEW" | "SCAN" | "FIX";

type Props = {
  mode?: Mode;
  model?: string;
  statusText?: string;
};

function getBadgeColor(mode: Mode, colors: Record<string, string>): string {
  switch (mode) {
    case "BUILD": return colors.success;
    case "PLAN": return colors.planMode;
    case "REVIEW": return colors.warning || colors.planMode;
    case "SCAN": return colors.info;
    case "FIX": return colors.error;
    default: return colors.primary;
  }
}

export function StatusBar({ mode = "BUILD", model = "Sentinel AI", statusText }: Props) {
  const { colors } = useTheme();
  const badgeColor = getBadgeColor(mode, colors);
  return (
    <box flexDirection="row" gap={1} paddingLeft={1}>
      <box flexDirection="row" gap={1}>
        <text fg={badgeColor} attributes={TextAttributes.BOLD}>[{mode}]</text>
        <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>{"\u203A"}</text>
        <text>{model}</text>
      </box>
      {statusText ? (
        <box flexDirection="row" gap={1}>
          <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>|</text>
          <text attributes={TextAttributes.DIM}>{statusText}</text>
        </box>
      ) : null}
    </box>
  );
}

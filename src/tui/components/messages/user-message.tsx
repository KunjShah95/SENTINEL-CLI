import { TextAttributes } from "@opentui/core";
import { useTheme } from "../../providers/theme";
import { EmptyBorder } from "../border";

type Props = { message: string; mode?: "BUILD" | "PLAN" | "REVIEW" | "SCAN" | "FIX" };

export function UserMessage({ message, mode = "BUILD" }: Props) {
  const { colors } = useTheme();
  const borderColor =
    mode === "PLAN"
      ? colors.planMode
      : mode === "REVIEW"
      ? (colors.warning || colors.planMode)
      : colors.primary;
  return (
    <box width="100%" flexDirection="column">
      <box
        border={["left"]}
        borderColor={borderColor}
        width="100%"
        customBorderChars={{ ...EmptyBorder, vertical: "\u2503", bottomLeft: "\u2579" }}
      >
        <box paddingX={2} paddingY={1} backgroundColor={colors.surface} width="100%">
          <text attributes={TextAttributes.DIM}>{message}</text>
        </box>
      </box>
    </box>
  );
}

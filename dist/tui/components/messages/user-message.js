import { jsx as _jsx } from "@opentui/react/jsx-runtime";
import { TextAttributes } from "@opentui/core";
import { useTheme } from "../../providers/theme";
import { EmptyBorder } from "../border";
export function UserMessage({ message, mode = "BUILD" }) {
    const { colors } = useTheme();
    const borderColor = mode === "PLAN"
        ? colors.planMode
        : mode === "REVIEW"
            ? (colors.warning || colors.planMode)
            : colors.primary;
    return (_jsx("box", { width: "100%", flexDirection: "column", children: _jsx("box", { border: ["left"], borderColor: borderColor, width: "100%", customBorderChars: { ...EmptyBorder, vertical: "\u2503", bottomLeft: "\u2579" }, children: _jsx("box", { paddingX: 2, paddingY: 1, backgroundColor: colors.surface, width: "100%", children: _jsx("text", { attributes: TextAttributes.DIM, children: message }) }) }) }));
}

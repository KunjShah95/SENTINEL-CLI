import { jsx as _jsx } from "@opentui/react/jsx-runtime";
import { TextAttributes } from "@opentui/core";
import { useTheme } from "../../providers/theme";
import { EmptyBorder } from "../border";
export function ErrorMessage({ message }) {
    const { colors } = useTheme();
    return (_jsx("box", { width: "100%", alignItems: "center", children: _jsx("box", { border: ["left"], borderColor: colors.error, width: "100%", customBorderChars: { ...EmptyBorder, vertical: "\u2503", bottomLeft: "\u2579" }, children: _jsx("box", { justifyContent: "center", paddingX: 2, paddingY: 1, backgroundColor: colors.surface, width: "100%", children: _jsx("text", { attributes: TextAttributes.DIM, children: message }) }) }) }));
}

import { jsxs as _jsxs, jsx as _jsx } from "@opentui/react/jsx-runtime";
import { TextAttributes } from "@opentui/core";
import { useTheme } from "../providers/theme";
function getBadgeColor(mode, colors) {
    switch (mode) {
        case "BUILD": return colors.success;
        case "PLAN": return colors.planMode;
        case "REVIEW": return colors.warning || colors.planMode;
        case "SCAN": return colors.info;
        case "FIX": return colors.error;
        default: return colors.primary;
    }
}
export function StatusBar({ mode = "BUILD", model = "Sentinel AI", statusText }) {
    const { colors } = useTheme();
    const badgeColor = getBadgeColor(mode, colors);
    return (_jsxs("box", { flexDirection: "row", gap: 1, paddingLeft: 1, children: [_jsxs("box", { flexDirection: "row", gap: 1, children: [_jsxs("text", { fg: badgeColor, attributes: TextAttributes.BOLD, children: ["[", mode, "]"] }), _jsx("text", { attributes: TextAttributes.DIM, fg: colors.dimSeparator, children: "\u203A" }), _jsx("text", { children: model })] }), statusText ? (_jsxs("box", { flexDirection: "row", gap: 1, children: [_jsx("text", { attributes: TextAttributes.DIM, fg: colors.dimSeparator, children: "|" }), _jsx("text", { attributes: TextAttributes.DIM, children: statusText })] })) : null] }));
}

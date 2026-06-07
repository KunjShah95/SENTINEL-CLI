import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { useTheme } from "../providers/theme";
export function Header() {
    const { colors } = useTheme();
    return (_jsx("box", { justifyContent: "center", alignItems: "center", paddingY: 1, children: _jsxs("box", { flexDirection: "column", justifyContent: "center", alignItems: "center", children: [_jsx("text", { fg: colors.primary, children: "Sentinel" }), _jsx("text", { attributes: 1, fg: colors.dimSeparator, children: "AI-Powered Code Guardian" })] }) }));
}
